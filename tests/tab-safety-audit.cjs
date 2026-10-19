const assert=require('node:assert/strict');
module.exports=async(browser,origin,{seed,cacheKey})=>{
 const c=await browser.newContext({viewport:{width:360,height:800},locale:'ru-RU',serviceWorkers:'block'});
 await c.route('**/*.supabase.co/**',r=>r.abort());
 // A hanging third-party font must no longer delay app startup.
 let externalFonts=0;await c.route('https://fonts.googleapis.com/**',r=>{externalFonts++;return new Promise(()=>{})});
 await c.addInitScript(({seed,cacheKey})=>{if(!localStorage.getItem(cacheKey))for(const[k,v]of seed)localStorage.setItem(k,v)},{seed,cacheKey});
 const a=await c.newPage(),b=await c.newPage();try{
  await a.goto(origin);await a.locator('#todo-app:not([hidden])').waitFor();await b.goto(origin);
  await b.waitForFunction(()=>document.querySelector('#auth-message').textContent.includes('другой вкладке'));
  assert.equal(await b.locator('#todo-app').isVisible(),false);
  await a.locator('[data-view="all"]').click();await a.locator('[data-open="note"]').click();await a.locator('#mn-text').fill('Offline edit in tab A');await a.locator('[data-back]').click();
  const pending=await c.newPage();await pending.goto(origin);await pending.waitForFunction(()=>document.querySelector('#auth-message').textContent.includes('другой вкладке'));await pending.close();
  await a.close();await b.locator('#todo-app:not([hidden])').waitFor();await b.locator('[data-view="all"]').click();await b.locator('[data-open="note"]').click();assert.equal(await b.locator('#mn-text').inputValue(),'Offline edit in tab A');
  await b.locator('#mn-details').fill('Offline edit in tab B');await b.locator('[data-back]').click();await b.reload();await b.locator('#todo-app:not([hidden])').waitFor();
  const saved=await b.evaluate(k=>JSON.parse(localStorage.getItem(k)).state.notes.find(n=>n.id==='note'),cacheKey);assert.equal(saved.title,'Offline edit in tab A');assert.equal(saved.text,'Offline edit in tab B');assert.equal(externalFonts,0);
 }finally{await c.close()}
 console.log('Shared-origin tabs: single writer, automatic handoff, cancelled waiter, offline restart and local fonts passed');
};
