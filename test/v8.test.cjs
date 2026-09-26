const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {rows,exportWorkbook,fields}=require('../src/export.cjs'),{reviewPronunciationSource}=require('../src/ui/selection.js');
function word(){const entries={};for(const source of ['mw','cambridge']){const e=JSON.parse(fs.readFileSync('fixtures/go-'+source+'-v3.json'));e.senses.forEach(s=>{s.selected=false;s.examples.forEach(x=>x.selected=false);});e.senses[0].selected=true;entries[source]=e;}return {word:'go',source:'cambridge',entries,notes:'',createdAt:'2026-09-21'};}
test('review/export pronunciation uses MW regardless of chosen definitions and never falls back',()=>{
 const w=word();assert.equal(reviewPronunciationSource(w),'mw');let r=rows([w],'time')[0];assert.match(r.phonetic,/ˈgō/);assert.doesNotMatch(r.phonetic,/MW|剑桥|主词典/);assert.equal(r.uk,'');
 w.entries.mw.senses[0].selected=false;assert.equal(reviewPronunciationSource(w),'mw');assert.equal(rows([w],'time')[0].uk,'');
 w.entries.mw.senses[0].selected=true;w.entries.cambridge.senses[0].selected=false;assert.equal(reviewPronunciationSource(w),'mw');
 w.entries.cambridge.senses[0].selected=true;w.entries.mw.pronunciations=[];w.entries.mw.pronunciationGroups=[];assert.equal(reviewPronunciationSource(w),null);assert.equal(rows([w],'time')[0].phonetic,'');
 w.entries.cambridge.pronunciations=[];w.entries.cambridge.pronunciationGroups=[];assert.equal(reviewPronunciationSource(w),null);assert.equal(rows([w],'time')[0].phonetic,'');
});
test('export retains sparse original numbering and multiline senses, omits Cambridge generated numbers and source labels',async()=>{
 const w=word(),sense=(number,definition,selected=true)=>({number,pos:'verb',section:'',definition,translation:'译文',autoTranslation:'自动译文',selected,examples:[{text:'an example',translation:'例句',selected:true}]});
 w.entries.mw.senses=[sense('1','omit',false),sense('2a','first\nalso : continuation'),sense('5','fifth')];w.entries.cambridge.senses=[{...sense('99','cam definition'),section:'MOVE',includeChinese:true}];
 const r=rows([w],'time')[0];assert.equal(r.definition,'2a [verb] first\nalso : continuation\n5 [verb] fifth\n\n[verb] MOVE cam definition');assert.match(r.examples,/^2a \[verb\]/);assert.match(r.translation,/\n5 \[verb\]/);assert.doesNotMatch(r.definition,/99|omit|\[MW\]|\[Cam\]/);assert(!fields.source);assert.equal(fields.phonetic,'音标');
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-v8-export-')),'review.xlsx');await exportWorkbook([w],['word','phonetic','definition','examples'],'time',file);const wb=new(require('exceljs').Workbook)();await wb.xlsx.readFile(file);assert.equal(wb.worksheets[0].getCell('B1').text,'音标');assert.equal(wb.worksheets[0].getCell('C2').text,r.definition);assert.equal(wb.worksheets[0].getCell('D2').text,r.examples);
});
