const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {Store}=require('../src/store.cjs'),{PDFHistory}=require('../src/pdf-history.cjs');
test('PDF history persists positions and highlights, deduplicates by content, and relocates only identical files',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-history-')),store=new Store(path.join(root,'library')),h=new PDFHistory(store),file=path.join(root,'book.pdf');fs.writeFileSync(file,'%PDF-1.4 test');const r=h.register(file);assert.equal(h.register(file).id,r.id);assert.equal(store.data.pdfHistory.length,1);
 const state={page:2,zoom:'1.5',scrollX:.1,scrollY:.4,highlights:[{id:'highlight',page:2,text:'obscure',rects:[[.1,.2,.1,.03]]}]};h.update(r.id,state);const reopened=new Store(store.root);assert.deepEqual(reopened.data.pdfHistory[0].highlights,state.highlights);assert.equal(reopened.data.pdfHistory[0].page,2);
 const moved=path.join(root,'moved.pdf');fs.renameSync(file,moved);assert.throws(()=>h.read(r.id),/重新定位/);h.relocate(r.id,moved);assert.equal(h.read(r.id).record.path,moved);assert.equal(h.read(r.id).record.highlights.length,1);
 const other=path.join(root,'other.pdf');fs.writeFileSync(other,'%PDF-1.4 different');assert.throws(()=>h.relocate(r.id,other),/不同/);assert.equal(h.read(r.id).record.path,moved);assert(!fs.existsSync(path.join(store.root,'book.pdf')));
 // Metadata lives in library.json, which is already included by the existing full-backup flow.
 const restored=new Store(path.join(root,'restored'));fs.copyFileSync(store.file,restored.file);assert.equal(new Store(restored.root).data.pdfHistory[0].highlights.length,1);
});
test('PDF history rejects invalid documents and malformed highlight coordinates',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-history-check-')),h=new PDFHistory(new Store(root)),file=path.join(root,'test.pdf');fs.writeFileSync(file,'not pdf');assert.throws(()=>h.register(file));fs.writeFileSync(file,'%PDF-1.4 test');const r=h.register(file);assert.throws(()=>h.update(r.id,{page:1,zoom:'fit',highlights:[{id:'x',page:1,text:'word',rects:[[0,0,99,1]]}]}));assert.equal(r.highlights.length,0);
});
