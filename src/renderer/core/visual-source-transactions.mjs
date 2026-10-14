function fingerprint(node) {
  if (node.getAttribute('class') !== '' && !node.classList.contains('md-focus') && !node.classList.contains('md-focus-parent')) return node.outerHTML;
  const copy = node.cloneNode(true);
  copy.classList.remove('md-focus', 'md-focus-parent');
  if (!copy.className) copy.removeAttribute('class');
  return copy.outerHTML;
}

function editableNodes(root) {
  return [...root.childNodes].flatMap(node => {
    if (node.nodeType === 1) return [node];
    if (node.nodeType !== 3 || !node.nodeValue.trim()) return [];
    const paragraph = root.ownerDocument.createElement('p');
    paragraph.append(node.cloneNode(true));
    return [paragraph];
  });
}

// A verified one-to-one projection baseline, never a guessed Markdown text match.
export class VisualSourceTransactions {
  constructor(decode) { this.decode = decode; this.baseline = null; }
  capture(doc, root, spans) {
    const nodes = [...root.children];
    this.baseline = spans && spans.length === nodes.length && spans.every((span, index) =>
      span.tag === nodes[index].tagName && span.start >= 0 && span.end >= span.start && span.end <= doc.content.length)
      ? { id: doc.id, source: doc.content, spans, fingerprints: nodes.map(fingerprint) } : null;
  }
  source(doc, root) {
    const baseline = this.baseline;
    if (!baseline || baseline.id !== doc.id || baseline.source !== doc.content) {
      this.baseline = null;
      this.origin = 'rendered-edit';
      return this.decode(root.innerHTML);
    }
    this.origin = 'visual-source-range';
    const nodes = editableNodes(root), fingerprints = nodes.map(fingerprint);
    let prefix = 0, suffix = 0;
    while (prefix < Math.min(nodes.length, baseline.spans.length) && fingerprints[prefix] === baseline.fingerprints[prefix]) prefix++;
    while (suffix < Math.min(nodes.length, baseline.spans.length) - prefix &&
      fingerprints[nodes.length - suffix - 1] === baseline.fingerprints[baseline.spans.length - suffix - 1]) suffix++;
    if (prefix === nodes.length && prefix === baseline.spans.length) return doc.content;
    const oldEnd = baseline.spans.length - suffix, newEnd = nodes.length - suffix;
    const start = baseline.spans[prefix]?.start ?? baseline.spans.at(-1)?.end ?? 0;
    const end = oldEnd > prefix ? baseline.spans[oldEnd - 1].end : start;
    const pieces = nodes.slice(prefix, newEnd).map(node => this.decode(node.outerHTML));
    // New adjacent blocks need explicit separation, while existing gaps remain bytes.
    const leading = oldEnd === prefix && prefix > 0 ? '\n\n' : '';
    const trailing = oldEnd === prefix && suffix > 0 ? '\n\n' : '';
    const replacement = leading + pieces.join('\n\n') + trailing;
    const source = doc.content.slice(0, start) + replacement + doc.content.slice(end);
    const shift = replacement.length - (end - start);
    let position = start + leading.length;
    const added = nodes.slice(prefix, newEnd).map((node, index) => {
      const span = { start: position, end: position + pieces[index].length, tag: node.tagName };
      position = span.end + 2;
      return span;
    });
    this.baseline = { id: doc.id, source, fingerprints, spans: [
      ...baseline.spans.slice(0, prefix), ...added,
      ...baseline.spans.slice(oldEnd).map(span => ({ ...span, start: span.start + shift, end: span.end + shift }))
    ] };
    return source;
  }
  preview(doc, root) {
    const baseline = this.baseline;
    try { return this.source(doc, root); }
    finally { this.baseline = baseline; }
  }
}
