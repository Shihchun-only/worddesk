const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../src/store.cjs');
const {PDFHistory}=require('../src/pdf-history.cjs');
const {atomicJSON,checkpoint,snapshots,recoverJSON}=require('../src/safe-json.cjs');
const {AudioJobs}=require('../src/audio-jobs.cjs');
const root=()=>fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-reliability-'));
const fixture=()=>JSON.parse(fs.readFileSync('fixtures/go-mw-v3.json'));
const wait=async fn=>{for(let i=0;i<100;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('Job timeout');};

test('automatic snapshots rotate five valid versions and recover without deleting unreadable originals',()=>{
 const file=path.join(root(),'data.json');
 for(let i=0;i<8;i++){atomicJSON(file,{value:i});checkpoint(file,()=>{},true);}
 const backups=snapshots(file);assert.equal(backups.length,5);
 fs.writeFileSync(file,'{broken');recoverJSON(file,backups[0].name);
 assert.deepEqual(JSON.parse(fs.readFileSync(file)),backups[0].data);
 assert(fs.readdirSync(path.dirname(file)).some(name=>name.includes('.unreadable-')));
});
test('failed atomic write rolls back the in-memory library and preserves the previous file',()=>{
 const store=new Store(root());store.collect(fixture());const original=fs.readFileSync(store.file,'utf8');
 const rename=fs.renameSync;
 fs.renameSync=(from,to)=>{if(to===store.file)throw new Error('disk full');return rename(from,to);};
 try{store.data.words[0].notes='not saved';assert.throws(()=>store.save(),/disk full/);}finally{fs.renameSync=rename;}
 assert.equal(fs.readFileSync(store.file,'utf8'),original);assert.equal(store.data.words[0].notes,'');
});
test('scroll bursts persist only reading history and flush the latest position',()=>{
 const store=new Store(root());store.collect(fixture());const text=fs.readFileSync(store.file,'utf8');
 const file=path.join(root(),'book.pdf');fs.writeFileSync(file,'%PDF-1.4 test');
 const history=new PDFHistory(store,true),record=history.register(file);let saves=0;
 const original=store.saveHistory.bind(store);store.saveHistory=()=>{saves++;original();};
 for(let i=0;i<100;i++)history.update(record.id,{page:2,zoom:'fit',scrollX:0,scrollY:i/100,highlights:[]});
 assert.equal(saves,0);store.flushHistory();assert.equal(saves,1);
 assert.equal(fs.readFileSync(store.file,'utf8'),text);assert.equal(new Store(store.root).data.pdfHistory[0].scrollY,.99);
});
test('old embedded reading history migrates without losing annotations',()=>{
 const folder=root(),file=path.join(folder,'library.json');fs.writeFileSync(file,JSON.stringify({version:1,groups:[],words:[],pdfHistory:[{id:'old',highlights:[{text:'word'}]}]}));
 const store=new Store(folder);store.save();assert(!('pdfHistory' in JSON.parse(fs.readFileSync(file))));
 assert.equal(new Store(folder).data.pdfHistory[0].highlights[0].text,'word');
});
test('re-extraction keeps a comparison and flags fewer senses while preserving edits',()=>{
 const store=new Store(root()),entry=fixture(),w=store.collect(entry);w.entries.mw.senses[0].editedDefinition='my wording';store.update(w);
 const incoming=fixture();incoming.senses=incoming.senses.slice(0,1);store.collect(incoming);
 const saved=store.data.words[0].entries.mw;assert(saved.quality.needsReview);assert.equal(saved.previousExtraction.senses[0].editedDefinition,'my wording');assert(saved.quality.previous>saved.quality.current);
});
test('audio queue bounds concurrency and merges media without overwriting newer notes or selections',async()=>{
 const store=new Store(root()),entry=fixture();entry.audio=Array.from({length:5},(_,i)=>({url:'audio-'+i}));const w=store.collect(entry);
 let running=0,peak=0;const queue=new AudioJobs(async audio=>{running++;peak=Math.max(peak,running);await new Promise(r=>setTimeout(r,15));audio.file='assets/test.mp3';running--;});
 queue.enqueue(store,w.id);const edited=structuredClone(w);edited.notes='new note';edited.entries.mw.senses[0].selected=true;store.update(edited);
 await wait(()=>!queue.active(store).length);assert.equal(peak,2);assert.equal(store.data.words[0].notes,'new note');assert(store.data.words[0].entries.mw.senses[0].selected);assert(store.data.words[0].entries.mw.audio.every(a=>a.file));
 const stale=structuredClone(edited);stale.notes='later note';store.update(stale);assert(store.data.words[0].entries.mw.audio.every(a=>a.file));
});
test('cancelled audio cannot block text edits or write into a different library',async()=>{
 const a=new Store(root()),b=new Store(root()),entry=fixture();entry.audio=[{url:'one'},{url:'two'}];const w=a.collect(entry);
 const queue=new AudioJobs(async(audio,job)=>{await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,100);job.controller.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('cancelled'));},{once:true});});audio.file='assets/a.mp3';});
 queue.enqueue(a,w.id);queue.cancel(a);w.notes='still editable';a.update(w);await wait(()=>!queue.active(a).length);
 assert.equal(a.data.words[0].notes,'still editable');assert.equal(b.data.words.length,0);assert(a.data.words[0].entries.mw.audio.every(a=>!a.file));
});
test('PDF search counts repeated occurrences and crosses text fragments and lines',async()=>{
 const {indexText,findMatches}=await import('../src/ui/pdf-search.mjs');
 const index=indexText([{str:'hel'},{str:'lo world hello',hasEOL:true},{str:'world'}]);
 const matches=findMatches(index,'HELLO   WORLD');assert.equal(matches.length,2);
 assert.deepEqual(matches[0].start,{item:0,offset:0});assert.deepEqual(matches[1].end,{item:2,offset:4});
 assert.equal(findMatches(index,'world').length,2);assert.equal(findMatches(index,'').length,0);
});
