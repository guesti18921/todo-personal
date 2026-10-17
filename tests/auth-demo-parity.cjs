const assert = require('node:assert/strict');
module.exports = async function verifyAuthDemo(browser, origin, output) {
 const context = await browser.newContext({viewport:{width:736,height:1100},locale:'ru-RU',reducedMotion:'reduce',serviceWorkers:'block'});
 await context.route('**/*.supabase.co/**',r=>r.fulfill({json:{external:{google:true}}}));
 const actual = await context.newPage(), reference = await context.newPage();
 try {
  await actual.goto(origin);await actual.locator('#auth-google').waitFor();
  await reference.goto(origin+'/__auth-reference.html');
  const pairs=[['card','.auth-card','.td-one'],['brand','.td-brand','.td-brand'],['title','#auth-title','[data-heading]'],['subtitle','.td-sub','.td-sub'],['tabs','.td-tabs','.td-tabs'],['Google','#auth-google','.td-google'],['email','.td-field','.td-field'],['submit','#auth-submit','.td-primary'],['caption','.td-caption','.td-caption'],['privacy','.td-privacy','.td-privacy']];
  const measure=async(page,root,selector)=>page.locator(root).evaluate((card,selector)=>{
   const el=selector==='CARD'?card:card.querySelector(selector),r=el.getBoundingClientRect(),c=card.getBoundingClientRect(),style=getComputedStyle(el);
   const copy=el.cloneNode(true);copy.querySelectorAll('[aria-hidden="true"]').forEach(n=>n.remove());
   return {text:copy.textContent.trim(),x:r.x-c.x,y:r.y-c.y,width:r.width,height:r.height,css:Object.fromEntries(['fontFamily','fontSize','fontWeight','fontStretch','fontFeatureSettings','fontVariationSettings','letterSpacing','wordSpacing','textTransform','zoom','lineHeight','color','backgroundColor','borderColor','borderRadius','paddingTop','paddingRight','paddingBottom','paddingLeft'].map(k=>[k,style[k]]))};
  },selector);
  for(const width of [320,736]) {
   await actual.setViewportSize({width,height:1100});await reference.setViewportSize({width,height:1100});
   for(const mode of ['login','signup']) {
    await actual.locator(mode==='login'?'#auth-tab-login':'#auth-tab-register').click();
    await reference.locator('[data-mode="'+mode+'"]').click();
    await actual.evaluate(()=>document.fonts.ready);await reference.evaluate(()=>document.fonts.ready);
    for(const [name,a,b] of pairs) {
     const got=await measure(actual,'.auth-card',name==='card'?'CARD':a),want=await measure(reference,'.td-one',name==='card'?'CARD':b);
     if(!['card','brand','email','tabs'].includes(name)) assert.equal(got.text,want.text,'demo text '+name+' '+mode);
     assert.deepEqual(got.css,want.css,'demo styles '+name+' '+mode+' '+width);
     for(const key of ['x','y','width','height']) assert.ok(Math.abs(got[key]-want[key])<.6,'demo '+name+' '+mode+' '+width+' '+key+': '+got[key]+' vs '+want[key]);
    }
    await actual.screenshot({path:output+'/auth-exact-'+width+'-'+mode+'.png',fullPage:true});
   }
  }
  console.log('Approved demo parity passed: text, typography, colors and geometry at 320px and 736px, login and signup.');
 } finally {await context.close();}
};
