const pendingWordSaves = new Map();
let selectionSaveError = false;
let readingSaveError = false;
let activeAudioJobs = [];

function updateSaveNotice(message = '') {
  const box = document.querySelector('#save-notice');
  box.classList.toggle('hidden', !pendingWordSaves.size && !selectionSaveError && !readingSaveError && !message);
  box.querySelector('span').textContent = message || (readingSaveError?'阅读位置尚未保存，请重试保存':'尚未保存。修改仍保留在当前窗口，请重试保存。');
}
async function ensureSaved() {
  await saveQueue;
  if (pendingWordSaves.size) {
    updateSaveNotice();
    throw new Error('请先重试保存，当前修改尚未写入词库');
  }
}
async function retryPendingSaves() {
  await saveQueue;
  for (const [id, snapshot] of pendingWordSaves) {
    await api('update', snapshot);
    if (pendingWordSaves.get(id) === snapshot) pendingWordSaves.delete(id);
  }
  if (selectionSaveError && selectionDraft) await saveSelection();
  await api('flushPDF');
  readingSaveError=false;updateSaveNotice();
  toast('保存成功');
}
function renderAudioJobs() {
  const box = $('#audio-progress');
  box.classList.toggle('hidden', !activeAudioJobs.length);
  box.querySelector('span').textContent = '文字已保存，录音正在后台下载';
}
function bindReliability() {
  window.desk.onSaveStatus(event=>{if(event.kind==='reading'){readingSaveError=!!event.error;updateSaveNotice();}});
  $('#retry-save').onclick = () => run(retryPendingSaves);
  $('#skip-audio').onclick = () => run(async () => { await api('skipAudio'); });
  window.desk.onAudio(event => {
    if (event.root !== root) return;
    activeAudioJobs = activeAudioJobs.filter(job => job.id !== event.id);
    if (event.state === 'downloading') activeAudioJobs.push(event);
    renderAudioJobs();
    if (event.state === 'failed') toast('部分录音未下载成功，可在词条中重试；文字已保存。');
    if (event.state === 'complete') toast('录音已下载，下次打开词条即可播放。');
    // Never rebuild a detail view while the user is typing or choosing senses.
  });
  $('#automatic-backups').onclick = () => run(async () => {
    const backups = await api('autoBackups');
    const list = $('#backup-list');
    list.innerHTML = backups.length ? backups.map(item => `<div class="backup-row"><span translate="no">${esc(new Date(item.time).toLocaleString())} · ${item.words}</span><button data-checkpoint="${esc(item.name)}">恢复此版本</button></div>`).join('') : '<p>暂时没有自动备份，保存词条后会自动建立。</p>';
    $('#backup-dialog').showModal();
    list.querySelectorAll('[data-checkpoint]').forEach(button => button.onclick = () => run(async () => {
      await ensureSaved();
      if (!await confirmOperation('恢复自动备份？', '恢复到新词库目录，当前词库保留。录音与阅读记录使用当前目录中的文件。', '恢复')) return;
      button.disabled = true;
      try {
        const location = await api('restoreCheckpoint', button.dataset.checkpoint);
        activeId = null; await refresh(); renderTrash(); $('#backup-dialog').close();
        toast('已恢复并切换词库：' + location);
      } finally { button.disabled = false; }
    }));
  });
}
