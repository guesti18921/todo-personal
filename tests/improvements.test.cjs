const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
async function load(file,context={Date,Intl,Map,Set,String,Number,Boolean,JSON}){const m=new vm.SourceTextModule(fs.readFileSync(file,'utf8'),{context:vm.createContext(context)});await m.link(()=>{});await m.evaluate();return m.namespace;}
test('ambiguous dates/hours produce distinct valid options while explicit times remain unambiguous',async()=>{
 const {suggestDeadlineChoices:p}=await load('src/deadlineParser.js');const now=new Date(2026,9,11,10);
 assert.deepEqual(Array.from(p('10/12/2026 at 3pm',now),x=>x.date).sort(),['2026-10-12','2026-12-10']);
 assert.deepEqual(Array.from(p('25/12/2026',now),x=>x.date),['2026-12-25']);
 assert.deepEqual(Array.from(p('12/25/2026',now),x=>x.date),['2026-12-25']);
 assert.deepEqual(Array.from(p('tomorrow at 6',now),x=>x.time).sort(),['06:00','18:00']);
 for(const phrase of ['tomorrow at 6pm','завтра в 6 вечера','завтра в 18:00']){const r=p(phrase,now);assert.equal(r.length,1);assert.equal(r[0].time,'18:00');}
 assert.equal(p('31/02/2026',now).length,0);
});
test('renewing login refuses mismatched accounts and never installs their tokens',async()=>{
 const {renewAccountSession:renew}=await load('src/reauthentication.js');let installed=0;
 const authFor=id=>({signInWithPassword:async()=>({data:{user:{id},session:{user:{id},access_token:'test',refresh_token:'test'}}})});
 const active={setSession:async()=>{installed++;return {data:{session:{user:{id:'a'}}}};}};
 await assert.rejects(renew({temporaryAuth:authFor('b'),activeAuth:active,owner:'a',currentOwner:()=> 'a',email:'test@example.test',password:'test'}),/account_mismatch/);assert.equal(installed,0);
 await assert.rejects(renew({temporaryAuth:authFor('a'),activeAuth:active,owner:'a',currentOwner:()=> 'b',email:'test@example.test',password:'test'}),/account_mismatch/);assert.equal(installed,0);
 await renew({temporaryAuth:authFor('a'),activeAuth:active,owner:'a',currentOwner:()=> 'a',email:'test@example.test',password:'test'});assert.equal(installed,1);
});
