const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {Store}=require('../src/store.cjs'),{launch}=require('./ui-harness.cjs'),{makePDF}=require('./pdf-test-fixture.cjs');

(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-current-'));
 const store=new Store(path.join(profile,'library'));store.data.groups=['设置','Reading'];
 for(const name of ['alpha','beta','gamma'])for(const source of ['mw','cambridge']){
  const entry=JSON.parse(fs.readFileSync(`fixtures/go-${source}-v3.json`));entry.headword=name;entry.audio=[];entry.senses=entry.senses.slice(0,4);
  entry.senses.forEach((sense,i)=>{sense.definition=`Definition ${i} of ${name}`;sense.translation='保存';sense.examples=[{text:`Example ${i}`,translation:'设置',selected:false}];});
  store.collect(entry,['设置']);
 }
 store.data.words[0].notes='设置';store.data.words[0].entries.mw.senses[0].selected=true;store.save();
 const file=path.join(profile,'book.pdf');fs.writeFileSync(file,makePDF(['obscure obscure','navigation']));
 let app=await launch({profile});
 const ui=expression=>app.ui(expression);
 try{
  assert.equal(await ui('page'),'work');
  await ui("go('library')");await app.waitUI("document.querySelectorAll('.word-row').length===3",'library rows');
  await ui("activeId=data.words[0].id;renderDetail();beginSelection();document.querySelector('[data-select-sense=\"1\"]').click();");
  await ui("document.querySelector('[data-source=\"cambridge\"]').click()");
  await app.waitUI("word().source==='cambridge'&&!!document.querySelector('[data-select-chinese]')",'Cambridge selection');
  await ui("document.querySelector('[data-select-chinese=\"0\"]').click();document.querySelector('#preview-selection').click()");
  assert.equal(await ui("document.querySelector('#selection-preview').open"),true);
  assert.equal(await ui("document.querySelectorAll('#selection-preview-content .dictionary-sense').length"),3);
  assert((await ui("document.querySelector('#selection-preview-content').textContent")).includes('保存'));
  await ui("document.querySelector('#preview-close').click();document.querySelector('#sense-search').value='Definition 2';document.querySelector('#sense-search').dispatchEvent(new Event('input'))");
  assert.equal(await ui("document.querySelectorAll('#word-detail .dictionary-sense:not([hidden])').length"),1);
  await ui("document.querySelector('#jump-selected').click()");assert.equal(await ui("document.querySelector('#sense-search').value"),'');
  const draft=await ui('JSON.stringify(selectionDraft.bySource)');
  await ui("go('settings')");await ui("api('preference','language','en').then(()=>refresh())");await ui("go('library')");
  assert.equal(await ui('JSON.stringify(selectionDraft.bySource)'),draft);assert.equal(await ui("document.querySelector('#preview-selection').textContent"),'Preview Review Content');
  assert.equal(await ui('word().notes'),'设置');assert.equal(await ui("document.querySelector('#group-filter option[value=\"设置\"]').textContent"),'设置');
  await ui('saveSelection()');assert.equal(await ui('selectedCount(word())'),3);
  await ui("activeId=data.words.find(w=>w.word==='beta').id;renderDetail();beginSelection();document.querySelector('#only-unselected').click()");
  await app.waitUI("document.querySelectorAll('.word-row').length===2",'unselected filter');
  await ui("document.querySelector('[data-select-sense=\"0\"]').click()");assert.equal(await ui("document.querySelectorAll('.word-row').length"),2);
  await ui('saveSelection()');assert.equal(await ui("document.querySelectorAll('.word-row').length"),1);assert.equal(await ui('word().word'),'beta');
  await ui("go('review')");assert.equal(await ui("document.querySelector('#only-unselected').getAttribute('aria-pressed')"),'false');
  await ui("go('library')");await ui("document.querySelector('#only-unselected').click()");await app.waitUI("document.querySelectorAll('.word-row').length===3",'filter reset');
  await ui("activeId=data.words[0].id;renderDetail()");
  await app.mainEval("require('electron').BrowserWindow.getAllWindows()[0].setSize(1000,680);true");
  await ui("api('appearance','dark').then(()=>refresh()).then(()=>renderDetail())");
  await ui('document.getAnimations().forEach(a=>a.finish())');await app.screenshot(path.join(profile,'library-dark.png'));
  assert(await ui("document.querySelector('#word-detail .entry-scroll').clientHeight>100"));
  assert(await ui("document.querySelector('#begin-selection').getBoundingClientRect().right<=innerWidth"));
  console.log('PASS selection preview, search, source drafts, language round trip and small-screen layout');

  // Inject a real file-system save failure into this test process only.
  await app.mainEval("global.testRename=require('node:fs').renameSync;require('node:fs').renameSync=(a,b)=>{if(b.endsWith('library.json'))throw Error('TEST disk full');return global.testRename(a,b)};true");
  await ui("word().notes='unsaved note';saveWord().catch(()=>null)");
  assert.equal(await ui("document.querySelector('#save-notice').classList.contains('hidden')"),false);
  assert.equal(await ui('pendingWordSaves.size'),1);
  await ui('refresh()');assert.equal(await ui('word().notes'),'unsaved note');
  assert.equal(await ui("go('review').then(()=>false,()=>true)"),true);
  await app.mainEval("require('node:fs').renameSync=global.testRename;true");await ui('retryPendingSaves()');
  assert.equal(await ui('pendingWordSaves.size'),0);assert.equal(new Store(store.root).data.words[0].notes,'unsaved note');
  console.log('PASS failed-save retention and retry');

  await ui("go('work')");
  await ui(`(async()=>{const record=await api('pdfRegister',${JSON.stringify(file)}),result=await api('pdfRead',record.id);mountWorkPDF(record.name,new Uint8Array(result.bytes).buffer,record);})()`);
  try{await app.waitUI("document.querySelector('.work-pdf')?.contentDocument?.querySelector('.textLayer span')",'PDF text');}catch(error){console.error(await ui("(()=>{const f=document.querySelector('.work-pdf');return {frame:!!f,doc:!!f?.contentDocument,content:f?.contentDocument?.body?.innerHTML,tab:workTab}})()"));throw error;}
  const frame="document.querySelector('.work-pdf').contentDocument";
  await ui(`(()=>{const d=${frame};d.querySelector('#find-text').value='obscure';d.querySelector('#find').dispatchEvent(new Event('submit',{cancelable:true}));})()`);
  await app.waitUI(`${frame}.querySelector('#find-count').textContent==='1 / 2'&&${frame}.querySelector('.current-search-hit')`,'first PDF match');
  const firstLeft=await ui(`${frame}.querySelector('.current-search-hit').style.left`);
  await ui(`${frame}.querySelector('#find').dispatchEvent(new Event('submit',{cancelable:true}))`);
  await app.waitUI(`${frame}.querySelector('#find-count').textContent==='2 / 2'&&${frame}.querySelector('.current-search-hit')?.style.left!==${JSON.stringify(firstLeft)}`,'next occurrence');
  await ui(`${frame}.querySelector('#find-prev').click()`);await app.waitUI(`${frame}.querySelector('#find-count').textContent==='1 / 2'`,'previous occurrence');
  await ui(`(()=>{const d=${frame};d.querySelector('#page').value='2';d.querySelector('#page').dispatchEvent(new Event('change'));})()`);
  await app.waitUI(`${frame}.querySelector('.textLayer')?.textContent.includes('navigation')`,'page two');
  await ui("api('flushPDF')");assert.equal(new Store(store.root).data.pdfHistory[0].page,2);
  await app.mainEval("global.testHistoryRename=require('node:fs').renameSync;require('node:fs').renameSync=(a,b)=>{if(b.endsWith('reading-history.json'))throw Error('TEST history disk full');return global.testHistoryRename(a,b)};true");
  await ui("api('pdfState',workDocuments.get(workTab).record.id,{page:2,zoom:'fit',scrollX:0,scrollY:.2,highlights:[]}).then(()=>api('flushPDF')).catch(()=>null)");
  await app.waitUI('readingSaveError','reading failure notice');assert.equal(await ui("document.querySelector('#save-notice').classList.contains('hidden')"),false);
  await app.mainEval("require('node:fs').renameSync=global.testHistoryRename;true");await ui('retryPendingSaves()');assert.equal(await ui('readingSaveError'),false);
  await ui("workLookup('alpha',workTab,true)");await ui("openWorkLibraryWord(data.words[0].id,'full',true)");
  await ui('returnToOriginPDF(true)');await app.waitUI(`${frame}.querySelector('#page').value==='2'`,'return origin');
  console.log('PASS PDF search, reading persistence and save-return flow');

  await ui("go('exam')");await ui("document.querySelector('#exam-start').click()");
  await ui("document.querySelector('#exam-answer').value='partly typed';document.querySelector('#exam-answer').dispatchEvent(new Event('input'))");await ui("go('settings')");
  await ui("api('preference','language','zh-CN').then(()=>refresh())");await ui("go('exam')");
  assert.equal(await ui("document.querySelector('#exam-answer').value"),'partly typed');
  console.log('PASS exam input survives settings and language changes');

  // Both dictionaries are served from offline fixtures; no website or personal session is used.
  const html={mw:fs.readFileSync('fixtures/go-mw.html','utf8'),cambridge:fs.readFileSync('fixtures/go-cambridge.html','utf8')};
  await app.mainEval(`(async()=>{const {session}=require('electron'),html=${JSON.stringify(html)};for(const source of ['mw','cambridge'])await session.fromPartition('persist:dictionary-'+source).protocol.handle('https',()=>new Response(html[source],{headers:{'content-type':'text/html'}}));return true;})()`);
  await app.mainEval("require('electron').session.fromPartition('persist:dictionary-mw').fetch=(_url,options)=>new Promise((_resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(Error('test cancelled')),{once:true});});true");
  await ui("go('search')");await ui("api('search','go')");
  assert(await ui("[...document.querySelectorAll('.dictionary-head button')].every(b=>{const r=b.getBoundingClientRect(),p=b.closest('.dictionary-head').getBoundingClientRect();return r.right<=p.right+1&&r.left>=p.left-1})"));
  await app.screenshot(path.join(profile,'query-small.png'));
  await app.mainEval("(async()=>{const {webContents,session}=require('electron');for(const source of ['mw','cambridge']){const wc=webContents.getAllWebContents().find(w=>w.session===session.fromPartition('persist:dictionary-'+source));if(wc.isLoading())await new Promise(r=>wc.once('did-stop-loading',r));}return true;})()");
  await ui("window.collecting=collect('both',['设置']);true");await ui("go('settings')");await ui('window.collecting');
  assert.equal(await ui('page'),'settings');assert(await ui("data.words.some(w=>w.word==='go'&&w.entries.mw&&w.entries.cambridge)"));
  assert(await ui("activeAudioJobs.length>0"));
  await ui("go('library')");await ui("activeId=data.words.find(w=>w.word==='go').id;renderDetail();beginSelection();document.querySelector('[data-select-sense=\"0\"]').click();saveSelection()");
  assert(await ui('activeAudioJobs.length>0')); // Editing does not wait for media.
  await ui("api('skipAudio')");
  await app.waitUI("activeAudioJobs.length===0",'cancelled downloads');
  await app.mainEval("require('electron').session.fromPartition('persist:dictionary-mw').fetch=async()=>new Response(new Uint8Array([73,68,51]),{headers:{'content-type':'audio/mpeg'}});true");
  await ui("api('retryAudio',word().id,'mw')");await app.waitUI("activeAudioJobs.length===0",'retried audio');await ui('refresh()');
  assert(await ui('word().entries.mw.audio.every(a=>a.file)'));assert.equal(await ui('selectedCount(word())'),1);
  assert((await ui("api('audio',word().entries.mw.audio[0].file)")).startsWith('data:audio/mpeg;base64,'));
  // Recollect without destroying personal selections; inspect the comparison UI.
  await ui("go('search')");await ui("collect('both',['设置'])");
  await ui("document.querySelector('#compare-extraction').click()");
  assert(await ui("document.querySelector('#compare-dialog').open"));assert(await ui("document.querySelectorAll('#extraction-comparison>div').length===2"));
  await app.screenshot(path.join(profile,'comparison.png'));await ui("document.querySelector('#compare-dialog').close()");
  console.log('PASS background collection, editing during downloads, skip/retry, offline audio and update comparison');

  const zip=path.join(profile,'backup.zip');
  await app.mainEval(`require('electron').dialog.showSaveDialog=async()=>({canceled:false,filePath:${JSON.stringify(zip)}});true`);
  await ui("api('backup')");const archive=new(require('adm-zip'))(zip),backup=JSON.parse(archive.readAsText('library.json'));
  assert.equal(backup.pdfHistory[0].page,2);assert(backup.words.length>=4);
  await app.mainEval(`global.pickCount=0;require('electron').dialog.showOpenDialog=async()=>({canceled:false,filePaths:[global.pickCount++===0?${JSON.stringify(zip)}:${JSON.stringify(profile)}]});true`);
  const restored=await ui("api('restore')");assert.notEqual(restored,store.root);assert.equal(new Store(restored).data.pdfHistory[0].page,2);
  await ui("refresh().then(()=>go('storage'))");await ui("document.querySelector('#automatic-backups').click()");await app.waitUI("document.querySelector('#backup-dialog').open",'backup list');await ui("document.querySelector('#backup-dialog').close()");
  console.log('PASS complete ZIP backup and restore retain PDF metadata');
  const snapshots=await ui("api('autoBackups')");assert(snapshots.length);
  const recovered=await ui(`api('restoreCheckpoint',${JSON.stringify(snapshots[0].name)})`);
  assert.notEqual(recovered,restored);assert(fs.existsSync(path.join(restored,'library.json')));
  assert.equal(new Store(recovered).data.words.length,snapshots[0].words);
  assert.equal(new Store(recovered).data.pdfHistory[0].page,2);await ui('refresh()');
  console.log('PASS automatic snapshot recovery preserves original directory');
  assert.deepEqual(await ui('testErrors'),[]);
  await ui("go('library')");await app.close();app=await launch({profile});assert.equal(await ui('page'),'library');
  assert.equal(await ui('data.words.length'),backup.words.length);
  console.log('PASS restart restores entry point and saved library');
  console.log('CURRENT UI PASSED; screenshots and temporary data: '+profile);
 }catch(error){await app.screenshot(path.join(profile,'failure.png')).catch(()=>{});console.error('Test artifacts: '+profile);throw error;}
 finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
