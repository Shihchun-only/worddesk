let selectedWords=new Set(),collectionSource='both',collectionGroups=new Set();
let collectionDialogBusy=false;
let unselectedFilters={full:false,review:false};
function libraryFilterKey(){return libraryIsReview()?'review':'full';}
function filteredWords(ignoreUnselected=false){const q=$('#library-search').value.toLowerCase(),g=$('#group-filter').value;return data.words.filter(w=>w.word.toLowerCase().includes(q)&&(!g||w.groups.includes(g))&&(ignoreUnselected||!unselectedFilters[libraryFilterKey()]||!selectedCount(w)));}
function updateBatch(){const ids=new Set(filteredWords().map(w=>w.id));selectedWords=new Set([...selectedWords].filter(id=>ids.has(id)));$('#batch-count').textContent=`已选 ${selectedWords.size} 个`;$('#delete-selected').disabled=!selectedWords.size;$('#remove-group').disabled=!selectedWords.size||!$('#group-filter').value;$('#select-visible').checked=ids.size>0&&selectedWords.size===ids.size;$('#select-visible').indeterminate=selectedWords.size>0&&selectedWords.size<ids.size;}
function renderWordList(){
  const toggle=$('#only-unselected');toggle.setAttribute('aria-pressed',String(unselectedFilters[libraryFilterKey()]));toggle.textContent='仅未选释义 · '+filteredWords(true).filter(w=>!selectedCount(w)).length;
  $('#delete-group').classList.toggle('hidden',!$('#group-filter').value);const list=filteredWords();$('#library-summary').textContent=`${list.length} 个单词`;$('#word-list').innerHTML=list.length?list.map(w=>`<div class="word-list-item ${selectedCount(w)?'':'unselected-word'}"><input type="checkbox" data-check-word="${w.id}" aria-label="选择单词 ${esc(w.word)}" ${selectedWords.has(w.id)?'checked':''}><button class="word-row ${w.id===activeId?'active':''}" data-id="${w.id}"><strong>${esc(w.word)}</strong><small>${selectedCount(w)?(libraryIsReview()?'':selectedSources(w).map(s=>s==='mw'?'MW':'Cam').join(' + ')+' · ')+'已选 '+selectedCount(w)+' 条':'未选释义'}</small></button></div>`).join(''):'<p class="muted">还没有匹配的单词</p>';
  $$('[data-check-word]').forEach(b=>b.onchange=()=>{b.checked?selectedWords.add(b.dataset.checkWord):selectedWords.delete(b.dataset.checkWord);updateBatch();});
  $$('.word-row').forEach(b=>b.onclick=()=>run(async()=>{if(b.dataset.id!==activeId&&!await leaveSelection())return;await ensureSaved();activeId=b.dataset.id;renderList();renderDetail();detailScroller().scrollTop=0;}));updateBatch();
}
function confirmOperation(title,message,button='确定'){const d=$('#confirm-dialog');$('#confirm-title').textContent=title;$('#confirm-message').textContent=message;$('#confirm-action').textContent=button;d.returnValue='cancel';return new Promise(resolve=>{d.addEventListener('close',()=>resolve(d.returnValue==='ok'),{once:true});d.showModal();});}
async function deleteWords(ids){
  if(!await leaveSelection())return;await ensureSaved();
  const words=data.words.filter(w=>ids.includes(w.id));if(!words.length)return;
  if(!await confirmOperation(`删除 ${words.length} 个单词？`,`将从两个词库及所有分组中同步移除：${words.slice(0,8).map(w=>w.word).join('、')}${words.length>8?'…':''}。内容进入回收站，保留 7 天后永久清理。`,'移入回收站')){renderDetail();return;}
  const count=await api('trashWords',words.map(w=>w.id));selectedWords.clear();if(ids.includes(activeId))activeId=null;await refresh();renderLibrary();toast(`已删除 ${count} 个单词，7 天内可在回收站恢复。`);
}
async function removeGroup(){if(!await leaveSelection())return;await ensureSaved();const group=$('#group-filter').value,ids=[...selectedWords];if(!group||!ids.length)return;if(!await confirmOperation('移出当前分组？',`将 ${ids.length} 个单词移出“${group}”；词库及其他分组中的内容保留。`,'移出分组')){renderDetail();return;}await api('removeFromGroup',ids,group);selectedWords.clear();await refresh();renderLibrary();}
function updateCollectionLabels(){const groups=(data.lastCollectionGroups||[]).filter(g=>data.groups.includes(g));$('#recent-groups').textContent=groups.length?'上次：'+groups.join('、'):'尚无收藏分组记录';$$('[data-quick]').forEach(b=>b.title=groups.length?'收藏至：'+groups.join('、'):'请选择收藏分组');}
function renderCollectionGroups(){const q=$('#collection-filter').value.trim().toLowerCase();$('#collection-groups').innerHTML=data.groups.filter(g=>g.toLowerCase().includes(q)).map(g=>`<label><input type="checkbox" data-collection-group="${esc(g)}" ${collectionGroups.has(g)?'checked':''}>${esc(g)}</label>`).join('')||'<p class="muted">没有匹配分组，可以在下方新建。</p>';$$('[data-collection-group]').forEach(b=>b.onchange=()=>{b.checked?collectionGroups.add(b.dataset.collectionGroup):collectionGroups.delete(b.dataset.collectionGroup);$('#collection-confirm').disabled=!collectionGroups.size;});$('#collection-confirm').disabled=!collectionGroups.size;}
async function chooseCollection(source,quick=false){
  if(collectionDialogBusy)return;await refresh();const previous=(data.lastCollectionGroups||[]).filter(g=>data.groups.includes(g));
  if(quick&&previous.length)return collect(source,previous);
  collectionSource=source;collectionGroups=new Set(previous);$('#collection-filter').value='';$('#collection-new-name').value='';$('#collection-source-name').textContent=source==='both'?'两部词典':source==='mw'?'Merriam-Webster':'剑桥英汉词典';renderCollectionGroups();
  collectionDialogBusy=true;await api('layout',{},false);const d=$('#collection-dialog');d.returnValue='cancel';
  const result=await new Promise(resolve=>{d.addEventListener('close',()=>resolve(d.returnValue),{once:true});d.showModal();});collectionDialogBusy=false;layout();
  if(result==='ok')await collect(source,[...collectionGroups]);
}
async function repairWord(id,source){const inWork=page==='work';if(inWork){if(!await leaveSelection())return;switchWorkTab('query');}else if(!await go('search'))return;browsing=true;layout();toast('正在重新加载并提取此词典；旧内容及个人修改会保留。');try{await api('repair',id,source);await refresh();if(inWork)await openWorkLibraryWord(id,'full');else{activeId=id;await go('library');}toast('词条已更新，请核对释义选择；无法对应的旧修改保留在“更新待确认”。');}catch(e){toast('未覆盖旧词条。请完成网页验证后，再点击“收藏进”重试：'+e.message);}}
async function deleteCurrentGroup(){
  if(!await leaveSelection())return;await ensureSaved();renderDetail();const group=$('#group-filter').value;if(!group)return;
  const count=data.words.filter(w=>w.groups.includes(group)).length;
  if(!await confirmOperation('删除分组“'+group+'”？','该分组包含 '+count+' 个单词。只删除分组，两个词库的单词、其他分组归属、笔记及释义选择均保留。','删除分组'))return;
  await api('deleteGroup',group);selectedWords.clear();await refresh();renderLibrary();toast('分组已删除，单词已保留。');
}
function bindManagement(){
  $('#only-unselected').onclick=()=>run(async()=>{const key=libraryFilterKey(),value=!unselectedFilters[key];await api('preference',key==='full'?'unselectedFull':'unselectedReview',value);unselectedFilters[key]=value;renderList();});
  $('#delete-group').onclick=()=>run(deleteCurrentGroup);

  $('#select-visible').onchange=event=>{selectedWords=event.target.checked?new Set(filteredWords().map(w=>w.id)):new Set();renderList();};
  $('#delete-selected').onclick=()=>run(()=>deleteWords([...selectedWords]));$('#remove-group').onclick=()=>run(removeGroup);
  $$('[data-quick]').forEach(b=>b.onclick=()=>run(()=>chooseCollection(b.dataset.quick,true)));
  $('#collection-filter').oninput=renderCollectionGroups;
  $('#collection-add-group').onclick=()=>run(async()=>{const name=$('#collection-new-name').value.trim();if(!name)return;await api('groups',[...data.groups,name]);await refresh();collectionGroups.add(name);$('#collection-new-name').value='';$('#collection-filter').value='';renderCollectionGroups();});
  $('#open-trash').onclick=()=>run(async()=>{if(!await leaveSelection())return;if(await go('storage'))$('#recycle-bin').scrollIntoView({block:'start'});});
}
