const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../src/store.cjs'),{rows,exportWorkbook}=require('../src/export.cjs');
const fresh=()=>new Store(fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-v3-')));
function entry(word='plum'){return {parserVersion:3,source:'mw',headword:word,senses:[{pos:'noun',section:'主词典 1',number:'1',definition:'a fruit\nalso : the tree',translation:'',selected:true,examples:[{text:'a plum tree',translation:'',selected:true}]}],pronunciations:[],pronunciationGroups:[{form:word,pos:'noun',edition:'主词典',region:'MW',items:[{label:'also',value:'ˈpləm',suffix:''}]}],audio:[],snapshot:[],warnings:[],forms:[],phrases:[],labels:[]};}
test('collection remembers last successful group combination and adds groups without erasing previous memberships',()=>{
  const s=fresh();s.data.groups=['阅读','考试','旅行'];s.save();
  assert.throws(()=>s.collect(entry(),[]));assert.equal(s.data.words.length,0);
  let w=s.collect(entry(),['阅读','考试']);assert.deepEqual(w.groups,['阅读','考试']);
  assert.equal(w.entries.mw.senses[0].selected,false);assert.equal(w.entries.mw.senses[0].examples[0].selected,false);
  w.notes='我的笔记';w.entries.mw.senses[0].editedTranslation='自己的译文';w.entries.mw.senses[0].selected=true;s.update(w);
  s.collect(entry(),['旅行']);assert.deepEqual(s.data.words[0].groups,['阅读','考试','旅行']);
  s.collect(entry());assert.deepEqual(s.data.lastCollectionGroups,['旅行']);
  assert.throws(()=>s.collect(entry('other'),['不存在']));assert.deepEqual(s.data.lastCollectionGroups,['旅行']);
  const reopened=new Store(s.root);assert.deepEqual(reopened.data.lastCollectionGroups,['旅行']);assert.equal(reopened.data.words[0].entries.mw.senses[0].editedTranslation,'自己的译文');assert.equal(reopened.data.words[0].notes,'我的笔记');
});
test('group removal is separate from shared deletion; recycle and restore preserve complete records across restart',()=>{
  const s=fresh();s.data.groups=['A','B'];const a=s.collect(entry(),['A','B']),b=s.collect(entry('go'),['B']);
  a.notes='keep';a.entries.mw.senses[0].selected=true;s.update(a);s.removeFromGroup([a.id],'A');assert.deepEqual(a.groups,['B']);
  assert.equal(s.trashWords([a.id,b.id]),2);assert.equal(s.data.words.length,0);assert.equal(rows(s.data.words,'time').length,0);
  const re=new Store(s.root);assert.equal(re.data.trash.length,2);assert.equal(re.restoreWords([a.id,b.id]),2);assert.equal(re.data.trash.length,0);assert.equal(re.data.words[0].notes,'keep');assert.equal(re.data.words[0].entries.mw.senses[0].selected,true);assert.deepEqual(re.data.words[0].groups,['B']);
});
test('restoring a duplicate never overwrites the active record; purge preserves shared media and cleans orphan files',()=>{
  const s=fresh();fs.mkdirSync(path.join(s.root,'assets'));for(const f of ['shared.mp3','own.png'])fs.writeFileSync(path.join(s.root,'assets',f),'fixture');
  const a=s.collect(entry()),b=s.collect(entry('go'));a.entries.mw.audio=[{file:'assets/shared.mp3'}];a.entries.mw.snapshot=['assets/own.png'];b.entries.mw.audio=[{file:'assets\\shared.mp3'}];s.save();s.trashWords([a.id]);
  s.collect(entry());assert.throws(()=>s.restoreWords([a.id]),/同名/);assert.equal(s.data.trash.length,1);
  assert.deepEqual(s.purgeWords([a.id]),{count:1,failed:0});assert(fs.existsSync(path.join(s.root,'assets/shared.mp3')));assert(!fs.existsSync(path.join(s.root,'assets/own.png')));
});
test('parser upgrade archives old data; merged changed senses require review while exact matches retain edits',()=>{
  const s=fresh(),old=entry();delete old.parserVersion;old.senses[0].definition='a fruit';old.senses.push({...structuredClone(old.senses[0]),definition:'stable definition',section:'主词典 2'});
  const w=s.collect(old);w.entries.mw.senses[0].selected=true;w.entries.mw.senses[0].editedDefinition='my old fruit';w.entries.mw.senses[1].selected=true;w.entries.mw.senses[1].editedTranslation='不变的';s.update(w);
  const incoming=entry();incoming.senses.push({...structuredClone(incoming.senses[0]),definition:'stable definition',section:'主词典 3'});s.collect(incoming);
  const e=s.data.words[0].entries.mw;assert.equal(e.senses[0].selected,false);assert.equal(e.review[0].editedDefinition,'my old fruit');assert.equal(e.archives[0].senses[0].selected,true);assert.equal(e.senses[1].selected,true);assert.equal(e.senses[1].editedTranslation,'不变的');
});
test('Excel keeps merged definition lines, original pronunciation and qualifiers with paired slashes',async()=>{
  const s=fresh();const w=s.collect(entry());w.entries.mw.senses[0].selected=true;w.entries.mw.pronunciationGroups.push({form:'going',pos:'verb',edition:'主词典',region:'MW',items:[{label:'"going to" in sense 13 is often',value:'ˈgō-ə-nə',suffix:''}]});
  const r=rows([w],'time')[0];assert.match(r.definition,/a fruit\nalso : the tree/);assert.match(r.phonetic,/going.*"going to" in sense 13 is often \/ˈgō-ə-nə\//);assert.equal(r.us,'');
  const file=path.join(s.root,'verify.xlsx');await exportWorkbook([w],['word','phonetic','definition'],'time',file);const wb=new(require('exceljs').Workbook)();await wb.xlsx.readFile(file);assert.equal(wb.worksheets[0].getCell('B2').value,r.phonetic);assert.equal(wb.worksheets[0].getCell('C2').value,r.definition);
});
