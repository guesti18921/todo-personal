import { supabase } from './supabaseClient.js';
import { normalizeNotebook, readLocalNotebook, writeLocalNotebook } from './localNotebook.js';

import { syncFailureDetails } from './syncFailure.js';
import { stable, combineNotebooks, compareNotebooks, notebookSummary } from './syncModel.js';

// Writes are serialized and conditional on the revision read from the server.
let context = null;
let timer;
let retryTimer;
const copy = value => JSON.parse(JSON.stringify(value));
const key = id => `todo-personal:draft:${id}`;
const empty = () => ({ todos: { home: [], today: [], week: [] }, notes: [] });
let notify = () => {};
export function onSaveStatus(callback) { notify = callback; }
export function getSyncDetails() {
    const c = context;
    if (!c) return null;
    let backup = false;
    try { backup = Boolean(localStorage.getItem(`todo-personal:recovery-latest:${c.id}`)); } catch (_) {}
    return { phase: c.phase || 'local', localSaved: c.localSaved, dirty: c.dirty, conflict: c.conflict,
        savedAt: c.savedAt || null, syncedAt: c.syncedAt || null, counts: notebookSummary(c.state), failure: c.failure || null, backup };
}
export function getRecoveryCopy() {
    if (!context) return null;
    const name = localStorage.getItem(`todo-personal:recovery-latest:${context.id}`);
    return name ? JSON.parse(localStorage.getItem(name)) : null;
}
function preserveCopies(c, cloud) {
    const name = `todo-personal:recovery:${c.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    const backup = { format: 'todo-personal-recovery-v1', createdAt: new Date().toISOString(),
        local: { state: copy(c.state), revision: c.revision }, cloud: { state: copy(cloud.state), revision: cloud.revision } };
    try { localStorage.setItem(name, JSON.stringify(backup)); localStorage.setItem(`todo-personal:recovery-latest:${c.id}`, name); }
    catch (_) { throw new Error('Не удалось сохранить резервную копию на устройстве. Освободите место; обе текущие копии оставлены без изменений.'); }
}
export function closeNotebook() {
    clearTimeout(timer);
    clearTimeout(retryTimer);
    context = null;
}
export function hasPendingChanges() { return Boolean(context?.dirty); }
export function isLocallySaved() { return Boolean(context?.localSaved); }
export function getDraft() { return context ? copy(context.state) : null; }
function stash(c) {
    const stamp = new Date().toISOString();
    c.localSaved = writeLocalNotebook(c.id, { ...c, savedAt: stamp });
    if (c.localSaved) c.savedAt = stamp;
    // Delete an old draft only after its replacement has been persisted.
    if (c.localSaved) {
        try { localStorage.removeItem(key(c.id)); } catch (_) { /* retained safely */ }
    }
    return c.localSaved;
}
function report(c, message) {
    c.failure = null;
    if (message.startsWith('Conflict:')) c.phase = 'conflict';
    else if (message === 'Saving...') c.phase = 'syncing';
    else if (message.includes('connection unavailable') || message.startsWith('Not saved:') || message.startsWith('Connection unavailable')) c.phase = 'offline';
    else if (message === 'Saved' || message.startsWith('Saved to cloud') || message.startsWith('Loaded from cloud')) c.phase = 'synced';
    else if (message.includes('waiting for sync')) c.phase = 'pending';
    else if (message.startsWith('Cloud revision')) c.phase = 'older';
    else c.phase = 'local';
    if (context === c) notify(message, getSyncDetails());
}
function reportFailure(c, error, status) {
    c.failure = syncFailureDetails(error, status);
    c.phase = c.failure.phase;
    if (context === c) notify(c.localSaved ? 'Sync unavailable' : 'Not saved: sync unavailable. Keep this tab open.', getSyncDetails());
}
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
        c.conflict = Boolean(saved.conflict);
        c.syncedAt = saved.syncedAt || null;
        stash(c);
        report(c, c.localSaved ? c.dirty ? 'Saved locally — waiting for sync' : 'Saved locally' : 'Local storage unavailable — keep this tab open');
        if (c.dirty) scheduleRetry(c);
        return copy(c.state);
    }
    let { data, error, status } = await supabase.from('notebooks').select('*').eq('user_id', id).maybeSingle().retry(false);
    if (error) throw { ...error, message: error.message, status: status ?? error.status };
    if (!data) {
        const result = await supabase.from('notebooks').insert({ user_id: id }).select().single().retry(false);
        if (result.error && result.error.code === '23505') {
            const retry = await supabase.from('notebooks').select('*').eq('user_id', id).single().retry(false);
            if (retry.error) throw { ...retry.error, message: retry.error.message, status: retry.status ?? retry.error.status };
            data = retry.data;
        } else {
            if (result.error) throw { ...result.error, message: result.error.message, status: result.status ?? result.error.status };
            data = result.data;
        }
    }
    if (context !== c) return null;
    const cloud = { todos: data.todos, notes: data.notes };
    c.state = normalizeNotebook(cloud);
    c.revision = data.revision;
    c.syncedAt = new Date().toISOString();
    c.dirty = stable(c.state) !== stable(cloud);
    stash(c);
    report(c, c.localSaved ? c.dirty ? 'Saved locally — waiting for sync' : 'Saved' : 'Loaded from cloud — local storage unavailable');
    if (c.dirty) scheduleRetry(c);
    return copy(c.state);
}
export function savePart(part, value) {
    if (!context) return;
    if (!['todos', 'notes'].includes(part)) throw new Error('Invalid notebook section.');
    return saveNotebook({ ...context.state, [part]: value });
}
export function saveNotebook(state) {
    const c = context;
    if (!c) return false;
    const next = normalizeNotebook(state);
    if (stable(c.state) === stable(next)) {
        if (!c.localSaved) {
            const stored = stash(c);
            report(c, stored ? c.dirty ? 'Saved locally — waiting for sync' : 'Saved locally' : 'Unsaved changes — keep this tab open');
        }
        return c.localSaved;
    }
    c.state = next;
    c.dirty = true;
    const stored = stash(c);
    report(c, stored ? 'Saved locally — waiting for sync' : 'Unsaved changes — keep this tab open');
    clearTimeout(timer);
    timer = setTimeout(() => { flushNotebook(); }, 500);
    return stored;
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
                const { data, error, status } = await supabase.from('notebooks')
                    .update({ ...sent, revision: c.revision + 1 })
                    .eq('user_id', c.id).eq('revision', c.revision).select('revision').retry(false);
                if (context !== c) return false;
                if (error) throw { ...error, message: error.message, status: status ?? error.status };
                if (!data?.length) {
                    c.conflict = true;
                    stash(c);
                    report(c, 'Conflict: download your draft before loading the cloud copy.');
                    return false;
                }
                c.revision = data[0].revision;
                c.syncedAt = new Date().toISOString();
                c.dirty = stable(c.state) !== stable(sent);
                stash(c);
            }
            if (context === c) clearTimeout(retryTimer);
            c.retryDelay = 2000;
            report(c, c.localSaved ? 'Saved' : 'Saved to cloud — local storage unavailable');
            return !c.dirty;
        } catch (error) {
            reportFailure(c, error);
            scheduleRetry(c);
            return false;
        } finally { c.running = null; }
    })();
    return c.running;
}
export async function readCloudChanges({ checkOnly = false } = {}) {
    const c = context;
    if (!c || c.dirty || c.running) return null;
    const revision = c.revision;
    // Check only the revision before downloading notebook contents.
    const current = () => context === c && !c.dirty && !c.running && c.revision === revision;
    const probe = await supabase.from('notebooks').select('revision').eq('user_id', c.id).single().retry(false);
    if (!current()) return null;
    if (probe.error) {
        reportFailure(c, probe.error, probe.status);
        return null;
    }
    if (!Number.isSafeInteger(probe.data?.revision) || probe.data.revision < revision) {
        report(c, 'Cloud revision is older; local data has been retained.');
        return null;
    }
    if (probe.data.revision === revision) {
        c.syncedAt = new Date().toISOString();
        if (!c.localSaved) stash(c);
        report(c, c.localSaved ? 'Saved' : 'Loaded from cloud — local storage unavailable');
        return null;
    }
    const defer = () => typeof checkOnly === 'function' ? checkOnly() : checkOnly;
    const deferred = () => { c.failure = null; c.phase = 'available'; if (context === c) notify('Cloud changes available', getSyncDetails()); };
    if (defer()) {
        deferred();
        return null;
    }
    const { data, error, status } = await supabase.from('notebooks').select('revision,todos,notes').eq('user_id', c.id).single().retry(false);
    if (!current()) return null;
    if (error) {
        reportFailure(c, error, status);
        return null;
    }
    if (!Number.isSafeInteger(data?.revision) || data.revision <= revision) return null;
    if (defer()) { deferred(); return null; }
    const cloud = { todos: data.todos, notes: data.notes };
    const normalized = normalizeNotebook(cloud);
    c.revision = data.revision;
    c.syncedAt = new Date().toISOString();
    c.state = normalized;
    c.dirty = stable(c.state) !== stable(cloud);
    stash(c);
    report(c, c.localSaved ? c.dirty ? 'Saved locally — waiting for sync' : 'Saved' : 'Loaded from cloud — local storage unavailable');
    if (c.dirty) scheduleRetry(c);
    return copy(c.state);
}
export async function inspectConflict() {
    const c = context;
    if (!c || c.running) throw new Error('Дождитесь завершения отправки и попробуйте снова.');
    const fingerprint = stable(c.state);
    const { data, error } = await supabase.from('notebooks').select('*').eq('user_id', c.id).single().retry(false);
    if (error) throw new Error('Не удалось получить копию из аккаунта. Проверьте соединение и повторите попытку. Записи на устройстве сохранены.');
    if (context !== c || stable(c.state) !== fingerprint) throw new Error('Записи изменились во время проверки. Сравните копии заново.');
    if (!data || !Number.isSafeInteger(data.revision) || data.revision < c.revision) throw new Error('Облачная копия недоступна или устарела. Текущие записи сохранены.');
    const state = normalizeNotebook({ todos: data.todos, notes: data.notes });
    c.preview = { fingerprint, revision: data.revision, state };
    return { local: copy(c.state), cloud: copy(state), differences: compareNotebooks(c.state, state) };
}
export async function resolveConflict(mode) {
    const c = context;
    if (!['both', 'cloud'].includes(mode) || !c?.preview || c.running) throw new Error('Сначала сравните копии.');
    const preview = c.preview;
    if (stable(c.state) !== preview.fingerprint) throw new Error('Записи на устройстве изменились. Сравните копии заново.');
    const { data, error } = await supabase.from('notebooks').select('*').eq('user_id', c.id).single().retry(false);
    if (error) throw new Error('Нет соединения с аккаунтом. Обе копии оставлены без изменений.');
    if (context !== c) return null;
    if (c.running || stable(c.state) !== preview.fingerprint || data?.revision !== preview.revision || stable(normalizeNotebook({ todos: data.todos, notes: data.notes })) !== stable(preview.state)) {
        c.preview = null; throw new Error('Одна из копий обновилась. Сравните их заново перед выбором.');
    }
    preserveCopies(c, preview);
    const state = mode === 'both' ? combineNotebooks(c.state, preview.state) : copy(preview.state);
    const dirty = stable(state) !== stable(preview.state);
    const next = { ...c, state, revision: preview.revision, dirty, conflict: false, preview: null, syncedAt: dirty ? c.syncedAt : new Date().toISOString(), savedAt: new Date().toISOString() };
    if (!writeLocalNotebook(c.id, next)) throw new Error('Не удалось сохранить выбранную копию на устройстве. Текущие записи оставлены без изменений.');
    clearTimeout(timer); clearTimeout(retryTimer);
    Object.assign(c, next, { localSaved: true, conflict: false, preview: null, retryDelay: 2000 });
    report(c, dirty ? 'Saved locally — waiting for sync' : 'Saved');
    if (dirty) scheduleRetry(c);
    return copy(c.state);
}
export async function discardDraftAndReload() {
    await inspectConflict();
    return resolveConflict('cloud');
}
window.addEventListener('beforeunload', event => {
    // A persisted offline edit can safely outlive this tab.
    if (context?.dirty && !context.localSaved) { event.preventDefault(); event.returnValue = ''; }
});
function resumeSync() {
    if (context?.dirty) return flushNotebook();
}
// Network events are hints; only a failed server request proves unavailability.
window.addEventListener('offline', resumeSync);
window.addEventListener('online', resumeSync);
window.addEventListener('focus', resumeSync);
