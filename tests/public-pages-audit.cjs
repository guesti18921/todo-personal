const assert=require('node:assert/strict');
module.exports=async(browser,origin)=>{
 for(const width of [320,1280]){
  const context=await browser.newContext({viewport:{width,height:844}}),page=await context.newPage();
  try{
   for(const name of ['privacy','support','delete-account']){
    const response=await page.goto(`${origin}/${name}.html`);assert.equal(response.status(),200);
    assert.equal(await page.locator('script,iframe,form').count(),0);
    assert.equal(await page.locator('section#ru[lang="ru"],section#en[lang="en"]').count(),2);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} at ${width}px`);
    const links=await page.locator('a').evaluateAll(els=>els.map(a=>a.href));
    for(const address of links){const url=new URL(address);if(url.protocol==='mailto:'){assert.equal(url.pathname,'support@m1strell.com');continue;}if(url.origin!==origin)continue;const target=await context.request.get(url.href);assert.equal(target.status(),200,url.href);}
    if(name!=='privacy'){const action=page.locator('#ru .action');assert.equal(new URL(await action.getAttribute('href')).protocol,'mailto:');}
    await page.addScriptTag({url:origin+'/__audit-axe.js'});assert.deepEqual(await page.evaluate(async()=>(await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(x=>x.id)),[]);
   }
  }finally{await context.close();}
 }
 console.log('Public information: RU/EN, phone/desktop, internal links, explicit email drafts, no embedded tracking and accessibility passed');
};
