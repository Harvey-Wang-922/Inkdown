import { revealTextRange, revealSourceMatch } from './search-scroll.js';

export function findTextRanges(value, query, limit = 5000) {
  const text = String(value || '');
  const needle = String(query || '');
  if (!needle) return [];
  const haystack = text.toLocaleLowerCase();
  const normalizedNeedle = needle.toLocaleLowerCase();
  const matches = [];
  let offset = 0;
  while (matches.length < limit) {
    const index = haystack.indexOf(normalizedNeedle, offset);
    if (index < 0) break;
    matches.push({ start: index, end: index + needle.length });
    offset = index + Math.max(1, needle.length);
  }
  return matches;
}

export function replaceTextRanges(value, query, replacement) {
  const text = String(value || '');
  const needle = String(query || '');
  if (!needle) return { value: text, count: 0 };
  const normalizedText = text.toLocaleLowerCase();
  const normalizedNeedle = needle.toLocaleLowerCase();
  const inserted = String(replacement ?? '');
  const parts = [];
  let offset = 0;
  let count = 0;
  while (offset <= text.length) {
    const index = normalizedText.indexOf(normalizedNeedle, offset);
    if (index < 0) break;
    parts.push(text.slice(offset, index), inserted);
    offset = index + needle.length;
    count++;
  }
  if (!count) return { value: text, count: 0 };
  parts.push(text.slice(offset));
  return { value: parts.join(''), count };
}

export class FindNavigator {
  constructor() { this.reset(); }

  reset() {
    this.signature = '';
    this.matches = [];
    this.index = -1;
  }

  update(text, query, scope = '') {
    const signature = `${scope}\u0000${query}\u0000${text}`;
    if (signature === this.signature) return false;
    this.signature = signature;
    this.matches = findTextRanges(text, query);
    this.index = -1;
    return true;
  }

  move(backwards = false) {
    if (!this.matches.length) { this.index = -1; return null; }
    if (this.index < 0) this.index = backwards ? this.matches.length - 1 : 0;
    else this.index = (this.index + (backwards ? -1 : 1) + this.matches.length) % this.matches.length;
    return this.current();
  }

  select(index) {
    if (!this.matches.length) { this.index = -1; return null; }
    const requested = Number(index);
    this.index = Number.isInteger(requested)
      ? Math.max(0, Math.min(this.matches.length - 1, requested))
      : 0;
    return this.current();
  }

  current() { return this.index >= 0 ? this.matches[this.index] : null; }
  status() { return { current: this.index >= 0 ? this.index + 1 : 0, total: this.matches.length }; }
}

export class EditorFindController {
  constructor({ source, visual, pane, isSourceMode }) {
    this.source = source;
    this.visual = visual;
    this.pane = pane || visual.parentElement;
    this.isSourceMode = isSourceMode;
    this.navigator = new FindNavigator();
    this.visualEntries = [];
  }

  reset() {
    this.navigator.reset();
    this.visualEntries = [];
    this.clearVisualHighlights();
  }

  snapshot(query) {
    if (this.isSourceMode()) {
      this.clearVisualHighlights();
      const text = this.source.value;
      this.navigator.update(text, query, 'source');
      return this.navigator.status();
    }
    const { text, entries } = this.buildVisualIndex();
    this.navigator.update(text, query, 'visual');
    this.visualEntries = entries;
    this.renderVisualHighlights();
    return this.navigator.status();
  }

  find(query, { backwards = false, index = null } = {}) {
    this.snapshot(query);
    const match = Number.isInteger(index) ? this.navigator.select(index) : this.navigator.move(backwards);
    if (!match) return this.navigator.status();
    if (this.isSourceMode()) this.selectSource(match);
    else this.selectVisual(match);
    return this.navigator.status();
  }

  restoreCurrent(query) {
    this.snapshot(query);
    const match = this.navigator.current() || this.navigator.move(false);
    if (!match) return false;
    return this.isSourceMode() ? (this.selectSource(match), true) : this.selectVisual(match);
  }

  selectSourceResult(query, result, content) {
    this.snapshot(query);
    // The browser normalizes CRLF/CR in textarea values; the persisted source does not.
    const start = content.slice(0, result.start).replace(/\r\n?/g, '\n').length;
    const end = content.slice(0, result.end).replace(/\r\n?/g, '\n').length;
    const index = this.navigator.matches.findIndex(match => match.start === start && match.end === end);
    if (index < 0) return false;
    this.navigator.select(index);
    this.selectSource(this.navigator.current());
    return true;
  }

  buildVisualIndex() {
    const entries = [];
    const walker = document.createTreeWalker(this.visual, NodeFilter.SHOW_TEXT);
    let text = '';
    let previousBlock = null;
    let node;
    while ((node = walker.nextNode())) {
      if (!node.nodeValue || node.parentElement?.closest('[contenteditable="false"],.document-toc')) continue;
      const block = this.rootBlock(node);
      if (previousBlock && block !== previousBlock) text += '\n';
      const start = text.length;
      text += node.nodeValue;
      entries.push({ node, start, end: text.length });
      previousBlock = block;
    }
    return { text, entries };
  }

  rootBlock(node) {
    const semanticBlock = node.parentElement?.closest?.('p,div,h1,h2,h3,h4,h5,h6,blockquote,li,pre,th,td');
    if (semanticBlock && this.visual.contains(semanticBlock)) return semanticBlock;
    let element = node.parentElement;
    while (element?.parentElement && element.parentElement !== this.visual) element = element.parentElement;
    return element || this.visual;
  }

  visualPoint(offset, end = false) {
    const entry = this.visualEntries.find(item => end ? offset > item.start && offset <= item.end : offset >= item.start && offset < item.end);
    if (!entry) return null;
    return { node: entry.node, offset: Math.max(0, Math.min(entry.node.nodeValue.length, offset - entry.start)) };
  }

  highlightRegistry() {
    return globalThis.CSS?.highlights && typeof globalThis.Highlight === 'function' ? globalThis.CSS.highlights : null;
  }

  clearVisualHighlights() {
    const registry = this.highlightRegistry();
    registry?.delete('inkdown-find-match');
    registry?.delete('inkdown-find-current');
  }

  visualRange(match) {
    const start = this.visualPoint(match.start);
    const end = this.visualPoint(match.end, true);
    if (!start || !end) return null;
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return range;
  }

  renderVisualHighlights() {
    const registry = this.highlightRegistry();
    if (!registry) return;
    registry.delete('inkdown-find-current');
    const ranges = this.navigator.matches.map(match => this.visualRange(match)).filter(Boolean);
    if (ranges.length) registry.set('inkdown-find-match', new Highlight(...ranges));
    else registry.delete('inkdown-find-match');
    const current = this.navigator.current();
    if (current) this.renderCurrentVisualHighlight(current);
  }

  renderCurrentVisualHighlight(match) {
    const registry = this.highlightRegistry();
    if (!registry) return;
    const range = this.visualRange(match);
    if (range) registry.set('inkdown-find-current', new Highlight(range));
    else registry.delete('inkdown-find-current');
  }

  selectVisual(match) {
    const range = this.visualRange(match);
    if (!range) return false;
    this.visual.focus({ preventScroll: true });
    const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    this.renderCurrentVisualHighlight(match);
    revealTextRange(range, this.pane);
    return true;
  }

  selectSource(match) {
    this.source.focus({ preventScroll: true });
    this.source.setSelectionRange(match.start, match.end);
    revealSourceMatch(this.source, match, this.pane);
  }
}
