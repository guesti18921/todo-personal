const assert=require('node:assert/strict');
module.exports=async(browser,origin)=>{
 for(const language of ['ru-RU','en-US']){
  const context=await browser.newContext({locale:language,viewport:{width:360,height:800},serviceWorkers:'block'});let mode='credentials',attempts=0;
  await context.route('**/*.supabase.co/**',async route=>{
   const url=route.request().url();
   if(url.includes('/settings'))return route.fulfill({json:{external:{google:false}}});
   if(url.includes('/token')){
    attempts++;if(mode==='offline')return route.abort('failed');
    if(mode==='service')return route.fulfill({status:503,json:{code:'unexpected_failure',message:'private server details'}});
    if(mode==='limited')return route.fulfill({status:429,json:{error_code:'over_request_rate_limit',msg:'private'}});
    if(mode==='standard')return route.fulfill({status:400,headers:{'x-supabase-api-version':'2024-01-01'},json:{code:'invalid_credentials',message:'Invalid login credentials'}});
    return route.fulfill({status:400,headers:{'x-sb-error-code':'invalid_credentials',...(mode==='credentials'?{'access-control-expose-headers':'x-sb-error-code,x-supabase-api-version'}:{}),'x-supabase-api-version':'2024-01-01','content-type':'application/json'},body:''});
   }
   return route.abort();
  });
  const p=await context.newPage();try{
   await p.goto(origin);await p.locator('#auth-email').fill('audit@example.test');await p.locator('#auth-password').fill('deliberately-wrong');
   for(mode of ['credentials','standard','rejected','offline','service','limited','credentials']){
    const before=attempts;await p.locator('#auth-submit').click();await p.waitForFunction(()=>!document.querySelector('#auth-submit').disabled);
    assert.equal(attempts,before+1);const message=await p.locator('#auth-message').textContent();
    const expected={standard:/Неверная почта или пароль|Incorrect email or password/,rejected:/Вход отклонён|Sign-in was rejected/,credentials:/Неверная почта или пароль|Incorrect email or password/,offline:/не ответил|did not respond/,service:/временно недоступен|temporarily unavailable/,limited:/Слишком много|Too many/};assert.match(message,expected[mode]);assert.doesNotMatch(message,/private/);
    assert.equal(await p.locator('#auth-submit').getAttribute('aria-busy'),'false');assert.equal(await p.locator('#auth-email').inputValue(),'audit@example.test');assert.equal(await p.locator('#todo-app').isVisible(),false);
   }
  }finally{await context.close()}
 }
 console.log('Login errors: RU/EN, empty rejected body, network failure, service failure, rate limit and repeated attempts passed');
};
