export class SourceDocumentEngine {
  constructor(decodeProjection, onCommit = null) {
    this.decodeProjection = decodeProjection;
    this.onCommit = onCommit;
  }

  commitSource(doc, source, markDirty = true, origin = 'source') {
    if (!doc || doc.content === source) return false;
    doc.content = source;
    doc.sourceRevision = (doc.sourceRevision || 0) + 1;
    doc.lastTransaction = { revision: doc.sourceRevision, origin };
    if (markDirty) doc.dirty = true;
    this.onCommit?.(doc);
    return true;
  }

  commitRenderedEdit(doc, html, markDirty = false) {
    if (!doc || html == null) return false;
    return this.commitSource(doc, this.decodeProjection(html), markDirty, 'rendered-edit');
  }
}
