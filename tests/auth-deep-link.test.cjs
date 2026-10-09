const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const vm = require('node:vm');

async function fixture() {
    const context = vm.createContext({ URL, URLSearchParams, Promise });
    const module = new vm.SourceTextModule(readFileSync('src/authDeepLink.js', 'utf8'), { context });
    await module.link(() => { throw new Error('Unexpected dependency'); });
    await module.evaluate();
    return module.namespace;
}
const callback = 'todopersonal://auth-callback#access_token=test-access&refresh_token=test-refresh&type=signup';
test('only dedicated native auth links accept a complete session', async () => {
    const { parseAuthLink, AUTH_REDIRECT_URL } = await fixture();
    assert.equal(AUTH_REDIRECT_URL, 'todopersonal://auth-callback');
    assert.equal(parseAuthLink(callback).session.access_token, 'test-access');
    for (const url of ['https://auth-callback#access_token=a&refresh_token=b',
        'todopersonal://other#access_token=a&refresh_token=b',
        'todopersonal://auth-callback/other#access_token=a&refresh_token=b',
        'todopersonal://user@auth-callback#access_token=a&refresh_token=b', 'garbage']) {
        assert.equal(parseAuthLink(url), null);
    }
    assert.equal(parseAuthLink('todopersonal://auth-callback#access_token=a').error, true);
    assert.equal(parseAuthLink('todopersonal://auth-callback#error=access_denied').error, true);
    assert.equal(parseAuthLink(callback.replace('signup', 'recovery')).error, true);
    assert.equal(parseAuthLink('todopersonal://auth-callback?code=test-code').code, 'test-code');
});
test('warm/cold duplicate events establish one session and failed network can retry', async () => {
    const { createAuthLinkHandler } = await fixture();
    let calls = 0, fail = true;
    const statuses = [];
    const handle = createAuthLinkHandler({
        auth: { async setSession(tokens) {
            calls++;
            assert.equal(tokens.refresh_token, 'test-refresh');
            if (fail) throw new Error('Offline');
            return { data: { session: {} }, error: null };
        } }, onStatus: value => statuses.push(value)
    });
    const first = handle(callback);
    assert.equal(handle(callback), first);
    assert.equal(await first, false);
    fail = false;
    assert.equal(await handle(callback), true);
    assert.equal(await handle(callback), true);
    assert.equal(calls, 2);
    assert.deepEqual(statuses, ['pending', 'error', 'pending', 'success']);
    assert.equal(await handle('https://example.com'), false);
});
test('PKCE code exchange works and errors never display credential URLs', async () => {
    const { createAuthLinkHandler } = await fixture();
    const statuses = [];
    let calls = 0;
    const handle = createAuthLinkHandler({ auth: {
        async exchangeCodeForSession(code) {
            calls++;
            assert.equal(code, 'test-code');
            return { data: { session: {} }, error: null };
        }
    }, onStatus: status => statuses.push(status) });
    assert.equal(await handle('todopersonal://auth-callback?code=test-code'), true);
    assert.equal(await handle('todopersonal://auth-callback#error=expired&error_description=secret'), false);
    assert.equal(calls, 1);
    assert.deepEqual(statuses, ['pending', 'success', 'pending', 'error']);
});
test('native launch and running app deliver callbacks through the same handler', async () => {
    const events = new Map(), received = [];
    const context = vm.createContext({ document: { documentElement: { classList: { add() {} } } } });
    const capacitor = new vm.SyntheticModule(['Capacitor', 'registerPlugin'], function () {
        this.setExport('Capacitor', { isNativePlatform: () => true, getPlatform: () => 'android' });
        this.setExport('registerPlugin', () => ({}));
    }, { context });
    const app = new vm.SyntheticModule(['App'], function () {
        this.setExport('App', {
            async addListener(name, handler) { events.set(name, handler); },
            async getLaunchUrl() { return { url: callback }; }
        });
    }, { context });
    const native = new vm.SourceTextModule(readFileSync('src/nativeApp.js', 'utf8'), { context });
    const opened = [];
    const browser = new vm.SyntheticModule(['Browser'], function () { this.setExport('Browser', { async open(options) { opened.push(options.url); } }); }, { context });
    const reset = new vm.SourceTextModule(readFileSync('src/localDataReset.js', 'utf8'), { context });
    await reset.link(() => {});
    await native.link(name => name === './localDataReset.js' ? reset : name === '@capacitor/core' ? capacitor : name === '@capacitor/browser' ? browser : app);
    await native.evaluate();
    await native.namespace.setupNativeApp({ ui: {}, onResume() {}, onAuthLink: async url => received.push(url) });
    assert.deepEqual(received, [callback]);
    events.get('appUrlOpen')({ url: callback });
    assert.deepEqual(received, [callback, callback]);
    await native.namespace.openAuthBrowser('https://example.com');
    assert.deepEqual(opened, ['https://example.com']);
});
