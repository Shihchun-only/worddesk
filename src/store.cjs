const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {atomicJSON, checkpoint, snapshots} = require('./safe-json.cjs');
const key = s => s.normalize('NFKC').trim().toLowerCase();
const fingerprint = s => JSON.stringify([s.pos,s.section,s.definition,s.translation]);
const normalized = s => String(s||'').replace(/\s+/g,' ').trim();
const TRASH_RETENTION_MS=7*24*60*60*1000;
function mergeEntry(old, incoming) {
  // Only new or changed senses start unselected. Persisted user selections survive updates.
  incoming.senses.forEach(s=>{s.selected=false;s.includeChinese=false;s.examples.forEach(e=>e.selected=false);});
  incoming.quality={previous:old?.senses.length??null,current:incoming.senses.length,checkedAt:new Date().toISOString(),needsReview:false};
  if (!old) return incoming;
  incoming.quality.needsReview=incoming.senses.length<old.senses.length;
  if(incoming.quality.needsReview)incoming.warnings.push('本次释义数量减少，请对照旧内容核查；数量不代表完整性。');
  incoming.previousExtraction={capturedAt:old.capturedAt,senses:old.senses};
  const previous = new Map();
  for (const s of old.senses) { const k=fingerprint(s); if(!previous.has(k)) previous.set(k,[]); previous.get(k).push(s); }
  for (const s of incoming.senses) {
    let p=previous.get(fingerprint(s))?.shift();
    if(!p && old.parserVersion!==incoming.parserVersion) {
      const matches=[...previous.entries()].filter(([,items])=>items.some(x=>x.pos===s.pos&&normalized(x.definition)===normalized(s.definition)));
      if(matches.length===1){const items=matches[0][1];p=items.splice(items.findIndex(x=>x.pos===s.pos&&normalized(x.definition)===normalized(s.definition)),1)[0];}
    }
    if(!p) continue;
    for(const k of ['selected','editedDefinition','editedTranslation','autoTranslation']) if(k in p) s[k]=p[k];
    s.includeChinese=!!p.selected&&p.includeChinese!==false;
    for(const e of s.examples) {
      const before=p.examples.find(x=>x.text===e.text&&x.translation===e.translation);
      if(before) for(const k of ['selected','autoTranslation']) if(k in before) e[k]=before[k];
    }
  }
  const unmatched=[...previous.values()].flat();
  incoming.review = [...(old.review || []), ...unmatched];
  incoming.reviewHistory = old.reviewHistory || [];
  incoming.archives = old.archives || [];
  if(old.parserVersion!==incoming.parserVersion) {
    const {archives,...snapshot}=old;
    incoming.archives=[...incoming.archives,{...snapshot,archivedAt:new Date().toISOString()}];
  }
  if(!incoming.snapshot?.length && old.snapshot?.length) incoming.snapshot=old.snapshot;
  if(unmatched.length) incoming.warnings.push(`${unmatched.length} 条旧释义发生变化，旧内容及个人修改已保留在“更新待确认”。`);
  for(const a of incoming.audio) { const p=old.audio.find(x=>x.url===a.url&&x.file); if(p) a.file=p.file; }
  if(incoming.source==='cambridge')incoming.legacyAudio=[...(old.legacyAudio||[]),...old.audio.filter(a=>a.file&&!incoming.audio.some(b=>b.file===a.file))].filter((a,i,all)=>all.findIndex(b=>b.file===a.file)===i);
  return incoming;
}
class Store {
  constructor(root) { this.root=root; fs.mkdirSync(root,{recursive:true}); this.file=path.join(root,'library.json'); this.data=fs.existsSync(this.file)?JSON.parse(fs.readFileSync(this.file,'utf8')):{version:1,words:[],groups:[],exportFields:['word','pos','meaning']}; this.validate(this.data); this.data.trash??=[];this.data.lastCollectionGroups??=[];
    // Pre-retention records receive one full grace period on first upgrade.
    let migrated=false;if(JSON.stringify(this.data.exportFields)===JSON.stringify(['word','phonetic','pos','definition','translation','examples'])){this.data.exportFields=['word','pos','meaning'];migrated=true;}const now=Date.now();for(const w of this.data.trash)if(!Number.isFinite(Date.parse(w.expiresAt))){w.expiresAt=new Date(now+TRASH_RETENTION_MS).toISOString();migrated=true;}
    this.historyFile=path.join(root,'reading-history.json');
    if(fs.existsSync(this.historyFile)){const history=JSON.parse(fs.readFileSync(this.historyFile,'utf8'));if(!Array.isArray(history))throw new Error('阅读记录格式不受支持');this.data.pdfHistory=history;}
    this.persisted=JSON.stringify(this.data);
    if(migrated)this.save();this.cleanupExpired(now);this.checkpoint();
  }
  validate(d) { if(d.version!==1 || !Array.isArray(d.words)||!Array.isArray(d.groups)) throw new Error('词库格式不受支持'); }
  save() {
    const {pdfHistory,...library}=this.data;
    try {
      if(pdfHistory&&!fs.existsSync(this.historyFile))this.saveHistory();
      atomicJSON(this.file,library,{validate:d=>this.validate(d)});
      this.persisted=JSON.stringify(this.data);
    } catch(error) {
      const history=this.data.pdfHistory;
      this.data=JSON.parse(this.persisted);
      if(history)this.data.pdfHistory=history;
      throw error;
    }
  }
  saveHistory(){atomicJSON(this.historyFile,this.data.pdfHistory||[],{validate:d=>{if(!Array.isArray(d))throw new Error('阅读记录格式不受支持');}});}
  scheduleHistory(){
    clearTimeout(this.historyTimer);
    this.historyTimer=setTimeout(()=>this.tryFlushHistory(),750);this.historyTimer.unref?.();
    if(!this.historyDeadline){this.historyDeadline=setTimeout(()=>this.tryFlushHistory(),5000);this.historyDeadline.unref?.();}
  }
  tryFlushHistory(){try{this.flushHistory();}catch(e){this.historyError=e.message;}}
  flushHistory(){if(!this.historyTimer&&!this.historyDeadline&&!this.historyError)return;clearTimeout(this.historyTimer);clearTimeout(this.historyDeadline);this.historyTimer=null;this.historyDeadline=null;try{this.saveHistory();this.historyError=null;this.onHistoryError?.(null);}catch(e){this.historyError=e.message;this.onHistoryError?.(e.message);throw e;}}
  backups(){return snapshots(this.file,d=>this.validate(d)).map(({name,time,data})=>({name,time,words:data.words.length}));}
  checkpoint(){checkpoint(this.file,d=>this.validate(d),true);}
  collect(entry,groups) { if(groups!==undefined)this.checkGroups(groups);let w=this.data.words.find(w=>key(w.word)===key(entry.headword)); if(!w) { w={id:crypto.randomUUID(),word:entry.headword,createdAt:new Date().toISOString(),source:'mw',groups:[],notes:'',entries:{}}; this.data.words.push(w); } w.entries[entry.source]=mergeEntry(w.entries[entry.source],entry); if(!w.entries[w.source]) w.source=entry.source; if(groups!==undefined){w.groups=[...new Set([...w.groups,...groups])];this.data.lastCollectionGroups=[...groups];}w.updatedAt=new Date().toISOString(); this.save(); return w; }
  checkGroups(groups){if(!Array.isArray(groups)||!groups.length||groups.some(g=>!this.data.groups.includes(g)))throw new Error('请选择至少一个现有分组');}
  deleteGroup(group){if(!this.data.groups.includes(group))throw new Error('分组不存在');const count=this.data.words.filter(w=>w.groups.includes(group)).length;this.data.groups=this.data.groups.filter(g=>g!==group);this.data.lastCollectionGroups=this.data.lastCollectionGroups.filter(g=>g!==group);for(const w of [...this.data.words,...this.data.trash])w.groups=w.groups.filter(g=>g!==group);this.save();return count;}
  trashWords(ids){const selected=new Set(ids);const moved=this.data.words.filter(w=>selected.has(w.id));const now=Date.now();this.data.words=this.data.words.filter(w=>!selected.has(w.id));this.data.trash.push(...moved.map(w=>({...w,deletedAt:new Date(now).toISOString(),expiresAt:new Date(now+TRASH_RETENTION_MS).toISOString()})));this.save();return moved.length;}
  cleanupExpired(now=Date.now()){const ids=this.data.trash.filter(w=>Date.parse(w.expiresAt)<=now).map(w=>w.id);return ids.length?this.purgeWords(ids):{count:0,failed:0};}
  removeFromGroup(ids,group){if(!this.data.groups.includes(group))throw new Error('分组不存在');for(const w of this.data.words)if(ids.includes(w.id))w.groups=w.groups.filter(g=>g!==group);this.save();}
  restoreWords(ids){this.cleanupExpired();const selected=this.data.trash.filter(w=>ids.includes(w.id));if(selected.some(w=>this.data.words.some(x=>key(x.word)===key(w.word)))||new Set(selected.map(w=>key(w.word))).size!==selected.length)throw new Error('存在同名单词，请分别处理后再恢复，避免覆盖内容');for(const w of selected){delete w.deletedAt;delete w.expiresAt;this.data.words.push(w);this.data.groups=[...new Set([...this.data.groups,...w.groups])];}this.data.trash=this.data.trash.filter(w=>!ids.includes(w.id));this.save();return selected.length;}
  purgeWords(ids){
    const removed=this.data.trash.filter(w=>ids.includes(w.id));
    const files=words=>{const found=new Set();function walk(value){if(!value||typeof value!=='object')return;for(const [k,v]of Object.entries(value)){if(k==='file'&&typeof v==='string'&&/^assets[\\/]/.test(v))found.add(v);else if(k==='snapshot'&&Array.isArray(v))v.filter(x=>typeof x==='string').forEach(x=>found.add(x));else walk(v);}}words.forEach(walk);return found;};
    this.data.trash=this.data.trash.filter(w=>!ids.includes(w.id));this.save();
    const keep=new Set([...files([...this.data.words,...this.data.trash])].map(f=>this.asset(f).toLowerCase()));let failed=0;
    for(const file of files(removed)){try{const target=this.asset(file);if(keep.has(target.toLowerCase()))continue;if(/^assets[\\/]/.test(file)&&/\.(mp3|png)$/i.test(file)&&fs.existsSync(target))fs.unlinkSync(target);}catch{failed++;}}
    return {count:removed.length,failed};
  }
  update(word) { const i=this.data.words.findIndex(w=>w.id===word.id); if(i<0) throw new Error('单词不存在'); if(!word.entries[word.source]) throw new Error('请先收藏此词典'); const current=this.data.words[i];
    for(const [source,entry]of Object.entries(current.entries)){
      if(word.entries[source]?.capturedAt!==entry.capturedAt)throw new Error('词条已经更新，请重新打开词条后再保存');
      // Media belongs to the background queue, not to an older renderer snapshot.
      word.entries[source].audio=structuredClone(entry.audio);
    }
    this.data.words[i]=word; this.save(); }
  asset(relative) { const resolved=path.resolve(this.root,relative); if(!resolved.startsWith(path.resolve(this.root)+path.sep)) throw new Error('无效文件路径'); return resolved; }
}
module.exports={Store,mergeEntry,key};
