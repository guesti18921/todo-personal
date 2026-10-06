const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

const json = value => JSON.parse(JSON.stringify(value));
const empty = () => ({ todos: { home: [], today: [], week: [] }, notes: [] });
function fixture(existing = new Map()) {
    const disk = existing;
    const listeners = new Map();
    const timers = new Map();
    let sequence = 0, failWrites = false, online = true, requests = 0, heldUpload, heldRead;
    const accounts = new Map();
    const storage = {
        getItem: key => disk.get(key) ?? null,
        setItem(key, value) { if (failWrites) throw new Error('Quota exceeded'); disk.set(key, value); },
        removeItem: key => disk.delete(key)
    };
    const cloud = {
        from() {
            const conditions = {};
            let update, inserted;
            const request = () => {
                requests++;
                if (!online) return { data: null, error: new Error('Network unavailable') };
                const row = accounts.get(conditions.user_id);
                if (update) {
                    if (!row || row.revision !== conditions.revision) return { data: [], error: null };
                    const next = { ...row, ...json(update) };
                    accounts.set(conditions.user_id, next);
                    return { data: [{ revision: next.revision }], error: null };
                }
                if (inserted) {
                    const next = { user_id: inserted.user_id, ...empty(), revision: 0 };
                    accounts.set(inserted.user_id, next);
                    return { data: next, error: null };
                }
                return { data: row ? json(row) : null, error: null };
            };
            const q = {
                select() { return this; },
                eq(key, value) { conditions[key] = value; return this; },
                update(value) { update = value; return this; },
                insert(value) { inserted = value; return this; },
                async maybeSingle() { return request(); },
                async single() { if (heldRead) { const gate = heldRead; heldRead = null; await gate; } return request(); },
                then(yes, no) {
                    if (update && heldUpload) {
                        const gate = heldUpload;
                        heldUpload = null;
                        return gate.then(request).then(yes, no);
                    }
                    return Promise.resolve(request()).then(yes, no);
                }
            };
            return q;
        }
    };
    const context = vm.createContext({
        console, crypto: webcrypto, localStorage: storage,
        setTimeout(fn, delay) { const id = ++sequence; timers.set(id, { fn, delay }); return id; },
        clearTimeout(id) { timers.delete(id); },
        window: { addEventListener(event, handler) { listeners.set(event, handler); } }
    });
    const modules = new Map();
    async function module(path) {
        if (modules.has(path)) return modules.get(path);
        const source = path.endsWith('supabaseClient.js') ? 'export const supabase = globalThis.testSupabase;' : readFileSync(path, 'utf8');
        const m = new vm.SourceTextModule(source, { context, identifier: path });
        modules.set(path, m);
        await m.link(specifier => module(resolve(path, '..', specifier)));
        return m;
    }
    context.testSupabase = cloud;
    return {
        disk, accounts, timers, listeners,
        set online(value) { online = value; },
        set failWrites(value) { failWrites = value; },
        get requests() { return requests; },
        holdNextRead() { let release; heldRead = new Promise(resolve => { release = resolve; }); return release; },
        holdNextUpload() {
            let release;
            heldUpload = new Promise(resolve => { release = resolve; });
            return release;
        },
        async load() {
            const store = await module(resolve(__dirname, '../src/notebookStore.js'));
            await store.evaluate();
            const local = modules.get(resolve(__dirname, '../src/localNotebook.js'));
            const mobile = await module(resolve(__dirname, '../src/mobileNotebook.js'));
            await mobile.evaluate();
            return { store: store.namespace, local: local.namespace, mobile: mobile.namespace };
        }
    };
}

test('legacy migration preserves multilingual content, projects and completion', async () => {
    const f = fixture(), { local } = await f.load();
    const state = { todos: { home: [{ name: 'Купить продукты', checked: true }], Arbeit: [{ name: 'Morgen einkaufen' }] }, notes: [{ title: '日本語 中文', text: 'Español: mañana; Italiano: domani; English: tomorrow 😀' }] };
    const migrated = local.normalizeNotebook(state);
    assert.equal(migrated.todos.home[0].checked, true);
    assert.equal(migrated.notes[0].text, state.notes[0].text);
    assert.ok(migrated.todos.Arbeit[0].id);
    assert.deepEqual(json(local.normalizeNotebook(state)), json(migrated));
    assert.deepEqual(json(local.normalizeNotebook(migrated)), json(migrated));
    assert.equal(state.notes[0].id, undefined);
});

test('new IDs are unique and duplicate legacy IDs are repaired', async () => {
    const { local } = await fixture().load();
    assert.notEqual(local.createEntryId(), local.createEntryId());
    const state = local.normalizeNotebook({ ...empty(), notes: [{ id: 'same', text: 'a' }, { id: 'same', text: 'a' }] });
    assert.notEqual(state.notes[0].id, state.notes[1].id);
});

test('cloud load and successful sync retain a full local snapshot', async () => {
    const f = fixture(), { store } = await f.load();
    f.accounts.set('a', { ...empty(), revision: 3, notes: [{ text: '日本語' }] });
    const state = await store.openNotebook('a');
    assert.ok(state.notes[0].id);
    assert.equal(await store.flushNotebook(), true);
    const cached = JSON.parse(f.disk.get('todo-personal:local:a'));
    assert.equal(cached.dirty, false);
    assert.equal(cached.revision, 4);
    assert.equal(cached.state.notes[0].text, '日本語');
    assert.equal(f.disk.has('todo-personal:draft:a'), false);
});

test('a new process opens a saved notebook offline without any cloud request', async () => {
    const first = fixture(), api = await first.load();
    first.accounts.set('a', { ...empty(), revision: 0 });
    await api.store.openNotebook('a');
    api.store.savePart('notes', [{ id: 'note-a', text: 'Deutsch 日本語 中文 Русский' }]);
    await api.store.flushNotebook();
    const second = fixture(first.disk), { store } = await second.load();
    second.online = false;
    const state = await store.openNotebook('a');
    assert.equal(state.notes[0].text, 'Deutsch 日本語 中文 Русский');
    assert.equal(second.requests, 0);
});

test('offline edits survive restart, retry automatically, and sync after reconnection', async () => {
    const f = fixture(), { store } = await f.load();
    f.accounts.set('a', { ...empty(), revision: 0 });
    await store.openNotebook('a');
    f.online = false;
    store.savePart('notes', [{ id: 'offline-note', text: 'mañana — завтра' }]);
    assert.equal(await store.flushNotebook(), false);
    assert.equal(JSON.parse(f.disk.get('todo-personal:local:a')).dirty, true);
    assert.ok([...f.timers.values()].some(timer => timer.delay >= 2000));
    const second = fixture(f.disk), api = await second.load();
    second.online = false;
    second.accounts.set('a', f.accounts.get('a'));
    assert.equal((await api.store.openNotebook('a')).notes[0].text, 'mañana — завтра');
    second.online = true;
    await api.store.flushNotebook();
    assert.equal(second.accounts.get('a').notes[0].text, 'mañana — завтра');
    assert.equal(api.store.hasPendingChanges(), false);
});

test('snapshots are isolated between accounts', async () => {
    const f = fixture(), { store } = await f.load();
    f.accounts.set('a', { ...empty(), revision: 0, notes: [{ id: 'a-note', text: 'private a' }] });
    f.accounts.set('b', { ...empty(), revision: 0, notes: [{ id: 'b-note', text: 'private b' }] });
    await store.openNotebook('a');
    assert.equal((await store.openNotebook('b')).notes[0].text, 'private b');
    f.online = false;
    assert.equal((await store.openNotebook('a')).notes[0].text, 'private a');
});

test('old unsaved drafts migrate before network access and are retained if storage fails', async () => {
    for (const failure of [false, true]) {
        const f = fixture(), { store } = await f.load();
        f.disk.set('todo-personal:draft:a', JSON.stringify({ state: { ...empty(), notes: [{ text: 'Entwurf' }] }, revision: 2 }));
        f.online = false;
        f.failWrites = failure;
        assert.equal((await store.openNotebook('a')).notes[0].text, 'Entwurf');
        assert.equal(f.requests, 0);
        assert.equal(f.disk.has('todo-personal:draft:a'), failure);
    }
});

test('a concurrent cloud edit stops upload without overwriting either version', async () => {
    const f = fixture(), { store } = await f.load();
    f.accounts.set('a', { ...empty(), revision: 1 });
    await store.openNotebook('a');
    store.savePart('notes', [{ id: 'local', text: 'local text' }]);
    f.accounts.set('a', { ...empty(), revision: 2, notes: [{ id: 'remote', text: 'remote text' }] });
    assert.equal(await store.flushNotebook(), false);
    assert.equal(store.getDraft().notes[0].text, 'local text');
    assert.equal(f.accounts.get('a').notes[0].text, 'remote text');
    assert.equal(JSON.parse(f.disk.get('todo-personal:local:a')).state.notes[0].text, 'local text');
});

test('storage failure never reports a local save as successful', async () => {
    const f = fixture(), { store } = await f.load(), messages = [];
    store.onSaveStatus(message => messages.push(message));
    f.accounts.set('a', { ...empty(), revision: 0 });
    await store.openNotebook('a');
    f.failWrites = true;
    f.online = false;
    store.savePart('notes', [{ id: 'n', text: 'keep me' }]);
    await store.flushNotebook();
    assert.match(messages.at(-1), /Not saved/);
    assert.equal(store.getDraft().notes[0].text, 'keep me');
});

test('corrupted and future-schema snapshots are retained, not overwritten', async () => {
    for (const raw of ['invalid json', JSON.stringify({ schemaVersion: 99, state: empty(), revision: 0, dirty: false })]) {
        const f = fixture(), { store } = await f.load();
        f.disk.set('todo-personal:local:a', raw);
        await assert.rejects(store.openNotebook('a'));
        assert.equal(f.disk.get('todo-personal:local:a'), raw);
        assert.equal(f.requests, 0);
    }
});

test('a refreshed cloud snapshot remains available after offline restart', async () => {
    const f = fixture(), { store } = await f.load();
    f.accounts.set('a', { ...empty(), revision: 0 });
    await store.openNotebook('a');
    f.accounts.set('a', { ...empty(), revision: 1, notes: [{ id: 'remote', text: '新しいメモ' }] });
    const state = await store.readCloudChanges();
    assert.equal(state.notes[0].text, '新しいメモ');
    const second = fixture(f.disk), api = await second.load();
    second.online = false;
    assert.equal((await api.store.openNotebook('a')).notes[0].text, '新しいメモ');
});

test('an in-flight upload from a closed notebook cannot overwrite newer local edits', async () => {
    const f = fixture(), { store } = await f.load();
    f.accounts.set('a', { ...empty(), revision: 0 });
    await store.openNotebook('a');
    store.savePart('notes', [{ id: 'n', text: 'first edit' }]);
    const release = f.holdNextUpload();
    const upload = store.flushNotebook();
    await Promise.resolve();
    await Promise.resolve();
    await store.openNotebook('a');
    store.savePart('notes', [{ id: 'n', text: 'newer edit' }]);
    release();
    assert.equal(await upload, false);
    assert.equal(JSON.parse(f.disk.get('todo-personal:local:a')).state.notes[0].text, 'newer edit');
    assert.equal(store.getDraft().notes[0].text, 'newer edit');
});

test('closing safely saved offline edits is allowed; failed local saves warn', async () => {
    const f = fixture(), { store } = await f.load();
    f.accounts.set('a', { ...empty(), revision: 0 });
    await store.openNotebook('a');
    store.savePart('notes', [{ id: 'n', text: 'safe offline edit' }]);
    let prevented = false;
    f.listeners.get('beforeunload')({ preventDefault() { prevented = true; } });
    assert.equal(prevented, false);
    f.failWrites = true;
    store.savePart('notes', [{ id: 'n', text: 'memory only edit' }]);
    f.listeners.get('beforeunload')({ preventDefault() { prevented = true; } });
    assert.equal(prevented, true);
});

test('Today filters overdue, timed and manually pinned records without pulling in every note', async () => {
    const { mobile } = await fixture().load();
    const state = { todos: { home: [
        { id: 'late', name: 'late', date: '2026-10-05' },
        { id: 'today-late', name: 'later', date: '2026-10-06', time: '18:00' },
        { id: 'today-early', name: 'earlier', date: '2026-10-06', time: '09:00' },
        { id: 'finished', date: '2026-10-05', checked: true },
        { id: 'future', date: '2026-10-07' }
    ], today: [{ id: 'legacy-pin', name: 'old today folder' }], week: [] }, notes: [{ id: 'plain', text: 'plain note' }, { id: 'pinned', text: 'pinned note', today: true }] };
    const groups = mobile.todayGroups(mobile.listEntries(state.todos, state.notes), '2026-10-06');
    assert.deepEqual(json(groups.overdue.map(record => record.entry.id)), ['late']);
    assert.deepEqual(json(groups.today.map(record => record.entry.id)), ['today-early', 'today-late']);
    assert.deepEqual(json(groups.pinned.map(record => record.entry.id)), ['legacy-pin', 'pinned']);
});

test('editing and moving a record between note/task preserves its ID, text and project peers', async () => {
    const { mobile } = await fixture().load();
    const state = { ...empty(), notes: [{ id: 'note', title: '日本語', text: '中文' }] };
    const id = mobile.saveEntry(state.todos, state.notes, { type: 'task', text: '日本語', details: '中文', date: '', today: true }, mobile.listEntries(state.todos, state.notes)[0]);
    assert.equal(id, 'note');
    assert.equal(state.notes.length, 0);
    assert.equal(state.todos.home[0].details, '中文');
    assert.equal(state.todos.home[0].date, '');
    mobile.saveEntry(state.todos, state.notes, { type: 'note', text: 'Deutsch', details: 'Español', date: '' }, mobile.listEntries(state.todos, state.notes)[0]);
    assert.equal(state.todos.home.length, 0);
    assert.equal(state.notes[0].id, 'note');
    assert.equal(state.notes[0].text, 'Español');
});

test('completing and restoring tasks keeps the original deadline and disables reminders', async () => {
    const { mobile } = await fixture().load();
    const record = { type: 'task', entry: { id: 'task', date: '2026-10-05', checked: false, reminderAt: '2026-10-05T09:00:00Z' } };
    mobile.toggleEntry(record);
    assert.equal(record.entry.checked, true);
    assert.ok(record.entry.completedAt);
    assert.equal(record.entry.reminderAt, null);
    mobile.toggleEntry(record);
    assert.equal(record.entry.checked, false);
    assert.equal(record.entry.date, '2026-10-05');
    assert.equal(record.entry.reminderAt, null);
});

test('sync details expose local save, confirmed cloud time and offline waiting without losing edits', async () => {
 const f = fixture(), { store } = await f.load(); f.accounts.set('a', { user_id: 'a', ...empty(), revision: 0 });
 await store.openNotebook('a'); assert.equal(store.getSyncDetails().phase, 'synced'); assert.ok(store.getSyncDetails().syncedAt);
 f.online = false; store.savePart('notes', [{ id: 'n', title: 'Deutsch 日本語' }]);
 assert.equal(store.getSyncDetails().localSaved, true); assert.equal(store.getSyncDetails().dirty, true);
 await store.flushNotebook(); assert.equal(store.getSyncDetails().phase, 'offline');
 assert.equal(store.getSyncDetails().counts.notes, 1);
 f.online = true; await store.flushNotebook(); assert.equal(store.getSyncDetails().phase, 'synced'); assert.equal(store.getSyncDetails().dirty, false);
 assert.equal(f.accounts.get('a').notes[0].title, 'Deutsch 日本語');
});

test('conflict comparison and keep-both preserve both versions, backups, deletions and restart-safe resolution', async () => {
 const f = fixture(), { store } = await f.load();
 f.accounts.set('a', { user_id: 'a', ...empty(), notes: [{ id: 'same', title: 'Первоначальная', reminder: { mode: 'custom', date: '2099-01-01', time: '12:00' } }], revision: 0 });
 await store.openNotebook('a'); const mine = store.getDraft(); mine.notes[0].title = 'Моя версия 中文'; store.savePart('notes', mine.notes);
 f.accounts.set('a', { user_id: 'a', ...empty(), notes: [{ ...mine.notes[0], title: 'Версия в аккаунте' }, { id: 'cloud-only', title: 'Только в аккаунте' }], revision: 1 });
 await store.flushNotebook(); assert.equal(store.getSyncDetails().conflict, true);
 const preview = await store.inspectConflict(); assert.equal(preview.differences.length, 2);
 const result = await store.resolveConflict('both'); assert.equal(result.notes.length, 3);
 assert.equal(result.notes.find(n => n.id === 'same').title, 'Версия в аккаунте');
 const duplicate = result.notes.find(n => n.conflictCopy); assert.equal(duplicate.title, 'Моя версия 中文'); assert.equal(duplicate.reminder.mode, 'none');
 assert.equal(store.getRecoveryCopy().local.state.notes[0].title, 'Моя версия 中文'); assert.equal(store.getRecoveryCopy().cloud.state.notes.length, 2);
 assert.equal(JSON.parse(f.disk.get('todo-personal:local:a')).conflict, false);
 await store.flushNotebook(); assert.equal(f.accounts.get('a').notes.length, 3); assert.equal(store.getSyncDetails().phase, 'synced');
 store.closeNotebook(); const restarted = await fixture(f.disk).load(); await restarted.store.openNotebook('a'); assert.equal(restarted.store.getSyncDetails().conflict, false);
});

test('replacing with cloud requires a successful backup and refuses stale comparison or changed cloud', async () => {
 const f = fixture(), { store } = await f.load(); f.accounts.set('a', { user_id: 'a', ...empty(), revision: 0 });
 await store.openNotebook('a'); store.savePart('notes', [{ id: 'mine', title: 'Не потерять' }]);
 f.accounts.set('a', { user_id: 'a', ...empty(), notes: [{ id: 'cloud', title: 'Из аккаунта' }], revision: 1 }); await store.flushNotebook();
 await store.inspectConflict(); f.failWrites = true;
 await assert.rejects(store.resolveConflict('cloud'), /резервную копию/); assert.equal(store.getDraft().notes[0].title, 'Не потерять');
 f.failWrites = false; f.accounts.get('a').revision = 2;
 await assert.rejects(store.resolveConflict('cloud'), /обновилась/); assert.equal(store.getDraft().notes[0].title, 'Не потерять');
 await store.inspectConflict(); store.savePart('notes', [{ id: 'mine', title: 'Правка после сравнения' }]);
 await assert.rejects(store.resolveConflict('cloud'), /изменились/);
 await store.inspectConflict(); const result = await store.resolveConflict('cloud'); assert.equal(result.notes[0].title, 'Из аккаунта');
 assert.equal(store.getRecoveryCopy().local.state.notes[0].title, 'Правка после сравнения'); assert.equal(store.getSyncDetails().conflict, false);
});

test('an unresolved conflict survives offline restart and does not resume uploads automatically', async () => {
 const f = fixture(), { store } = await f.load(); f.accounts.set('a', { user_id: 'a', ...empty(), revision: 0 });
 await store.openNotebook('a'); store.savePart('notes', [{ id: 'mine', title: 'Офлайн' }]); f.accounts.get('a').revision = 1; await store.flushNotebook(); store.closeNotebook();
 const next = fixture(f.disk); next.online = false; const restarted = await next.load(); await restarted.store.openNotebook('a');
 assert.equal(restarted.store.getSyncDetails().conflict, true); await restarted.store.flushNotebook(); assert.equal(next.requests, 0);
});

test('edits made during a cloud replacement request cannot be discarded by its delayed response', async () => {
 const f = fixture(), { store } = await f.load(); f.accounts.set('a', { user_id: 'a', ...empty(), revision: 0 });
 await store.openNotebook('a'); store.savePart('notes', [{ id: 'mine', title: 'Первая версия' }]);
 f.accounts.get('a').revision = 1; await store.flushNotebook(); await store.inspectConflict();
 const release = f.holdNextRead(), replacement = store.resolveConflict('cloud');
 store.savePart('notes', [{ id: 'mine', title: 'Правка во время запроса' }]); release();
 await assert.rejects(replacement, /обновилась/); assert.equal(store.getDraft().notes[0].title, 'Правка во время запроса'); assert.equal(store.getRecoveryCopy(), null);
});

test('a mixed task/note batch is persisted as one snapshot and failed storage leaves the previous disk copy intact', async () => {
 const writes = [], disk = new Map();
 const set = disk.set.bind(disk);
 disk.set = (key, value) => { if (key === 'todo-personal:local:a') writes.push(JSON.parse(value)); return set(key, value); };
 const f = fixture(disk), { store } = await f.load(); f.accounts.set('a', { ...empty(), revision: 0 });
 await store.openNotebook('a'); f.online = false; writes.length = 0;
 const next = { todos: { home: [{ id: 'task-a', name: 'Deutsch', date: '2026-10-07' }], today: [], week: [] }, notes: [{ id: 'note-a', title: '日本語', date: '2026-10-07' }] };
 assert.equal(store.saveNotebook(next), true); assert.equal(writes.length, 1);
 assert.equal(writes[0].state.todos.home[0].date, writes[0].state.notes[0].date);
 const safe = disk.get('todo-personal:local:a'); f.failWrites = true;
 assert.equal(store.saveNotebook({ ...next, notes: [{ id: 'note-a', title: 'changed' }] }), false);
 assert.equal(disk.get('todo-personal:local:a'), safe);
 // The caller can revert a rejected batch and retry the original snapshot.
 store.saveNotebook(next); f.failWrites = false; assert.equal(store.saveNotebook(next), true);
 assert.deepEqual(json(store.getDraft()), next);
});
