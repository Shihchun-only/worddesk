const {test}=require('node:test'),assert=require('node:assert/strict');
const {displayPronunciationGroups}=require('../src/ui/pronunciations.js');
const {reviewPronunciationSource}=require('../src/ui/selection.js');
test('Cambridge display deduplicates across parts of speech but preserves regions, forms, variants and usage notes',()=>{
 const group=(region,value,extra={})=>({form:'obscure',region,pos:'adjective',items:[{value,label:'',suffix:'',...extra}]});
 const entry={source:'cambridge',pronunciationGroups:[group('英式','əbˈskjʊər'),group('美式','əbˈskjʊr'),{...group('英式','əbˈskjʊər'),pos:'verb'},group('美式','əbˈskjʊr'),group('英式','əbˈskjʊər',{label:'also'}),{...group('英式','əbˈskjʊər'),form:'obscured'},group('美式','əbˈskjʊər')]};
 const before=JSON.stringify(entry),groups=displayPronunciationGroups(entry);assert.equal(groups.length,5);assert.deepEqual(groups.slice(0,2).map(g=>g.region),['UK','US']);assert.equal(JSON.stringify(entry),before);assert(groups.some(g=>g.items[0].label==='also'));assert(groups.some(g=>g.form==='obscured'));
});
test('legacy Cambridge pronunciations receive the same region labels and deduplication',()=>{
 const e={source:'cambridge',headword:'a',pronunciations:[{region:'英式',value:'eɪ'},{region:'英式',value:'eɪ'},{region:'美式',value:'eɪ'}]};assert.equal(displayPronunciationGroups(e).length,2);
});
test('missing MW is never replaced by Cambridge in review/exam/export',()=>{
 const cambridge={senses:[{selected:true}],pronunciations:[{value:'test'}]};assert.equal(reviewPronunciationSource({entries:{cambridge}}),null);assert.equal(reviewPronunciationSource({entries:{cambridge,mw:{senses:[],pronunciations:[{value:'mw'}]}}}),'mw');
});
