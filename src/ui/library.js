// Reading and review share the same word record. Selection changes stay in a draft until saved.
let selectionDraft = null;
let reviewPhoneticsVisible = false;
let selectionPrompt = null;
const expandedTranslations=new Set();
function libraryIsReview(){return page==='review'||(page==='work'&&workLibraryMode==='review');}
function detailScroller(){return $('#word-detail .entry-scroll')||$('#word-detail');}
function mountDetailLayout(target,scrollTop=0){
  const toolbar=document.createElement('div');toolbar.className='entry-toolbar';
  for(const selector of [':scope > .dictionary-source',':scope > .detail-title']){const node=target.querySelector(selector);if(node)toolbar.append(node);}
  const content=document.createElement('div');content.className='entry-scroll';
  while(target.firstChild)content.append(target.firstChild);
  target.append(toolbar,content);content.scrollTop=scrollTop;
}
function beginSelection() {
  if(selectionDraft?.id===word()?.id){renderDetail();return;}
  const w = word(), bySource={};
  for(const source of entrySources(w))bySource[source]=w.entries[source].senses.map(s=>({selected:!!s.selected,includeChinese:includesChinese(s),examples:s.examples.map(x=>!!x.selected)}));
  selectionDraft={id:w.id,bySource,scroll:{},original:JSON.stringify(bySource),get values(){return this.bySource[word().source];}};
  renderDetail();
}
function selectionDirty() { return selectionDraft && JSON.stringify(selectionDraft.bySource)!==selectionDraft.original; }
async function saveSelection() {
  if (!selectionDraft) return;
  await ensureSaved();
  const draft=selectionDraft, w=data.words.find(w=>w.id===draft.id), updated=structuredClone(w);
  for(const [source,values]of Object.entries(draft.bySource))updated.entries[source].senses.forEach((s,i)=>{s.selected=values[i].selected;s.includeChinese=s.selected&&values[i].includeChinese;s.examples.forEach((x,j)=>x.selected=values[i].examples[j]);});
  await saveQueue;
  try{await api('update',updated);selectionSaveError=false;updateSaveNotice();}catch(e){selectionSaveError=true;updateSaveNotice();throw e;}
  data.words[data.words.findIndex(w=>w.id===updated.id)]=updated;
  selectionDraft=null;
  renderList(); renderDetail(); toast('选择已保存，复习词库和 Excel 导出已同步。');
}
async function leaveSelection() {
  if (!selectionDirty()) { selectionDraft=null;selectionSaveError=false;updateSaveNotice();return true; }
  if(selectionPrompt) return selectionPrompt;
  const dialog=$('#selection-dialog');
  selectionPrompt=new Promise(resolve=>{
    dialog.addEventListener('close',async()=>{
      const action=dialog.returnValue;
      if(action==='save') {
        try { await saveSelection(); resolve(true); }
        catch(e) { toast('保存失败，选择仍保留：'+e.message); resolve(false); }
      } else if(action==='discard') { selectionDraft=null;selectionSaveError=false;updateSaveNotice();resolve(true); }
      else resolve(false);
    },{once:true});
    dialog.returnValue='continue';api('layout',{},false).then(()=>dialog.showModal());
  });
  try{return await selectionPrompt;}finally{selectionPrompt=null;updateWorkLibraryBadge();layout();}
}
window.prepareToClose=async()=>{if($('#edit-dialog')?.open){$('#edit-save').focus();return false;}document.activeElement?.blur();try{await ensureSaved();await api('flushPDF');}catch(e){updateSaveNotice(e.message);return false;}return await leaveSelection();};
function selectionBar(e) {
  if(!selectionDraft)return workReturnButton()+'<button id="begin-selection" class="primary">选择释义</button>';
  return `<span id="selection-count" class="muted">${draftCountText()}</span><button id="select-all">${word().source==='cambridge'?'全选中英':'全选'}</button><button id="select-none">清空当前词典</button><button id="cancel-selection">取消</button>${workReturnButton(true)}<button id="save-selection" class="primary">保存选择</button>`;
}
function draftCountText(){return Object.entries(selectionDraft.bySource).map(([source,values])=>`${source==='mw'?'MW':'Cam'} 已选 ${values.filter(s=>s.selected).length} 条`).join(' · ');}
function updateSelectionDisplay() {
  updateWorkLibraryBadge();
  $('#selection-count').textContent=draftCountText();
  $$('[data-select-sense]').forEach(el=>{const yes=selectionDraft.values[+el.dataset.selectSense].selected;el.classList.toggle('chosen',yes);el.setAttribute('aria-checked',String(yes));});
  $$('[data-select-chinese]').forEach(el=>{const s=selectionDraft.values[+el.dataset.selectChinese],yes=s.selected&&s.includeChinese;el.classList.toggle('chosen',yes);el.setAttribute('aria-checked',String(yes));});
  $$('[data-selection-mode]').forEach(el=>{const s=selectionDraft.values[+el.dataset.selectionMode];el.textContent=s.selected?(s.includeChinese?'中英':'仅英文'):'未选择';});
}
function exampleHTML(s,i,review) {
  const examples=s.examples.map((x,j)=>({x,j})).filter(({x})=>!review||x.selected);
  if(!examples.length)return '';
  const content=examples.map(({x,j})=>`<div class="dictionary-example">${!review&&selectionDraft?`<label><input type="checkbox" data-example="${i}:${j}" ${selectionDraft.values[i].examples[j]?'checked':''}> <span>${esc(x.text)}</span></label>`:`<p>${esc(x.text)}</p>`}${x.translation?`<p class="translation">${esc(x.translation)}</p>`:''}${x.autoTranslation?`<details><summary>例句中文译文</summary><p>${esc(x.autoTranslation)}</p>${!review?`<textarea aria-label="修改例句译文" data-example-edit="${i}:${j}">${esc(x.autoTranslation)}</textarea>`:''}</details>`:''}</div>`).join('');
  return review?`<details class="review-extra"><summary>例句 · ${examples.length}</summary>${content}</details>`:content;
}
function sensesHTML(e,review) {
  let previous='';
  return e.senses.map((s,i)=>({s,i})).filter(({s})=>!review||s.selected).map(({s,i})=>{
    const edition=s.section?.match(/^(主词典|儿童词典|医学词典|法律词典|金融词典|地理词典)/)?.[0]||'';
    const group=edition+'|'+s.pos;
    const heading=group!==previous?`<div class="pos-heading"><h3>${esc(s.pos||'词性未提供')}</h3></div>`:'';previous=group;
    const selecting=!review&&!!selectionDraft;
    const chosen=selecting?selectionDraft.values[i].selected:!!s.selected;
    const chineseChosen=chosen&&(selecting?selectionDraft.values[i].includeChinese:includesChinese(s));
    const chinese=s.editedTranslation??s.translation;
    const mainChinese=e.source==='cambridge'&&chinese;
    const helperChinese=!mainChinese&&chinese;
    const parentContext=senseContext(e.senses,i);const context=parentContext?`<div class="sense-context">${esc(parentContext)}</div>`:'';
    return `${heading}<section class="dictionary-sense ${chosen&&!review?'saved-sense':''}" data-sense-index="${i}" data-entry-source="${e.source}"><div class="sense-definition"><div class="sense-number">${esc(s.number)}</div><div class="sense-body"><div class="sense-english ${selecting?'selectable-sense':''} ${chosen&&!review?'chosen':''}" ${selecting?`data-select-sense="${i}" role="checkbox" aria-checked="${chosen}" tabindex="0" aria-label="选择英文释义 ${esc(s.number)}"`:''}>${e.source==='cambridge'&&s.section?`<div class="sense-guide">${esc(s.section)}</div>`:''}${context}${s.labels?`<div class="sense-labels">${esc(s.labels)}</div>`:''}${definitionHTML(s,i,e.source)}</div>${mainChinese&&(!review||chineseChosen)?`<div class="dictionary-chinese ${selecting?'selectable-chinese':''} ${chineseChosen&&!review?'chosen':''}" ${selecting?`data-select-chinese="${i}" role="checkbox" aria-checked="${chineseChosen}" tabindex="0" aria-label="选择中英释义 ${esc(s.number)}"`:''}>${esc(chinese)}</div>`:''}${e.source==='cambridge'&&!review?`<span class="language-selection" data-selection-mode="${i}">${chosen?(chineseChosen?'中英':'仅英文'):'未选择'}</span>`:''}</div></div><div class="sense-support">${review?(helperChinese?`<details class="review-extra"><summary>中文辅助翻译</summary><p>${esc(chinese)}</p></details>`:''):`${helperChinese?`<p class="translation">${esc(chinese)}</p>`:''}`}${e.source!=='cambridge'||!review||chineseChosen?translationHTML(s,i,e.source):''}${s.references?.length&&!review?`<div class="cross-references">${s.references.map(esc).join(' · ')}</div>`:''}${exampleHTML(s,i,review)}</div></section>`;
  }).join('');
}
function renderDetail() {
  updateWorkLibraryBadge();
  const w=word(),review=libraryIsReview(),target=$('#word-detail'),previousScroll=detailScroller().scrollTop;
  target.className=review?'review-detail':'dictionary-detail';
  if(!w){target.innerHTML=`<div class="empty">${review?'选一个单词，开始复习。':'选择一个单词，阅读并挑选释义。'}<p>两个词库共用单词和分组，收藏后会同时出现。</p></div>`;return;}
  if(review){renderReview(w,target,previousScroll);return;}
  const e=w.entries[w.source];target.classList.add('source-'+w.source);
  const chosen=e.senses.filter(s=>s.selected).length;
  const warnings=e.warnings.filter(message=>!/截图|快照/.test(message)&&(w.source!=='cambridge'||!/音频|录音/.test(message)));
  target.innerHTML=`<div class="dictionary-source">${w.source==='mw'?'MERRIAM-WEBSTER':'CAMBRIDGE · 英语简体中文'}${review?' · 复习词条':''}</div><div class="detail-title"><div class="word-heading"><h2 class="entry-headword">${esc(w.word)}</h2><div class="detail-controls source-tabs">${['mw','cambridge'].map(source=>`<button data-source="${source}" class="${source===w.source?'active':''}" ${w.entries[source]?'':'disabled'}>${source==='mw'?'MW':'Cam'}</button>`).join('')}</div></div><div class="entry-actions">${selectionBar(e)}<details class="entry-more"><summary>更多</summary><div><button id="${review?'view-full':'lookup-again'}">${review?'查看完整词条 ↗':'重新查词 ↗'}</button><button id="delete-word" class="danger">删除单词</button></div></details></div></div>${pronunciationHTML(e)}${!review&&e.parserVersion!==3?'<div class="warning">这是旧版提取的词条。重新提取可修正音标和释义分组；旧修改会保留供核对。 <button id="repair-entry">重新提取此词典</button></div>':''}${warnings.length&&!review?`<div class="warning">${warnings.map(esc).join('<br>')}</div>`:''}${review&&!chosen?'<div class="review-empty"><h3>尚未选择复习释义</h3><p>单词已经收藏。挑选需要的释义后，它们会显示在这里。</p><button id="choose-from-review" class="primary">去选择释义</button></div>':sensesHTML(e,review)}${review?`${w.notes?`<details class="review-extra personal-notes"><summary>个人笔记</summary><p class="preserve-lines">${esc(w.notes)}</p></details>`:''}`:`<div class="entry-footer"><details><summary>考试遮盖词</summary><p class="muted">自动遮盖答案及常见词形。可补充词或短语，用逗号或换行分隔；离开输入框后自动保存，仅影响考试显示，不影响判题。</p><textarea id="exam-mask-words" placeholder="例如：scarcely, scarcity">${esc((w.examMaskWords||[]).join('\n'))}</textarea></details><details><summary>个人笔记</summary><textarea id="notes" placeholder="写下你的理解，离开输入框后自动保存">${esc(w.notes)}</textarea></details>${w.source==='mw'?`<details><summary>音频下载</summary>${e.audio.some(a=>!a.file)?'<button class="small-button" id="retry-audio">重试音频</button>':''}</details>`:''}${e.review?.length?`<div class="warning"><strong>更新待确认 · ${e.review.length} 条旧释义</strong><p>旧内容和个人修改保留如下，请对照新版重新选择。</p>${e.review.map(s=>`<p translate="no">${esc(s.pos)} · ${esc(s.editedDefinition??s.definition)}<br>${esc(s.editedTranslation??s.translation)}<br>${esc(s.autoTranslation||'')}<br>${s.examples.map(x=>esc(x.text)).join('<br>')}</p>`).join('')}<button id="ack-review" class="small-button">已核对，移入历史记录</button></div>`:''}<details><summary>词形、短语、标签与原始文本</summary><p class="muted">词形：<span translate="${e.forms.length?'no':'yes'}">${esc(e.forms.join('; ')||'未提供 / 未识别')}</span><br>短语：<span translate="${e.phrases.length?'no':'yes'}">${esc(e.phrases.join('; ')||'未提供 / 未识别')}</span><br>标签：<span translate="${e.labels.length?'no':'yes'}">${esc(e.labels.join('; ')||'未提供 / 未识别')}</span></p><pre class="raw">${esc(e.rawText)}</pre></details>${e.references?.length?`<details><summary>交叉参见</summary><p class="cross-references">${e.references.map(esc).join(" · ")}</p></details>`:''}${e.reviewHistory?.length?`<details><summary>历史释义记录</summary><pre class="raw">${esc(JSON.stringify(e.reviewHistory,null,2))}</pre></details>`:''}<p class="muted">来源：${esc(e.url)}<br>最后提取：${esc(new Date(e.capturedAt).toLocaleString('zh-CN'))}</p></div>`}`;
  mountDetailLayout(target,previousScroll);bindLibraryTools(e);
  if(review){$('#view-full').onclick=()=>run(()=>openLibraryView('full'));if($('#choose-from-review'))$('#choose-from-review').onclick=()=>run(async()=>{await openLibraryView('full');beginSelection();});}
  else {
    $('#lookup-again').onclick=()=>run(async()=>{if(page==='work')switchWorkTab('query');else if(!await go('search'))return;$('#query').value=w.word;await api('search',w.word);browsing=true;layout();});
    $$('[data-source]').forEach(b=>b.onclick=()=>run(async()=>{await ensureSaved();if(selectionDraft)selectionDraft.scroll[word().source]=detailScroller().scrollTop;word().source=b.dataset.source;await saveWord();renderList();renderDetail();detailScroller().scrollTop=selectionDraft?.scroll[b.dataset.source]||0;}));
    if($('#exam-mask-words'))$('#exam-mask-words').onchange=()=>{word().examMaskWords=[...new Set($('#exam-mask-words').value.split(/[,，;；\n]+/).map(t=>t.trim()).filter(Boolean))];run(saveWord);};
    if($('#notes'))$('#notes').onchange=()=>{word().notes=$('#notes').value;run(saveWord);};
    bindWorkReturnButtons();
    if($('#begin-selection'))$('#begin-selection').onclick=beginSelection;
    if(selectionDraft){
      $('#save-selection').onclick=()=>run(saveSelection);
      $('#cancel-selection').onclick=()=>{selectionDraft=null;selectionSaveError=false;updateSaveNotice();renderDetail();};
      for(const[id,value]of [['select-all',true],['select-none',false]])$('#'+id).onclick=()=>{selectionDraft.values.forEach(s=>{s.selected=value;s.includeChinese=value;if(!value)s.examples.fill(false);});if(!value)$$('[data-example]').forEach(b=>b.checked=false);updateSelectionDisplay();};
      $$('[data-select-sense]').forEach(el=>{
        const toggle=()=>{const s=selectionDraft.values[+el.dataset.selectSense];s.selected=!s.selected;s.includeChinese=false;updateSelectionDisplay();};
        el.onclick=event=>{if(!event.target.closest("button"))toggle();};el.onkeydown=event=>{if(event.target===el&&(event.key===' '||event.key==='Enter')){event.preventDefault();toggle();}};
      });
      $$('[data-select-chinese]').forEach(el=>{const toggle=()=>{const s=selectionDraft.values[+el.dataset.selectChinese];if(s.selected&&s.includeChinese)s.includeChinese=false;else{s.selected=true;s.includeChinese=true;}updateSelectionDisplay();};el.onclick=toggle;el.onkeydown=event=>{if(event.key===' '||event.key==='Enter'){event.preventDefault();toggle();}};});
      $$('[data-example]').forEach(b=>b.onchange=()=>{const[i,j]=b.dataset.example.split(':').map(Number);selectionDraft.values[i].examples[j]=b.checked;updateWorkLibraryBadge();});
    }
    $$('[data-edit]').forEach(t=>t.onchange=()=>{const[i,k]=t.dataset.edit.split(':');word().entries[w.source].senses[+i][k]=t.value;run(saveWord);});
    $$('[data-example-edit]').forEach(t=>t.onchange=()=>{const[i,j]=t.dataset.exampleEdit.split(':').map(Number);word().entries[w.source].senses[i].examples[j].autoTranslation=t.value;run(saveWord);});
    if($('#retry-audio'))$('#retry-audio').onclick=()=>run(async()=>{$('#retry-audio').disabled=true;await saveQueue;await api('retryAudio',w.id,w.source);await refresh();renderDetail();toast('录音将在后台下载，文字可继续使用。');});

    if($('#ack-review'))$('#ack-review').onclick=()=>run(async()=>{e.reviewHistory=[...(e.reviewHistory||[]),...e.review];e.review=[];e.warnings=e.warnings.filter(s=>!s.includes('旧释义'));await saveWord();renderDetail();});
  }
  $('#delete-word').onclick=()=>run(()=>deleteWords([w.id]));
  if($('#repair-entry'))$('#repair-entry').onclick=()=>run(()=>repairWord(w.id,w.source));
  bindTranslations();bindSenseEditors();
  $$('[data-audio]').forEach(b=>b.onclick=()=>run(async()=>{const audio=new Audio(await api('audio',e.audio[+b.dataset.audio].file));await audio.play();}));
}
const translationBusy=new Set();
function renderReview(w,target,previousScroll=0){
  const sources=selectedSources(w),pronSource=reviewPronunciationSource(w);
  const toggleLabel=reviewPhoneticsVisible?'隐藏音标':'显示音标';
  target.innerHTML=`<div class="dictionary-source">复习词条</div><div class="detail-title"><div class="word-heading"><h2 class="entry-headword">${esc(w.word)}</h2></div><div class="entry-actions"><button id="toggle-review-phonetics" class="phonetics-toggle" title="${toggleLabel}" aria-label="${toggleLabel}" aria-pressed="${reviewPhoneticsVisible}">${toggleLabel}</button><button id="view-full">查看完整词条 ↗</button><button id="delete-word" class="danger">删除单词</button></div></div>${reviewPhoneticsVisible?(pronSource?'<div class="review-pronunciations" data-pron-source="'+pronSource+'">'+pronunciationHTML(w.entries[pronSource])+'</div>':'<p class="muted review-pronunciations">尚无 MW 音标，请重新查询并收藏 MW</p>'):''}${sources.map(source=>`<section class="review-source source-${source}" data-review-source="${source}" data-entry-source="${source}">${sensesHTML(w.entries[source],true)}</section>`).join('')}${!sources.length?'<div class="review-empty"><h3>尚未选择复习释义</h3><button id="choose-from-review" class="primary">去选择释义</button></div>':''}${w.notes?`<details class="review-extra personal-notes"><summary>个人笔记</summary><p class="preserve-lines">${esc(w.notes)}</p></details>`:''}`;
  mountDetailLayout(target,previousScroll);
  $('#toggle-review-phonetics').onclick=()=>{reviewPhoneticsVisible=!reviewPhoneticsVisible;renderDetail();$('#toggle-review-phonetics').focus();};
  $('#view-full').onclick=()=>run(()=>openLibraryView('full'));$('#delete-word').onclick=()=>run(()=>deleteWords([w.id]));
  if($('#choose-from-review'))$('#choose-from-review').onclick=()=>run(async()=>{if(await openLibraryView('full'))beginSelection();});
  bindTranslations();bindSenseEditors();
  $$('[data-audio]').forEach(b=>b.onclick=()=>run(async()=>{const e=w.entries[pronSource];const audio=new Audio(await api('audio',e.audio[+b.dataset.audio].file));await audio.play();}));
}
function translationKey(index,source=word().source){return word().id+':'+source+':'+index;}
function definitionHTML(s,index,source=word().source){
  const lines=(s.editedDefinition??s.definition).split('\n');
  const translateButton=source==='mw'?` <button class="inline-translate" data-translate="${index}" title="${s.autoTranslation?'显示或收起已有译文':'翻译此条完整释义'}" aria-label="翻译释义 ${esc(s.number)}" ${translationBusy.has(translationKey(index,source))?'disabled':''}>${translationBusy.has(translationKey(index,source))?'…':'译'}</button>`:'';
  const button=translateButton+` <button class="inline-edit" data-edit-sense="${index}" aria-label="编辑释义 ${esc(s.number)}">编辑</button>`;
  return `<p class="dictionary-definition">${lines.map((line,n)=>`<span class="definition-line">${esc(line).replace(/^(also|especially|specifically)\s*:/,'<em>$1</em> :')}${n===lines.length-1?button:''}</span>`).join('')}</p>`;
}
function translationHTML(s,index,source=word().source){
  if(!s.autoTranslation||!expandedTranslations.has(translationKey(index,source)))return '';
  return `<div class="sense-translation"><p>${esc(s.autoTranslation)}</p><span class="muted">自动译文</span> <button class="small-button" data-retranslate="${index}">重新翻译</button></div>`;
}
function bindTranslations(){
  $$('[data-translate], [data-retranslate]').forEach(b=>b.onclick=event=>{event.stopPropagation();run(async()=>{
    const w=word(),source=b.closest('[data-entry-source]')?.dataset.entrySource||w.source,i=Number(b.dataset.translate??b.dataset.retranslate),s=w.entries[source].senses[i],key=translationKey(i,source);
    const rerender=()=>{if(activeId===w.id&&(libraryIsReview()||((page==='library'||page==='work')&&word()?.source===source))){const top=detailScroller().scrollTop;renderDetail();detailScroller().scrollTop=top;}};
    if(b.dataset.retranslate===undefined&&s.autoTranslation){expandedTranslations.has(key)?expandedTranslations.delete(key):expandedTranslations.add(key);rerender();return;}
    if(translationBusy.has(key))return;translationBusy.add(key);b.disabled=true;b.textContent='…';
    try{await saveQueue;const result=await api('translate',w.id,source,i,null);const current=data.words.find(x=>x.id===w.id)?.entries[source]?.senses[i];if(current)current.autoTranslation=result;expandedTranslations.add(key);}finally{translationBusy.delete(key);rerender();}
  });});
}
function pronunciationHTML(e){
  if(e.source==='cambridge')e={...e,pronunciationGroups:displayPronunciationGroups(e)};
  if(!e.pronunciationGroups?.length)return '<div class="pronunciation-flow">'+e.pronunciations.map(p=>'<span class="pron-unit">'+esc(pronunciationSlash(p.value))+'</span>').join(' ')+(e.source==='mw'?e.audio:[]).map((a,i)=>'<button class="pron-play" data-audio="'+i+'" '+(a.file?'':'disabled')+'>▷ '+esc(a.region||'原音频')+'</button>').join(' ')+'</div>';
  return '<div class="pronunciation-flow">'+e.pronunciationGroups.map(g=>'<span class="pron-group"><strong>'+esc(g.form)+'</strong> '+(g.region!=='MW'?'<span class="badge">'+esc(g.region)+'</span> ':'')+g.items.map(p=>{const i=e.audio.findIndex(a=>a.url===p.audioUrl),a=e.source==='mw'?e.audio[i]:null;return (p.label?'<span class="pron-note">'+esc(p.label)+'</span> ':'')+'<span class="pron-unit"><span class="pron-value">'+esc(pronunciationSlash(p.value))+'</span>'+(a?'<button class="pron-play" data-audio="'+i+'" title="播放 '+esc(g.form)+' '+esc(p.value)+'" '+(a.file?'':'disabled')+'>▷</button>':'')+'</span>'+esc(p.suffix);}).join(' ')+'</span>').join(' ')+'</div>';
}
