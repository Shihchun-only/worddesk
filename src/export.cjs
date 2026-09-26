const {senseContext}=require('./ui/sense-context.js');
const ExcelJS=require('exceljs');
const {translate}=require('./ui/i18n.js');
const {slash,pronunciationText}=require('./ui/pronunciations.js');
const {entrySources,selectedSources,includesChinese,reviewPronunciationSource,dictionaryNumber}=require('./ui/selection.js');
const fields={word:'单词',phonetic:'音标',uk:'英式音标',us:'美式音标',pos:'词性',meaning:'释义',definition:'英文释义',translation:'中文释义 / 个人翻译',autoTranslation:'自动译文',examples:'英文例句',exampleTranslation:'例句中文',forms:'词形变化',phrases:'短语 / 习语',labels:'使用标签',notes:'个人笔记',url:'来源网址',createdAt:'收藏时间'};
function rows(words,order) {
  const list=[...words];
  if(order==='alpha') list.sort((a,b)=>a.word.localeCompare(b.word,'en'));
  else if(order==='random') for(let i=list.length-1;i>0;i--){const j=require('node:crypto').randomInt(i+1);[list[i],list[j]]=[list[j],list[i]];}
  else list.sort((a,b)=>a.createdAt.localeCompare(b.createdAt));
  return list.map(w=>{
    const chosen=selectedSources(w),sources=chosen.length?chosen:entrySources(w),pronSource=reviewPronunciationSource(w),pronSources=pronSource?[pronSource]:[];
    const block=(fn,which=sources)=>which.map(source=>{const text=fn(w.entries[source],source);return text||'';}).filter(Boolean).join('\n\n');
    const selected=e=>e.senses.map((s,i)=>({...s,context:senseContext(e.senses,i)})).filter(s=>s.selected);
    const prefix=(s,source)=>[dictionaryNumber(s,source),s.pos?'['+s.pos+']':'',source==='cambridge'?s.section||'':''].filter(Boolean).join(' ');
    const definitions=fn=>block((e,source)=>selected(e).map(s=>{const value=fn(s,source);return value?[prefix(s,source),value].filter(Boolean).join(' '):'';}).filter(Boolean).join('\n'),chosen);
    const examples=fn=>block((e,source)=>selected(e).flatMap(s=>s.examples.filter(x=>x.selected).map(x=>{const value=fn(x);return value?[prefix(s,source),value].filter(Boolean).join(' '):'';})).filter(Boolean).join('\n'),chosen);
    const chineseAllowed=(s,source)=>source!=='cambridge'||includesChinese(s);
    const region=name=>block(e=>e.pronunciations.filter(p=>p.region===name).map(p=>[p.form,p.label,slash(p.value),p.suffix].filter(Boolean).join(' ')).join('; '),pronSources);
    return {word:w.word,phonetic:block(e=>pronunciationText(e,{includeSource:false}),pronSources),uk:region('英式'),us:region('美式'),pos:block(e=>[...new Set(selected(e).map(s=>s.pos))].join('; '),chosen),
      meaning:definitions((s,source)=>[(s.context?'('+s.context+') ':'')+(s.editedDefinition??s.definition),source==='cambridge'&&includesChinese(s)?s.editedTranslation??s.translation:''].filter(Boolean).join('\n')),
      definition:definitions(s=>(s.context?'('+s.context+') ':'')+(s.editedDefinition??s.definition)),
      translation:definitions((s,source)=>chineseAllowed(s,source)?s.editedTranslation??s.translation:''),
      autoTranslation:definitions((s,source)=>chineseAllowed(s,source)?s.autoTranslation||'':''),
      examples:examples(x=>x.text),exampleTranslation:examples(x=>x.translation||x.autoTranslation||''),
      forms:block(e=>e.forms.join('; ')),phrases:block(e=>e.phrases.join('; ')),labels:block(e=>e.labels.join('; ')),notes:w.notes,
      url:block(e=>e.url),createdAt:w.createdAt.slice(0,10)};
  });
}
// Conservative wrapping in font-size units; keeps mixed Chinese/English readable.
function wrapLines(text,width,size=11){
  const capacity=Math.max(2,(width*7-7)/(size*96/72));
  const measure=t=>Array.from(t).reduce((n,c)=>n+(/[\u2e80-\uffff]/u.test(c)?1.05:/[MW@%]/.test(c)?.9:/[il.,' :;]/.test(c)?.3:.58),0);
  const result=[];
  for(const paragraph of String(text??'').split('\n')){
    let line='',used=0;
    for(const token of paragraph.match(/\s+|[\u2e80-\uffff]|[^\s\u2e80-\uffff]+/gu)||[]){
      const length=measure(token);
      if(length<=capacity){if(used+length>capacity&&line){result.push(line);line='';used=0;}line+=token;used+=length;}
      else for(const c of token){const length=measure(c);if(used+length>capacity&&line){result.push(line);line='';used=0;}line+=c;used+=length;}
    }
    result.push(line);
  }
  return result;
}
function columnWidths(columns){const weights=columns.map(k=>k==='word'?20:k==='pos'?15:65),sum=weights.reduce((a,b)=>a+b,0);return weights.map(w=>Math.max(5,96*w/sum));}
function rowHeight(row,columns,widths){return Math.max(30,...columns.map((k,i)=>wrapLines(row[k],widths[i],k==='word'?12:11).length*17+10));}
function printableRows(words,columns,order,widths=columnWidths(columns)){
  const ordered=rows(words,order),result=[];
  for(const full of ordered){
    const w=words.find(w=>w.word===full.word);
    if(rowHeight(full,columns,widths)<=333){result.push(full);continue;}
    // Pack complete dictionary senses first, preserving their original numbering/context.
    const senses=selectedSources(w).flatMap(source=>w.entries[source].senses.map((sense,index)=>({source,sense,index})).filter(x=>x.sense.selected));
    const make=items=>{const clone={...w,entries:Object.fromEntries(Object.entries(w.entries).map(([source,e])=>[source,{...e,senses:e.senses.map((sense,index)=>({...sense,selected:items.some(x=>x.source===source&&x.index===index)}))}]))};return rows([clone],'time')[0];};
    let group=[],chunks=[];
    for(const item of senses){const next=[...group,item];if(group.length&&rowHeight(make(next),columns,widths)>333){chunks.push(make(group));group=[];}group.push(item);}
    if(group.length)chunks.push(make(group));if(!chunks.length)chunks=[full];
    let continuation=0;
    for(const chunk of chunks){
      // An exceptionally long single sense/cell cannot fit Excel's row-height limit.
      // Continue its text without dropping any characters; ordinary senses stay whole.
      const lines=columns.map((k,i)=>wrapLines(chunk[k],widths[i],k==='word'?12:11));
      const parts=Math.max(1,...lines.map(a=>Math.ceil(a.length/19)));
      for(let part=0;part<parts;part++){
        const row={...chunk};
        columns.forEach((k,i)=>{if(parts>1&&k!=='word')row[k]=lines[i].slice(part*19,(part+1)*19).join('\n');});
        row.word=w.word+(continuation++?'（续）':'');result.push(row);
      }
    }
  }
  return result;
}
async function exportWorkbook(words,columns,order,file,language='zh-CN'){
  if(!columns.length||columns.some(k=>!fields[k]))throw new Error('请选择有效导出字段');
  const wb=new ExcelJS.Workbook(),ws=wb.addWorksheet(translate('复习词表',language)),widths=columnWidths(columns);
  wb.creator='WordDesk';ws.columns=columns.map((k,i)=>({header:translate(fields[k],language),key:k,width:widths[i]}));
  ws.addRows(printableRows(words,columns,order,widths).map(r=>({...r,word:language==='en'?r.word.replace(/（续）$/,' (continued)'):r.word})));
  const border={style:'thin',color:{argb:'FFD2D6D2'}};
  ws.eachRow((row,n)=>{
    row.height=n===1?28:rowHeight(Object.fromEntries(columns.map((k,i)=>[k,row.getCell(i+1).value])),columns,widths);
    row.eachCell({includeEmpty:true},(cell,i)=>{
      const font={name:'Calibri',size:n>1&&columns[i-1]==='word'?12:11,bold:n===1||columns[i-1]==='word',color:{argb:'FF202620'}};
      cell.font=font;cell.alignment={vertical:'top',horizontal:'left',wrapText:true};cell.border={top:border,bottom:border,left:border,right:border};
      // Set Chinese font separately while preserving English and phonetic glyphs.
      if(/[\u2e80-\uffff]/u.test(String(cell.value??'')))cell.value={richText:String(cell.value).match(/[\u2e80-\uffff]+|[^\u2e80-\uffff]+/gu).map(text=>({text,font:{...font,name:/[\u2e80-\uffff]/u.test(text)?'Microsoft YaHei':'Calibri'}}))};
      if(n===1)cell.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFEDEFEA'}};
    });
  });
  ws.views=[{state:'frozen',ySplit:1,showGridLines:false}];
  ws.pageSetup={paperSize:9,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,margins:{left:12/25.4,right:12/25.4,top:12/25.4,bottom:12/25.4,header:5/25.4,footer:5/25.4},printTitlesRow:'1:1',printArea:`A1:${ws.getColumn(columns.length).letter}${ws.rowCount}`};
  ws.headerFooter={oddFooter:'&C&P / &N'};
  await wb.xlsx.writeFile(file);
}
module.exports={fields,rows,exportWorkbook,printableRows,columnWidths,rowHeight};
