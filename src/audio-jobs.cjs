// A bounded queue. Jobs hold a store reference so switching libraries cannot
// redirect an in-flight download into the new library.
class AudioJobs {
  constructor(download, notify = () => {}, concurrency = 2) {
    this.download = download; this.notify = notify; this.concurrency = concurrency;
    this.jobs = new Map(); this.pending = []; this.running = 0;
  }
  key(store, id, source) { return `${store.root}\0${id}\0${source}`; }
  enqueue(store, id, source = 'mw') {
    const key = this.key(store, id, source);
    const entry = store.data.words.find(w => w.id === id)?.entries[source];
    const existing=this.jobs.get(key);
    if(existing?.capturedAt===entry?.capturedAt)return existing;
    if(existing)existing.controller.abort();
    if (!entry || source !== 'mw' || !entry.audio.some(a => !a.file)) return null;
    const job = { key, store, id, source, capturedAt: entry.capturedAt, controller: new AbortController(), left: 0, failed: 0 };
    this.jobs.set(key, job);
    entry.audio.forEach((audio, index) => { if (!audio.file) { job.left++; this.pending.push({ job, audio: { ...audio }, index }); } });
    this.emit(job, 'downloading'); this.pump(); return job;
  }
  emit(job, state) { this.notify({ id: job.id, root: job.store.root, state, remaining: job.left, failed: job.failed }); }
  cancel(store, id) {
    for (const job of this.jobs.values()) if (job.store === store && (!id || job.id === id)) {
      job.controller.abort(); this.emit(job, 'skipped');
    }
  }
  active(store) { return [...this.jobs.values()].filter(j => j.store === store).map(j => ({ id: j.id, remaining: j.left, failed: j.failed })); }
  async task({ job, audio, index }) {
    try {
      if (job.controller.signal.aborted) return;
      await this.download(audio, job, index);
      if (job.controller.signal.aborted) return;
      const entry = job.store.data.words.find(w => w.id === job.id)?.entries[job.source];
      if (!entry || entry.capturedAt !== job.capturedAt) return;
      const current = entry.audio.find(a => a.url === audio.url);
      if (current) { current.file = audio.file; delete current.error; job.store.save(); }
    } catch (error) {
      if (!job.controller.signal.aborted) {
        job.failed++;
        const entry = job.store.data.words.find(w => w.id === job.id)?.entries[job.source];
        if (entry?.capturedAt === job.capturedAt) {
          const current = entry.audio.find(a => a.url === audio.url);
          if (current) current.error = error.message;
          try { job.store.save(); } catch { /* report failure; the word text is already durable */ }
        }
      }
    } finally {
      job.left--;
      if (!job.left && this.jobs.get(job.key)===job) this.jobs.delete(job.key);
      this.emit(job, job.controller.signal.aborted ? 'skipped' : job.left ? 'downloading' : job.failed ? 'failed' : 'complete');
    }
  }
  pump() {
    while (this.running < this.concurrency && this.pending.length) {
      this.running++;
      this.task(this.pending.shift()).finally(() => { this.running--; this.pump(); });
    }
  }
}
module.exports = { AudioJobs };
