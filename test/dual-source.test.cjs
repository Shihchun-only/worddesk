const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {rows,exportWorkbook}=require('../src/export.cjs'),{mergeEntry}=require('../src/store.cjs'),{includesChinese,selectedCount}=require('../src/ui/selection.js');
const sense=(text,translation,includeChinese)=>({pos:'noun',number:'1',definition:text,translation,selected:true,...(includeChinese===undefined?{}:{includeChinese}),examples:[{text:text+' example',translation:'例句翻译',selected:true}]});
const entry=(source,senses)=>({source,senses,pronunciations:[],pronunciationGroups:[],forms:[],phrases:[],labels:[],audio:[],snapshot:[],warnings:[],url:'https://example.test/'+source});
const word=()=>({word:'example',source:'cambridge',notes:'notes',createdAt:'2026-09-21',entries:{mw:entry('mw',[sense('MW definition','MW个人翻译')]),cambridge:entry('cambridge',[sense('Cam English only','不要导出的中文',false),sense('Cam bilingual','保留中文',true)])}});
test('export combines both selected dictionaries regardless of reading tab and honors Cambridge language choice',async()=>{
 const w=word(),r=rows([w],'time')[0];assert.equal(selectedCount(w),3);assert.match(r.definition,/MW definition[\s\S]*Cam English only/);assert.doesNotMatch(r.definition,/\[(MW|Cam)\]/);assert.match(r.translation,/保留中文/);assert.doesNotMatch(r.translation,/不要导出的中文/);assert.match(r.translation,/MW个人翻译/);
 w.source='mw';assert.deepEqual(rows([w],'time')[0],r);assert.match(r.examples,/MW definition example/);assert.match(r.examples,/Cam English only example/);
 const file=path.join(fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-dual-')),'words.xlsx');await exportWorkbook([w],['word','definition','translation'],'time',file);const wb=new(require('exceljs').Workbook)();await wb.xlsx.readFile(file);assert.equal(wb.worksheets[0].rowCount,2);assert.equal(wb.worksheets[0].getCell('B2').text,r.definition);assert.equal(wb.worksheets[0].getCell('C2').text,r.translation);
});
test('legacy Cambridge selections remain bilingual and re-extraction preserves explicit English-only choice',()=>{
 const old=entry('cambridge',[sense('legacy','中文'),sense('new','中文',false)]);assert(includesChinese(old.senses[0]));assert(!includesChinese(old.senses[1]));const merged=mergeEntry(old,structuredClone(old));assert.equal(merged.senses[0].includeChinese,true);assert.equal(merged.senses[1].includeChinese,false);
});
test('clearing one source leaves the other source and its examples in review/export',()=>{
 const w=word();w.entries.mw.senses[0].selected=false;const r=rows([w],'time')[0];assert.doesNotMatch(r.definition,/MW definition/);assert.match(r.definition,/Cam bilingual/);assert.equal(selectedCount(w),2);
});
