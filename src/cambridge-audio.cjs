const fs=require('node:fs'),path=require('node:path');
function visitFiles(value,callback,source=''){
  if(!value||typeof value!=='object')return;
  if(['mw','cambridge'].includes(value.source))source=value.source;
  for(const [key,child]of Object.entries(value)){
    if(key==='file'&&typeof child==='string')callback(value,child,source);
    else visitFiles(child,callback,['mw','cambridge'].includes(key)?key:source);
  }
}
function eligibleFiles(store){
  const wanted=new Set(),protectedFiles=new Set(),base=path.resolve(store.root,'assets'),files=[];
  visitFiles(store.data,(_owner,file,source)=>{const resolved=path.resolve(store.root,file).toLowerCase();(source==='cambridge'?wanted:protectedFiles).add(resolved);});
  if(!fs.existsSync(base)||fs.lstatSync(base).isSymbolicLink())return files;
  function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    if(item.isSymbolicLink())continue;const file=path.join(dir,item.name),key=file.toLowerCase();
    if(item.isDirectory())walk(file);else if(item.isFile()&&/\.mp3$/i.test(file)&&wanted.has(key)&&!protectedFiles.has(key))files.push({file,bytes:fs.statSync(file).size});
  }}walk(base);return files;
}
function cambridgeAudioStats(store){const files=eligibleFiles(store);return {count:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0)};}
function clearCambridgeAudio(store){
  const files=eligibleFiles(store),removed=new Set();let bytes=0,failed=0;const base=path.resolve(store.root,'assets');
  for(const {file,bytes:size}of files)try{if(fs.lstatSync(file).isSymbolicLink()||!fs.realpathSync(file).toLowerCase().startsWith(base.toLowerCase()+path.sep))throw new Error('Invalid path');fs.unlinkSync(file);removed.add(file.toLowerCase());bytes+=size;}catch{failed++;}
  visitFiles(store.data,(owner,file,source)=>{if(source==='cambridge'&&removed.has(path.resolve(store.root,file).toLowerCase())){delete owner.file;delete owner.error;}});store.save();return {count:removed.size,bytes,failed};
}
module.exports={cambridgeAudioStats,clearCambridgeAudio};
