const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const {launch}=require('./ui-harness.cjs');
(async()=>{
 const release=path.resolve('dist','WordDesk-'+require('../package.json').version+'-win32-x64','resources','app');
 const about=spawnSync(process.execPath,['scripts/about-ui-test.cjs'],{stdio:'inherit',env:{...process.env,WORDDESK_RELEASE:release}});if(about.status!==0)throw new Error('Packaged About suite failed');
 const result=spawnSync(process.execPath,['scripts/current-ui-test.cjs'],{stdio:'inherit',env:{...process.env,WORDDESK_RELEASE:release}});if(result.status!==0)throw new Error('Packaged UI suite failed');
 const recovery=spawnSync(process.execPath,['scripts/recovery-ui-test.cjs'],{stdio:'inherit',env:{...process.env,WORDDESK_RELEASE:release}});if(recovery.status!==0)throw new Error('Packaged recovery suite failed');
 const app=await launch({release});try{assert.equal(await app.ui('data.words.length'),0);assert.equal(await app.mainEval("require('electron').app.getVersion()"),require('../package.json').version);assert.equal(await app.ui('page'),'work');console.log('PACKAGED EXE STARTUP PASSED');}finally{await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
