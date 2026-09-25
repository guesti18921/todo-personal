import { supabase } from './supabaseClient.js';

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
const copy = value => JSON.parse(JSON.stringify(value));
const key = id => `todo-personal:draft:${id}`;
const empty = () => ({ todos: { home: [], today: [], week: [] }, notes: [] });
let notify = () => {};
export function onSaveStatus(callback) { notify = callback; }
export function closeNotebook() {
    clearTimeout(timer);
    context = null;
}
export function hasPendingChanges() { return Boolean(context?.dirty); }
export function getDraft() { return context ? copy(context.state) : null; }
function stash(c) {
    try {
        localStorage.setItem(key(c.id), JSON.stringify({ state: c.state, revision: c.revision }));
        return true;
    } catch (_) { return false; }
}
function report(c, message) { if (context === c) notify(message); }
export async function openNotebook(id) {
    closeNotebook();
    const c = { id, state: empty(), revision: 0, dirty: false, conflict: false, running: null };
    context = c;
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
    c.state = { todos: data.todos, notes: data.notes };
    c.revision = data.revision;
    let draft;
    try { draft = JSON.parse(localStorage.getItem(key(id))); } catch (_) { /* unavailable */ }
    if (draft?.state && stable(draft.state) !== stable(c.state)) {
        c.state = draft.state;
        c.dirty = true;
        c.conflict = draft.revision !== c.revision;
    }
    report(c, c.conflict ? 'Conflict: download your draft before loading the cloud copy.' : c.dirty ? 'Unsaved draft restored. Click Retry save.' : 'Saved');
    return copy(c.state);
}
export function savePart(part, value) {
    const c = context;
    if (!c || stable(c.state[part]) === stable(value)) return;
    c.state[part] = copy(value);
    c.dirty = true;
    const stored = stash(c);
    report(c, stored ? 'Unsaved changes' : 'Unsaved changes — keep this tab open');
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
                if (error) throw error;
                if (!data?.length) {
                    c.conflict = true;
                    report(c, 'Conflict: download your draft before loading the cloud copy.');
                    return false;
                }
                c.revision = data[0].revision;
                c.dirty = stable(c.state) !== stable(sent);
                if (c.dirty) stash(c);
                else {
                    try { localStorage.removeItem(key(c.id)); } catch (_) { /* optional cache */ }
                }
            }
            report(c, 'Saved');
            return !c.dirty;
        } catch (error) {
            report(c, `Not saved: ${error.message || 'Connection failed'}. Click Retry save.`);
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
    if (error || context !== c || c.dirty || c.running || c.revision !== revision) return null;
    if (data.revision === revision) return null;
    c.revision = data.revision;
    c.state = { todos: data.todos, notes: data.notes };
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
    c.state = { todos: data.todos, notes: data.notes };
    c.revision = data.revision;
    c.dirty = false;
    c.conflict = false;
    try { localStorage.removeItem(key(c.id)); } catch (_) { /* optional cache */ }
    report(c, 'Saved');
    return copy(c.state);
}
window.addEventListener('beforeunload', event => {
    if (hasPendingChanges()) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('online', () => { flushNotebook(); });
