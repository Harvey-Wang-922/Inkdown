export class DocumentOpenCoordinator {
  constructor({ context, existing, readFile, concurrency = 4 }) {
    Object.assign(this, { context, existing, readFile });
    this.concurrency = Math.max(1, concurrency);
    this.revision = 0;
    this.pendingReads = new Map();
  }

  cancel() { this.revision++; }

  async readPath(path) {
    const existing = this.existing(path);
    if (existing) return existing;
    if (this.pendingReads.has(path)) return this.pendingReads.get(path);
    const pending = Promise.resolve().then(() => this.readFile(path));
    this.pendingReads.set(path, pending);
    try { return await pending; }
    finally { if (this.pendingReads.get(path) === pending) this.pendingReads.delete(path); }
  }

  async readPaths(paths, isCurrent = () => true) {
    const unique = [...new Set(paths)];
    const files = [], errors = [];
    for (let start = 0; start < unique.length && isCurrent(); start += this.concurrency) {
      const batch = unique.slice(start, start + this.concurrency);
      const results = await Promise.allSettled(batch.map(path => this.readPath(path)));
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') files.push(result.value);
        else errors.push({ path: batch[index], error: result.reason });
      });
    }
    return { files, errors };
  }

  async run(load, commit) {
    const revision = ++this.revision;
    const context = this.context();
    const isCurrent = () => revision === this.revision && context === this.context();
    let value;
    try { value = await load(isCurrent); }
    catch (error) { if (isCurrent()) throw error; return null; }
    if (!isCurrent() || value == null) return null;
    await commit(value);
    return value;
  }
}
