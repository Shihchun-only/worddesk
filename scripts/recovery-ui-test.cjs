const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),Zip=require('adm-zip');
const {Store}=require('../src/store.cjs'),{launch}=require('./ui-harness.cjs');
(async()=>{
 for(const automatic of [true,false]){
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-recovery-ui-'));
  const store=new Store(path.join(profile,'library'));
  store.collect(JSON.parse(fs.readFileSync('fixtures/go-mw-v3.json')));
  const zip=new Zip(),backup=path.join(profile,'complete.zip');zip.addFile('library.json',Buffer.from(JSON.stringify(store.data)));zip.writeZip(backup);
  if(!automatic)for(const file of fs.readdirSync(store.file+'.backups'))fs.unlinkSync(path.join(store.file+'.backups',file));
  fs.writeFileSync(store.file,'{unreadable');
  const app=await launch({profile,beforeStart:async evaluate=>{
   await evaluate(`global.recoveryPrompts=[];global.pick=0;const d=require('electron').dialog;d.showMessageBox=async options=>{global.recoveryPrompts.push(options);return {response:0};};d.showOpenDialog=async()=>({canceled:false,filePaths:[global.pick++===0?${JSON.stringify(backup)}:${JSON.stringify(profile)}]});d.showErrorBox=(title,text)=>{throw Error(title+': '+text);};true`);
  }});
  try{
   assert.equal(await app.ui('data.words.length'),1);
   assert.equal(await app.mainEval('global.recoveryPrompts.length'),1);
   if(automatic){assert.equal(await app.ui('root'),store.root);assert(fs.readdirSync(store.root).some(name=>name.includes('.unreadable-')));}
   else{assert.notEqual(await app.ui('root'),store.root);assert.equal(fs.readFileSync(store.file,'utf8'),'{unreadable');}
   console.log('PASS startup recovery: '+(automatic?'automatic snapshot':'full ZIP into new directory'));
  }finally{await app.close();}
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
