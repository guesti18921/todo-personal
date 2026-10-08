const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
async function fixture(auth) {
    const mod = new vm.SourceTextModule(fs.readFileSync('src/passwordRecovery.js', 'utf8'), { context: vm.createContext({ URLSearchParams, Array }) });
    await mod.link(() => {}); await mod.evaluate();
    const statuses = [];
    return { ...mod.namespace, statuses, engine: mod.namespace.createPasswordRecovery({ auth, onStatus: s => statuses.push(s) }) };
}
const tokens = { access_token: 'test-access', refresh_token: 'test-refresh' };
test('recovery requires complete recovery credentials; signup and errors cannot open reset', async () => {
    const f = await fixture({});
    for (const fragment of ['', '#type=signup&access_token=a&refresh_token=b', '#type=recovery&access_token=a', '#type=recovery&access_token=a&refresh_token=b&error=expired']) assert.equal(f.readRecoveryTokens(fragment), null);
    assert.equal(f.readRecoveryTokens('#type=recovery&access_token=a&refresh_token=b').refresh_token, 'b');
    assert.equal(await f.engine.open(null), false);
    assert.equal(await f.engine.save('password-long', 'password-long'), false);
});
test('new password needs verification, matching values and eight characters; duplicate saves are blocked', async () => {
    const calls = []; let finish;
    const f = await fixture({ async setSession(value) { calls.push(value); return { data: { session: {} } }; },
        updateUser(value) { calls.push(value); return new Promise(resolve => { finish = resolve; }); },
        async signOut(value) { calls.push(value); } });
    await f.engine.open(tokens);
    await f.engine.save('short', 'short'); assert.equal(f.statuses.at(-1), 'short');
    await f.engine.save('long-enough', 'different'); assert.equal(f.statuses.at(-1), 'mismatch');
    const save = f.engine.save('  long enough  ', '  long enough  ');
    assert.equal(await f.engine.save('other-password', 'other-password'), false);
    finish({ data: { user: { id: 'owner' } } }); assert.equal(await save, true);
    assert.equal(calls[1].password, '  long enough  ', 'password whitespace is preserved');
    assert.equal(calls[2].scope, 'local');
    assert.equal(await f.engine.save('other-password', 'other-password'), false);
    assert.equal(f.statuses.at(-1), 'success');
});
test('expired and offline verification do not allow a password change; network retry works', async () => {
    let fail = true, writes = 0;
    const f = await fixture({ async setSession() { if (fail) throw Error('network secret'); return { data: { session: {} } }; }, async updateUser() { writes++; return { data: { user: {} } }; }, async signOut() {} });
    assert.equal(await f.engine.open(tokens), false);
    assert.equal(await f.engine.save('password-long', 'password-long'), false); assert.equal(writes, 0);
    fail = false; await f.engine.open(tokens); assert.equal(await f.engine.save('password-long', 'password-long'), true);
    assert.equal(f.statuses.includes('network secret'), false);
    const bad = await fixture({ async setSession() { return { error: { code: 'bad_jwt' } }; } });
    await bad.engine.open(tokens); assert.equal(bad.statuses.at(-1), 'invalid');
});
test('failed update never reports success and can be retried without logging server errors', async () => {
    let fail = true;
    const f = await fixture({ async setSession() { return { data: { session: {} } }; }, async updateUser() { return fail ? { error: { code: 'same_password', message: 'private' } } : { data: { user: {} } }; }, async signOut() { throw Error('offline'); } });
    await f.engine.open(tokens); assert.equal(await f.engine.save('password-long', 'password-long'), false);
    assert.equal(f.statuses.at(-1), 'same'); fail = false;
    assert.equal(await f.engine.save('password-long', 'password-long'), true);
});
