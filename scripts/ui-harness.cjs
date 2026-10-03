const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

async function connect(url) {
  const socket = new WebSocket(url), pending = new Map(), events = new Map(); let id = 0;
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = event => {
    const message = JSON.parse(event.data), item = pending.get(message.id);
    if (events.has(message.method)) { events.get(message.method)(message.params); events.delete(message.method); }
    if (!item) {if(message.method==='Runtime.exceptionThrown')console.error('RENDERER ERROR',JSON.stringify(message.params));return;}
    clearTimeout(item.timer); pending.delete(message.id);
    message.error ? item.reject(new Error(JSON.stringify(message.error))) : item.resolve(message.result);
  };
  return {
    close: () => socket.close(),
    once: method => new Promise(resolve => events.set(method, resolve)),
    send: (method, params = {}) => new Promise((resolve, reject) => {
      const serial = ++id;
      const timer = setTimeout(() => { pending.delete(serial); reject(new Error('Timed out: ' + method)); }, 30000);
      pending.set(serial, { resolve, reject, timer }); socket.send(JSON.stringify({ id: serial, method, params }));
    })
  };
}
async function evaluate(client, expression, awaitPromise = true) {
  const result = await client.send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function wait(fn, label = 'loaded UI', timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { if (await fn()) return; await new Promise(resolve => setTimeout(resolve, 50)); }
  throw new Error('Timed out waiting for ' + label);
}
async function launch({ profile = fs.mkdtempSync(path.join(os.tmpdir(), 'worddesk-ui-')), release = process.env.WORDDESK_RELEASE, beforeStart } = {}) {
  const env = { ...process.env, WORDDESK_TEST_DATA: profile }; delete env.ELECTRON_RUN_AS_NODE;
  const exe = release ? path.resolve(release, '../../WordDesk.exe') : require('electron');
  const args = [beforeStart ? '--inspect-brk=0' : '--inspect=0', '--remote-debugging-port=0', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-background-timer-throttling']; if (!release) args.push('.');
  const child = spawn(exe, args, { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let main, renderer; const connections = [];
  const close = async () => {
    if (main) await evaluate(main, "require('electron').BrowserWindow.getAllWindows().forEach(w=>w.destroy());true").catch(() => {});
    for (const connection of connections) connection.close();
    if (child.exitCode === null) child.kill();
  };
  try {
    const endpoints = await new Promise((resolve, reject) => {
      let log = '', preparing = false, prepared = !beforeStart;
      const timer = setTimeout(() => reject(new Error('Startup timeout: ' + log)), 30000);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); reject(new Error('Exited before startup: ' + code + '\n' + log)); });
      child.stderr.on('data', chunk => {
        log += chunk;
        const node = log.match(/Debugger listening on (ws:\/\/[^\s]+)/), browser = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (beforeStart && node && !preparing) {
          preparing = true;
          (async () => {
            main = await connect(node[1]); connections.push(main);
            await main.send('Runtime.enable'); await main.send('Debugger.enable');
            const paused = main.once('Debugger.paused'); await main.send('Runtime.runIfWaitingForDebugger'); await paused;
            await evaluate(main, "globalThis.require=process.getBuiltinModule('node:module').createRequire(process.cwd()+'/package.json');true", false);
            await beforeStart(expression => evaluate(main, expression, false));
            await main.send('Debugger.resume'); prepared = true;
            const browser = log.match(/DevTools listening on (ws:\/\/[^\s]+)/);
            if (browser) { clearTimeout(timer); resolve({ node: node[1], browser: browser[1] }); }
          })().catch(error => { clearTimeout(timer); reject(error); });
        }
        if (node && browser && prepared) { clearTimeout(timer); resolve({ node: node[1], browser: browser[1] }); }
      });
    });
    if (!main) { main = await connect(endpoints.node); connections.push(main); await evaluate(main,"globalThis.require=process.getBuiltinModule('node:module').createRequire(process.cwd()+'/package.json');true"); }
    const base = 'http://' + new URL(endpoints.browser).host;
    let target;
    await wait(async () => { target = (await (await fetch(base + '/json/list')).json()).find(t => /\/ui\/index.html$/.test(t.url)); return target; }, 'main document');
    renderer = await connect(target.webSocketDebuggerUrl); connections.push(renderer);await renderer.send('Runtime.enable');
    try{await wait(() => evaluate(renderer, "document.body?.dataset.ready==='true'"), 'application ready');}catch(e){console.error(await evaluate(renderer, "({toast:document.querySelector('#toast')?.textContent,body:document.body?.innerText,ready:document.readyState,app:typeof appReady})"));throw e;}
    await evaluate(renderer, "window.testErrors=[];window.addEventListener('error',e=>testErrors.push(e.message));window.addEventListener('unhandledrejection',e=>testErrors.push(String(e.reason)));true");
    return {
      profile, main, renderer,
      ui: expression => evaluate(renderer, expression),
      mainEval: expression => evaluate(main, expression),
      waitUI: (expression, label) => wait(() => evaluate(renderer, '!!(' + expression + ')'), label),
      screenshot: async file => { const shot = await renderer.send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(shot.data, 'base64')); },
      close
    };
  } catch (error) { for (const connection of connections) connection.close(); if(child.exitCode===null)child.kill(); throw error; }
}
module.exports = { launch, wait, evaluate };
