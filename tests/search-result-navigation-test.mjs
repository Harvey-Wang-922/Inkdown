import assert from 'node:assert/strict';
import { SearchResultNavigation, sourceDigest } from '../src/renderer/core/search-result-navigation.js';
const content = '[label](https://example.test/needle)\r\n\r\nvisible needle';
const result = { path: 'A.md', start: content.lastIndexOf('needle'), end: content.length, matchText: 'needle', sourceHash: await sourceDigest(content) };
let context = 'A:1:visual:query1';
const commits = [];
let read = async path => ({ path, content });
const navigator = new SearchResultNavigation({
  context: () => context, read: path => read(path),
  commit: async (doc, match) => { commits.push([doc.path, match.start]); return true; }
});
assert.equal(await navigator.navigate(result, 'needle'), 'opened');
assert.deepEqual(commits, [['A.md', content.lastIndexOf('needle')]]);
let resolveOld;
read = path => path === 'A.md' ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ path, content });
const old = navigator.navigate(result, 'needle');
assert.equal(await navigator.navigate({ ...result, path: 'B.md' }, 'needle'), 'opened');
resolveOld({ path: 'A.md', content });
assert.equal(await old, 'cancelled');
assert.equal(commits.at(-1)[0], 'B.md');
const interrupted = navigator.navigate(result, 'needle');
context = 'C:1:source:query1';
resolveOld({ path: 'A.md', content });
assert.equal(await interrupted, 'cancelled');
read = async path => ({ path, content: content + ' changed' });
assert.equal(await navigator.navigate(result, 'needle'), 'changed');
assert.equal(commits.length, 2);
read = async () => { throw new Error('read failed'); };
await assert.rejects(navigator.navigate(result, 'needle'), /read failed/);
console.log(JSON.stringify({ lastClickWins: true, contextCancellation: true, changedContentRejected: true, readFailure: true }));
