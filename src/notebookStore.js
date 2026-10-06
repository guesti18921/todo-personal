import { supabase } from './supabaseClient.js';
import { normalizeNotebook, readLocalNotebook, writeLocalNotebook } from './localNotebook.js';

function stable(value) {
    if (Array.isArray(value)) {
        return '[' + value.map(stable).join(',') + ']';
    }

    if (value !== null && typeof value === 'object') {
        return '{' + Object.keys(value).sort().map(
            name => JSON.stringify(name) + ':' + stable(value[name])
        ).join(',') + '}';
    }

    return JSON.stringify(value);
}

// Writes are serialized and conditional on the revision read from the server.
let context = null;
let timer;
let retryTimer;
const copy = value => JSON.parse(JSON.stringify(value));
const key = id => `todo-personal:draft:${id}`;
const empty = () => ({ todos: { home: [], today: [], week: [] }, notes: [] });
let notify = () => {};
export function onSaveStatus(callback) { notify = callback; }
export function closeNotebook() {
    clearTimeout(timer);
    clearTimeout(retryTimer);
    context = null;
}
export function hasPendingChanges() { return Boolean(context?.dirty); }
export function getDraft() { return context ? copy(context.state) : null; }
function stash(c) {
    c.localSaved = writeLocalNotebook(c.id, c);
    // Delete an old draft only after its replacement has been persisted.
    if (c.localSaved) {
        try { localStorage.removeItem(key(c.id)); } catch (_) { /* retained safely */ }
    }
    return c.localSaved;
}
function report(c, message) { if (context === c) notify(message); }
function scheduleRetry(c) {
    clearTimeout(retryTimer);
    if (context !== c || !c.dirty || c.conflict) return;
    retryTimer = setTimeout(() => {
        if (context === c) flushNotebook();
    }, c.retryDelay);
    c.retryDelay = Math.min(c.retryDelay * 2, 60000);
}
export async function openNotebook(id) {
    closeNotebook();
    const c = { id, state: empty(), revision: 0, dirty: false, conflict: false, running: null, localSaved: false, retryDelay: 2000 };
    context = c;
    // Restore a complete account snapshot without waiting for the network.
    const cached = readLocalNotebook(id);
    let draft;
    if (!cached) {
        const raw = localStorage.getItem(key(id));
        if (raw) {
            draft = JSON.parse(raw);
            if (!Number.isSafeInteger(draft.revision) || draft.revision < 0) throw new Error('Invalid local draft; existing data has been retained.');
        }
    }
    if (cached || draft) {
        const saved = cached || draft;
        c.state = normalizeNotebook(saved.state);
        c.revision = saved.revision;
        c.dirty = cached ? cached.dirty : true;
        stash(c);
        report(c, c.localSaved ? c.dirty ? 'Saved locally — waiting for sync' : 'Saved locally' : 'Local storage unavailable — keep this tab open');
        if (c.dirty) scheduleRetry(c);
        return copy(c.state);
    }
    let { data, error } = await supabase.from('notebooks').select('*').eq('user_id', id).maybeSingle();
    if (error) throw error;
    if (!data) {
        const result = await supabase.from('notebooks').insert({ user_id: id }).select().single();
        if (result.error && result.error.code === '23505') {
            const retry = await supabase.from('notebooks').select('*').eq('user_id', id).single();
            if (retry.error) throw retry.error;
            data = retry.data;
        } else {
            if (result.error) throw result.error;
            data = result.data;
        }
    }
    if (context !== c) return null;
    const cloud = { todos: data.todos, notes: data.notes };
    c.state = normalizeNotebook(cloud);
    c.revision = data.revision;
    c.dirty = stable(c.state) !== stable(cloud);
    stash(c);
    report(c, c.localSaved ? c.dirty ? 'Saved locally — waiting for sync' : 'Saved' : 'Loaded from cloud — local storage unavailable');
    if (c.dirty) scheduleRetry(c);
    return copy(c.state);
}
export function savePart(part, value) {
    const c = context;
    if (!c) return;
    if (!['todos', 'notes'].includes(part)) throw new Error('Invalid notebook section.');
    const next = normalizeNotebook({ ...c.state, [part]: value });
    if (stable(c.state) === stable(next)) return;
    c.state = next;
    c.dirty = true;
    const stored = stash(c);
    report(c, stored ? 'Saved locally — waiting for sync' : 'Unsaved changes — keep this tab open');
    clearTimeout(timer);
    timer = setTimeout(() => { flushNotebook(); }, 500);
}
export async function flushNotebook() {
    const c = context;
    if (!c) return true;
    if (c.running) return c.running;
    if (!c.dirty) return true;
    if (c.conflict) { report(c, 'Conflict: download your draft before loading the cloud copy.'); return false; }
    c.running = (async () => {
        try {
            while (c.dirty && context === c) {
                report(c, 'Saving...');
                const sent = copy(c.state);
                const { data, error } = await supabase.from('notebooks')
                    .update({ ...sent, revision: c.revision + 1 })
                    .eq('user_id', c.id).eq('revision', c.revision).select('revision');
                if (context !== c) return false;
                if (error) throw error;
                if (!data?.length) {
                    c.conflict = true;
                    report(c, 'Conflict: download your draft before loading the cloud copy.');
                    return false;
                }
                c.revision = data[0].revision;
                c.dirty = stable(c.state) !== stable(sent);
                stash(c);
            }
            if (context === c) clearTimeout(retryTimer);
            c.retryDelay = 2000;
            report(c, c.localSaved ? 'Saved' : 'Saved to cloud — local storage unavailable');
            return !c.dirty;
        } catch (error) {
            report(c, c.localSaved ? 'Saved locally — connection unavailable; sync will retry' : `Not saved: ${error.message || 'Connection failed'}. Keep this tab open.`);
            scheduleRetry(c);
            return false;
        } finally { c.running = null; }
    })();
    return c.running;
}
export async function readCloudChanges() {
    const c = context;
    if (!c || c.dirty || c.running) return null;
    const revision = c.revision;
    const { data, error } = await supabase.from('notebooks').select('*').eq('user_id', c.id).single();
    if (context !== c || c.dirty || c.running || c.revision !== revision) return null;
    if (error) {
        report(c, c.localSaved ? 'Saved locally — connection unavailable' : 'Connection unavailable — local storage unavailable');
        return null;
    }
    if (data.revision < revision) {
        report(c, 'Cloud revision is older; local data has been retained.');
        return null;
    }
    if (data.revision === revision) {
        report(c, c.localSaved ? 'Saved' : 'Loaded from cloud — local storage unavailable');
        return null;
    }
    const cloud = { todos: data.todos, notes: data.notes };
    const normalized = normalizeNotebook(cloud);
    c.revision = data.revision;
    c.state = normalized;
    c.dirty = stable(c.state) !== stable(cloud);
    stash(c);
    report(c, c.localSaved ? c.dirty ? 'Saved locally — waiting for sync' : 'Saved' : 'Loaded from cloud — local storage unavailable');
    if (c.dirty) scheduleRetry(c);
    return copy(c.state);
}
export async function discardDraftAndReload() {
    const c = context;
    if (!c || c.running) return null;
    // Read successfully before discarding the local draft.
    const { data, error } = await supabase.from('notebooks').select('*').eq('user_id', c.id).single();
    if (error) throw error;
    if (context !== c) return null;
    clearTimeout(timer);
    clearTimeout(retryTimer);
    const cloud = { todos: data.todos, notes: data.notes };
    c.state = normalizeNotebook(cloud);
    c.revision = data.revision;
    c.dirty = stable(c.state) !== stable(cloud);
    c.conflict = false;
    stash(c);
    report(c, c.localSaved ? c.dirty ? 'Saved locally — waiting for sync' : 'Saved' : 'Loaded from cloud — local storage unavailable');
    if (c.dirty) scheduleRetry(c);
    return copy(c.state);
}
window.addEventListener('beforeunload', event => {
    // A persisted offline edit can safely outlive this tab.
    if (context?.dirty && !context.localSaved) { event.preventDefault(); event.returnValue = ''; }
});
function resumeSync() {
    if (context?.dirty) flushNotebook();
}
window.addEventListener('online', resumeSync);
window.addEventListener('focus', resumeSync);
