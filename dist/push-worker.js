// Only an account ID is stored here, never credentials or notebook contents.
// A durable binding lets a closed-tab worker reject a previous account's push.
const PUSH_DB = 'todo-personal-push-binding:' + new URL(self.registration.scope).pathname;
let pushQueue = Promise.resolve();
const pushSerial = action => { const result = pushQueue.then(action); pushQueue = result.catch(() => {}); return result; };
function pushBinding(value, write = false, key = 'owner') {
    return new Promise((resolve, reject) => {
        const open = indexedDB.open(PUSH_DB, 1);
        open.onupgradeneeded = () => { if (!open.result.objectStoreNames.contains('binding')) open.result.createObjectStore('binding'); };
        open.onerror = () => reject(Error('storage_unavailable'));
        open.onsuccess = () => {
            const db = open.result;
            const tx = db.transaction('binding', write ? 'readwrite' : 'readonly');
            const store = tx.objectStore('binding');
            const op = write ? store.put(value, key) : store.get(key);
            tx.oncomplete = () => { const result = write ? value : op.result; db.close(); resolve(result || null); };
            tx.onerror = tx.onabort = () => { db.close(); reject(Error('storage_unavailable')); };
        };
    });
}
self.addEventListener('message', event => {
    if (event.data?.type !== 'todo-push-bind') return;
    // Accept bindings only from one of this origin's app windows.
    const source = event.source;
    if (!source?.url || new URL(source.url).origin !== self.location.origin) return;
    const owner = event.data.owner;
    if (owner !== null && (typeof owner !== 'string' || !/^[\w-]{1,100}$/.test(owner))) return;
    event.waitUntil(pushSerial(async () => {
        try {
            await pushBinding(owner, true);
            for (const notification of await self.registration.getNotifications()) if (notification.data?.owner !== owner) notification.close();
            event.ports[0]?.postMessage({ ok: true });
        } catch (_) { event.ports[0]?.postMessage({ ok: false }); }
    }));
});
self.addEventListener('push', event => {
    event.waitUntil(pushSerial(async () => {
        try {
            const data = event.data?.json();
            if (data?.version !== 1 || typeof data.owner !== 'string' || typeof data.entryId !== 'string' || data.entryId.length > 200 || typeof data.at !== 'string') return;
            const at = Date.parse(data.at);
            if (!Number.isFinite(at) || at > Date.now() + 60000 || Date.now() - at > 30 * 60000) return;
            if (await pushBinding() !== data.owner) return;
            const seen = 'seen:' + data.owner + ':' + data.entryId;
            if (await pushBinding(null, false, seen) === data.at) return;
            const english = data.language !== 'ru';
            await self.registration.showNotification(english ? 'TO-DO Personal · Reminder' : 'TO-DO Personal · Напоминание', {
                body: english ? 'Open your notebook to view the entry.' : 'Откройте блокнот, чтобы посмотреть запись.',
                icon: new URL('img/favicon.png', self.registration.scope).href,
                tag: 'todo-push:' + data.owner + ':' + data.entryId + ':' + data.at,
                renotify: false,
                data: { owner: data.owner, entryId: data.entryId, at: data.at }
            });
            await pushBinding(data.at, true, seen);
        } catch (_) { /* Malformed payload or blocked storage fails closed. */ }
    }));
});
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(pushSerial(async () => {
        const data = event.notification.data;
        if (!data || await pushBinding() !== data.owner) return;
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const base = new URL(self.registration.scope);
        const client = windows.find(w => { const url = new URL(w.url); return url.origin === base.origin && [base.pathname, base.pathname + 'index.html'].includes(url.pathname); });
        if (client) {
            // Do not navigate/reload an existing editor and lose its draft.
            await client.focus(); client.postMessage({ type: 'todo-push-open', ...data });
        } else {
            base.searchParams.set('push-owner', data.owner);
            base.searchParams.set('push-entry', data.entryId);
            base.searchParams.set('push-at', data.at);
            await self.clients.openWindow(base.href);
        }
    }).catch(() => {}));
});
