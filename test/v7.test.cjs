const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Store,mergeEntry}=require('../src/store.cjs'),{cambridgeAudioStats,clearCambridgeAudio}=require('../src/cambridge-audio.cjs');
const setup=()=>new Store(fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-v7-')));
const fixture=source=>JSON.parse(fs.readFileSync('fixtures/go-'+source+'-v3.json'));
test('deleting group preserves shared words, choices, notes and removes trash/history membership',()=>{
 const s=setup();s.data.groups=['A','B'];const w=s.collect(fixture('mw'),['A','B']);w.notes='notes';w.entries.mw.senses[0].selected=true;
 const other=s.collect({...fixture('mw'),headword:'other'},['A']);s.trashWords([other.id]);s.data.lastCollectionGroups=['A'];
 assert.equal(s.deleteGroup('A'),1);assert.deepEqual(w.groups,['B']);assert.equal(w.notes,'notes');assert(w.entries.mw.senses[0].selected);assert.deepEqual(s.data.lastCollectionGroups,[]);assert.deepEqual(s.data.trash[0].groups,[]);
 s.restoreWords([other.id]);assert.deepEqual(s.data.groups,['B']);assert.equal(new Store(s.root).data.words.length,2);
});
test('Cam cleanup handles archives/trash/duplicates but preserves MW, shared and unclassified audio',()=>{
 const s=setup();fs.mkdirSync(path.join(s.root,'assets'));for(const f of ['cam','old','mw','shared','orphan'])fs.writeFileSync(path.join(s.root,'assets',f+'.mp3'),'123');
 const a=f=>({file:'assets/'+f+'.mp3',url:'https://example.test/'+f,error:'old'});
 const cam={audio:[a('cam'),a('shared')],archives:[{audio:[a('old')]}],pronunciations:['keep']};
 s.data.words=[{notes:'keep',entries:{cambridge:cam,mw:{audio:[a('mw'),a('shared')]}}}];s.data.trash=[{entries:{cambridge:{audio:[a('cam')]}}}];s.save();
 assert.deepEqual(cambridgeAudioStats(s),{count:2,bytes:6});assert.deepEqual(clearCambridgeAudio(s),{count:2,bytes:6,failed:0});assert(!cam.audio[0].file);assert(!cam.audio[0].error);assert(cam.audio[0].url);assert(!cam.archives[0].audio[0].file);assert(!s.data.trash[0].entries.cambridge.audio[0].file);
 for(const f of ['mw','shared','orphan'])assert(fs.existsSync(path.join(s.root,'assets',f+'.mp3')));assert.deepEqual(cam.pronunciations,['keep']);assert.equal(s.data.words[0].notes,'keep');
});
test('Cam cleanup never follows links outside assets',()=>{
 const s=setup(),outside=fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-v7-outside-'));fs.mkdirSync(path.join(s.root,'assets'));fs.writeFileSync(path.join(outside,'cam.mp3'),'keep');fs.symlinkSync(outside,path.join(s.root,'assets','linked'),'junction');s.data.words=[{entries:{cambridge:{audio:[{file:'assets/linked/cam.mp3'},{file:path.join(outside,'cam.mp3')}]}}}];assert.equal(clearCambridgeAudio(s).count,0);assert(fs.existsSync(path.join(outside,'cam.mp3')));
});
test('recollection retains superseded Cambridge file references until explicit cleanup',()=>{
 const old={source:'cambridge',parserVersion:3,senses:[],audio:[{url:'old',file:'assets/old.mp3'}],warnings:[]};const next=mergeEntry(old,{...old,audio:[{url:'new'}]});assert.equal(next.legacyAudio[0].file,'assets/old.mp3');assert(!next.audio[0].file);
});
