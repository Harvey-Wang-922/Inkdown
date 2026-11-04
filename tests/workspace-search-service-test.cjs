const assert = require('node:assert/strict');
const { WorkspaceSearchService } = require('../src/services/workspace-search-service');

void (async () => {
const documents = new Map([
  ['a.md', 'first hit and HIT'],
  ['b.md', 'no match\nlast hit'],
  ['skip.docx', 'hit']
]);
const versions = new Map([...documents].map(([filePath, content]) => [filePath, { size: content.length, mtimeMs: 1 }]));
const reads = new Map();
let activeReads = 0; let maxReads = 0;
const service = new WorkspaceSearchService({
  concurrency: 2,
  stat: async filePath => versions.get(filePath),
  readDocument: async filePath => {
    reads.set(filePath, (reads.get(filePath) || 0) + 1);
    activeReads++; maxReads = Math.max(maxReads, activeReads);
    await Promise.resolve(); activeReads--;
    return { content: documents.get(filePath) };
  }
});
const files = [...documents.keys()].map(filePath => ({ path: filePath, name: filePath }));
const first = await service.search(files, 'hit', 7);
assert.equal(first.requestId, 7);
for (const result of first.results) {
  assert.equal(documents.get(result.path).slice(result.start, result.end), result.matchText);
  assert.equal(result.sourceHash.length, 64);
}
const windowsSource = 'prefix\r\n[link](needle)\r\nvisible needle';
const windowsMatches = service.matches({ path: 'windows.md', name: 'windows.md' }, windowsSource, 'needle');
assert.equal(windowsMatches[1].start, windowsSource.lastIndexOf('needle'), 'CRLF source offsets must remain exact');
assert.deepEqual(first.results.map(result => [result.path, result.matchIndex]), [['a.md', 0], ['a.md', 1], ['b.md', 0]]);
assert.ok(maxReads <= 2, 'workspace search must respect bounded file-read concurrency');
await service.search(files, 'hit', 8);
assert.equal(reads.get('a.md'), 1, 'unchanged files must reuse cached imported content');
service.invalidate('a.md'); await service.search(files, 'hit', 9);
assert.equal(reads.get('a.md'), 2, 'saving or renaming a file must invalidate its search cache entry');
let currentTime = 1000; let catalogLoads = 0;
const catalogService = new WorkspaceSearchService({
  catalogTtl: 2000, now: () => currentTime,
  stat: async filePath => versions.get(filePath),
  readDocument: async filePath => ({ content: documents.get(filePath) })
});
const loadCatalog = async () => { catalogLoads++; await Promise.resolve(); return files; };
await Promise.all([
  catalogService.searchFolder('docs', 'hit', 11, loadCatalog),
  catalogService.searchFolder('docs', 'first', 12, loadCatalog)
]);
assert.equal(catalogLoads, 1, 'overlapping workspace queries must share directory enumeration');
await catalogService.searchFolder('docs', 'last', 13, loadCatalog);
assert.equal(catalogLoads, 1, 'rapid queries must reuse the short-lived directory catalog');
currentTime += 2001;
await catalogService.searchFolder('docs', 'last', 14, loadCatalog);
assert.equal(catalogLoads, 2, 'expired directory catalogs must refresh');
catalogService.invalidateFolder('docs');
await catalogService.searchFolder('docs', 'last', 15, loadCatalog);
assert.equal(catalogLoads, 3, 'workspace mutations must invalidate the directory catalog');
// Resolve old directory reads after invalidation/replacement, without timing sleeps.
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
};
const oldFiles = [{ path: 'old.md', name: 'old.md' }];
const newFiles = [{ path: 'new.md', name: 'new.md' }];
const unexpectedLoad = () => { throw new Error('A stale completion discarded the current directory cache'); };
const oldCatalog = deferred();
const oldRequest = catalogService.filesForFolder('race', () => oldCatalog.promise);
catalogService.invalidateFolder('race');
const newCatalog = deferred();
const newRequest = catalogService.filesForFolder('race', () => newCatalog.promise);
newCatalog.resolve(newFiles); await newRequest;
oldCatalog.resolve(oldFiles); await oldRequest;
assert.deepEqual(await catalogService.filesForFolder('race', unexpectedLoad), newFiles,
  'an invalidated directory read must not overwrite a newer catalog');

const failingCatalog = deferred();
const failingRequest = catalogService.filesForFolder('failure-race', () => failingCatalog.promise);
const expectedFailure = assert.rejects(failingRequest, /old directory error/);
catalogService.invalidateFolder('failure-race');
const currentCatalog = deferred();
const currentRequest = catalogService.filesForFolder('failure-race', () => currentCatalog.promise);
failingCatalog.reject(new Error('old directory error')); await expectedFailure;
const sharedCurrent = catalogService.filesForFolder('failure-race', unexpectedLoad);
currentCatalog.resolve(newFiles);
assert.deepEqual(await sharedCurrent, newFiles, 'stale failure must not remove a newer pending catalog');
await currentRequest;

const primedCatalog = deferred();
const primedRequest = catalogService.filesForFolder('primed', () => primedCatalog.promise);
catalogService.primeCatalog('primed', newFiles);
primedCatalog.resolve(oldFiles); await primedRequest;
assert.deepEqual(await catalogService.filesForFolder('primed', unexpectedLoad), newFiles,
  'explicitly primed folder state must supersede an older enumeration');

const clearedCatalog = deferred();
const clearedRequest = catalogService.filesForFolder('cleared', () => clearedCatalog.promise);
catalogService.invalidateCatalogs();
clearedCatalog.resolve(oldFiles); await clearedRequest;
assert.deepEqual(await catalogService.filesForFolder('cleared', () => newFiles), newFiles,
  'global invalidation must prevent pending reads from repopulating old catalogs');
await assert.rejects(catalogService.filesForFolder('retry', () => { throw new Error('current directory error'); }),
  /current directory error/);
assert.deepEqual(await catalogService.filesForFolder('retry', () => newFiles), newFiles,
  'a current enumeration failure must permit a normal retry');
const limited = new WorkspaceSearchService({
  maxResults: 2, stat: async () => ({ size: 9, mtimeMs: 1 }),
  readDocument: async () => ({ content: 'hit hit hit' })
});
const truncated = await limited.search([{ path: 'many.md', name: 'many.md' }], 'hit', 10);
assert.equal(truncated.results.length, 2); assert.equal(truncated.truncated, true);
console.log(JSON.stringify({ allOccurrences: true, deterministicOrder: true, boundedConcurrency: true, contentCache: true, catalogCache: true, staleCatalogIsolation: true, resultLimit: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
