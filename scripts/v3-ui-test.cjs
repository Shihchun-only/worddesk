const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),cheerio=require('cheerio');
const {Store}=require('../src/store.cjs');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-v3-ui-')),store=new Store(path.join(profile,'library'));
 store.data.groups=['阅读','考试'];
 const fixture=(word,source='mw')=>JSON.parse(fs.readFileSync(`fixtures/${word}-${source}-v3.json`));
 const plum=store.collect(fixture('plum')),go=store.collect(fixture('go'));store.collect(fixture('go','cambridge'));
 const nav=store.collect(fixture('navigation'));plum.groups=['阅读','考试'];plum.notes='个人笔记';plum.entries.mw.senses[0].selected=true;plum.entries.mw.senses[0].autoTranslation='保存的完整释义译文';plum.entries.mw.senses[0].examples[0]={text:'A preserved example.',translation:'词典自带译文',autoTranslation:'旧例句译文',selected:true};
 go.groups=['阅读'];nav.groups=['考试'];store.save();
 const env={...process.env,WORDDESK_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
 const args=process.env.WORDDESK_RELEASE?[path.resolve(process.env.WORDDESK_RELEASE)]:['.'];let app=await electron.launch({args,env,timeout:30000});
 try{
  let page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('[data-page="library"]').first().click();await page.locator(`.word-row[data-id="${plum.id}"]`).click();
  assert.equal(await page.locator('.saved-sense').count(),1);assert.equal(await page.locator('[data-translate]').count(),plum.entries.mw.senses.length);
  assert.equal(await page.locator('[data-translate="0"]').evaluate(b=>b.parentElement===b.closest('.dictionary-definition').lastElementChild),true);
  assert.match(await page.locator('[data-sense-index="0"] .dictionary-definition').innerText(),/also : the fruit/);
  assert.equal(await page.locator('.dictionary-example [data-translate]').count(),0);
  await page.locator('#begin-selection').click();assert.equal(await page.locator('[data-select-sense][aria-checked="true"]').count(),0);assert.equal(await page.locator('[data-example]:checked').count(),0);
  await page.locator('[data-translate="0"]').click();assert.equal(await page.locator('[data-select-sense][aria-checked="true"]').count(),0);assert.equal(await page.locator('.sense-translation').count(),1);
  await page.locator('[data-select-sense="0"]').click();assert.equal(await page.locator('[data-example]:checked').count(),0);
  await page.locator('#cancel-selection').click();assert.equal(await page.locator('.saved-sense').count(),1);
  await page.locator('#begin-selection').click();await page.locator('[data-select-sense="3"]').click();
  await page.screenshot({path:'fixtures/ui-v3-selection.png'});
  await page.locator('[data-page="review"]').click();await page.locator('#selection-dialog button[value="save"]').click();await page.locator('.review-detail').waitFor();
  assert.equal(await page.locator('.dictionary-definition').count(),1);assert.equal(await page.locator('.dictionary-example').count(),0);
  await page.locator('#view-full').click();await page.locator('#begin-selection').click();assert.equal(await page.locator('[data-select-sense][aria-checked="true"]').count(),0);
  await page.locator('#save-selection').click();await page.locator('[data-page="review"]').click();await page.locator('.review-empty').waitFor();
  // Delete is global; cancel does not alter data. Restore keeps all per-word state.
  await page.locator('#delete-word').click();await page.locator('#confirm-dialog button[value="cancel"]').click();assert.equal((await page.evaluate(()=>window.desk.invoke('init'))).data.words.length,3);
  await page.locator('#delete-word').click();await page.locator('#confirm-action').click();await page.locator(`.word-row[data-id="${plum.id}"]`).waitFor({state:'detached'});
  await page.locator('[data-page="library"]').first().click();assert.equal(await page.locator('.word-row').count(),2);
  await page.locator('#open-trash').click();await page.locator(`[data-restore-word="${plum.id}"]`).click();await page.locator('.trash-row').waitFor({state:'detached'});
  await page.locator('[data-page="library"]').first().click();await page.locator('#group-filter').selectOption('考试');await page.locator('#select-visible').check();assert.equal(await page.locator('[data-check-word]:checked').count(),2);
  await page.locator('#remove-group').click();await page.locator('#confirm-action').click();await page.waitForFunction(()=>document.querySelectorAll('.word-row').length===0);
  await page.locator('#group-filter').selectOption('');assert.equal(await page.locator('.word-row').count(),3);
  await page.locator('#library-search').fill('navigation');await page.locator('#select-visible').check();await page.locator('#delete-selected').click();await page.locator('#confirm-action').click();await page.waitForFunction(()=>document.querySelectorAll('.word-row').length===0);await page.locator('#library-search').fill('');
  await page.locator('[data-page="review"]').click();assert.equal(await page.locator('.word-row').count(),2);
  // MW and Cambridge keep their own notation; form-specific qualifiers stay outside slashes.
  await page.locator(`.word-row[data-id="${go.id}"]`).click();assert.match(await page.locator('.pronunciation-groups').innerText(),/went\s+\/ˈwent\//);assert.match(await page.locator('.pronunciation-groups').innerText(),/"going to" in sense 13 is often/);
  await page.locator('#view-full').click();await page.screenshot({path:'fixtures/ui-v3-go.png'});await page.locator('[data-source="cambridge"]').click();assert.match(await page.locator('.pronunciation-groups').innerText(),/\/ɡəʊ\//);assert.doesNotMatch(await page.locator('.pronunciation-groups').innerText(),/ˈgō/);
  // Cache translation toggles offline; new definition-only translation uses the same inline control.
  await app.evaluate(({net})=>{net.fetch=async()=>new Response(JSON.stringify({responseStatus:200,responseData:{translatedText:'测试完整释义翻译'}}),{headers:{'content-type':'application/json'}});});
  await page.locator(`.word-row[data-id="${plum.id}"]`).click();await page.locator('[data-translate="1"]').click();await page.locator('[data-sense-index="1"] .sense-translation').waitFor();assert.match(await page.locator('[data-sense-index="1"] .sense-translation').innerText(),/测试完整释义翻译/);
  assert.equal(await page.evaluate(async id=>{try{await window.desk.invoke('translate',id,'mw',0,0);return false;}catch{return true;}},plum.id),true);
  // Navigate a real saved DOM at the original dictionary origin. Network and audio are disabled for this UI test.
  const $=cheerio.load(fs.readFileSync('fixtures/plum-mw.html'));$('script,iframe,link,img,video').remove();$('[data-file]').removeAttr('data-file');
  await app.evaluate(async({session,webContents},html)=>{const s=session.fromPartition('persist:dictionary-mw');await s.protocol.handle('https',()=>new Response(html,{headers:{'content-type':'text/html'}}));const w=webContents.getAllWebContents().find(w=>w.session===s);await w.loadURL('https://www.merriam-webster.com/dictionary/plum');},$.html());
  await page.locator('[data-page="search"]').click();await page.evaluate(()=>{browsing=true;layout();});await page.locator('[data-quick="mw"]').click();await page.locator('#collection-dialog').waitFor();assert.equal(await page.locator('[data-collection-group]:checked').count(),0);
  await page.locator('[data-collection-group="阅读"]').check();await page.locator('[data-collection-group="考试"]').check();await page.screenshot({path:'fixtures/ui-v3-groups.png'});await page.locator('#collection-confirm').click();await page.locator('#page-library').waitFor();
  let saved=(await page.evaluate(()=>window.desk.invoke('init'))).data;assert.deepEqual(saved.lastCollectionGroups,['阅读','考试']);assert.deepEqual(saved.words.find(w=>w.id===plum.id).groups,['阅读','考试']);assert.equal(saved.words.find(w=>w.id===plum.id).notes,'个人笔记');
  await page.locator('[data-page="search"]').click();await page.locator('[data-quick="mw"]').click();await page.locator('#page-library').waitFor();assert.equal(await page.locator('#collection-dialog').isVisible(),false);
  assert.deepEqual(errors,[]);await app.close();app=await electron.launch({args,env,timeout:30000});page=await app.firstWindow();await page.locator('#recent-groups').filter({hasText:'阅读、考试'}).waitFor();
  saved=(await page.evaluate(()=>window.desk.invoke('init'))).data;assert.equal(saved.trash.length,1);assert.equal(saved.words.find(w=>w.id===plum.id).notes,'个人笔记');
  console.log('V3 UI PASSED: empty draft each time, no automatic examples, inline translation, save/cancel, shared deletion, group removal, restore, source-specific pronunciation, multi-group collection, quick reuse and restart persistence.');
 }catch(e){console.error('UI STATE',await (await app.firstWindow()).locator('#toast').textContent());throw e;}finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});

