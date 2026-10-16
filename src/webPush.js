export function createWebPush({ auth, fetcher, serverUrl, publicKey, onStatus = () => {}, language = () => 'ru',
    storage = globalThis.localStorage, nav = globalThis.navigator, permission = globalThis.Notification,
    supported = Boolean(globalThis.isSecureContext && globalThis.PushManager && globalThis.Notification && globalThis.navigator?.serviceWorker),
    bindWorker = null, requestTimeoutMs = 15000, timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone }) {
    let owner = null, initialized = false, operation = 0, enabled = false, tail = Promise.resolve();
    const pref = id => `todo-personal:web-push:${id}`;
    const emit = error => onStatus({ supported, enabled, error: error || '' });
    const serial = action => { const result = tail.then(action); tail = result.catch(() => {}); return result; };
    const current = (id, ticket) => owner === id && operation === ticket;
    let binding = Promise.resolve();
    async function bounded(action, onTimeout = () => {}) {
        let timer;
        try {
            return await Promise.race([Promise.resolve().then(action), new Promise((_, reject) => {
                timer = setTimeout(() => { onTimeout(); reject(Error('push_timeout')); }, requestTimeoutMs);
            })]);
        } finally { clearTimeout(timer); }
    }
    async function registration() {
        const reg = await bounded(() => nav.serviceWorker.register('/sw.js', { scope: '/' }));
        if (!reg.active) {
            const worker = reg.installing || reg.waiting;
            if (!worker) throw Error('worker_unavailable');
            await new Promise((resolve, reject) => {
                const finish = error => { clearTimeout(timer); worker.removeEventListener('statechange', changed); error ? reject(error) : resolve(); };
                const changed = () => { if (worker.state === 'activated') finish(); else if (worker.state === 'redundant') finish(Error('worker_unavailable')); };
                const timer = setTimeout(() => finish(Error('worker_timeout')), 15000);
                worker.addEventListener('statechange', changed); changed();
            });
        }
        // Wait for the browser's active registration on a first installation.
        // A statechange alone can precede serviceWorker.ready.
        if (nav.serviceWorker.ready) return bounded(() => nav.serviceWorker.ready);
        return reg;
    }
    function bind(id) {
        binding = binding.catch(() => {}).then(async () => {
            if (bindWorker) return bindWorker(id);
            const reg = await registration();
            const worker = reg.active;
            if (!worker) throw Error('worker_unavailable');
            await new Promise((resolve, reject) => {
                const channel = new MessageChannel();
                const timer = setTimeout(() => { channel.port1.close(); reject(Error('worker_timeout')); }, 5000);
                channel.port1.onmessage = event => { clearTimeout(timer); channel.port1.close(); event.data?.ok ? resolve() : reject(Error('worker_storage')); };
                worker.postMessage({ type: 'todo-push-bind', owner: id }, [channel.port2]);
            });
        });
        return binding;
    }
    async function request(id, body, retry = true) {
        const result = await bounded(() => auth.getSession());
        if (owner !== id || result.error || result.data?.session?.user?.id !== id) throw Error('account_changed');
        const controller = new AbortController();
        let response, data;
        try { ({ response, data } = await bounded(async () => {
            const response = await fetcher(serverUrl + '/functions/v1/push-subscriptions', { method: 'POST', signal: controller.signal, headers: {
                'Content-Type': 'application/json', apikey: publicKey, Authorization: 'Bearer ' + result.data.session.access_token
            }, body: JSON.stringify(body) });
            let data;
            try { data = await response.json(); } catch (_) { data = {}; }
            return { response, data };
        }, () => controller.abort())); }
        catch (error) {
            if (retry && body.action === 'config' && error.name === 'TypeError' && owner === id) return request(id, body, false);
            throw error;
        }
        if (response.status === 401 && retry && typeof auth.refreshSession === 'function') {
            const refreshed = await bounded(() => auth.refreshSession());
            if (owner !== id || refreshed.error || refreshed.data?.session?.user?.id !== id) throw Error('account_changed');
            return request(id, body, false);
        }
        if (retry && body.action === 'config' && [502, 503, 504].includes(response.status) && owner === id) return request(id, body, false);
        if (!response.ok) throw Error(response.status === 404 || data.code === 'push_not_configured' ? 'push_not_configured' : data.code === 'subscription_owner_mismatch' ? 'account_changed' : 'push_server');
        return data;
    }
    async function activate(id, ticket, permissionPromise) {
        let sub;
        try {
            const granted = await permissionPromise;
            if (!current(id, ticket)) return false;
            if (granted !== 'granted') throw Error('permission_denied');
            const config = await request(id, { action: 'config' });
            if (!current(id, ticket)) return false;
            if (!config.enabled || !/^[\w-]{87}$/.test(config.publicKey || '')) throw Error('push_not_configured');
            const key = Uint8Array.from(atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
            if (key.length !== 65 || key[0] !== 4) throw Error('push_not_configured');
            const reg = await registration();
            if (!current(id, ticket)) return false;
            sub = await reg.pushManager.getSubscription();
            if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
            if (!current(id, ticket)) { await sub.unsubscribe(); return false; }
            await request(id, { action: 'subscribe', subscription: sub.toJSON(), language: language(), timeZone: timeZone() });
            if (!current(id, ticket)) { await sub.unsubscribe(); return false; }
            // Persist opt-in only after the server accepted this account's endpoint.
            storage.setItem(pref(id), 'true');
            await bind(id);
            if (!current(id, ticket)) return false;
            enabled = true; emit(); return true;
        } catch (error) {
            if (sub) { try { await sub.unsubscribe(); } catch (_) {} }
            if (!current(id, ticket)) return false;
            enabled = false;
            try { storage.removeItem(pref(id)); } catch (_) {}
            await bind(null).catch(() => {});
            emit(error.message === 'permission_denied' ? 'Разрешите уведомления для сайта в настройках браузера.'
                : error.message === 'push_not_configured' ? 'Сервер Web Push пока не настроен. Напоминания внутри открытого блокнота продолжают работать.'
                : 'Не удалось подключить системные уведомления. Проверьте соединение и повторите попытку.');
            return false;
        }
    }
    async function discardSubscription() {
        const reg = await nav.serviceWorker.getRegistration('/');
        const sub = await reg?.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
    }
    return {
        supported,
        setAccount(id) {
            const previous = owner;
            if (initialized && id === owner) return tail;
            initialized = true;
            owner = id; const ticket = ++operation; enabled = false; emit();
            if (!supported) return Promise.resolve();
            let restore = false;
            try { restore = Boolean(id && storage.getItem(pref(id)) === 'true'); } catch (_) {}
            // A new tab restoring the same account must not briefly suppress push
            // for all other tabs sharing this service worker.
            if (!restore || (previous && previous !== id)) bind(null).catch(() => {});
            return serial(async () => {
                if (previous && previous !== id) {
                    try { storage.removeItem(pref(previous)); } catch (_) {}
                    await discardSubscription().catch(() => {});
                }
                if (!current(id, ticket) || !id) return;
                if (restore) return activate(id, ticket, Promise.resolve(permission.permission));
            });
        },
        enable() {
            if (!supported || !owner) { emit('Этот браузер не поддерживает системные уведомления.'); return Promise.resolve(false); }
            const id = owner, ticket = ++operation;
            // Start the permission prompt in the user click's activation context.
            let grant;
            try { grant = permission.permission === 'granted' ? Promise.resolve('granted') : Promise.resolve(permission.requestPermission()).catch(() => 'denied'); }
            catch (_) { grant = Promise.resolve('denied'); }
            return serial(() => activate(id, ticket, grant));
        },
        disable() {
            const id = owner; ++operation; enabled = false;
            if (!supported) return Promise.resolve(true);
            const cleared = bind(null);
            try { if (id) storage.removeItem(pref(id)); } catch (_) {}
            return serial(async () => {
                try {
                    await cleared;
                    const reg = await nav.serviceWorker.getRegistration('/');
                    const sub = await reg?.pushManager.getSubscription();
                    if (sub) {
                        // Unsubscribe locally even if the backend is unreachable.
                        const json = sub.toJSON();
                        await sub.unsubscribe();
                        if (owner === id) await request(id, { action: 'unsubscribe', subscription: json }).catch(() => {});
                    }
                    emit(); return true;
                } catch (_) { emit('Не удалось отключить системные уведомления. Закройте доступ к уведомлениям в настройках браузера.'); return false; }
            });
        },
        refresh() {
            if (!supported || !owner || !enabled) return tail;
            const id = owner, ticket = operation;
            return serial(async () => {
                if (!current(id, ticket)) return;
                if (permission.permission !== 'granted') { enabled = false; await bind(null).catch(() => {}); emit('Разрешите уведомления для сайта в настройках браузера.'); return; }
                const reg = await nav.serviceWorker.getRegistration('/');
                const sub = await reg?.pushManager.getSubscription();
                if (!sub) { enabled = false; emit('Подписка на уведомления истекла. Включите их снова.'); return; }
                await request(id, { action: 'subscribe', subscription: sub.toJSON(), language: language(), timeZone: timeZone() });
            }).catch(() => { if (current(id, ticket)) emit('Не удалось обновить подписку. Проверьте соединение.'); });
        }
    };
}
