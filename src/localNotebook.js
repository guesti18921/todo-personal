// Persistent, account-scoped snapshots. Text is stored unchanged in JSON.
export const LOCAL_SCHEMA_VERSION = 1;
const prefix = 'todo-personal:local:';
export const copy = value => JSON.parse(JSON.stringify(value));

export function createEntryId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = new Uint8Array(16);
    globalThis.crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Deterministic legacy IDs allow two devices to migrate the same cloud state.
function legacyId(path, entry) {
    const text = path + ':' + JSON.stringify(entry);
    let a = 2166136261, b = 5381;
    for (let i = 0; i < text.length; i++) {
        a = Math.imul(a ^ text.charCodeAt(i), 16777619);
        b = Math.imul(b, 33) ^ text.charCodeAt(i);
    }
    return 'legacy-' + (a >>> 0).toString(16) + '-' + (b >>> 0).toString(16);
}

export function normalizeNotebook(state) {
    if (!state || !state.todos || Array.isArray(state.todos) || typeof state.todos !== 'object' || !Array.isArray(state.notes)) {
        throw new Error('Invalid notebook data; existing local data has been retained.');
    }
    const result = copy(state);
    const seen = new Set();
    const assign = (entry, path) => {
        if (!entry || Array.isArray(entry) || typeof entry !== 'object') throw new Error('Invalid notebook entry.');
        if (typeof entry.id !== 'string' || !entry.id || seen.has(entry.id)) {
            let id = legacyId(path, entry), suffix = 0;
            while (seen.has(id)) id = legacyId(path, entry) + '-' + (++suffix);
            entry.id = id;
        }
        seen.add(entry.id);
    };
    for (const [project, entries] of Object.entries(result.todos)) {
        if (['__proto__', 'constructor', 'prototype'].includes(project) || !Array.isArray(entries)) throw new Error('Invalid notebook project.');
        entries.forEach((entry, index) => assign(entry, `task:${project}:${index}`));
    }
    result.notes.forEach((entry, index) => assign(entry, `note:${index}`));
    return result;
}

export function readLocalNotebook(id) {
    const raw = localStorage.getItem(prefix + id);
    if (!raw) return null;
    const snapshot = JSON.parse(raw);
    if (snapshot.schemaVersion !== LOCAL_SCHEMA_VERSION || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0 || typeof snapshot.dirty !== 'boolean') {
        throw new Error('Unsupported local notebook format; existing data has been retained.');
    }
    return { ...snapshot, state: normalizeNotebook(snapshot.state) };
}

export function writeLocalNotebook(id, snapshot) {
    try {
        localStorage.setItem(prefix + id, JSON.stringify({
            schemaVersion: LOCAL_SCHEMA_VERSION,
            state: normalizeNotebook(snapshot.state),
            revision: snapshot.revision,
            dirty: snapshot.dirty,
            conflict: Boolean(snapshot.conflict),
            savedAt: snapshot.savedAt || new Date().toISOString(),
            syncedAt: snapshot.syncedAt || null
        }));
        return true;
    } catch (_) { return false; }
}
