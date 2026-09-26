const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('../src/ui/exam-model.js');
test('exam grading normalizes case, whitespace and quotes but requires exact spelling/hyphens',()=>{
 for(const [input,answer]of [[' GO ','go'],['go   away','go away'],['DON’T','don\'t'],['“word”','"word"']])assert.equal(E.checkExamAnswer(E.newExamResult('a'),input,answer),'correct');
 for(const input of ['went','going','g o','-go'])assert.equal(E.checkExamAnswer(E.newExamResult('a'),input,'go'),'wrong');
 assert.equal(E.checkExamAnswer(E.newExamResult('a'),'well known','well-known'),'wrong');
 const r=E.newExamResult('a');assert.equal(E.checkExamAnswer(r,'  ','go'),'empty');assert.equal(r.attempts,0);
 assert.equal(E.checkExamAnswer(r,'goo','go'),'wrong');assert.equal(E.checkExamAnswer(r,'go','go'),'correct');assert.equal(r.firstCorrect,false);assert.equal(r.attempts,2);assert.equal(E.checkExamAnswer(r,'go','go'),'done');assert.equal(r.attempts,2);
});
test('masking respects whole words, punctuation, phrases, quote forms and regex metacharacters',()=>{
 assert.equal(E.maskAnswer('Go, go! going undergo go.','go'),'______, ______! ______ undergo ______.');
 assert.equal(E.maskAnswer('go   away now','go away'),'______ now');assert.equal(E.maskAnswer('don’t do it',"don't"),'______ do it');assert.equal(E.maskAnswer('C++ language','C++'),'______ language');
});

test('exam masks related forms and explicit supplements without treating similar spelling as related or accepting them as answers',()=>{
 const text='Scarce scarcely scarcity scarcities scarcer scarcest scarce-related scared scarf';
 assert.equal(E.maskAnswer(text,'scarce'),'______ ______ ______ ______ ______ ______ ______-related scared scarf');
 assert.equal(E.maskAnswer('happiness happily happier happy','happy'),'______ ______ ______ ______');
 assert.equal(E.maskAnswer('running runner runs outrun','run'),'______ ______ ______ outrun');
 assert.equal(E.maskAnswer('scarce shortage lack of food feedback','scarce',['shortage','lack of food']),'______ ______ ______ feedback');
 assert.equal(E.maskAnswer('x+y xxy scarce','scarce',['x+y']),'______ xxy ______');
 assert.equal(E.maskAnswer('scarcity scarce scarcely','scarcity'),'______ ______ ______');
 assert.equal(E.checkExamAnswer(E.newExamResult('scarce'),'scarcity','scarce'),'wrong');
 assert.equal(text,'Scarce scarcely scarcity scarcities scarcer scarcest scarce-related scared scarf');
});
test('exam queue filters groups and selected definitions without mutating the library',()=>{
 const words=[{id:'b',word:'b',createdAt:'2',groups:['X'],entries:{mw:{senses:[{selected:true}]}}},{id:'a',word:'a',createdAt:'1',groups:['Y'],entries:{cambridge:{senses:[{selected:true}]}}},{id:'c',word:'c',createdAt:'3',groups:['X'],entries:{mw:{senses:[{selected:false}]}}}];
 const before=JSON.stringify(words);assert.deepEqual(E.examQueue(words,'X','time'),{ids:['b'],omitted:1});assert.deepEqual(E.examQueue(words,'','alpha').ids,['a','b']);assert.deepEqual(E.examQueue(words,'','random').ids.sort(),['a','b']);assert.equal(JSON.stringify(words),before);
});
test('results count words rather than attempts and retry includes wrong, skipped, revealed and hinted words',()=>{
 const results=Array.from({length:5},(_,i)=>E.newExamResult(String(i)));E.checkExamAnswer(results[0],'go','go');E.checkExamAnswer(results[1],'no','go');E.checkExamAnswer(results[1],'no','go');E.checkExamAnswer(results[1],'go','go');results[2].revealed=true;results[3].skipped=true;results[4].hinted=true;E.checkExamAnswer(results[4],'go','go');
 assert.deepEqual(E.examStats(results),{firstCorrect:1,wrong:1,revealed:1,skipped:1,hinted:1});assert.deepEqual(results.filter(E.needsPractice).map(r=>r.id),['1','2','3','4']);
});

test('general morphology covers unseen word families, reverse forms and irregulars without substring matching',()=>{
 for(const [answer,terms] of [['obscure','obscurity obscurely'],['kind','kindness kindly'],['beauty','beautiful beauties'],['work','worked working workers'],['child','children'],['write','wrote written writing'],['study','studies studying studied'],['navigation','navigate navigating'],['scarcity','scarcities scarce']])for(const term of terms.split(' '))assert.equal(E.maskAnswer(term,answer),'______',answer+' -> '+term);
 assert.equal(E.maskAnswer('government undergo goal','go'),'government undergo goal');
 assert.equal(E.maskAnswer('run2 2run rerun','run'),'run2 2run rerun');
});
