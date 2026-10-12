const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
async function moduleFixture() {
 const context = vm.createContext({});
 const account = new vm.SourceTextModule(fs.readFileSync('src/localAccount.js','utf8'), { context });
 const deletion = new vm.SourceTextModule(fs.readFileSync('src/accountDeletion.js','utf8'), { context });
 await account.link(() => {}); await deletion.link(() => account); await deletion.evaluate();
 return { m: deletion.namespace, authKey: account.namespace.AUTH_STORAGE_KEY };
}
function storage(entries = []) {
 const disk = new Map(entries);
 return { disk, get length(){return disk.size;}, key:i=>[...disk.keys()][i], getItem:k=>disk.get(k)??null, setItem:(k,v)=>disk.set(k,v), removeItem:k=>disk.delete(k) };
}
test('account changes during session lookup block deletion; invocation binds the owner token', async () => {
 const { m } = await moduleFixture(); let current = 'a', calls=0, options;
 const client = { auth: { async getSession(){current='b';return {data:{session:{user:{id:'a'},access_token:'OWNER-TOKEN'}}};} }, functions: { async invoke(name, value){calls++;options=value;assert.equal(name,'delete-account');return {data:{code:'account_deleted'}};} } };
 await assert.rejects(m.requestAccountDeletion(client,'a',()=>current), /authentication_required/); assert.equal(calls,0);
 client.auth.getSession = async () => ({data:{session:{user:{id:'a'},access_token:'OWNER-TOKEN'}}}); current='a';
 await m.requestAccountDeletion(client,'a',()=>current);
 assert.equal(calls,1);assert.equal(options.headers.Authorization,'Bearer OWNER-TOKEN');assert.equal(options.body.confirm,'DELETE');
 client.functions.invoke = async () => ({data:{code:'unexpected'}});
 await assert.rejects(m.requestAccountDeletion(client,'a',()=>current), /deletion_unconfirmed/);
});
test('interrupted cleanup retries at startup and preserves a different account session', async () => {
 const { m, authKey } = await moduleFixture();
 const s=storage([[authKey,JSON.stringify({user:{id:'b'}})],['todo-personal:local:a','PRIVATE'],['todo-personal:local:b','KEEP']]);
 const remove=s.removeItem;let fail=true;s.removeItem=k=>{if(fail&&k==='todo-personal:local:a')throw Error('disk');remove(k);};
 assert.equal(m.clearDeletedAccount(s,'a'),false);assert.equal(s.getItem('todo-personal:deleted-account:a'),'1');
 fail=false;m.recoverDeletedAccounts(s);
 assert.equal(s.getItem('todo-personal:local:a'),null);assert.equal(s.getItem('todo-personal:deleted-account:a'),null);
 assert.equal(s.getItem('todo-personal:local:b'),'KEEP');assert.equal(JSON.parse(s.getItem(authKey)).user.id,'b');
});
