const assert=require('node:assert/strict'),fs=require('node:fs');
module.exports=async(browser,origin,{seed,cacheKey})=>{
 const context=await browser.newContext({viewport:{width:390,height:844},locale:'ru-RU',serviceWorkers:'block',acceptDownloads:true});await context.route('**/*.supabase.co/**',r=>r.abort());
 await context.addInitScript(({seed,cacheKey})=>{if(!localStorage.getItem(cacheKey))for(const[k,v]of seed)localStorage.setItem(k,v)},{seed,cacheKey});
 const p=await context.newPage();try{
  await p.goto(origin);await p.locator('[data-sync-open]').first().click();
  const downloaded=p.waitForEvent('download');await p.locator('[data-export]').click();const file=await downloaded,raw=JSON.parse(fs.readFileSync(await file.path(),'utf8'));assert.equal(raw.format,'todo-personal-backup-v1');assert.ok(raw.owner);assert.ok(raw.state.notes.length);
  const owner=raw.owner,prior=await p.evaluate(k=>localStorage.getItem(k),cacheKey);
  const choose=async value=>{const waiting=p.waitForEvent('filechooser');await p.locator('[data-import-backup]').click();await(await waiting).setFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:JSON.stringify(value))});};
  const backup={format:'todo-personal-backup-v1',owner,state:{todos:{home:[],today:[],week:[]},notes:[{id:'imported-note',title:'Imported <img src=x onerror=alert(1)>',text:'Unicode 😀 日本語',date:'2027-01-01',time:'09:00',reminder:{mode:'at'}}]}};
  await choose(backup);await p.locator('.mn-import-preview').waitFor();assert.equal(await p.evaluate(k=>localStorage.getItem(k),cacheKey),prior);await p.locator('[data-import-cancel]').click();assert.equal(await p.evaluate(k=>localStorage.getItem(k),cacheKey),prior);
  await choose(backup);await p.locator('[data-import-apply]').click();await p.waitForFunction(k=>JSON.parse(localStorage.getItem(k)).state.notes.some(n=>n.id==='imported-note'),cacheKey);await p.waitForFunction(()=>!document.querySelector('[data-import-backup]').disabled);
  const saved=await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).state.notes,cacheKey);assert.equal(saved.length,raw.state.notes.length+1);assert.equal(saved.find(n=>n.id==='imported-note').reminder.mode,'none');assert.equal(await p.locator('.mn-backup-row').count(),1);
  await choose(backup);await p.locator('[data-import-apply]').click();await p.waitForFunction(()=>!document.querySelector('[data-import-backup]').disabled);assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).state.notes.length,cacheKey),saved.length);assert.equal(await p.locator('.mn-backup-row').count(),1);
  await choose({...backup,owner:'other-account'});await p.locator('.mn-sync-error').waitFor();assert.match(await p.locator('.mn-sync-error').textContent(),/другому аккаунту/);assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).state.notes.length,cacheKey),saved.length);
  await choose('not JSON');await p.waitForFunction(()=>document.querySelector('.mn-sync-error')?.textContent.includes('JSON'));
  await p.locator('[data-backup-delete]').click();assert.equal(await p.locator('.mn-backup-row').count(),1);await p.locator('[data-backup-delete-cancel]').click();assert.equal(await p.locator('.mn-backup-row').count(),1);await p.locator('[data-backup-delete]').click();await p.locator('[data-backup-delete-confirm]').click();await p.waitForFunction(()=>!document.querySelector('.mn-backup-row'));assert.equal(await p.evaluate(k=>JSON.parse(localStorage.getItem(k)).state.notes.length,cacheKey),saved.length);
 }finally{await context.close()}
 console.log('Backup UI: real JSON download, explicit import preview/cancel, preserved entries, alarm safety, repeated restore, foreign-file rejection and confirmed deletion passed');
};
