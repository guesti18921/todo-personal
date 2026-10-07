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
  d.querySelector('[data-view="settings"]').click(); assert.match(d.querySelector('.mn-main').textContent, /версия 0\.4\.6/);
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
  assert.match(doc.querySelector('#auth-message').textContent, /Не удалось открыть записи/);
  assert.equal(doc.body.textContent.includes(secret), false);
  const buttons = Array.from(doc.querySelectorAll('.auth-retry'));
  assert.equal(buttons.every(b => !b.hidden && !b.disabled), true);
  buttons.find(b => /другой аккаунт/.test(b.textContent)).click(); await wait(); await wait();
  assert.equal(doc.querySelector('#auth-form').hidden, false);
  assert.equal(doc.querySelector('#todo-app').hidden, true);
  assert.equal(buttons.every(b => b.hidden), true);
 } finally { dom.window.close(); }
});

test('English login and registration preserve typed credentials and explicit language through restart', async () => {
 let signUpOptions;
 let dom = boot([], false, async (request, options) => {
  const url=String(request?.url||request);
  if(url.includes('/auth/v1/settings')) return new Response(JSON.stringify({external:{google:true}}));
  if(url.includes('/auth/v1/signup')) { signUpOptions=JSON.parse(options.body); return new Response(JSON.stringify({user:{id,email:'test@example.com',identities:[]},session:null}),{headers:{'Content-Type':'application/json'}}); }
  if(url.includes('/auth/v1/token')) return new Response(JSON.stringify({error_code:'invalid_credentials',msg:'Invalid login credentials'}),{status:400,headers:{'Content-Type':'application/json'}});
  throw Error('Unexpected request');
 }, ['en-RU']);
 try {
  let d=dom.window.document; await wait();
  assert.equal(d.documentElement.lang,'en'); assert.equal(d.querySelector('#auth-title').textContent,'Sign in');
  assert.equal(d.querySelector('#auth-google').textContent,'Continue with Google');
  d.querySelector('#auth-email').value='test@example.com'; d.querySelector('#auth-password').value='good-password';
  d.querySelector('#auth-password-toggle').click();
  const choose=value=>{const el=d.querySelector('#auth-language');el.value=value;el.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
  choose('ru'); choose('en');
  assert.equal(d.querySelector('#auth-password').value,'good-password'); assert.equal(d.querySelector('#auth-password').type,'text');
  assert.equal(d.querySelector('#auth-password-toggle').textContent,'Hide password');
  assert.equal(d.querySelector('#auth-email').value,'test@example.com');
  d.querySelector('#auth-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})); await wait();
  assert.match(d.querySelector('#auth-message').textContent,/Incorrect email or password/);
  d.querySelector('#auth-switch').click(); choose('ru'); choose('en');
  assert.equal(d.querySelector('#auth-title').textContent,'Create an account');
  d.querySelector('#auth-form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})); await wait();
  assert.equal(d.querySelector('#auth-confirm').hidden,false); assert.match(d.querySelector('#auth-confirm').textContent,/Check your email/);
  assert.equal(signUpOptions.data.todo_personal_language,'en');
  const seed=Array.from({length:dom.window.localStorage.length},(_,i)=>{const key=dom.window.localStorage.key(i);return[key,dom.window.localStorage.getItem(key)];});
  dom.window.close();dom=boot(seed,false,null,['ru-RU']);d=dom.window.document;
  assert.equal(d.documentElement.lang,'en');
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
