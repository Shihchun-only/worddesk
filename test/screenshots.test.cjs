const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Store,mergeEntry}=require('../src/store.cjs'),{screenshotStats,clearScreenshots}=require('../src/screenshots.cjs');
function setup(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-snapshots-'));return new Store(root);}
test('cleanup counts actual old screenshots including orphan pages, updates archives/trash, and preserves other files',()=>{
 const s=setup();fs.mkdirSync(path.join(s.root,'assets','old'),{recursive:true});
 for(const [name,text]of [['page-1.png','123'],['page-2.png','1234'],['legacy.png','12345'],['audio.mp3','audio'],['other.png','keep']])fs.writeFileSync(path.join(s.root,'assets','old',name),text);
 const entry={snapshot:['assets/old/page-1.png'],audio:[{file:'assets/old/audio.mp3'}],archives:[{snapshot:['assets/old/legacy.png']}]};
 s.data.words=[{id:'a',word:'example',notes:'保留',groups:['阅读'],entries:{mw:entry}}];s.data.trash=[{id:'b',entries:{mw:{snapshot:['assets/old/page-1.png']}}}];s.save();
 assert.deepEqual(screenshotStats(s),{count:3,bytes:12});assert(fs.existsSync(path.join(s.root,'assets/old/page-1.png')));
 assert.deepEqual(clearScreenshots(s),{count:3,bytes:12,failed:0});assert.deepEqual(s.data.words[0].entries.mw.snapshot,[]);assert.deepEqual(entry.archives[0].snapshot,[]);assert.deepEqual(s.data.trash[0].entries.mw.snapshot,[]);
 assert.equal(s.data.words[0].notes,'保留');assert(fs.existsSync(path.join(s.root,'assets/old/audio.mp3')));assert(fs.existsSync(path.join(s.root,'assets/old/other.png')));assert.deepEqual(screenshotStats(s),{count:0,bytes:0});
});
test('cleanup never follows directory links outside the library',()=>{
 const s=setup(),outside=fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-external-'));fs.mkdirSync(path.join(s.root,'assets'));fs.writeFileSync(path.join(outside,'page-1.png'),'outside');
 fs.symlinkSync(outside,path.join(s.root,'assets','linked'),'junction');s.data.words=[{entries:{mw:{snapshot:['assets/linked/page-1.png']}}}];
 assert.deepEqual(screenshotStats(s),{count:0,bytes:0});clearScreenshots(s);assert.equal(fs.readFileSync(path.join(outside,'page-1.png'),'utf8'),'outside');
});
test('recollection preserves existing screenshots without a screenshot failure warning',()=>{
 const old={parserVersion:3,senses:[],snapshot:['assets/old/page-1.png'],audio:[],warnings:[]};const result=mergeEntry(old,{...old,snapshot:[],warnings:[]});assert.deepEqual(result.snapshot,old.snapshot);assert.deepEqual(result.warnings,[]);
});
