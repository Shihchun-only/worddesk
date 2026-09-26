const {app,BrowserWindow,WebContentsView,ipcMain,dialog,session,net,Menu}=require('electron');
const fs=require('node:fs'); const path=require('node:path'); const crypto=require('node:crypto');
const {Store}=require('./store.cjs'); const {PDFHistory}=require('./pdf-history.cjs'); const {cambridgeAudioStats,clearCambridgeAudio}=require('./cambridge-audio.cjs'); const {screenshotStats,clearScreenshots}=require('./screenshots.cjs'); const {extractDictionary}=require('./extract.cjs'); const {fields,exportWorkbook}=require('./export.cjs'); const Zip=require('adm-zip');
let win,store,configFile,config={},bounds={},visible=true,busy=false,workMode=false;
const views={}; const urls={mw:'https://www.merriam-webster.com/dictionary/',cambridge:'https://dictionary.cambridge.org/dictionary/english-chinese-simplified/'};
if(process.env.WORDDESK_TEST_DATA) app.setPath('userData',process.env.WORDDESK_TEST_DATA);
const hasLock=app.requestSingleInstanceLock();
if(!hasLock)app.quit();
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.focus();}});
const allowed=(url,source)=>{try{const u=new URL(url);return u.protocol==='https:'&&u.hostname===(source==='mw'?'www.merriam-webster.com':'dictionary.cambridge.org');}catch{return false;}};
const {translate:uiTranslate}=require('./ui/i18n.js');
function localizedOptions(options){return {...options,title:options.title?uiTranslate(options.title,config.language||'zh-CN'):undefined,defaultPath:options.defaultPath&&config.language==='en'?options.defaultPath.replace('复习词表','Review-Sheet').replace('词库备份','Library-Backup'):options.defaultPath,filters:options.filters?.map(f=>({...f,name:uiTranslate(f.name,config.language||'zh-CN')}))};}
const showSaveDialog=options=>dialog.showSaveDialog(win,localizedOptions(options));
const showOpenDialog=options=>dialog.showOpenDialog(win,localizedOptions(options));
const status=(source,message)=>{if(win&&!win.isDestroyed())win.webContents.send('status',{source,message});};
function layout(){for(const [s,v]of Object.entries(views)){const b=bounds[s];v.setVisible(visible&&!!b);if(b)v.setBounds({x:Math.max(0,Math.round(b.x)),y:Math.max(0,Math.round(b.y)),width:Math.max(1,Math.round(b.width)),height:Math.max(1,Math.round(b.height))});}}
function saveConfig(){fs.writeFileSync(configFile,JSON.stringify(config,null,2));}
function createWindow(){
  win=new BrowserWindow({width:1440,height:940,minWidth:1000,minHeight:680,title:uiTranslate('WordDesk · 双词典词库',config.language||'zh-CN'),backgroundColor:config.appearance==='dark'?'#181a1b':'#ffffff',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  Menu.setApplicationMenu(null);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  win.loadFile(path.join(__dirname,'ui','index.html'));
  for(const s of Object.keys(urls)){
    const v=new WebContentsView({webPreferences:{partition:`persist:dictionary-${s}`,contextIsolation:true,nodeIntegration:false,sandbox:true}}); views[s]=v;win.contentView.addChildView(v);v.setVisible(false);
    v.webContents.on('before-input-event',(e,input)=>{if(workMode&&input.type==='keyDown'&&['F11','Escape'].includes(input.key)){e.preventDefault();win.webContents.send('work-key',input.key);}});
    v.webContents.session.setPermissionRequestHandler((_wc,_permission,cb)=>cb(false));
    v.webContents.session.setPermissionCheckHandler(()=>false);
    v.webContents.on('will-navigate',(e,url)=>{if(!allowed(url,s)){e.preventDefault();status(s,'此链接不属于当前词典，已保留当前页面。');}});
    v.webContents.setWindowOpenHandler(({url})=>{if(allowed(url,s))v.webContents.loadURL(url).catch(()=>{});return {action:'deny'};});
    v.webContents.on('did-start-loading',()=>status(s,'正在加载…'));
    v.webContents.on('did-stop-loading',()=>status(s,'页面已停止加载 · 可浏览或收藏'));
    v.webContents.on('did-fail-load',(_e,code,description,_url,main)=>{if(main&&code!==-3)status(s,`加载失败：${description}，可以重试`);});
  }
  let closing=false;
  win.on('close',event=>{event.preventDefault();if(closing)return;closing=true;win.webContents.executeJavaScript('window.prepareToClose ? window.prepareToClose() : true').then(ok=>{if(ok)win.destroy();else closing=false;}).catch(()=>{closing=false;});});
  win.on('closed',()=>{for(const v of Object.values(views))if(!v.webContents.isDestroyed())v.webContents.close();});
}
function audioAllowed(raw){try{const u=new URL(raw);return u.protocol==='https:'&&['media.merriam-webster.com','dictionary.cambridge.org'].includes(u.hostname);}catch{return false;}}
async function downloadAudio(a,wc,folder,i){
  if(a.file&&fs.existsSync(store.asset(a.file)))return;
  if(!audioAllowed(a.url))throw new Error('音频地址不受支持');
  const response=await wc.session.fetch(a.url,{redirect:'error',signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error(`下载失败 ${response.status}`);
  const type=response.headers.get('content-type')||'';if(!/audio|octet-stream/i.test(type))throw new Error('返回的内容不是音频');
  const data=Buffer.from(await response.arrayBuffer());if(!data.length||data.length>20*1024*1024)throw new Error('音频文件尺寸异常');
  a.file=path.join(folder,`audio-${i}.mp3`);fs.writeFileSync(store.asset(a.file),data);delete a.error;
}
const collectionProgress=(source,message)=>win.webContents.send('status',{source,message,collection:true});
async function captureEntry(source){const wc=views[source].webContents;if(!allowed(wc.getURL(),source))throw new Error('请先查找一个单词');collectionProgress(source,'正在提取释义…');return wc.executeJavaScript(`(${extractDictionary.toString()})(${JSON.stringify(source)})`);}
async function collect(source,groups,captured){
  const wc=views[source].webContents;if(!allowed(wc.getURL(),source))throw new Error('请先查找一个单词');
  const entry=captured||await captureEntry(source);
  collectionProgress(source,`正在保存 ${entry.headword}：${entry.senses.length} 条释义…`);
  if(!entry.pronunciations.length)entry.warnings.push('未识别到音标，请对照网页确认是否提供。');
  if(source==='mw'){
  const folder=path.join('assets',crypto.randomUUID());fs.mkdirSync(store.asset(folder),{recursive:true});
  for(let i=0;i<entry.audio.length;i++){try{collectionProgress(source,`正在下载录音 ${i+1} / ${entry.audio.length}…`);await downloadAudio(entry.audio[i],wc,folder,i);}catch(err){entry.audio[i].error=err.message;}}
  if(!entry.audio.length)entry.warnings.push('未识别到音频链接，请对照网页确认是否提供发音。');
  const missing=entry.audio.filter(a=>!a.file).length;if(missing)entry.warnings.push(`${missing} 段音频下载失败，可在词库重试。`);
  }
  const word=store.collect(entry,groups);collectionProgress(source,`已保存 ${entry.headword} · ${entry.senses.length} 条释义${entry.warnings.length?' · 有待检查项目':''}`);return {word:word.word,source,warnings:entry.warnings};
}
async function translate(text){
  if(typeof text!=='string'||!text.trim())throw new Error('没有需要翻译的文本');
  // MyMemory documents a 500-byte request limit. Split at sentence/word boundaries.
  const chunks=[];let chunk='';for(const token of text.match(/\S+\s*/g)||[]){if(Buffer.byteLength(chunk+token)>450){if(chunk)chunks.push(chunk);chunk='';}if(Buffer.byteLength(token)>450)throw new Error('文本包含过长片段，请手动翻译');chunk+=token;}if(chunk)chunks.push(chunk);
  const results=[];for(const q of chunks){const u=new URL('https://api.mymemory.translated.net/get');u.searchParams.set('q',q);u.searchParams.set('langpair','en|zh-CN');const response=await net.fetch(u.href,{signal:AbortSignal.timeout(25000)});if(!response.ok)throw new Error('翻译服务暂不可用');const d=await response.json();if(Number(d.responseStatus)!==200||!d.responseData?.translatedText)throw new Error(d.responseDetails||'翻译额度不足或服务不可用');results.push(d.responseData.translatedText);}return results.join(' ');
}
async function backup(){if(busy)throw new Error('请等待收藏完成后再备份');const r=await showSaveDialog({title:'备份整个词库',defaultPath:`WordDesk-${new Date().toISOString().slice(0,10)}.zip`,filters:[{name:'词库备份',extensions:['zip']}]});if(r.canceled)return null;store.save();const zip=new Zip();zip.addLocalFile(store.file);const assets=path.join(store.root,'assets');if(fs.existsSync(assets))zip.addLocalFolder(assets,'assets');zip.writeZip(r.filePath);return r.filePath;}
async function restore(){
  if(busy)throw new Error('请等待收藏完成后再恢复');
  const picked=await showOpenDialog({title:'选择词库备份',properties:['openFile'],filters:[{name:'词库备份',extensions:['zip']}]});if(picked.canceled)return null;
  const zip=new Zip(picked.filePaths[0]);const entries=zip.getEntries();let total=0;
  for(const e of entries){const n=e.entryName.replace(/\\/g,'/');if(n.startsWith('/')||n.includes(':')||n.split('/').some(x=>x==='..')||!(n==='library.json'||n.startsWith('assets/')))throw new Error('备份中包含无效路径');total+=e.header.size;if(total>5*1024**3)throw new Error('备份解压超过 5GB，请联系协助处理');}
  const d=JSON.parse(zip.readAsText('library.json'));store.validate(d);
  const location=await showOpenDialog({title:'选择恢复位置（会新建词库文件夹，不覆盖现有词库）',properties:['openDirectory','createDirectory']});if(location.canceled)return null;
  const root=path.join(location.filePaths[0],`WordDesk-restored-${Date.now()}`);fs.mkdirSync(root);zip.extractAllTo(root,false);const restored=new Store(root);
  // Validate all referenced asset paths before switching the active library.
  for(const w of [...restored.data.words,...restored.data.trash])for(const e of Object.values(w.entries)){for(const f of e.snapshot||[])restored.asset(f);for(const a of e.audio||[])if(a.file)restored.asset(a.file);}
  store=restored;config.root=root;saveConfig();return root;
}
const handlers={
  init:()=>{if(!busy)store.cleanupExpired();return {data:store.data,root:store.root,fields,language:config.language||'zh-CN',unselectedFull:!!config.unselectedFull,unselectedReview:!!config.unselectedReview,examMaskEnabled:config.examMaskEnabled!==false,autoSelectAfterCollect:config.autoSelectAfterCollect!==false,examAnswerPosition:config.examAnswerPosition||'bottom',fontSize:config.fontSize||18,appearance:config.appearance||'light'};},
  workMode:on=>{workMode=!!on;},
  preference:(key,value)=>{if(!((key==='language'&&['zh-CN','en'].includes(value))||(['autoSelectAfterCollect','examMaskEnabled','unselectedFull','unselectedReview'].includes(key)&&typeof value==='boolean')||(key==='examAnswerPosition'&&['top','bottom'].includes(value))))throw new Error('无效设置');config[key]=value;saveConfig();if(key==='language')win.setTitle(uiTranslate('WordDesk · 双词典词库',value));return value;},
  fontSize:value=>{if(!Number.isInteger(value)||value<14||value>24)throw new Error('字号范围为14–24');config.fontSize=value;saveConfig();return value;},
  fullscreen:on=>{win.setFullScreen(!!on);return win.isFullScreen();},
  pdfRegister:file=>new PDFHistory(store).register(file),
  pdfRead:id=>new PDFHistory(store).read(id),
  pdfState:(id,state)=>new PDFHistory(store).update(id,state),
  pdfHistory:()=>store.data.pdfHistory||[],
  pdfRelocate:async id=>{const r=await showOpenDialog({title:'重新定位原 PDF 文件',properties:['openFile'],filters:[{name:'PDF',extensions:['pdf']}]});return r.canceled?null:new PDFHistory(store).relocate(id,r.filePaths[0]);},
  appearance:mode=>{if(!['light','dark'].includes(mode))throw new Error('无效外观模式');config.appearance=mode;saveConfig();win.setBackgroundColor(mode==='dark'?'#181a1b':'#ffffff');return mode;},
  layout:(b,on)=>{bounds=b;visible=!!on;layout();},
  search:async word=>{word=String(word).trim();if(!word||word.length>120)throw new Error('请输入 1–120 个字符的单词或短语');for(const s of Object.keys(views))views[s].webContents.loadURL(urls[s]+encodeURIComponent(word)).catch(err=>status(s,'加载失败：'+err.message));},
  navigate:(s,action)=>{const wc=views[s]?.webContents;if(!wc)throw new Error('无效词典');if(action==='back'&&wc.navigationHistory.canGoBack())wc.navigationHistory.goBack();else if(action==='forward'&&wc.navigationHistory.canGoForward())wc.navigationHistory.goForward();else if(action==='reload')wc.reload();},
  collect:async(source,groups)=>{if(groups!==undefined)store.checkGroups(groups);if(busy)throw new Error('正在保存，请稍候');busy=true;try{const results=[],sources=source==='both'?['mw','cambridge']:[source],snapshots=await Promise.allSettled(sources.map(captureEntry));for(const [index,s]of sources.entries()){if(!views[s])throw new Error('无效词典');try{if(snapshots[index].status==='rejected')throw snapshots[index].reason;results.push(await collect(s,groups,snapshots[index].value));}catch(err){results.push({source:s,error:err.message});}}return results;}finally{busy=false;}},
  update:word=>{if(busy)throw new Error('正在收藏，请稍后再保存修改');store.update(word);},
  groups:groups=>{store.data.groups=[...new Set(groups.map(x=>String(x).trim()).filter(Boolean))];store.save();},
  translate:async(id,source,index,example)=>{if(example!=null)throw new Error('已取消例句自动翻译');const w=store.data.words.find(w=>w.id===id),sense=w?.entries[source]?.senses[index];if(!sense)throw new Error('释义不存在');const input=sense.editedDefinition??sense.definition;const value=await translate(input);const latest=store.data.words.find(w=>w.id===id)?.entries[source]?.senses[index];if(!latest||(latest.editedDefinition??latest.definition)!==input)throw new Error('翻译期间释义发生变化，请重试');latest.autoTranslation=value;store.save();return value;},
  trashWords:ids=>{if(busy)throw new Error('请等待收藏完成');return store.trashWords(ids);},
  removeFromGroup:(ids,group)=>{if(busy)throw new Error('请等待收藏完成');store.removeFromGroup(ids,group);},
  restoreWords:ids=>{if(busy)throw new Error('请等待收藏完成');return store.restoreWords(ids);},
  purgeWords:ids=>{if(busy)throw new Error('请等待收藏完成');return store.purgeWords(ids);},
  repair:async(id,source)=>{if(busy)throw new Error('请等待收藏完成');const w=store.data.words.find(w=>w.id===id),entry=w?.entries[source];if(!entry)throw new Error('词条不存在');const url=allowed(entry.url,source)?entry.url:urls[source]+encodeURIComponent(w.word);busy=true;try{const wc=views[source].webContents;await Promise.race([wc.loadURL(url),new Promise(resolve=>setTimeout(resolve,15000))]);return await collect(source);}finally{busy=false;}},
  retryAudio:async(id,source)=>{if(source==='cambridge')throw new Error('剑桥录音不再下载，请在官网播放');if(busy)throw new Error('正在保存，请稍候');busy=true;try{const e=store.data.words.find(w=>w.id===id)?.entries[source];if(!e)throw new Error('词条不存在');const folder=path.join('assets',crypto.randomUUID());fs.mkdirSync(store.asset(folder),{recursive:true});for(let i=0;i<e.audio.length;i++){try{await downloadAudio(e.audio[i],views[source].webContents,folder,i);}catch(err){e.audio[i].error=err.message;}}e.warnings=e.warnings.filter(s=>!s.includes('段音频下载失败'));const missing=e.audio.filter(a=>!a.file).length;if(missing)e.warnings.push(`${missing} 段音频下载失败，可重试。`);store.save();return missing;}finally{busy=false;}},
  audio:file=>{if(!/\.mp3$/i.test(file))throw new Error('文件类型无效');return 'data:audio/mpeg;base64,'+fs.readFileSync(store.asset(file)).toString('base64');},
  export:async options=>{const words=store.data.words.filter(w=>options.ids.includes(w.id));if(!words.length)throw new Error('没有可导出的单词');const r=await showSaveDialog({defaultPath:'WordDesk-复习词表.xlsx',filters:[{name:'Excel 工作簿',extensions:['xlsx']}]});if(r.canceled)return null;await exportWorkbook(words,options.fields,options.order,r.filePath,config.language||'zh-CN');store.data.exportFields=options.fields;store.data.exportOptions={scope:options.scope,group:options.group,order:options.order,ids:options.ids};store.save();return r.filePath;},
  screenshotStats:()=>screenshotStats(store),
  clearScreenshots:()=>{if(busy)throw new Error('请等待收藏完成');return clearScreenshots(store);},
  cambridgeAudioStats:()=>cambridgeAudioStats(store),
  clearCambridgeAudio:()=>{if(busy)throw new Error('请等待收藏完成');return clearCambridgeAudio(store);},
  deleteGroup:group=>{if(busy)throw new Error('请等待收藏完成');return store.deleteGroup(group);},
  backup,restore,
  location:async()=>{if(busy)throw new Error('请等待收藏结束');const r=await showOpenDialog({title:'选择存储目录（会新建 WordDesk 词库文件夹）',properties:['openDirectory','createDirectory']});if(r.canceled)return null;const root=path.join(r.filePaths[0],`WordDesk-library-${Date.now()}`);if(root.startsWith(store.root+path.sep))throw new Error('请选择当前词库之外的位置');store.save();fs.cpSync(store.root,root,{recursive:true,errorOnExist:true,force:false});store=new Store(root);config.root=root;saveConfig();return root;}
};
app.whenReady().then(()=>{
  if(!hasLock)return;
  configFile=path.join(app.getPath('userData'),'settings.json');if(fs.existsSync(configFile))config=JSON.parse(fs.readFileSync(configFile,'utf8'));store=new Store(config.root||path.join(app.getPath('userData'),'library'));
  ipcMain.handle('desk',async(event,method,...args)=>{if(event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw new Error('非法调用');if(!Object.hasOwn(handlers,method))throw new Error('未知操作');try{return await handlers[method](...args);}catch(e){throw new Error(e.message);}});
  createWindow();
  setInterval(()=>{if(!busy)try{store.cleanupExpired();}catch(e){console.error('Recycle bin cleanup failed:',e.message);}},60000).unref();
}).catch(e=>{dialog.showErrorBox(uiTranslate('WordDesk 启动失败',config.language||'zh-CN'),uiTranslate(e.message,config.language||'zh-CN'));app.quit();});
app.on('window-all-closed',()=>app.quit());
