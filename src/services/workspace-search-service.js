const { createHash } = require('node:crypto');

class WorkspaceSearchService {
  constructor({ stat, readDocument, concurrency = 4, maxResults = 200, maxCacheEntries = 512, catalogTtl = 2000, now = () => Date.now() }) {
    this.stat = stat;
    this.readDocument = readDocument;
    this.concurrency = Math.max(1, Math.floor(Number(concurrency) || 4));
    this.maxResults = Math.max(1, Math.floor(Number(maxResults) || 200));
    this.maxCacheEntries = Math.max(1, Math.floor(Number(maxCacheEntries) || 512));
    this.catalogTtl = Math.max(0, Math.floor(Number(catalogTtl) || 0));
    this.now = now;
    this.cache = new Map();
    this.catalogs = new Map();
  }

  invalidate(filePath) { this.cache.delete(filePath); }

  primeCatalog(folderPath, files) {
    const snapshot = Array.isArray(files) ? [...files] : [];
    this.catalogs.set(folderPath, { files: snapshot, expires: this.now() + this.catalogTtl, pending: null });
    return snapshot;
  }

  invalidateFolder(folderPath) { this.catalogs.delete(folderPath); }

  invalidateCatalogs() { this.catalogs.clear(); }

  async filesForFolder(folderPath, loader) {
    const cached = this.catalogs.get(folderPath);
    if (cached?.pending) return cached.pending;
    if (cached?.files && cached.expires > this.now()) return cached.files;
    const pending = Promise.resolve().then(loader).then(
      files => this.primeCatalog(folderPath, files),
      error => { this.catalogs.delete(folderPath); throw error; }
    );
    this.catalogs.set(folderPath, { files: cached?.files || null, expires: 0, pending });
    return pending;
  }

  async searchFolder(folderPath, query, requestId, loader) {
    return this.search(await this.filesForFolder(folderPath, loader), query, requestId);
  }

  async content(filePath) {
    const stats = await this.stat(filePath);
    const cached = this.cache.get(filePath);
    if (cached && cached.size === stats.size && cached.modified === stats.mtimeMs) return cached.content;
    const content = (await this.readDocument(filePath)).content;
    this.cache.set(filePath, { size: stats.size, modified: stats.mtimeMs, content });
    if (this.cache.size > this.maxCacheEntries) this.cache.delete(this.cache.keys().next().value);
    return content;
  }

  matches(file, content, needle, limit = this.maxResults + 1) {
    content = String(content || '');
    const sourceHash = createHash('sha256').update(content).digest('hex');
    const matches = [];
    let matchIndex = 0;
    let lineStart = 0;
    const lines = content.split('\n');
    for (let lineIndex = 0; lineIndex < lines.length && matches.length < limit; lineIndex++) {
      const line = lines[lineIndex].replace(/\r$/, '');
      const normalized = line.toLocaleLowerCase();
      let offset = 0;
      while (matches.length < limit) {
        const column = normalized.indexOf(needle, offset);
        if (column < 0) break;
        const previewStart = Math.max(0, column - 60);
        matches.push({
          path: file.path, name: file.name, line: lineIndex + 1, column: column + 1, matchIndex,
          start: lineStart + column, end: lineStart + column + needle.length,
          sourceHash, matchText: line.slice(column, column + needle.length),
          preview: line.slice(previewStart, previewStart + 180), previewColumn: column - previewStart
        });
        matchIndex++;
        offset = column + Math.max(1, needle.length);
      }
      lineStart += lines[lineIndex].length + 1;
    }
    return matches;
  }

  async search(files, query, requestId = 0) {
    const normalizedQuery = String(query || '').trim().slice(0, 500);
    const needle = normalizedQuery.toLocaleLowerCase();
    const normalizedRequestId = Number.isInteger(requestId) ? requestId : 0;
    if (!needle) return { requestId: normalizedRequestId, query: normalizedQuery, results: [], truncated: false };
    const searchable = (files || []).filter(file => file?.path && !/\.docx$/i.test(file.path));
    const collected = [];
    for (let start = 0; start < searchable.length && collected.length <= this.maxResults; start += this.concurrency) {
      const batch = searchable.slice(start, start + this.concurrency);
      const batchMatches = await Promise.all(batch.map(async file => {
        try { return this.matches(file, await this.content(file.path), needle); }
        catch { return []; }
      }));
      for (const matches of batchMatches) collected.push(...matches);
    }
    const results = collected.slice(0, this.maxResults);
    return { requestId: normalizedRequestId, query: normalizedQuery, results, truncated: collected.length > results.length };
  }
}

module.exports = { WorkspaceSearchService };
