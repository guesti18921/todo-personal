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

test('short dates, named months and spaced clock expressions are recognized without inventing deadlines', async()=>{
 const {suggestDeadlineChoices:p}=await load('src/deadlineParser.js');const now=new Date(2026,9,11,17,17);
 assert.deepEqual(Array.from(p('встреча 10/12',now),x=>x.date).sort(),['2026-10-12','2026-12-10']);
 for(const phrase of ['купить машину 15 октября','15 октрября купить машину','15 October buy a car','October 15 buy a car']) assert.equal(p(phrase,now)[0]?.date,'2026-10-15',phrase);
 for(const phrase of ['в 6 00','завтра в 6 00','Tomorrow at 6 00','завтра в 6.00','завтра в 6:00']) {const r=p(phrase,now);assert.equal(r.length,1,phrase);assert.equal(r[0].time,'06:00',phrase);}
 assert.equal(p('завтра в 6 30 вечера',now)[0]?.time,'18:30');
 for(const phrase of ['31 февраля','31/02','в 6 99','в 25 00','в 6 000','Купить 6 00 яблок']) assert.equal(p(phrase,now).length,0,phrase);
 assert.equal(p('29 февраля 2028',now)[0]?.date,'2028-02-29');
 assert.equal(p('15 октября 2027',now)[0]?.date,'2027-10-15');
 assert.equal(p('10/12/27',now).length,0,'two-digit years must not become a partial date');
});
