const assert=require('node:assert/strict');
module.exports=async function auditEmailNotices(browser,origin,out,{seed,cacheKey}){
 let checked=0;
 const fit=async(p,width,height,label)=>{
  await p.evaluate(()=>document.fonts.ready);
  const size=await p.evaluate(()=>({w:document.documentElement.scrollWidth,h:document.documentElement.scrollHeight}));
  if(size.h>height+1)await p.screenshot({path:out+'/email-overflow.png',fullPage:true});
  assert.ok(size.w<=width+1,label+' horizontal overflow '+JSON.stringify(size));
  assert.ok(size.h<=height+1,label+' vertical overflow '+JSON.stringify(size));
  const heading=p.locator('[aria-labelledby="auth-confirm-title"] #auth-confirm-title, #mn-mail-title');
  const alignment=await heading.evaluate(el=>{const a=el.getBoundingClientRect(),b=el.closest('.auth-card').getBoundingClientRect();return Math.abs((a.left+a.right)/2-(b.left+b.right)/2)});
  assert.ok(alignment<1,label+' heading centered');
  assert.deepEqual(await p.evaluate(async()=>(await axe.run(document.querySelector('#auth-screen:not([hidden]),.mn-mail-notice'),{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))),[],label+' accessibility');
 };
 for(const locale of ['ru-RU','en-US'])for(const[width,height]of[[320,568],[360,640],[390,844],[736,900],[1280,800]]){
  const context=await browser.newContext({locale,viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'});
  let mode='recovery',sent=0;
  await context.route('**/*.supabase.co/**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.endsWith('/settings'))return route.fulfill({json:{external:{google:true}}});
   if(path.endsWith('/signup')){sent++;if(mode==='existing-error')return route.fulfill({status:422,json:{error_code:'user_already_exists',msg:'User already registered'}});return route.fulfill({json:{user:{id:'notice-fixture',identities:mode==='masked'?[]:[{provider:'email'}]},session:null}})}
   if(path.endsWith('/recover')){sent++;return route.fulfill(mode==='error'?{status:503,json:{error_code:'unexpected_failure',msg:'Fixture failure'}}:{json:{}})}
   if(path.endsWith('/token'))return route.fulfill({status:400,json:{error_code:'email_not_confirmed',msg:'Email not confirmed'}});
   return route.abort();
  });
  const p=await context.newPage();
  try{
   for(mode of ['recovery','signup','masked','existing-error','unconfirmed']){
    await p.goto(origin);await p.locator('#auth-google').waitFor();await p.addScriptTag({url:origin+'/__audit-axe.js'});
    const email='a'.repeat(64)+'@'+'b'.repeat(50)+'.example.test';
    await p.locator('#auth-email').fill(email);
    if(mode==='recovery'){
     await p.locator('#auth-forgot').click();await p.locator('#auth-recovery-send').click();
    }else{
     if(mode!=='unconfirmed')await p.locator('#auth-tab-register').click();
     await p.locator('#auth-password').fill('fixture-password-123');await p.locator('#auth-submit').click();
    }
    await p.locator('#auth-confirm').waitFor();
    assert.equal(await p.locator('#auth-confirm-email').textContent(),email);
    assert.equal(await p.locator('.auth-card__intro').isVisible(),false);
    assert.equal(await p.locator('#auth-tabs').isVisible(),false);
    assert.equal(await p.locator('#auth-form').isVisible(),false);
    assert.equal(await p.locator('#auth-recovery-form').isVisible(),false);
    assert.equal(await p.locator('#auth-message').textContent(),'');
    assert.equal(await p.locator('#auth-password').inputValue(),'');
    await fit(p,width,height,locale+' '+mode+' '+width);
    if(['masked','existing-error'].includes(mode)){
     assert.equal(await p.locator('#auth-confirm-title').textContent(),locale==='ru-RU'?'Аккаунт уже существует':'Account already exists');
     assert.equal(await p.locator('#auth-confirm-back').textContent(),locale==='ru-RU'?'Войти':'Sign in');
     assert.equal(await p.locator('#auth-existing-recovery').isVisible(),true);
     assert.doesNotMatch(await p.locator('#auth-confirm-instructions').textContent(),/письмо|email.*sent/i);
     await p.locator('#auth-existing-recovery').click();await p.locator('#auth-recovery-form').waitFor();
     assert.equal(await p.locator('#auth-recovery-email').inputValue(),email);
     await p.locator('#auth-recovery-back').click();
     if(mode==='masked'){checked++;continue;}
     await p.locator('#auth-tab-register').click();await p.locator('#auth-password').fill('fixture-password-123');await p.locator('#auth-submit').click();await p.locator('#auth-confirm').waitFor();
    }
    await p.screenshot({path:out+'/email-'+locale+'-'+width+'-'+mode+'.png',fullPage:true});
    await p.locator('#auth-confirm-back').click();await p.locator('#auth-submit').waitFor();
    assert.equal(await p.locator('.auth-card__intro').isVisible(),true);
    checked++;
   }
   mode='error';await p.locator('#auth-forgot').click();await p.locator('#auth-recovery-send').click();
   await p.waitForFunction(()=>!document.querySelector('#auth-recovery-send').disabled);
   assert.equal(await p.locator('#auth-confirm').isVisible(),false);assert.equal(await p.locator('#auth-recovery-form').isVisible(),true);
  }finally{await context.close()}
 }
 // A recovery request from the notebook opens a receipt and keeps local data intact.
 for(const locale of ['ru-RU','en-US']){
  const context=await browser.newContext({locale,viewport:{width:320,height:568},reducedMotion:'reduce',serviceWorkers:'block'});
  await context.addInitScript(seed=>{for(const[k,v]of seed)localStorage.setItem(k,v)},seed);
  await context.route('**/*.supabase.co/**',route=>new URL(route.request().url()).pathname.endsWith('/recover')?route.fulfill({json:{}}):route.abort());
  const p=await context.newPage();
  try{
   await p.goto(origin);await p.locator('.mn-main h1').waitFor();
   const before=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)).state,cacheKey);
   await p.locator('[data-view="settings"]').click();await p.locator('[data-reauthenticate]').click();await p.locator('[data-reauth-recovery]').click();
   await p.locator('.mn-mail-notice').waitFor();await p.addScriptTag({url:origin+'/__audit-axe.js'});
   await fit(p,320,568,'notebook recovery '+locale);
   assert.deepEqual(await p.evaluate(key=>JSON.parse(localStorage.getItem(key)).state,cacheKey),before);
   await p.screenshot({path:out+'/email-notebook-'+locale+'.png',fullPage:true});
   await p.locator('[data-mail-back]').click();await p.locator('[data-reauth-screen]').waitFor();
  }finally{await context.close()}
 }
 console.log('Email receipt audit passed: '+checked+' signed-out states, RU/EN, long addresses, failures, centered headings, accessibility and notebook data preservation.');
};
