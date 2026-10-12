const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const out = path.resolve('audit-output'); fs.mkdirSync(out, { recursive: true });
const assets = path.resolve(process.env.TODO_ASSET_ROOT || 'dist');
const id = '11111111-1111-4111-8111-111111111111';
const authKey = 'sb-ihvwqqvndmwtislvgamd-auth-token';
const cacheKey = 'todo-personal:local:' + id;
const date = new Date().toISOString().slice(0, 10);
const initial = { todos: { home: [{ id: 'task', name: 'Проверить работу блокнота', date, time: '18:00', createdAt: '2026-10-07T10:00:00Z' }], today: [], week: [] }, notes: [{ id: 'note', title: 'Идеи для проекта', text: 'Русский · English · 日本語 · 😀', pinned: true, createdAt: '2026-10-08T10:00:00Z' }] };
const user = { id, email: 'audit@example.test', aud: 'authenticated', role: 'authenticated', user_metadata: {} };
const exp = Math.floor(Date.now() / 1000) + 86400;
const jwt = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url') + '.' + Buffer.from(JSON.stringify({ sub: id, exp, role: 'authenticated' })).toString('base64url') + '.test';
const seed = [[authKey, JSON.stringify({ access_token: jwt, refresh_token: 'test-only', expires_at: exp, expires_in: 86400, token_type: 'bearer', user })], [cacheKey, JSON.stringify({ schemaVersion: 1, revision: 0, state: initial, dirty: false, savedAt: new Date().toISOString() })]];
const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
 const url = new URL(req.url, 'http://localhost');
 const file = path.resolve(assets, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
 if (!file.startsWith(assets + path.sep)) { res.writeHead(403).end(); return; }
 try { res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
 catch { res.writeHead(404).end(); }
});
(async () => {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const origin = `http://127.0.0.1:${server.address().port}`;
 const browser = await chromium.launch({ headless: true, ...(process.env.TODO_CHROMIUM_PATH ? { executablePath: process.env.TODO_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-gpu'] } : {}) });
 const results = [];
 try {
  for (const [name, width, height, locale, appLanguage] of [['small', 320, 640, 'ru-RU'], ['phone', 360, 800, 'ru-RU'], ['large', 412, 915, 'ru-RU'], ['landscape', 800, 360, 'ru-RU'], ['desktop', 1280, 800, 'ru-RU'], ['english', 360, 800, 'en-US'], ['english-small', 320, 640, 'en-GB'], ['english-wide', 412, 915, 'en-US'], ['english-ru-os', 360, 800, 'ru-RU', 'en'], ['russian-en-os', 360, 800, 'en-US', 'ru']]) {
   const context = await browser.newContext({ viewport: { width, height }, locale, serviceWorkers: 'block' });
   let downloadGate = null, downloadStarted = false, authGate = null;
   let mode = 'online', cloud = { user_id: id, revision: 0, ...JSON.parse(JSON.stringify(initial)) };
   await context.route('**/*.supabase.co/**', async route => {
    if (mode === 'offline') { await route.abort('internetdisconnected'); return; }
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.includes('/rest/v1/notebooks')) {
     if (mode === 'limited' || mode === 'server') { await route.fulfill({ status: mode === 'limited' ? 429 : 503, json: { message: 'Fixture error', code: '' } }); return; }
     if (request.method() === 'PATCH') {
      assert.equal(url.searchParams.get('user_id'), 'eq.' + id);
      if (url.searchParams.get('revision') !== 'eq.' + cloud.revision) { await route.fulfill({ json: [] }); return; }
      cloud = { ...cloud, ...request.postDataJSON() }; await route.fulfill({ json: [{ revision: cloud.revision }] }); return;
     }
     if (downloadGate && url.searchParams.get('select') !== 'revision') { const gate = downloadGate; downloadGate = null; downloadStarted = true; await gate; }
     await route.fulfill({ json: url.searchParams.get('select') === 'revision' ? { revision: cloud.revision } : cloud }); return;
    }
    if (authGate && url.pathname.endsWith('/user')) await authGate;
    await route.fulfill({ json: url.pathname.endsWith('/settings') ? { external: { google: false } } : user });
   });
   await context.addInitScript(({ seed, cacheKey, language }) => {
    if (!localStorage.getItem(cacheKey)) for (const [key, value] of seed) localStorage.setItem(key, value);
    localStorage.setItem('todo-personal:language', JSON.stringify({ language }));
   }, { seed, cacheKey, language: appLanguage || (locale.startsWith('en') ? 'en' : 'ru') });
   const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
   await page.goto(origin); await page.locator('.mn-main h1').waitFor();
   await page.locator('[data-view="all"]').click();
   assert.equal(await page.locator('.mn-status').evaluate(el => el.scrollWidth <= el.clientWidth && getComputedStyle(el).textOverflow !== 'ellipsis'), true, 'saving status must remain fully readable at ' + width);
   await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
   const accessibility = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })));
   assert.deepEqual(accessibility, [], 'accessibility failures at ' + width + ': ' + JSON.stringify(accessibility));
   await page.screenshot({ path: path.join(out, name + '-list.png'), fullPage: true });
   await page.locator('[data-view="settings"]').click();
   await page.locator('.mn-setting details summary').first().click();
   await page.evaluate(() => window.dispatchEvent(new Event('focus')));
   await page.waitForTimeout(200);
   assert.equal(await page.locator('.mn-setting details').first().getAttribute('open') !== null, true, 'expanded settings survive sync');
   await page.screenshot({ path: path.join(out, name + '-settings.png'), fullPage: true });
   const english = (appLanguage || (locale.startsWith('en') ? 'en' : 'ru')) === 'en';
   await page.locator('[data-time-format]').selectOption(english ? '12' : '24');
   await page.locator('[data-view="all"]').click();
   await page.locator('.mn-add').click();
   await page.locator('#mn-text').fill(english ? 'Tomorrow I have a doctors appointment at 3 p.m.' : 'Купить продукты завтра в 18:00');
   assert.match(await page.locator('.mn-suggestion-title').innerText(), english ? /3:00 PM/ : /18:00/);
   await page.locator('[data-accept-deadline]').click();
   const choose = async (name, hour, minute, period) => {
    await page.locator(`[data-clock="${name}"] [data-clock-open]`).click();
    const dialog=page.locator('.mn-time-dialog');
    await dialog.locator('[data-clock-part="hour"]').selectOption(hour);
    await dialog.locator('[data-clock-part="minute"]').selectOption(minute);
    if(period)await dialog.locator('[data-clock-part="period"]').selectOption(period);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth+1),false,'picker overflow: '+name);
    await page.screenshot({path:path.join(out,`${name}-picker-${width}.png`)});
    await dialog.locator('.mn-primary').click();
   };
   if(english){
    await choose('time','12','0','AM');assert.equal(await page.locator('[name="time"]').inputValue(),'00:00');
    await choose('time','12','0','PM');assert.equal(await page.locator('[name="time"]').inputValue(),'12:00');
    await choose('time','3','45','PM');
    await page.locator('[name="reminderMode"]').selectOption('custom');
    await page.locator('[name="reminderDate"]').fill('2099-01-02');
    await choose('reminderTime','12','0','AM');
    assert.equal(await page.locator('[name="reminderTime"]').inputValue(),'00:00');
    assert.match(await page.locator('.mn-reminder-preview').innerText(),/12:00\s*AM/);
   }else{
    await choose('time','15','0');assert.equal(await page.locator('[name="time"]').inputValue(),'15:00');
   }
   // Cancelling must leave the canonical deadline unchanged.
   const before=await page.locator('[name="time"]').inputValue();
   await page.locator('[data-clock="time"] [data-clock-open]').click();
   await page.locator('.mn-time-dialog [data-clock-part="hour"]').selectOption('1');
   await page.locator('.mn-time-dialog .mn-secondary').click();
   assert.equal(await page.locator('[name="time"]').inputValue(),before);
   const editorAccessibility = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => n.target) })));
   assert.deepEqual(editorAccessibility, [], 'editor accessibility: ' + name + JSON.stringify(editorAccessibility));
   assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, 'editor overflow: ' + name);
   await page.evaluate(() => window.scrollTo(0, 0));
   await page.screenshot({ path: path.join(out, name + '-editor.png'), fullPage: true });
   if (english) {
    await page.locator('[data-clock="time"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(out, name + '-clock.png') });
   }
   await page.locator('[data-save]').click();
   if (english) {
    const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)).state.todos.home.find(e => e.name.startsWith('Tomorrow I have')), cacheKey);
    assert.equal(stored.time, '15:45'); assert.equal(stored.reminder.time, '00:00');
    await page.locator('[data-view="all"]').click();
    assert.match(await page.locator(`[data-open="${stored.id}"]`).innerText(), /appointment/);
    await page.locator(`[data-open="${stored.id}"]`).click();
    assert.equal(await page.locator('[data-clock="time"] [data-clock-part="period"]').inputValue(), 'PM');
    assert.equal(await page.locator('[data-clock="reminderTime"] [data-clock-part="period"]').inputValue(), 'AM');
    await page.locator('[data-save]').click();
   }
   const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
   assert.equal(overflow, false, 'no horizontal scrolling at ' + width);
   if (name === 'phone') {
    mode = 'limited'; await page.locator('[data-sync-open]').first().click(); await page.locator('[data-sync-now]').click();
    await page.waitForFunction(() => document.querySelector('.mn-diagnostic')?.textContent.includes('HTTP 429'));
    assert.match(await page.locator('.mn-main').innerText(), /Синхронизация отложена/);
    await page.screenshot({ path: path.join(out, 'phone-limited.png'), fullPage: true });
    mode = 'server'; await page.locator('[data-sync-now]').click();
    await page.waitForFunction(() => document.querySelector('.mn-diagnostic')?.textContent.includes('HTTP 503'));
    mode = 'offline'; await page.locator('[data-sync-now]').click();
    await page.waitForFunction(() => document.querySelector('.mn-main').textContent.includes('нет соединения с сервером'));
    mode = 'online'; await page.locator('[data-sync-now]').click();
    await page.waitForFunction(() => document.querySelector('.mn-main').textContent.includes('Синхронизировано'));
    assert.ok(cloud.todos.home.some(e => e.name === 'Купить продукты завтра в 18:00'));
    await page.locator('[data-view="all"]').click();
    mode = 'offline'; await page.reload(); await page.locator('.mn-main h1').waitFor();
    await page.locator('[data-view="all"]').click(); assert.match(await page.locator('.mn-list').innerText(), /Купить продукты/);
    mode = 'online';
    await page.locator('[data-sync-open]').first().click(); await page.locator('[data-sync-now]').click();
    await page.waitForFunction(() => document.querySelector('.mn-status')?.dataset.state === 'confirmed');
    const oldTitle = cloud.notes.find(n => n.id === 'note').title;
    cloud = { ...cloud, revision: cloud.revision + 1, notes: cloud.notes.map(n => n.id === 'note' ? { ...n, title: 'Remote download race' } : n) };
    let release; downloadGate = new Promise(resolve => { release = resolve; });
    await page.locator('[data-sync-now]').click();
    for (let i = 0; i < 40 && !downloadStarted; i++) await page.waitForTimeout(50);
    assert.equal(downloadStarted, true);
    await page.locator('[data-view="all"]').click(); await page.locator('[data-open="note"]').click();
    const editor = await page.locator('#mn-text').elementHandle(); release();
    await page.waitForFunction(() => document.querySelector('.mn-status')?.textContent.includes('Есть обновления'));
    assert.equal(await editor.evaluate(el => el.isConnected), true);
    assert.equal(await page.locator('#mn-text').inputValue(), oldTitle);
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).state.notes.find(n => n.id === 'note').title, cacheKey), oldTitle);
    assert.equal(await page.locator('.mn-status').getAttribute('data-state'), 'local');
    await page.locator('[data-back]').click();
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).dirty, cacheKey), false);
    await page.locator('[data-sync-open]').first().click(); await page.locator('[data-sync-now]').click();
    await page.waitForFunction(() => document.querySelector('.mn-status')?.dataset.state === 'confirmed');
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).state.notes.find(n => n.id === 'note').title, cacheKey), 'Remote download race');
    cloud = { ...cloud, revision: cloud.revision + 1, notes: cloud.notes.map(n => n.id === 'note' ? { ...n, title: oldTitle } : n) };
    await page.locator('[data-sync-now]').click();
    await page.waitForFunction(() => document.querySelector('.mn-status')?.dataset.state === 'confirmed');
   }
   // Reproduce the real keyboard lifecycle: Android resizes the viewport
   // after focus. Losing this DOM node immediately dismisses its keyboard.
   await page.locator('[data-view="settings"]').click();
   await page.locator('[data-reauthenticate]').click();
   await page.locator('#mn-reauth-password').fill('test-only-password');
   const password = await page.locator('#mn-reauth-password').elementHandle();
   await page.setViewportSize({ width, height: Math.max(220, height - 220) });
   await page.evaluate(() => window.dispatchEvent(new Event('resize')));
   assert.equal(await password.evaluate(el => el.isConnected && document.activeElement === el && el.value === 'test-only-password'), true, 'password focus survives keyboard resize: '+name);
   await page.screenshot({ path: path.join(out, name+'-reauth-keyboard.png') });
   await page.setViewportSize({ width, height });
   await page.locator('[data-cancel-reauth]').click();
   await page.locator('[data-view="all"]').click();
   await page.locator('[data-open="note"]').click();
   await page.locator('#mn-text').fill(''); await page.locator('#mn-details').fill('');
   await page.locator('[data-back]').click();
   assert.equal(await page.locator('#mn-text').count(), 0, 'empty draft can be left: '+name);
   assert.match(await page.locator('.mn-draft-panel').innerText(), /Идеи для проекта/);
   await page.reload(); await page.locator('[data-continue-draft="note"]').waitFor();
   await page.locator('[data-continue-draft="note"]').click();
   assert.equal(await page.locator('#mn-text').inputValue(), '');
   await page.locator('[data-restore-saved]').click();
   assert.equal(await page.locator('#mn-text').inputValue(), 'Идеи для проекта');
   await page.locator('[data-back]').click();
   await page.locator('.mn-add').click();
   for (const phrase of ['Встреча 10/12', '15 октрября купить машину', 'Встреча завтра в 6 00']) {
    await page.locator('#mn-text').fill(phrase);
    assert.equal(await page.locator('.mn-suggestion').isVisible(), true, phrase+' at '+name);
    assert.equal(await page.locator('[name="date"]').inputValue(), '', 'unconfirmed suggestion does not change deadline');
   }
   await page.locator('#mn-text').fill('Встреча 10/12');
   await page.locator('[data-accept-deadline][data-choice-index="1"]').click();
   assert.equal(await page.locator('.mn-suggestion').isVisible(), false);
   const confirmed = await page.locator('[name="date"]').inputValue();
   await page.locator('[data-save]').click(); await page.reload(); await page.locator('.mn-main h1').waitFor();
   await page.locator('[data-view="all"]').click();
   await page.locator('.mn-open').filter({hasText:'Встреча 10/12'}).click();
   assert.equal(await page.locator('[name="date"]').inputValue(), confirmed, 'chosen deadline survives restart');
   await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
   const savedAccessibility = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] } })).violations.map(v=>v.id));
   assert.deepEqual(savedAccessibility, []);
   if (['small', 'english-small'].includes(name)) {
    mode = 'online'; let releaseAuth; authGate = new Promise(resolve => { releaseAuth = resolve; });
    await page.evaluate(owner => sessionStorage.setItem('todo-personal:reauth-google', JSON.stringify({owner,startedAt:Date.now()})), id);
    await page.goto(origin + '/?reauth=google#type=recovery&access_token=' + jwt + '&refresh_token=test-recovery');
    await page.locator('.mn-main h1').waitFor(); await page.locator('[data-view="all"]').click(); await page.locator('[data-open="note"]').click();
    await page.locator('#mn-text').fill(''); await page.locator('#mn-details').fill('Preserve this draft during recovery');
    releaseAuth(); await page.locator('[data-native-reset-form]').waitFor();
    assert.equal(await page.evaluate(owner => JSON.parse(localStorage.getItem('todo-personal:entry-edit-draft:'+owner+':note')).details, id), 'Preserve this draft during recovery');
    assert.equal(await page.locator('.mn-main h1').textContent(), name==='english-small' ? 'New password' : 'Новый пароль');
    await page.locator('#mn-new-password').fill('test-password'); const resetInput=await page.locator('#mn-new-password').elementHandle();
    await page.setViewportSize({width,height:Math.max(220,height-220)}); await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
    assert.equal(await resetInput.evaluate(el=>el.isConnected && document.activeElement===el && el.value==='test-password'),true);
    await page.setViewportSize({width,height}); await page.screenshot({path:path.join(out,name+'-password-recovery.png'),fullPage:true});
    await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
    assert.deepEqual(await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>v.id)),[]);
    await page.locator('[data-cancel-reauth]').click(); await page.locator('[data-view="all"]').click(); await page.locator('[data-open="note"]').click();
    assert.equal(await page.locator('#mn-details').inputValue(),'Preserve this draft during recovery');
    // A remote deletion must not make the unfinished local edit inaccessible.
    await page.locator('[data-back]').click();
    await page.locator('[data-sync-open]').first().click(); await page.locator('[data-sync-now]').click();
    await page.waitForFunction(()=>document.querySelector('.mn-status')?.dataset.state==='confirmed');
    cloud = { ...cloud, revision: cloud.revision + 1, notes: cloud.notes.filter(n=>n.id!=='note') };
    await page.locator('[data-sync-now]').click();
    await page.waitForFunction(key=>JSON.parse(localStorage.getItem(key)).state.notes.every(n=>n.id!=='note'),cacheKey);
    await page.locator('[data-view="all"]').click(); await page.locator('[data-continue-draft="note"]').waitFor();
    assert.match(await page.locator('.mn-draft-panel').innerText(),name==='english-small'?/original entry was deleted/:/Исходная запись удалена/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
    await page.locator('[data-continue-draft="note"]').click();
    assert.equal(await page.locator('#mn-text').inputValue(),'');
    assert.equal(await page.locator('#mn-details').inputValue(),'Preserve this draft during recovery');
    await page.locator('#mn-text').fill('Recovered cloud-deleted entry'); await page.locator('[data-save]').click();
    const recoveredId=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).state.notes.find(n=>n.title==='Recovered cloud-deleted entry').id,cacheKey);
    assert.notEqual(recoveredId,'note');
    assert.equal(await page.evaluate(owner=>localStorage.getItem('todo-personal:entry-edit-draft:'+owner+':note'),id),null);
    mode='offline'; await page.reload(); await page.locator('.mn-main h1').waitFor();
    await page.locator('[data-view="all"]').click(); await page.locator(`[data-open="${recoveredId}"]`).click();
    assert.equal(await page.locator('#mn-details').inputValue(),'Preserve this draft during recovery');
   }
   assert.deepEqual(errors, []); results.push({ name, width, height, overflow, javascriptErrors: errors, keyboardFocus: true, emptyDraftRecovery: true, dateParsing: true }); await context.close();
  }
  const login = await browser.newContext({ viewport: { width: 320, height: 640 }, serviceWorkers: 'block', locale: 'ru-RU' });
  await login.route('**/*.supabase.co/**', route => route.fulfill({ json: { external: { google: true } } }));
  const p = await login.newPage(); await p.goto(origin); await p.locator('#auth-google').waitFor(); await p.screenshot({ path: path.join(out, 'small-login.png'), fullPage: true });
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); await login.close();
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2)); console.log('Browser audit passed:', results.length, 'viewports, sync failures, recovery and offline restart.');
 } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
