export async function sourceDigest(content) {
  const bytes = new TextEncoder().encode(content);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

// Source results must be validated before opening a document or changing mode.
export class SearchResultNavigation {
  constructor({ context, read, commit, digest = sourceDigest }) {
    Object.assign(this, { context, read, commit, digest });
    this.revision = 0;
  }

  cancel() { this.revision++; }

  async navigate(result, query) {
    const revision = ++this.revision;
    const context = this.context();
    const isLatest = () => revision === this.revision;
    const isCurrent = () => isLatest() && context === this.context();
    try {
      const document = await this.read(result.path);
      if (!isCurrent()) return 'cancelled';
      const content = document.content;
      const hash = await this.digest(content);
      if (!isCurrent()) return 'cancelled';
      if (document.content !== content || hash !== result.sourceHash
          || !Number.isInteger(result.start) || result.start < 0
          || content.slice(result.start, result.end) !== result.matchText
          || result.matchText.toLocaleLowerCase() !== query.toLocaleLowerCase()) return 'changed';
      return await this.commit(document, result, query, isLatest) ? 'opened' : 'cancelled';
    } catch (error) {
      if (!isCurrent()) return 'cancelled';
      throw error;
    }
  }
}
