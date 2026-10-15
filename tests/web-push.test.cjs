const { test }=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const path=require('node:path');const {webcrypto}=require('node:crypto');
async function sourceModule(file,extras={}){
 const ctx=vm.createContext({Request,Response,URL,Date,JSON,Intl,Uint8Array,TextEncoder,atob,crypto:webcrypto,setTimeout,clearTimeout,...extras});const cache=new Map();
 async function load(file){if(cache.has(file))return cache.get(file);let m;if(file.startsWith('npm:')){const actual=require(file.replace(/^npm:/,'').replace(/@\d[^/]*$/,''));m=new vm.SyntheticModule(Object.keys(actual),function(){for(const k of Object.keys(actual))this.setExport(k,actual[k])},{context:ctx});}else m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context:ctx});cache.set(file,m);await m.link(name=>load(name.startsWith('npm:')?name:path.resolve(path.dirname(file),name)));return m;}const m=await load(path.resolve(file));await m.evaluate();return m.namespace;
}
const plain=v=>JSON.parse(JSON.stringify(v));
const validSub={endpoint:'https://fcm.googleapis.com/fcm/send/test-endpoint',keys:{p256dh:Buffer.concat([Buffer.from([4]),Buffer.alloc(64,1)]).toString('base64url'),auth:Buffer.alloc(16,2).toString('base64url')}};
test('server time model matches existing reminders across zones, DST, noon, offsets and custom dates',async()=>{
 const server=await sourceModule('supabase/functions/_shared/pushModel.js');const local=await sourceModule('src/reminderModel.js');
 const original=process.env.TZ;try{for(const zone of ['UTC','Europe/Moscow','America/New_York','Europe/Berlin','Asia/Tokyo']){process.env.TZ=zone;for(const date of ['2026-10-15','2026-03-08','2026-11-01','2026-03-29','2026-10-25'])for(const time of ['00:00','01:30','02:30','03:30','12:00','15:00'])for(const mode of ['none','at','15','60','day','custom']){const e={id:'entry',date,time,reminder:{mode,date,time}};assert.equal(server.reminderInstant(e,zone),local.reminderMoment(e)?.toISOString()||null,JSON.stringify({zone,date,time,mode}));}}}finally{if(original===undefined)delete process.env.TZ;else process.env.TZ=original;}
 assert.equal(server.reminderInstant({id:'x',date:'2027-02-29',reminder:{mode:'at'}},'UTC'),null);
});
test('push endpoint validation prevents arbitrary network destinations and malformed keys',async()=>{
 const m=await sourceModule('supabase/functions/_shared/pushModel.js');assert.equal(m.validSubscription(validSub),true);
 for(const endpoint of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://localhost/x','https://fcm.googleapis.com.evil.test/x','https://user:pass@fcm.googleapis.com/x','https://fcm.googleapis.com:444/x','https://fcm.googleapis.com/x#bad'])assert.equal(m.validSubscription({...validSub,endpoint}),false,endpoint);
 assert.equal(m.validSubscription({...validSub,keys:{auth:'bad',p256dh:'bad'}}),false);
});
test('dispatch plan excludes past opt-in, completed, deleted and stale reminders',async()=>{
 const m=await sourceModule('supabase/functions/_shared/pushModel.js');const e={id:'x',date:'2026-10-15',time:'12:00',reminder:{mode:'at'}};const sub={enabled_at:'2026-10-15T11:59:00.000Z',time_zone:'UTC'};
 assert.equal(m.dueReminders({notes:[e]},sub,'2026-10-15T12:00:30.000Z').length,1);
 for(const [notes,s,now]of [[[{...e,checked:true}],sub,'2026-10-15T12:00:30.000Z'],[[],sub,'2026-10-15T12:00:30.000Z'],[[e],{...sub,enabled_at:'2026-10-15T12:01:00Z'},'2026-10-15T12:01:30.000Z'],[[e],sub,'2026-10-15T13:00:00.000Z']])assert.equal(m.dueReminders({notes},s,now).length,0);
});
async function apiFixture({owner='a',prior=null,fail=false}={}){
 const m=await sourceModule('supabase/functions/_shared/pushApi.js');const calls=[];
 const server={auth:{getUser:async token=>({data:{user:token==='valid'&&owner?{id:owner}:null}})},from(table){const conditions={};const q={select(){return q},eq(k,v){conditions[k]=v;return q},maybeSingle(){return q},delete(){calls.push({table,action:'delete',conditions});return q},insert(row){calls.push({table,action:'insert',row});return q},update(row){calls.push({table,action:'update',row,conditions});return q},then(yes,no){return Promise.resolve({data:prior,count:0,error:fail?{code:'db'}:null}).then(yes,no)}};return q}};
 const handler=m.createPushApi({server,publicKey:'public',enabled:true,hashEndpoint:async()=> 'hash'});
 const request=(body,token='valid')=>handler(new Request('https://test/functions/v1/push-subscriptions',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)}));return{request,calls};
}
test('subscription API verifies owner; cannot select another account or take its endpoint',async()=>{
 const body={action:'subscribe',subscription:validSub,timeZone:'UTC',language:'en'};let f=await apiFixture();assert.equal((await f.request(body,'invalid')).status,401);assert.equal(f.calls.length,0);assert.equal((await f.request({...body,owner_id:'victim'})).status,400);assert.equal((await f.request(body)).status,200);assert.equal(f.calls[0].row.owner_id,'a');
 f=await apiFixture({prior:{id:'sub',owner_id:'b'}});assert.equal((await f.request(body)).status,409);assert.equal(f.calls.length,0);
 f=await apiFixture();assert.equal((await f.request({action:'unsubscribe',subscription:validSub})).status,200);assert.equal(f.calls[0].conditions.owner_id,'a');
 f=await apiFixture({fail:true});assert.equal((await f.request(body)).status,503);
});
async function clientFixture(){
 let id='a',sub=null,permissionValue='granted',sendMode='ok',release;const statuses=[],bindings=[],requests=[],disk=new Map();let unsubscribed=0,subscribes=0;
 const reg={active:{},pushManager:{getSubscription:async()=>sub,subscribe:async()=>{subscribes++;return sub={toJSON:()=>validSub,unsubscribe:async()=>{unsubscribed++;sub=null;return true}}}}};
 const m=await sourceModule('src/webPush.js');const client=m.createWebPush({supported:true,nav:{serviceWorker:{register:async()=>reg,getRegistration:async()=>reg}},storage:{getItem:k=>disk.get(k),setItem:(k,v)=>disk.set(k,v),removeItem:k=>disk.delete(k)},permission:{get permission(){return permissionValue},requestPermission:()=>Promise.resolve(permissionValue)},auth:{getSession:async()=>({data:{session:{user:{id},access_token:'private-test-token'}}})},fetcher:async(url,options)=>{const b=JSON.parse(options.body);requests.push(b);if(sendMode==='offline')throw Error('offline');if(sendMode==='held'&&b.action==='subscribe')await new Promise(r=>release=r);return new Response(JSON.stringify(b.action==='config'?{enabled:sendMode!=='disabled',publicKey:validSub.keys.p256dh}:{enabled:true}),{status:200})},serverUrl:'https://test',publicKey:'public',bindWorker:async owner=>bindings.push(owner),onStatus:s=>statuses.push(plain(s)),timeZone:()=> 'UTC'});
 await client.setAccount(id);return{client,statuses,bindings,requests,disk,get unsubscribed(){return unsubscribed},get subscribes(){return subscribes},set id(v){id=v},set permission(v){permissionValue=v},set mode(v){sendMode=v},release:()=>release()};
}
test('browser permission, configured server, opt-in and offline disable are consistent',async()=>{
 const f=await clientFixture();assert.equal(await f.client.enable(),true);assert.equal(f.bindings.at(-1),'a');assert.equal(f.disk.get('todo-personal:web-push:a'),'true');assert.equal(f.statuses.at(-1).enabled,true);
 f.mode='offline';assert.equal(await f.client.disable(),true);assert.equal(f.bindings.at(-1),null);assert.equal(f.unsubscribed,1);assert.equal(f.disk.size,0);assert.equal(f.statuses.at(-1).enabled,false);
 for(const mode of ['denied','disabled','offline']){const g=await clientFixture();if(mode==='denied')g.permission='denied';else g.mode=mode;assert.equal(await g.client.enable(),false);assert.equal(g.statuses.at(-1).enabled,false);assert.ok(g.statuses.at(-1).error);assert.equal(g.disk.size,0);}
});
test('account switch during a late subscribe cannot bind old push to a new account',async()=>{
 const f=await clientFixture();f.mode='held';const activation=f.client.enable();while(!f.requests.some(r=>r.action==='subscribe'))await new Promise(r=>setImmediate(r));f.id='b';const switched=f.client.setAccount('b');f.release();await activation;await switched;assert.equal(f.bindings.includes('a'),false);assert.equal(f.statuses.at(-1).enabled,false);assert.equal(f.disk.has('todo-personal:web-push:a'),false);assert.ok(f.unsubscribed>=1);
});
function workerFixture(){
 const handlers=new Map(),disk=new Map(),shown=[],windows=[],messages=[];let storageFail=false,focuses=0,opened=0;
 const indexedDB={open(){const op={};queueMicrotask(()=>{if(storageFail){op.onerror();return;}op.result={objectStoreNames:{contains:()=>true},close(){},transaction(){const tx={};tx.objectStore=()=>({get(key){const result={result:disk.get(key)};queueMicrotask(()=>tx.oncomplete());return result},put(value,key){disk.set(key,value);const result={};queueMicrotask(()=>tx.oncomplete());return result}});return tx}};op.onsuccess()});return op}};
 const registration={scope:'https://todo.test/',getNotifications:async()=>[],showNotification:async(title,options)=>shown.push({title,...plain(options)})};
 const client={url:'https://todo.test/',focus:async()=>{focuses++},postMessage:m=>messages.push(plain(m))};
 const self={registration,location:new URL('https://todo.test/sw.js'),addEventListener:(k,f)=>handlers.set(k,f),clients:{matchAll:async()=>windows,openWindow:async()=>opened++}};
 vm.runInNewContext(fs.readFileSync('dist/push-worker.js','utf8'),{self,indexedDB,URL,Date,Promise});
 async function fire(type,extra){let pending;handlers.get(type)({...extra,waitUntil:p=>pending=p});if(pending)await pending;}
 const payload={version:1,owner:'a',entryId:'note',at:new Date(Date.now()-1000).toISOString(),language:'en'};
 return{shown,disk,messages,payload,client,windows,get focuses(){return focuses},get opened(){return opened},set storageFail(v){storageFail=v},bind:owner=>fire('message',{source:client,data:{type:'todo-push-bind',owner},ports:[{postMessage(){}}]}),push:(data=payload)=>fire('push',{data:{json:()=>data}}),click:data=>fire('notificationclick',{notification:{data,close(){}}})};
}
test('closed-tab worker persists account binding, deduplicates, and drops previous-account or invalid pushes',async()=>{
 const f=workerFixture();await f.bind('a');await f.push();await f.push();assert.equal(f.shown.length,1);assert.doesNotMatch(JSON.stringify(f.shown),/private-test-token|note contents/);await f.bind('b');await f.push({...f.payload,entryId:'other'});assert.equal(f.shown.length,1);await f.bind(null);await f.push({...f.payload,owner:'b'});assert.equal(f.shown.length,1);await f.bind('a');f.storageFail=true;await f.push({...f.payload,entryId:'new'});assert.equal(f.shown.length,1);
});
test('notification click preserves an existing editor and never switches accounts',async()=>{
 const f=workerFixture();await f.bind('a');f.windows.push(f.client);await f.click(f.payload);assert.equal(f.focuses,1);assert.equal(f.opened,0);assert.equal(f.messages[0].entryId,'note');await f.bind('b');await f.click(f.payload);assert.equal(f.focuses,1);
});
async function dispatchFixture({failure=null,changed=false,revoked=false}={}){
 const m=await sourceModule('supabase/functions/_shared/pushDispatch.js');const at='2026-10-15T12:00:00.000Z',sub={id:'sub',owner_id:'a',subscription:validSub,enabled_at:'2026-10-15T11:00:00.000Z',expires_at:'2027-01-01T00:00:00.000Z',time_zone:'UTC',language:'en'},notes=[{id:'note',date:'2026-10-15',time:'12:00',reminder:{mode:'at'}}];const claims=new Set(),updates=[],sent=[];let reads=0;
 const server={rpc:async(name,args)=>{const key=JSON.stringify([args.p_subscription,args.p_entry,args.p_at]);if(claims.has(key))return{data:false};claims.add(key);return{data:true}},from(table){let action='select',row,conditions={};const q={select(){return q},gt(){return q},lt(){return q},order(){return q},limit(){return q},maybeSingle(){return q},eq(k,v){conditions[k]=v;return q},update(value){action='update';row=value;return q},delete(){action='delete';return q},then(yes,no){let data;if(action==='select'&&table==='notebooks'){reads++;data={notes:changed&&reads>1?[]:notes,todos:{},revision:0}}else if(action==='select'&&table==='web_push_subscriptions')data=conditions.id?(revoked?null:sub):[sub];if(action!=='select')updates.push({table,action,row,conditions:{...conditions}});return Promise.resolve({data,error:null}).then(yes,no)}};return q}};
 const dispatch=m.createPushDispatch({server,enabled:true,secret:'cron-private',now:()=>new Date('2026-10-15T12:00:30.000Z'),uuid:()=>webcrypto.randomUUID(),send:async(s,payload)=>{sent.push(JSON.parse(payload));if(failure)throw{statusCode:failure}}});
 return{sent,updates,request:(token='cron-private')=>dispatch(new Request('https://test/dispatch',{method:'POST',headers:{Authorization:'Bearer '+token}}))};
}
test('scheduled dispatch deduplicates repeated runs, rechecks deletions and rejects user credentials',async()=>{
 const f=await dispatchFixture();assert.equal((await f.request('user-token')).status,401);assert.equal(f.sent.length,0);await f.request();await f.request();assert.equal(f.sent.length,1);assert.equal(f.sent[0].owner,'a');assert.equal(Object.hasOwn(f.sent[0],'text'),false);
 for(const settings of [{changed:true},{revoked:true}]){const g=await dispatchFixture(settings);await g.request();assert.equal(g.sent.length,0);assert.ok(g.updates.some(u=>u.row?.state==='cancelled'));}
});
test('expired push endpoints are removed and server errors release the retry lease',async()=>{
 const gone=await dispatchFixture({failure:410});await gone.request();assert.ok(gone.updates.some(u=>u.table==='web_push_subscriptions'&&u.action==='delete'&&u.conditions.id==='sub'));
 const offline=await dispatchFixture({failure:503});await offline.request();assert.ok(offline.updates.some(u=>u.table==='web_push_deliveries'&&u.row?.next_attempt_at&&u.row.locked_until===null));
});
test('first signed-out startup clears a previously durable worker binding',async()=>{
 const m=await sourceModule('src/webPush.js'),bindings=[];
 const client=m.createWebPush({supported:true,auth:{},fetcher:()=>{},serverUrl:'https://test',publicKey:'public',storage:{getItem:()=>null},permission:{permission:'granted'},nav:{serviceWorker:{getRegistration:async()=>null}},bindWorker:async id=>bindings.push(id)});
 await client.setAccount(null);await new Promise(r=>setImmediate(r));assert.deepEqual(bindings,[null]);
});
