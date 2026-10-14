export class DocumentSaveCoordinator {
  constructor() {
    this.tails = new WeakMap();
    this.epochs = new WeakMap();
  }

  epoch(doc) {
    return this.epochs.get(doc) || 0;
  }

  isCurrent(doc, epoch) {
    return Boolean(doc) && this.epoch(doc) === epoch;
  }

  run(doc, task) {
    if (!doc || typeof task !== 'function') return Promise.resolve(null);
    const epoch = this.epoch(doc);
    const previous = this.tails.get(doc) || Promise.resolve();
    const operation = previous.then(() => {
      if (!this.isCurrent(doc, epoch)) return null;
      return task(() => this.isCurrent(doc, epoch));
    });
    const tail = operation.then(() => undefined, () => undefined);
    this.tails.set(doc, tail);
    void tail.then(() => {
      if (this.tails.get(doc) === tail) this.tails.delete(doc);
    });
    return operation;
  }

  cancel(doc) {
    if (!doc) return;
    this.epochs.set(doc, this.epoch(doc) + 1);
  }
}
