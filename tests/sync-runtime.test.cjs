const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
test('network timeout releases a stalled request and preserves cancellation', async () => {
 const m = new vm.SourceTextModule(fs.readFileSync('src/networkFetch.js', 'utf8'), { context: vm.createContext({ AbortController, setTimeout, clearTimeout }) });
 await m.link(() => {}); await m.evaluate();
 const fetcher = (_url, { signal }) => new Promise((_resolve, reject) => { if (signal.aborted) reject(new Error('Aborted')); else signal.addEventListener('abort', () => reject(new Error('Aborted'))); });
 await assert.rejects(m.namespace.boundedFetch('https://server.test', {}, 10, fetcher), /Aborted/);
 const abort = new AbortController(); const request = m.namespace.boundedFetch('https://server.test', { signal: abort.signal }, 1000, fetcher); abort.abort(); await assert.rejects(request, /Aborted/);
 const result = await m.namespace.boundedFetch('https://server.test', {}, 1000, async () => 'ok'); assert.equal(result, 'ok');
});
function worker() {
 const listeners = new Map(), files = new Map(), requests = [], self = { location: new URL('https://todo.test/mobile-preview/sw.js'), addEventListener: (name, fn) => listeners.set(name, fn), skipWaiting: async () => {}, clients: { claim: async () => {} } };
 let offline = false;
 const cache = { async addAll(list) { for (const r of list) { requests.push(r.url); files.set(r.url, new Response('cached:' + r.url)); } }, async match(request) { return files.get(String(request.url || request))?.clone(); }, async put(request, response) { files.set(String(request.url || request), response); } };
 const caches = { open: async () => cache, keys: async () => [], delete: async () => {}, match: async url => files.get(String(url))?.clone() };
 vm.runInNewContext(fs.readFileSync('dist/sw.js', 'utf8'), { self, caches, URL, Request, AbortController, setTimeout, clearTimeout, fetch: async () => { if (offline) throw Error('Offline'); return new Response('network'); } });
 return { listeners, requests, set offline(value) { offline = value; } };
}
test('offline shell caches public files and falls back for preview navigation, never Supabase or account URLs', async () => {
 const w = worker(); let install;
 w.listeners.get('install')({ waitUntil: p => { install = p; } }); await install;
 assert.ok(w.requests.some(url => url.endsWith('main.js?v=5-sync'))); assert.ok(w.requests.every(url => url.startsWith('https://todo.test/mobile-preview/')));
 w.offline = true; let response;
 w.listeners.get('fetch')({ request: { url: 'https://todo.test/mobile-preview/?code=private', method: 'GET', mode: 'navigate' }, respondWith: p => { response = p; } });
 assert.match(await (await response).text(), /cached:.*index.html/); assert.ok(w.requests.every(url => !url.includes('private')));
 response = null;
 w.listeners.get('fetch')({ request: { url: 'https://project.supabase.co/rest/v1/notebooks', method: 'GET' }, respondWith: p => { response = p; } }); assert.equal(response, null);
 w.listeners.get('fetch')({ request: { url: 'https://todo.test/private/account.json', method: 'GET' }, respondWith: p => { response = p; } }); assert.equal(response, null);
});
