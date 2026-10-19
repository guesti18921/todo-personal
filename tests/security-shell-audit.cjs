const assert=require('node:assert/strict');
module.exports=async(browser,origin)=>{
 const c=await browser.newContext({locale:'ru-RU',serviceWorkers:'block'});let frameAuth=0;
 await c.route('**/*.supabase.co/**',r=>{frameAuth++;return r.fulfill({json:{external:{google:false}}})});
 const p=await c.newPage();try{
  await p.route(origin+'/__embed.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body><iframe src="'+origin+'/"></iframe></body></html>'}));
  await p.goto(origin+'/__embed.html');await p.frameLocator('iframe').locator('main h1').waitFor();assert.match(await p.frameLocator('iframe').locator('main h1').textContent(),/Откройте/);assert.equal(await p.frameLocator('iframe').locator('#auth-form').count(),0);assert.equal(frameAuth,0);
  await p.goto(origin);await p.locator('#auth-form').waitFor();
  await assert.rejects(p.addScriptTag({content:'window.__untrustedInline = true'}));assert.equal(await p.evaluate(()=>window.__untrustedInline),undefined);
  const policy=await p.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');assert.match(policy,/script-src 'self'/);assert.doesNotMatch(policy,/unsafe-eval|script-src[^;]*unsafe-inline/);assert.match(policy,/font-src 'self'/);
 }finally{await c.close()}
 console.log('Security shell: embedded app never starts Auth, inline script injection blocked, normal standalone login loads');
};
