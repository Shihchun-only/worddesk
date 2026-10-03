const Zip = require('adm-zip');
function readBackup(file, validate) {
  const zip = new Zip(file); let total = 0;
  for (const entry of zip.getEntries()) {
    const name = entry.entryName.replace(/\\/g, '/');
    if (name.startsWith('/') || name.includes(':') || name.split('/').some(part => part === '..') || !(name === 'library.json' || name.startsWith('assets/'))) throw new Error('备份中包含无效路径');
    total += entry.header.size;
    if (total > 5 * 1024 ** 3) throw new Error('备份解压超过 5GB，请联系协助处理');
  }
  validate(JSON.parse(zip.readAsText('library.json')));
  return zip;
}
module.exports = { readBackup };
