const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Keep known-good previous versions; never rotate an unreadable current file.
function snapshots(file, validate = () => {}) {
  const folder = file + '.backups';
  if (!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter(n => /^\d+-[a-f0-9]+\.json$/.test(n)).sort().reverse().flatMap(name => {
    try {
      const full = path.join(folder, name), data = JSON.parse(fs.readFileSync(full, 'utf8'));
      validate(data);
      return [{ name, time: Number(name.split('-')[0]), data }];
    } catch { return []; }
  });
}

function checkpoint(file, validate = () => {}, force = false) {
  if (!fs.existsSync(file)) return;
  const text = fs.readFileSync(file, 'utf8');
  validate(JSON.parse(text));
  const previous = snapshots(file, validate);
  if (previous.length && JSON.stringify(previous[0].data) === JSON.stringify(JSON.parse(text))) return;
  if (!force && previous.length && Date.now() - previous[0].time < 15 * 60 * 1000) return;
  const folder = file + '.backups';
  fs.mkdirSync(folder, { recursive: true });
  const time = Math.max(Date.now(), (previous[0]?.time || 0) + 1);
  fs.writeFileSync(path.join(folder, `${time}-${crypto.randomBytes(6).toString('hex')}.json`), text, { flag: 'wx' });
  for (const item of snapshots(file, validate).slice(5)) fs.unlinkSync(path.join(folder, item.name));
}

function atomicJSON(file, data, { validate = () => {}, backup = true } = {}) {
  validate(data);
  const tmp = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
  try {
    const first = !fs.existsSync(file);
    if (backup) checkpoint(file, validate);
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    if (backup && first) {
      const folder = file + '.backups';
      fs.mkdirSync(folder, { recursive: true });
      fs.copyFileSync(tmp, path.join(folder, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.json`));
    }
    fs.renameSync(tmp, file);
  } finally {
    if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  }
}

function recoverJSON(file, name, validate = () => {}) {
  const item = snapshots(file, validate).find(x => x.name === name);
  if (!item) throw new Error('备份不存在或已损坏');
  // Preserve the damaged original for manual recovery, even when parsing fails.
  if (fs.existsSync(file)) fs.copyFileSync(file, file + `.unreadable-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`);
  atomicJSON(file, item.data, { validate, backup: false });
  return item.data;
}

module.exports = { atomicJSON, checkpoint, snapshots, recoverJSON };
