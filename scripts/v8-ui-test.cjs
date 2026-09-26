const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {Store}=require('../src/store.cjs');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-v8-ui-')),store=new Store(path.join(profile,'library'));store.data.groups=['阅读'];
 for(const name of ['both','cam-only','mw-only','fallback']){
  let w;for(const source of ['mw','cambridge']){const e=JSON.parse(fs.readFileSync('fixtures/go-'+source+'-v3.json'));e.headword=name;w=store.collect(e,['阅读']);}
  w.entries.mw.senses[0].selected=name!=='cam-only';w.entries.cambridge.senses[0].selected=name!=='mw-only';
  if(name==='fallback'){w.entries.mw.pronunciations=[];w.entries.mw.pronunciationGroups=[];}
 }
 store.data.exportFields=['source','word','phonetic','definition'];store.save();
 const env={...process.env,WORDDESK_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;const args=process.env.WORDDESK_RELEASE?[path.resolve(process.env.WORDDESK_RELEASE)]:['.'];const app=await electron.launch({args,env,timeout:30000});let page;
 try{
  page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));const choose=async name=>{await page.locator('.word-row').filter({has:page.locator('strong',{hasText:new RegExp('^'+name+'$')})}).click();};
  await page.locator('[data-page="review"]').click();await choose('both');const toggle=page.locator('#toggle-review-phonetics');assert.equal(await toggle.innerText(),'☾');assert.equal(await page.locator('.pronunciation-flow,[data-audio]').count(),0);assert.equal(await page.locator('[data-review-source]').count(),2);
  await toggle.click();assert.equal(await toggle.innerText(),'○');assert.equal(await toggle.getAttribute('aria-label'),'隐藏音标');assert.equal(await page.locator('.pronunciation-flow').count(),1);assert.equal(await page.locator('[data-pron-source]').getAttribute('data-pron-source'),'mw');assert.match(await page.locator('.pronunciation-flow').innerText(),/ˈgō/);assert(await page.locator('[data-audio]').count()>0);
  await choose('cam-only');assert.equal(await toggle.innerText(),'○');assert.equal(await page.locator('[data-pron-source]').getAttribute('data-pron-source'),'cambridge');assert.equal(await page.locator('[data-audio]').count(),0);
  await choose('mw-only');assert.equal(await page.locator('[data-pron-source]').getAttribute('data-pron-source'),'mw');await choose('fallback');assert.equal(await page.locator('[data-pron-source]').getAttribute('data-pron-source'),'cambridge');
  await choose('both');await page.locator('[data-page="review"]').click();assert.equal(await toggle.innerText(),'○');await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1000,680));await page.screenshot({path:'fixtures/ui-v8-review-shown.png'});await toggle.click();assert.equal(await page.locator('.pronunciation-flow,[data-audio]').count(),0);await choose('cam-only');assert.equal(await toggle.innerText(),'☾');
  await toggle.click();await page.locator('[data-page="library"]').click();assert(await page.locator('.pronunciation-flow').count()>0);await page.locator('[data-page="review"]').click();assert.equal(await toggle.innerText(),'☾');await page.screenshot({path:'fixtures/ui-v8-review-hidden.png'});
  await page.locator('[data-page="settings"]').click();await page.locator('[data-theme-choice="dark"]').click();await page.locator('[data-page="review"]').click();await toggle.click();await page.screenshot({path:'fixtures/ui-v8-review-dark.png'});
  await page.locator('[data-page="export"]').click();assert.equal(await page.locator('[data-field="source"]').count(),0);assert.equal(await page.locator('label[for="f-phonetic"]').innerText(),'音标');assert(!await page.locator('#export-fields').innerText().then(t=>t.includes('undefined')));assert.deepEqual(errors,[]);
  console.log('V8 UI PASSED: moon/circle default and toggle, both/MW/Cam/fallback phonetics, audio hiding, session persistence/reset, library independence, narrow/dark appearance, legacy export-field migration.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());selectionDraft=null;}).catch(()=>{});await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
