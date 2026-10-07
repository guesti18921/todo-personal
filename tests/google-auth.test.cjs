const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
async function fixture() {
    const context = vm.createContext({ URL, Promise });
    const mod = new vm.SourceTextModule(fs.readFileSync('src/googleAuth.js', 'utf8'), { context });
    await mod.link(() => { throw Error('Unexpected import'); }); await mod.evaluate(); return mod.namespace;
}
const serverUrl = 'https://project.supabase.co';
const url = `${serverUrl}/auth/v1/authorize?provider=google`;
test('Google launch uses the current redirect, native browser, account picker and deduplicates taps', async () => {
    const { createGoogleLogin } = await fixture();
    let calls = 0, resolve; const statuses = [], opened = [];
    const login = createGoogleLogin({ serverUrl, native: true, redirectTo: 'todopersonal://auth-callback',
        auth: { signInWithOAuth(options) {
            calls++; assert.equal(options.provider, 'google');
            assert.equal(options.options.redirectTo, 'todopersonal://auth-callback');
            assert.equal(options.options.skipBrowserRedirect, true);
            assert.equal(options.options.queryParams.prompt, 'select_account');
            return new Promise(r => resolve = r);
        } }, open: async (url, native) => opened.push([url, native]), onStatus: s => statuses.push(s) });
    const first = login.start(); assert.equal(login.start(), first); await new Promise(r => setImmediate(r));
    resolve({ data: { url } }); assert.equal(await first, true); assert.equal(calls, 1);
    assert.deepEqual(opened, [[url, true]]); assert.deepEqual(statuses, ['pending', 'opened']);
});
test('browser flow preserves preview return path and rejects foreign or non-HTTPS authorization URLs', async () => {
    const { createGoogleLogin } = await fixture();
    for (const candidate of [url, 'https://evil.example/auth/v1/authorize', 'http://project.supabase.co/auth/v1/authorize', `${serverUrl}/wrong`]) {
        let opened = false;
        const login = createGoogleLogin({ serverUrl, native: false, redirectTo: 'https://todo.m1strell.com/mobile-preview/',
            auth: { async signInWithOAuth(options) { assert.equal(options.options.redirectTo, 'https://todo.m1strell.com/mobile-preview/'); return { data: { url: candidate } }; } },
            open: async (_, native) => { assert.equal(native, false); opened = true; }, onStatus() {} });
        assert.equal(await login.start(), candidate === url); assert.equal(opened, candidate === url);
    }
});
test('SDK and browser launch failures allow retry without exposing URLs or tokens', async () => {
    const { createGoogleLogin } = await fixture(); let attempt = 0, browserAttempt = 0; const messages = [];
    const login = createGoogleLogin({ serverUrl, native: true, redirectTo: 'todopersonal://auth-callback',
        auth: { signInWithOAuth() { if (++attempt === 1) throw Error('secret-url-token'); return { data: { url } }; } },
        open: async () => { if (++browserAttempt === 1) throw Error('secret-url-token'); }, onStatus: (_, msg) => { if (msg) messages.push(msg); } });
    assert.equal(await login.start(), false); assert.equal(await login.start(), false); assert.equal(await login.start(), true);
    assert.equal(attempt, 3); assert.ok(messages.every(m => !m.includes('secret')));
});
test('Google button availability reflects the server and settings failures remain distinguishable', async () => {
    const { googleProviderEnabled } = await fixture();
    for (const enabled of [true, false]) assert.equal(await googleProviderEnabled({ serverUrl, publicKey: 'public', fetch: async (endpoint, opts) => {
        assert.equal(endpoint, `${serverUrl}/auth/v1/settings`); assert.equal(opts.headers.apikey, 'public'); assert.equal(opts.cache, 'no-store');
        return { ok: true, async json() { return { external: { google: enabled } }; } };
    } }), enabled);
    await assert.rejects(googleProviderEnabled({ serverUrl, publicKey: 'public', fetch: async () => ({ ok: false }) }));
});
test('auth errors give actionable messages without raw backend details', async () => {
    const { authErrorMessage } = await fixture();
    assert.match(authErrorMessage({ code: 'invalid_credentials' }), /Неверная/);
    assert.match(authErrorMessage({ code: 'email_not_confirmed' }), /Подтвердите/);
    assert.match(authErrorMessage({ status: 429 }), /Подождите/);
    assert.ok(!authErrorMessage({ message: 'server-internals-secret' }).includes('secret'));
});
