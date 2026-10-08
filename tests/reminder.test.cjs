const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
async function modules() {
 const context = vm.createContext({ Date, Intl, Map, Set, Promise, String, Number, Math, Boolean, JSON });
 const model = new vm.SourceTextModule(fs.readFileSync('src/reminderModel.js', 'utf8'), { context });
 await model.link(() => {}); await model.evaluate();
 const engine = new vm.SourceTextModule(fs.readFileSync('src/reminderEngine.js', 'utf8'), { context });
 await engine.link(() => model); await engine.evaluate();
 return { ...model.namespace, ...engine.namespace };
}
const now = new Date(2026, 9, 6, 17, 30);
test('native alarm metadata preserves local calendar time and upgrades pending legacy alarms', async () => {
 const m = await modules(), p = plugin(), disk = storage();
 const item = entry();
 const planned = m.notificationPlan([{ entry: item, type: 'task' }], 'a', now)[0];
 assert.equal(planned.extra.wallTime, '2026-10-07T17:45:00');
 assert.equal(planned.extra.at, planned.schedule.at.toISOString());
 disk.setItem('todo-personal:reminders-enabled:a', 'true');
 const engine = m.createReminderEngine({ native: true, plugin: p, storage: disk,
  getRecords: () => [{ entry: item, type: 'task' }], onDue() {}, onStatus() {}, now: () => now });
 await engine.setAccount('a');
 delete p.pending[0].extra.wallTime;
 const count = p.calls.filter(x => x === 'schedule').length;
 await engine.refresh();
 assert.equal(p.pending.length, 1);
 assert.equal(p.pending[0].extra.wallTime, '2026-10-07T17:45:00');
 assert.equal(p.calls.filter(x => x === 'schedule').length, count + 1);
 await engine.refresh();
 assert.equal(p.calls.filter(x => x === 'schedule').length, count + 1, 'subsequent refresh does not duplicate migrated alarm');
});
const entry = () => ({ id: 'one', name: 'Позвонить 😀', date: '2026-10-07', time: '18:00', reminder: { mode: '15' } });
function storage() { const values = new Map(); return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }; }
function plugin() {
 let pending = [], calls = [], permission = 'granted';
 return {
  calls, get pending() { return pending; }, set permission(value) { permission = value; },
  async requestPermissions() { calls.push('request'); return { display: permission }; },
  async checkPermissions() { return { display: permission }; },
  async checkExactNotificationSetting() { return { exact_alarm: 'denied' }; },
  async createChannel() {}, async listChannels() { return { channels: [{ id: 'todo-reminders', importance: 4 }] }; }, async getPending() { return { notifications: pending }; },
  async getDeliveredNotifications() { return { notifications: [] }; },
  async removeAllDeliveredNotifications() {}, async removeDeliveredNotifications() {},
  async cancelAll() { calls.push('cancelAll'); pending = []; },
  async cancel({ notifications }) { calls.push('cancel'); pending = pending.filter(item => !notifications.some(n => n.id === item.id)); },
  async schedule({ notifications }) { calls.push('schedule'); pending.push(...notifications); }
 };
}
test('loading or unsaved notebook retains own alarms and delivered reminders, even across their due time', async () => {
 const m = await modules(), p = plugin(), disk = storage();
 const records = [{ entry: entry(), type: 'task' }]; let ready = true, clock = now, delivered = [], removed = [];
 p.getDeliveredNotifications = async () => ({ notifications: delivered });
 p.removeDeliveredNotifications = async ({ notifications }) => { removed.push(...notifications); };
 disk.setItem('todo-personal:reminders-enabled:a', 'true');
 const engine = m.createReminderEngine({ native: true, plugin: p, storage: disk,
  getRecords: () => ready ? records : [], isRecordsReady: () => ready,
  onDue() {}, onStatus() {}, now: () => clock });
 await engine.setAccount('a'); assert.equal(p.pending.length, 1);
 const alarm = p.pending[0]; delivered = [alarm];
 ready = false; await engine.setAccount('a'); await engine.refresh();
 assert.equal(p.pending.length, 1); assert.equal(removed.length, 0);
 clock = new Date(2026, 9, 7, 17, 46); await engine.refresh();
 ready = true; await engine.refresh();
 assert.equal(p.pending.length, 1, 'overdue inexact alarm must remain scheduled');
 assert.equal(removed.length, 0, 'valid delivered reminder must remain visible');
 records.length = 0; await engine.refresh();
 assert.equal(p.pending.length, 0, 'a loaded empty notebook must cancel deleted reminders');
 assert.equal(removed.length, 1);
});
test('loading notebook still removes reminders belonging to a previous account and respects disabling', async () => {
 const m = await modules(), p = plugin(), disk = storage(); let ready = true, delivered = [], removed = [];
 disk.setItem('todo-personal:reminders-enabled:a', 'true');
 disk.setItem('todo-personal:reminders-enabled:b', 'true');
 p.getDeliveredNotifications = async () => ({ notifications: delivered });
 p.removeDeliveredNotifications = async ({ notifications }) => { removed.push(...notifications); };
 const engine = m.createReminderEngine({ native: true, plugin: p, storage: disk,
  getRecords: () => ready ? [{ entry: entry(), type: 'task' }] : [], isRecordsReady: () => ready,
  onDue() {}, onStatus() {}, now: () => now });
 await engine.setAccount('a'); delivered = [p.pending[0]];
 ready = false; await engine.setAccount('b');
 assert.equal(p.pending.length, 0); assert.equal(removed.length, 1);
 ready = true; await engine.refresh(); assert.equal(p.pending.length, 1);
 ready = false; await engine.configure(false); assert.equal(p.pending.length, 0);
});
test('granted app permission never reports success for a blocked notification channel, and unblocking restores scheduling', async () => {
 const m = await modules(), p = plugin(), disk = storage(); let importance = 0, state;
 p.listChannels = async () => ({ channels: [{ id: 'todo-reminders', importance }] });
 const engine = m.createReminderEngine({ native: true, plugin: p, storage: disk,
  getRecords: () => [{ entry: entry(), type: 'task' }], onDue() {}, onStatus: value => { state = value; }, now: () => now });
 await engine.setAccount('a'); await engine.configure(true);
 assert.equal(state.permission, 'granted'); assert.match(state.error, /Android отключил канал/);
 assert.equal(state.scheduled, 0); assert.equal(p.pending.length, 0);
 importance = 4; await engine.refresh();
 assert.equal(state.error, ''); assert.equal(state.scheduled, 1); assert.equal(p.pending.length, 1);
 p.listChannels = async () => ({ channels: [] }); await engine.refresh();
 assert.match(state.error, /Не удалось создать канал/);
 assert.equal(p.pending.length, 1, 'a failed channel check must not destroy an existing alarm');
});
test('reminder timing, invalid input, snooze and account-specific stable IDs', async () => {
 const m = await modules(); const item = entry();
 assert.equal(m.reminderMoment(item).getHours(), 17); assert.equal(m.reminderMoment(item).getMinutes(), 45);
 item.reminder.mode = 'day'; assert.equal(m.reminderMoment(item).getDate(), 6);
 item.reminder.mode = '60'; assert.equal(m.reminderMoment(item).getHours(), 17);
 item.reminder.mode = 'at'; item.time = ''; assert.equal(m.reminderMoment(item).getHours(), 9);
 item.reminder = { mode: 'custom', date: '2026-02-31', time: '10:00' }; assert.equal(m.reminderMoment(item), null);
 item.reminder = { mode: 'custom', date: '2026-10-06', time: '24:00' }; assert.equal(m.reminderMoment(item), null);
 m.snoozeReminder(item, now); assert.equal(item.date, '2026-10-07'); assert.equal(item.time, ''); assert.equal(item.reminder.time, '17:40');
 const records = [{ entry: item, type: 'task' }]; const a = m.notificationPlan(records, 'a', now)[0];
 assert.ok(a.id > 0 && a.id < 2147483647); assert.equal(a.id, m.notificationPlan(records, 'a', now)[0].id);
 assert.notEqual(a.id, m.notificationPlan(records, 'b', now)[0].id);
 item.checked = true; assert.equal(m.notificationPlan(records, 'a', now).length, 0);
});
test('native schedule requires explicit permission, reconciles edits and cancels completed/deleted/off/account changes', async () => {
 const m = await modules(), p = plugin(), disk = storage(); let records = [{ entry: entry(), type: 'task' }], state;
 const engine = m.createReminderEngine({ native: true, plugin: p, storage: disk, getRecords: () => records, onDue() {}, onStatus: s => { state = s; }, now: () => now });
 await engine.setAccount('a'); assert.equal(p.calls.includes('request'), false);
 assert.equal(p.pending.length, 0); await engine.configure(true);
 assert.equal(p.pending.length, 1); assert.equal(p.pending[0].isExactNotification, false, 'no surprise exact-alarm permission prompt');
 const scheduled = p.calls.filter(c => c === 'schedule').length; await engine.refresh();
 assert.equal(p.calls.filter(c => c === 'schedule').length, scheduled, 'unchanged reminders stay scheduled');
 records[0].type = 'note'; records[0].entry.title = records[0].entry.name; await engine.refresh(); assert.equal(p.pending[0].title, 'Напоминание о заметке');
 records[0].entry.time = '19:00'; await engine.refresh(); assert.equal(p.pending.length, 1); assert.equal(p.pending[0].schedule.at.getHours(), 18);
 records[0].entry.checked = true; await engine.refresh(); assert.equal(p.pending.length, 0);
 records[0].entry.checked = false; await engine.refresh(); assert.equal(p.pending.length, 1);
 await engine.configure(false); assert.equal(p.pending.length, 0); assert.equal(records[0].entry.reminder.mode, '15');
 await engine.configure(true); records = []; await engine.refresh(); assert.equal(p.pending.length, 0);
 records = [{ entry: entry(), type: 'task' }]; await engine.refresh(); await engine.setAccount('b'); assert.equal(p.pending.length, 0); assert.equal(state.enabled, false);
 p.permission = 'denied'; assert.equal(await engine.configure(true), false); assert.equal(p.pending.length, 0); assert.equal(state.permission, 'denied');
});
test('permission response for a previous account cannot enable the next account', async () => {
 const m = await modules(), p = plugin(), disk = storage(); let resolve;
 p.requestPermissions = () => new Promise(r => { resolve = r; });
 const engine = m.createReminderEngine({ native: true, plugin: p, storage: disk, getRecords: () => [{ entry: entry(), type: 'task' }], onDue() {}, onStatus() {}, now: () => now });
 await engine.setAccount('a'); const configure = engine.configure(true); await engine.setAccount('b'); resolve({ display: 'granted' });
 assert.equal(await configure, false); assert.equal(disk.getItem('todo-personal:reminders-enabled:b'), null); assert.equal(p.pending.length, 0);
});
test('browser shows a due reminder once, snoozes, cancels on completion and never fires newly entered past times', async () => {
 const m = await modules(); let clock = new Date(2026, 9, 7, 17, 44), due = [];
 const record = { entry: entry(), type: 'task' }; let records = [record];
 const engine = m.createReminderEngine({ native: false, storage: storage(), getRecords: () => records, onDue: r => { if (r) due.push(r.entry.id); }, onStatus() {}, now: () => clock });
 await engine.setAccount('a'); await engine.configure(true); clock = new Date(2026, 9, 7, 17, 46); await engine.refresh(); engine.tick(); assert.equal(due.length, 1);
 m.snoozeReminder(record.entry, clock); await engine.refresh(); clock = new Date(2026, 9, 7, 17, 57); engine.tick(); assert.equal(due.length, 2);
 m.snoozeReminder(record.entry, clock); await engine.refresh(); record.entry.checked = true; await engine.refresh(); clock = new Date(2026, 9, 7, 18, 8); engine.tick(); assert.equal(due.length, 2);
 record.entry.checked = false; record.entry.reminder = { mode: 'custom', date: '2026-10-07', time: '18:07' }; await engine.refresh(); assert.equal(due.length, 2);
});

test('Android notification tap during cold startup is delivered after the matching notebook loads', async () => {
 const m = await modules(), p = plugin(), disk = storage(), listeners = {}; let records = [], opened = [];
 p.addListener = async (name, callback) => { listeners[name] = callback; };
 disk.setItem('todo-personal:reminders-enabled:a', 'true');
 const record = { entry: entry(), type: 'task' }, notification = m.notificationPlan([record], 'a', now)[0];
 const engine = m.createReminderEngine({ native: true, plugin: p, storage: disk, getRecords: () => records, onDue() {}, onOpen: r => opened.push(r.entry.id), onStatus() {}, now: () => now });
 await engine.start(); listeners.localNotificationActionPerformed({ notification });
 await engine.setAccount('a'); assert.equal(opened.length, 0);
 records = [record]; await engine.refresh(); assert.deepEqual(opened, ['one']); await engine.refresh(); assert.equal(opened.length, 1);
});


test('native receipt stays passive; tapping opens the exact record and retries after a blocked editor', async () => {
 const m = await modules(), p = plugin(), disk = storage(), listeners = {};
 const record = { entry: entry(), type: 'task' }; let opened = [], due = [], blocked = true;
 p.addListener = async (name, callback) => { listeners[name] = callback; };
 disk.setItem('todo-personal:reminders-enabled:a', 'true');
 const notification = m.notificationPlan([record], 'a', now)[0];
 const engine = m.createReminderEngine({ native: true, plugin: p, storage: disk,
  getRecords: () => [record], onDue: r => { if (r) due.push(r.entry.id); },
  onOpen: r => { if (blocked) return false; opened.push(r.entry.id); return true; }, onStatus() {}, now: () => now });
 await engine.setAccount('a'); await engine.start();
 listeners.localNotificationReceived(notification);
 assert.deepEqual(due, ['one']); assert.deepEqual(opened, []);
 listeners.localNotificationActionPerformed({ notification }); assert.deepEqual(opened, []);
 blocked = false; await engine.refresh(); assert.deepEqual(opened, ['one']);
 await engine.refresh(); assert.equal(opened.length, 1);
 const wrong = { ...notification, extra: { ...notification.extra, account: 'b' } };
 listeners.localNotificationActionPerformed({ notification: wrong }); await engine.refresh();
 assert.equal(opened.length, 1);
 record.entry.time = '19:00'; listeners.localNotificationActionPerformed({ notification }); await engine.refresh();
 assert.equal(opened.length, 1, 'stale reminder cannot open a changed record');
});

test('notification target opens an editor among several records, preserving an interrupted draft', async () => {
 const { JSDOM } = require('jsdom'), path = require('node:path'), { webcrypto } = require('node:crypto');
 const dom = new JSDOM('<div id="root"></div>', { url: 'https://test.local' }); const w = dom.window;
 const context = vm.createContext({ document: w.document, window: w, localStorage: w.localStorage,
  crypto: webcrypto, Date, Intl, Map, Set, Promise, String, Number, Math, Boolean, JSON, setTimeout, clearTimeout });
 const loaded = new Map();
 async function load(file) {
  file = path.resolve(file); if (loaded.has(file)) return loaded.get(file);
  const mod = new vm.SourceTextModule(fs.readFileSync(file, 'utf8'), { context, identifier: file }); loaded.set(file, mod);
  await mod.link((specifier, parent) => load(path.resolve(path.dirname(parent.identifier), specifier)));
  return mod;
 }
 const mod = await load('src/mobileNotebook.js'); await mod.evaluate();
 const todos = { home: [{ ...entry(), name: 'First target' }, { ...entry(), id: 'two', name: 'Second task' }], today: [], week: [] }, notes = [{ id: 'note', title: 'Target note', text: 'Keep these details', date: '', reminder: { mode: 'none' } }];
 const ui = mod.namespace.createMobileNotebook({ root: w.document.querySelector('#root'), todos, notes, persist: () => true, getAccount: () => 'test@example.com' });
 const text = () => w.document.querySelector('#mn-text');
 try {
  ui.setAccount('a');
  w.document.querySelector('.mn-add').click(); text().value = 'Unfinished draft';
  text().dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal(ui.openReminder({ entry: todos.home[0] }), true);
  assert.equal(text().value, 'First target'); assert.ok(w.document.querySelector('[data-save]'));
  assert.equal(JSON.parse(w.localStorage.getItem('todo-personal:entry-draft:a')).text, 'Unfinished draft');
  assert.equal(ui.openReminder({ entry: notes[0] }), true); assert.equal(text().value, 'Target note');
  assert.equal(w.document.querySelector('[name="details"]').value, 'Keep these details');
  ui.back(); w.document.querySelector('.mn-add').click(); assert.equal(text().value, 'Unfinished draft');
  const setItem = w.Storage.prototype.setItem;
  w.Storage.prototype.setItem = () => { throw Error('Quota exceeded'); };
  assert.equal(ui.openReminder({ entry: todos.home[1] }), false);
  assert.equal(text().value, 'Unfinished draft', 'failed draft save never replaces the editor');
  w.Storage.prototype.setItem = setItem;
  assert.equal(ui.openReminder({ entry: todos.home[1] }), true); assert.equal(text().value, 'Second task');
  assert.equal(ui.openReminder({ entry: { id: 'missing' } }), false);
 } finally { dom.window.close(); }
});

test('changing the interface language reschedules notification titles while preserving body, target and exact time', async () => {
 const m=await modules(), p=plugin(), disk=storage(); let english=false;
 const engine=m.createReminderEngine({native:true,plugin:p,storage:disk,getRecords:()=>[{entry:entry(),type:'task'}],onDue(){},onStatus(){},now:()=>now,localize:text=>english&&text==='Пора выполнить задачу'?'Time for your task':text});
 await engine.setAccount('a');await engine.configure(true);
 const old=p.pending[0]; english=true;await engine.refresh();const next=p.pending[0];
 assert.equal(next.title,'Time for your task');assert.equal(next.body,old.body);assert.equal(next.id,old.id);
 assert.equal(next.schedule.at.getTime(),old.schedule.at.getTime());assert.deepEqual(next.extra,old.extra);assert.equal(p.pending.length,1);
});

// Capacitor Android 8.3 keeps delivered records in getPending(), while
// getDeliveredNotifications() returns Android data rather than our `extra`.
test('Android tray notifications survive periodic refresh after delivery and delayed alarms are not cancelled at their deadline', async () => {
 const m=await modules(), disk=storage();let clock=new Date(now), saved=[], visible=[], cancellations=0, removals=0;
 const item=entry();item.date='2026-10-06';item.time='17:32';item.reminder={mode:'at'};
 let records=[{entry:item,type:'task'}];
 const p={...plugin(),async getPending(){return{notifications:saved};},async schedule({notifications}){saved.push(...notifications);},
  async cancel({notifications}){cancellations++;saved=saved.filter(n=>!notifications.some(x=>x.id===n.id));},
  async getDeliveredNotifications(){return{notifications:visible};},async removeDeliveredNotifications({notifications}){removals++;visible=visible.filter(n=>!notifications.some(x=>x.id===n.id));}};
 const engine=m.createReminderEngine({native:true,plugin:p,storage:disk,getRecords:()=>records,onDue(){},onStatus(){},now:()=>clock});
 await engine.setAccount('a');await engine.configure(true);assert.equal(saved.length,1);
 const notification=saved[0];clock=new Date(2026,9,6,17,32,1);
 // Android may deliver just after the nominal time; keep its existing alarm.
 await engine.refresh();assert.equal(cancellations,0);assert.equal(saved.length,1);
 visible=[{id:notification.id,title:notification.title,body:notification.body,data:{'android.title':notification.title}}];
 for(let i=0;i<4;i++){clock=new Date(clock.getTime()+15000);await engine.refresh();}
 assert.equal(visible.length,1,'valid reminder remains in the notification shade');assert.equal(removals,0);
 records=[];await engine.refresh();assert.equal(visible.length,0,'deleting the entry removes its notification');
});

test('delivered metadata can be retrieved by ID; unknown tray notifications are preserved and expired entries are never newly scheduled', async () => {
 const m=await modules(), p=plugin(), disk=storage();let clock=new Date(now), records=[{entry:entry(),type:'task'}], visible=[], deliveredMetadata=[];
 p.getDeliveredNotifications=async()=>({notifications:visible});
 p.getByIds=async()=>({notifications:deliveredMetadata});
 p.removeDeliveredNotifications=async({notifications})=>{visible=visible.filter(n=>!notifications.some(x=>x.id===n.id));};
 const engine=m.createReminderEngine({native:true,plugin:p,storage:disk,getRecords:()=>records,onDue(){},onStatus(){},now:()=>clock});
 await engine.setAccount('a');await engine.configure(true);const planned=p.pending[0];
 await p.cancel({notifications:[planned]});deliveredMetadata=[planned];visible=[{id:planned.id,data:{}},{id:987654321,data:{}}];
 clock=new Date(planned.schedule.at.getTime()+60000);await engine.refresh();
 assert.equal(visible.length,2);assert.equal(p.pending.length,0,'past reminders are not scheduled again');
 records[0].entry.checked=true;await engine.refresh();assert.deepEqual(visible.map(x=>x.id),[987654321]);
 p.getByIds=async()=>{throw Error('metadata unavailable');};await engine.refresh();assert.equal(visible.length,1);
});
