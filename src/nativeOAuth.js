// Persist only the PKCE verifier and operation metadata across Android process
// restarts. Temporary sessions and their tokens never go into this storage.
export const NATIVE_OAUTH_KEY = 'todo-personal:native-oauth';
export function nativeOAuthStorage(storage, key = NATIVE_OAUTH_KEY) {
    const memory = new Map();
    const verifier = name => name.startsWith(key + '-') && name.endsWith('-code-verifier');
    return {
        getItem(name) { return verifier(name) ? storage.getItem(name) : memory.get(name) ?? null; },
        setItem(name, value) { if (verifier(name)) storage.setItem(name, value); else memory.set(name, value); },
        removeItem(name) { if (verifier(name)) storage.removeItem(name); else memory.delete(name); }
    };
}
export function createNativeOAuthGate(storage, now = () => Date.now()) {
    const key = NATIVE_OAUTH_KEY + ':pending';
    function clear() {
        storage.removeItem(key);
        const names = Array.from({ length: storage.length }, (_, i) => storage.key(i));
        for (const name of names) if (name?.startsWith(NATIVE_OAUTH_KEY + '-') && name.endsWith('-code-verifier')) storage.removeItem(name);
    }
    return {
        clear,
        remember(url, owner) {
            const redirect = new URL(new URL(url).searchParams.get('redirect_to'));
            storage.setItem(key, JSON.stringify({ owner: owner || null, startedAt: now(), flowId: redirect.searchParams.get('sb_flow_id') || null }));
        },
        read(link, owner) {
            let state; try { state = JSON.parse(storage.getItem(key)); } catch (_) { return null; }
            if (!state || state.owner !== (owner || null) || !Number.isFinite(state.startedAt) || now() - state.startedAt > 15 * 60000 || state.startedAt > now() || !link?.code || link.session || (state.flowId || null) !== (link.flowId || null)) return null;
            return state;
        }
    };
}
