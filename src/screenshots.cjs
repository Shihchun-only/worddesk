const fs=require('node:fs'),path=require('node:path');
function visitSnapshots(value,callback){
  if(!value||typeof value!=='object')return;
  for(const [key,child]of Object.entries(value))if(key==='snapshot'&&Array.isArray(child))callback(value,child);else visitSnapshots(child,callback);
}
function screenshotFiles(store){
  const base=path.resolve(store.root,'assets'),referenced=new Set(),files=[];
  visitSnapshots(store.data,(_owner,refs)=>refs.filter(f=>typeof f==='string').forEach(f=>referenced.add(path.resolve(store.root,f).toLowerCase())));
  if(!fs.existsSync(base)||fs.lstatSync(base).isSymbolicLink())return files;
  function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    if(item.isSymbolicLink())continue;const file=path.join(dir,item.name);
    if(item.isDirectory())walk(file);
    else if(item.isFile()&&/\.png$/i.test(item.name)&&(/^page-\d+\.png$/i.test(item.name)||referenced.has(file.toLowerCase())))files.push({file,bytes:fs.statSync(file).size});
  }}
  walk(base);return files;
}
function screenshotStats(store){const files=screenshotFiles(store);return {count:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0)};}
function clearScreenshots(store){
  const files=screenshotFiles(store),removed=new Set();let bytes=0,failed=0;
  const base=path.resolve(store.root,'assets');
  for(const {file,bytes:size}of files)try{
    // Only regular files physically within this library's assets directory are eligible.
    if(fs.lstatSync(file).isSymbolicLink()||!fs.realpathSync(file).toLowerCase().startsWith(base.toLowerCase()+path.sep))throw new Error('Invalid asset path');
    fs.unlinkSync(file);removed.add(file.toLowerCase());bytes+=size;
  }catch{failed++;}
  visitSnapshots(store.data,(owner,refs)=>{owner.snapshot=refs.filter(f=>typeof f!=='string'||!removed.has(path.resolve(store.root,f).toLowerCase()));});
  store.save();return {count:removed.size,bytes,failed};
}
module.exports={screenshotStats,clearScreenshots};
