const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
test('network timeout releases a stalled request and preserves cancellation', async () => {
 const m = new vm.SourceTextModule(fs.readFileSync('src/networkFetch.js', 'utf8'), { context: vm.createContext({ AbortController, setTimeout, clearTimeout }) });
 await m.link(() => {}); await m.evaluate();
 const fetcher = (_url, { signal }) => new Promise((_resolve, reject) => { if (signal.aborted) reject(new Error('Aborted')); else signal.addEventListener('abort', () => reject(new Error('Aborted'))); });
 await assert.rejects(m.namespace.boundedFetch('https://server.test', {}, 10, fetcher), /timed out/i);
 const abort = new AbortController(); const request = m.namespace.boundedFetch('https://server.test', { signal: abort.signal }, 1000, fetcher); abort.abort(); await assert.rejects(request, /aborted/i);
 const result = await m.namespace.boundedFetch('https://server.test', {}, 1000, async () => 'ok'); assert.equal(result, 'ok');
});
function worker() {
 const listeners = new Map(), files = new Map(), requests = [], self = { location: new URL('https://todo.test/mobile-preview/sw.js'), addEventListener: (name, fn) => listeners.set(name, fn), skipWaiting: async () => {}, clients: { claim: async () => {} } };
 let offline = false;
 const cache = { async addAll(list) { for (const r of list) { requests.push(r.url); files.set(r.url, new Response('cached:' + r.url)); } }, async match(request) { return files.get(String(request.url || request))?.clone(); }, async put(request, response) { files.set(String(request.url || request), response); } };
 const caches = { open: async () => cache, keys: async () => [], delete: async () => {}, match: async url => files.get(String(url))?.clone() };
 vm.runInNewContext(fs.readFileSync('dist/sw.js', 'utf8'), { self, caches, URL, Request, importScripts: () => {}, AbortController, setTimeout, clearTimeout, fetch: async () => { if (offline) throw Error('Offline'); return new Response('network'); } });
 return { listeners, requests, set offline(value) { offline = value; } };
}
test('offline shell caches public files and falls back for preview navigation, never Supabase or account URLs', async () => {
 const w = worker(); let install;
 w.listeners.get('install')({ waitUntil: p => { install = p; } }); await install;
 assert.ok(w.requests.some(url => /main\.js\?v=/.test(url))); assert.ok(w.requests.every(url => url.startsWith('https://todo.test/mobile-preview/')));
 w.offline = true; let response;
 w.listeners.get('fetch')({ request: { url: 'https://todo.test/mobile-preview/?code=private', method: 'GET', mode: 'navigate' }, respondWith: p => { response = p; } });
 assert.match(await (await response).text(), /cached:.*index.html/); assert.ok(w.requests.every(url => !url.includes('private')));
 response = null;
 w.listeners.get('fetch')({ request: { url: 'https://project.supabase.co/rest/v1/notebooks', method: 'GET' }, respondWith: p => { response = p; } }); assert.equal(response, null);
 w.listeners.get('fetch')({ request: { url: 'https://todo.test/private/account.json', method: 'GET' }, respondWith: p => { response = p; } }); assert.equal(response, null);
});

test('timeout also bounds a stalled body after headers; HTTP metadata remains intact', async () => {
 const m = new vm.SourceTextModule(fs.readFileSync('src/networkFetch.js', 'utf8'), { context: vm.createContext({ AbortController, setTimeout, clearTimeout }) });
 await m.link(() => {}); await m.evaluate();
 const fake = { status: 503, ok: false, headers: new Headers(), text: () => new Promise(() => {}) };
 const response = await m.namespace.boundedFetch('https://server.test', {}, 20, async () => fake);
 assert.equal(response.status, 503);
 await assert.rejects(response.text(), /timed out/);
 const good = await m.namespace.boundedFetch('https://server.test', {}, 1000, async () => new Response(JSON.stringify({ code: '42501' }), { status: 403 }));
 assert.equal(good.status, 403); assert.deepEqual(await good.json(), { code: '42501' });
});

test('password rejection header survives a stalled body and does not affect data requests', async () => {
 const context=vm.createContext({URL,AbortController,setTimeout,clearTimeout});
 const m=new vm.SourceTextModule(fs.readFileSync('src/networkFetch.js','utf8'),{context});await m.link(()=>{});await m.evaluate();
 let reads=0,cancelled=0;
 const rejected={status:400,ok:false,headers:new Headers({'x-sb-error-code':'invalid_credentials'}),body:{cancel(){cancelled++;return Promise.resolve()}},json(){reads++;return new Promise(()=>{})},text(){reads++;return new Promise(()=>{})}};
 const response=await m.namespace.boundedFetch('https://project.supabase.co/auth/v1/token?grant_type=password',{},50,async()=>rejected);
 assert.equal((await response.json()).error_code,'invalid_credentials');assert.equal(response.status,400);assert.equal(reads,0);assert.equal(cancelled,1);
 const data=await m.namespace.boundedFetch('https://project.supabase.co/rest/v1/notebooks',{},10,async()=>rejected);
 await assert.rejects(data.json(),/timed out/);assert.equal(reads,1);
});
test('interactive password login has a finite ten-second network deadline',async()=>{
 let duration;const context=vm.createContext({URL,AbortController,clearTimeout,setTimeout:(cb,ms)=>{duration=ms;return setTimeout(cb,5)}});
 const m=new vm.SourceTextModule(fs.readFileSync('src/networkFetch.js','utf8'),{context});await m.link(()=>{});await m.evaluate();
 await assert.rejects(m.namespace.boundedFetch('https://project.supabase.co/auth/v1/token?grant_type=password',{},15000,()=>new Promise(()=>{})),/timed out/);assert.equal(duration,10000);
});
