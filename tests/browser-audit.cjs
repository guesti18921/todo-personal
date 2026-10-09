const { chromium } = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const out = path.resolve('audit-output'); fs.mkdirSync(out, { recursive: true });
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
 const file = path.resolve('dist', '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
 if (!file.startsWith(path.resolve('dist') + path.sep)) { res.writeHead(403).end(); return; }
 try { res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream'); res.end(fs.readFileSync(file)); }
 catch { res.writeHead(404).end(); }
});
(async () => {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 const origin = `http://127.0.0.1:${server.address().port}`;
 const browser = await chromium.launch({ headless: true });
 const results = [];
 try {
  for (const [name, width, height, locale] of [['small', 320, 640, 'ru-RU'], ['phone', 360, 800, 'ru-RU'], ['large', 412, 915, 'ru-RU'], ['landscape', 800, 360, 'ru-RU'], ['desktop', 1280, 800, 'ru-RU'], ['english', 360, 800, 'en-US']]) {
   const context = await browser.newContext({ viewport: { width, height }, locale, serviceWorkers: 'block' });
   let mode = 'online', cloud = { user_id: id, revision: 0, ...JSON.parse(JSON.stringify(initial)) };
   await context.route('**/*.supabase.co/**', async route => {
    if (mode === 'offline') { await route.abort('internetdisconnected'); return; }
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.includes('/rest/v1/notebooks')) {
     if (mode === 'limited' || mode === 'server') { await route.fulfill({ status: mode === 'limited' ? 429 : 503, json: { message: 'Fixture error', code: '' } }); return; }
     if (request.method() === 'PATCH') { cloud = { ...cloud, ...request.postDataJSON() }; await route.fulfill({ json: [{ revision: cloud.revision }] }); return; }
     await route.fulfill({ json: url.searchParams.get('select') === 'revision' ? { revision: cloud.revision } : cloud }); return;
    }
    await route.fulfill({ json: url.pathname.endsWith('/settings') ? { external: { google: false } } : user });
   });
   await context.addInitScript(({ seed, cacheKey, language }) => {
    if (!localStorage.getItem(cacheKey)) for (const [key, value] of seed) localStorage.setItem(key, value);
    localStorage.setItem('todo-personal:language', JSON.stringify({ language }));
   }, { seed, cacheKey, language: locale.startsWith('en') ? 'en' : 'ru' });
   const page = await context.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
   await page.goto(origin); await page.locator('.mn-main h1').waitFor();
   await page.locator('[data-view="all"]').click();
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
   await page.locator('[data-view="all"]').click();
   await page.locator('.mn-add').click();
   await page.locator('#mn-text').fill('Купить продукты завтра в 18:00');
   await page.screenshot({ path: path.join(out, name + '-editor.png'), fullPage: true });
   await page.locator('[data-save]').click();
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
   }
   assert.deepEqual(errors, []); results.push({ name, width, height, overflow, javascriptErrors: errors }); await context.close();
  }
  const login = await browser.newContext({ viewport: { width: 320, height: 640 }, serviceWorkers: 'block', locale: 'ru-RU' });
  await login.route('**/*.supabase.co/**', route => route.fulfill({ json: { external: { google: true } } }));
  const p = await login.newPage(); await p.goto(origin); await p.locator('#auth-google').waitFor(); await p.screenshot({ path: path.join(out, 'small-login.png'), fullPage: true });
  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false); await login.close();
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(results, null, 2)); console.log('Browser audit passed:', results.length, 'viewports, sync failures, recovery and offline restart.');
 } finally { await browser.close(); server.close(); }
})().catch(e => { console.error(e); server.close(); process.exitCode = 1; });
