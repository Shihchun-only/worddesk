// Runs inside an isolated dictionary page; returns data only, never page HTML.
function extractDictionary(source) {
  const text=e=>(e?.textContent||'').replace(/\s+/g,' ').trim();
  const all=(e,s)=>Array.from(e.querySelectorAll(s));
  const unique=a=>[...new Set(a.filter(Boolean))];
  const clean=(e,s)=>{const c=e.cloneNode(true);all(c,s).forEach(n=>n.remove());return text(c);};
  const isMW=source==='mw';
  const roots=all(document,isMW?'[id*="-entry-"]':'.entry-body__el').filter(e=>!isMW||/^(dictionary|elementary|medical|legal|financial)-entry-\d+$/.test(e.id));
  const headword=text(document.querySelector(isMW?'h1.hword, .hword':'.entry-body__el .hw.dhw, .hw.dhw'));
  if(!roots.length||!headword)throw new Error('未找到完整词条，请等待加载或完成网页验证后重试。');
  const senses=[],pronunciationGroups=[],audio=[],forms=[],phrases=[],labels=[],entryReferences=[];
  const base=isMW?'https://www.merriam-webster.com':'https://dictionary.cambridge.org';
  function audioURL(a){
    if(!isMW){const raw=a.getAttribute('src')||a.getAttribute('data-src');return raw?new URL(raw,base).href:null;}
    const file=a.getAttribute('data-file');if(!file||!/^[\w-]+$/.test(file))return null;
    const dir=a.getAttribute('data-dir')||(file.startsWith('bix')?'bix':file.startsWith('gg')?'gg':/^\d/.test(file)?'number':file[0]);
    return `https://media.merriam-webster.com/audio/prons/en/us/mp3/${dir}/${file}.mp3`;
  }
  roots.forEach((root,ri)=>{
    const pos=text(root.querySelector(isMW?'.parts-of-speech, .entry-header-content .important-blue-link':'.pos-header .pos, .pos'));
    const edition=isMW?(/geographical name/i.test(pos)?'地理词典':({dictionary:'主词典',elementary:'儿童词典',medical:'医学词典',legal:'法律词典',financial:'金融词典'}[root.id.split('-')[0]]||'')):'';
    const wordForm=text(root.querySelector(isMW?'.hword':'.hw.dhw'))||headword;
    if(isMW){
      const groups=new Map();
      let items=all(root,'.prons-entry-list-item');if(!items.length)items=all(root,'.pr');
      for(const p of items){
        const inf=p.closest('.prt-a'),derived=p.closest('.uro-content, .dro-content');
        const container=inf||derived||p.closest('.prons-entries-list-inline, .prons-entries-list')||p.parentElement;
        let form=wordForm,kind='headword';
        if(inf){kind='inflection';let before=inf.previousElementSibling;while(before&&!before.matches('.if, .va'))before=before.previousElementSibling;form=text(before)||wordForm;}
        else if(derived){kind='derived';form=text(derived.querySelector('.ure, .dre'))||wordForm;}
        let g=groups.get(container);if(!g){g={form,kind,pos:derived?text(derived.querySelector('.fl'))||pos:pos,edition,region:'MW',items:[],pending:''};groups.set(container,g);}
        const label=text(p.querySelector('.l'));
        const value=(p.querySelector('.mw, .pr')?text(p.querySelector('.mw, .pr')):clean(p,'svg, .l, .pun, .play-pron-icon')).replace(/^[\/\\]+|[\/\\; ,]+$/g,'').trim();
        if(!value){g.pending=[g.pending,label||clean(p,'svg')].filter(Boolean).join(' ');continue;}
        const item={label:[g.pending,label].filter(Boolean).join(' '),value,suffix:text(p.querySelector('.pun')),audioUrl:audioURL(p)};g.pending='';g.items.push(item);
        if(item.audioUrl)audio.push({url:item.audioUrl,region:'MW',form,pronunciation:value,pos:g.pos});
      }
      for(const g of groups.values()){if(g.pending&&g.items.length)g.items[g.items.length-1].suffix+=' '+g.pending;delete g.pending;if(g.items.length)pronunciationGroups.push(g);}
    }else{
      for(const p of all(root,'.dpron-i')){
        const region=p.classList.contains('uk')?'英式':p.classList.contains('us')?'美式':text(p.querySelector('.region'))||'音标';
        const values=all(p,'.ipa').map(text);if(!values.length)continue;
        const a=all(p,'audio source').find(a=>!a.type||a.type.includes('mpeg'));const url=a?audioURL(a):null;
        pronunciationGroups.push({form:wordForm,kind:'headword',pos,edition,region,items:values.map((value,i)=>({label:'',value:value.replace(/^\/|\/$/g,''),suffix:'',audioUrl:i===0?url:null}))});
        if(url)audio.push({url,region,form:wordForm,pronunciation:values.join(' / '),pos});
      }
    }
    all(root,isMW?'.if':'.inf-group, .irreg-infls').filter(e=>isMW||!e.parentElement.closest('.inf-group, .irreg-infls')).forEach(e=>forms.push(text(e)));
    all(root,isMW?'.sl, .lb':'.usage, .register, .domain, .gram').forEach(e=>labels.push(text(e)));
    all(root,isMW?'.drp':'.phrase-title, .pv .hw').forEach(e=>phrases.push(text(e)));
    if(isMW){
      const units=all(root,'.sense');
      for(const b of all(root,'.dtText'))if(!b.closest('.sense')&&!units.includes(b.parentElement))units.push(b.parentElement);
      let previousLetter='';let previousNumber='';
      for(const unit of units){
        const owned=e=>e.closest('.sense')===unit||(!e.closest('.sense')&&unit.contains(e));
        const blocks=all(unit,'.dtText').filter(owned),parts=[],refs=[];
        for(const b of blocks){
          refs.push(...all(b,'.dx-jump, .ca').map(e=>clean(e,'svg')));
          const definition=clean(b,'.vis, .vi, .sub-content-thread, .ex-sent, .ca, .dx-jump, svg').replace(/^:\s*/,'');
          if(!definition)continue;
          if(/^(?:see also|compare)\b/i.test(definition)){refs.push(definition);continue;}
          parts.push({label:b.closest('.sdsense')?text(b.closest('.sdsense').querySelector('.sd')):'',text:definition});
        }
        if(!parts.length){entryReferences.push(...refs);continue;}
        const parentNumber=text(unit.closest('.vg-sseq-entry-item')?.querySelector('.vg-sseq-entry-item-label'));
        let sub=text(unit.querySelector(':scope > .sn'));
        if(parentNumber!==previousNumber)previousLetter='';
        const letter=sub.match(/^[a-z]+/i)?.[0];if(letter)previousLetter=letter;
        else if(/^\(\d+\)/.test(sub)&&previousLetter)sub=previousLetter+sub;
        previousNumber=parentNumber;
        const number=[parentNumber,sub].filter(Boolean).join('')||'—';
        const exampleNodes=all(unit,'.vis, .ex-sent').filter(owned).filter(e=>!e.matches('.aq'));
        const examples=exampleNodes.filter(e=>!exampleNodes.some(p=>p!==e&&p.contains(e))).map(e=>({text:clean(e,'svg'),translation:'',selected:false}));
        const sensePos=text(unit.closest('.vg')?.querySelector('.vd'))||pos;
        const definition=parts.map(p=>(p.label?p.label+' : ':'')+p.text).join('\n');
        senses.push({pos:sensePos,section:[edition,number==='—'?'':number].filter(Boolean).join(' '),entryId:root.id,number,definition,parts,translation:'',examples,references:unique(refs),selected:false,labels:unique(all(unit,'.sl,.lb').filter(owned).map(text)).join('; ')});
      }
    }else{
      all(root,'.def-block').forEach((b,bi)=>{
        const definition=text(b.querySelector('.def'));if(!definition)return;
        const translation=text(b.querySelector('.def-body > .trans, .def-body > .dtrans'));
        const examples=all(b,'.examp').map(e=>({text:text(e.querySelector('.eg'))||clean(e,'.trans'),translation:text(e.querySelector('.trans')),selected:false}));
        const section=text(b.closest('.phrase-block, .pv-block, .idiom-block')?.querySelector('.phrase-title, .hw'))||text(b.closest('.dsense, .sense-block')?.querySelector('.guideword'));
        senses.push({pos,section,number:String(bi+1),entryId:`cambridge-${ri}`,definition,parts:[{label:'',text:definition}],translation,examples,references:[],selected:false,labels:unique(all(b,'.usage, .gram, .register').map(text)).join('; ')});
      });
    }
  });
  if(!senses.length)throw new Error('没有识别到词条释义，未覆盖已保存内容。');
  all(document,isMW?'#related-phrases .related-phrases-list-item a':'.entry-body .idioms a .hw, .entry-body .phrasal_verbs a .hw').forEach(e=>phrases.push(text(e)));
  const groups=pronunciationGroups.filter((g,i,a)=>a.findIndex(x=>JSON.stringify(x)===JSON.stringify(g))===i);
  const pronunciations=groups.flatMap(g=>g.items.map(p=>({region:g.region,value:p.value,label:p.label,suffix:p.suffix,form:g.form,kind:g.kind,pos:g.pos,edition:g.edition})));
  return {parserVersion:3,source,headword,url:location.href,capturedAt:new Date().toISOString(),senses,pronunciations,pronunciationGroups:groups,audio:audio.filter((a,i,all)=>all.findIndex(b=>a.url===b.url)===i),forms:unique(forms),phrases:unique(phrases),labels:unique(labels),references:unique(entryReferences),rawText:roots.map(text).join('\n\n'),warnings:[],snapshot:[]};
}
module.exports={extractDictionary};
