const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {launch}=require('./ui-harness.cjs');
const version=require('../package.json').version;
(async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'worddesk-about-'));
 fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify({language:'en',lastPage:'library'}));
 let app=await launch({profile});
 try{
  assert.equal(await app.ui("document.querySelector('#about-dialog').open"),true);
  assert.equal(await app.ui("document.querySelector('#about-title').textContent"),'What’s New');
  assert.equal(await app.ui("document.querySelector('#about-version').textContent"),'WordDesk · v'+version);
  assert.equal(await app.ui("document.querySelector('aside').textContent.includes('v'+"+JSON.stringify(version)+")"),false);
  await app.ui("api('copyVersion')");
  assert((await app.mainEval("require('electron').clipboard.readText()")).includes(version));
  await app.ui("closeAbout()");assert.equal(await app.ui("document.querySelector('#about-dialog').open"),false);
  await app.close();app=await launch({profile});
  assert.equal(await app.ui("document.querySelector('#about-dialog').open"),false);
  await app.ui("go('settings');");
  assert.equal(await app.ui("!!document.querySelector('#page-settings #open-about')"),true);
  await app.ui("document.querySelector('#open-about').click()");await app.waitUI("document.querySelector('#about-dialog').open",'settings opens about');
  assert.equal(await app.ui("document.querySelector('#about-title').textContent"),'About & Updates');
  await app.ui("api('preference','language','zh-CN').then(()=>refresh())");
  assert.equal(await app.ui("document.querySelector('#about-title').textContent"),'关于与更新');
  await app.mainEval("require('electron').BrowserWindow.getAllWindows()[0].setSize(1000,680);true");
  await app.ui("document.getAnimations().forEach(a=>a.finish())");
  await app.screenshot(path.join(profile,'about.png'));
  await app.ui("document.querySelector('#about-dialog').dispatchEvent(new Event('cancel',{cancelable:true}))");
  await app.waitUI("!document.querySelector('#about-dialog').open",'Escape closes dialog');
  assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'settings.json'))).lastSeenVersion,version);
  await app.close();
  const cfg=JSON.parse(fs.readFileSync(path.join(profile,'settings.json')));cfg.lastSeenVersion='0.19.0';fs.writeFileSync(path.join(profile,'settings.json'),JSON.stringify(cfg));
  app=await launch({profile});assert.equal(await app.ui("document.querySelector('#about-dialog').open"),true);
  await app.ui('closeAbout()');await app.close();
  app=await launch();assert.equal(await app.ui("document.querySelector('#about-dialog').open"),false);
  assert.equal(await app.mainEval("require('electron').app.getVersion()"),version);
  console.log('PASS version, upgrade notice, dismissal/restart, Settings, localization, copy and fresh install; '+profile);
 }finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
