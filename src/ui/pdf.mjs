import {indexText,findMatches,normalizedQuery} from './pdf-search.mjs';
import * as pdfjs from '../../node_modules/pdfjs-dist/build/pdf.mjs';
pdfjs.GlobalWorkerOptions.workerSrc=new URL('../../node_modules/pdfjs-dist/build/pdf.worker.mjs',import.meta.url).href;
const $=s=>document.querySelector(s);let pdf=null,pageNo=1,renderId=0,findId=0,loading=false,match=null;
const textCache=new Map();let searchResults=[],searchIndex=-1,searchQuery='',searchBusy=false;let textDivs=[];
async function pageText(n){if(!textCache.has(n))textCache.set(n,pdf.getPage(n).then(p=>p.getTextContent()));return textCache.get(n);}
let lastDrawWidth=0;let highlights=[],position={scrollX:0,scrollY:0};
const status=text=>$('#status').textContent=text;
async function draw(){
 if(!pdf||!$('#scroller').clientWidth)return;lastDrawWidth=$('#scroller').clientWidth;const id=++renderId;loading=true;const p=await pdf.getPage(pageNo);if(id!==renderId)return;
 const base=p.getViewport({scale:1}),scale=$('#zoom').value==='fit'?Math.max(.1,($('#scroller').clientWidth-34)/base.width):Number($('#zoom').value),viewport=p.getViewport({scale});
 const sheet=$('#sheet');sheet.replaceChildren();sheet.style.width=viewport.width+'px';sheet.style.height=viewport.height+'px';sheet.style.setProperty('--scale-factor',scale);sheet.style.setProperty('--total-scale-factor',scale);
 const canvas=document.createElement('canvas'),ratio=Math.min(devicePixelRatio,2);canvas.width=Math.ceil(viewport.width*ratio);canvas.height=Math.ceil(viewport.height*ratio);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';sheet.append(canvas);
 $('#page').value=pageNo;$('#total').textContent='/ '+pdf.numPages;$('#prev').disabled=pageNo===1;$('#next').disabled=pageNo===pdf.numPages;
 try{await p.render({canvasContext:canvas.getContext('2d'),viewport,transform:[ratio,0,0,ratio,0,0]}).promise;if(id!==renderId)return;
 const content=await pageText(pageNo);if(id!==renderId)return;const layer=document.createElement('div');layer.className='textLayer';sheet.append(layer);const textLayer=new pdfjs.TextLayer({textContentSource:content,container:layer,viewport});await textLayer.render();if(id!==renderId)return;textDivs=textLayer.textDivs;
 status(content.items.some(i=>i.str?.trim())?'选中文字后按 Ctrl+C 可查词；右键可选择“复制并查词”。':'本页没有可选文字，可能是扫描页；第一版不含 OCR。');
 paintHighlights();paintSearch();
 }catch(e){if(id===renderId)status('本页显示失败：'+e.message);}finally{if(id===renderId){loading=false;const sc=$('#scroller');sc.scrollLeft=position.scrollX*Math.max(0,sc.scrollWidth-sc.clientWidth);sc.scrollTop=position.scrollY*Math.max(0,sc.scrollHeight-sc.clientHeight);savePDFState();}}
}
async function navigate(n){position={scrollX:0,scrollY:0};pageNo=Math.max(1,Math.min(pdf.numPages,Math.trunc(Number(n))||1));$('#scroller').scrollTop=0;await draw();}
window.addEventListener('message',async e=>{if(e.source!==parent||e.data?.kind!=='load-pdf'||pdf)return;try{const saved=e.data.record;highlights=saved?.highlights||[];pageNo=saved?.page||1;position={scrollX:saved?.scrollX||0,scrollY:saved?.scrollY||0};$('#zoom').value=saved?.zoom||'fit';const task=pdfjs.getDocument({data:new Uint8Array(e.data.bytes),isEvalSupported:false,cMapUrl:new URL('../../node_modules/pdfjs-dist/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('../../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).href,wasmUrl:new URL('../../node_modules/pdfjs-dist/wasm/',import.meta.url).href});pdf=await task.promise;pageNo=Math.min(pageNo,pdf.numPages);$('#page').max=pdf.numPages;await draw();}catch(err){status(err.name==='PasswordException'?'此 PDF 需要密码，请先解锁后重新打开。':'无法打开 PDF：'+err.message);}});
$('#prev').onclick=()=>pdf&&navigate(pageNo-1);$('#next').onclick=()=>pdf&&navigate(pageNo+1);$('#page').onchange=()=>{if(pdf)navigate(Number($('#page').value)||1);};$('#zoom').onchange=draw;
function paintSearch(){
 $('#sheet').querySelectorAll('.search-hit').forEach(el=>el.remove());
 const sheet=$('#sheet').getBoundingClientRect();
 searchResults.forEach((hit,index)=>{
  if(hit.page!==pageNo)return;const first=textDivs[hit.start.item]?.firstChild,last=textDivs[hit.end.item]?.firstChild;if(!first||!last)return;
  const range=document.createRange();range.setStart(first,hit.start.offset);range.setEnd(last,hit.end.offset+1);
  for(const rect of range.getClientRects()){if(!rect.width)continue;const el=document.createElement('div');el.className='search-hit'+(index===searchIndex?' current-search-hit':'');Object.assign(el.style,{left:(rect.left-sheet.left)+'px',top:(rect.top-sheet.top)+'px',width:rect.width+'px',height:rect.height+'px'});$('#sheet').append(el);}
 });
}
async function find(direction=1){
 if(!pdf)return;const query=normalizedQuery($('#find-text').value);if(!query)return;
 const id=++findId;
 if(query!==searchQuery||searchBusy){
  searchQuery=query;searchResults=[];searchIndex=-1;searchBusy=true;$('#find-count').textContent='正在搜索…';
  try{for(let n=1;n<=pdf.numPages;n++){const content=await pageText(n);if(id!==findId)return;searchResults.push(...findMatches(indexText(content.items),query).map(hit=>({...hit,page:n})));}}
  catch(error){if(id===findId){searchQuery='';$('#find-count').textContent='搜索失败';status(error.message);}return;}
  finally{if(id===findId)searchBusy=false;}
  searchIndex=direction>0?searchResults.findIndex(hit=>hit.page>=pageNo):searchResults.findLastIndex(hit=>hit.page<=pageNo);
  if(searchIndex<0)searchIndex=direction>0?0:searchResults.length-1;
 }else if(searchResults.length)searchIndex=(searchIndex+direction+searchResults.length)%searchResults.length;
 if(id!==findId)return;
 $('#find-count').textContent=searchResults.length?(searchIndex+1)+' / '+searchResults.length:'0 / 0';
 if(!searchResults.length){paintSearch();status('未找到：'+query);return;}
 await navigate(searchResults[searchIndex].page);if(id!==findId)return;
 $('#sheet .current-search-hit')?.scrollIntoView({block:'center'});
}
$('#find').onsubmit=e=>{e.preventDefault();find().catch(e=>status(e.message));};
$('#find-prev').onclick=()=>find(-1).catch(e=>status(e.message));
$('#find-text').oninput=()=>{findId++;searchBusy=false;searchQuery='';searchResults=[];searchIndex=-1;$('#find-count').textContent='';paintSearch();};
function selection(){const s=getSelection();return s?.rangeCount&&$('#sheet').contains(s.anchorNode)&&$('#sheet').contains(s.focusNode)?s.toString():'';}
let explicit=false;
function captureHighlight(text){
 const selection=getSelection();if(!selection.rangeCount)return null;const sheet=$('#sheet').getBoundingClientRect();
 const clamp=n=>Math.max(0,Math.min(1,n));const rects=[...selection.getRangeAt(0).getClientRects()].filter(r=>r.width>0&&r.height>0).slice(0,100).map(r=>[clamp((r.left-sheet.left)/sheet.width),clamp((r.top-sheet.top)/sheet.height),clamp(r.width/sheet.width),clamp(r.height/sheet.height)]);
 return {id:crypto.randomUUID(),page:pageNo,text,rects};
}
function paintHighlights(){
 $('#sheet').querySelectorAll('.saved-highlight').forEach(e=>e.remove());for(const h of highlights.filter(h=>h.page===pageNo))for(const [x,y,width,height]of h.rects){const el=document.createElement('button');el.className='saved-highlight';el.title='查看 '+h.text+' 的复习释义';el.setAttribute('aria-label',el.title);Object.assign(el.style,{left:x*100+'%',top:y*100+'%',width:width*100+'%',height:height*100+'%'});el.onclick=e=>{e.stopPropagation();const r=el.getBoundingClientRect();parent.postMessage({kind:'pdf-highlight',highlight:h,x:r.left,y:r.bottom+8},'*');};$('#sheet').append(el);}
}
function savePDFState(){if(!pdf||loading)return;parent.postMessage({kind:'pdf-state',state:{page:pageNo,zoom:$('#zoom').value,...position,highlights}},'*');}
$('#scroller').addEventListener('scroll',()=>{if(loading||!$('#scroller').clientWidth)return;const sc=$('#scroller');position={scrollX:sc.scrollLeft/Math.max(1,sc.scrollWidth-sc.clientWidth),scrollY:sc.scrollTop/Math.max(1,sc.scrollHeight-sc.clientHeight)};savePDFState();});
window.addEventListener('message',e=>{if(e.source!==parent)return;
 if(e.data?.kind==='add-highlight'&&e.data.highlight?.rects?.length){const h=e.data.highlight;if(!highlights.some(old=>old.page===h.page&&old.text===h.text&&JSON.stringify(old.rects)===JSON.stringify(h.rects)))highlights.push(h);paintHighlights();savePDFState();}
 if(e.data?.kind==='remove-highlight'){highlights=highlights.filter(h=>h.id!==e.data.id);paintHighlights();savePDFState();}
});
document.addEventListener('pointerdown',e=>{if(!e.target.closest('.saved-highlight'))parent.postMessage({kind:'pdf-dismiss'},'*');});
window.addEventListener('keydown',e=>{if(e.key==='F11'||e.key==='Escape'){e.preventDefault();parent.postMessage({kind:'pdf-key',key:e.key},'*');}});
let resizeTimer,lastWidth=0;new ResizeObserver(()=>{const width=$('#scroller').clientWidth;if(width>0&&width!==lastWidth){lastWidth=width;clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(pdf&&$('#zoom').value==='fit'&&$('#scroller').clientWidth!==lastDrawWidth)draw();},150);}}).observe($('#scroller'));
document.addEventListener('copy',e=>{const text=selection();if(!text)return;e.clipboardData.setData('text/plain',text);e.preventDefault();parent.postMessage({kind:'pdf-copy',text,explicit,highlight:captureHighlight(text)},'*');});
document.addEventListener('contextmenu',e=>{if(!selection())return;e.preventDefault();const menu=$('#copy-menu');menu.hidden=false;menu.style.left=Math.min(e.clientX,innerWidth-150)+'px';menu.style.top=Math.min(e.clientY,innerHeight-50)+'px';});
$('#copy-menu').onmousedown=e=>e.preventDefault();$('#copy-menu').onclick=()=>{explicit=true;document.execCommand('copy');explicit=false;$('#copy-menu').hidden=true;};document.addEventListener('mousedown',e=>{if(e.target!==$('#copy-menu'))$('#copy-menu').hidden=true;});
// Native selection/copy stays confined to this viewer. No system clipboard monitoring.
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key==='f'){e.preventDefault();$('#find-text').focus();}});

document.addEventListener('dragover',e=>e.preventDefault());document.addEventListener('drop',e=>{e.preventDefault();parent.postMessage({kind:'pdf-drop',files:[...e.dataTransfer.files]},'*');});

window.addEventListener('message',async e=>{if(e.source!==parent||e.data?.kind!=='restore-reading'||!pdf)return;const state=e.data.state;pageNo=Math.max(1,Math.min(pdf.numPages,state.page||1));$('#zoom').value=state.zoom||'fit';position={scrollX:state.scrollX||0,scrollY:state.scrollY||0};match=null;await draw();});

window.addEventListener('message',e=>{if(e.source===parent&&e.data?.kind==='language')I18n.setLanguage(e.data.language);});parent.postMessage({kind:'language-ready'},'*');
