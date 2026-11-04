// Minimal changed range in the old/new authoritative source. No DOM serialization.
function changedRange(before, after) {
  let start = 0, suffix = 0;
  while (start < Math.min(before.length, after.length) && before[start] === after[start]) start++;
  while (suffix < Math.min(before.length, after.length) - start &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]) suffix++;
  return { start, oldEnd: before.length - suffix, end: after.length - suffix };
}

export class DocumentHistory {
  constructor(limit = 120, delay = 280, {
    setTimer = (callback, ms) => globalThis.setTimeout(callback, ms),
    clearTimer = timer => globalThis.clearTimeout(timer)
  } = {}) {
    this.limit = limit;
    this.delay = delay;
    this.timers = new WeakMap();
    this.setTimer = setTimer; this.clearTimer = clearTimer;
  }

  ensure(doc, source) {
    if (!doc || doc.history?.length) return;
    doc.history = [source ?? ''];
    doc.historyIndex = 0;
  }

  record(doc, source) {
    if (!doc || source == null) return false;
    this.cancel(doc);
    if (doc.history?.[doc.historyIndex] === source) return false;
    doc.history = (doc.history || []).slice(0, (doc.historyIndex ?? -1) + 1);
    doc.history.push(source);
    if (doc.history.length > this.limit) doc.history.shift();
    doc.historyIndex = doc.history.length - 1;
    return true;
  }

  schedule(doc, getSource) {
    if (!doc) return false;
    const source = getSource();
    if (source == null || doc.history?.[doc.historyIndex] === source) return false;
    const before = doc.history?.[doc.historyIndex] ?? '';
    const change = changedRange(before, source);
    const existing = this.timers.get(doc);
    const adjacent = existing && existing.source === before &&
      change.start <= existing.end && change.oldEnd >= existing.start;
    let start = change.start, end = change.end;
    if (adjacent && doc.historyIndex === doc.history.length - 1) {
      doc.history[doc.historyIndex] = source;
      start = Math.min(existing.start, change.start);
      end = Math.max(change.end, existing.end + change.end - change.oldEnd);
      this.clearTimer(existing.timer);
    } else {
      this.record(doc, source);
    }
    const group = { start, end, source, timer: null };
    this.timers.set(doc, group);
    group.timer = this.setTimer(() => {
      if (this.timers.get(doc) === group) this.timers.delete(doc);
    }, this.delay);
    return true;
  }

  restore(doc, delta) {
    if (!doc?.history?.length) return null;
    this.cancel(doc);
    const target = Math.max(0, Math.min(doc.history.length - 1, doc.historyIndex + delta));
    if (target === doc.historyIndex) return null;
    doc.historyIndex = target;
    return doc.history[target];
  }

  cancel(doc) {
    const group = this.timers.get(doc);
    if (group) this.clearTimer(group.timer);
    this.timers.delete(doc);
  }
}
