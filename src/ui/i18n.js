(function(root){
  const catalog=typeof module!=='undefined'&&module.exports?require('./i18n-catalog.js'):root.UITranslations;
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pattern=new RegExp(Object.keys(catalog).sort((a,b)=>b.length-a.length).map(escape).join('|'),'g');
  function translate(value,language='en'){
    const text=String(value??'');if(language!=='en')return text;
    if(Object.hasOwn(catalog,text.trim()))return text.replace(text.trim(),()=>catalog[text.trim()]);
    // Dynamic labels use complete patterns so counts and user-supplied names stay intact.
    const rules=[[/^将从两个词库及所有分组中同步移除：(.*)。内容进入回收站，保留 7 天后永久清理。$/,names=>'Remove from both library views and all groups: '+names+'. Items remain in the Recycle Bin for 7 days.'],[/^将导出 (\d+) 个单词(?:；其中 (\d+) 个尚未选择释义，释义列将留空。)?$/, (n,missing)=>'Export '+n+' words'+(missing?'; '+missing+' without selected definitions (definition cells will be blank).':'.')],[/^可考试 (\d+) 个单词；(\d+) 个未选释义的单词不出题。$/, (n,m)=>n+' eligible words; '+m+' without selected definitions excluded.'],[/^(\d+) 个单词 · 已选 (\d+) 个$/, (n,m)=>n+' words · '+m+' selected'],[/^(已导出|已备份|已恢复并切换词库)：(.*)$/, (label,path)=>catalog[label]+': '+path],[/^关闭 (.*)$/,name=>`Close ${name}`],[/^播放 (.*)$/,name=>`Play ${name}`],[/^查看 (.*) 的复习释义$/,name=>`View review definitions for ${name}`],[/^已选 (\d+) 个$/,n=>`${n} selected`],[/^已选 (\d+) 条$/,n=>`${n} definitions selected`],[/^(\d+) 个单词$/,n=>`${n} ${n==='1'?'word':'words'}`],[/^第 (\d+) \/ (\d+) 题\s*$/, (n,total)=>`Question ${n} / ${total} `],[/^仅未选释义 · (\d+)$/,n=>`Only unselected · ${n}`],[/^(MW|Cam) 已选 (\d+) 条$/, (s,n)=>`${s}: ${n} selected`],[/^上次：(.*)$/,name=>`Last Used: ${name}`],[/^收藏至：(.*)$/,name=>`Save to: ${name}`],[/^选择单词 (.*)$/,name=>`Select word ${name}`],[/^删除分组“(.*)”？$/,name=>`Delete group “${name}”?`],[/^将 (\d+) 个单词移出“(.*)”；词库及其他分组中的内容保留。$/, (n,name)=>`Remove ${n} words from “${name}”? Keep them in the library and other groups.`]];
    for(const [re,fn]of rules){const m=text.match(re);if(m)return fn(...m.slice(1));}
    const preserved=[];
    const safe=text.replace(/[“「]([^”」]+)[”」]/g,(_all,name)=>{preserved.push(name);return `\uE000${preserved.length-1}\uE001`;});
    return safe.replace(pattern,key=>` ${catalog[key]} `).replace(/[：]/g,': ').replace(/[，、]/g,', ').replace(/；/g,'; ').replace(/。/g,'. ').replace(/？/g,'?').replace(/（/g,'(').replace(/）/g,')').replace(/ {2,}/g,' ').replace(/\s+([,.;:!?])/g,'$1').replace(/\uE000(\d+)\uE001/g,(_,i)=>`“${preserved[+i]}”`).trim();
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={translate};return;}
  let language='zh-CN',observer,queued=false;
  const originals=new WeakMap(),attributes=new WeakMap();
  const dataSelectors='[translate="no"],script,style,textarea,pre,.textLayer,.entry-headword,.word-row strong,.popup-header strong,.pos-heading,.popup-pos,.sense-guide,.sense-context,.sense-labels,.cross-references,.dictionary-chinese,.dictionary-definition,.dictionary-example p,.dictionary-example label span,.dictionary-example details p,.sense-support p,.translation,.sense-translation p,.personal-notes p,.popup-sense p,.popup-content details p,.exam-definition p,.exam-hint p,.exam-sense h3,.pron-group strong,.pron-note,#exam-feedback strong,#collection-groups label,#export-words label,.trash-row strong,.pdf-history-row strong,.pdf-history-row p:last-child,[data-work-tab^="pdf-"],#storage-path,#edit-context,#group-filter option[value]:not([value=""]),#export-group option,#exam-group option[value]:not([value=""]),.pron-value';
  function protectedNode(el){if(el.closest('.word-row strong,.entry-headword,.popup-header strong,[data-work-tab^="pdf-"]'))return true;return !!el.closest(dataSelectors)&&!el.closest('button,summary,[data-selection-mode]');}
  function update(){
    queued=false;observer?.disconnect();
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
    while(node=walker.nextNode()){
      const el=node.parentElement;if(!el||protectedNode(el)||el.closest('script,style,textarea,[translate="no"]'))continue;
      let saved=originals.get(node);if(!saved||node.nodeValue!==saved.output)saved={source:node.nodeValue};
      const output=translate(saved.source,language);if(node.nodeValue!==output)node.nodeValue=output;saved.output=output;originals.set(node,saved);
    }
    for(const el of document.querySelectorAll('[placeholder],[title],[aria-label]')){
      if(el.closest('[translate="no"],.textLayer')||el.matches('[data-work-tab^="pdf-"]'))continue;
      const saved=attributes.get(el)||{};
      for(const key of ['placeholder','title','aria-label']){if(!el.hasAttribute(key))continue;const value=el.getAttribute(key);let item=saved[key];if(!item||value!==item.output)item={source:value};item.output=translate(item.source,language);if(value!==item.output)el.setAttribute(key,item.output);saved[key]=item;}
      attributes.set(el,saved);
    }
    document.documentElement.lang=language;if(document.title.includes('WordDesk'))document.title=language==='en'?'WordDesk · Dictionary Library':'WordDesk · 双词典词库';
    observer?.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['placeholder','title','aria-label']});
  }
  function schedule(){if(!queued){queued=true;queueMicrotask(update);}}
  observer=new MutationObserver(schedule);
  root.I18n={translate,get language(){return language;},setLanguage(value){language=value==='en'?'en':'zh-CN';update();},update};
  update();
})(globalThis);
