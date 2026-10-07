import { AUTH_STORAGE_KEY } from './localAccount.js';

const deletedPrefix = 'todo-personal:deleted-account:';
const ownedTypes = ['local', 'draft', 'entry-draft', 'preferences', 'language', 'reminders-enabled', 'recovery-latest'];

export async function requestAccountDeletion(client, owner, currentOwner) {
    const { data, error } = await client.auth.getSession();
    const session = data?.session;
    if (error || !owner || currentOwner() !== owner || session?.user?.id !== owner || !session?.access_token) {
        throw new Error('authentication_required');
    }
    const result = await client.functions.invoke('delete-account', {
        body: { confirm: 'DELETE' },
        headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (result.error || result.data?.code !== 'account_deleted') throw new Error('deletion_unconfirmed');
}

// Only called AFTER the server has confirmed hard deletion. The marker makes
// interrupted cleanup retryable at startup, before the Auth client is created.
export function clearDeletedAccount(storage, owner) {
    let complete = true;
    try { storage.setItem(deletedPrefix + owner, '1'); } catch (_) { complete = false; }
    const exact = new Set(ownedTypes.map(type => `todo-personal:${type}:${owner}`));
    try {
        const names = Array.from({ length: storage.length }, (_, i) => storage.key(i));
        for (const name of names) {
            if (exact.has(name) || name?.startsWith(`todo-personal:recovery:${owner}:`) || name?.startsWith(`todo-personal:reminder-seen:${owner}:`)) {
                try { storage.removeItem(name); } catch (_) { complete = false; }
            }
        }
        const cached = JSON.parse(storage.getItem(AUTH_STORAGE_KEY));
        if (cached?.user?.id === owner) {
            for (const name of [AUTH_STORAGE_KEY, AUTH_STORAGE_KEY + '-user', AUTH_STORAGE_KEY + '-code-verifier']) {
                try { storage.removeItem(name); } catch (_) { complete = false; }
            }
        }
    } catch (_) { complete = false; }
    if (complete) {
        try { storage.removeItem(deletedPrefix + owner); } catch (_) { complete = false; }
    }
    return complete;
}

export function recoverDeletedAccounts(storage) {
    try {
        const names = Array.from({ length: storage.length }, (_, i) => storage.key(i));
        for (const name of names) if (name?.startsWith(deletedPrefix)) clearDeletedAccount(storage, name.slice(deletedPrefix.length));
    } catch (_) { /* Do not block startup if browser storage is unavailable. */ }
}
