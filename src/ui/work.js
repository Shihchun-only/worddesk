let workQueryOrigin=null;
function captureWorkOrigin(id=workLastPDF){const record=workDocuments.get(id)?.record;return id?{id,state:record?{page:record.page,zoom:record.zoom,scrollX:record.scrollX,scrollY:record.scrollY}:null}:null;}
function workReturnTarget(){return workQueryOrigin||captureWorkOrigin();}
function workReturnButton(save=false){if(page!=='work')return '';const target=workReturnTarget(),available=target&&workDocuments.has(target.id);return '<button id="'+(save?'save-return-pdf':'return-pdf')+'" '+(available?'':'disabled')+' title="'+(available?'返回查词前的阅读位置':target?'原 PDF 标签已关闭':'尚无可返回的 PDF')+'">'+(save?'保存并回到 PDF':'回到 PDF')+'</button>';}
async function returnToOriginPDF(save=false){const target=workReturnTarget();if(!target||!workDocuments.has(target.id))return;if(save)await saveSelection();if(!workDocuments.has(target.id)){toast('原 PDF 标签已关闭，释义已保存。');return;}switchWorkTab(target.id);if(target.state)workDocuments.get(target.id).frame.contentWindow.postMessage({kind:'restore-reading',state:target.state},'*');}
function bindWorkReturnButtons(){for(const [id,save]of [['return-pdf',false],['save-return-pdf',true]]){const b=$('#'+id);if(b)b.onclick=()=>run(async()=>{b.disabled=true;try{await returnToOriginPDF(save);}finally{if(b.isConnected)b.disabled=!workDocuments.has(workReturnTarget()?.id);}});}}
let workTab='query',workLastPDF=null,workSerial=0,workFocus=false,workFull=false;
const workDocuments=new Map();
let workLibraryMode='full',workLibraryReady=false;
const workLibraryScroll={full:0,review:0};let workListScroll=0;
function updateWorkLibraryBadge(){const button=$('[data-work-tab="library"]');if(button)button.textContent='我的词库'+(selectionDirty()?' · 未保存':'');const status=$('#work-library-status');if(status)status.textContent=selectionDirty()?'有未保存的释义选择；复习视图显示上次保存的内容。':'';}
function configureLibraryHeader(){const review=libraryIsReview();$('#library-heading').textContent=review?'专注于你选中的释义。':'把遇见变成积累。';$('#library-eyebrow').textContent=review?'REVIEW YOUR WORDS':'YOUR COLLECTION';$('#new-group').classList.toggle('hidden',review);$$('[data-work-library-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.workLibraryMode===workLibraryMode)));updateWorkLibraryBadge();}
function rememberWorkLibraryScroll(){if(page==='work'&&workTab==='library'){workLibraryScroll[workLibraryMode]=detailScroller().scrollTop;workListScroll=$('#word-list').scrollTop;}}
function restoreWorkLibraryScroll(){detailScroller().scrollTop=workLibraryScroll[workLibraryMode];$('#word-list').scrollTop=workListScroll;}
function setWorkLibraryMode(mode){rememberWorkLibraryScroll();if(mode==='review'&&workLibraryMode!=='review')reviewPhoneticsVisible=false;workLibraryMode=mode;configureLibraryHeader();renderList();renderDetail();restoreWorkLibraryScroll();}
async function openLibraryView(mode){if(page==='work'){switchWorkTab('library');setWorkLibraryMode(mode);return true;}return go(mode==='review'?'review':'library');}
async function openWorkLibraryWord(id,mode='full',choose=false,fromCollection=false){
 const changed=id!==activeId;if(changed&&!await leaveSelection())return false;await saveQueue;activeId=id;workLibraryScroll.full=workLibraryScroll.review=0;
 // A direct word link must remain visible even when an earlier filter excludes it.
 const w=word();if(w&&!filteredWords().some(item=>item.id===id)){$('#library-search').value='';if(!w.groups.includes($('#group-filter').value))$('#group-filter').value='';}
 if(fromCollection){$('#library-search').value='';$('#group-filter').value='';}
 switchWorkTab('library');setWorkLibraryMode(mode);if(changed||fromCollection){workLibraryScroll.full=workLibraryScroll.review=0;detailScroller().scrollTop=0;}if(choose&&!selectionDraft)beginSelection();return true;
}
function mountWorkPDF(name,bytes,record){
 const existing=record&&[...workDocuments].find(([,d])=>d.record?.id===record.id);if(existing){switchWorkTab(existing[0]);return;}
 const id='pdf-'+(++workSerial),frame=document.createElement('iframe');frame.title=name;frame.src='pdf.html';frame.className='work-pdf';workDocuments.set(id,{name,frame,record});
 frame.onload=()=>{frame.contentWindow.postMessage({kind:'load-pdf',bytes,record},'*',[bytes]);frame.onload=null;};$('#work-documents').append(frame);switchWorkTab(id);
}
async function showPDFHistory(){
 const records=await api('pdfHistory');$('#pdf-history-list').innerHTML=records.length?[...records].sort((a,b)=>b.lastRead.localeCompare(a.lastRead)).map(r=>`<div class="pdf-history-row"><div><strong>${esc(r.name)}</strong><p class="muted">第 ${r.page} 页 · ${esc(new Date(r.lastRead).toLocaleString())} · ${r.highlights.length} 处高亮</p><p class="muted">${esc(r.path)}</p></div><button data-pdf-open="${r.id}">继续阅读</button><button data-pdf-relocate="${r.id}">重新定位</button></div>`).join(''):'<p class="muted">还没有阅读记录。打开本地 PDF 后会自动保存进度。</p>';
 const reopen=async id=>{const result=await api('pdfRead',id);const bytes=new Uint8Array(result.bytes).buffer;$('#pdf-history-dialog').close();mountWorkPDF(result.record.name,bytes,result.record);};
 $$('[data-pdf-open]').forEach(b=>b.onclick=()=>run(()=>reopen(b.dataset.pdfOpen)));$$('[data-pdf-relocate]').forEach(b=>b.onclick=()=>run(async()=>{if(await api('pdfRelocate',b.dataset.pdfRelocate))await reopen(b.dataset.pdfRelocate);}));
 await api('layout',{},false);const dialog=$('#pdf-history-dialog');dialog.addEventListener('close',()=>layout(),{once:true});dialog.showModal();
}
async function setWorkFullscreen(on){workFull=await api('fullscreen',on);$('#work-fullscreen').textContent=workFull?'退出全屏':'全屏';if(workFull)workFocus=true;syncWorkLayout();layout();}
function handleWorkKey(key){if(page!=='work')return;if(key==='F11')run(()=>setWorkFullscreen(!workFull));if(key==='Escape'){closePDFPopup();if(workFull)run(()=>setWorkFullscreen(false));else if(workFocus){workFocus=false;syncWorkLayout();layout();}}}
function closePDFPopup(){$('#pdf-word-popup')?.classList.add('hidden');}
async function showPDFPopup(id,highlight,x,y){
 if(page!=='work'||workTab!==id)return;await saveQueue;await refresh();if(page!=='work'||workTab!==id)return;
 const text=highlight.text.trim().replace(/\s+/g,' '),w=data.words.find(w=>w.word.trim().replace(/\s+/g,' ').toLowerCase()===text.toLowerCase()),popup=$('#pdf-word-popup');
 const groups=new Map();if(w)for(const source of selectedSources(w)){const e=w.entries[source];e.senses.forEach((s,i)=>{if(!s.selected)return;const key=(s.pos||'').trim().toLowerCase();if(!groups.has(key))groups.set(key,[]);groups.get(key).push({s,i,e,source});});}
 const senses=[...groups.values()].map(items=>'<section class="popup-pos-group">'+(items[0].s.pos?'<h3 class="popup-pos">'+esc(items[0].s.pos)+'</h3>':'')+items.map(({s,i,e,source})=>{const bilingual=source!=='cambridge'||includesChinese(s),translation=bilingual?(s.editedTranslation??s.translation):'';return `<div class="popup-sense"><div class="popup-sense-number">${esc(dictionaryNumber(s,source))}${source==='cambridge'&&s.section?' · '+esc(s.section):''}</div>${senseContext(e.senses,i)?'<p>'+esc(senseContext(e.senses,i))+'</p>':''}${s.labels?'<p class="sense-labels">'+esc(s.labels)+'</p>':''}<p class="preserve-lines">${esc(s.editedDefinition??s.definition)}</p>${translation?(source==='cambridge'?'<p>'+esc(translation)+'</p>':'<details><summary>中文辅助翻译</summary><p>'+esc(translation)+'</p></details>'):''}${bilingual&&s.autoTranslation?'<details><summary>已保存译文</summary><p>'+esc(s.autoTranslation)+'</p></details>':''}${s.examples.some(e=>e.selected)?'<details><summary>例句</summary>'+s.examples.filter(e=>e.selected).map(e=>'<p>'+esc(e.text)+(bilingual&&e.translation?'<br>'+esc(e.translation):'')+'</p>').join('')+'</details>':''}</div>`;}).join('')+'</section>').join('');
 popup.innerHTML=`<div class="popup-header"><strong>${esc(w?.word||text)}</strong><button id="popup-phonetics" class="phonetics-toggle" title="显示音标">显示音标</button><button id="popup-close" aria-label="关闭词义小窗">×</button></div><div id="popup-pron" hidden></div><div class="popup-content">${senses||'<p>'+(w?'尚未选择复习释义':'尚未收藏此词')+'</p>'}${w?.notes?'<details><summary>个人笔记</summary><p>'+esc(w.notes)+'</p></details>':''}</div><div class="popup-actions"><button id="popup-lookup">去查词</button>${w?'<button id="popup-review">'+(selectedCount(w)?'打开复习词条':'去选择释义')+'</button>':''}<button id="popup-remove">取消此处高亮</button></div>`;
 const rect=workDocuments.get(id).frame.getBoundingClientRect();popup.classList.remove('hidden');popup.style.left=Math.max(8,Math.min(rect.left+x,innerWidth-popup.offsetWidth-12))+'px';popup.style.top=Math.max(8,Math.min(rect.top+y,innerHeight-popup.offsetHeight-12))+'px';
 $('#popup-close').onclick=closePDFPopup;$('#popup-lookup').onclick=()=>{closePDFPopup();run(()=>workLookup(text,id,true));};if(w)$('#popup-review').onclick=()=>run(async()=>{closePDFPopup();await openWorkLibraryWord(w.id,selectedCount(w)?'review':'full',!selectedCount(w));});
 $('#popup-remove').onclick=()=>{workDocuments.get(id).frame.contentWindow.postMessage({kind:'remove-highlight',id:highlight.id},'*');closePDFPopup();};
 $('#popup-phonetics').onclick=()=>{const el=$('#popup-pron');el.hidden=!el.hidden;$('#popup-phonetics').textContent=el.hidden?'显示音标':'隐藏音标';el.innerHTML=w&&reviewPronunciationSource(w)?pronunciationHTML(w.entries.mw):'<p>尚无 MW 音标</p>';el.querySelectorAll('[data-audio]').forEach(b=>b.onclick=()=>run(async()=>{await new Audio(await api('audio',w.entries.mw.audio[+b.dataset.audio].file)).play();}));};
}
function syncWorkLayout(){
  const search=$('#page-search'),work=page==='work';document.body.classList.toggle('work-focus',work&&workFocus);api('workMode',work).catch(()=>{});$('#work-focus').textContent=workFocus?'退出专注':'专注阅读';if(!work)closePDFPopup();
  if(work){if(search.parentElement!==$('#work-query'))$('#work-query').append(search);search.classList.remove('hidden');const library=$('#page-library');if(library.parentElement!==$('#work-library-slot'))$('#work-library-slot').append(library);library.classList.remove('hidden');}
  else {if(search.parentElement!==document.querySelector('main'))document.querySelector('main').prepend(search);search.classList.toggle('hidden',page!=='search');const library=$('#page-library');if(library.parentElement!==document.querySelector('main'))document.querySelector('main').append(library);library.classList.toggle('hidden',!['library','review'].includes(page));}
  $('#work-query').classList.toggle('hidden',workTab!=='query');
  $('#work-library').classList.toggle('hidden',workTab!=='library');$('#work-documents').classList.toggle('hidden',['query','library'].includes(workTab));
  for(const [id,doc]of workDocuments)doc.frame.classList.toggle('hidden',id!==workTab);
  $('#work-return').disabled=!workDocuments.has(workLastPDF);for(const id of ['return-pdf','save-return-pdf']){const b=$('#'+id),target=workReturnTarget();if(b){b.disabled=!target||!workDocuments.has(target.id);b.title=b.disabled?(target?'原 PDF 标签已关闭':'尚无可返回的 PDF'):'返回查词前的阅读位置';}}
  $('#work-tabs').innerHTML='<button role="tab" data-work-tab="query" aria-selected="'+(workTab==='query')+'">双词查询</button><button role="tab" data-work-tab="library" aria-selected="'+(workTab==='library')+'">我的词库</button>'+[...workDocuments].map(([id,doc])=>`<span class="work-tab"><button role="tab" data-work-tab="${id}" aria-selected="${workTab===id}" title="${esc(doc.name)}">${esc(doc.name)}</button><button data-work-close="${id}" aria-label="关闭 ${esc(doc.name)}">×</button></span>`).join('');
  updateWorkLibraryBadge();
  $$('[data-work-tab]').forEach(b=>b.onclick=()=>switchWorkTab(b.dataset.workTab));
  $$('[data-work-close]').forEach(b=>b.onclick=()=>{const id=b.dataset.workClose;run(()=>api('flushPDF'));workDocuments.get(id)?.frame.remove();workDocuments.delete(id);if(workLastPDF===id)workLastPDF=[...workDocuments.keys()].at(-1)||null;if(workTab===id)workTab='query';syncWorkLayout();layout();});
}
function switchWorkTab(id){if(id!==workTab){interruptCollection();run(()=>api('flushPDF'));}rememberWorkLibraryScroll();closePDFPopup();workTab=id;if(workDocuments.has(id))workLastPDF=id;syncWorkLayout();if(id==='library'){if(workLibraryReady){renderDetail();}if(!workLibraryReady){configureLibraryHeader();renderLibrary();workLibraryReady=true;}restoreWorkLibraryScroll();}layout();}
async function openWorkFiles(files){
  for(const file of files){
    if(!/\.pdf$/i.test(file.name)){toast('请选择 PDF 文件。');continue;}
    if(file.size>200*1024*1024){toast('PDF 超过 200 MB，请先拆分文件。');continue;}
    const bytes=await file.arrayBuffer();
    if(!new TextDecoder().decode(bytes.slice(0,1024)).includes('%PDF-')){toast(file.name+' 不是有效 PDF。');continue;}
    const filePath=window.desk.filePath(file);const record=filePath?await api('pdfRegister',filePath):null;
    mountWorkPDF(file.name,bytes,record);
  }
}
async function workLookup(text,id,explicit=false,highlight=null){
  if(page!=='work'||workTab!==id||(!explicit&&!$('#work-auto').checked))return;
  const query=String(text||'').trim().replace(/\s+/g,' ');
  if(!query)return;
  if(query.length>80||query.split(' ').length>8){toast('已复制。请选择不超过 8 个词、80 个字符的单词或短语查词。');return;}
  if(highlight)highlight.text=query;if(highlight)workDocuments.get(id).frame.contentWindow.postMessage({kind:'add-highlight',highlight},'*');
  interruptCollection();workLastPDF=id;workQueryOrigin=captureWorkOrigin(id);$('#query').value=query;await api('search',query);browsing=true;switchWorkTab('query');
}
function bindWork(){
  window.desk.onWorkKey(handleWorkKey);$$('[data-work-library-mode]').forEach(b=>b.onclick=()=>setWorkLibraryMode(b.dataset.workLibraryMode));
  $('#work-history').onclick=()=>run(showPDFHistory);$('#work-focus').onclick=()=>{workFocus=!workFocus;syncWorkLayout();layout();};$('#work-fullscreen').onclick=()=>run(()=>setWorkFullscreen(!workFull));window.addEventListener('keydown',e=>{if(page==='work'&&(e.key==='F11'||e.key==='Escape')){e.preventDefault();handleWorkKey(e.key);}});document.addEventListener('pointerdown',e=>{if(!e.target.closest('#pdf-word-popup'))closePDFPopup();});
  $('#work-open').onclick=()=>$('#work-files').click();$('#work-files').onchange=()=>run(async()=>{await openWorkFiles([...$('#work-files').files]);$('#work-files').value='';});
  $('#work-return').onclick=()=>{if(workDocuments.has(workLastPDF))switchWorkTab(workLastPDF);};
  $('#page-work').ondragover=e=>{e.preventDefault();};$('#page-work').ondrop=e=>{e.preventDefault();run(()=>openWorkFiles([...e.dataTransfer.files]));};
  window.addEventListener('message',e=>{const pair=[...workDocuments].find(([,d])=>d.frame.contentWindow===e.source);if(!pair)return;if(e.data?.kind==='language-ready')pair[1].frame.contentWindow.postMessage({kind:'language',language:I18n.language},'*');if(e.data?.kind==='pdf-drop'&&page==='work')run(()=>openWorkFiles(e.data.files));if(e.data?.kind==='pdf-state'&&pair[1].record){pair[1].record={...pair[1].record,...e.data.state};run(()=>api('pdfState',pair[1].record.id,e.data.state));}if(e.data?.kind==='pdf-highlight')run(()=>showPDFPopup(pair[0],e.data.highlight,e.data.x,e.data.y));if(e.data?.kind==='pdf-dismiss')closePDFPopup();if(e.data?.kind==='pdf-key')handleWorkKey(e.data.key);if(e.data?.kind==='pdf-copy')run(()=>workLookup(e.data.text,pair[0],e.data.explicit,e.data.highlight));});
}
