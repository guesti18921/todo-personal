import { normalizeNotebook } from './localNotebook.js';
import { stable, combineNotebooks } from './syncModel.js';
export const BACKUP_LIMIT = 3;
export const BACKUP_BYTES = 8 * 1024 * 1024;
const prefix = owner => `todo-personal:recovery:${owner}:`;
export function recoveryHistory(storage, owner) {
    const names = Array.from({ length: storage.length || 0 }, (_, i) => storage.key(i));
    return names.filter(name => name?.startsWith(prefix(owner))).map(key => {
        const raw = storage.getItem(key) || ''; let value; try { value = JSON.parse(raw); } catch (_) {}
        return { key, createdAt: value?.createdAt || '', bytes: new TextEncoder().encode(raw).length };
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.key.localeCompare(a.key));
}
export function readRecovery(storage, owner, key) {
    if (!key?.startsWith(prefix(owner))) throw new Error('Резервная копия относится к другому аккаунту.');
    const raw = storage.getItem(key); if (!raw) throw new Error('Резервная копия больше недоступна.');
    return JSON.parse(raw);
}
export function removeRecovery(storage, owner, key) {
    readRecovery(storage, owner, key);
    storage.removeItem(key);
    const latest = `todo-personal:recovery-latest:${owner}`;
    if (storage.getItem(latest) === key) {
        const next = recoveryHistory(storage, owner)[0];
        if (next) storage.setItem(latest, next.key); else storage.removeItem(latest);
    }
}
export function preserveRecovery(storage, owner, local, cloud) {
    const history = recoveryHistory(storage, owner);
    for (const old of history) {
        try { const value = readRecovery(storage, owner, old.key); if (stable(value.local) === stable(local) && stable(value.cloud) === stable(cloud)) { storage.setItem(`todo-personal:recovery-latest:${owner}`, old.key); return old.key; } } catch (_) {}
    }
    if (history.length >= BACKUP_LIMIT) throw new Error('На устройстве уже есть три резервные копии. Сначала сохраните нужные копии в файл и удалите ненужную в разделе «История копий». Текущие записи не изменены.');
    const key = prefix(owner) + Date.now() + ':' + Math.random().toString(36).slice(2);
    const value = { format: 'todo-personal-recovery-v1', owner, createdAt: new Date().toISOString(), local, cloud };
    try { storage.setItem(key, JSON.stringify(value)); storage.setItem(`todo-personal:recovery-latest:${owner}`, key); }
    catch (_) { throw new Error('Не удалось сохранить резервную копию на устройстве. Освободите место; обе текущие копии оставлены без изменений.'); }
    return key;
}
function checkTree(data) {
    const stack = [[data, 0]]; let nodes = 0;
    while (stack.length) {
        const [value, depth] = stack.pop();
        if (++nodes > 250000 || depth > 20) throw new Error('Слишком сложная структура файла. Выберите обычную резервную копию.');
        if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
            if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Недопустимая структура файла резервной копии.');
            stack.push([child, depth + 1]);
        }
    }
}
function checkedState(value) {
    let state; try { state = normalizeNotebook(value); } catch (_) { throw new Error('Некорректный формат блокнота в файле.'); } const records = [...Object.values(state.todos).flat(), ...state.notes];
    if (records.length > 20000) throw new Error('В файле слишком много записей.');
    for (const entry of records) {
        for (const key of ['name', 'title', 'text', 'details', 'date', 'time']) if (entry[key] !== undefined && typeof entry[key] !== 'string') throw new Error('Некорректный формат записи в файле.');
        if (entry.id.length > 512) throw new Error('Некорректный идентификатор записи.');
        if (entry.date && (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date) || Number(entry.date.slice(0,4)) < 1000 || !Number.isFinite(Date.parse(entry.date + 'T12:00:00Z')) || new Date(entry.date + 'T12:00:00Z').toISOString().slice(0,10) !== entry.date)) throw new Error('Некорректная дата в файле.');
        if (entry.time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(entry.time)) throw new Error('Некорректное время в файле.');
        if (entry.checked !== undefined && typeof entry.checked !== 'boolean') throw new Error('Некорректный формат записи в файле.');
    }
    return state;
}
export function parseBackup(raw, owner) {
    if (typeof raw !== 'string' || new TextEncoder().encode(raw).length > BACKUP_BYTES) throw new Error('Файл слишком большой. Максимальный размер — 8 МБ.');
    let data; try { data = JSON.parse(raw); } catch (_) { throw new Error('Не удалось прочитать JSON. Выберите файл резервной копии TO-DO Personal.'); }
    checkTree(data);
    if (data?.owner !== undefined && typeof data.owner !== 'string') throw new Error('Некорректный формат аккаунта в файле.');
    if (data?.owner && data.owner !== owner) throw new Error('Резервная копия относится к другому аккаунту.');
    if (data?.format === 'todo-personal-recovery-v1') return { state: combineNotebooks(checkedState(data.local?.state), checkedState(data.cloud?.state)), hasOwner: Boolean(data.owner) };
    if (data?.format === 'todo-personal-backup-v1') return { state: checkedState(data.state), hasOwner: Boolean(data.owner) };
    if (data?.format) throw new Error('Этот формат резервной копии не поддерживается.');
    return { state: checkedState(data), hasOwner: false };
}
export function mergeImported(current, imported) {
    const records = state => [...Object.entries(state.todos).flatMap(([project, list]) => list.map(entry => ({ type: 'task', project, entry }))), ...state.notes.map(entry => ({ type: 'note', project: '', entry }))];
    const existing = records(current), byId = new Map(existing.map(record => [record.entry.id, record]));
    const core = record => {
        const { id, reminder, reminderAt, conflictCopy, ...entry } = record.entry;
        return stable({ type: record.type, project: record.project, entry });
    };
    const conflictCores = new Set(existing.filter(record => record.entry.conflictCopy).map(core));
    const filtered = normalizeNotebook(imported);
    const keep = (entry, type, project) => {
        const old = byId.get(entry.id), value = core({ entry, type, project });
        if (old && core(old) === value) return false;
        if (old && conflictCores.has(value)) return false;
        return true;
    };
    for (const project of Object.keys(filtered.todos)) filtered.todos[project] = filtered.todos[project].filter(entry => keep(entry, 'task', project));
    filtered.notes = filtered.notes.filter(entry => keep(entry, 'note', ''));
    const oldIds = new Set(byId.keys()), next = combineNotebooks(filtered, current);
    for (const entry of [...Object.values(next.todos).flat(), ...next.notes]) if (!oldIds.has(entry.id)) { entry.reminder = { mode: 'none', date: '', time: '' }; entry.reminderAt = null; }
    return next;
}
