const { JSDOM, VirtualConsole } = require('jsdom');
const { test } = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const html = fs.readFileSync(path.join(__dirname, '../dist/index.html'), 'utf8');
const bundle = fs.readFileSync(path.join(__dirname, '../dist/main.js'), 'utf8');
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error.message));
const id = '11111111-1111-4111-8111-111111111111';
const cacheKey = 'todo-personal:local:' + id, draftKey = 'todo-personal:entry-draft:' + id;
const wait = () => new Promise(resolve => setTimeout(resolve, 100));
async function ready(dom) {
 const deadline = Date.now() + 5000;
 while (dom.window.document.querySelector('#todo-app').hidden && Date.now() < deadline) await wait();
 assert.equal(dom.window.document.querySelector('#todo-app').hidden, false, 'notebook opens within the readiness timeout');
}
function boot(entries, native = false, fetcher = null) {
 const dom = new JSDOM(html, { url: 'https://test.local/', runScripts: 'outside-only', virtualConsole });
 const w = dom.window;
 Object.defineProperty(w, 'crypto', { value: webcrypto });
 Object.assign(w, { TextEncoder, TextDecoder, fetch: fetcher || (async () => { throw new TypeError('Network unavailable'); }), Request, Response, Headers });
 if (native) w.androidBridge = { postMessage() {} };
 for (const [key, value] of entries) w.localStorage.setItem(key, value);
 w.eval(bundle);
 return dom;
}
test('mobile notebook core flows persist across offline restart', async () => {
 const exp = Math.floor(Date.now() / 1000) + 86400;
 const jwt = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: id, exp, role: 'authenticated' })).toString('base64url') + '.test';
 const seed = [['sb-ihvwqqvndmwtislvgamd-auth-token', JSON.stringify({ access_token: jwt, refresh_token: 'test-only', expires_at: exp, expires_in: 86400, token_type: 'bearer', user: { id, email: 'test@example.com', aud: 'authenticated', role: 'authenticated' } })], [cacheKey, JSON.stringify({ schemaVersion: 1, state: { todos: { home: [], today: [], week: [] }, notes: [] }, revision: 0, dirty: false, savedAt: new Date().toISOString() })]];
 let dom = boot(seed);
 const doc = () => dom.window.document;
 const click = selector => { assert.ok(doc().querySelector(selector), selector); doc().querySelector(selector).click(); };
 const input = (selector, value) => { const el = doc().querySelector(selector); el.value = value; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
 const disk = () => JSON.parse(dom.window.localStorage.getItem(cacheKey));
 const snapshot = () => Array.from({ length: dom.window.localStorage.length }, (_, i) => { const key = dom.window.localStorage.key(i); return [key, dom.window.localStorage.getItem(key)]; });
 try {
  await ready(dom);
  assert.equal(doc().querySelector('#todo-app').hidden, false);
  assert.equal(doc().querySelector('[data-view="today"]').getAttribute('aria-current'), 'page');
  click('.mn-add');
  const selectedDates = () => Array.from(doc().querySelectorAll('[data-date][aria-pressed="true"]'), b => b.dataset.date);
  assert.deepEqual(selectedDates(), ['none']);
  click('[data-date="tomorrow"]');
  assert.deepEqual(selectedDates(), ['tomorrow']);
  input('[name="date"]', '2099-01-01');
  assert.deepEqual(selectedDates(), []);
  click('[data-date="none"]');
  assert.deepEqual(selectedDates(), ['none']);
  input('#mn-text', 'Deutsch 日本語 中文 — купить продукты');
  click('[data-date="today"]');
  assert.deepEqual(selectedDates(), ['today']);
  input('[name="time"]', '18:00');
  click('[data-save]');
  assert.equal(disk().state.todos.home[0].name, 'Deutsch 日本語 中文 — купить продукты');
  assert.equal(disk().state.todos.home[0].time, '18:00');
  assert.ok(doc().querySelector('.mn-card'));
  click('[data-open]');
  assert.deepEqual(selectedDates(), ['today']);
  input('#mn-text', 'Изменённая запись');
  assert.equal(disk().state.todos.home[0].name, 'Изменённая запись', 'existing entry autosaves');
  click('[data-back]');
  click('[data-check]');
  assert.equal(disk().state.todos.home[0].checked, true);
  click('[data-view="done"]');
  assert.equal(doc().querySelector('.mn-title').textContent, 'Изменённая запись');
  click('[data-check]');
  assert.equal(disk().state.todos.home[0].checked, false);
  click('[data-view="today"]');
  click('.mn-add');
  click('[data-type="note"]');
  input('#mn-text', 'Русский · English · Italiano · Español 😀');
  click('[data-back]');
  assert.ok(dom.window.localStorage.getItem(draftKey));
  const saved = snapshot();dom.window.close();dom = boot(saved);await ready(dom);
  click('.mn-add');
  assert.equal(doc().querySelector('#mn-text').value, 'Русский · English · Italiano · Español 😀');
  click('[data-save]');
  assert.equal(disk().state.notes[0].title, 'Русский · English · Italiano · Español 😀');
  assert.equal(dom.window.localStorage.getItem(draftKey), null);
  click('[data-view="all"]');
  input('#mn-search', 'Español');
  assert.equal(doc().querySelectorAll('.mn-card').length, 1);
  click('[data-open]');click('[data-delete]');
  assert.equal(disk().state.notes.length, 0);
  click('[data-undo]');
  assert.equal(disk().state.notes.length, 1);
  input('#mn-search', '');
  click('.mn-add');input('#mn-text', 'Задача без срока');click('[data-save]');
  assert.equal(disk().state.todos.home[1].date, '');
  click('.mn-add'); input('#mn-text', 'Сохранить после освобождения места');
  const nativeSetItem = dom.window.Storage.prototype.setItem;
  dom.window.Storage.prototype.setItem = function () { throw new Error('Quota exceeded'); };
  click('[data-save]');
  assert.ok(doc().querySelector('#mn-text'), 'failed save keeps the editor open');
  assert.match(doc().querySelector('.mn-message').textContent, /Не удалось сохранить/);
  dom.window.Storage.prototype.setItem = nativeSetItem;
  click('[data-save]');
  assert.equal(disk().state.todos.home.length, 3, 'retry does not duplicate the entry');
  assert.equal(dom.window.localStorage.getItem(draftKey), null);
  click('[data-view="settings"]');
  assert.match(doc().querySelector('.mn-setting').textContent, /test@example.com/);
  const expired = snapshot().map(([key, value]) => {
   if (key !== 'sb-ihvwqqvndmwtislvgamd-auth-token') return [key, value];
   const session = JSON.parse(value); session.expires_at = 1;
   return [key, JSON.stringify(session)];
  });
  dom.window.close(); dom = boot(expired, true); await ready(dom);
  assert.equal(doc().querySelector('#todo-app').hidden, false, 'native cold start works while expired session refresh cannot reach the network');
  assert.ok(doc().querySelector('.mobile-notebook'));
  assert.deepEqual(errors, []);
  console.log('PASS: mobile Today/create/edit/complete/restore/search/delete/undo, Unicode draft restart, optional deadline and account display; network unavailable, no JS errors.');
 } finally { dom.window.close(); }
});

test('deadline suggestions require confirmation, remember rejection and respect account settings', async () => {
 const exp = Math.floor(Date.now() / 1000) + 86400;
 const jwt = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: id, exp, role: 'authenticated' })).toString('base64url') + '.test';
 let dom = boot([['sb-ihvwqqvndmwtislvgamd-auth-token', JSON.stringify({ access_token: jwt, refresh_token: 'test-only', expires_at: exp, expires_in: 86400, token_type: 'bearer', user: { id, email: 'test@example.com' } })], [cacheKey, JSON.stringify({ schemaVersion: 1, state: { todos: { home: [], today: [], week: [] }, notes: [] }, revision: 0, dirty: false })]]);
 const doc = () => dom.window.document;
 const click = selector => doc().querySelector(selector).click();
 const input = (selector, value) => { const el = doc().querySelector(selector); el.value = value; el.dispatchEvent(new dom.window.Event('input', { bubbles: true })); };
 const snapshot = () => Array.from({ length: dom.window.localStorage.length }, (_, i) => { const key = dom.window.localStorage.key(i); return [key, dom.window.localStorage.getItem(key)]; });
 const disk = () => JSON.parse(dom.window.localStorage.getItem(cacheKey));
 try {
  await ready(dom);
  click('.mn-add'); input('#mn-text', 'Завтра в 18:00 позвонить');
  assert.equal(doc().querySelector('[name="date"]').value, '', 'typing never changes the deadline');
  assert.equal(doc().querySelector('.mn-suggestion').hidden, false);
  click('[data-accept-deadline]');
  const acceptedDate = doc().querySelector('[name="date"]').value;
  assert.ok(acceptedDate);
  assert.equal(doc().querySelector('[name="time"]').value, '18:00');
  assert.equal(doc().querySelector('.mn-pin').hidden, true);
  assert.match(doc().querySelector('.mn-deadline-help').textContent, /когда наступит/);
  click('[data-date="none"]');
  assert.equal(doc().querySelector('.mn-pin').hidden, false);
  assert.equal(doc().querySelector('.mn-suggestion').hidden, true, 'explicit no-deadline choice is respected');
  click('[name="today"]'); click('[data-save]');
  assert.equal(disk().state.todos.home[0].today, true);
  assert.match(doc().querySelector('.mn-meta').textContent, /В Сегодня/);
  click('[data-open]');
  assert.equal(doc().querySelector('.mn-suggestion').hidden, true, 'dismissal survives saved record reopening');
  input('#mn-text', 'Сегодня в 19:00 позвонить');
  assert.equal(doc().querySelector('.mn-suggestion').hidden, false, 'a different deadline can be suggested');
  click('[data-dismiss-deadline]'); click('[data-back]');
  click('[data-view="settings"]');
  click('[data-smart-dates]');
  assert.equal(JSON.parse(dom.window.localStorage.getItem('todo-personal:preferences:' + id)).smartDates, false);
  const saved = snapshot(); dom.window.close(); dom = boot(saved); await ready(dom);
  click('.mn-add'); input('#mn-text', 'Tomorrow at 6 pm call');
  assert.equal(doc().querySelector('.mn-suggestion').hidden, true, 'disabled preference survives offline restart');
  click('[data-back]'); click('[data-view="settings"]'); click('[data-smart-dates]');
  click('[data-view="all"]'); click('.mn-add');
  assert.equal(doc().querySelector('.mn-suggestion').hidden, false, 'enabled preference applies to the existing draft');
  click('[data-dismiss-deadline]'); click('[data-back]'); click('.mn-add');
  assert.equal(doc().querySelector('.mn-suggestion').hidden, true, 'draft remembers rejection');
  input('#mn-text', '明日午後6時電話する');
  // Same deadline remains dismissed even when the same intent is rephrased.
  assert.equal(doc().querySelector('.mn-suggestion').hidden, true);
  input('#mn-text', '明日午後7時電話する');
  assert.equal(doc().querySelector('.mn-suggestion').hidden, false);
  click('[data-accept-deadline]'); click('[data-save]');
  assert.equal(disk().state.todos.home[1].time, '19:00');
  assert.equal(disk().state.todos.home[1].name, '明日午後7時電話する', 'original Unicode text is preserved');
  assert.equal(disk().state.todos.home[1].date, acceptedDate);
  assert.deepEqual(errors, []);
 } finally { dom.window.close(); }
});

test('reminders display exact time, deliver offline, snooze without changing deadline, and cancel on completion', async () => {
 const exp = Math.floor(Date.now() / 1000) + 86400;
 const jwt = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: id, exp, role: 'authenticated' })).toString('base64url') + '.test';
 const dom = boot([['sb-ihvwqqvndmwtislvgamd-auth-token', JSON.stringify({ access_token: jwt, refresh_token: 'test-only', expires_at: exp, expires_in: 86400, token_type: 'bearer', user: { id, email: 'test@example.com' } })], [cacheKey, JSON.stringify({ schemaVersion: 1, state: { todos: { home: [], today: [], week: [] }, notes: [] }, revision: 0, dirty: false })]]);
 const w = dom.window, doc = w.document;
 const click = selector => { assert.ok(doc.querySelector(selector), selector); doc.querySelector(selector).click(); };
 const input = (selector, value) => { const el = doc.querySelector(selector); el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
 const disk = () => JSON.parse(w.localStorage.getItem(cacheKey));
 try {
  await ready(dom);
  const RealDate = w.Date; let clock = new RealDate(); clock.setSeconds(0, 0);
  w.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [clock.getTime()])); } static now() { return clock.getTime(); } };
  const future = new RealDate(clock.getTime() + 2 * 60000);
  const date = [future.getFullYear(), String(future.getMonth() + 1).padStart(2, '0'), String(future.getDate()).padStart(2, '0')].join('-');
  const time = `${String(future.getHours()).padStart(2, '0')}:${String(future.getMinutes()).padStart(2, '0')}`;
  click('.mn-add'); input('#mn-text', 'Завтра в 18.00 позвонить');
  assert.equal(doc.querySelector('.mn-suggestion').hidden, false, 'screenshot regression fixed');
  click('[data-accept-deadline]');
  const deadline = doc.querySelector('[name="date"]').value;
  input('[name="reminderMode"]', 'custom'); input('[name="reminderDate"]', date); input('[name="reminderTime"]', time);
  assert.match(doc.querySelector('.mn-reminder-preview').textContent, /Напомнить/);
  click('[data-enable-reminders]'); await wait();
  assert.match(doc.querySelector('.mn-reminder-device').textContent, /пока эта страница открыта/);
  click('[data-save]');
  click('[data-view="all"]'); click('[data-filter="reminder"]'); assert.equal(doc.querySelectorAll('.mn-card').length, 1);
  clock = new RealDate(clock.getTime() + 3 * 60000); w.dispatchEvent(new w.Event('focus')); await wait();
  assert.equal(doc.querySelector('.mn-reminder-banner').hidden, false);
  click('[data-reminder-snooze]'); assert.equal(doc.querySelector('.mn-reminder-banner').hidden, true);
  assert.equal(disk().state.todos.home[0].date, deadline, 'snoozing preserves deadline');
  clock = new RealDate(clock.getTime() + 11 * 60000); w.dispatchEvent(new w.Event('focus')); await wait();
  assert.equal(doc.querySelector('.mn-reminder-banner').hidden, false);
  click('[data-reminder-done]'); assert.equal(disk().state.todos.home[0].checked, true); assert.equal(disk().state.todos.home[0].reminder.mode, 'none');
  assert.equal(doc.querySelector('.mn-reminder-banner').hidden, true);
  click('[data-view="settings"]'); click('[data-toggle-reminders]'); await wait();
  assert.equal(w.localStorage.getItem('todo-personal:reminders-enabled:' + id), 'false');
  assert.match(doc.querySelector('[data-toggle-reminders]').textContent, /Включить/);
 } finally { dom.window.close(); }
});

test('mobile synchronization explains offline state, resolves conflicts with both copies and exports a backup', async () => {
 const exp = Math.floor(Date.now() / 1000) + 86400;
 const jwt = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: id, exp, role: 'authenticated' })).toString('base64url') + '.test';
 const initial = { todos: { home: [], today: [], week: [] }, notes: [{ id: 'original', title: 'Исходная заметка', text: '' }] };
 let network = true, cloud = { user_id: id, ...JSON.parse(JSON.stringify(initial)), revision: 0 };
 const fetcher = async (input, options = {}) => {
  if (!network) throw new TypeError('Network unavailable');
  const url = new URL(String(input.url || input));
  if (!url.pathname.includes('/rest/v1/notebooks')) throw new TypeError('Unsupported request');
  if (options.method === 'PATCH') {
   if (url.searchParams.get('revision') !== 'eq.' + cloud.revision) return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
   cloud = { ...cloud, ...JSON.parse(options.body) }; return new Response(JSON.stringify([{ revision: cloud.revision }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }
  return new Response(JSON.stringify(cloud), { status: 200, headers: { 'Content-Type': 'application/json' } });
 };
 const seed = [['sb-ihvwqqvndmwtislvgamd-auth-token', JSON.stringify({ access_token: jwt, refresh_token: 'test-only', expires_at: exp, expires_in: 86400, token_type: 'bearer', user: { id, email: 'test@example.com' } })], [cacheKey, JSON.stringify({ schemaVersion: 1, state: initial, revision: 0, dirty: false })]];
 const dom = boot(seed, false, fetcher), w = dom.window, doc = w.document;
 const click = selector => { assert.ok(doc.querySelector(selector), selector); doc.querySelector(selector).click(); };
 const input = (selector, value) => { const el = doc.querySelector(selector); el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
 const until = async predicate => { const end = Date.now() + 3000; while (!predicate() && Date.now() < end) await wait(); assert.ok(predicate()); };
 try {
  await ready(dom); await wait(); click('[data-view="all"]'); network = false;
  click('[data-open]'); input('#mn-text', 'Правка на устройстве 日本語'); click('[data-save]');
  await until(() => doc.querySelector('.mn-status').textContent.includes('нет соединения'));
  assert.equal(doc.querySelector('.mn-sync-notice').hidden, false);
  click('[data-sync-open]'); assert.match(doc.querySelector('.mn-main').textContent, /Сохранено на устройстве/);
  assert.ok(doc.querySelector('[data-sync-now]')); assert.ok(doc.querySelector('[data-export]'));
  cloud.notes[0].title = 'Правка на другом устройстве'; cloud.notes.push({ id: 'cloud-only', title: 'Дополнительная' }); cloud.revision = 1;
  network = true; w.dispatchEvent(new w.Event('online'));
  await until(() => Boolean(doc.querySelector('[data-compare]'))); click('[data-compare]');
  await until(() => Boolean(doc.querySelector('[data-resolve="both"]')));
  assert.equal(doc.querySelectorAll('.mn-copy-difference').length, 2);
  assert.match(doc.querySelector('.mn-main').textContent, /Правка на устройстве 日本語/); assert.match(doc.querySelector('.mn-main').textContent, /Правка на другом устройстве/);
  click('[data-resolve="both"]'); await until(() => cloud.notes.length === 3);
  assert.ok(doc.querySelector('[data-export-recovery]'));
  let download = ''; w.URL.createObjectURL = () => 'blob:test-backup'; w.URL.revokeObjectURL = () => {};
  w.HTMLAnchorElement.prototype.click = function () { download = this.download; };
  click('[data-export-recovery]'); await wait(); assert.match(download, /^todo-personal-recovery-.*\.json$/);
  click('[data-view="all"]'); assert.equal(doc.querySelectorAll('.mn-card').length, 3);
  assert.match(doc.querySelector('.mn-list').textContent, /Копия с устройства/);
 } finally { dom.window.close(); }
});

test('browser can reopen cached records while an expired session refresh cannot reach the network', async () => {
 const exp = 1, jwt = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: id, exp, role: 'authenticated' })).toString('base64url') + '.test';
 const dom = boot([['sb-ihvwqqvndmwtislvgamd-auth-token', JSON.stringify({ access_token: jwt, refresh_token: 'test-only', expires_at: exp, expires_in: 1, token_type: 'bearer', user: { id, email: 'test@example.com' } })], [cacheKey, JSON.stringify({ schemaVersion: 1, state: { todos: { home: [], today: [], week: [] }, notes: [{ id: 'offline', title: 'Офлайн-копия' }] }, revision: 0, dirty: false })]]);
 try { await ready(dom); dom.window.document.querySelector('[data-view="all"]').click(); assert.match(dom.window.document.querySelector('.mn-list').textContent, /Офлайн-копия/); }
 finally { dom.window.close(); }
});
