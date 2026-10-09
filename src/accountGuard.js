import { AUTH_STORAGE_KEY } from './localAccount.js';

// An unavailable network, expired JWT or missing notebook is not proof of deletion.
// Only Auth's explicit user_not_found response permits deleting a local copy.
export function createAccountGuard({ storage, fetch, serverUrl, publicKey, getOwner, onDeleted }) {
    let pending = null;
    return function checkAccount() {
        if (pending) return pending;
        const owner = getOwner();
        let session;
        try { session = JSON.parse(storage.getItem(AUTH_STORAGE_KEY)); } catch (_) { return Promise.resolve(false); }
        if (!owner || session?.user?.id !== owner || !session.access_token) return Promise.resolve(false);
        const token = session.access_token;
        pending = Promise.resolve().then(async () => {
            try {
                const response = await fetch(`${serverUrl}/auth/v1/user`, {
                    headers: { apikey: publicKey, Authorization: `Bearer ${token}` },
                    cache: 'no-store',
                });
                if (![401, 403, 404].includes(response.status)) return false;
                const body = await response.json();
                if (body?.code !== 'user_not_found' || getOwner() !== owner) return false;
                // A login/account switch may have happened while the request ran.
                const latest = JSON.parse(storage.getItem(AUTH_STORAGE_KEY));
                if (latest?.user?.id !== owner || latest.access_token !== token) return false;
                await onDeleted(owner);
                return true;
            } catch (_) { return false; }
            finally { pending = null; }
        });
        return pending;
    };
}
