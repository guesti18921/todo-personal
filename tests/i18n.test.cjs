const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
async function moduleUnderTest() {
 const context = vm.createContext({});
 const dict = new vm.SourceTextModule(fs.readFileSync('src/translations.en.js', 'utf8'), { context });
 await dict.link(() => {});
 const mod = new vm.SourceTextModule(fs.readFileSync('src/i18n.js', 'utf8'), { context });
 await mod.link(() => dict); await mod.evaluate(); return mod.namespace;
}
function storage() { const data = new Map(); return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; }
test('device language uses the primary locale, supports RU/EN and falls back to English without country or IP', async () => {
 const m = await moduleUnderTest();
 assert.equal(m.detectLanguage(['en-RU']), 'en'); assert.equal(m.detectLanguage(['ru-DE']), 'ru');
 assert.equal(m.detectLanguage(['de-DE', 'ru-RU']), 'en'); assert.equal(m.detectLanguage([]), 'en');
 const disk = storage(), p = m.createLanguagePreferences({ storage: disk, languages: ['ru-RU'] });
 assert.equal(p.getLanguage(), 'ru'); assert.equal(p.choose('en'), true);
 assert.equal(m.createLanguagePreferences({ storage: disk, languages: ['ru-RU'] }).getLanguage(), 'en');
 assert.equal(p.choose('de'), false);
});
test('interface templates preserve interpolated multilingual entry contents and do not translate or truncate notes', async () => {
 const m = await moduleUnderTest(); m.setLanguage('en');
 const content = 'Сегодня Задача <script> 中文 日本語 Deutsch 😀\n'.repeat(40);
 assert.equal(m.ui(['<p>Сегодня</p><span>', '</span>'], content), '<p>Today</p><span>'+content+'</span>');
 assert.equal(m.t('Срок · необязательно'), 'Deadline · optional');
 m.setLanguage('ru'); assert.equal(m.ui(['Сегодня ', ''], content), 'Сегодня '+content);
});
test('offline account choices stay isolated, survive restart, and override stale remote metadata until sync succeeds', async () => {
 const m = await moduleUnderTest(), disk = storage(); let online = false, payload;
 const updateUser = async options => { if (!online) throw Error('offline'); payload=options; return { data: { user: { id: 'a' } } }; };
 const p=m.createLanguagePreferences({ storage: disk, languages:['ru'],updateUser });
 p.bindUser({ id:'a',user_metadata:{[m.LANGUAGE_METADATA]:'ru'} }); p.choose('en'); await p.sync();
 p.bindUser({ id:'a',user_metadata:{[m.LANGUAGE_METADATA]:'ru'} }); assert.equal(p.getLanguage(),'en');
 p.bindUser({ id:'b',user_metadata:{[m.LANGUAGE_METADATA]:'ru'} }); assert.equal(p.getLanguage(),'ru');
 const q=m.createLanguagePreferences({storage:disk,languages:['ru'],updateUser});
 q.bindUser({ id:'a',user_metadata:{[m.LANGUAGE_METADATA]:'ru'} }); assert.equal(q.getLanguage(),'en');
 online=true; await q.sync(); assert.equal(payload.data[m.LANGUAGE_METADATA],'en');
 assert.equal(JSON.parse(disk.getItem(m.LANGUAGE_KEY+':a')).dirty,false);
 const newDevice=m.createLanguagePreferences({storage:storage(),languages:['ru']});
 newDevice.bindUser({id:'a',user_metadata:{[m.LANGUAGE_METADATA]:'en'}}); assert.equal(newDevice.getLanguage(),'en');
});
test('storage failure does not silently change the UI, and explicit pre-login choice wins over account metadata', async () => {
 const m=await moduleUnderTest(); let error;
 const broken={getItem:()=>null,setItem:()=>{throw Error('quota');}};
 const p=m.createLanguagePreferences({storage:broken,languages:['ru'],onStatus:value=>error=value});
 assert.equal(p.choose('en'),false); assert.equal(p.getLanguage(),'ru'); assert.equal(error,'error');
 const q=m.createLanguagePreferences({storage:storage(),languages:['ru']}); q.choose('en');
 q.bindUser({id:'a',user_metadata:{[m.LANGUAGE_METADATA]:'ru'}}); assert.equal(q.getLanguage(),'en');
});
test('a delayed metadata response cannot overwrite a newer selection or another account', async () => {
 const m=await moduleUnderTest(), disk=storage(); let complete;
 const p=m.createLanguagePreferences({storage:disk,languages:['ru'],updateUser:()=>new Promise(resolve=>complete=resolve)});
 p.bindUser({id:'a'}); p.choose('en'); const pending=p.sync(); p.choose('ru');
 complete({data:{user:{id:'a'}}}); await pending;
 assert.equal(p.getLanguage(),'ru'); assert.equal(JSON.parse(disk.getItem(m.LANGUAGE_KEY+':a')).dirty,true);
 const next=p.sync(); p.bindUser({id:'b',user_metadata:{[m.LANGUAGE_METADATA]:'en'}});
 complete({data:{user:{id:'a'}}}); await next; assert.equal(p.getLanguage(),'en');
 assert.equal(JSON.parse(disk.getItem(m.LANGUAGE_KEY+':b')).language,'en');
});

test('cached startup cannot mark an unknown account language dirty before the authenticated session arrives', async () => {
 const m=await moduleUnderTest(), disk=storage();
 const p=m.createLanguagePreferences({storage:disk,languages:['ru']});
 p.bindUser({id:'a'},{cached:true});assert.equal(disk.getItem(m.LANGUAGE_KEY+':a'),null);
 p.bindUser({id:'a',user_metadata:{[m.LANGUAGE_METADATA]:'en'}});
 assert.equal(p.getLanguage(),'en');assert.equal(JSON.parse(disk.getItem(m.LANGUAGE_KEY+':a')).dirty,false);
});
