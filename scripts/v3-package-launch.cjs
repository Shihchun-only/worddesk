const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
async function connect(url){
 const socket=new WebSocket(url);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});let id=0;const pending=new Map();
 socket.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(!p)return;clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(new Error(JSON.stringify(m.error))):p.resolve(m.result);};
 return {close:()=>socket.close(),send:(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(new Error('Timeout '+method));},15000);pending.set(n,{resolve,reject,timer});socket.send(JSON.stringify({id:n,method,params}));})};
}
async function evaluate(client,expression){const r=await client.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,includeCommandLineAPI:true});if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-release-'));
 const env={...process.env,WORDDESK_TEST_DATA:profile};delete env.ELECTRON_RUN_AS_NODE;
 const exe=path.resolve(`dist/WordDesk-${require('../package.json').version}-win32-x64/WordDesk.exe`);
 const child=spawn(exe,['--inspect=0','--remote-debugging-port=0'],{env,windowsHide:true,stdio:['ignore','pipe','pipe']});let main,renderer;
 try{
  const endpoints=await new Promise((resolve,reject)=>{let log='';const timer=setTimeout(()=>reject(new Error(log||'Startup timeout')),30000);child.stderr.on('data',b=>{log+=b;const n=log.match(/Debugger listening on (ws:\/\/[^\s]+)/),r=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(n&&r){clearTimeout(timer);resolve({main:n[1],browser:r[1]});}});child.once('error',reject);});
  main=await connect(endpoints.main);await main.send('Runtime.enable');
  const version=await evaluate(main,"require('electron').app.getVersion()");assert.equal(version,require('../package.json').version);
  const base='http://'+new URL(endpoints.browser).host;let target;
  for(let i=0;i<30&&!target;i++){target=(await(await fetch(base+'/json/list')).json()).find(t=>t.url.includes('/ui/index.html'));if(!target)await new Promise(r=>setTimeout(r,100));}
  assert(target);renderer=await connect(target.webSocketDebuggerUrl);await renderer.send('Runtime.enable');
  for(let i=0;i<50;i++){if(await evaluate(renderer,"document.readyState==='complete' && typeof bindManagement==='function'"))break;await new Promise(r=>setTimeout(r,100));}
  const state=await evaluate(renderer,"window.desk.invoke('init')");assert.equal(state.data.words.length,0);assert.deepEqual(state.data.trash,[]);
  assert(await evaluate(renderer,"typeof bindManagement==='function' && typeof pronunciationSlash==='function' && !!document.querySelector('#collection-dialog')"));
  await evaluate(renderer,"go('library')");assert(await evaluate(renderer,"!document.querySelector('#page-library').classList.contains('hidden') && !!document.querySelector('#delete-selected')"));
  console.log('PACKAGED EXE PASSED: standalone executable starts, initializes an isolated library and loads the new interface.');
 }finally{
  if(main){await evaluate(main,"require('electron').app.quit();true").catch(()=>{});main.close();}renderer?.close();
  // Only this test-owned process is stopped if a debugger keeps it alive after quitting.
  if(child.exitCode===null)child.kill();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});

