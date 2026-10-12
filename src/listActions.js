import { dateValue, reminderMoment } from './reminderModel.js';
import { suggestDeadline } from './deadlineParser.js';
import { stable } from './syncModel.js';

export function entryTimestamp(entry) {
    const value = Date.parse(entry.createdAt || entry.updatedAt || '');
    return Number.isFinite(value) ? value : null;
}

export function browseEntries(records, { view = 'all', filter = 'all', due = 'all', query = '', sort = 'deadline', now = new Date() } = {}) {
    const day = dateValue(now), tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    const search = query.trim().normalize('NFC').toLocaleLowerCase();
    const found = records.filter(({ entry: e, type, project }) => {
        if (view === 'done' ? type !== 'task' || !e.checked : e.checked) return false;
        if (view === 'today' && !(e.date && e.date <= day) && !(!e.date && (e.today || (e.today === undefined && project === 'today')))) return false;
        if (view === 'all') {
            if (filter !== 'all' && (filter === 'reminder' ? !reminderMoment(e) : type !== filter)) return false;
            if (due === 'overdue' && !(e.date && e.date < day)) return false;
            if (due === 'today' && e.date !== day) return false;
            if (due === 'tomorrow' && e.date !== dateValue(tomorrow)) return false;
            if (due === 'none' && e.date) return false;
        }
        return [e.name, e.title, e.details, e.text].some(text => String(text || '').normalize('NFC').toLocaleLowerCase().includes(search));
    });
    return found.sort((a, b) => {
        if (Boolean(a.entry.pinned) !== Boolean(b.entry.pinned)) return a.entry.pinned ? -1 : 1;
        if (view === 'all' && ['oldest', 'newest'].includes(sort)) {
            const left = entryTimestamp(a.entry), right = entryTimestamp(b.entry);
            if (left === null || right === null) return left === right ? a.entry.id.localeCompare(b.entry.id) : left === null ? 1 : -1;
            return (sort === 'newest' ? right - left : left - right) || a.entry.id.localeCompare(b.entry.id);
        }
        if (view === 'done') return String(b.entry.completedAt || '').localeCompare(String(a.entry.completedAt || '')) || a.entry.id.localeCompare(b.entry.id);
        if (sort === 'updated') return String(b.entry.updatedAt || '').localeCompare(String(a.entry.updatedAt || '')) || a.entry.id.localeCompare(b.entry.id);
        if (Boolean(a.entry.date) !== Boolean(b.entry.date)) return a.entry.date ? -1 : 1;
        return (a.entry.date || '').localeCompare(b.entry.date || '') || (a.entry.time || '99:99').localeCompare(b.entry.time || '99:99') || String(b.entry.updatedAt || '').localeCompare(String(a.entry.updatedAt || '')) || a.entry.id.localeCompare(b.entry.id);
    });
}

// Prepare the whole batch before changing any record. Undo compares full content
// so a later edit/remote replacement cannot silently be overwritten.
export function prepareListAction(records, ids, action, now = new Date()) {
    if (!['complete', 'restore', 'tomorrow'].includes(action)) throw Error('Unknown list action');
    const selected = new Set(ids), tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    return records.filter(r => selected.has(r.entry.id)).flatMap(record => {
        const before = JSON.parse(JSON.stringify(record.entry)), after = JSON.parse(JSON.stringify(before));
        if (action === 'tomorrow') {
            if (after.checked || after.date === dateValue(tomorrow)) return [];
            after.date = dateValue(tomorrow); after.today = false; after.reminderAt = null;
            // Keep custom reminders independent; relative reminder modes follow the deadline.
            const text = record.type === 'task' ? after.name : after.title || after.text;
            const at = new Date(after.deadlineAnchor?.at || now);
            const suggestion = suggestDeadline(text, Number.isNaN(at.getTime()) ? now : at);
            if (suggestion) after.deadlineDismissed = `${suggestion.date}|${suggestion.time}`;
        } else {
            if (record.type !== 'task' || Boolean(after.checked) === (action === 'complete')) return [];
            after.checked = action === 'complete';
            after.completedAt = after.checked ? now.toISOString() : null;
            after.reminder = { mode: 'none', date: '', time: '' }; after.reminderAt = null;
        }
        after.updatedAt = now.toISOString();
        return [{ id: after.id, type: record.type, project: record.project, before, after }];
    });
}
export function applyListChanges(records, changes, undo = false) {
    const byId = new Map(records.map(r => [r.entry.id, r]));
    const pairs = changes.map(change => ({ change, record: byId.get(change.id) }));
    if (pairs.some(({ record, change }) => !record || record.type !== change.type || record.project !== change.project || stable(record.entry) !== stable(undo ? change.after : change.before))) return false;
    for (const { record, change } of pairs) {
        for (const key of Object.keys(record.entry)) delete record.entry[key];
        Object.assign(record.entry, JSON.parse(JSON.stringify(undo ? change.before : change.after)));
    }
    return true;
}


export function prepareRemoval(state, ids) {
    const selected = new Set(ids);
    const lists = [...Object.entries(state.todos).map(([project, list]) => ({ type: 'task', project, list })), { type: 'note', project: null, list: state.notes }];
    return lists.flatMap(({ type, project, list }) => list.flatMap((entry, index) => selected.has(entry.id) ? [{ type, project, index, entry: JSON.parse(JSON.stringify(entry)) }] : []));
}
export function applyRemoval(state, changes, restore = false) {
    const current = prepareRemoval(state, changes.map(c => c.entry.id));
    if (restore ? current.length !== 0 : current.length !== changes.length || changes.some(c => !current.some(r => r.type === c.type && r.project === c.project && stable(r.entry) === stable(c.entry)))) return false;
    if (changes.some(c => !Array.isArray(c.type === 'note' ? state.notes : state.todos[c.project]))) return false;
    for (const c of [...changes].sort((a, b) => a.index - b.index)) {
        const list = c.type === 'note' ? state.notes : state.todos[c.project];
        if (restore) list.splice(Math.min(c.index, list.length), 0, JSON.parse(JSON.stringify(c.entry)));
        else list.splice(list.findIndex(e => e.id === c.entry.id), 1);
    }
    return true;
}
