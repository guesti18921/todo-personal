const { JSDOM, VirtualConsole } = require('jsdom');
const { test } = require('node:test');
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { webcrypto } = require('node:crypto');
const assets = process.env.TODO_ASSET_ROOT || path.join(__dirname, '../dist');
const html = fs.readFileSync(path.join(assets, 'index.html'), 'utf8');
const bundle = fs.readFileSync(path.join(assets, 'main.js'), 'utf8');
const errors = [];
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', error => errors.push(error.message));
const id = '11111111-1111-4111-8111-111111111111';
const cacheKey = 'todo-personal:local:' + id, draftKey = 'todo-personal:entry-draft:' + id;
const wait = () => new Promise(resolve => setTimeout(resolve, 100));
test('search keeps the same focused input and query when the mobile keyboard resizes the viewport', async () => {
 const f = listFixture(), dom = boot(f.seed);
 try {
  await ready(dom); const w = dom.window, d = w.document;
  d.querySelector('[data-view="all"]').click();
  const search = d.querySelector('#mn-search'); search.focus(); search.value = 'needle';
  search.dispatchEvent(new w.Event('input', { bubbles: true })); search.setSelectionRange(3, 3);
  for (let i = 0; i < 3; i++) w.dispatchEvent(new w.Event('resize'));
  assert.equal(d.querySelector('#mn-search'), search);
  assert.equal(d.activeElement, search); assert.equal(search.value, 'needle');
  assert.equal(search.selectionStart, 3);
  d.querySelector('[data-view="today"]').click();
  assert.equal(d.querySelector('.mn-main h1').textContent, 'Сегодня');
  d.querySelector('[data-view="settings"]').click();
  assert.equal(d.querySelector('.mn-main h1').textContent, 'Настройки');
 } finally { dom.window.close(); }
});
async function ready(dom) {
 const deadline = Date.now() + 5000;
 while (dom.window.document.querySelector('#todo-app').hidden && Date.now() < deadline) await wait();
 assert.equal(dom.window.document.querySelector('#todo-app').hidden, false, 'notebook opens within the readiness timeout');
}
function boot(entries, native = false, fetcher = null, languages = ['ru-RU']) {
 const dom = new JSDOM(html, { url: 'https://test.local/', runScripts: 'outside-only', virtualConsole });
 const w = dom.window;
 Object.defineProperty(w.navigator, 'languages', { value: languages });
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
  await until(() => doc.querySelector('.mn-sync-notice').textContent.includes('нет соединения'));
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

test('relative suggestion is anchored across draft and record reopen, and combined acceptance enables a due reminder', async () => {
 const exp = Math.floor(Date.now() / 1000) + 86400;
 const jwt = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: id, exp, role: 'authenticated' })).toString('base64url') + '.test';
 const dom = boot([['sb-ihvwqqvndmwtislvgamd-auth-token', JSON.stringify({ access_token: jwt, refresh_token: 'test-only', expires_at: exp, expires_in: 86400, token_type: 'bearer', user: { id, email: 'test@example.com' } })], [cacheKey, JSON.stringify({ schemaVersion: 1, state: { todos: { home: [], today: [], week: [] }, notes: [] }, revision: 0, dirty: false })]]);
 const w = dom.window, doc = w.document;
 const click = selector => { assert.ok(doc.querySelector(selector), selector); doc.querySelector(selector).click(); };
 const input = (selector, value) => { const el = doc.querySelector(selector); el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
 const disk = () => JSON.parse(w.localStorage.getItem(cacheKey));
 try {
  await ready(dom); const Original = w.Date; let clock = new Original(2026, 9, 6, 17, 30, 20);
  w.Date = class extends Original { constructor(...args) { super(...(args.length ? args : [clock.getTime()])); } static now() { return clock.getTime(); } };
  click('.mn-add'); input('#mn-text', 'Через 2 часа позвонить');
  const suggestion = doc.querySelector('.mn-suggestion-title').textContent; assert.match(suggestion, /19:31/);
  const anchor = JSON.parse(w.localStorage.getItem(draftKey)).deadlineAnchor.at;
  click('[data-back]'); clock = new Original(clock.getTime() + 5 * 60000); click('.mn-add');
  assert.equal(doc.querySelector('.mn-suggestion-title').textContent, suggestion, 'opening the draft never shifts the relative deadline');
  click('[data-accept-reminder]'); await wait();
  assert.equal(doc.querySelector('[name="time"]').value, '19:31'); assert.equal(doc.querySelector('[name="reminderMode"]').value, 'at');
  assert.equal(w.localStorage.getItem('todo-personal:reminders-enabled:' + id), 'true');
  click('[data-save]'); assert.equal(disk().state.todos.home[0].name, 'Через 2 часа позвонить'); assert.equal(disk().state.todos.home[0].deadlineAnchor.at, anchor);
  click('[data-view="all"]'); clock = new Original(clock.getTime() + 5 * 60000); click('[data-open]');
  assert.equal(doc.querySelector('[name="time"]').value, '19:31'); assert.equal(doc.querySelector('.mn-suggestion').hidden, true, 'saved anchored deadline is not proposed again');
  input('#mn-text', 'Через 3 часа позвонить'); assert.match(doc.querySelector('.mn-suggestion-title').textContent, /20:41/);
  click('[data-accept-reminder]'); click('[data-save]');
  clock = new Original(2026, 9, 6, 20, 42); w.dispatchEvent(new w.Event('focus')); await wait();
  assert.equal(doc.querySelector('.mn-reminder-banner').hidden, false, 'the combined action creates a functioning reminder');
  click('[data-reminder-close]'); click('[data-open]'); input('#mn-text', 'Вчера в 18:00');
  assert.equal(doc.querySelector('[data-accept-reminder]').disabled, true, 'a past reminder cannot be enabled from the suggestion');
 } finally { dom.window.close(); }
});

test('login offers Google only when enabled, preserves email login and explains password errors', async () => {
 let enabled = false;
 const dom = boot([], false, async (request) => {
  const url = String(request?.url || request);
  if (url.includes('/auth/v1/settings')) return new Response(JSON.stringify({ external: { google: enabled } }), { status: 200 });
  if (url.includes('/auth/v1/token')) return new Response(JSON.stringify({ code: 'invalid_credentials', error_code: 'invalid_credentials', msg: 'Invalid login credentials' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('/auth/v1/signup')) return new Response(JSON.stringify({ user: { id, email: 'test@example.com', identities: [] }, session: null }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  throw Error('Unexpected request');
 });
 try {
  const d = dom.window.document; await wait();
  assert.equal(d.querySelector('#auth-google-area').hidden, true);
  assert.equal(d.querySelector('#auth-form').hidden, false);
  d.querySelector('#auth-password').value = 'long-enough';
  d.querySelector('#auth-password-toggle').click();
  assert.equal(d.querySelector('#auth-password').type, 'text');
  assert.equal(d.querySelector('#auth-password-toggle').getAttribute('aria-pressed'), 'true');
  d.querySelector('#auth-password-toggle').click(); assert.equal(d.querySelector('#auth-password').type, 'password');
  enabled = true; dom.window.dispatchEvent(new dom.window.Event('focus')); await wait();
  assert.equal(d.querySelector('#auth-google-area').hidden, false);
  d.querySelector('#auth-email').value = 'test@example.com';
  d.querySelector('#auth-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); await wait();
  assert.match(d.querySelector('#auth-message').textContent, /Неверная почта или пароль/);
  assert.equal(d.querySelector('#auth-google').disabled, false);
  d.querySelector('#auth-switch').click();
  d.querySelector('#auth-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); await wait();
  assert.equal(d.querySelector('#auth-confirm').hidden, false);
  assert.equal(d.querySelector('#auth-google-area').hidden, true);
  d.querySelector('#auth-confirm-back').click(); assert.equal(d.querySelector('#auth-google-area').hidden, false);
 } finally { dom.window.close(); }
});

function listFixture() {
 const exp = Math.floor(Date.now() / 1000) + 86400;
 const jwt = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: id, exp, role: 'authenticated' })).toString('base64url') + '.test';
 const date = n => { const d = new Date(); d.setDate(d.getDate() + n); return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-'); };
 const state = { todos: { home: [
  { id: 'a', name: 'Alpha overdue', date: date(-1), time: '18:00', updatedAt: '2026-01-01T10:00:00Z', reminder: { mode: 'at' } },
  { id: 'b', name: 'Beta tomorrow', date: date(1), time: '10:00', updatedAt: '2026-01-02T10:00:00Z' },
  { id: 'c', name: 'Cafe\u0301 中文', date: '', time: '', updatedAt: '2026-01-03T10:00:00Z' },
  { id: 'done', name: 'Done task', checked: true, date: '', completedAt: '2026-01-01T10:00:00Z' }
 ], today: [], week: [] }, notes: [{ id: 'n', title: '日本語 note', text: 'original text', date: date(0), time: '12:00', updatedAt: '2026-01-04T10:00:00Z', reminder: { mode: 'custom', date: '2099-01-01', time: '09:30' } }] };
 const seed = [['sb-ihvwqqvndmwtislvgamd-auth-token', JSON.stringify({ access_token: jwt, refresh_token: 'test-only', expires_at: exp, expires_in: 86400, token_type: 'bearer', user: { id, email: 'test@example.com', aud: 'authenticated', role: 'authenticated' } })], [cacheKey, JSON.stringify({ schemaVersion: 1, state, revision: 0, dirty: false, savedAt: new Date().toISOString() })]];
 return { seed, state, date };
}
test('untrusted record text, attributes and restored drafts remain literal in both interface languages', async () => {
 const payload = '<img src=x onerror="window.__injected=1"><svg onload="window.__injected=2"></svg><script>window.__injected=3</script>&quot;';
 const details = '</textarea><img src=x onerror="window.__injected=4">';
 for (const language of ['ru-RU', 'en-US']) {
  const f = listFixture();
  f.state.todos.home = [{ id: 't" onclick="window.__injected=5', name: payload, details, date: '', time: '', today: true }];
  f.state.notes = [{ id: 'n', title: payload, text: details, date: '', today: true }];
  f.seed[1][1] = JSON.stringify({ schemaVersion: 1, state: f.state, revision: 0, dirty: false });
  const draft = { type: 'note', text: payload, details, date: '', time: '', reminder: { mode: 'none' } };
  const dom = boot([...f.seed, [draftKey, JSON.stringify(draft)]], false, null, [language]);
  const w = dom.window, d = w.document;
  const safe = () => {
   assert.equal(d.querySelector('.mobile-notebook script, .mobile-notebook img, .mobile-notebook svg, .mobile-notebook iframe'), null);
   assert.equal(d.querySelector('.mobile-notebook [onclick], .mobile-notebook [onerror], .mobile-notebook [onload]'), null);
   assert.equal(w.__injected, undefined);
  };
  try {
   await ready(dom); d.querySelector('[data-view="all"]').click();
   assert.equal(d.querySelector('.mn-title').textContent, payload);
   assert.equal(d.querySelector('.mn-details').textContent, details); safe();
   const search = d.querySelector('#mn-search'); search.value = '<img'; search.dispatchEvent(new w.Event('input', { bubbles: true }));
   assert.equal(d.querySelectorAll('.mn-card').length, 2); safe();
   const taskButton = Array.from(d.querySelectorAll('[data-open]')).find(x => x.dataset.open === f.state.todos.home[0].id);
   assert.ok(taskButton); taskButton.click();
   assert.equal(d.querySelector('#mn-text').value, payload);
   assert.equal(d.querySelector('[name="details"]').value, details); safe();
   d.querySelector('[data-back]').click();
   d.querySelector('[data-continue-draft]').click();
   assert.equal(d.querySelector('#mn-text').value, payload);
   assert.equal(d.querySelector('[name="details"]').value, details); safe();
   d.querySelector('[data-save]').click(); safe();
   const saved = JSON.parse(w.localStorage.getItem(cacheKey)).state.notes;
   assert.ok(saved.some(n => n.title === payload && n.text === details));
  } finally { w.close(); }
 }
});
test('a due reminder displays markup as text without creating executable elements', async () => {
 const payload = '<img src=x onerror="window.__injected=1"><svg onload="window.__injected=2"></svg>';
 const f = listFixture(); f.state.todos.home = []; f.state.notes = [];
 f.seed[1][1] = JSON.stringify({ schemaVersion: 1, state: f.state, revision: 0, dirty: false });
 const dom = boot(f.seed), w = dom.window, d = w.document;
 const input = (selector, value) => { const el = d.querySelector(selector); el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
 try {
  await ready(dom); const Original = w.Date; let clock = new Original(); clock.setSeconds(0, 0);
  w.Date = class extends Original { constructor(...args) { super(...(args.length ? args : [clock.getTime()])); } static now() { return clock.getTime(); } };
  const future = new Original(clock.getTime() + 120000);
  const day = [future.getFullYear(), String(future.getMonth() + 1).padStart(2, '0'), String(future.getDate()).padStart(2, '0')].join('-');
  const time = [future.getHours(), future.getMinutes()].map(n => String(n).padStart(2, '0')).join(':');
  d.querySelector('.mn-add').click(); input('#mn-text', payload);
  input('[name="reminderMode"]', 'custom'); input('[name="reminderDate"]', day); input('[name="reminderTime"]', time);
  d.querySelector('[data-enable-reminders]').click(); await wait(); d.querySelector('[data-save]').click();
  clock = new Original(clock.getTime() + 180000); w.dispatchEvent(new w.Event('focus')); await wait();
  const banner = d.querySelector('.mn-reminder-banner'); assert.equal(banner.hidden, false);
  assert.equal(banner.querySelector('p').textContent, payload);
  assert.equal(banner.querySelector('img, svg, script, [onerror], [onload]'), null);
  assert.equal(w.__injected, undefined);
 } finally { w.close(); }
});
test('draft recovery is visible after restart, discard is reversible and storage failure preserves the draft', async () => {
 const f = listFixture(), draft = { type: 'note', text: 'Черновик 中文 <script>test</script>', details: 'Не потерять', date: '', time: '', reminder: { mode: 'none' } };
 const dom = boot([...f.seed, [draftKey, JSON.stringify(draft)]]), d = dom.window.document;
 try {
  await ready(dom);
  assert.ok(d.querySelector('[data-continue-draft]'));
  assert.match(d.querySelector('.mn-draft-panel').textContent, /Черновик 中文/);
  assert.equal(d.querySelector('.mn-draft-panel script'), null);
  d.querySelector('[data-continue-draft]').click();
  assert.equal(d.querySelector('#mn-text').value, draft.text);
  assert.equal(d.querySelector('[data-type="note"]').getAttribute('aria-pressed'), 'true');
  assert.match(d.querySelector('.mn-draft-restored').textContent, /Черновик восстановлен/);
  assert.equal(d.querySelector('[data-enable-reminders]').hidden, true);
  assert.equal(d.querySelector('.mn-reminder-device').hidden, true);
  d.querySelector('[data-back]').click();
  const original = dom.window.localStorage.getItem(draftKey);
  const proto = Object.getPrototypeOf(dom.window.localStorage), remove = proto.removeItem;
  proto.removeItem = function(key) { if (key === draftKey) throw Error('Storage blocked'); return remove.call(this, key); };
  d.querySelector('[data-discard-draft]').click();
  assert.equal(dom.window.localStorage.getItem(draftKey), original);
  assert.ok(d.querySelector('[data-continue-draft]'));
  proto.removeItem = remove;
  d.querySelector('[data-discard-draft]').click();
  assert.equal(dom.window.localStorage.getItem(draftKey), null);
  assert.equal(d.querySelector('[data-continue-draft]'), null);
  d.querySelector('[data-undo]').click();
  assert.equal(dom.window.localStorage.getItem(draftKey), original);
  d.querySelector('[data-continue-draft]').click(); d.querySelector('[data-save]').click();
  assert.equal(dom.window.localStorage.getItem(draftKey), null);
  assert.equal(d.querySelector('[data-continue-draft]'), null);
  assert.ok(JSON.parse(dom.window.localStorage.getItem(cacheKey)).state.notes.some(n => n.title === draft.text));
  d.querySelector('[data-view="settings"]').click(); assert.match(d.querySelector('.mn-main').textContent, /версия 0\.4\.43/);
 } finally { dom.window.close(); }
});
test('notification permissions are shown only after choosing a reminder and return when needed', async () => {
 const f = listFixture(), dom = boot(f.seed), d = dom.window.document;
 try {
  await ready(dom); d.querySelector('.mn-add').click();
  assert.equal(d.querySelector('[data-enable-reminders]').hidden, true);
  const mode = d.querySelector('[name="reminderMode"]'); mode.value = 'custom'; mode.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(d.querySelector('[data-enable-reminders]').hidden, false);
  assert.equal(d.querySelector('.mn-reminder-device').hidden, false);
  mode.value = 'none'; mode.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  assert.equal(d.querySelector('[data-enable-reminders]').hidden, true);
  assert.equal(d.querySelector('.mn-reminder-device').hidden, true);
 } finally { dom.window.close(); }
});
test('long note previews are clamped while editing, saving and searching retain the entire text', async () => {
 const f = listFixture();
 const fullText = Array.from({ length: 30 }, (_, i) => `${i + 1}. Строка заметки 中文 日本語 — полный текст`).join('\n\n');
 const fullDetails = 'Дополнительный текст\n'.repeat(12);
 const seed = f.seed.map(([key, value]) => key === cacheKey ? [key, JSON.stringify({ ...JSON.parse(value), state: { ...f.state, notes: [{ id: 'long-note', title: fullText, text: fullDetails }] } })] : [key, value]);
 const dom = boot(seed), d = dom.window.document;
 try {
  await ready(dom); d.querySelector('[data-view="all"]').click();
  const title = d.querySelector('[data-open="long-note"] .mn-title');
  assert.equal(title.textContent, fullText, 'preview clipping never truncates record contents');
  const search = d.querySelector('#mn-search'); search.value = '30. Строка'; search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(d.querySelectorAll('[data-open]').length, 1, 'search still finds text beyond the preview');
  d.querySelector('[data-open="long-note"]').click();
  assert.equal(d.querySelector('#mn-text').value, fullText);
  assert.equal(d.querySelector('#mn-details').value, fullDetails);
  d.querySelector('[data-save]').click();
  const stored = JSON.parse(dom.window.localStorage.getItem(cacheKey)).state.notes[0];
  assert.equal(stored.title, fullText); assert.equal(stored.text, fullDetails);
 } finally { dom.window.close(); }
});
test('list filters and account sorting combine with scoped selection, bulk completion/restore, postponement and undo offline', async () => {
 const f = listFixture(); let dom = boot(f.seed);
 const doc = () => dom.window.document;
 const click = selector => { assert.ok(doc().querySelector(selector), selector); doc().querySelector(selector).click(); };
 const change = (selector, value) => { const e = doc().querySelector(selector); e.value = value; e.dispatchEvent(new dom.window.Event('change', { bubbles: true })); };
 const state = () => JSON.parse(dom.window.localStorage.getItem(cacheKey)).state;
 try {
  await ready(dom); click('[data-view="all"]');
  change('[data-due-filter]', 'overdue'); assert.equal(doc().querySelectorAll('[data-open]').length, 1);
  assert.equal(doc().querySelector('[data-open]').dataset.open, 'a');
  click('[data-selection-toggle]'); click('[data-select-visible]'); click('[data-bulk="tomorrow"]');
  assert.equal(state().todos.home[0].date, f.date(1)); assert.equal(state().todos.home[0].time, '18:00'); assert.equal(state().todos.home[0].reminder.mode, 'at');
  click('[data-undo]'); assert.equal(state().todos.home[0].date, f.date(-1));
  click('[data-reset-filters]'); change('[data-list-sort]', 'updated');
  assert.equal(doc().querySelector('[data-open]').dataset.open, 'n');
  click('[data-selection-toggle]'); click('[data-select="a"]'); click('[data-select="n"]'); click('[data-bulk="complete"]');
  assert.equal(state().todos.home[0].checked, true); assert.equal(state().todos.home[0].reminder.mode, 'none');
  assert.equal(state().notes[0].checked, undefined); assert.equal(state().todos.home[1].checked, undefined);
  click('[data-undo]'); assert.equal(state().todos.home[0].checked, undefined); assert.equal(state().todos.home[0].reminder.mode, 'at');
  click('[data-selection-toggle]'); click('[data-select="a"]'); click('[data-select="n"]'); click('[data-bulk="tomorrow"]');
  assert.equal(state().notes[0].date, f.date(1)); assert.equal(state().notes[0].title, '日本語 note');
  assert.equal(state().notes[0].text, 'original text'); assert.equal(state().notes[0].reminder.date, '2099-01-01');
  click('[data-undo]'); assert.equal(state().notes[0].date, f.date(0));
  // A new search clears selection, so hidden records cannot be affected.
  click('[data-selection-toggle]'); click('[data-select="a"]');
  const search = doc().querySelector('#mn-search'); search.value = 'café'; search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  assert.equal(doc().querySelectorAll('[data-select]').length, 1); assert.equal(doc().querySelector('[data-select]').dataset.select, 'c');
  assert.equal(doc().querySelector('[data-bulk="complete"]').disabled, true);
  click('[data-select-visible]'); click('[data-bulk="complete"]');
  assert.equal(state().todos.home[2].checked, true); assert.equal(state().todos.home[0].checked, undefined);
  click('[data-view="done"]'); click('[data-selection-toggle]'); click('[data-select="c"]'); click('[data-bulk="restore"]');
  assert.equal(state().todos.home[2].checked, false); assert.equal(state().todos.home[2].reminder.mode, 'none');
  const entries = Array.from({ length: dom.window.localStorage.length }, (_, i) => { const key = dom.window.localStorage.key(i); return [key, dom.window.localStorage.getItem(key)]; });
  dom.window.close(); dom = boot(entries); await ready(dom); click('[data-view="all"]');
  assert.equal(doc().querySelector('[data-list-sort]').value, 'updated'); assert.equal(state().todos.home[2].checked, false);
 } finally { dom.window.close(); }
});
test('a failed mixed list action restores the original records and never reports success', async () => {
 const f = listFixture(), dom = boot(f.seed);
 try {
  await ready(dom); const d = dom.window.document;
  d.querySelector('[data-view="all"]').click(); d.querySelector('[data-selection-toggle]').click();
  d.querySelector('[data-select="a"]').click(); d.querySelector('[data-select="n"]').click();
  const safe = dom.window.localStorage.getItem(cacheKey);
  const proto = Object.getPrototypeOf(dom.window.localStorage), original = proto.setItem;
  proto.setItem = function(key, value) { if (key === cacheKey) throw Error('Quota exceeded'); return original.call(this, key, value); };
  d.querySelector('[data-bulk="tomorrow"]').click();
  assert.equal(dom.window.localStorage.getItem(cacheKey), safe);
  assert.match(d.querySelector('.mn-message').textContent, /Не удалось сохранить действие/);
  assert.equal(d.querySelector('[data-undo]'), null);
  assert.match(d.querySelector('[data-open="a"] .mn-meta').textContent, /Просрочено/);
  proto.setItem = original;
  // The failed action keeps the selection, making retry a single tap.
  assert.equal(d.querySelector('[data-select="a"]').getAttribute('aria-pressed'), 'true');
  assert.equal(d.querySelector('[data-select="n"]').getAttribute('aria-pressed'), 'true');
  d.querySelector('[data-bulk="tomorrow"]').click();
  const state = JSON.parse(dom.window.localStorage.getItem(cacheKey)).state;
  assert.equal(state.todos.home[0].date, f.date(1)); assert.equal(state.notes[0].date, f.date(1));
 } finally { dom.window.close(); }
});


test('settings stay concise and blocked offline sign-out preserves all local changes', async () => {
 const f = listFixture();
 const seed = f.seed.map(([key, value]) => key === cacheKey ? [key, JSON.stringify({ ...JSON.parse(value), dirty: true })] : [key, value]);
 const dom = boot(seed); const doc = dom.window.document;
 let alerts = 0; dom.window.alert = () => alerts++;
 try {
  await ready(dom);
  assert.equal(doc.querySelector('.sync-bar'), null, 'legacy technical toolbar is removed');
  doc.querySelector('[data-view="settings"]').click();
  assert.ok(doc.querySelector('[data-smart-dates]'));
  assert.ok(doc.querySelector('[data-toggle-reminders]'));
  const languages = Array.from(doc.querySelectorAll('details')).find(d => /Какие языки/.test(d.textContent));
  assert.ok(languages); assert.equal(languages.open, false);
  const before = JSON.parse(dom.window.localStorage.getItem(cacheKey)).state;
  doc.querySelector('[data-logout]').click(); await wait(); await wait();
  assert.equal(doc.querySelector('#todo-app').hidden, false);
  assert.match(doc.querySelector('.mn-message').textContent, /сохранены на устройстве.*ещё не отправлены/);
  assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(cacheKey)).state, before);
  assert.equal(doc.querySelector('#todo-app').inert, false);
  assert.equal(alerts, 0);
  doc.querySelector('[data-sync-open]').click();
  assert.equal(doc.querySelector('[data-sync-now]').textContent, 'Синхронизировать сейчас');
 } finally { dom.window.close(); }
});

test('failed first account load hides server errors and allows switching account', async () => {
 const f = listFixture(); const secret = 'private-server-detail';
 const fetcher = async url => {
  url = String(url);
  if (url.includes('/rest/v1/')) return new Response(JSON.stringify({ message: secret, code: 'XX001' }), { status: 500 });
  if (url.includes('/auth/v1/logout')) return new Response(null, { status: 204 });
  if (url.includes('/auth/v1/settings')) return new Response(JSON.stringify({ external: { google: false } }), { status: 200 });
  throw new TypeError('Network unavailable');
 };
 const dom = boot(f.seed.filter(([key]) => key !== cacheKey), false, fetcher), doc = dom.window.document;
 try {
  for (let i = 0; i < 30 && !Array.from(doc.querySelectorAll('.auth-retry')).some(b => !b.hidden); i++) await wait();
  assert.match(doc.querySelector('#auth-message').textContent, /Сервер не смог загрузить блокнот/);
  assert.equal(doc.body.textContent.includes(secret), false);
  const buttons = Array.from(doc.querySelectorAll('.auth-retry'));
  assert.equal(buttons.every(b => !b.hidden && !b.disabled), true);
  buttons.find(b => /другой аккаунт/.test(b.textContent)).click(); await wait(); await wait();
  assert.equal(doc.querySelector('#auth-form').hidden, false);
  assert.equal(doc.querySelector('#todo-app').hidden, true);
  assert.equal(buttons.every(b => b.hidden), true);
 } finally { dom.window.close(); }
});

test('login follows system language, ignores an old manual choice and preserves typed credentials', async () => {
 let signUpOptions, signUpRedirect;
 let dom = boot([], false, async (request, options) => {
  const url=String(request?.url||request);
  if(url.includes('/auth/v1/settings')) return new Response(JSON.stringify({external:{google:true}}));
  if(url.includes('/auth/v1/signup')) { signUpOptions=JSON.parse(options.body); signUpRedirect=new URL(url).searchParams.get('redirect_to'); return new Response(JSON.stringify({user:{id,email:'test@example.com',identities:[{provider:'email'}]},session:null}),{headers:{'Content-Type':'application/json'}}); }
  if(url.includes('/auth/v1/token')) return new Response(JSON.stringify({error_code:'invalid_credentials',msg:'Invalid login credentials'}),{status:400,headers:{'Content-Type':'application/json'}});
  throw Error('Unexpected request');
 }, ['en-RU']);
 try {
  let d=dom.window.document; await wait();
  assert.equal(d.documentElement.lang,'en'); assert.equal(d.querySelector('#auth-title').textContent,'Welcome back');
  assert.equal(d.querySelector('#auth-google').textContent,'Continue with Google');
  d.querySelector('#auth-email').value='test@example.com'; d.querySelector('#auth-password').value='good-password';
  d.querySelector('#auth-password-toggle').click();
  assert.equal(d.querySelector('#auth-language'),null);
  assert.equal(d.querySelector('#auth-password').value,'good-password'); assert.equal(d.querySelector('#auth-password').type,'text');
  assert.equal(d.querySelector('#auth-password-toggle').textContent,'Hide password');
  assert.equal(d.querySelector('#auth-email').value,'test@example.com');
  d.querySelector('#auth-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})); await wait();
  assert.match(d.querySelector('#auth-message').textContent,/Incorrect email or password/);
  d.querySelector('#auth-switch').click();
  assert.equal(d.querySelector('#auth-title').textContent,'Start with a fresh page');
  d.querySelector('#auth-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})); await wait();
  assert.equal(d.querySelector('#auth-confirm').hidden,false); assert.match(d.querySelector('#auth-confirm').textContent,/Check your email/);
  assert.equal(signUpOptions.data.todo_personal_language,'en');
  assert.equal(signUpRedirect,'https://guesti18921.github.io/todo-personal/email-confirmed.html');
  assert.equal(d.querySelector('#auth-password').value,'');
  assert.match(d.querySelector('#auth-confirm-instructions').textContent,/any device/);
  const seed=Array.from({length:dom.window.localStorage.length},(_,i)=>{const key=dom.window.localStorage.key(i);return[key,dom.window.localStorage.getItem(key)];});
  seed.push(['todo-personal:language',JSON.stringify({language:'en'})]);
  dom.window.close();dom=boot(seed,false,null,['ru-RU']);d=dom.window.document;
  assert.equal(d.documentElement.lang,'ru');
  assert.equal(d.querySelector('#auth-title').textContent,'С возвращением');
 } finally {dom.window.close();}
});

test('settings language switches offline, translates every screen, and preserves full note data and deadlines', async () => {
 const f=listFixture(), original=JSON.parse(f.seed.find(([key])=>key===cacheKey)[1]);
 original.state.notes=[{id:'language-note',title:'Сегодня Задача 中文 日本語 😀\n'.repeat(30),text:'Завтра <b>details</b>',date:'2030-10-10',time:'18:00',reminder:{mode:'15',date:'',time:''}}];
 const seed=f.seed.map(([key,value])=>[key,key===cacheKey?JSON.stringify(original):value]);
 let dom=boot(seed);
 try{
  await ready(dom);let d=dom.window.document;
  d.querySelector('[data-view="settings"]').click();
  const selector=d.querySelector('[data-language]');selector.value='en';selector.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  assert.equal(d.documentElement.lang,'en');assert.equal(d.querySelector('.mn-main h1').textContent,'Settings');
  assert.doesNotMatch(d.querySelector('.mn-main').textContent,/[А-Яа-яЁё]/);
  assert.equal(d.querySelector('[data-view="today"]').textContent,'Today');
  assert.doesNotMatch(d.querySelector('.mn-header').textContent,/[А-Яа-яЁё]/);
  assert.equal(d.querySelector('.mn-status').getAttribute('aria-label'),'View saving status');
  d.querySelector('[data-view="all"]').click();assert.equal(d.querySelector('.mn-main h1').textContent,'All entries');
  assert.equal(d.querySelector('[data-open="language-note"] .mn-title').textContent,original.state.notes[0].title);
  d.querySelector('[data-open="language-note"]').click();
  assert.equal(d.querySelector('[data-save]').textContent,'Save');
  assert.equal(d.querySelector('[name="text"]').value,original.state.notes[0].title);
  assert.equal(d.querySelector('[name="details"]').value,original.state.notes[0].text);
  assert.equal(d.querySelector('[name="date"]').value,'2030-10-10');
  assert.equal(d.querySelector('[name="time"]').value,'18:00');
  assert.match(d.querySelector('.mn-reminder-preview').textContent,/Remind me/);
  assert.equal(d.querySelector('[name="reminderMode"] option[value="15"]').textContent,'15 minutes before');
  d.querySelector('[data-save]').click();
  const stored=JSON.parse(dom.window.localStorage.getItem(cacheKey)).state.notes[0];
  for(const key of ['title','text','date','time','reminder'])assert.deepEqual(stored[key],original.state.notes[0][key]);
  d.querySelector('[data-view="done"]').click();assert.equal(d.querySelector('.mn-main h1').textContent,'Completed');
  d.querySelector('[data-view="settings"]').click();d.querySelector('[data-sync-open]').click();
  assert.equal(d.querySelector('.mn-main h1').textContent,'Saving');assert.doesNotMatch(d.querySelector('.mn-main').textContent,/[А-Яа-яЁё]/);
  const next=Array.from({length:dom.window.localStorage.length},(_,i)=>{const key=dom.window.localStorage.key(i);return[key,dom.window.localStorage.getItem(key)];});
  dom.window.close();dom=boot(next);await ready(dom);d=dom.window.document;
  assert.equal(d.documentElement.lang,'en');d.querySelector('[data-view="all"]').click();
  assert.equal(d.querySelector('[data-open="language-note"] .mn-title').textContent,original.state.notes[0].title);
 }finally{dom.window.close();}
});

test('account metadata language loads on a new device and settings save it through Supabase outside the auth callback', async () => {
 const f=listFixture();let user=JSON.parse(f.seed[0][1]).user;
 user.user_metadata={todo_personal_language:'en'};let updates=0;
 const seed=f.seed.map(([key,value])=>key===f.seed[0][0]?[key,JSON.stringify({...JSON.parse(value),user})]:[key,value]);
 const dom=boot(seed,false,async (request,options)=>{
  const url=String(request?.url||request);
  if(url.includes('/auth/v1/user')) {
   if(options.method==='PUT') {updates++;user={...user,user_metadata:{...user.user_metadata,...JSON.parse(options.body).data}};}
   return new Response(JSON.stringify(user),{headers:{'Content-Type':'application/json'}});
  }
  throw Error('Network unavailable');
 });
 try{
  await ready(dom);const d=dom.window.document;
  for(let i=0;i<20&&d.documentElement.lang!=='en';i++)await wait();
  assert.equal(d.documentElement.lang,'en');assert.equal(d.querySelector('[data-view="today"]').textContent,'Today');
  d.querySelector('[data-view="settings"]').click();
  const select=d.querySelector('[data-language]');select.value='ru';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  for(let i=0;i<20&&JSON.parse(dom.window.localStorage.getItem('todo-personal:language:'+id)).dirty;i++)await wait();
  assert.equal(updates,1);assert.equal(user.user_metadata.todo_personal_language,'ru');
  assert.equal(d.documentElement.lang,'ru');assert.equal(JSON.parse(dom.window.localStorage.getItem('todo-personal:language:'+id)).dirty,false);
 }finally{dom.window.close();}
});


test('account deletion requires confirmation, cancellation and failed requests preserve local entries', async () => {
 const f = listFixture(), calls = [];
 const dom = boot(f.seed, false, async (url, options) => {
  if (String(url).includes('/functions/v1/delete-account')) {
   calls.push(options); return new Response(JSON.stringify({ code: 'deletion_failed' }), { status: 503, headers: { 'Content-Type': 'application/json' } });
  }
  throw new TypeError('offline');
 });
 try {
  await ready(dom); const d = dom.window.document, storage = dom.window.localStorage;
  d.querySelector('[data-view="settings"]').click(); d.querySelector('[data-delete-account]').click();
  assert.equal(calls.length, 0); assert.match(d.querySelector('.mn-main').textContent, /без возможности восстановления/);
  d.querySelector('[data-cancel-account-deletion]').click(); assert.equal(calls.length, 0);
  d.querySelector('[data-delete-account]').click();
  d.querySelector('[data-confirm-account-deletion]').click();
  d.querySelector('[data-confirm-account-deletion]').click();
  for (let i=0;i<30 && !d.querySelector('.mn-deletion-error')?.textContent;i++) await wait();
  assert.equal(calls.length, 1); assert.deepEqual(JSON.parse(calls[0].body), { confirm: 'DELETE' });
  assert.match(d.querySelector('.mn-deletion-error').textContent, /не подтверждено/);
  assert.deepEqual(JSON.parse(storage.getItem(cacheKey)).state, f.state);
  assert.ok(storage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token'));
 } finally { dom.window.close(); }
});

test('confirmed server deletion clears only this account and cannot reopen its cached notebook', async () => {
 const f = listFixture(), other = 'another-account';
 const scoped = ['draft', 'entry-draft', 'preferences', 'language', 'reminders-enabled', 'recovery-latest'];
 const extra = scoped.map(type => ['todo-personal:'+type+':'+id, '{}']);
 extra.push(['todo-personal:recovery:'+id+':123:copy', '{}'], ['todo-personal:reminder-seen:'+id+':entry:time', '1'], ['todo-personal:local:'+other, 'KEEP'], ['todo-personal:language', '{"language":"ru"}']);
 const dom = boot([...f.seed, ...extra], false, async (url) => {
  if (String(url).includes('/functions/v1/delete-account')) return new Response(JSON.stringify({ code: 'account_deleted' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  throw new TypeError('offline');
 });
 let reboot;
 try {
  await ready(dom); const d = dom.window.document, storage = dom.window.localStorage;
  d.querySelector('[data-view="settings"]').click(); d.querySelector('[data-delete-account]').click(); d.querySelector('[data-confirm-account-deletion]').click();
  for(let i=0;i<30 && d.querySelector('#auth-screen').hidden;i++) await wait();
  assert.equal(d.querySelector('#todo-app').hidden, true);
  assert.equal(storage.getItem(cacheKey), null); assert.equal(storage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token'), null);
  for(const [name] of extra) if(name.includes(':'+id)) assert.equal(storage.getItem(name), null, name);
  assert.equal(storage.getItem('todo-personal:local:'+other), 'KEEP');
  assert.equal(storage.getItem('todo-personal:language'), '{"language":"ru"}');
  const disk = Array.from({length:storage.length}, (_,i)=> {const key=storage.key(i);return [key, storage.getItem(key)];});
  reboot = boot(disk); await wait(); assert.equal(reboot.window.document.querySelector('#todo-app').hidden, true);
 } finally { reboot?.window.close(); dom.window.close(); }
});

test('server-confirmed remote deletion closes an open editor and clears only the deleted account', async () => {
 const f = listFixture(); let deleted = false;
 const extra = [['todo-personal:local:another-account', 'KEEP'], [draftKey, '{"text":"PRIVATE DRAFT"}'], ['todo-personal:recovery:'+id+':test', 'PRIVATE BACKUP']];
 const dom = boot([...f.seed, ...extra], false, async request => {
  const url = String(request?.url || request);
  if (url.includes('/auth/v1/user')) return new Response(JSON.stringify(deleted ? { code: 403, error_code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' } : { id }), { status: deleted ? 403 : 200, headers: { 'Content-Type': 'application/json' } });
  if (url.includes('/auth/v1/logout')) return new Response(null, { status: 204 });
  throw new TypeError('offline');
 });
 try {
  await ready(dom); await wait(); await wait();
  const w = dom.window, d = w.document;
  d.querySelector('[data-view="all"]').click(); d.querySelector('[data-open="a"]').click();
  deleted = true; w.dispatchEvent(new w.Event('focus'));
  for (let i = 0; i < 30 && !d.querySelector('#todo-app').hidden; i++) await wait();
  assert.equal(d.querySelector('#todo-app').hidden, true);
  assert.equal(w.localStorage.getItem(cacheKey), null); assert.equal(w.localStorage.getItem(draftKey), null);
  assert.equal(w.localStorage.getItem('todo-personal:recovery:'+id+':test'), null);
  assert.equal(w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token'), null);
  assert.equal(w.localStorage.getItem('todo-personal:local:another-account'), 'KEEP');
  assert.doesNotMatch(d.body.textContent, /Alpha overdue|PRIVATE DRAFT|PRIVATE BACKUP/);
  assert.match(d.querySelector('#auth-message').textContent, /удалён на другом устройстве/);
 } finally { dom.window.close(); }
});

test('a deletion marker blocks cached Auth reopening even if storage cleanup remains unavailable', async () => {
 const f = listFixture();
 const dom = new JSDOM(html, { url: 'https://test.local/', runScripts: 'outside-only', virtualConsole });
 const w = dom.window;
 Object.defineProperty(w.navigator, 'languages', { value: ['ru-RU'] });
 Object.defineProperty(w, 'crypto', { value: webcrypto });
 Object.assign(w, { TextEncoder, TextDecoder, fetch: async () => { throw new TypeError('offline'); }, Request, Response, Headers });
 for(const [key,value] of [...f.seed, ['todo-personal:deleted-account:'+id, '1']]) w.localStorage.setItem(key,value);
 w.Storage.prototype.removeItem = function(){ throw new Error('storage blocked'); };
 try {
  w.eval(bundle); await wait(); await wait();
  assert.equal(w.document.querySelector('#todo-app').hidden, true);
  assert.equal(w.document.querySelector('#auth-screen').hidden, false);
  assert.equal(w.localStorage.getItem('todo-personal:deleted-account:'+id), '1');
  assert.doesNotMatch(w.document.querySelector('.mn-list').textContent, /Alpha overdue/);
 } finally { w.close(); }
});


test('forgot password sends only email and dedicated redirect, without notebook sign-in', async () => {
 const requests = [];
 const dom = boot([], false, async (url, options = {}) => {
  if (String(url).includes('/recover')) { requests.push({ url: String(url), body: JSON.parse(options.body) }); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }); }
  return new Response('{"external":{"google":false}}', { status: 200, headers: { 'content-type': 'application/json' } });
 });
 try {
  await wait(); const d = dom.window.document;
  d.querySelector('#auth-email').value = 'test@example.com';
  d.querySelector('#auth-password').value = 'not-to-send';
  d.querySelector('#auth-forgot').click();
  assert.equal(d.querySelector('#auth-password').value, '');
  assert.equal(d.querySelector('#auth-form').hidden, true);
  assert.equal(d.querySelector('#auth-recovery-email').value, 'test@example.com');
  d.querySelector('#auth-recovery-form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  await wait();
  assert.equal(requests.length, 1); assert.equal(requests[0].body.email, 'test@example.com');
  assert.equal(requests[0].body.password, undefined);
  assert.equal(new URL(requests[0].url).searchParams.get('redirect_to'), 'https://guesti18921.github.io/todo-personal/reset-password.html');
  assert.equal(d.querySelector('#auth-confirm').hidden,false);
  assert.match(d.querySelector('#auth-confirm-instructions').textContent, /Если аккаунт/);
  assert.equal(d.querySelector('#auth-recovery-form').hidden,true);
  assert.equal(d.querySelector('.auth-card__intro').hidden,true);
  assert.equal(d.querySelector('#auth-confirm-email').textContent,'test@example.com');
  assert.equal(d.activeElement.id,'auth-confirm-title');
  assert.equal(d.querySelector('#todo-app').hidden, true);
  d.querySelector('#auth-confirm-back').click(); assert.equal(d.querySelector('#auth-form').hidden, false);
  d.querySelector('#auth-switch').click(); assert.equal(d.querySelector('#auth-forgot').hidden, true);
  assert.equal(d.querySelector('#auth-password').minLength, 8);
 } finally { dom.window.close(); }
});

test('reset page strips URL tokens and changes only recovery account without persisting session', async () => {
 const exp = Math.floor(Date.now() / 1000) + 86400;
 const jwt = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: id, exp, role: 'authenticated' })).toString('base64url') + '.test';
 const page = fs.readFileSync('dist/reset-password.html', 'utf8');
 const dom = new JSDOM(page, { url: 'https://test.local/reset-password.html#type=recovery&access_token='+jwt+'&refresh_token=test-refresh', runScripts: 'outside-only', virtualConsole });
 const w = dom.window, writes = [];
 Object.assign(w, { TextEncoder, TextDecoder, Request, Response, Headers, fetch: async (url, options = {}) => {
  if (options.method === 'PUT') writes.push(JSON.parse(options.body));
  return new Response(JSON.stringify({ id, email: 'test@example.com', aud: 'authenticated', role: 'authenticated' }), { status: 200, headers: { 'content-type': 'application/json' } });
 } });
 w.localStorage.setItem('existing-notebook-account', 'keep');
 try {
  w.eval(w.document.querySelector('script').textContent);
  assert.equal(w.location.hash, '');
  w.eval(fs.readFileSync('dist/password-reset.js', 'utf8')); await wait();
  assert.equal(w.todoRecoveryFragment, undefined);
  const d = w.document; assert.equal(d.querySelector('#reset-form').hidden, false);
  d.querySelector('#new-password').value = d.querySelector('#repeat-password').value = 'new-password-123';
  d.querySelector('#reset-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await wait();
  assert.equal(writes.length, 1); assert.equal(writes[0].password, 'new-password-123');
  assert.equal(d.querySelector('#reset-form').hidden, true);
  assert.equal(d.querySelector('#return-message').hidden, false);
  assert.equal(w.localStorage.length, 1); assert.equal(w.localStorage.getItem('existing-notebook-account'), 'keep');
 } finally { w.close(); }
});


test('public documents are grouped in settings and privacy is available before login', async () => {
 const dom = boot(listFixture().seed);
 try {
  await ready(dom);
  const d = dom.window.document;
  assert.equal(d.querySelector('.auth-legal a').href, 'https://todo.m1strell.com/privacy.html');
  d.querySelector('[data-view="settings"]').click();
  const links = [...d.querySelectorAll('.mn-about-links a')];
  assert.deepEqual(links.map(a => new URL(a.href).pathname), ['/privacy.html', '/support.html', '/delete-account.html']);
  assert.ok(links.every(a => a.target === '_blank' && a.rel.includes('noopener')));
  assert.equal(d.querySelector('.mn-version').textContent, 'TO-DO Personal · версия 0.4.43');
 } finally { dom.window.close(); }
});


test('all entries group by date and pinned notes stay on top after restart', async () => {
 const f = listFixture(); let dom = boot(f.seed);
 try {
  await ready(dom); let d = dom.window.document;
  d.querySelector('[data-view="all"]').click();
  assert.deepEqual([...d.querySelectorAll('.mn-open')].map(b => b.dataset.open), ['a', 'b', 'c', 'n']);
  assert.equal(d.querySelectorAll('.mn-list .mn-group').length, 4);
  d.querySelector('[data-open="n"]').click();
  const pin = d.querySelector('[name="pinned"]'); pin.checked = true; pin.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  d.querySelector('[data-save]').click();
  assert.equal(d.querySelector('.mn-open').dataset.open, 'n');
  assert.equal(d.querySelector('.mn-list .mn-group').textContent, 'Закреплённые');
  const snapshot = Array.from({ length: dom.window.localStorage.length }, (_, i) => { const key = dom.window.localStorage.key(i); return [key, dom.window.localStorage.getItem(key)]; });
  dom.window.close(); dom = boot(snapshot); await ready(dom); d = dom.window.document;
  d.querySelector('[data-view="all"]').click(); assert.equal(d.querySelector('.mn-open').dataset.open, 'n');
  d.querySelector('[data-open="n"]').click(); const unpin = d.querySelector('[name="pinned"]'); unpin.checked = false; unpin.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  d.querySelector('[data-save]').click(); assert.equal(d.querySelector('.mn-open').dataset.open, 'a');
 } finally { dom.window.close(); }
});
test('delete all affects only search results, requires confirmation and supports undo', async () => {
 const dom = boot(listFixture().seed);
 try {
  await ready(dom); const d = dom.window.document;
  d.querySelector('[data-view="all"]').click();
  const search = d.querySelector('#mn-search'); search.value = 'note'; search.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  d.querySelector('[data-selection-toggle]').click(); d.querySelector('[data-select-visible]').click(); d.querySelector('[data-bulk="delete"]').click();
  assert.equal(JSON.parse(dom.window.localStorage.getItem(cacheKey)).state.notes.length, 1);
  d.querySelector('[data-cancel-removal]').click(); d.querySelector('[data-bulk="delete"]').click(); d.querySelector('[data-confirm-removal]').click();
  const removed = JSON.parse(dom.window.localStorage.getItem(cacheKey)).state;
  assert.equal(removed.notes.length, 0); assert.equal(removed.todos.home.length, 4);
  d.querySelector('[data-undo]').click(); assert.equal(JSON.parse(dom.window.localStorage.getItem(cacheKey)).state.notes.length, 1);
 } finally { dom.window.close(); }
});
test('success messages expire after three seconds without removing the saved entry', async () => {
 const dom = boot(listFixture().seed);
 try {
  await ready(dom); const d = dom.window.document, realTimer = dom.window.setTimeout; let expiry;
  dom.window.setTimeout = (fn, ms, ...args) => { if (ms === 3000) expiry = fn; return realTimer(fn, ms, ...args); };
  d.querySelector('[data-view="all"]').click(); d.querySelector('[data-open="a"]').click(); d.querySelector('[data-save]').click();
  assert.match(d.querySelector('.mn-message').textContent, /Запись сохранена/); assert.equal(typeof expiry, 'function');
  expiry(); assert.equal(d.querySelector('.mn-message').textContent, ''); assert.ok(d.querySelector('[data-open="a"]'));
 } finally { dom.window.close(); }
});

test('failed batch deletion retains all entries and shows a persistent error', async () => {
 const dom = boot(listFixture().seed);
 try {
  await ready(dom); const d = dom.window.document, storage = dom.window.localStorage;
  const before = storage.getItem(cacheKey), prototype = Object.getPrototypeOf(storage), original = prototype.setItem;
  prototype.setItem = function(key, value) { if (key === cacheKey) throw Error('Quota exceeded'); return original.call(this, key, value); };
  d.querySelector('[data-view="all"]').click(); d.querySelector('[data-selection-toggle]').click(); d.querySelector('[data-select-visible]').click();
  d.querySelector('[data-bulk="delete"]').click(); d.querySelector('[data-confirm-removal]').click();
  assert.equal(storage.getItem(cacheKey), before);
  assert.equal(d.querySelectorAll('.mn-card').length, 4);
  assert.match(d.querySelector('.mn-message').textContent, /Не удалось сохранить действие/);
 } finally { dom.window.close(); }
});


test('changing filters cancels a pending deletion confirmation', async () => {
 const dom = boot(listFixture().seed);
 try {
  await ready(dom); const d = dom.window.document;
  d.querySelector('[data-view="all"]').click(); d.querySelector('[data-selection-toggle]').click(); d.querySelector('[data-select-visible]').click(); d.querySelector('[data-bulk="delete"]').click();
  assert.ok(d.querySelector('[data-confirm-removal]'));
  d.querySelector('[data-filter="note"]').click();
  assert.equal(d.querySelector('[data-confirm-removal]'), null);
  assert.equal(JSON.parse(dom.window.localStorage.getItem(cacheKey)).state.notes.length, 1);
 } finally { dom.window.close(); }
});

test('failed single completion and deletion keep the saved record and do not announce success', async () => {
 const f = listFixture(), dom = boot(f.seed);
 try {
  await ready(dom); const w = dom.window, d = w.document;
  d.querySelector('[data-view="all"]').click();
  const before = JSON.parse(w.localStorage.getItem(cacheKey));
  const original = w.Storage.prototype.setItem;
  w.Storage.prototype.setItem = function() { throw Error('Full'); };
  const id = d.querySelector('[data-check]').dataset.check;
  d.querySelector('[data-check]').click();
  assert.match(d.querySelector('.mn-message').textContent, /Не удалось сохранить/);
  assert.equal(JSON.parse(w.localStorage.getItem(cacheKey)).state.todos.home.find(e => e.id === id)?.checked, before.state.todos.home.find(e => e.id === id)?.checked);
  d.querySelector(`[data-open="${id}"]`).click();
  d.querySelector('[data-delete]').click();
  assert.ok(d.querySelector('#mn-text'), 'failed deletion leaves the editor open');
  assert.match(d.querySelector('.mn-message').textContent, /Не удалось сохранить/);
  w.Storage.prototype.setItem = original;
  d.querySelector('[data-back]').click();
  assert.ok(d.querySelector(`[data-open="${id}"]`), 'record restored after rejected deletion');
 } finally { dom.window.close(); }
});
test('background sync does not collapse settings or replace the language control', async () => {
 const f = listFixture(); let reads = 0;
 const fetcher = async url => {
  if (String(url).includes('/rest/v1/notebooks')) { reads++; return new Response(JSON.stringify({ revision: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
  return new Response(JSON.stringify({ id, email: 'test@example.com', role: 'authenticated', user_metadata: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
 };
 const dom = boot(f.seed, false, fetcher);
 try {
  await ready(dom); await wait(); const w = dom.window, d = w.document;
  d.querySelector('[data-view="settings"]').click();
  const details = d.querySelector('.mn-setting details'), language = d.querySelector('[data-language]');
  details.open = true;
  Object.defineProperty(d, 'hidden', { value: false, configurable: true });
  w.dispatchEvent(new w.Event('focus')); await wait();
  assert.ok(reads >= 1);
  assert.equal(d.querySelector('.mn-setting details'), details); assert.equal(details.open, true);
  assert.equal(d.querySelector('[data-language]'), language);
 } finally { dom.window.close(); }
});

test('a large notebook keeps every entry and long Unicode text through editing and offline restart', async () => {
 const f = listFixture();
 f.state.notes = Array.from({ length: 1000 }, (_, i) => ({ id: `large-${i}`, title: `Запись ${i} unique-${i}`, text: '日本語 😀', createdAt: '2026-10-08T10:00:00Z' }));
 f.seed.find(([key]) => key === cacheKey)[1] = JSON.stringify({ schemaVersion: 1, state: f.state, revision: 0, dirty: false });
 let dom = boot(f.seed);
 try {
  await ready(dom); let w = dom.window, d = w.document;
  d.querySelector('[data-view="all"]').click();
  assert.equal(d.querySelectorAll('.mn-card').length, 1003);
  const search = d.querySelector('#mn-search'); search.value = 'unique-999'; search.dispatchEvent(new w.Event('input', { bubbles: true }));
  assert.equal(d.querySelectorAll('.mn-card').length, 1);
  d.querySelector('[data-open]').click();
  const text = 'Русский 日本語 😀 café\n'.repeat(1000);
  const field = d.querySelector('#mn-text'); field.value = text; field.dispatchEvent(new w.Event('input', { bubbles: true }));
  d.querySelector('[data-save]').click();
  const saved = JSON.parse(w.localStorage.getItem(cacheKey));
  assert.equal(saved.state.notes.length, 1000); assert.equal(saved.state.notes.find(e => e.id === 'large-999').title, text);
  const snapshot = Array.from({ length: w.localStorage.length }, (_, i) => { const key = w.localStorage.key(i); return [key, w.localStorage.getItem(key)]; });
  w.close(); dom = boot(snapshot); await ready(dom); w = dom.window; d = w.document;
  d.querySelector('[data-view="all"]').click();
  const restored = JSON.parse(w.localStorage.getItem(cacheKey));
  assert.equal(restored.state.notes.length, 1000); assert.equal(restored.state.notes.find(e => e.id === 'large-999').title, text);
 } finally { dom.window.close(); }
});

test('English deadline and custom reminder use explicit AM/PM and persist canonical time across restart', async () => {
 const f = listFixture(); let dom = boot(f.seed, false, null, ['en-US']);
 try {
  await ready(dom); let w = dom.window, d = w.document;
  const input = (selector, value, event = 'input') => { const el = d.querySelector(selector); assert.ok(el, selector); el.value = value; el.dispatchEvent(new w.Event(event, { bubbles: true })); };
  const part = (name, p) => `[data-clock="${name}"] [data-clock-part="${p}"]`;
  d.querySelector('.mn-add').click();
  assert.equal(d.querySelector('[name="time"]').hidden, true);
  assert.equal(d.querySelector(part('time', 'hour')).disabled, true, 'no date disables visible picker');
  input('#mn-text', 'i have a doctors appointment at 3 p.m');
  assert.match(d.querySelector('.mn-suggestion-title').textContent, /3:00 PM/);
  assert.equal(d.querySelector('[name="time"]').value, '', 'suggestion still requires confirmation');
  d.querySelector('[data-accept-deadline]').click();
  assert.equal(d.querySelector('[name="time"]').value, '15:00');
  assert.equal(d.querySelector(part('time', 'hour')).value, '3');
  assert.equal(d.querySelector(part('time', 'period')).value, 'PM');
  input(part('time', 'hour'), '12'); input(part('time', 'period'), 'AM', 'change');
  assert.equal(d.querySelector('[name="time"]').value, '00:00');
  input(part('time', 'period'), 'PM'); assert.equal(d.querySelector('[name="time"]').value, '12:00');
  input(part('time', 'hour'), '3'); input(part('time', 'minute'), '45');
  assert.equal(d.querySelector('[name="time"]').value, '15:45');
  input('[name="date"]', '2099-01-01');
  input('[name="reminderMode"]', 'custom'); input('[name="reminderDate"]', '2099-01-02');
  input(part('reminderTime', 'period'), 'PM'); input(part('reminderTime', 'minute'), '15'); input(part('reminderTime', 'hour'), '12');
  assert.equal(d.querySelector('[name="reminderTime"]').value, '12:15');
  assert.match(d.querySelector('.mn-reminder-preview').textContent, /12:15\s*PM/);
  d.querySelector('[data-type="note"]').click();
  assert.equal(d.querySelector('[name="time"]').value, '15:45', 'changing entry type preserves the clock');
  assert.equal(d.querySelector(part('time', 'period')).value, 'PM');
  d.querySelector('[data-save]').click();
  let disk = JSON.parse(w.localStorage.getItem(cacheKey));
  const note = disk.state.notes.find(e => e.title === 'i have a doctors appointment at 3 p.m'); assert.ok(note);
  assert.equal(note.time, '15:45'); assert.equal(note.reminder.time, '12:15');
  d.querySelector('[data-view="all"]').click();
  assert.match(d.querySelector(`[data-open="${note.id}"]`).closest('.mn-card').textContent, /3:45 PM/);
  const seed = Array.from({ length: w.localStorage.length }, (_, i) => { const key = w.localStorage.key(i); return [key, w.localStorage.getItem(key)]; });
  dom.window.close(); dom = boot([...seed, ['todo-personal:time-format', '12']], false, null, ['ru-RU']); await ready(dom); w = dom.window; d = w.document;
  d.querySelector('[data-view="all"]').click(); d.querySelector(`[data-open="${note.id}"]`).click();
  assert.equal(d.querySelector(part('time', 'period')).value, 'PM', 'explicit 12-hour preference overrides Russian OS');
  assert.equal(d.querySelector('[name="reminderTime"]').value, '12:15');
  d.querySelector('[data-date="none"]').click();
  assert.equal(d.querySelector('[name="time"]').value, ''); assert.equal(d.querySelector(part('time', 'hour')).value, '');
  assert.equal(d.querySelector(part('time', 'period')).disabled, true);
  assert.equal(d.querySelector('[name="reminderTime"]').value, '12:15', 'clearing deadline leaves independent custom reminder intact');
 } finally { dom.window.close(); }
});

test('changing interface language preserves existing deadline and reminder times', async () => {
 const f = listFixture(), dom = boot(f.seed);
 try {
  await ready(dom); const w = dom.window, d = w.document;
  d.querySelector('[data-view="all"]').click(); d.querySelector('[data-open="n"]').click();
  assert.equal(d.querySelector('[name="time"]').hidden, true);
  assert.equal(d.querySelector('[name="time"]').value, '12:00');
  assert.equal(d.querySelector('[data-clock="time"] [data-clock-part="period"]'), null);
  assert.equal(d.querySelector('[data-clock="time"] [data-clock-part="hour"]').options.length, 25);
  d.querySelector('[data-back]').click(); d.querySelector('[data-view="settings"]').click();
  const language = d.querySelector('[data-language]'); language.value = 'en'; language.dispatchEvent(new w.Event('change', { bubbles: true }));
  const format = d.querySelector('[data-time-format]'); format.value = '12'; format.dispatchEvent(new w.Event('change', { bubbles: true }));
  d.querySelector('[data-view="all"]').click(); d.querySelector('[data-open="n"]').click();
  assert.equal(d.querySelector('[data-clock="time"] [data-clock-part="hour"]').value, '12');
  assert.equal(d.querySelector('[data-clock="time"] [data-clock-part="period"]').value, 'PM');
  assert.equal(d.querySelector('[data-clock="reminderTime"] [data-clock-part="hour"]').value, '9');
  assert.equal(d.querySelector('[data-clock="reminderTime"] [data-clock-part="minute"]').value, '30');
  assert.equal(d.querySelector('[data-clock="reminderTime"] [data-clock-part="period"]').value, 'AM');
  d.querySelector('[data-save]').click();
  const note = JSON.parse(w.localStorage.getItem(cacheKey)).state.notes.find(e => e.id === 'n');
  assert.equal(note.time, '12:00'); assert.equal(note.reminder.time, '09:30');
 } finally { dom.window.close(); }
});

test('leaving the textarea never replaces the deadline button between pointer down and click', async () => {
 const dom = boot(listFixture().seed, false, null, ['en-US']);
 try {
  await ready(dom); const w = dom.window, d = w.document;
  d.querySelector('.mn-add').click(); const text = d.querySelector('#mn-text');
  text.value = 'Tomorrow at 3 p.m.'; text.dispatchEvent(new w.Event('input', { bubbles: true }));
  const button = d.querySelector('[data-accept-reminder]');
  text.dispatchEvent(new w.Event('change', { bubbles: true }));
  assert.equal(d.querySelector('[data-accept-reminder]'), button, 'pointer target stays connected after textarea blur');
  button.click();
  assert.equal(d.querySelector('[name="time"]').value, '15:00');
  assert.equal(d.querySelector('[name="reminderMode"]').value, 'at');
 } finally { dom.window.close(); }
});

test('existing entry edits with an empty heading recover after restart without overwriting the saved entry', async () => {
 const f = listFixture(); let dom = boot(f.seed);
 try {
  await ready(dom); let w = dom.window, d = w.document;
  d.querySelector('[data-view="all"]').click(); d.querySelector('[data-open="n"]').click();
  const input = (selector, value) => { const el = d.querySelector(selector); el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); };
  input('#mn-text', ''); input('#mn-details', 'Новые подробности не должны исчезнуть');
  const key = 'todo-personal:entry-edit-draft:'+id+':n';
  assert.equal(JSON.parse(w.localStorage.getItem(key)).details, 'Новые подробности не должны исчезнуть');
  const seed = Array.from({length:w.localStorage.length},(_,i)=>{const k=w.localStorage.key(i);return [k,w.localStorage.getItem(k)];});
  dom.window.close(); dom=boot(seed); await ready(dom); w=dom.window; d=w.document;
  d.querySelector('[data-continue-draft="n"]').click();
  assert.equal(d.querySelector('#mn-text').value, '');
  assert.equal(d.querySelector('#mn-details').value, 'Новые подробности не должны исчезнуть');
  const title=d.querySelector('#mn-text'); title.value='Восстановлено'; title.dispatchEvent(new w.Event('input',{bubbles:true}));
  d.querySelector('[data-save]').click();
  const note=JSON.parse(w.localStorage.getItem(cacheKey)).state.notes.find(e=>e.id==='n');
  assert.equal(note.title,'Восстановлено'); assert.equal(note.text,'Новые подробности не должны исчезнуть'); assert.equal(w.localStorage.getItem(key),null);
 } finally { dom.window.close(); }
});

test('clock preference overrides device and language without changing deadlines or reminders', async () => {
 const f=listFixture(), dom=boot([...f.seed,['todo-personal:time-format','24']],false,null,['en-US']);
 try { await ready(dom);const d=dom.window.document,w=dom.window;
  d.querySelector('[data-view="all"]').click();d.querySelector('[data-open="n"]').click();
  assert.equal(d.querySelector('[data-clock-part="period"]'),null);
  d.querySelector('[data-back]').click();d.querySelector('[data-view="settings"]').click();
  const format=d.querySelector('[data-time-format]');format.value='12';format.dispatchEvent(new w.Event('change',{bubbles:true}));
  const lang=d.querySelector('[data-language]');lang.value='ru';lang.dispatchEvent(new w.Event('change',{bubbles:true}));
  d.querySelector('[data-view="all"]').click();d.querySelector('[data-open="n"]').click();
  assert.equal(d.querySelector('[data-clock="time"] [data-clock-part="period"]').value,'PM');
  assert.equal(d.querySelector('[name="time"]').value,'12:00'); assert.equal(d.querySelector('[name="reminderTime"]').value,'09:30');
  d.querySelector('[data-save]').click();const n=JSON.parse(w.localStorage.getItem(cacheKey)).state.notes.find(e=>e.id==='n');
  assert.equal(n.time,'12:00');assert.equal(n.reminder.time,'09:30');
 }finally{dom.window.close();}
});

test('ambiguous slash date offers both explicit dates and applies only the chosen one',async()=>{
 const f=listFixture(),dom=boot(f.seed);try{await ready(dom);const d=dom.window.document,w=dom.window;
 d.querySelector('.mn-add').click();const el=d.querySelector('#mn-text');el.value='Doctor 10/12/2099 at 3pm';el.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(d.querySelectorAll('[data-choice-index][data-accept-deadline]').length,2);
 assert.equal(d.querySelector('[name="date"]').value,'');
 d.querySelector('[data-accept-deadline][data-choice-index="1"]').click();assert.equal(d.querySelector('[name="date"]').value,'2099-10-12');assert.equal(d.querySelector('[name="time"]').value,'15:00');
 }finally{dom.window.close();}
});

test('reauthentication succeeds with pending edits even while ordinary logout remains blocked',async()=>{
 const f=listFixture();let authorized=false;
 const session=JSON.parse(f.seed.find(([key])=>key==='sb-ihvwqqvndmwtislvgamd-auth-token')[1]);
 const fetcher=async(url,options={})=>{
  const address=String(url?.url||url);
  if(address.includes('/auth/v1/token')){authorized=true;return new Response(JSON.stringify({...session,user:session.user}),{status:200,headers:{'Content-Type':'application/json'}});}
  if(address.includes('/auth/v1/user'))return new Response(JSON.stringify(session.user),{status:200,headers:{'Content-Type':'application/json'}});
  if(address.includes('/rest/v1/notebooks')){
   if(!authorized)return new Response(JSON.stringify({message:'expired',code:'PGRST303'}),{status:401,headers:{'Content-Type':'application/json'}});
   if(options.method==='PATCH')return new Response(JSON.stringify([{revision:JSON.parse(options.body).revision}]),{status:200,headers:{'Content-Type':'application/json'}});
   return new Response(JSON.stringify({user_id:id,revision:0,...f.state}),{status:200,headers:{'Content-Type':'application/json'}});
  }throw new TypeError('offline');
 };
 const dom=boot(f.seed,false,fetcher);try{await ready(dom);const d=dom.window.document,w=dom.window;
 d.querySelector('[data-view="all"]').click();d.querySelector('[data-open="n"]').click();const el=d.querySelector('#mn-details');el.value='Не потерять при входе';el.dispatchEvent(new w.Event('input',{bubbles:true}));d.querySelector('[data-save]').click();await wait();
 d.querySelector('[data-view="settings"]').click();d.querySelector('[data-logout]').click();await wait();assert.equal(d.querySelector('#todo-app').hidden,false);
 d.querySelector('[data-reauthenticate]').click();d.querySelector('#mn-reauth-password').value='test-password';d.querySelector('[data-reauth-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
 for(let i=0;i<40&&d.querySelector('[data-reauth-form]');i++)await wait();assert.equal(d.querySelector('[data-reauth-form]'),null);
 const saved=JSON.parse(w.localStorage.getItem(cacheKey));assert.equal(saved.state.notes.find(e=>e.id==='n').text,'Не потерять при входе');assert.equal(saved.dirty,false);
 }finally{dom.window.close();}
});

test('reauthentication keeps its focused password field mounted across keyboard resize and focus events', async()=>{
 const dom=boot(listFixture().seed);try{await ready(dom);const w=dom.window,d=w.document;
 d.querySelector('[data-view="settings"]').click();d.querySelector('[data-reauthenticate]').click();
 const password=d.querySelector('#mn-reauth-password');password.focus();password.value='typed-password';password.setSelectionRange(3,3);
 for(let i=0;i<3;i++){w.dispatchEvent(new w.Event('resize'));w.dispatchEvent(new w.Event('focus'));await wait();}
 assert.equal(d.querySelector('#mn-reauth-password'),password);assert.equal(d.activeElement,password);assert.equal(password.selectionStart,3);assert.equal(password.value,'typed-password');
 d.querySelector('[data-cancel-reauth]').click();assert.equal(d.querySelector('[data-reauth-form]'),null);
 }finally{dom.window.close();}
});

test('fully cleared existing entry draft is identified, can be left with Back and explicitly restored',async()=>{
 const f=listFixture();let dom=boot(f.seed);try{await ready(dom);let w=dom.window,d=w.document;
 d.querySelector('[data-view="all"]').click();d.querySelector('[data-open="n"]').click();
 const original=JSON.parse(w.localStorage.getItem(cacheKey)).state.notes.find(e=>e.id==='n');
 for(const selector of ['#mn-text','#mn-details']) {const el=d.querySelector(selector);el.value='';el.dispatchEvent(new w.Event('input',{bubbles:true}));}
 const key='todo-personal:entry-edit-draft:'+id+':n';
 d.querySelector('[data-back]').click();assert.equal(d.querySelector('#mn-text'),null,'Back leaves an empty draft');
 assert.match(d.querySelector('.mn-draft-panel').textContent,new RegExp(original.title));
 const seed=Array.from({length:w.localStorage.length},(_,i)=>{const k=w.localStorage.key(i);return [k,w.localStorage.getItem(k)];});dom.window.close();dom=boot(seed);await ready(dom);w=dom.window;d=w.document;
 d.querySelector('[data-continue-draft="n"]').click();assert.equal(d.querySelector('#mn-text').value,'');assert.equal(d.querySelector('#mn-details').value,'');
 assert.ok(d.querySelector('[data-restore-saved]'));
 d.querySelector('[data-back]').click();assert.equal(d.querySelector('#mn-text'),null);assert.ok(w.localStorage.getItem(key));
 d.querySelector('[data-continue-draft="n"]').click();d.querySelector('[data-restore-saved]').click();
 assert.equal(d.querySelector('#mn-text').value,original.title);assert.equal(d.querySelector('#mn-details').value,original.text);assert.equal(w.localStorage.getItem(key),null);
 }finally{dom.window.close();}
});

test('selecting the second ambiguous deadline hides the suggestion without changing the selected date',async()=>{
 const dom=boot(listFixture().seed);try{await ready(dom);const w=dom.window,d=w.document;
 d.querySelector('.mn-add').click();const el=d.querySelector('#mn-text');el.value='встреча 10/12';el.dispatchEvent(new w.Event('input',{bubbles:true}));
 assert.equal(d.querySelectorAll('[data-accept-deadline][data-choice-index]').length,2);
 d.querySelector('[data-accept-deadline][data-choice-index="1"]').click();const selected=d.querySelector('[name="date"]').value;
 assert.equal(d.querySelector('.mn-suggestion').hidden,true);w.dispatchEvent(new w.Event('resize'));assert.equal(d.querySelector('[name="date"]').value,selected);
 }finally{dom.window.close();}
});

test('failed editor creation does not leave an invisible record in memory and preserves a recoverable draft',async()=>{
 const dom=boot(listFixture().seed);try{await ready(dom);const w=dom.window,d=w.document;
 const before=w.localStorage.getItem(cacheKey),set=w.Storage.prototype.setItem;
 d.querySelector('[data-view="all"]').click();d.querySelector('.mn-add').click();
 const text=d.querySelector('#mn-text');text.value='New record blocked by full storage';text.dispatchEvent(new w.Event('input',{bubbles:true}));
 w.Storage.prototype.setItem=function(key,value){if(key===cacheKey)throw Error('Full');return set.call(this,key,value);};
 d.querySelector('[data-save]').click();assert.equal(w.localStorage.getItem(cacheKey),before);assert.ok(d.querySelector('#mn-text'));
 d.querySelector('[data-back]').click();assert.equal(d.querySelector('#mn-text'),null);assert.ok(w.localStorage.getItem(draftKey));
 assert.ok(!d.querySelector('.mn-list').textContent.includes('New record blocked'));
 w.Storage.prototype.setItem=set;d.querySelector('[data-continue-draft]').click();d.querySelector('[data-save]').click();
 assert.equal(JSON.parse(w.localStorage.getItem(cacheKey)).state.todos.home.filter(e=>e.name==='New record blocked by full storage').length,1);
 }finally{dom.window.close();}
});

test('invalid edit drafts cannot break the notebook and an accepted date-only reminder dismisses its suggestion',async()=>{
 const dom=boot([...listFixture().seed,['todo-personal:entry-edit-draft:'+id+':n',JSON.stringify({type:'note',text:{bad:true},details:42})]]);
 try{await ready(dom);const w=dom.window,d=w.document;d.querySelector('[data-view="all"]').click();assert.equal(d.querySelector('[data-continue-draft="n"]'),null);
 d.querySelector('.mn-add').click();const text=d.querySelector('#mn-text');text.value='Встреча 15 октября 2099';text.dispatchEvent(new w.Event('input',{bubbles:true}));
 d.querySelector('[data-accept-reminder]').click();assert.equal(d.querySelector('[name="time"]').value,'09:00');assert.equal(d.querySelector('.mn-suggestion').hidden,true);
 }finally{dom.window.close();}
});

test('manual sync does not replace an entry if its editor opens during the cloud download',async()=>{
 const f=listFixture();let remoteRevision=0,releaseDownload,downloadStarted=false,holdDownload=true;
 const session=JSON.parse(f.seed.find(([key])=>key==='sb-ihvwqqvndmwtislvgamd-auth-token')[1]);
 const fetcher=async(url,options={})=>{
  const address=String(url?.url||url),parsed=new URL(address);
  const json=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
  if(parsed.pathname.includes('/rest/v1/notebooks')){
   if(parsed.searchParams.get('select')==='revision')return json({revision:remoteRevision});
   if(remoteRevision===1){const row={user_id:id,revision:1,...f.state,notes:f.state.notes.map(n=>n.id==='n'?{...n,title:'Remote changed title',text:'Remote changed details'}:n)};if(!holdDownload)return json(row);downloadStarted=true;return new Promise(resolve=>{releaseDownload=()=>{holdDownload=false;resolve(json(row));};});}
   return json({user_id:id,revision:0,...f.state});
  }
  return json(session.user);
 };
 const dom=boot(f.seed,false,fetcher);try{await ready(dom);await wait();const w=dom.window,d=w.document;
 remoteRevision=1;d.querySelector('[data-sync-open]').click();d.querySelector('[data-sync-now]').click();
 for(let i=0;i<30&&!downloadStarted;i++)await wait();assert.equal(downloadStarted,true);
 d.querySelector('[data-view="all"]').click();d.querySelector('[data-open="n"]').click();const editor=d.querySelector('#mn-text');
 releaseDownload();await wait();await wait();
 assert.equal(d.querySelector('#mn-text'),editor);assert.equal(editor.value,f.state.notes.find(n=>n.id==='n').title);
 assert.equal(JSON.parse(w.localStorage.getItem(cacheKey)).state.notes.find(n=>n.id==='n').title,f.state.notes.find(n=>n.id==='n').title,'download is deferred until editor is left');
 assert.match(d.querySelector('.mn-status').textContent,/обновления|изменения/i);
 assert.equal(d.querySelector('.mn-status').dataset.state,'local');
 d.querySelector('[data-back]').click();d.querySelector('[data-sync-open]').click();d.querySelector('[data-sync-now]').click();await wait();await wait();
 assert.equal(JSON.parse(w.localStorage.getItem(cacheKey)).state.notes.find(n=>n.id==='n').title,'Remote changed title');
 assert.equal(d.querySelector('.mn-status').dataset.state,'confirmed');
 }finally{dom.window.close();}
});

test('opening and leaving a saved entry without edits does not create a pending upload',async()=>{
 const dom=boot(listFixture().seed);try{await ready(dom);const w=dom.window,d=w.document;
 const before=w.localStorage.getItem(cacheKey);
 d.querySelector('[data-view="all"]').click();d.querySelector('[data-open="n"]').click();d.querySelector('[data-back]').click();
 assert.equal(w.localStorage.getItem(cacheKey),before,'viewing a record must not change its revision or saved fields');
 assert.equal(JSON.parse(w.localStorage.getItem(cacheKey)).dirty,false);
 }finally{dom.window.close();}
});

test('two app instances retain offline edits and the cloud version through conflict and restart',async()=>{
 const f=listFixture(),session=JSON.parse(f.seed.find(([key])=>key==='sb-ihvwqqvndmwtislvgamd-auth-token')[1]);
 let cloud={user_id:id,revision:0,...JSON.parse(JSON.stringify(f.state))},secondOnline=true;
 const response=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 const server=async(input,options={})=>{
  const url=new URL(String(input?.url||input));
  if(!url.pathname.includes('/rest/v1/notebooks'))return response(session.user);
  if(options.method==='PATCH'){
   if(url.searchParams.get('revision')!=='eq.'+cloud.revision)return response([]);
   cloud={...cloud,...JSON.parse(options.body)};return response([{revision:cloud.revision}]);
  }
  return response(url.searchParams.get('select')==='revision'?{revision:cloud.revision}:cloud);
 };
 const secondFetch=(...args)=>{if(!secondOnline)throw new TypeError('Network unavailable');return server(...args);};
 const first=boot(f.seed,false,server);let second=boot(f.seed,false,secondFetch);
 const until=async predicate=>{for(let i=0;i<40&&!predicate();i++)await wait();assert.ok(predicate());};
 const change=(dom,title)=>{const w=dom.window,d=w.document;d.querySelector('[data-view="all"]').click();d.querySelector('[data-open="n"]').click();const input=d.querySelector('#mn-text');input.value=title;input.dispatchEvent(new w.Event('input',{bubbles:true}));d.querySelector('[data-back]').click();};
 try{
  await ready(first);await ready(second);await wait();
  assert.equal(first.window.document.querySelector('.mn-status').dataset.state,'local');
  assert.match(first.window.document.querySelector('.mn-status').textContent,/Сохранено на телефоне/);
  for(const dom of [first,second]){const d=dom.window.document;d.querySelector('[data-sync-open]').click();d.querySelector('[data-sync-now]').click();}
  await until(()=>first.window.document.querySelector('.mn-status').dataset.state==='confirmed');
  secondOnline=false;change(second,'Offline second-device edit');
  assert.equal(second.window.document.querySelector('.mn-status').dataset.state,'local');
  change(first,'Online first-device edit');await until(()=>cloud.notes.find(n=>n.id==='n').title==='Online first-device edit');
  secondOnline=true;second.window.dispatchEvent(new second.window.Event('online'));
  await until(()=>JSON.parse(second.window.localStorage.getItem(cacheKey)).conflict);
  assert.equal(cloud.notes.find(n=>n.id==='n').title,'Online first-device edit');
  assert.equal(JSON.parse(second.window.localStorage.getItem(cacheKey)).state.notes.find(n=>n.id==='n').title,'Offline second-device edit');
  assert.equal(second.window.document.querySelector('.mn-status').dataset.state,'warning');
  const storage=second.window.localStorage,snapshot=Array.from({length:storage.length},(_,i)=>{const key=storage.key(i);return[key,storage.getItem(key)];});
  second.window.close();secondOnline=false;second=boot(snapshot,false,secondFetch);await ready(second);
  assert.equal(JSON.parse(second.window.localStorage.getItem(cacheKey)).conflict,true);
  assert.equal(JSON.parse(second.window.localStorage.getItem(cacheKey)).state.notes.find(n=>n.id==='n').title,'Offline second-device edit');
  secondOnline=true;const d=second.window.document;d.querySelector('[data-sync-open]').click();d.querySelector('[data-compare]').click();
  await until(()=>Boolean(d.querySelector('[data-resolve="both"]')));
  assert.match(d.querySelector('.mn-main').textContent,/Online first-device edit/);assert.match(d.querySelector('.mn-main').textContent,/Offline second-device edit/);
  d.querySelector('[data-resolve="both"]').click();await until(()=>cloud.notes.some(n=>n.title==='Offline second-device edit'));
  assert.ok(cloud.notes.some(n=>n.title==='Online first-device edit'));
  await until(()=>d.querySelector('.mn-status').dataset.state==='confirmed');
 }finally{first.window.close();second.window.close();}
});

test('Google-only reauthentication shows Google without demanding an uncreated password',async()=>{
 const f=listFixture();const session=JSON.parse(f.seed[0][1]);session.user.app_metadata={provider:'google',providers:['google']};session.user.identities=[{provider:'google'}];f.seed[0][1]=JSON.stringify(session);
 const dom=boot(f.seed);try{await ready(dom);const d=dom.window.document;d.querySelector('[data-view="settings"]').click();d.querySelector('[data-reauthenticate]').click();assert.ok(d.querySelector('[data-reauth-google]'));assert.equal(d.querySelector('#mn-reauth-password'),null);assert.equal(d.querySelector('[data-reauth-recovery]'),null);d.querySelector('[data-cancel-reauth]').click();assert.equal(d.querySelector('[data-reauth-screen]'),null);assert.equal(JSON.parse(dom.window.localStorage.getItem(cacheKey)).state.notes[0].text,'original text');}finally{dom.window.close();}
});
test('password recovery in an open notebook uses current email and preserves pending edits on success and failure',async()=>{
 const f=listFixture();let fail=false,requests=[];
 const fetcher=async(url,opts={})=>{const address=String(url?.url||url);if(address.includes('/auth/v1/recover')){requests.push(JSON.parse(opts.body));return new Response(JSON.stringify(fail?{message:'offline'}:{}),{status:fail?503:200,headers:{'Content-Type':'application/json'}});}throw new TypeError('offline');};
 const dom=boot(f.seed,false,fetcher);try{await ready(dom);const d=dom.window.document,w=dom.window;d.querySelector('[data-view="all"]').click();d.querySelector('[data-open="n"]').click();const el=d.querySelector('#mn-details');el.value='Preserve pending edits';el.dispatchEvent(new w.Event('input',{bubbles:true}));d.querySelector('[data-save]').click();const before=w.localStorage.getItem(cacheKey);d.querySelector('[data-view="settings"]').click();d.querySelector('[data-reauthenticate]').click();d.querySelector('[data-reauth-recovery]').click();await wait();await wait();assert.equal(requests[0].email,'test@example.com');assert.ok(d.querySelector('.mn-mail-notice'));assert.match(d.querySelector('.mn-mail-notice').textContent,/Если аккаунт/);assert.equal(d.querySelector('[data-reauth-screen]'),null);assert.equal(w.localStorage.getItem(cacheKey),before);d.querySelector('[data-mail-back]').click();fail=true;d.querySelector('[data-reauth-recovery]').click();await wait();await wait();assert.match(d.querySelector('[data-reauth-form] [role="alert"]').textContent,/временно недоступен/);assert.equal(w.localStorage.getItem(cacheKey),before);assert.ok(d.querySelector('#mn-reauth-password'));}finally{dom.window.close();}
});

test('Google OAuth return rejects a different user before replacing cached account or pending records',async()=>{
 for(const returnedOwner of ['22222222-2222-4222-8222-222222222222',id]){
 const f=listFixture();f.seed[1][1]=JSON.stringify({...JSON.parse(f.seed[1][1]),dirty:true});const session=JSON.parse(f.seed[0][1]);
 const callbackUser={...session.user,id:returnedOwner,app_metadata:{providers:['google']}};
 const callbackJwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:returnedOwner,exp:Math.floor(Date.now()/1000)+86400})).toString('base64url')+'.test';
 const dom=new JSDOM(html,{url:'https://test.local/?reauth=google#access_token='+callbackJwt+'&refresh_token=returned-refresh',runScripts:'outside-only',virtualConsole});const w=dom.window;Object.defineProperty(w.navigator,'languages',{value:['ru-RU']});Object.defineProperty(w,'crypto',{value:webcrypto});
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,fetch:async(url,opts={})=>{const address=String(url?.url||url);if(address.includes('/auth/v1/user'))return new Response(JSON.stringify(String(opts.headers?.Authorization||opts.headers?.authorization||'').includes(callbackJwt)?callbackUser:session.user),{status:200,headers:{'Content-Type':'application/json'}});if(address.includes('/rest/v1/notebooks')&&opts.method==='PATCH')return new Response(JSON.stringify([{revision:JSON.parse(opts.body).revision}]),{status:200,headers:{'Content-Type':'application/json'}});throw new TypeError('offline');}});
 for(const [key,value]of f.seed)w.localStorage.setItem(key,value);w.sessionStorage.setItem('todo-personal:reauth-google',JSON.stringify({owner:id,startedAt:Date.now()}));
 try{w.eval(bundle);await ready(dom);await wait();await wait();assert.equal(JSON.parse(w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token')).user.id,id);assert.equal(JSON.parse(w.localStorage.getItem(cacheKey)).state.notes[0].text,'original text');assert.equal(w.location.hash,'');if(returnedOwner!==id){assert.match(w.document.querySelector('.mn-message').textContent,/тот же аккаунт/);assert.equal(JSON.parse(w.localStorage.getItem(cacheKey)).dirty,true);}else{assert.equal(JSON.parse(w.localStorage.getItem(cacheKey)).dirty,false);}}finally{w.close();}
 }
});

test('linked email and Google account offers both reauthentication methods in English',async()=>{
 const f=listFixture(),session=JSON.parse(f.seed[0][1]);session.user.app_metadata={providers:['google','email']};f.seed[0][1]=JSON.stringify(session);const dom=boot(f.seed,false,null,['en-US']);try{await ready(dom);const d=dom.window.document;d.querySelector('[data-view="settings"]').click();d.querySelector('[data-reauthenticate]').click();assert.equal(d.querySelector('[data-reauth-google]').textContent,'Continue with Google');assert.equal(d.querySelector('[data-reauth-recovery]').textContent,'Forgot password?');assert.ok(d.querySelector('#mn-reauth-password'));}finally{dom.window.close();}
});

test('recovery return opens isolated reset form, validates passwords and keeps pending notebook/session',async()=>{
 const f=listFixture();f.seed[1][1]=JSON.stringify({...JSON.parse(f.seed[1][1]),dirty:true});const session=JSON.parse(f.seed[0][1]);const originalAuth=f.seed[0][1];let updates=0;
 const dom=new JSDOM(html,{url:'https://test.local/?reauth=google#type=recovery&access_token='+session.access_token+'&refresh_token=recovery-only',runScripts:'outside-only',virtualConsole});const w=dom.window;Object.defineProperty(w.navigator,'languages',{value:['ru-RU']});Object.defineProperty(w,'crypto',{value:webcrypto});Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,fetch:async(url,opts={})=>{const address=String(url?.url||url);if(address.includes('/auth/v1/user')){if(opts.method==='PUT' && JSON.parse(opts.body).password){updates++;assert.equal(JSON.parse(opts.body).password,'new-test-password');}return new Response(JSON.stringify(session.user),{status:200,headers:{'Content-Type':'application/json'}});}if(address.includes('/auth/v1/logout'))return new Response(null,{status:204});throw new TypeError('offline');}});
 for(const [key,value]of f.seed)w.localStorage.setItem(key,value);w.sessionStorage.setItem('todo-personal:reauth-google',JSON.stringify({owner:id,startedAt:Date.now()}));
 try{w.eval(bundle);await ready(dom);await wait();await wait();const d=w.document;assert.ok(d.querySelector('[data-native-reset-form]'));const password=d.querySelector('#mn-new-password');password.focus();password.value='new-test-password';d.querySelector('#mn-repeat-password').value='different-password';w.dispatchEvent(new w.Event('resize'));assert.equal(d.querySelector('#mn-new-password'),password);assert.equal(d.activeElement,password);
 d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();assert.match(d.querySelector('[role="alert"]').textContent,/не совпадают/);assert.equal(updates,0);d.querySelector('#mn-repeat-password').value='new-test-password';d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();await wait();assert.equal(updates,1);assert.ok(d.querySelector('[data-reset-success]'));d.querySelector('[data-reset-back]').click();assert.ok(d.querySelector('[data-reauth-form]'));assert.match(d.querySelector('[data-reauth-message]').textContent,/Пароль изменён/);assert.equal(JSON.parse(w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token')).access_token,session.access_token);assert.equal(JSON.parse(w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token')).refresh_token,session.refresh_token);assert.equal(JSON.parse(w.localStorage.getItem(cacheKey)).state.notes[0].text,'original text');assert.equal(JSON.parse(w.localStorage.getItem(cacheKey)).dirty,true);
 }finally{w.close();}
});

test('recovery return while editing must show recovery and preserve draft',async()=>{
 const f=listFixture();f.seed[1][1]=JSON.stringify({...JSON.parse(f.seed[1][1]),dirty:true});const session=JSON.parse(f.seed[0][1]);const originalAuth=f.seed[0][1];let updates=0;let release;const gate=new Promise(r=>release=r);
 const dom=new JSDOM(html,{url:'https://test.local/?reauth=google#type=recovery&access_token='+session.access_token+'&refresh_token=recovery-only',runScripts:'outside-only',virtualConsole});const w=dom.window;Object.defineProperty(w.navigator,'languages',{value:['ru-RU']});Object.defineProperty(w,'crypto',{value:webcrypto});Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,fetch:async(url,opts={})=>{const address=String(url?.url||url);if(address.includes('/auth/v1/user')){await gate;if(opts.method==='PUT' && JSON.parse(opts.body).password){updates++;assert.equal(JSON.parse(opts.body).password,'new-test-password');}return new Response(JSON.stringify(session.user),{status:200,headers:{'Content-Type':'application/json'}});}if(address.includes('/auth/v1/logout'))return new Response(null,{status:204});throw new TypeError('offline');}});
 for(const [key,value]of f.seed)w.localStorage.setItem(key,value);w.sessionStorage.setItem('todo-personal:reauth-google',JSON.stringify({owner:id,startedAt:Date.now()}));
 try{w.eval(bundle);await ready(dom);const d=w.document;d.querySelector('[data-view="all"]').click();d.querySelector('[data-open="n"]').click();const text=d.querySelector('#mn-text');text.value='';text.dispatchEvent(new w.Event('input',{bubbles:true}));const details=d.querySelector('#mn-details');details.value='Draft retained during callback';details.dispatchEvent(new w.Event('input',{bubbles:true}));release();await wait();await wait();assert.ok(w.localStorage.getItem('todo-personal:entry-edit-draft:'+id+':n'));assert.ok(d.querySelector('[data-native-reset-form]'),'recovery form must be reachable immediately when the link is accepted');const password=d.querySelector('#mn-new-password');password.focus();password.value='new-test-password';d.querySelector('#mn-repeat-password').value='different-password';w.dispatchEvent(new w.Event('resize'));assert.equal(d.querySelector('#mn-new-password'),password);assert.equal(d.activeElement,password);
 d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();assert.match(d.querySelector('[role="alert"]').textContent,/не совпадают/);assert.equal(updates,0);d.querySelector('#mn-repeat-password').value='new-test-password';d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();await wait();assert.equal(updates,1);assert.ok(d.querySelector('[data-reset-success]'));d.querySelector('[data-reset-back]').click();assert.ok(d.querySelector('[data-reauth-form]'));assert.match(d.querySelector('[data-reauth-message]').textContent,/Пароль изменён/);assert.equal(JSON.parse(w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token')).access_token,session.access_token);assert.equal(JSON.parse(w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token')).refresh_token,session.refresh_token);assert.equal(JSON.parse(w.localStorage.getItem(cacheKey)).state.notes[0].text,'original text');assert.equal(JSON.parse(w.localStorage.getItem(cacheKey)).dirty,true);
 }finally{w.close();}
});

test('English password recovery has translated heading and controls',async()=>{
 const f=listFixture();f.seed[1][1]=JSON.stringify({...JSON.parse(f.seed[1][1]),dirty:true});const session=JSON.parse(f.seed[0][1]);const originalAuth=f.seed[0][1];let updates=0;
 const dom=new JSDOM(html,{url:'https://test.local/?reauth=google#type=recovery&access_token='+session.access_token+'&refresh_token=recovery-only',runScripts:'outside-only',virtualConsole});const w=dom.window;Object.defineProperty(w.navigator,'languages',{value:['en-US']});Object.defineProperty(w,'crypto',{value:webcrypto});Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,fetch:async(url,opts={})=>{const address=String(url?.url||url);if(address.includes('/auth/v1/user')){if(opts.method==='PUT' && JSON.parse(opts.body).password){updates++;assert.equal(JSON.parse(opts.body).password,'new-test-password');}return new Response(JSON.stringify(session.user),{status:200,headers:{'Content-Type':'application/json'}});}if(address.includes('/auth/v1/logout'))return new Response(null,{status:204});throw new TypeError('offline');}});
 for(const [key,value]of f.seed)w.localStorage.setItem(key,value);w.sessionStorage.setItem('todo-personal:reauth-google',JSON.stringify({owner:id,startedAt:Date.now()}));
 try{w.eval(bundle);await ready(dom);await wait();await wait();const d=w.document;assert.ok(d.querySelector('[data-native-reset-form]'));assert.equal(d.querySelector('.mn-main h1').textContent,'New password');assert.equal(d.querySelector('label[for="mn-repeat-password"]').textContent,'Repeat password');assert.equal(d.querySelector('label[for="mn-new-password"]').textContent,'New password');assert.equal(d.querySelector('[data-native-reset-form] [type="submit"]').textContent,'Save password');
 }finally{w.close();}
});

test('recovery return refuses to replace editor if latest draft cannot be stored',async()=>{
 const f=listFixture();f.seed[1][1]=JSON.stringify({...JSON.parse(f.seed[1][1]),dirty:true});const session=JSON.parse(f.seed[0][1]);const originalAuth=f.seed[0][1];let updates=0;let release;const gate=new Promise(r=>release=r);
 const dom=new JSDOM(html,{url:'https://test.local/?reauth=google#type=recovery&access_token='+session.access_token+'&refresh_token=recovery-only',runScripts:'outside-only',virtualConsole});const w=dom.window;Object.defineProperty(w.navigator,'languages',{value:['ru-RU']});Object.defineProperty(w,'crypto',{value:webcrypto});Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,fetch:async(url,opts={})=>{const address=String(url?.url||url);if(address.includes('/auth/v1/user')){await gate;if(opts.method==='PUT' && JSON.parse(opts.body).password){updates++;assert.equal(JSON.parse(opts.body).password,'new-test-password');}return new Response(JSON.stringify(session.user),{status:200,headers:{'Content-Type':'application/json'}});}if(address.includes('/auth/v1/logout'))return new Response(null,{status:204});throw new TypeError('offline');}});
 for(const [key,value]of f.seed)w.localStorage.setItem(key,value);w.sessionStorage.setItem('todo-personal:reauth-google',JSON.stringify({owner:id,startedAt:Date.now()}));
 try{w.eval(bundle);await ready(dom);const d=w.document;d.querySelector('[data-view="all"]').click();d.querySelector('[data-open="n"]').click();const text=d.querySelector('#mn-text');text.value='';text.dispatchEvent(new w.Event('input',{bubbles:true}));const details=d.querySelector('#mn-details');details.value='Draft retained during callback';details.dispatchEvent(new w.Event('input',{bubbles:true}));const originalSet=w.Storage.prototype.setItem;w.Storage.prototype.setItem=function(key,value){if(key==='todo-personal:entry-edit-draft:'+id+':n')throw new Error('quota');return originalSet.call(this,key,value);};details.value='Newest unsaved text';details.dispatchEvent(new w.Event('input',{bubbles:true}));release();await wait();await wait();assert.equal(d.querySelector('[data-native-reset-form]'),null);assert.equal(d.querySelector('#mn-details').value,'Newest unsaved text');assert.match(d.querySelector('.mn-message').textContent,/Не удалось сохранить черновик/);}finally{w.close();}
});

test('recovery return preserves an unfinished new entry before showing the reset form',async()=>{
 const f=listFixture();f.seed[1][1]=JSON.stringify({...JSON.parse(f.seed[1][1]),dirty:true});const session=JSON.parse(f.seed[0][1]);const originalAuth=f.seed[0][1];let updates=0;let release;const gate=new Promise(r=>release=r);
 const dom=new JSDOM(html,{url:'https://test.local/?reauth=google#type=recovery&access_token='+session.access_token+'&refresh_token=recovery-only',runScripts:'outside-only',virtualConsole});const w=dom.window;Object.defineProperty(w.navigator,'languages',{value:['ru-RU']});Object.defineProperty(w,'crypto',{value:webcrypto});Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,fetch:async(url,opts={})=>{const address=String(url?.url||url);if(address.includes('/auth/v1/user')){await gate;if(opts.method==='PUT' && JSON.parse(opts.body).password){updates++;assert.equal(JSON.parse(opts.body).password,'new-test-password');}return new Response(JSON.stringify(session.user),{status:200,headers:{'Content-Type':'application/json'}});}if(address.includes('/auth/v1/logout'))return new Response(null,{status:204});throw new TypeError('offline');}});
 for(const [key,value]of f.seed)w.localStorage.setItem(key,value);w.sessionStorage.setItem('todo-personal:reauth-google',JSON.stringify({owner:id,startedAt:Date.now()}));
 try{w.eval(bundle);await ready(dom);const d=w.document;d.querySelector('[data-view="all"]').click();d.querySelector('.mn-add').click();const text=d.querySelector('#mn-text');text.value='';text.dispatchEvent(new w.Event('input',{bubbles:true}));const details=d.querySelector('#mn-details');details.value='Draft retained during callback';details.dispatchEvent(new w.Event('input',{bubbles:true}));release();await wait();await wait();assert.ok(w.localStorage.getItem('todo-personal:entry-draft:'+id));assert.ok(d.querySelector('[data-native-reset-form]'),'recovery form must be reachable immediately when the link is accepted');const password=d.querySelector('#mn-new-password');password.focus();password.value='new-test-password';d.querySelector('#mn-repeat-password').value='different-password';w.dispatchEvent(new w.Event('resize'));assert.equal(d.querySelector('#mn-new-password'),password);assert.equal(d.activeElement,password);
 d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();assert.match(d.querySelector('[role="alert"]').textContent,/не совпадают/);assert.equal(updates,0);d.querySelector('#mn-repeat-password').value='new-test-password';d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();await wait();assert.equal(updates,1);assert.ok(d.querySelector('[data-reset-success]'));d.querySelector('[data-reset-back]').click();assert.ok(d.querySelector('[data-reauth-form]'));assert.match(d.querySelector('[data-reauth-message]').textContent,/Пароль изменён/);assert.equal(JSON.parse(w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token')).access_token,session.access_token);assert.equal(JSON.parse(w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token')).refresh_token,session.refresh_token);assert.equal(JSON.parse(w.localStorage.getItem(cacheKey)).state.notes[0].text,'original text');assert.equal(JSON.parse(w.localStorage.getItem(cacheKey)).dirty,true);
 }finally{w.close();}
});

test('duplicate native recovery callback cannot unlock an in-flight password update',async()=>{
 const f=listFixture(),session=JSON.parse(f.seed[0][1]);let release,started=false;const gate=new Promise(r=>release=r),listeners={};
 const dom=new JSDOM(html,{url:'https://test.local/',runScripts:'outside-only',virtualConsole});const w=dom.window;Object.defineProperty(w.navigator,'languages',{value:['ru-RU']});Object.defineProperty(w,'crypto',{value:webcrypto});w.androidBridge={postMessage(){}};
 const definitions={App:{getLaunchUrl:'promise',minimizeApp:'promise',addListener:'callback',removeListener:'promise'},TimePicker:{deviceFormat:'promise'},Network:{addListener:'callback',removeListener:'promise'},Browser:{open:'promise'},LocalNotifications:{addListener:'callback',removeListener:'promise',cancelAll:'promise',checkPermissions:'promise'}};
 w.Capacitor={PluginHeaders:Object.entries(definitions).map(([name,methods])=>({name,methods:Object.entries(methods).map(([name,rtype])=>({name,rtype}))})),nativeCallback:(plugin,method,opts,cb)=>{listeners[plugin+':'+opts.eventName]=cb;return 'callback-'+Object.keys(listeners).length;},nativePromise:async(plugin,method)=>method==='deviceFormat'?{is24Hour:true}:method==='checkPermissions'?{display:'prompt'}:{}};
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,fetch:async(url,opts={})=>{const address=String(url?.url||url);if(address.includes('/auth/v1/user')){if(opts.method==='PUT'&&JSON.parse(opts.body).password){started=true;await gate;}return new Response(JSON.stringify(session.user),{status:200,headers:{'Content-Type':'application/json'}});}if(address.includes('/auth/v1/logout'))return new Response(null,{status:204});throw new TypeError('offline');}});
 for(const [key,value]of f.seed)w.localStorage.setItem(key,value);const link='todopersonal://auth-callback#type=recovery&access_token='+session.access_token+'&refresh_token=recovery-only';
 try{w.eval(bundle);await ready(dom);await wait();assert.ok(listeners['App:appUrlOpen']);listeners['App:appUrlOpen']({url:link});await wait();await wait();const d=w.document;assert.ok(d.querySelector('[data-native-reset-form]'));d.querySelector('#mn-new-password').value='new-test-password';d.querySelector('#mn-repeat-password').value='new-test-password';d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();assert.equal(started,true);assert.equal(d.querySelector('[data-native-reset-form] [type="submit"]').disabled,true);listeners['App:appUrlOpen']({url:link});await wait();await wait();assert.equal(d.querySelector('[data-native-reset-form] [type="submit"]').disabled,true,'a duplicated OS callback must not re-enable Save during an outstanding request');
 }finally{release();await wait();w.close();}
});

test('native recovery link from another account cannot replace notebook session',async()=>{
 const f=listFixture(),session=JSON.parse(f.seed[0][1]);const foreignUser={...session.user,id:'22222222-2222-4222-8222-222222222222'};const foreignJwt=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:foreignUser.id,exp:Math.floor(Date.now()/1000)+86400})).toString('base64url')+'.test';let release,started=false;const gate=new Promise(r=>release=r),listeners={};
 const dom=new JSDOM(html,{url:'https://test.local/',runScripts:'outside-only',virtualConsole});const w=dom.window;Object.defineProperty(w.navigator,'languages',{value:['ru-RU']});Object.defineProperty(w,'crypto',{value:webcrypto});w.androidBridge={postMessage(){}};
 const definitions={App:{getLaunchUrl:'promise',minimizeApp:'promise',addListener:'callback',removeListener:'promise'},TimePicker:{deviceFormat:'promise'},Network:{addListener:'callback',removeListener:'promise'},Browser:{open:'promise'},LocalNotifications:{addListener:'callback',removeListener:'promise',cancelAll:'promise',checkPermissions:'promise'}};
 w.Capacitor={PluginHeaders:Object.entries(definitions).map(([name,methods])=>({name,methods:Object.entries(methods).map(([name,rtype])=>({name,rtype}))})),nativeCallback:(plugin,method,opts,cb)=>{listeners[plugin+':'+opts.eventName]=cb;return 'callback-'+Object.keys(listeners).length;},nativePromise:async(plugin,method)=>method==='deviceFormat'?{is24Hour:true}:method==='checkPermissions'?{display:'prompt'}:{}};
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,fetch:async(url,opts={})=>{const address=String(url?.url||url);if(address.includes('/auth/v1/user')){if(opts.method==='PUT'&&JSON.parse(opts.body).password){started=true;await gate;}const authorization=opts.headers?.get?.('Authorization')||opts.headers?.Authorization||opts.headers?.authorization||'';return new Response(JSON.stringify(authorization.includes(foreignJwt)?foreignUser:session.user),{status:200,headers:{'Content-Type':'application/json'}});}if(address.includes('/auth/v1/logout'))return new Response(null,{status:204});throw new TypeError('offline');}});
 for(const [key,value]of f.seed)w.localStorage.setItem(key,value);const link='todopersonal://auth-callback#type=recovery&access_token='+foreignJwt+'&refresh_token=recovery-only';
 try{w.eval(bundle);await ready(dom);await wait();assert.ok(listeners['App:appUrlOpen']);listeners['App:appUrlOpen']({url:link});await wait();await wait();const d=w.document;assert.equal(d.querySelector('[data-native-reset-form]'),null);assert.match(d.querySelector('.mn-message').textContent,/тот же аккаунт/);assert.equal(JSON.parse(w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token')).user.id,id);assert.equal(JSON.parse(w.localStorage.getItem(cacheKey)).state.notes[0].text,'original text');
 }finally{release();await wait();w.close();}
});

test('native Back leaves recovery without changing records or account',async()=>{
 const f=listFixture(),session=JSON.parse(f.seed[0][1]);let release,started=false;const gate=new Promise(r=>release=r),listeners={};
 const dom=new JSDOM(html,{url:'https://test.local/',runScripts:'outside-only',virtualConsole});const w=dom.window;Object.defineProperty(w.navigator,'languages',{value:['ru-RU']});Object.defineProperty(w,'crypto',{value:webcrypto});w.androidBridge={postMessage(){}};
 const definitions={App:{getLaunchUrl:'promise',minimizeApp:'promise',addListener:'callback',removeListener:'promise'},TimePicker:{deviceFormat:'promise'},Network:{addListener:'callback',removeListener:'promise'},Browser:{open:'promise'},LocalNotifications:{addListener:'callback',removeListener:'promise',cancelAll:'promise',checkPermissions:'promise'}};
 w.Capacitor={PluginHeaders:Object.entries(definitions).map(([name,methods])=>({name,methods:Object.entries(methods).map(([name,rtype])=>({name,rtype}))})),nativeCallback:(plugin,method,opts,cb)=>{listeners[plugin+':'+opts.eventName]=cb;return 'callback-'+Object.keys(listeners).length;},nativePromise:async(plugin,method)=>method==='deviceFormat'?{is24Hour:true}:method==='checkPermissions'?{display:'prompt'}:{}};
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,fetch:async(url,opts={})=>{const address=String(url?.url||url);if(address.includes('/auth/v1/user')){if(opts.method==='PUT'&&JSON.parse(opts.body).password){started=true;await gate;}return new Response(JSON.stringify(session.user),{status:200,headers:{'Content-Type':'application/json'}});}if(address.includes('/auth/v1/logout'))return new Response(null,{status:204});throw new TypeError('offline');}});
 for(const [key,value]of f.seed)w.localStorage.setItem(key,value);const link='todopersonal://auth-callback#type=recovery&access_token='+session.access_token+'&refresh_token=recovery-only';
 try{w.eval(bundle);await ready(dom);await wait();assert.ok(listeners['App:appUrlOpen']);listeners['App:appUrlOpen']({url:link});await wait();await wait();const d=w.document;assert.ok(d.querySelector('[data-native-reset-form]'));assert.ok(listeners['App:backButton']);listeners['App:backButton']();await wait();assert.equal(d.querySelector('[data-native-reset-form]'),null);assert.ok(d.querySelector('.mn-version'));assert.equal(JSON.parse(w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token')).user.id,id);d.querySelector('[data-view="all"]').click();d.querySelector('[data-open="n"]').click();assert.equal(d.querySelector('#mn-details').value,'original text');
 }finally{release();await wait();w.close();}
});

test('duplicate recovery callback must not allow two password-update requests',async()=>{
 const f=listFixture(),session=JSON.parse(f.seed[0][1]);let release,started=false,requestCount=0;const gate=new Promise(r=>release=r),listeners={};
 const dom=new JSDOM(html,{url:'https://test.local/',runScripts:'outside-only',virtualConsole});const w=dom.window;Object.defineProperty(w.navigator,'languages',{value:['ru-RU']});Object.defineProperty(w,'crypto',{value:webcrypto});w.androidBridge={postMessage(){}};
 const definitions={App:{getLaunchUrl:'promise',minimizeApp:'promise',addListener:'callback',removeListener:'promise'},TimePicker:{deviceFormat:'promise'},Network:{addListener:'callback',removeListener:'promise'},Browser:{open:'promise'},LocalNotifications:{addListener:'callback',removeListener:'promise',cancelAll:'promise',checkPermissions:'promise'}};
 w.Capacitor={PluginHeaders:Object.entries(definitions).map(([name,methods])=>({name,methods:Object.entries(methods).map(([name,rtype])=>({name,rtype}))})),nativeCallback:(plugin,method,opts,cb)=>{listeners[plugin+':'+opts.eventName]=cb;return 'callback-'+Object.keys(listeners).length;},nativePromise:async(plugin,method)=>method==='deviceFormat'?{is24Hour:true}:method==='checkPermissions'?{display:'prompt'}:{}};
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,fetch:async(url,opts={})=>{const address=String(url?.url||url);if(address.includes('/auth/v1/user')){if(opts.method==='PUT'&&JSON.parse(opts.body).password){started=true;requestCount++;await gate;}return new Response(JSON.stringify(session.user),{status:200,headers:{'Content-Type':'application/json'}});}if(address.includes('/auth/v1/logout'))return new Response(null,{status:204});throw new TypeError('offline');}});
 for(const [key,value]of f.seed)w.localStorage.setItem(key,value);const link='todopersonal://auth-callback#type=recovery&access_token='+session.access_token+'&refresh_token=recovery-only';
 try{w.eval(bundle);await ready(dom);await wait();assert.ok(listeners['App:appUrlOpen']);listeners['App:appUrlOpen']({url:link});await wait();await wait();const d=w.document;assert.ok(d.querySelector('[data-native-reset-form]'));d.querySelector('#mn-new-password').value='new-test-password';d.querySelector('#mn-repeat-password').value='new-test-password';d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();assert.equal(started,true);assert.equal(d.querySelector('[data-native-reset-form] [type="submit"]').disabled,true);listeners['App:appUrlOpen']({url:link});await wait();await wait();d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();assert.equal(requestCount,1,'duplicate recovery callback must not permit another password update while the first is pending');
 }finally{release();await wait();const state=JSON.parse(w.localStorage.getItem(cacheKey)).state;assert.equal(state.notes[0].text,'original text');assert.equal(JSON.parse(w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token')).user.id,id);console.log('Duplicate-callback audit: requests='+requestCount+', notebook and owner preserved');w.close();}
});

test('native password update failure unlocks retry without changing notebook account',async()=>{
 const f=listFixture(),session=JSON.parse(f.seed[0][1]);let release,started=false,requestCount=0;const gate=new Promise(r=>release=r),listeners={};
 const dom=new JSDOM(html,{url:'https://test.local/',runScripts:'outside-only',virtualConsole});const w=dom.window;Object.defineProperty(w.navigator,'languages',{value:['ru-RU']});Object.defineProperty(w,'crypto',{value:webcrypto});w.androidBridge={postMessage(){}};
 const definitions={App:{getLaunchUrl:'promise',minimizeApp:'promise',addListener:'callback',removeListener:'promise'},TimePicker:{deviceFormat:'promise'},Network:{addListener:'callback',removeListener:'promise'},Browser:{open:'promise'},LocalNotifications:{addListener:'callback',removeListener:'promise',cancelAll:'promise',checkPermissions:'promise'}};
 w.Capacitor={PluginHeaders:Object.entries(definitions).map(([name,methods])=>({name,methods:Object.entries(methods).map(([name,rtype])=>({name,rtype}))})),nativeCallback:(plugin,method,opts,cb)=>{listeners[plugin+':'+opts.eventName]=cb;return 'callback-'+Object.keys(listeners).length;},nativePromise:async(plugin,method)=>method==='deviceFormat'?{is24Hour:true}:method==='checkPermissions'?{display:'prompt'}:{}};
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,fetch:async(url,opts={})=>{const address=String(url?.url||url);if(address.includes('/auth/v1/user')){if(opts.method==='PUT'&&JSON.parse(opts.body).password){started=true;requestCount++;if(requestCount===1)return new Response(JSON.stringify({error_code:'same_password',msg:'private'}),{status:422,headers:{'Content-Type':'application/json'}});}return new Response(JSON.stringify(session.user),{status:200,headers:{'Content-Type':'application/json'}});}if(address.includes('/auth/v1/logout'))return new Response(null,{status:204});throw new TypeError('offline');}});
 for(const [key,value]of f.seed)w.localStorage.setItem(key,value);const link='todopersonal://auth-callback#type=recovery&access_token='+session.access_token+'&refresh_token=recovery-only';
 try{w.eval(bundle);await ready(dom);await wait();assert.ok(listeners['App:appUrlOpen']);listeners['App:appUrlOpen']({url:link});await wait();await wait();const d=w.document;assert.ok(d.querySelector('[data-native-reset-form]'));d.querySelector('#mn-new-password').value='new-test-password';d.querySelector('#mn-repeat-password').value='new-test-password';d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();assert.equal(started,true);assert.equal(d.querySelector('[data-native-reset-form] [type="submit"]').disabled,false);assert.match(d.querySelector('[role="alert"]').textContent,/отличаться/);assert.equal(requestCount,1);d.querySelector('#mn-new-password').value='another-password';d.querySelector('#mn-repeat-password').value='another-password';d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();await wait();assert.equal(requestCount,2);assert.ok(d.querySelector('[data-reset-success]'));d.querySelector('[data-reset-back]').click();assert.ok(d.querySelector('[data-reauth-form]'));assert.match(d.querySelector('[data-reauth-message]').textContent,/Пароль изменён/);
 }finally{release();await wait();const state=JSON.parse(w.localStorage.getItem(cacheKey)).state;assert.equal(state.notes[0].text,'original text');assert.equal(JSON.parse(w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token')).user.id,id);console.log('Duplicate-callback audit: requests='+requestCount+', notebook and owner preserved');w.close();}
});

const lateRecoveryCases = [1, 2, 3].flatMap(phase => [false, true].flatMap(verificationFails => [false, true].map(finishSaveFirst => ({ phase, verificationFails, finishSaveFirst }))));
lateRecoveryCases.push({ phase: 2, verificationFails: true, finishSaveFirst: true, saveFails: true });
for (const { phase, verificationFails, finishSaveFirst, saveFails = false } of lateRecoveryCases) test(`late recovery verification phase ${phase}, error ${verificationFails}, save finished ${finishSaveFirst}, save error ${saveFails} cannot reset the password operation`,async()=>{
 const f=listFixture(),session=JSON.parse(f.seed[0][1]);let release,verifyRelease,holdVerify=false,verificationCalls=0,started=false,requestCount=0;const gate=new Promise(r=>release=r),verifyGate=new Promise(r=>verifyRelease=r),listeners={};
 const dom=new JSDOM(html,{url:'https://test.local/',runScripts:'outside-only',virtualConsole});const w=dom.window;Object.defineProperty(w.navigator,'languages',{value:['ru-RU']});Object.defineProperty(w,'crypto',{value:webcrypto});w.androidBridge={postMessage(){}};
 const definitions={App:{getLaunchUrl:'promise',minimizeApp:'promise',addListener:'callback',removeListener:'promise'},TimePicker:{deviceFormat:'promise'},Network:{addListener:'callback',removeListener:'promise'},Browser:{open:'promise'},LocalNotifications:{addListener:'callback',removeListener:'promise',cancelAll:'promise',checkPermissions:'promise'}};
 w.Capacitor={PluginHeaders:Object.entries(definitions).map(([name,methods])=>({name,methods:Object.entries(methods).map(([name,rtype])=>({name,rtype}))})),nativeCallback:(plugin,method,opts,cb)=>{listeners[plugin+':'+opts.eventName]=cb;return 'callback-'+Object.keys(listeners).length;},nativePromise:async(plugin,method)=>method==='deviceFormat'?{is24Hour:true}:method==='checkPermissions'?{display:'prompt'}:{}};
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,fetch:async(url,opts={})=>{const address=String(url?.url||url);if(address.includes('/auth/v1/user')){if(opts.method!=='PUT'&&holdVerify){verificationCalls++;if(verificationCalls===phase){await verifyGate;if(verificationFails)return new Response(JSON.stringify({error_code:'bad_jwt',msg:'invalid token'}),{status:401,headers:{'Content-Type':'application/json'}});}}if(opts.method==='PUT'&&JSON.parse(opts.body).password){started=true;requestCount++;await gate;if(saveFails&&requestCount===1)return new Response(JSON.stringify({error_code:'same_password',msg:'private'}),{status:422,headers:{'Content-Type':'application/json'}});}return new Response(JSON.stringify(session.user),{status:200,headers:{'Content-Type':'application/json'}});}if(address.includes('/auth/v1/logout'))return new Response(null,{status:204});throw new TypeError('offline');}});
 for(const [key,value]of f.seed)w.localStorage.setItem(key,value);const link='todopersonal://auth-callback#type=recovery&access_token='+session.access_token+'&refresh_token=recovery-only';
 try{w.eval(bundle);await ready(dom);await wait();assert.ok(listeners['App:appUrlOpen']);listeners['App:appUrlOpen']({url:link});await wait();await wait();const d=w.document;assert.ok(d.querySelector('[data-native-reset-form]'));d.querySelector('#mn-new-password').value='new-test-password';d.querySelector('#mn-repeat-password').value='new-test-password';const passwordField=d.querySelector('#mn-new-password');holdVerify=true;listeners['App:appUrlOpen']({url:link});await wait();assert.equal(verificationCalls,phase,'verification must be stalled at the requested phase');d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();assert.equal(started,true);assert.equal(d.querySelector('[data-native-reset-form] [type="submit"]').disabled,true);if(finishSaveFirst){release();await wait();await wait();if(saveFails){assert.equal(d.querySelector('[data-native-reset-form] [type="submit"]').disabled,false);assert.match(d.querySelector('[role="alert"]').textContent,/отличаться/);}else assert.ok(d.querySelector('[data-reset-success]'));}verifyRelease();await wait();await wait();if(saveFails){assert.match(d.querySelector('[role="alert"]').textContent,/отличаться/);assert.equal(d.querySelector('[data-native-reset-form] [type="submit"]').disabled,false);d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();await wait();assert.ok(d.querySelector('[data-reset-success]'));}else if(finishSaveFirst){assert.equal(d.querySelector('[data-native-reset-form]'),null);assert.match(d.querySelector('[data-reset-success]').textContent,/Пароль сохранён/);}else{assert.equal(d.querySelector('#mn-new-password'),passwordField);assert.equal(d.querySelector('[data-native-reset-form] [type="submit"]').disabled,true);d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();}assert.equal(requestCount,saveFails?2:1,'late recovery verification must not permit another password update');
 }finally{verifyRelease();release();await wait();const state=JSON.parse(w.localStorage.getItem(cacheKey)).state;assert.equal(state.notes[0].text,'original text');assert.equal(JSON.parse(w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token')).user.id,id);console.log('Duplicate-callback audit: requests='+requestCount+', notebook and owner preserved');w.close();}
});


const signInRecoveryCases = [false,true].flatMap(verificationFails => [false,true].map(finishSaveFirst => ({phase:1,verificationFails,finishSaveFirst})));

for (const { phase, verificationFails, finishSaveFirst, saveFails = false } of signInRecoveryCases) test(`late sign-in callback phase ${phase}, error ${verificationFails}, save finished ${finishSaveFirst}, save error ${saveFails} cannot reset the password operation`,async()=>{
 const f=listFixture(),session=JSON.parse(f.seed[0][1]);let release,verifyRelease,holdVerify=false,verificationCalls=0,started=false,requestCount=0;const gate=new Promise(r=>release=r),verifyGate=new Promise(r=>verifyRelease=r),listeners={};
 const dom=new JSDOM(html,{url:'https://test.local/',runScripts:'outside-only',virtualConsole});const w=dom.window;Object.defineProperty(w.navigator,'languages',{value:['ru-RU']});Object.defineProperty(w,'crypto',{value:webcrypto});w.androidBridge={postMessage(){}};
 const definitions={App:{getLaunchUrl:'promise',minimizeApp:'promise',addListener:'callback',removeListener:'promise'},TimePicker:{deviceFormat:'promise'},Network:{addListener:'callback',removeListener:'promise'},Browser:{open:'promise'},LocalNotifications:{addListener:'callback',removeListener:'promise',cancelAll:'promise',checkPermissions:'promise'}};
 w.Capacitor={PluginHeaders:Object.entries(definitions).map(([name,methods])=>({name,methods:Object.entries(methods).map(([name,rtype])=>({name,rtype}))})),nativeCallback:(plugin,method,opts,cb)=>{listeners[plugin+':'+opts.eventName]=cb;return 'callback-'+Object.keys(listeners).length;},nativePromise:async(plugin,method)=>method==='deviceFormat'?{is24Hour:true}:method==='checkPermissions'?{display:'prompt'}:{}};
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,fetch:async(url,opts={})=>{const address=String(url?.url||url);if(address.includes('/auth/v1/user')){if(opts.method!=='PUT'&&holdVerify){verificationCalls++;if(verificationCalls===phase){await verifyGate;if(verificationFails)return new Response(JSON.stringify({error_code:'bad_jwt',msg:'invalid token'}),{status:401,headers:{'Content-Type':'application/json'}});}}if(opts.method==='PUT'&&JSON.parse(opts.body).password){started=true;requestCount++;await gate;if(saveFails&&requestCount===1)return new Response(JSON.stringify({error_code:'same_password',msg:'private'}),{status:422,headers:{'Content-Type':'application/json'}});}return new Response(JSON.stringify(session.user),{status:200,headers:{'Content-Type':'application/json'}});}if(address.includes('/auth/v1/logout'))return new Response(null,{status:204});throw new TypeError('offline');}});
 for(const [key,value]of f.seed)w.localStorage.setItem(key,value);const link='todopersonal://auth-callback#type=recovery&access_token='+session.access_token+'&refresh_token=recovery-only';
 try{w.eval(bundle);await ready(dom);await wait();assert.ok(listeners['App:appUrlOpen']);listeners['App:appUrlOpen']({url:link});await wait();await wait();const d=w.document;assert.ok(d.querySelector('[data-native-reset-form]'));d.querySelector('#mn-new-password').value='new-test-password';d.querySelector('#mn-repeat-password').value='new-test-password';const passwordField=d.querySelector('#mn-new-password');holdVerify=true;listeners['App:appUrlOpen']({url:link.replace('type=recovery&','')});await wait();assert.ok(verificationCalls<=phase,'superseded sign-in must be ignored or held before any session installation');d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();assert.equal(started,true);assert.equal(d.querySelector('[data-native-reset-form] [type="submit"]').disabled,true);if(finishSaveFirst){release();await wait();await wait();if(saveFails){assert.equal(d.querySelector('[data-native-reset-form] [type="submit"]').disabled,false);assert.match(d.querySelector('[role="alert"]').textContent,/отличаться/);}else assert.ok(d.querySelector('[data-reset-success]'));}verifyRelease();await wait();await wait();if(saveFails){assert.match(d.querySelector('[role="alert"]').textContent,/отличаться/);assert.equal(d.querySelector('[data-native-reset-form] [type="submit"]').disabled,false);d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();await wait();assert.ok(d.querySelector('[data-reset-success]'));}else if(finishSaveFirst){assert.equal(d.querySelector('[data-native-reset-form]'),null);assert.match(d.querySelector('[data-reset-success]').textContent,/Пароль сохранён/);}else{assert.equal(d.querySelector('#mn-new-password'),passwordField);assert.equal(d.querySelector('[data-native-reset-form] [type="submit"]').disabled,true,'late sign-in result must leave password saving disabled');d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();}assert.equal(requestCount,1,'application lock must still prevent a second request');console.log('Second submit attempted: only '+requestCount+' password request reached the server');
 }finally{verifyRelease();release();await wait();try{const state=JSON.parse(w.localStorage.getItem(cacheKey)).state;assert.equal(state.notes[0].text,'original text');assert.equal(JSON.parse(w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token')).user.id,id);assert.equal(JSON.parse(w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token')).refresh_token,session.refresh_token,'superseded sign-in must not install its session');console.log('Duplicate-callback audit: requests='+requestCount+', notebook and owner preserved');}finally{w.close();}}
});


function orphanDraftSeed(kind = 'note') {
 const f = listFixture(), removed = 'removed-entry', key = `todo-personal:entry-edit-draft:${id}:${removed}`;
 const draft = { editingId: removed, type: kind, text: '', details: 'Незавершённый текст 日本語 😀', date: '2099-01-02', time: '13:05', pinned: true, reminder: { mode: 'custom', date: '2099-01-01', time: '11:00' } };
 return { ...f, removed, key, draft, seed: [...f.seed, [key, JSON.stringify(draft)]] };
}
for (const language of ['ru', 'en']) for (const kind of ['note', 'task']) test(`an edited ${kind} draft remains recoverable after its cloud record is deleted and the app restarts in ${language}`, async () => {
 const f = orphanDraftSeed(kind), dom = boot(f.seed, false, null, [language+'-US']), w = dom.window, d = w.document;
 try {
  await ready(dom);
  const resume = d.querySelector(`[data-continue-draft="${f.removed}"]`);
  assert.ok(resume, 'deleting the saved record must not hide its unfinished draft');
  assert.match(d.querySelector('.mn-draft-panel').textContent,language==='en'?/original entry was deleted/:/Исходная запись удалена/);
  resume.click();
  assert.equal(d.querySelector('#mn-text').value, '');
  assert.equal(d.querySelector('#mn-details').value, f.draft.details);
  assert.equal(d.querySelector('[name="date"]').value, f.draft.date);
  assert.equal(d.querySelector('[name="reminderTime"]').value, f.draft.reminder.time);
  const title = d.querySelector('#mn-text'); title.value = 'Восстановленная запись'; title.dispatchEvent(new w.Event('input', { bubbles: true }));
  d.querySelector('[data-save]').click();
  const state = JSON.parse(w.localStorage.getItem(cacheKey)).state;
  const recovered = kind === 'note' ? state.notes.find(n => n.title === title.value) : state.todos.home.find(n => n.name === title.value);
  assert.ok(recovered); assert.notEqual(recovered.id, f.removed);
  assert.equal(kind === 'note' ? recovered.text : recovered.details, f.draft.details);
  assert.equal(recovered.date, f.draft.date); assert.equal(recovered.reminder.time, f.draft.reminder.time);
  assert.equal(w.localStorage.getItem(f.key), null);
  assert.equal(w.localStorage.getItem(draftKey), null);
  assert.equal(state.notes.find(n => n.id === 'n').text, 'original text');
 } finally { w.close(); }
});
test('failed save and Back preserve an orphaned edit draft', async () => {
 const f = orphanDraftSeed(), dom = boot(f.seed), w = dom.window, d = w.document;
 try {
  await ready(dom); assert.ok(d.querySelector(`[data-continue-draft="${f.removed}"]`));
  d.querySelector(`[data-continue-draft="${f.removed}"]`).click();
  const proto = Object.getPrototypeOf(w.localStorage), original = proto.setItem;
  proto.setItem = function(key, value) { if (key === cacheKey || key === draftKey || key === f.key) throw Error('Quota exceeded'); return original.call(this, key, value); };
  try {
   const title=d.querySelector('#mn-text'); title.value='Recover later'; title.dispatchEvent(new w.Event('input',{bubbles:true}));
   d.querySelector('[data-save]').click(); assert.ok(d.querySelector('#mn-text'));
   d.querySelector('[data-back]').click(); assert.ok(d.querySelector('#mn-text'));
   assert.ok(w.localStorage.getItem(f.key)); assert.equal(JSON.parse(w.localStorage.getItem(cacheKey)).state.notes.length,1);
  } finally { proto.setItem=original; }
 } finally { w.close(); }
});
test('edit drafts belonging to another account are never shown or removed', async () => {
 const f=orphanDraftSeed(), foreign=`todo-personal:entry-edit-draft:other:${f.removed}`, value=JSON.stringify(f.draft), dom=boot([...listFixture().seed,[foreign,value]]), w=dom.window;
 try { await ready(dom); assert.equal(w.document.querySelector('[data-continue-draft]'),null); assert.equal(w.localStorage.getItem(foreign),value); }
 finally { w.close(); }
});

for (const action of ['recovery-email', 'password-sign-in']) test(`late ${action} response cannot unlock a newer password save`, async () => {
 const f=listFixture(),session=JSON.parse(f.seed[0][1]),listeners={};let releaseSave,releaseEmail,emailStarted=false,updates=0;
 const saveGate=new Promise(r=>releaseSave=r),emailGate=new Promise(r=>releaseEmail=r);
 const dom=new JSDOM(html,{url:'https://test.local/',runScripts:'outside-only',virtualConsole}),w=dom.window;
 Object.defineProperty(w.navigator,'languages',{value:['ru-RU']});Object.defineProperty(w,'crypto',{value:webcrypto});w.androidBridge={postMessage(){}};
 const definitions={App:{getLaunchUrl:'promise',minimizeApp:'promise',addListener:'callback',removeListener:'promise'},TimePicker:{deviceFormat:'promise'},Network:{addListener:'callback',removeListener:'promise'},Browser:{open:'promise'},LocalNotifications:{addListener:'callback',removeListener:'promise',cancelAll:'promise',checkPermissions:'promise'}};
 w.Capacitor={PluginHeaders:Object.entries(definitions).map(([name,methods])=>({name,methods:Object.entries(methods).map(([name,rtype])=>({name,rtype}))})),nativeCallback:(plugin,method,opts,cb)=>{listeners[plugin+':'+opts.eventName]=cb;return 'callback-'+Object.keys(listeners).length;},nativePromise:async(plugin,method)=>method==='deviceFormat'?{is24Hour:true}:method==='checkPermissions'?{display:'prompt'}:{}};
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,fetch:async(url,opts={})=>{
  const address=String(url?.url||url);
  if(address.includes('/auth/v1/recover')||address.includes('/auth/v1/token')){emailStarted=true;await emailGate;return new Response(JSON.stringify(action==='password-sign-in'?{...session,refresh_token:'superseded-sign-in'}:{}),{status:200,headers:{'Content-Type':'application/json'}});}
  if(address.includes('/auth/v1/user')){if(opts.method==='PUT'&&JSON.parse(opts.body).password){updates++;await saveGate;}return new Response(JSON.stringify(session.user),{status:200,headers:{'Content-Type':'application/json'}});}
  if(address.includes('/auth/v1/logout'))return new Response(null,{status:204});throw new TypeError('offline');
 }});
 for(const[key,value]of f.seed)w.localStorage.setItem(key,value);
 try{
  w.eval(bundle);await ready(dom);await wait();const d=w.document;
  d.querySelector('[data-view="settings"]').click();d.querySelector('[data-reauthenticate]').click();if(action==='recovery-email')d.querySelector('[data-reauth-recovery]').click();else{d.querySelector('#mn-reauth-password').value='old-test-password';d.querySelector('[data-reauth-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}await wait();assert.equal(emailStarted,true);
  listeners['App:appUrlOpen']({url:'todopersonal://auth-callback#type=recovery&access_token='+session.access_token+'&refresh_token=recovery-only'});await wait();await wait();
  d.querySelector('#mn-new-password').value='new-test-password';d.querySelector('#mn-repeat-password').value='new-test-password';d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();assert.equal(updates,1);
  releaseEmail();await wait();await wait();assert.equal(d.querySelector('[data-native-reset-form] [type="submit"]').disabled,true,'the older email request must not release the password-save UI lock');
  d.querySelector('[data-native-reset-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await wait();assert.equal(updates,1);
 }finally{releaseEmail();releaseSave();await wait();try{assert.equal(JSON.parse(w.localStorage.getItem(cacheKey)).state.notes[0].text,'original text');assert.equal(JSON.parse(w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token')).refresh_token,session.refresh_token);}finally{w.close();}}
});

test('Back and restart preserve a recovered orphan draft before it is saved as a new record', async()=>{
 const f=orphanDraftSeed(),dom=boot(f.seed),w=dom.window,d=w.document;let next;
 try{
  await ready(dom);assert.ok(d.querySelector(`[data-continue-draft="${f.removed}"]`));d.querySelector(`[data-continue-draft="${f.removed}"]`).click();
  d.querySelector('[data-back]').click();assert.ok(d.querySelector('[data-continue-draft]'));assert.equal(JSON.parse(w.localStorage.getItem(draftKey)).details,f.draft.details);
  const seed=Array.from({length:w.localStorage.length},(_,i)=>{const key=w.localStorage.key(i);return[key,w.localStorage.getItem(key)];});next=boot(seed);await ready(next);
  next.window.document.querySelector('[data-continue-draft]').click();assert.equal(next.window.document.querySelector('#mn-details').value,f.draft.details);
  assert.equal(next.window.document.querySelector('[name="reminderTime"]').value,f.draft.reminder.time);
 }finally{w.close();next?.window.close();}
});
test('recovering one deleted record does not hide or overwrite another edited draft',async()=>{
 const f=orphanDraftSeed(),second='removed-second',key=`todo-personal:entry-edit-draft:${id}:${second}`,other={...f.draft,editingId:second,details:'Second unfinished draft'};
 const dom=boot([...f.seed,[key,JSON.stringify(other)]]),w=dom.window,d=w.document;
 try{
  await ready(dom);const button=d.querySelector('[data-continue-draft]');assert.ok(button);assert.equal(button.dataset.continueDraft,f.removed);button.click();
  const input=d.querySelector('#mn-text');input.value='First recovered';input.dispatchEvent(new w.Event('input',{bubbles:true}));d.querySelector('[data-save]').click();
  assert.equal(JSON.parse(w.localStorage.getItem(key)).details,other.details);assert.equal(d.querySelector('[data-continue-draft]').dataset.continueDraft,second);
  d.querySelector('[data-continue-draft]').click();assert.equal(d.querySelector('#mn-details').value,other.details);
 }finally{w.close();}
});

for(const method of ['password','google']) test(`leaving recovery permits a fresh explicit ${method} reauthentication without changing records`,async()=>{
 const f=listFixture(),session=JSON.parse(f.seed[0][1]),listeners={},opened=[];session.user.app_metadata={providers:['email','google']};f.seed[0][1]=JSON.stringify(session);
 const dom=new JSDOM(html,{url:'https://test.local/',runScripts:'outside-only',virtualConsole}),w=dom.window;
 Object.defineProperty(w.navigator,'languages',{value:['ru-RU']});Object.defineProperty(w,'crypto',{value:webcrypto});w.androidBridge={postMessage(){}};
 const definitions={App:{getLaunchUrl:'promise',minimizeApp:'promise',addListener:'callback',removeListener:'promise'},TimePicker:{deviceFormat:'promise'},Network:{addListener:'callback',removeListener:'promise'},Browser:{open:'promise'},LocalNotifications:{addListener:'callback',removeListener:'promise',cancelAll:'promise',checkPermissions:'promise'}};
 w.Capacitor={PluginHeaders:Object.entries(definitions).map(([name,methods])=>({name,methods:Object.entries(methods).map(([name,rtype])=>({name,rtype}))})),nativeCallback:(plugin,name,opts,cb)=>{listeners[plugin+':'+opts.eventName]=cb;return 'callback-'+Object.keys(listeners).length;},nativePromise:async(plugin,name,opts)=>{if(plugin==='Browser')opened.push(opts.url);return name==='deviceFormat'?{is24Hour:true}:name==='checkPermissions'?{display:'prompt'}:{};}};
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,fetch:async(url)=>{
  const address=String(url?.url||url);
  if(address.includes('/auth/v1/user'))return new Response(JSON.stringify(session.user),{status:200,headers:{'Content-Type':'application/json'}});
  if(address.includes('/auth/v1/token'))return new Response(JSON.stringify({...session,refresh_token:'fresh-password'}),{status:200,headers:{'Content-Type':'application/json'}});
  if(address.includes('/auth/v1/logout'))return new Response(null,{status:204});throw new TypeError('offline');
 }});
 for(const[key,value]of f.seed)w.localStorage.setItem(key,value);
 try{
  w.eval(bundle);await ready(dom);await wait();const d=w.document;
  listeners['App:appUrlOpen']({url:'todopersonal://auth-callback#type=recovery&access_token='+session.access_token+'&refresh_token=recovery-only'});await wait();await wait();assert.ok(d.querySelector('[data-native-reset-form]'));
  d.querySelector('[data-cancel-reauth]').click();assert.ok(d.querySelector('.mn-version'));d.querySelector('[data-reauthenticate]').click();
  if(method==='password'){d.querySelector('#mn-reauth-password').value='test-password';d.querySelector('[data-reauth-form]').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));}
  else{d.querySelector('[data-reauth-google]').click();await wait();assert.equal(opened.length,1);listeners['App:appUrlOpen']({url:'todopersonal://auth-callback#access_token='+session.access_token+'&refresh_token=fresh-google'});}
  await wait();await wait();assert.ok(d.querySelector('.mn-version'));assert.equal(JSON.parse(w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token')).refresh_token,'fresh-'+method);
  assert.deepEqual(JSON.parse(w.localStorage.getItem(cacheKey)).state,f.state);
 }finally{w.close();}
});

test('Android date fields open native calendar and preserve chosen deadline/custom reminder through save and restart',async()=>{
 const f=listFixture(),dom=new JSDOM(html,{url:'https://test.local/',runScripts:'outside-only',virtualConsole});const w=dom.window;
 Object.defineProperty(w.navigator,'languages',{value:['en-US']});Object.defineProperty(w,'crypto',{value:webcrypto});w.androidBridge={postMessage(){}};let date='2028-02-29',calls=0;
 const definitions={App:{getLaunchUrl:'promise',minimizeApp:'promise',addListener:'callback',removeListener:'promise'},TimePicker:{deviceFormat:'promise'},DatePicker:{pick:'promise'},Network:{addListener:'callback',removeListener:'promise'},Browser:{open:'promise'},LocalNotifications:{addListener:'callback',removeListener:'promise',cancelAll:'promise',checkPermissions:'promise'}};
 w.Capacitor={PluginHeaders:Object.entries(definitions).map(([name,methods])=>({name,methods:Object.entries(methods).map(([name,rtype])=>({name,rtype}))})),nativeCallback:()=> 'cb',nativePromise:async(plugin,method,options)=>{if(plugin==='DatePicker'){calls++;assert.match(options.date,/^\d{4}-\d{2}-\d{2}$/);return{date,cancelled:false}}return method==='deviceFormat'?{is24Hour:true}:method==='checkPermissions'?{display:'prompt'}:{}}};
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,fetch:async()=>{throw Error('offline')}});for(const [k,v]of f.seed)w.localStorage.setItem(k,v);
 let saved;
 try{w.eval(bundle);await ready(dom);const d=w.document;d.querySelector('.mn-add').click();const input=d.querySelector('#mn-date');assert.equal(input.readOnly,true,'Android must not edit OEM date segments');input.click();await wait();assert.equal(calls,1);assert.equal(input.value,'2028-02-29');assert.equal(d.querySelector('[name="time"]').disabled,false);
 d.querySelector('#mn-text').value='Calendar reminder';d.querySelector('#mn-text').dispatchEvent(new w.Event('input',{bubbles:true}));const mode=d.querySelector('[name="reminderMode"]');mode.value='custom';mode.dispatchEvent(new w.Event('change',{bubbles:true}));date='2028-02-28';d.querySelector('[name="reminderDate"]').click();await wait();d.querySelector('[name="reminderTime"]').value='12:00';d.querySelector('[name="reminderTime"]').dispatchEvent(new w.Event('change',{bubbles:true}));d.querySelector('[data-save]').click();saved=Array.from({length:w.localStorage.length},(_,i)=>{const key=w.localStorage.key(i);return[key,w.localStorage.getItem(key)]});const state=JSON.parse(w.localStorage.getItem(cacheKey)).state;const entry=Object.values(state.todos).flat().find(e=>e.name==='Calendar reminder');assert.equal(entry.date,'2028-02-29');assert.equal(entry.reminder.date,'2028-02-28');assert.equal(entry.reminder.time,'12:00');
 }finally{w.close();}
 const reopened=boot(saved);try{await ready(reopened);const records=JSON.parse(reopened.window.localStorage.getItem(cacheKey)).state;assert.ok(Object.values(records.todos).flat().some(e=>e.date==='2028-02-29'&&e.reminder.date==='2028-02-28'));}finally{reopened.window.close();}
});

test('push click waits for a newer cloud entry instead of dropping the target from an older cached notebook',async()=>{
 const f=listFixture(),cached=JSON.parse(f.seed[1][1]),cloud=JSON.parse(JSON.stringify(cached.state));const now=new Date();now.setSeconds(0,0);const date=[now.getFullYear(),String(now.getMonth()+1).padStart(2,'0'),String(now.getDate()).padStart(2,'0')].join('-'),time=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');cloud.notes[0].reminder={mode:'custom',date,time};cached.state.notes=[];f.seed[1][1]=JSON.stringify(cached);const session=JSON.parse(f.seed[0][1]);let release;const gate=new Promise(r=>release=r);
 const url=new URL('https://test.local/');url.searchParams.set('push-owner',id);url.searchParams.set('push-entry','n');url.searchParams.set('push-at',now.toISOString());const dom=new JSDOM(html,{url:url.href,runScripts:'outside-only',virtualConsole}),w=dom.window;Object.defineProperty(w.document,'hidden',{value:false});Object.defineProperty(w.navigator,'languages',{value:['en-US']});Object.defineProperty(w,'crypto',{value:webcrypto});Object.defineProperty(w.navigator,'serviceWorker',{value:{register:async()=>{throw Error('not available in test')},addEventListener(){}}});Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,fetch:async(address,options={})=>{const u=new URL(String(address?.url||address));if(u.pathname.includes('/rest/v1/notebooks')){if(u.searchParams.get('select')==='revision')return new Response(JSON.stringify({revision:1}));await gate;return new Response(JSON.stringify({...cloud,revision:1,user_id:id}));}if(u.pathname.endsWith('/user'))return new Response(JSON.stringify(session.user));if(u.pathname.endsWith('/settings'))return new Response(JSON.stringify({external:{google:false}}));throw Error('offline')}});for(const[k,v]of f.seed)w.localStorage.setItem(k,v);
 try{w.eval(bundle);await ready(dom);await new Promise(r=>setTimeout(r,1200));release();await new Promise(r=>setTimeout(r,1500));assert.equal(w.document.querySelector('#mn-text')?.value,cloud.notes[0].title||'');assert.ok(w.document.querySelector('[data-save]'),'notification target editor opens after cloud sync');assert.equal(w.location.search,'');}finally{release();w.close();}
});

test('duplicate signup sends once, masked repeat signup never claims delivery or starts confirmation polling',async()=>{
 let release,signups=0,tokens=0;
 const gate=new Promise(resolve=>release=resolve);
 const dom=boot([],false,async(url,options={})=>{
  const address=String(url?.url||url);
  if(address.includes('/auth/v1/settings'))return new Response(JSON.stringify({external:{google:false}}));
  if(address.includes('/auth/v1/signup')){signups++;await gate;return new Response(JSON.stringify({user:{id,identities:[]},session:null}),{headers:{'Content-Type':'application/json'}});}
  if(address.includes('/auth/v1/token'))tokens++;
  throw new TypeError('offline');
 });
 try{
  const d=dom.window.document,w=dom.window;await wait();d.querySelector('#auth-tab-register').click();
  d.querySelector('#auth-email').value='test@example.com';d.querySelector('#auth-password').value='fixture-secret-password';
  for(let i=0;i<2;i++)d.querySelector('#auth-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await wait();assert.equal(signups,1);release();await wait();await wait();
  assert.equal(d.querySelector('#auth-confirm').hidden,false);
  assert.equal(d.querySelector('#auth-confirm-title').textContent,'Аккаунт уже существует');
  assert.match(d.querySelector('#auth-confirm-instructions').textContent,/не заменяет пароль/);
  assert.equal(d.querySelector('#auth-confirm-back').textContent,'Войти');
  assert.equal(d.querySelector('#auth-existing-recovery').hidden,false);
  assert.equal(d.querySelector('#auth-password').value,'');
  assert.equal(d.querySelector('.auth-card__intro').hidden,true);
  w.dispatchEvent(new w.Event('focus'));await wait();assert.equal(tokens,0);
  assert.equal(JSON.stringify(w.localStorage).includes('fixture-secret-password'),false);
  d.querySelector('#auth-existing-recovery').click();await wait();assert.equal(d.querySelector('#auth-recovery-form').hidden,false);assert.equal(d.querySelector('#auth-recovery-email').value,'test@example.com');assert.equal(d.querySelector('#auth-confirm').hidden,true);
 }finally{release();dom.window.close();}
});

for(const language of ['ru-RU','en-US'])for(const header of [true,false])test(`wrong login password releases button and keeps credentials distinct from network failures: ${language}, header ${header}`,async()=>{
 let requests=0,release,cancelled=false;
 const gate=new Promise(r=>release=r);
 const dom=boot([],false,async(input)=>{
  const url=String(input?.url||input);
  if(url.includes('/auth/v1/settings'))return new Response(JSON.stringify({external:{google:false}}),{status:200});
  if(url.includes('/auth/v1/token')){requests++;await gate;return header?{status:400,ok:false,headers:new Headers({'x-sb-error-code':'invalid_credentials'}),body:{cancel(){cancelled=true;return Promise.resolve()}},text:()=>new Promise(()=>{}),json:()=>new Promise(()=>{})}:new Response(JSON.stringify({code:'invalid_credentials',message:'Invalid login credentials'}),{status:400,headers:{'content-type':'application/json','x-supabase-api-version':'2024-01-01'}});}
  throw new TypeError('offline');
 },[language]);
 try{
  await wait();const w=dom.window,d=w.document;d.querySelector('#auth-email').value='audit@example.test';d.querySelector('#auth-password').value='deliberately-wrong';
  const submit=()=>d.querySelector('#auth-form').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));submit();submit();await wait();assert.equal(requests,1);assert.equal(d.querySelector('#auth-submit').disabled,true);
  release();await wait();await wait();assert.equal(d.querySelector('#auth-submit').disabled,false);assert.equal(d.querySelector('#auth-submit').getAttribute('aria-busy'),'false');
  assert.match(d.querySelector('#auth-message').textContent,language==='ru-RU'?/Неверная почта или пароль/:/Incorrect email or password/);assert.equal(d.querySelector('#auth-email').value,'audit@example.test');assert.equal(d.querySelector('#todo-app').hidden,true);if(header)assert.equal(cancelled,true);
 }finally{release();dom.window.close()}
});

function nativeHarness(seed=[], fetcher, launch=null) {
 const dom=new JSDOM(html,{url:'https://test.local/',runScripts:'outside-only',virtualConsole}),w=dom.window,listeners={},calls=[];
 Object.defineProperty(w.navigator,'languages',{value:['ru-RU']});Object.defineProperty(w,'crypto',{value:webcrypto});w.androidBridge={postMessage(){}};
 const definitions={App:{getLaunchUrl:'promise',addListener:'callback',removeListener:'promise'},Browser:{open:'promise'},TimePicker:{deviceFormat:'promise'},Network:{addListener:'callback',removeListener:'promise'},LocalNotifications:{addListener:'callback',removeListener:'promise',cancelAll:'promise',checkPermissions:'promise'},BackupFiles:{save:'promise',pick:'promise'}};
 w.Capacitor={PluginHeaders:Object.entries(definitions).map(([name,methods])=>({name,methods:Object.entries(methods).map(([name,rtype])=>({name,rtype}))})),nativeCallback:(plugin,name,opts,cb)=>{listeners[plugin+':'+opts.eventName]=cb;return 'cb';},nativePromise:async(plugin,name,opts)=>{calls.push({plugin,name,opts});if(plugin==='BackupFiles')return name==='save'?{cancelled:false}:{cancelled:false,data:JSON.stringify({todos:{},notes:[{id:'imported-native',title:'Native file',text:'Kept',date:'',time:''}]})};return name==='getLaunchUrl'?{url:launch}:name==='deviceFormat'?{is24Hour:true}:name==='checkPermissions'?{display:'prompt'}:{};}};
 Object.assign(w,{TextEncoder,TextDecoder,Request,Response,Headers,fetch:fetcher});for(const[k,v]of seed)w.localStorage.setItem(k,v);
 return{dom,w,listeners,calls,start(){w.eval(bundle);},snapshot(){return Array.from({length:w.localStorage.length},(_,i)=>{const k=w.localStorage.key(i);return[k,w.localStorage.getItem(k)]})}};
}
for(const cold of [false,true]) test(`native Google PKCE ${cold?'cold process':'warm return'} requires a local verifier and exchanges a duplicate code only once`,async()=>{
 const session=JSON.parse(listFixture().seed[0][1]);session.user.app_metadata={providers:['google']};let exchanges=0,verifier;
 const response=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 const fetcher=async(url,opts)=>{const address=String(url?.url||url);if(address.includes('/auth/v1/settings'))return response({external:{google:true}});if(address.includes('/auth/v1/token')){exchanges++;const body=JSON.parse(opts.body);assert.equal(body.auth_code,'returned-code');assert.ok(body.code_verifier.length>=43);verifier=body.code_verifier;return response(session);}if(address.includes('/auth/v1/user'))return response(session.user);if(address.includes('/rest/v1/notebooks'))return response({user_id:id,revision:0,todos:{home:[],today:[],week:[]},notes:[]});throw new TypeError('offline');};
 let f=nativeHarness([],fetcher);try{
  f.start();await wait();await wait();const d=f.w.document;assert.equal(d.querySelector('#auth-google').hidden,false);d.querySelector('#auth-google').click();await wait();await wait();
  const opened=f.calls.find(x=>x.plugin==='Browser');assert.ok(opened);const authorize=new URL(opened.opts.url);assert.ok(authorize.searchParams.get('code_challenge'));assert.equal(authorize.searchParams.get('code_challenge_method'),'s256');
  const callback=new URL(authorize.searchParams.get('redirect_to'));callback.searchParams.set('code','returned-code');const link=callback.href;
  assert.equal(f.w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token'),null);
  if(cold){const seed=f.snapshot();f.w.close();f=nativeHarness(seed,fetcher,link);f.start();await wait();await wait();}else{f.listeners['App:appUrlOpen']({url:link});f.listeners['App:appUrlOpen']({url:link});}
  await wait();await ready(f.dom);await wait();f.listeners['App:appUrlOpen']({url:link});await wait();assert.equal(exchanges,1);assert.ok(verifier);assert.equal(JSON.parse(f.w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token')).user.id,id);
  assert.equal(f.w.localStorage.getItem('todo-personal:native-oauth:pending'),null);assert.equal(f.snapshot().filter(([k])=>k.startsWith('todo-personal:native-oauth')).length,0);
 }finally{f.w.close();}
});
test('native unsolicited OAuth tokens or codes cannot sign in a logged-out account',async()=>{
 const session=JSON.parse(listFixture().seed[0][1]);let requests=0;const f=nativeHarness([],async()=>{requests++;throw new TypeError('offline')});try{f.start();await wait();await wait();const before=requests;for(const link of ['todopersonal://auth-callback?code=unsolicited','todopersonal://auth-callback#access_token='+session.access_token+'&refresh_token=injected']){f.listeners['App:appUrlOpen']({url:link});await wait();}assert.equal(requests,before);assert.equal(f.w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token'),null);assert.equal(f.w.document.querySelector('#todo-app').hidden,true);}finally{f.w.close();}
});
test('native backup actions use the user-selected file plugin and import only after confirmation',async()=>{
 const fixture=listFixture(),f=nativeHarness(fixture.seed,async()=>{throw new TypeError('offline')});try{f.start();await ready(f.dom);const d=f.w.document;d.querySelector('[data-view="settings"]').click();d.querySelector('[data-sync-open]').click();d.querySelector('[data-export]').click();await wait();const saved=f.calls.find(x=>x.plugin==='BackupFiles'&&x.name==='save');assert.ok(saved);assert.equal(JSON.parse(saved.opts.data).owner,id);assert.match(saved.opts.name,/\.json$/);d.querySelector('[data-import-backup]').click();await wait();assert.ok(d.querySelector('[data-import-apply]'));assert.deepEqual(JSON.parse(f.w.localStorage.getItem(cacheKey)).state,fixture.state);d.querySelector('[data-import-apply]').click();await wait();await wait();assert.ok(JSON.parse(f.w.localStorage.getItem(cacheKey)).state.notes.some(n=>n.id==='imported-native'));}finally{f.w.close();}
});
for(const other of [false,true]) test(`native PKCE reauthentication ${other?'rejects another owner':'renews the current owner'} without replacing notebook data`,async()=>{
 const fixture=listFixture(),original=JSON.parse(fixture.seed[0][1]);original.user.app_metadata={providers:['google']};fixture.seed[0][1]=JSON.stringify(original);const returned=JSON.parse(JSON.stringify(original));returned.refresh_token='renewed-pkce';if(other)returned.user.id='22222222-2222-4222-8222-222222222222';const response=data=>new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}});
 let exchanged=false;const f=nativeHarness(fixture.seed,async(url,options={})=>{const address=String(url?.url||url);if(address.includes('/auth/v1/settings'))return response({external:{google:true}});if(address.includes('/auth/v1/token')){exchanged=true;return response(returned);}if(address.includes('/auth/v1/user'))return response(exchanged?returned.user:original.user);throw new TypeError('offline');});
 try{f.start();await ready(f.dom);await wait();const d=f.w.document;d.querySelector('[data-view="settings"]').click();d.querySelector('[data-reauthenticate]').click();d.querySelector('[data-reauth-google]').click();await wait();await wait();const opened=f.calls.find(x=>x.plugin==='Browser');assert.ok(opened);const callback=new URL(new URL(opened.opts.url).searchParams.get('redirect_to'));callback.searchParams.set('code','renew-current');f.listeners['App:appUrlOpen']({url:callback.href});await wait();await wait();const stored=JSON.parse(f.w.localStorage.getItem('sb-ihvwqqvndmwtislvgamd-auth-token'));assert.equal(stored.user.id,id);assert.equal(stored.refresh_token,other?original.refresh_token:'renewed-pkce');assert.deepEqual(JSON.parse(f.w.localStorage.getItem(cacheKey)).state,fixture.state);if(other)assert.match(d.querySelector('[data-reauth-error]').textContent,/тот же аккаунт/);}finally{f.w.close();}
});
