const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');
const json = v => JSON.parse(JSON.stringify(v));
async function fixture() {
    const context = vm.createContext({ crypto: webcrypto }), modules = new Map();
    async function load(file) {
        if (modules.has(file)) return modules.get(file);
        const m = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file }); modules.set(file, m);
        await m.link(name => load(path.resolve(path.dirname(file), name))); return m;
    }
    const m = await load(path.resolve('src/listActions.js')); await m.evaluate(); return m.namespace;
}
const now = new Date(2026, 9, 6, 12, 0);
const task = (id, date = '', extra = {}) => ({ type: 'task', project: 'home', entry: { id, name: id, date, time: '', checked: false, ...extra } });
const note = (id, date = '', extra = {}) => ({ type: 'note', project: null, entry: { id, title: id, date, time: '', checked: false, ...extra } });
test('date filters combine with type/search and exclude completed entries', async () => {
    const { browseEntries } = await fixture();
    const records = [task('overdue', '2026-10-05'), task('today', '2026-10-06'), note('tomorrow', '2026-10-07'), task('no-date'), task('done', '2026-10-07', { checked: true })];
    for (const [due, id] of [['overdue', 'overdue'], ['today', 'today'], ['tomorrow', 'tomorrow'], ['none', 'no-date']]) assert.deepEqual(json(browseEntries(records, { due, now })).map(r => r.entry.id), [id]);
    assert.equal(browseEntries(records, { due: 'tomorrow', filter: 'task', now }).length, 0);
    assert.deepEqual(json(browseEntries(records, { view: 'done', now })).map(r => r.entry.id), ['done']);
    assert.deepEqual(json(browseEntries(records, { view: 'today', now })).map(r => r.entry.id), ['overdue', 'today']);
});
test('Unicode search handles composed accents and ordering keeps undated records after year 9999', async () => {
    const { browseEntries } = await fixture();
    const records = [task('n', '', { name: '日本語', updatedAt: '2026-10-06T11:00:00Z' }), task('f', '9999-12-31', { name: 'Cafe\u0301 中文', updatedAt: '2026-10-05T11:00:00Z' })];
    assert.equal(browseEntries(records, { query: ' CAFÉ ', now })[0].entry.id, 'f');
    assert.equal(browseEntries(records, { query: '日本語', now })[0].entry.id, 'n');
    assert.deepEqual(json(browseEntries(records, { now })).map(r => r.entry.id), ['f', 'n']);
    assert.deepEqual(json(browseEntries(records, { sort: 'updated', now })).map(r => r.entry.id), ['n', 'f']);
    assert.equal(records[0].entry.id, 'n', 'sorting never mutates the caller array');
});
test('completion changes selected tasks only, cancels reminders, and exact undo restores all fields', async () => {
    const { prepareListAction, applyListChanges } = await fixture();
    const records = [task('a', '2026-10-07', { reminder: { mode: 'at', date: '', time: '' } }), note('n'), task('b')], before = json(records);
    const changes = prepareListAction(records, ['a', 'n'], 'complete', now); assert.equal(changes.length, 1);
    assert.equal(applyListChanges(records, changes), true); assert.equal(records[0].entry.checked, true);
    assert.equal(records[0].entry.reminder.mode, 'none'); assert.equal(records[1].entry.checked, false); assert.equal(records[2].entry.checked, false);
    assert.equal(applyListChanges(records, changes, true), true); assert.deepEqual(json(records), before);
    applyListChanges(records, changes); const restore = prepareListAction(records, ['a'], 'restore', now);
    applyListChanges(records, restore); assert.equal(records[0].entry.checked, false); assert.equal(records[0].entry.reminder.mode, 'none');
});
test('tomorrow preserves text/time and custom reminders, moves relative reminders, skips already-tomorrow and completed records', async () => {
    const { prepareListAction, applyListChanges } = await fixture();
    const records = [task('a', '2026-10-06', { name: 'сегодня в 18:00 позвонить', time: '18:00', today: true, reminder: { mode: 'at' }, deadlineAnchor: { text: 'сегодня в 18:00 позвонить', at: now.toISOString() } }), note('n', '', { title: '中文 日本語', reminder: { mode: 'custom', date: '2026-11-01', time: '09:30' } }), task('b', '2026-10-07'), task('done', '', { checked: true })];
    const before = json(records), changes = prepareListAction(records, records.map(r => r.entry.id), 'tomorrow', now);
    assert.equal(changes.length, 2); applyListChanges(records, changes);
    assert.equal(records[0].entry.date, '2026-10-07'); assert.equal(records[0].entry.time, '18:00'); assert.equal(records[0].entry.reminder.mode, 'at');
    assert.equal(records[0].entry.name, before[0].entry.name); assert.equal(records[0].entry.today, false); assert.equal(records[0].entry.deadlineDismissed, '2026-10-06|18:00');
    assert.deepEqual(json(records[1].entry.reminder), before[1].entry.reminder); assert.deepEqual(records[3], before[3]);
    applyListChanges(records, changes, true); assert.deepEqual(json(records), before);
});
test('undo refuses newer edits, deletions or type changes without partially reverting any batch', async () => {
    const { prepareListAction, applyListChanges } = await fixture();
    for (const mutate of [r => r[1].entry.name = 'new edit', r => r.pop(), r => r[1].type = 'note']) {
        const records = [task('a'), task('b')], changes = prepareListAction(records, ['a', 'b'], 'complete', now);
        applyListChanges(records, changes); mutate(records); const beforeUndo = json(records);
        assert.equal(applyListChanges(records, changes, true), false); assert.deepEqual(json(records), beforeUndo);
    }
});


test('chronological browsing keeps pins first and unknown dates last in either direction', async () => {
 const { browseEntries } = await fixture();
 const entries = [note('new', '', { createdAt: '2026-10-09T12:00:00Z', updatedAt: '2026-10-10T12:00:00Z' }), note('old', '', { createdAt: '2026-10-01T12:00:00Z', updatedAt: '2026-10-11T12:00:00Z' }), note('unknown'), note('pin', '', { pinned: true, createdAt: '2026-10-05T12:00:00Z' })];
 assert.deepEqual(json(browseEntries(entries, { sort: 'oldest' })).map(r => r.entry.id), ['pin', 'old', 'new', 'unknown']);
 assert.deepEqual(json(browseEntries(entries, { sort: 'newest' })).map(r => r.entry.id), ['pin', 'new', 'old', 'unknown']);
});
test('batch removal restores exact order and refuses newer records without partial deletion', async () => {
 const { prepareRemoval, applyRemoval } = await fixture();
 const state = { todos: { home: [task('a').entry, task('b').entry, task('c').entry] }, notes: [note('n').entry] }, original = json(state);
 const removal = prepareRemoval(state, ['a', 'c', 'n']);
 assert.equal(applyRemoval(state, removal), true);
 assert.deepEqual(state.todos.home.map(e => e.id), ['b']);
 assert.equal(state.notes.length, 0);
 assert.equal(applyRemoval(state, removal, true), true);
 assert.deepEqual(json(state), original);
 state.notes[0].title = 'Changed';
 assert.equal(applyRemoval(state, removal), false);
 assert.equal(state.todos.home.length, 3);
});
