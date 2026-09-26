const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {Store}=require('../src/store.cjs');
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-v3-live-')),store=new Store(path.join(profile,'library'));
 store.data.groups=['日常','测试'];const old=JSON.parse(fs.readFileSync('fixtures/plum-mw.json'));delete old.parserVersion;
 const word=store.collect(old,['日常']);word.notes='旧笔记保留';word.entries.mw.senses[0].editedTranslation='旧版个人释义';word.entries.mw.senses[0].selected=true;store.update(word);
 const env={...process.env,WORDDESK_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
 const args=process.env.WORDDESK_RELEASE?[path.resolve(process.env.WORDDESK_RELEASE)]:['.'];const app=await electron.launch({args,env,timeout:30000});
 try{
  const page=await app.firstWindow();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.locator('[data-page="library"]').click();await page.locator('.word-row').click();await page.locator('#repair-entry').click();await page.locator('#repair-entry').waitFor({state:'detached'});
  await page.waitForFunction(()=>document.querySelector('#page-library:not(.hidden) .pronunciation-groups'),{},{timeout:90000});
  let state=await page.evaluate(()=>window.desk.invoke('init')),w=state.data.words[0];assert.equal(w.notes,'旧笔记保留');assert.deepEqual(w.groups,['日常']);assert.deepEqual(state.data.lastCollectionGroups,['日常']);assert.equal(w.entries.mw.parserVersion,3);assert.equal(w.entries.mw.archives.length,1);assert(w.entries.mw.review.some(s=>s.editedTranslation==='旧版个人释义'));assert(w.entries.mw.snapshot.length);assert(w.entries.mw.audio.every(a=>a.file));
  const first=w.entries.mw.senses.find(s=>s.number==='1'&&s.section.startsWith('主词典'));assert.match(first.definition,/\nalso : the fruit/);
  await page.locator('#lookup-again').click();await app.evaluate(async({webContents})=>{const end=Date.now()+45000;while(Date.now()<end){const wc=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://dictionary.cambridge.org'));if(wc&&await wc.executeJavaScript('!!document.querySelector(".def-block")').catch(()=>false))return;await new Promise(r=>setTimeout(r,500));}throw new Error('Cambridge did not load');});
  const results=await page.evaluate(()=>window.desk.invoke('collect','cambridge',['测试']));assert(!results[0].error,JSON.stringify(results));
  state=await page.evaluate(()=>window.desk.invoke('init'));w=state.data.words[0];assert.deepEqual(w.groups,['日常','测试']);assert.deepEqual(state.data.lastCollectionGroups,['测试']);assert(w.entries.cambridge.snapshot.length);assert(w.entries.cambridge.audio.every(a=>a.file));
  // Decode a downloaded recording in Chromium, without playing sound during testing.
  const file=w.entries.mw.audio.find(a=>a.file).file;
  assert(await page.evaluate(async file=>{const src=await window.desk.invoke('audio',file);const bytes=Uint8Array.from(atob(src.split(',')[1]),c=>c.charCodeAt(0));const ctx=new AudioContext();try{const decoded=await ctx.decodeAudioData(bytes.buffer);return decoded.duration>0;}finally{await ctx.close();}},file));
  // Backup and restore includes recycle bin records, archived original entries and media.
  await page.evaluate(id=>window.desk.invoke('trashWords',[id]),w.id);const output=path.join(profile,'output');fs.mkdirSync(output);
  await app.evaluate(({dialog},out)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:out+'/backup.zip'});},output);
  const backup=await page.evaluate(()=>window.desk.invoke('backup'));
  await app.evaluate(({dialog},{backup,output})=>{dialog.showOpenDialog=async(_w,o)=>({canceled:false,filePaths:[o.properties.includes('openFile')?backup:output]});},{backup,output});
  await page.evaluate(()=>window.desk.invoke('restore'));await page.evaluate(id=>window.desk.invoke('restoreWords',[id]),w.id);
  const restored=await page.evaluate(()=>window.desk.invoke('init'));assert.equal(restored.data.words[0].notes,'旧笔记保留');assert.equal(restored.data.words[0].entries.mw.archives.length,1);assert((await page.evaluate(file=>window.desk.invoke('audio',file),file)).startsWith('data:audio/mpeg;base64,'));assert.deepEqual(errors,[]);
  console.log('LIVE V3 PASSED: real MW re-extraction, old edit archive, real Cambridge collection, group memory, screenshots, audio download/decode, backup with trash and full restore.');console.log('Warnings:',JSON.stringify(Object.fromEntries(Object.entries(w.entries).map(([s,e])=>[s,e.warnings]))));
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
