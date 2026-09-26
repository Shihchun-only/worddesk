const {_electron:electron}=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {Store}=require('../src/store.cjs'),{rows}=require('../src/export.cjs');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-v4-ui-')),store=new Store(path.join(profile,'library'));store.data.groups=['阅读'];
 const load=(w,s='mw')=>JSON.parse(fs.readFileSync(`fixtures/${w}-${s}-v3.json`));
 const go=store.collect(load('go'),['阅读']),plum=store.collect(load('plum'),['阅读']);store.collect(load('go','cambridge'));go.notes='保留笔记';store.save();
 const env={...process.env,WORDDESK_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;const args=process.env.WORDDESK_RELEASE?[path.resolve(process.env.WORDDESK_RELEASE)]:['.'];let app=await electron.launch({args,env,timeout:30000});let page;
 try{
  page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('[data-page="library"]').click();await page.locator(`.word-row[data-id="${go.id}"]`).click();
  assert.equal(await page.locator('.pos-heading span, .pron-section').count(),0);assert.equal(await page.locator('.sense-guide').count(),0);
  assert.doesNotMatch(await page.locator('.pronunciation-flow').innerText(),/主词典|儿童词典/);assert.match(await page.locator('.pronunciation-flow').innerText(),/"going to" in sense 13/);
  const positions=await page.locator('.pron-unit').evaluateAll(es=>es.slice(0,3).map(e=>e.getBoundingClientRect().top));assert.equal(positions[0],positions[1]);
  await page.screenshot({path:'fixtures/ui-v4-light.png'});
  await page.locator('#begin-selection').click();await page.locator('[data-edit-sense="0"]').click();await page.locator('#edit-dialog').waitFor();assert.equal(await page.locator('[aria-checked="true"][data-select-sense]').count(),0);
  const original=await page.locator('#edit-definition').inputValue();await page.locator('#edit-definition').fill('Cancel this change');await page.locator('#edit-cancel').click();assert.match(await page.locator('[data-sense-index="0"] .dictionary-definition').innerText(),new RegExp(original.slice(0,10)));
  await page.locator('[data-select-sense="0"]').click();await page.locator('[data-edit-sense="0"]').click();await page.locator('#edit-definition').fill('My revised definition');await page.locator('#edit-translation').fill('我的中文释义');await page.locator('#edit-save').click();await page.locator('#edit-dialog').waitFor({state:'hidden'});assert.equal(await page.locator('[aria-checked="true"][data-select-sense]').count(),1);
  await page.locator('#save-selection').click();await page.locator('[data-page="review"]').click();assert.match(await page.locator('.dictionary-definition').innerText(),/My revised definition/);
  let state=await page.evaluate(()=>window.desk.invoke('init'));assert.match(rows([state.data.words[0]],'time')[0].definition,/My revised definition/);
  await page.locator('[data-edit-sense="0"]').click();await page.locator('#edit-original').click();assert.equal(await page.locator('#edit-definition').inputValue(),original);await page.locator('#edit-cancel').click();assert.match(await page.locator('.dictionary-definition').innerText(),/My revised definition/);
  await page.locator('[data-edit-sense="0"]').click();await page.locator('#edit-original').click();await page.locator('#edit-save').click();await page.locator('#edit-dialog').waitFor({state:'hidden'});state=await page.evaluate(()=>window.desk.invoke('init'));assert.equal(state.data.words[0].entries.mw.senses[0].editedDefinition,undefined);
  await page.locator('[data-page="settings"]').click();await page.locator('[data-theme-choice="dark"]').click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');await page.screenshot({path:'fixtures/ui-v4-settings-dark.png'});
  await page.locator('[data-page="library"]').click();assert.equal(await page.locator('body').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(24, 26, 27)');await page.screenshot({path:'fixtures/ui-v4-dark.png'});
  await page.locator('[data-edit-sense="0"]').click();await page.screenshot({path:'fixtures/ui-v4-edit-dark.png'});assert.equal(await page.evaluate(()=>window.prepareToClose()),false);await page.locator('#edit-cancel').click();
  await page.locator('[data-source="cambridge"]').click();assert.equal(await page.locator('[data-translate]').count(),0);assert((await page.locator('[data-edit-sense]').count())>0);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1000,680));assert(await page.locator('#word-detail').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  await page.locator('#select-visible').check();await page.locator('#delete-selected').click();assert.match(await page.locator('#confirm-message').innerText(),/7 天/);await page.locator('#confirm-action').click();await page.waitForFunction(()=>document.querySelectorAll('.word-row').length===0);
  await page.locator('#open-trash').click();await page.locator('#recycle-bin').waitFor();assert.equal(await page.locator('#page-storage').isVisible(),true);assert.equal(await page.locator('.trash-row').count(),2);assert.match(await page.locator('.retention').first().innerText(),/7 天/);
  await page.locator('#trash-all').check();await page.locator('#trash-restore').click();await page.locator('.trash-row').first().waitFor({state:'detached'});state=await page.evaluate(()=>window.desk.invoke('init'));assert.equal(state.data.words.length,2);assert.equal(state.data.words[0].notes,'保留笔记');
  await page.locator('[data-page="library"]').click();await page.locator('#select-visible').check();await page.locator('#delete-selected').click();await page.locator('#confirm-action').click();await page.waitForFunction(()=>document.querySelectorAll('.word-row').length===0);await page.locator('[data-page="storage"]').click();
  await page.locator(`[data-trash-check="${plum.id}"]`).check();await page.locator('#trash-purge').click();await page.locator('#confirm-action').click();await page.locator(`[data-trash-check="${plum.id}"]`).waitFor({state:'detached'});
  await app.evaluate(()=>{const realNow=Date.now;Date.now=()=>realNow()+8*24*60*60*1000;});state=await page.evaluate(()=>window.desk.invoke('init'));assert.equal(state.data.trash.length,0);
  assert.deepEqual(errors,[]);await app.close();app=await electron.launch({args,env,timeout:30000});page=await app.firstWindow();await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  await page.locator('[data-page="settings"]').click();await page.locator('[data-theme-choice="light"]').click();await page.waitForFunction(()=>document.documentElement.dataset.theme==='light');assert.equal((await page.evaluate(()=>window.desk.invoke('init'))).appearance,'light');
  console.log('V4 UI PASSED: inline pronunciation, hidden edition labels, edit/cancel/reset, selection isolation, review/export consistency, themes and restart persistence, bulk trash restore/purge and live expiry.');
 }finally{if(page&&!page.isClosed())await page.evaluate(()=>{document.querySelectorAll('dialog[open]').forEach(d=>d.close());selectionDraft=null;}).catch(()=>{});await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
