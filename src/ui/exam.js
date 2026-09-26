let examSession=null,examGroup='',examOrder='time';
function examWord(){return data.words.find(w=>w.id===examSession?.ids[examSession.index]);}
function examResult(){return examSession.results[examSession.index];}
function startExam(ids,omitted=0){examSession={ids,index:0,results:ids.map(Exam.newExamResult),input:'',visible:false,feedback:'',omitted};renderExam();}
function renderExam(){
  const target=$('#exam-content');
  if(!examSession){
    if(!data.groups.includes(examGroup))examGroup='';
    const queue=Exam.examQueue(data.words,examGroup,examOrder);
    target.innerHTML=`<div class="card exam-setup"><h2>开始一次拼写练习</h2><p class="muted">根据已选释义写出单词或短语。每题按 Enter 检查，再按 Enter 进入下一题。</p><label>考试范围<select id="exam-group"><option value="">全部词库</option>${data.groups.map(g=>`<option value="${esc(g)}" ${examGroup===g?'selected':''}>${esc(g)}</option>`).join('')}</select></label><label>题目顺序<select id="exam-order"><option value="time">收藏顺序</option><option value="alpha">字母顺序</option><option value="random">随机顺序</option></select></label><p id="exam-eligible" class="muted">可考试 ${queue.ids.length} 个单词；${queue.omitted} 个未选释义的单词不出题。</p><button id="exam-start" class="primary" ${queue.ids.length?'':'disabled'}>开始考试</button><p class="muted">成绩仅保留本次会话。展开音标、例句、笔记或辅助翻译均记为使用提示；复杂词形可能透露答案。</p></div>`;
    $('#exam-order').value=examOrder;$('#exam-group').onchange=e=>{examGroup=e.target.value;renderExam();};$('#exam-order').onchange=e=>{examOrder=e.target.value;renderExam();};$('#exam-start').onclick=()=>startExam(Exam.examQueue(data.words,examGroup,examOrder).ids,queue.omitted);return;
  }
  if(examSession.index>=examSession.ids.length){renderExamSummary(target);return;}
  const w=examWord();
  // Library changes while away are reflected immediately; removed/cleared questions are omitted.
  if(!w||!selectedCount(w)){examSession.ids.splice(examSession.index,1);examSession.results.splice(examSession.index,1);examSession.omitted++;renderExam();return;}
  const r=examResult(),done=r.correct||r.revealed,pronSource=reviewPronunciationSource(w);
  if(!examMaskEnabled&&!done&&!r.skipped)r.hinted=true;
  const text=value=>esc(examMaskEnabled?Exam.maskAnswer(value,w.word,w.examMaskWords):value);
  const label=value=>String(value||'').replace(/\b(?:(?:intransitive|transitive|auxiliary|modal)\s+)?(?:noun|verb|adjective|adverb|pronoun|preposition|conjunction|interjection|determiner|article)\b/gi,'').replace(/(?:名词|动词|形容词|副词|代词|介词|连词|感叹词|冠词)/g,'').replace(/^[\s·,;|/]+|[\s·,;|/]+$/g,'');
  const details=(title,body)=>body?`<details class="exam-hint"><summary>${title}</summary>${body}</details>`:'';
  const definitions=selectedSources(w).map(source=>{const e=w.entries[source];return `<section class="exam-definitions">${e.senses.map((s,i)=>({s,i})).filter(({s})=>s.selected).map(({s,i})=>{
    const bilingual=source!=='cambridge'||includesChinese(s),translation=bilingual?(s.editedTranslation??s.translation):'',context=senseContext(e.senses,i);
    const examples=s.examples.filter(x=>x.selected).map(x=>`<p>${text(x.text)}${bilingual&&x.translation?'<br>'+text(x.translation):''}</p>`).join('');
    return `<section class="exam-sense">${source==='cambridge'&&label(s.section)?'<h3>'+text(label(s.section))+'</h3>':''}<div class="exam-definition">${dictionaryNumber(s,source)?'<span class="sense-number">'+text(dictionaryNumber(s,source))+'</span>':''}<div>${context?'<p class="sense-context">'+text(context)+'</p>':''}${label(s.labels)?'<p class="sense-labels">'+text(label(s.labels))+'</p>':''}<p class="preserve-lines">${text(s.editedDefinition??s.definition)}</p>${source==='cambridge'&&translation?'<p class="dictionary-chinese">'+text(translation)+'</p>':''}${source!=='cambridge'?details('中文辅助翻译',translation?'<p>'+text(translation)+'</p>':''):''}${bilingual?details('已保存自动译文',s.autoTranslation?'<p>'+text(s.autoTranslation)+'</p>':''):''}${details('例句',examples)}</div></div></section>`;
  }).join('')}</section>`;}).join('');
  target.innerHTML=`<div class="exam-progress">第 ${examSession.index+1} / ${examSession.ids.length} 题 <span id="exam-hint-status" class="muted">${r.hinted?'已使用提示':''}</span></div><div class="exam-toolbar"><div class="exam-actions"><button id="exam-phonetics" class="phonetics-toggle" aria-label="${examSession.visible?'隐藏音标':'显示音标'}" title="${examSession.visible?'隐藏音标':'显示音标'}">${examSession.visible?'○':'☾'}</button><button id="exam-reveal" ${done?'disabled':''}>显示答案</button><button id="exam-skip" ${done?'disabled':''}>跳过</button><button id="exam-end">结束考试</button></div><form id="exam-form"><label class="sr-only" for="exam-answer">输入单词或短语</label><input id="exam-answer" placeholder="输入单词或短语，按 Enter 检查" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(examSession.input)}" ${done?'readonly':''}><button class="primary" id="exam-submit">${done?'下一题 ↵':'检查 ↵'}</button></form><p id="exam-feedback" role="status" class="${r.correct?'exam-correct':r.wrong&&!r.revealed?'exam-wrong':'muted'}">${esc(examSession.feedback||'输入后按 Enter 确认；忽略大小写和首尾空格。')}${r.revealed?'　正确答案：<strong>'+esc(w.word)+'</strong>':''}</p></div><div class="exam-scroll">${examSession.visible?(pronSource?pronunciationHTML(w.entries[pronSource]):'<p class="muted">尚无 MW 音标</p>'):''}${definitions}${details('个人笔记',w.notes?'<p class="preserve-lines">'+text(w.notes)+'</p>':'')}</div>`;
  // Mask displayed pronunciation labels as text, never HTML or audio identifiers.
  const pron=target.querySelector('.pronunciation-flow');
  if(pron&&examMaskEnabled){const walker=document.createTreeWalker(pron,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode())node.textContent=Exam.maskAnswer(node.textContent,w.word,w.examMaskWords);pron.querySelectorAll('[title]').forEach(el=>el.title=Exam.maskAnswer(el.title,w.word,w.examMaskWords));}
  positionExamAnswer();
  const input=$('#exam-answer');input.oninput=()=>examSession.input=input.value;let composing=false,lastComposition=0;
  input.addEventListener('compositionstart',()=>composing=true);input.addEventListener('compositionend',()=>{composing=false;lastComposition=Date.now();});
  input.onkeydown=event=>{if(event.key==='Enter'&&(event.isComposing||composing||event.keyCode===229||event.repeat||Date.now()-lastComposition<80))event.preventDefault();};
  $('#exam-form').onsubmit=event=>{event.preventDefault();if(composing||Date.now()-lastComposition<80)return;if(done){advanceExam();return;}const outcome=Exam.checkExamAnswer(r,input.value,w.word);examSession.input=input.value;examSession.feedback=outcome==='empty'?'请先输入单词。':outcome==='correct'?'回答正确！再次按 Enter 进入下一题。':'拼写不正确，请修改后再试。';renderExam();};
  $('#exam-phonetics').onclick=()=>{examSession.visible=!examSession.visible;if(examSession.visible&&!done)r.hinted=true;renderExam();};
  $('#exam-reveal').onclick=()=>{r.revealed=true;examSession.feedback='已显示答案，再按 Enter 进入下一题。';renderExam();};
  $('#exam-skip').onclick=()=>{r.skipped=true;advanceExam();};
  $('#exam-end').onclick=()=>run(async()=>{if(await confirmOperation('结束本次考试？','将查看已完成题目的结果，未作答的剩余题目计为跳过。','结束考试')){for(const item of examSession.results.slice(examSession.index))if(!item.correct&&!item.revealed)item.skipped=true;examSession.index=examSession.ids.length;renderExam();}});
  $$('#exam-content .exam-hint').forEach(el=>el.ontoggle=()=>{if(el.open&&!done){r.hinted=true;$('#exam-hint-status').textContent='已使用提示';}});
  $$('#exam-content [data-audio]').forEach(b=>b.onclick=()=>run(async()=>{const a=w.entries[pronSource].audio[+b.dataset.audio];await new Audio(await api('audio',a.file)).play();}));
  input.focus();input.setSelectionRange(input.value.length,input.value.length);
}
function advanceExam(){examSession.index++;examSession.input='';examSession.visible=false;examSession.feedback='';renderExam();}
function renderExamSummary(target){
  const stats=Exam.examStats(examSession.results),retry=examSession.results.filter(Exam.needsPractice).map(r=>r.id);
  target.innerHTML=`<div class="card exam-summary"><h2>本次考试完成</h2><div class="exam-stats">${[['首次答对',stats.firstCorrect],['答错过',stats.wrong],['看过答案',stats.revealed],['跳过',stats.skipped],['使用提示',stats.hinted]].map(([label,n])=>`<div><strong>${n}</strong><span>${label}</span></div>`).join('')}</div><p class="muted">统计按单词计数，答错、提示和看答案可能重叠。首次答对指未使用提示且第一次输入正确。</p><p class="muted">${examSession.omitted} 个无可用释义的单词未出题。</p><button id="exam-retry" class="primary" ${retry.length?'':'disabled'}>重练未掌握题（${retry.length}）</button> <button id="exam-reset">重新选择范围</button></div>`;
  $('#exam-retry').onclick=()=>startExam(retry);$('#exam-reset').onclick=()=>{examSession=null;renderExam();};
}
