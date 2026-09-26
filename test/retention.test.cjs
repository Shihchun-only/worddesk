const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../src/store.cjs');const WEEK=7*24*60*60*1000;
const root=()=>fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-retention-'));
function record(id){return {id,word:id,source:'mw',groups:['阅读'],notes:'保留笔记',entries:{mw:{senses:[],audio:[],snapshot:[]}}};}
test('new deletions expire at exactly seven days; expiry cleans only unshared files',()=>{
 const s=new Store(root()),a=record('a'),b=record('b');s.data.words=[a,b];s.data.groups=['阅读'];fs.mkdirSync(path.join(s.root,'assets'));fs.writeFileSync(path.join(s.root,'assets','shared.mp3'),'shared');fs.writeFileSync(path.join(s.root,'assets','a.png'),'a');
 a.entries.mw.audio=[{file:'assets/shared.mp3'}];b.entries.mw.audio=[{file:'assets/shared.mp3'}];a.entries.mw.snapshot=['assets/a.png'];s.save();s.trashWords(['a']);const t=s.data.trash[0];
 assert.equal(Date.parse(t.expiresAt)-Date.parse(t.deletedAt),WEEK);assert.equal(s.cleanupExpired(Date.parse(t.expiresAt)-1).count,0);assert.equal(s.cleanupExpired(Date.parse(t.expiresAt)).count,1);
 assert(fs.existsSync(path.join(s.root,'assets/shared.mp3')));assert(!fs.existsSync(path.join(s.root,'assets/a.png')));assert.equal(s.data.words[0].id,'b');
});
test('legacy trash receives one grace week which is not extended when reopened',()=>{
 const dir=root(),old=record('legacy');old.deletedAt='2020-01-01T00:00:00Z';fs.writeFileSync(path.join(dir,'library.json'),JSON.stringify({version:1,groups:['阅读'],words:[],trash:[old]}));
 const before=Date.now(),s=new Store(dir),expires=s.data.trash[0].expiresAt;assert(Date.parse(expires)>=before+WEEK);assert(Date.parse(expires)<=Date.now()+WEEK);
 assert.equal(new Store(dir).data.trash[0].expiresAt,expires);assert.equal(s.restoreWords(['legacy']),1);assert.equal(s.data.words[0].expiresAt,undefined);assert.equal(s.data.words[0].notes,'保留笔记');
});
test('startup and restore cannot revive expired trash; deletion after restoring starts a new week',()=>{
 const s=new Store(root());s.data.words=[record('expired'),record('fresh')];s.trashWords(['expired','fresh']);s.data.trash[0].expiresAt=new Date(Date.now()-1).toISOString();s.save();const reopened=new Store(s.root);assert.equal(reopened.data.trash.length,1);assert.equal(reopened.restoreWords(['expired']),0);
 assert.equal(reopened.restoreWords(['fresh']),1);reopened.trashWords(['fresh']);assert.equal(Date.parse(reopened.data.trash[0].expiresAt)-Date.parse(reopened.data.trash[0].deletedAt),WEEK);
});
