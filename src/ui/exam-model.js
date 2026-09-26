(function(root){
  const normalizeAnswer=value=>String(value||'').trim().replace(/[‘’ʼ]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').toLowerCase();
  const wordFamilies=[
    ['scarce','scarcer','scarcest','scarcely','scarcity','scarceness'],
    ['go','goes','going','went','gone'],['be','am','is','are','was','were','been','being'],
    ['good','better','best','well'],['bad','worse','worst','badly'],
    ['happy','happier','happiest','happily','happiness','unhappy','unhappiness'],
    ['decide','decides','decided','deciding','decision','decisive','decisively'],
    ['able','ability','abilities','unable'],['strong','stronger','strongest','strongly','strength','strengthen'],
    ['create','creates','created','creating','creation','creative','creatively','creativity'],
    ['wide','wider','widest','widely','width'],['deep','deeper','deepest','deeply','depth']
  ];
  wordFamilies.push(...[
    'child children','person people','man men','woman women','mouse mice','tooth teeth','foot feet','goose geese',
    'run ran running runner','write wrote written writer','read reading reader','take took taken','give gave given',
    'make made making maker','do does did done doing','have has had having','see saw seen seeing',
    'eat ate eaten','drink drank drunk','speak spoke spoken speech','break broke broken','choose chose chosen choice',
    'begin began begun beginning','bring brought','buy bought','catch caught','teach taught','think thought',
    'find found','feel felt','keep kept','leave left','lose lost','meet met','pay paid','say said',
    'sell sold','send sent','sit sat','sleep slept','stand stood','tell told','understand understood',
    'drive drove driven','ride rode ridden','rise rose risen','fall fell fallen','fly flew flown flight',
    'grow grew grown growth','know knew known knowledge','throw threw thrown','wear wore worn',
    'swim swam swum swimming','sing sang sung song','build built','hold held','lead led',
    'die died dying death dead','live lived living life alive','long length lengthen','high height heighten',
    'succeed success successful successfully','fail failure','explain explanation','describe description',
    'receive reception recipient','produce production productive productivity','reduce reduction',
    'permit permission permissible','admit admission','science scientific scientist','vary various variety variation'
  ].map(row=>row.split(' ')));
  function roots(word){
    const out=new Set([word]);
    const add=t=>{if(t.length>=3)out.add(t);};
    for(const [suffix,replacements] of [['ies',['y']],['ied',['y']],['iness',['y']],['ily',['y']],['ier',['y']],['iest',['y']],['ness',['']],['ment',['']],['ly',['','le']],['ity',['','e']],['ation',['','e','ate']],['ization',['ize']],['isation',['ise']],['ful',['']],['less',['']],['ing',['','e']],['ed',['','e']],['er',['','e']],['est',['','e']],['es',['','e']],['s',['']]]){
      if(word.endsWith(suffix)&&word.length>suffix.length+2){const stem=word.slice(0,-suffix.length);replacements.forEach(r=>add(stem+r));if(['ing','ed','er','est'].includes(suffix)&&/([b-df-hj-np-tv-z])\1$/.test(stem))add(stem.slice(0,-1));}
    }
    return out;
  }
  function maskTerms(answer,extra=[]){
    const base=normalizeAnswer(answer),terms=new Set([base,...(Array.isArray(extra)?extra:[]).map(normalizeAnswer).filter(Boolean)]);
    for(const family of wordFamilies)if(family.includes(base))family.forEach(t=>terms.add(t));
    // Whole-token matches only. Do not use edit distance or unrestricted prefixes.
    for(const base of [...terms])if(/^[a-z]{3,}$/.test(base)){
      const stem=base.endsWith('e')?base.slice(0,-1):base;
      for(const suffix of ['s','es','ed','ing','er','est','ly','ness','less','ful'])terms.add(base+suffix);
      if(base.endsWith('e'))for(const suffix of ['ed','ing','er','est','ity','ation'])terms.add(stem+suffix);
      if(/[^aeiou]y$/.test(base))for(const suffix of ['ies','ied','ier','iest','ily','iness'])terms.add(base.slice(0,-1)+suffix);
      if(/[aeiou][b-df-hj-np-tv-z]$/.test(base)&&!/[wxy]$/.test(base))for(const suffix of ['ed','ing','er','est'])terms.add(base+base.at(-1)+suffix);
    }
    return [...terms].filter(Boolean).sort((a,b)=>b.length-a.length);
  }
  function maskAnswer(text,answer,extra=[]){
    const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    const pattern=maskTerms(answer,extra).map(term=>term.split(/\s+/).map(escape).join('\\s+').replace(/['‘’ʼ]/g,"['‘’ʼ]")).join('|');
    if(!pattern)return String(text||'');
    const bases=maskTerms(answer,extra),baseRoots=new Set(bases.flatMap(t=>/^[a-z]{3,}$/.test(t)?[...roots(t)]:[]));
    const related=String(text||'').replace(/(?<![\p{L}\p{N}])[a-z]+(?![\p{L}\p{N}])/giu,token=>{const lower=token.toLowerCase();return lower.length>=3&&[...roots(lower)].some(r=>baseRoots.has(r))?'______':token;});
    return related.replace(new RegExp('(?<![\\p{L}\\p{N}])'+'(?:'+pattern+')(?![\\p{L}\\p{N}])','giu'),'______');
  }
  function examQueue(words,group,order){
    const available=words.filter(w=>!group||w.groups.includes(group));
    const eligible=available.filter(w=>Object.values(w.entries).some(e=>e.senses.some(s=>s.selected)));
    if(order==='alpha')eligible.sort((a,b)=>a.word.localeCompare(b.word,'en'));
    else if(order==='random')for(let i=eligible.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[eligible[i],eligible[j]]=[eligible[j],eligible[i]];}
    else eligible.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
    return {ids:eligible.map(w=>w.id),omitted:available.length-eligible.length};
  }
  const newExamResult=id=>({id,attempts:0,wrong:false,correct:false,revealed:false,skipped:false,hinted:false,firstCorrect:false});
  function checkExamAnswer(result,input,answer){
    if(!normalizeAnswer(input))return 'empty';
    if(result.correct||result.revealed||result.skipped)return 'done';
    result.attempts++;
    if(normalizeAnswer(input)===normalizeAnswer(answer)){result.correct=true;result.firstCorrect=result.attempts===1&&!result.hinted;return 'correct';}
    result.wrong=true;return 'wrong';
  }
  const needsPractice=r=>!r.firstCorrect||r.hinted||r.revealed||r.skipped||r.wrong;
  function examStats(results){return {firstCorrect:results.filter(r=>r.firstCorrect).length,wrong:results.filter(r=>r.wrong).length,revealed:results.filter(r=>r.revealed).length,skipped:results.filter(r=>r.skipped).length,hinted:results.filter(r=>r.hinted).length};}
  const helpers={normalizeAnswer,maskTerms,maskAnswer,examQueue,newExamResult,checkExamAnswer,needsPractice,examStats};
  if(typeof module!=='undefined'&&module.exports)module.exports=helpers;else root.Exam=helpers;
})(globalThis);
