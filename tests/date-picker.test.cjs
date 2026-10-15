const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
async function fixture() {
 const mod = new vm.SourceTextModule(fs.readFileSync('src/dateInput.js','utf8'), {context:vm.createContext({Date})});await mod.link(()=>{});await mod.evaluate();
 const dom=new JSDOM('<input type="date" id="date" value="2026-10-15">');const input=dom.window.document.querySelector('input');let owner='a',resolve,calls=0,changed=0,errors=0;
 input.addEventListener('change',()=>changed++);input.addEventListener('datepickererror',()=>errors++);
 mod.namespace.attachNativeDatePicker(input,{getOwner:()=>owner,pickDate:()=>{calls++;return new Promise(r=>resolve=r);}});
 return {dom,input,get calls(){return calls},get changed(){return changed},get errors(){return errors},set owner(v){owner=v},finish:async value=>{resolve(value);await new Promise(r=>setImmediate(r));}};
}
test('Android date tap opens one calendar instead of editing date segments and updates the existing change path',async()=>{
 const f=await fixture();try{assert.equal(f.input.readOnly,true);assert.equal(f.input.inputMode,'none');f.input.click();f.input.click();assert.equal(f.calls,1);await f.finish({date:'2028-02-29'});assert.equal(f.input.value,'2028-02-29');assert.equal(f.changed,1);}finally{f.dom.window.close()}
});
test('calendar cancellation, invalid dates, removed editor and changed account cannot replace the date',async()=>{
 for(const mode of ['cancel','invalid','account','removed']){const f=await fixture();try{f.input.click();if(mode==='account')f.owner='b';if(mode==='removed')f.input.remove();await f.finish(mode==='cancel'?{cancelled:true}:{date:mode==='invalid'?'2027-02-29':'2027-01-01'});assert.equal(f.input.value,'2026-10-15');assert.equal(f.changed,0);assert.equal(f.errors,mode==='invalid'?1:0);}finally{f.dom.window.close()}}
});
