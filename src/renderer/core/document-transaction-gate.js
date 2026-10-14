export class DocumentTransactionGate {
  constructor(getDocument, getMode = () => null, getProjectionEpoch = () => null) {
    this.getDocument = getDocument;
    this.getMode = getMode;
    this.getProjectionEpoch = getProjectionEpoch;
  }

  capture() {
    const doc = this.getDocument();
    if (!doc) return null;
    return {
      documentId: doc.id,
      sourceRevision: doc.sourceRevision || 0,
      mode: this.getMode(),
      projectionEpoch: this.getProjectionEpoch()
    };
  }

  isCurrent(transaction, { revision = true, mode = true, projection = true } = {}) {
    if (!transaction) return false;
    const doc = this.getDocument();
    return Boolean(doc
      && doc.id === transaction.documentId
      && (!revision || (doc.sourceRevision || 0) === transaction.sourceRevision)
      && (!mode || this.getMode() === transaction.mode)
      && (!projection || this.getProjectionEpoch() === transaction.projectionEpoch));
  }

  refresh(transaction) {
    const current = this.capture();
    if (!transaction || !current || current.documentId !== transaction.documentId) return false;
    Object.assign(transaction, current);
    return true;
  }
}
