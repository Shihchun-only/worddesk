let examMaskEnabled=true,autoSelectAfterCollect=true,examAnswerPosition='bottom';
function applyBehaviorPreferences(state){unselectedFilters={full:!!state.unselectedFull,review:!!state.unselectedReview};$('#language-choice').value=state.language||'zh-CN';I18n.setLanguage(state.language||'zh-CN');examMaskEnabled=state.examMaskEnabled!==false;$('#exam-mask-enabled').checked=examMaskEnabled;autoSelectAfterCollect=state.autoSelectAfterCollect!==false;examAnswerPosition=state.examAnswerPosition==='top'?'top':'bottom';$('#auto-select-collect').checked=autoSelectAfterCollect;$('#exam-position').value=examAnswerPosition;positionExamAnswer();}
function positionExamAnswer(){const target=$('#exam-content'),toolbar=target.querySelector('.exam-toolbar'),scroll=target.querySelector('.exam-scroll');target.dataset.answerPosition=examAnswerPosition;if(toolbar&&scroll){if(examAnswerPosition==='bottom')target.append(toolbar);else target.insertBefore(toolbar,scroll);}}
let editTarget=null;
let trashSelected=new Set();
function applyAppearance(mode){
  document.documentElement.dataset.theme=mode==='dark'?'dark':'light';
  $$('[data-theme-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.themeChoice===document.documentElement.dataset.theme)));
}
function bindSenseEditors(){
  $$('[data-edit-sense]').forEach(b=>b.onclick=event=>{event.stopPropagation();run(async()=>{
    await saveQueue;const w=word(),source=b.closest('[data-entry-source]')?.dataset.entrySource||w.source,index=Number(b.dataset.editSense),s=w.entries[source].senses[index];
    editTarget={id:w.id,source,index,definition:s.definition,translation:s.translation||'',originalAuto:s.autoTranslation||'',initialDefinition:s.editedDefinition??s.definition};
    $('#edit-context').textContent=w.word+' · '+(source==='mw'?'Merriam-Webster':'剑桥')+' · '+s.number;
    $('#edit-definition').value=s.editedDefinition??s.definition;$('#edit-translation').value=s.editedTranslation??s.translation??'';
    $('#edit-auto').value=s.autoTranslation||'';$('#edit-auto-label').classList.toggle('hidden',!s.autoTranslation);
    $('#edit-dialog').showModal();
  });});
}
async function commitSenseEdit(){
  if(!editTarget)return;const t=editTarget;await saveQueue;
  const w=structuredClone(data.words.find(w=>w.id===t.id)),s=w?.entries[t.source]?.senses[t.index];if(!s)throw new Error('释义不存在');
  const definition=$('#edit-definition').value.trim(),translation=$('#edit-translation').value.trim(),auto=$('#edit-auto').value.trim();
  if(!definition)throw new Error('释义不能为空');
  if(definition===s.definition)delete s.editedDefinition;else s.editedDefinition=definition;
  if(translation===(s.translation||''))delete s.editedTranslation;else s.editedTranslation=translation;
  if(!auto||(definition!==t.initialDefinition&&auto===t.originalAuto))delete s.autoTranslation;else s.autoTranslation=auto;
  await api('update',w);data.words[data.words.findIndex(x=>x.id===w.id)]=w;
  $('#edit-dialog').close();editTarget=null;const top=detailScroller().scrollTop;renderDetail();detailScroller().scrollTop=top;toast('释义已保存，复习与导出已同步。');
}
function retentionText(w){const left=Date.parse(w.expiresAt)-Date.now();if(left<=0)return '即将清理';const hours=Math.ceil(left/3600000);return hours>24?`剩余 ${Math.ceil(hours/24)} 天`:`剩余 ${hours} 小时`;}
function updateTrashSelection(){
  const ids=new Set((data.trash||[]).map(w=>w.id));trashSelected=new Set([...trashSelected].filter(id=>ids.has(id)));
  $('#trash-count').textContent=`${ids.size} 个单词 · 已选 ${trashSelected.size} 个`;
  $('#trash-all').checked=ids.size>0&&trashSelected.size===ids.size;$('#trash-all').indeterminate=trashSelected.size>0&&trashSelected.size<ids.size;
  $('#trash-restore').disabled=$('#trash-purge').disabled=!trashSelected.size;
}
function renderTrash(){
  const list=data.trash||[];
  $('#trash-list').innerHTML=list.length?list.map(w=>`<div class="trash-row"><input type="checkbox" data-trash-check="${w.id}" aria-label="选择 ${esc(w.word)}" ${trashSelected.has(w.id)?'checked':''}><div><strong>${esc(w.word)}</strong><p class="muted">${w.groups.length?'<span translate="no">'+esc(w.groups.join('、'))+'</span>':'未分组'} · 删除于 ${esc(new Date(w.deletedAt).toLocaleString('zh-CN'))}<br><span class="retention">${retentionText(w)}</span> · 到期 ${esc(new Date(w.expiresAt).toLocaleString('zh-CN'))}</p></div><button data-restore-word="${w.id}">恢复</button><button class="danger" data-purge-word="${w.id}">永久删除</button></div>`).join(''):'<div class="empty">回收站为空。</div>';
  $$('[data-trash-check]').forEach(b=>b.onchange=()=>{b.checked?trashSelected.add(b.dataset.trashCheck):trashSelected.delete(b.dataset.trashCheck);updateTrashSelection();});
  $$('[data-restore-word]').forEach(b=>b.onclick=()=>run(()=>restoreTrash([b.dataset.restoreWord])));
  $$('[data-purge-word]').forEach(b=>b.onclick=()=>run(()=>purgeTrash([b.dataset.purgeWord])));updateTrashSelection();
}
async function restoreTrash(ids){const n=await api('restoreWords',ids);await refresh();renderTrash();toast(n?`已恢复 ${n} 个单词及其原分组、笔记和选择。`:'所选内容已到期清理。');}
async function purgeTrash(ids){
  if(!await confirmOperation(`永久删除 ${ids.length} 个单词？`,'词条、个人编辑及未被其他词条使用的音频和截图将被清理，无法撤销。','永久删除'))return;
  const result=await api('purgeWords',ids);await refresh();renderTrash();toast(result.failed?'词条已删除，部分文件未能清理。':'已永久删除。');
}
function bindPreferences(){
  $('#language-choice').onchange=e=>run(async()=>{const input=e.target;input.disabled=true;try{const language=await api('preference','language',input.value);I18n.setLanguage(language);requestAnimationFrame(layout);for(const doc of workDocuments.values())doc.frame.contentWindow.postMessage({kind:'language',language},'*');}finally{input.value=I18n.language;input.disabled=false;}});
  $('#exam-mask-enabled').onchange=e=>run(async()=>{const input=e.target;input.disabled=true;try{examMaskEnabled=await api('preference','examMaskEnabled',input.checked);if(!examMaskEnabled&&examSession&&examSession.index<examSession.ids.length){const r=examResult();if(!r.correct&&!r.revealed&&!r.skipped)r.hinted=true;}}finally{input.checked=examMaskEnabled;input.disabled=false;}});
  $('#auto-select-collect').onchange=e=>run(async()=>{const input=e.target;input.disabled=true;try{autoSelectAfterCollect=await api('preference','autoSelectAfterCollect',input.checked);}finally{input.checked=autoSelectAfterCollect;input.disabled=false;}});
  $('#exam-position').onchange=e=>run(async()=>{const input=e.target;input.disabled=true;try{examAnswerPosition=await api('preference','examAnswerPosition',input.value);positionExamAnswer();}finally{input.value=examAnswerPosition;input.disabled=false;}});
  $('#clear-cambridge-audio').onclick=()=>run(async()=>{
    const stats=await api('cambridgeAudioStats');if(!stats.count){await renderCambridgeAudioCleanup();return;}
    if(!await confirmOperation('清理剑桥录音？',`将永久删除 ${stats.count} 段旧剑桥录音，释放约 ${formatBytes(stats.bytes)}。MW 录音、音标、释义和笔记保留。`,'清理录音'))return;
    $('#clear-cambridge-audio').disabled=true;
    try{const result=await api('clearCambridgeAudio');await refresh();toast(`已清理 ${result.count} 段剑桥录音，释放 ${formatBytes(result.bytes)}${result.failed?'；部分文件暂未能清理。':'。'}`);}finally{await renderCambridgeAudioCleanup();}
  });
  $('#clear-screenshots').onclick=()=>run(async()=>{
    const stats=await api('screenshotStats');if(!stats.count){await renderScreenshotCleanup();return;}
    if(!await confirmOperation('清理已有网页截图？',`将永久删除 ${stats.count} 张旧截图，释放约 ${formatBytes(stats.bytes)}。词条、音频、笔记和释义选择保留。`,'清理截图'))return;
    $('#clear-screenshots').disabled=true;
    try{const result=await api('clearScreenshots');await refresh();toast(`已清理 ${result.count} 张截图，释放 ${formatBytes(result.bytes)}${result.failed?'；部分文件暂未能清理，可稍后重试。':'。'}`);}finally{await renderScreenshotCleanup();}
  });
  $$('[data-theme-choice]').forEach(b=>b.onclick=()=>run(async()=>{applyAppearance(await api('appearance',b.dataset.themeChoice));}));
  $('#edit-form').onsubmit=event=>{event.preventDefault();run(async()=>{$('#edit-save').disabled=true;try{await commitSenseEdit();}finally{$('#edit-save').disabled=false;}});};
  $('#edit-cancel').onclick=()=>$('#edit-dialog').close();$('#edit-dialog').addEventListener('close',()=>editTarget=null);
  $('#edit-original').onclick=()=>{if(!editTarget)return;$('#edit-definition').value=editTarget.definition;$('#edit-translation').value=editTarget.translation;$('#edit-auto').value='';};
  $('#trash-all').onchange=event=>{trashSelected=event.target.checked?new Set(data.trash.map(w=>w.id)):new Set();renderTrash();};
  $('#trash-restore').onclick=()=>run(()=>restoreTrash([...trashSelected]));$('#trash-purge').onclick=()=>run(()=>purgeTrash([...trashSelected]));
  setInterval(()=>{if(page==='storage'&&!$('dialog[open]'))run(async()=>{await refresh();renderTrash();});},60000);
}
function formatBytes(bytes){if(bytes<1024)return bytes+' B';if(bytes<1024*1024)return (bytes/1024).toFixed(1)+' KB';return (bytes/1024/1024).toFixed(1)+' MB';}
async function renderScreenshotCleanup(){const stats=await api('screenshotStats');$('#screenshot-space').textContent=stats.count?`${stats.count} 张旧截图 · 可释放 ${formatBytes(stats.bytes)}`:'没有可清理的网页截图';$('#clear-screenshots').disabled=!stats.count;}
async function renderCambridgeAudioCleanup(){const stats=await api('cambridgeAudioStats');$('#cambridge-audio-space').textContent=stats.count?`${stats.count} 段旧录音 · 可释放 ${formatBytes(stats.bytes)}`:'没有可清理的剑桥录音';$('#clear-cambridge-audio').disabled=!stats.count;}

function applyWordSize(size){document.documentElement.style.setProperty('--word-size',size+'px');$$('[data-word-size]').forEach(e=>e.value=size);$$('[data-word-size-value]').forEach(e=>e.textContent=size);}
function bindWordSize(){$$('[data-word-size]').forEach(e=>e.oninput=()=>{applyWordSize(+e.value);run(()=>api('fontSize',+e.value));});$('#font-reset').onclick=()=>{applyWordSize(18);run(()=>api('fontSize',18));};}
