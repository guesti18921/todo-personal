const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { inputs, configure, verify } = require('../scripts/android-signing.cjs');

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-signing-test-'));
after(() => fs.rmSync(temporary, { recursive: true, force: true }));
const password = 'test-only-password';
const fixtureKey = path.join(temporary, 'fixture.p12');
const testEnv = { ...process.env, ANDROID_KEYSTORE_PASSWORD: password };
execFileSync('keytool', ['-genkeypair', '-storetype', 'PKCS12', '-keystore', fixtureKey, '-alias', 'todo-personal', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Test fixture', '-storepass:env', 'ANDROID_KEYSTORE_PASSWORD'], { env: testEnv, stdio: 'ignore' });
const bytes = fs.readFileSync(fixtureKey);
function fixture() {
    const root = fs.mkdtempSync(path.join(temporary, 'project-'));
    const runner = fs.mkdtempSync(path.join(temporary, 'runner-'));
    const gradle = path.join(root, 'android/app/build.gradle');
    fs.mkdirSync(path.dirname(gradle), { recursive: true });
    fs.writeFileSync(gradle, 'android {\n    buildTypes {\n        release {\n            minifyEnabled false\n        }\n    }\n}\n');
    return { root, runner, gradle, env: { ...testEnv, RUNNER_TEMP: runner, ANDROID_KEYSTORE_BASE64: bytes.toString('base64') } };
}
test('missing or malformed signing secrets fail without changing the native project', () => {
    const f = fixture(), before = fs.readFileSync(f.gradle, 'utf8');
    assert.throws(() => configure(f.root, { ...f.env, ANDROID_KEYSTORE_PASSWORD: '' }), /ANDROID_KEYSTORE_PASSWORD/);
    assert.throws(() => inputs({ ...f.env, ANDROID_KEYSTORE_BASE64: 'not-base64!private-data' }), /valid base64/);
    assert.equal(fs.readFileSync(f.gradle, 'utf8'), before);
    assert.equal(fs.readdirSync(f.runner).length, 0);
});
test('repeat builds use the exact same key and certificate without writing passwords into Gradle', () => {
    const first = fixture(), second = fixture();
    const a = configure(first.root, first.env), b = configure(second.root, second.env);
    assert.equal(a, b);
    assert.deepEqual(fs.readFileSync(path.join(first.runner, 'todo-personal-release.p12')), bytes);
    const certificate = execFileSync('keytool', ['-exportcert', '-keystore', fixtureKey, '-alias', 'todo-personal', '-storepass:env', 'ANDROID_KEYSTORE_PASSWORD'], { env: testEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    assert.equal(a, crypto.createHash('sha256').update(certificate).digest('hex'));
    assert.equal(fs.statSync(path.join(first.runner, 'todo-personal-release.p12')).mode & 0o777, 0o600);
    const gradle = fs.readFileSync(first.gradle, 'utf8');
    assert.equal(gradle.includes(password), false);
    assert.equal(gradle.includes(first.env.ANDROID_KEYSTORE_BASE64), false);
    assert.match(gradle, /signingConfig signingConfigs.todoPersonalRelease/);
    assert.equal(configure(first.root, first.env), a);
    assert.equal(fs.readFileSync(first.gradle, 'utf8'), gradle, 'configuration is idempotent');
});
test('wrong password removes the temporary key and never exposes secret contents in its error', () => {
    const f = fixture(), before = fs.readFileSync(f.gradle, 'utf8');
    let error;
    try { configure(f.root, { ...f.env, ANDROID_KEYSTORE_PASSWORD: 'wrong-private-password' }); } catch (value) { error = value; }
    assert.ok(error); assert.match(error.message, /Cannot open the signing key/);
    assert.equal(error.message.includes('wrong-private-password'), false);
    assert.equal(error.message.includes(f.env.ANDROID_KEYSTORE_BASE64), false);
    assert.equal(fs.existsSync(path.join(f.runner, 'todo-personal-release.p12')), false);
    assert.equal(fs.readFileSync(f.gradle, 'utf8'), before);
});
test('APK verification rejects a different signer and unsigned APKs before upload', () => {
    const f = fixture(), expected = configure(f.root, f.env);
    const sdk = path.join(f.runner, 'sdk'), executable = path.join(sdk, 'build-tools/36.0.0/apksigner');
    fs.mkdirSync(path.dirname(executable), { recursive: true });
    const apkFolder = path.join(f.root, 'android/app/build/outputs/apk/release');
    fs.mkdirSync(apkFolder, { recursive: true }); fs.writeFileSync(path.join(apkFolder, 'app-release.apk'), 'test-only');
    const output = fingerprint => fs.writeFileSync(executable, '#!/usr/bin/env node\nif (process.argv.slice(2,5).join(" ") !== "verify --verbose --print-certs") process.exit(2);\nconsole.log("Signer #1 certificate SHA-256 digest: ' + fingerprint + '");\n', { mode: 0o700 });
    const env = { ...f.env, ANDROID_HOME: sdk };
    output('0'.repeat(64)); assert.throws(() => verify(f.root, env), /different certificate/);
    assert.equal(fs.existsSync(path.join(apkFolder, 'certificate-sha256.txt')), false);
    fs.writeFileSync(executable, '#!/usr/bin/env node\nprocess.exit(1);\n');
    assert.throws(() => verify(f.root, env), /signature verification failed/);
    output(expected); assert.equal(verify(f.root, env), expected);
    assert.equal(fs.readFileSync(path.join(apkFolder, 'certificate-sha256.txt'), 'utf8').trim(), expected);
});

test('published workflow isolates secret access from pinned application build code', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/android-signed.yml'), 'utf8');
    const [build, sign] = workflow.split('\n  sign:\n');
    assert.ok(sign, 'signing runs in a separate job');
    assert.match(build, /ref: [0-9a-f]{40}/);
    assert.equal(build.includes('secrets.'), false, 'npm, Gradle and app source never receive signing secrets');
    assert.equal(sign.includes('actions/checkout'), false);
    assert.equal(/run:.*(?:npm|gradlew)/.test(sign), false);
    const envBlock = sign.slice(sign.indexOf('        env:'), sign.indexOf('        shell:'));
    assert.match(envBlock, /ANDROID_KEYSTORE_BASE64/);
    assert.match(envBlock, /ANDROID_KEYSTORE_PASSWORD/);
});

test('isolated workflow signer keeps keys private, verifies the expected certificate and cleans failures', () => {
    const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/android-signed.yml'), 'utf8');
    const script = workflow.split("          node <<'NODE'\n")[1].split('\n          NODE')[0].split('\n').map(line => line.replace(/^          /, '')).join('\n');
    const run = (mode) => {
        const f = fixture(), expected = configure(f.root, f.env);
        const sdk = path.join(f.runner, 'sdk'), executable = path.join(sdk, 'build-tools/36.0.0/apksigner');
        fs.mkdirSync(path.dirname(executable), { recursive: true });
        fs.writeFileSync(executable, '#!/usr/bin/env node\nconst fs = require("node:fs"); const a = process.argv.slice(2); if (a[0] === "sign") { fs.copyFileSync(a.at(-1), a[a.indexOf("--out")+1]); } else { console.log("Signer #1 certificate SHA-256 digest: ' + (mode === 'mismatch' ? '0'.repeat(64) : expected) + '"); }\n', { mode: 0o700 });
        fs.mkdirSync(path.join(f.root, 'unsigned')); fs.writeFileSync(path.join(f.root, 'unsigned/app-release-unsigned.apk'), 'simulation-only');
        const scriptPath = path.join(f.root, 'isolated-sign.cjs'); fs.writeFileSync(scriptPath, script);
        const env = { ...f.env, ANDROID_HOME: sdk };
        if (mode === 'sdk-ranges' || mode === 'range-mismatch') {
            const second = mode === 'range-mismatch' ? '0'.repeat(64) : expected;
            const report = 'Signer (minSdkVersion=33, maxSdkVersion=2147483647) certificate SHA-256 digest: ' + expected + '\nSigner (minSdkVersion=24, maxSdkVersion=32) certificate SHA-256 digest: ' + second;
            fs.writeFileSync(executable, '#!/usr/bin/env node\nconst fs = require("node:fs"); const a = process.argv.slice(2); if (a[0] === "sign") fs.copyFileSync(a.at(-1), a[a.indexOf("--out")+1]); else console.log(' + JSON.stringify(report) + ');\n');
        }
        if (mode === 'missing') delete env.ANDROID_KEYSTORE_PASSWORD;
        if (mode === 'wrong') env.ANDROID_KEYSTORE_PASSWORD = 'private-wrong-test-password';
        const result = require('node:child_process').spawnSync(process.execPath, [scriptPath], { cwd: f.root, env, encoding: 'utf8' });
        assert.equal(fs.existsSync(path.join(f.runner, 'todo-personal-release.p12')), false);
        assert.equal((result.stdout + result.stderr).includes(password), false);
        assert.equal((result.stdout + result.stderr).includes(f.env.ANDROID_KEYSTORE_BASE64), false);
        if (mode === 'good' || mode === 'sdk-ranges') {
            assert.equal(result.status, 0, result.stderr);
            assert.equal(fs.readFileSync(path.join(f.root, 'signed/certificate-sha256.txt'), 'utf8').trim(), expected);
        } else {
            assert.notEqual(result.status, 0); assert.equal(fs.existsSync(path.join(f.root, 'signed')), false);
            if (mode === 'mismatch' || mode === 'range-mismatch') {
                assert.ok(result.stderr.includes('Public expected certificate SHA-256: ' + expected));
                assert.ok(result.stderr.includes('Public APK certificate digest fields:'));
                assert.equal(result.stderr.includes('CN=Test fixture'), false);
            }
        }
    };
    for (const mode of ['good', 'sdk-ranges', 'missing', 'wrong', 'mismatch', 'range-mismatch']) run(mode);
});
