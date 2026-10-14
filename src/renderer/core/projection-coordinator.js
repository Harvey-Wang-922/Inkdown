export class ProjectionCoordinator {
  constructor(getActiveDocumentId, getContext = null) {
    this.getActiveDocumentId = getActiveDocumentId;
    this.getContext = getContext;
    this.revision = 0;
    this.loading = false;
  }

  begin(documentId) {
    const operation = { revision: ++this.revision, documentId: documentId || null, context: this.getContext?.() };
    this.loading = Boolean(operation.documentId);
    return operation;
  }

  isCurrent(operation) {
    return Boolean(operation
      && operation.revision === this.revision
      && (operation.documentId || null) === (this.getActiveDocumentId() || null)
      && (!this.getContext || operation.context === this.getContext()));
  }

  finish(operation) {
    if (!this.isCurrent(operation)) return false;
    this.loading = false;
    return true;
  }

  release(operation) {
    if (operation?.revision === this.revision) this.loading = false;
  }

  invalidate() {
    this.revision++;
    this.loading = false;
  }
}
