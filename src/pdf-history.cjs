const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
function inspect(file){if(typeof file!=='string'||!path.isAbsolute(file)||!/\.pdf$/i.test(file))throw new Error('请选择 PDF 文件');const stat=fs.statSync(file);if(!stat.isFile()||stat.size>200*1024*1024)throw new Error('PDF 超过200 MB或不是文件');const bytes=fs.readFileSync(file);if(!bytes.subarray(0,1024).includes(Buffer.from('%PDF-')))throw new Error('无效 PDF');return {bytes,hash:crypto.createHash('sha256').update(bytes).digest('hex')};}
class PDFHistory{
 constructor(store){this.store=store;this.items=store.data.pdfHistory??=[];}
 register(file){const {hash}=inspect(file);let item=this.items.find(x=>x.id===hash);if(!item){item={id:hash,path:file,name:path.basename(file),page:1,zoom:'fit',scrollX:0,scrollY:0,highlights:[]};this.items.push(item);}item.path=file;item.name=path.basename(file);item.lastRead=new Date().toISOString();this.store.save();return item;}
 read(id){const item=this.items.find(x=>x.id===id);if(!item)throw new Error('阅读记录不存在');try{const {bytes,hash}=inspect(item.path);if(hash!==id)throw new Error('文件内容已变化');item.lastRead=new Date().toISOString();this.store.save();return {record:item,bytes};}catch{throw new Error('原文件不存在或内容已变化，请重新定位原 PDF');}}
 relocate(id,file){const item=this.items.find(x=>x.id===id);if(!item)throw new Error('阅读记录不存在');const {hash}=inspect(file);if(hash!==id)throw new Error('文件与原 PDF 内容不同，未更改阅读记录');item.path=file;item.name=path.basename(file);this.store.save();return item;}
 update(id,state){const item=this.items.find(x=>x.id===id);if(!item)throw new Error('阅读记录不存在');if(!Number.isInteger(state.page)||state.page<1||!['fit','0.75','1','1.5','2'].includes(state.zoom))throw new Error('阅读位置无效');
 if(!Array.isArray(state.highlights)||state.highlights.length>10000)throw new Error('高亮记录过多');
 for(const h of state.highlights){if(typeof h.id!=='string'||h.id.length>80||typeof h.text!=='string'||h.text.length>80||!Number.isInteger(h.page)||h.page<1||!Array.isArray(h.rects)||h.rects.length>100||h.rects.some(r=>!Array.isArray(r)||r.length!==4||r.some(n=>!Number.isFinite(n)||n<0||n>1)))throw new Error('高亮位置无效');}
 Object.assign(item,{page:state.page,zoom:state.zoom,scrollX:Math.max(0,Math.min(1,Number(state.scrollX)||0)),scrollY:Math.max(0,Math.min(1,Number(state.scrollY)||0)),highlights:state.highlights,lastRead:new Date().toISOString()});this.store.save();return item;}
}
module.exports={PDFHistory};
