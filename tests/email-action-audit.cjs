const assert = require('node:assert/strict');
module.exports = async function(browser, origin) {
 const token = 'email_action_test_only_0123456789';
 const base = 'https://ihvwqqvndmwtislvgamd.supabase.co/auth/v1/verify';
 const redirects = ['https://todo.m1strell.com/reset-password.html?native=android','https://guesti18921.github.io/todo-personal/email-confirmed.html','todopersonal://auth-callback'];
 for (const locale of ['ru-RU','en-US']) for (const type of ['signup','recovery']) for (const redirect of redirects) {
  const context = await browser.newContext({locale,viewport:{width:320,height:700}});
  await context.addInitScript(()=>localStorage.setItem('existing-notebook','keep'));
  const page = await context.newPage(); let calls=0,received,referrer;
  await page.route('https://*.supabase.co/**',async route=>{calls++;received=route.request().url();referrer=route.request().headers().referer;await route.fulfill({status:200,contentType:'text/plain',body:'Mock verification only'});});
  const inner = base+'?token='+token+'&type='+type+'&redirect_to='+encodeURIComponent(redirect);
  await page.goto(origin+'/email-action.html#confirmation_url='+encodeURIComponent(inner));
  await page.locator('#continue:not([hidden])').waitFor();
  assert.equal(page.url(),origin+'/email-action.html');assert.equal(calls,0);
  assert.equal(await page.evaluate(()=>window.todoEmailAction),undefined);
  assert.deepEqual(await page.evaluate(()=>Object.keys(localStorage)),['existing-notebook']);
  assert.equal(await page.evaluate(()=>localStorage.getItem('existing-notebook')),'keep');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  assert.equal(await page.locator('body').textContent().then(s=>s.includes(token)),false);
  await page.locator('#continue').click();await page.waitForURL('https://ihvwqqvndmwtislvgamd.supabase.co/**');
  assert.equal(calls,1);assert.equal(received,inner);assert.equal(referrer,undefined);
  await context.close();
 }
 const invalid = ['', '#confirmation_url=https%3A%2F%2Fevil.example%2Fauth%2Fv1%2Fverify', '#confirmation_url=javascript%3Aalert(1)',
  '#confirmation_url='+encodeURIComponent(base+'?token='+token+'&type=recovery&redirect_to=https://evil.example/'),
  '#confirmation_url='+encodeURIComponent(base+'?token='+token+'&type=recovery&type=signup'),
  '#confirmation_url='+encodeURIComponent(base+'?token='+token+'&type=invite'),
  '#confirmation_url='+encodeURIComponent(base+'?token=x&type=recovery')];
 for(const fragment of invalid){
  const context=await browser.newContext();const page=await context.newPage();let calls=0;
  await page.route('https://*.supabase.co/**',route=>{calls++;return route.abort();});
  await page.goto(origin+'/email-action.html'+fragment);await page.locator('#back:not([hidden])').waitFor();
  assert.equal(await page.locator('#continue').isVisible(),false);assert.equal(calls,0);assert.equal(new URL(page.url()).hash,'');await context.close();
 }
 const reuse=await browser.newContext();const reusedPage=await reuse.newPage();
 await reusedPage.goto(origin+'/email-action.html');await reusedPage.locator('#back:not([hidden])').waitFor();
 await reusedPage.goto(origin+'/email-action.html#confirmation_url='+encodeURIComponent(base+'?token='+token+'&type=signup'));
 await reusedPage.locator('#continue:not([hidden])').waitFor();assert.equal(new URL(reusedPage.url()).hash,'');await reuse.close();
 // An expired token is handled by the existing reset screen after server verification.
 const context=await browser.newContext({locale:'ru-RU'});const page=await context.newPage();
 await page.route('https://*.supabase.co/**',route=>route.fulfill({status:302,headers:{location:origin+'/reset-password.html#error=access_denied&error_code=otp_expired'}}));
 await page.goto(origin+'/email-action.html#confirmation_url='+encodeURIComponent(base+'?token='+token+'&type=recovery'));
 await page.locator('#continue').click();await page.locator('#status').filter({hasText:'Ссылка недействительна'}).waitFor();
 assert.equal(await page.locator('#reset-form').isVisible(),false);await context.close();
 console.log('Email action: web/native redirects, token privacy, invalid URLs and expired link passed.');
};
