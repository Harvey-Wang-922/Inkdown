export class DocumentHistory {
  constructor(limit = 120, delay = 280) {
    this.limit = limit;
    this.delay = delay;
    this.timers = new WeakMap();
  }

  ensure(doc, source) {
    if (!doc || doc.history?.length) return;
    doc.history = [source ?? ''];
    doc.historyIndex = 0;
  }

  record(doc, source) {
    if (!doc || source == null) return false;
    if (doc.history?.[doc.historyIndex] === source) return false;
    doc.history = (doc.history || []).slice(0, (doc.historyIndex ?? -1) + 1);
    doc.history.push(source);
    if (doc.history.length > this.limit) doc.history.shift();
    doc.historyIndex = doc.history.length - 1;
    return true;
  }

  schedule(doc, getSource) {
    const source = getSource();
    const existing = this.timers.get(doc);
    if (existing && doc.historyIndex === doc.history.length - 1) {
      doc.history[doc.historyIndex] = source;
      clearTimeout(existing);
    } else {
      this.record(doc, source);
    }
    this.timers.set(doc, setTimeout(() => {
      this.timers.delete(doc);
    }, this.delay));
  }

  restore(doc, delta) {
    if (!doc?.history?.length) return null;
    const target = Math.max(0, Math.min(doc.history.length - 1, doc.historyIndex + delta));
    if (target === doc.historyIndex) return null;
    doc.historyIndex = target;
    return doc.history[target];
  }

  cancel(doc) {
    const timer = this.timers.get(doc);
    if (timer) clearTimeout(timer);
    this.timers.delete(doc);
  }
}
