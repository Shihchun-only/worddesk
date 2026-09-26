const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),Excel=require('exceljs');
const {translate}=require('../src/ui/i18n.js'),{exportWorkbook}=require('../src/export.cjs');
test('UI translation preserves names and paths in dynamic messages and keeps Chinese unchanged',()=>{
  assert.equal(translate('我的词库','en'),'My Vocabulary');assert.equal(translate('我的词库','zh-CN'),'我的词库');
  assert.equal(translate('删除分组“设置”？','en'),'Delete group “设置”?');
  assert.equal(translate('上次：设置、复习','en'),'Last Used: 设置、复习');
  assert.equal(translate('已导出：C:\\复习\\设置.xlsx','en'),'Exported: C:\\复习\\设置.xlsx');
  assert.equal(translate('第 2 / 5 题 ','en'),'Question 2 / 5 ');
  assert.equal(translate('仅未选释义 · 4','en'),'Only unselected · 4');
});
test('English export localizes new column headings only; definitions and notes remain original',async()=>{
  const e=JSON.parse(fs.readFileSync('fixtures/go-mw-v3.json'));e.senses=e.senses.slice(0,1);Object.assign(e.senses[0],{selected:true,definition:'原文设置',translation:'保存'});const words=[{word:'word',createdAt:'2026-09-22',notes:'设置',entries:{mw:e}}],dir=fs.mkdtempSync(path.join(os.tmpdir(),'language-export-'));
  for(const language of ['en','zh-CN']){const file=path.join(dir,language+'.xlsx');await exportWorkbook(words,['word','meaning','notes'],'time',file,language);const book=new Excel.Workbook();await book.xlsx.readFile(file);const sheet=book.worksheets[0];assert.equal(sheet.getCell('A1').text,language==='en'?'Word':'单词');assert.equal(sheet.getCell('B1').text,language==='en'?'Definition':'释义');assert.match(sheet.getCell('B2').text,/原文设置/);assert.equal(sheet.getCell('C2').text,'设置');}
});
