// Only public app files are cached. Supabase requests and account data never pass through this cache.
const BASE = new URL('./', self.location.href).href;
const PREFIX = `todo-personal-shell:${new URL(BASE).pathname}:`;
const CACHE = PREFIX + 'e4ed90cebc0ad5b5d4ab';
const ASSETS = ['index.html', 'main.js?v=10-tap', 'main.css', 'auth.css?v=2', 'mobile.css?v=9-clear'];
self.addEventListener('install', event => event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(ASSETS.map(path => new Request(new URL(path, BASE), { cache: 'reload' })));
    await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
    const request = event.request, url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin || !url.href.startsWith(BASE)) return;
    if (request.mode === 'navigate' && [new URL(BASE).pathname, new URL('index.html', BASE).pathname].includes(url.pathname)) {
        event.respondWith((async () => {
            const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 4000);
            try { const response = await fetch(request, { signal: controller.signal }); if (!response.ok) throw new Error('Navigation unavailable'); return response; }
            catch (error) { const cached = await caches.match(new URL('index.html', BASE)); if (cached) return cached; throw error; }
            finally { clearTimeout(timer); }
        })());
    } else if (/\.(js|css|png|jpg|jpeg|svg|ico|woff2?)$/.test(url.pathname) && !url.pathname.endsWith('/sw.js')) {
        event.respondWith((async () => {
            const cache = await caches.open(CACHE), cached = await cache.match(request);
            if (cached) return cached;
            const response = await fetch(request);
            if (response.ok && response.type !== 'opaque') await cache.put(request, response.clone());
            return response;
        })());
    }
});
