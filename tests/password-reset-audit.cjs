const assert = require('node:assert/strict');
const path = require('node:path');
module.exports = async function(browser, origin, out) {
 const id='11111111-1111-4111-8111-111111111111';
 const jwt=Buffer.from('{"alg":"HS256"}').toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:id,exp:Math.floor(Date.now()/1000)+86400})).toString('base64url')+'.test';
 for(const locale of ['ru-RU','en-US']) for(const [width,height] of [[320,568],[390,844],[736,900]]) {
  const context=await browser.newContext({viewport:{width,height},locale});
  const page=await context.newPage();let updates=0,release,fail=true;const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await context.addInitScript(()=>localStorage.setItem('existing-notebook-account','keep'));
  await page.route('https://*.supabase.co/**',async route=>{
   if(route.request().method()==='PUT') { updates++; await new Promise(resolve=>release=resolve); if(fail){await route.fulfill({status:422,contentType:'application/json',body:JSON.stringify({code:'same_password',error_code:'same_password',msg:'Same password'})});return;} }
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id,email:'audit@example.test',aud:'authenticated',role:'authenticated'})});
  });
  try {
   await page.goto(origin+'/reset-password.html#type=recovery&access_token='+jwt+'&refresh_token=audit');
   await page.locator('#reset-form').waitFor();assert.equal(new URL(page.url()).hash,'');
   assert.equal(await page.locator('#new-password').inputValue(),'');
   const eye=page.locator('[data-reset-eye="new-password"]');
   const geometry=await eye.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.querySelector('svg').getBoundingClientRect(),input=document.querySelector('#new-password').getBoundingClientRect();return {dx:Math.abs(a.x+a.width/2-b.x-b.width/2),dy:Math.abs(a.y+a.height/2-b.y-b.height/2),inputDy:Math.abs(a.y+a.height/2-input.y-input.height/2)};});
   for(const delta of Object.values(geometry))assert.ok(delta<1,JSON.stringify(geometry));
   await eye.click();assert.equal(await page.locator('#new-password').getAttribute('type'),'text');assert.equal(await page.locator('#repeat-password').getAttribute('type'),'password');
   assert.equal(await eye.getAttribute('aria-pressed'),'true');await eye.click();
   await page.locator('#new-password').fill('new-password-audit');await page.locator('#repeat-password').fill('mismatch');await page.locator('#save-password').click();
   await page.waitForFunction(()=>/не совпадают|do not match/.test(document.querySelector('#reset-error').textContent));assert.equal(updates,0);
   await page.locator('#repeat-password').fill('new-password-audit');await page.locator('#save-password').click();
   await page.waitForFunction(()=>document.querySelector('#save-password').disabled);
   assert.equal(await page.locator('#return-message').isVisible(),false);await page.waitForTimeout(50);release();
   await page.waitForFunction(()=>/отличаться|differ/.test(document.querySelector('#reset-error').textContent));
   assert.equal(await page.locator('#return-message').isVisible(),false);assert.equal(await page.locator('#save-password').isEnabled(),true);
   await page.addScriptTag({url:origin+'/__audit-axe.js'});
   assert.deepEqual(await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>v.id)),[]);
   await page.evaluate(()=>document.fonts.ready);
   const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,bg:getComputedStyle(document.querySelector('.pr-card')).backgroundColor,accent:getComputedStyle(document.querySelector('#save-password')).backgroundColor}));
   assert.deepEqual(layout,{overflow:false,bg:'rgb(255, 253, 251)',accent:'rgb(195, 141, 158)'});
   await page.screenshot({path:path.join(out,`reset-${locale}-${width}.png`),fullPage:true});
   fail=false;await page.locator('#save-password').click();await page.waitForFunction(()=>document.querySelector('#save-password').disabled);await page.waitForTimeout(50);release();
   await page.locator('#return-message').waitFor();assert.equal(await page.locator('#reset-form').isVisible(),false);
   assert.match(await page.locator('[data-reset-success] h1').textContent(),/Пароль сохранён|Password saved/);
   assert.equal(await page.evaluate(()=>localStorage.getItem('existing-notebook-account')),'keep');assert.equal(await page.evaluate(()=>localStorage.length),1);assert.equal(updates,2);assert.deepEqual(errors,[]);
   await page.screenshot({path:path.join(out,`reset-success-${locale}-${width}.png`),fullPage:true});
  } finally {await context.close();}
 }
 console.log('Password reset: 6 layouts, independent centered eyes, server failure/pending/success, account isolation and accessibility passed');
};
