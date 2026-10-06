const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const KEY_ALIAS = 'todo-personal';
const marker = '// TODO_PERSONAL_PERMANENT_SIGNING';
function inputs(env) {
    const missing = ['ANDROID_KEYSTORE_BASE64', 'ANDROID_KEYSTORE_PASSWORD'].filter(name => !env[name]);
    if (missing.length) throw new Error(`Add these repository secrets before building: ${missing.join(', ')}. No debug or unsigned fallback is allowed.`);
    const encoded = env.ANDROID_KEYSTORE_BASE64.replace(/\s/g, '');
    if (!encoded || encoded.length > 48000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0) throw new Error('The keystore secret must contain a valid base64-encoded PKCS12 file.');
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.toString('base64') !== encoded) throw new Error('The keystore secret is not valid base64.');
    return bytes;
}
function locations(env) {
    if (!env.RUNNER_TEMP) throw new Error('RUNNER_TEMP is required for private signing files.');
    return { key: path.join(env.RUNNER_TEMP, 'todo-personal-release.p12'), certificate: path.join(env.RUNNER_TEMP, 'todo-personal-certificate-sha256.txt') };
}
function configure(root, env = process.env) {
    const bytes = inputs(env), files = locations(env);
    const gradlePath = path.join(root, 'android/app/build.gradle');
    let gradle = fs.readFileSync(gradlePath, 'utf8');
    if (!gradle.includes(marker) && (!gradle.includes('\n    buildTypes {') || !gradle.includes('        release {'))) throw new Error('Unexpected Android build template; signing was not configured.');
    fs.writeFileSync(files.key, bytes, { mode: 0o600 });
    fs.chmodSync(files.key, 0o600);
    let certificate;
    try {
        certificate = execFileSync('keytool', ['-exportcert', '-keystore', files.key, '-storetype', 'PKCS12', '-alias', KEY_ALIAS, '-storepass:env', 'ANDROID_KEYSTORE_PASSWORD'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (_) {
        fs.rmSync(files.key, { force: true });
        fs.rmSync(files.certificate, { force: true });
        throw new Error('Cannot open the signing key. Check the PKCS12 file, its password, and alias todo-personal.');
    }
    const fingerprint = crypto.createHash('sha256').update(certificate).digest('hex');
    fs.writeFileSync(files.certificate, fingerprint + '\n');
    if (!gradle.includes(marker)) {
        // Only the path is written to Gradle. Passwords stay in the build environment.
        const quotedPath = "'" + files.key.replace(/\\/g, '/').replace(/'/g, "\\'") + "'";
        gradle = gradle.replace('        release {', '        release {\n            signingConfig signingConfigs.todoPersonalRelease');
        gradle = gradle.replace('\n    buildTypes {', `\n    ${marker}\n    signingConfigs {\n        todoPersonalRelease {\n            storeFile file(${quotedPath})\n            storeType 'PKCS12'\n            storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD')\n            keyAlias '${KEY_ALIAS}'\n            keyPassword System.getenv('ANDROID_KEYSTORE_PASSWORD')\n        }\n    }\n    buildTypes {`);
        fs.writeFileSync(gradlePath, gradle);
    }
    return fingerprint;
}
function verify(root, env = process.env) {
    const files = locations(env), sdk = env.ANDROID_HOME || env.ANDROID_SDK_ROOT;
    if (!sdk) throw new Error('Android SDK is required to verify the signed APK.');
    const folder = path.join(sdk, 'build-tools');
    const tools = fs.readdirSync(folder).filter(version => fs.existsSync(path.join(folder, version, 'apksigner'))).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    if (!tools.length) throw new Error('apksigner is unavailable.');
    const apk = path.join(root, 'android/app/build/outputs/apk/release/app-release.apk');
    let output;
    try { output = execFileSync(path.join(folder, tools.at(-1), 'apksigner'), ['verify', '--verbose', '--print-certs', apk], { env, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }); }
    catch (_) { throw new Error('APK signature verification failed. The APK will not be uploaded.'); }
    const matches = Array.from(output.matchAll(/Signer #\d+ certificate SHA-256 digest: ([0-9a-f]{64})/gi), match => match[1].toLowerCase());
    const expected = fs.readFileSync(files.certificate, 'utf8').trim();
    if (matches.length !== 1 || matches[0] !== expected) throw new Error('APK was signed with a different certificate. The APK will not be uploaded.');
    fs.writeFileSync(path.join(path.dirname(apk), 'certificate-sha256.txt'), expected + '\n');
    return expected;
}
if (require.main === module) {
    try {
        const action = process.argv[2], root = path.resolve(__dirname, '..');
        if (action === 'check') { inputs(process.env); console.log('Signing secrets are present.'); }
        else if (action === 'configure') console.log('Permanent signing configured. Public certificate SHA-256: ' + configure(root));
        else if (action === 'verify') console.log('APK signature verified. Public certificate SHA-256: ' + verify(root));
        else throw new Error('Choose check, configure, or verify.');
    } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { inputs, configure, verify };
