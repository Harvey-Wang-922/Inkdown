import assert from 'node:assert/strict';
import { DocumentOpenCoordinator } from '../src/renderer/core/document-open-coordinator.mjs';
let context = 'A:revision1:visual';
const reads = new Map();
const commits = [];
const open = new DocumentOpenCoordinator({
  context: () => context, existing: () => null,
  readFile: path => new Promise((resolve, reject) => reads.set(path, { resolve, reject }))
});
const first = open.run(() => open.readPath('first.md'), file => commits.push(file.path));
const second = open.run(() => open.readPath('second.md'), file => commits.push(file.path));
await Promise.resolve();
reads.get('second.md').resolve({ path: 'second.md' });
await second;
reads.get('first.md').resolve({ path: 'first.md' });
assert.equal(await first, null);
assert.deepEqual(commits, ['second.md']);
const editPending = open.run(() => open.readPath('edit.md'), file => commits.push(file.path));
await Promise.resolve(); context = 'A:revision2:visual';
reads.get('edit.md').resolve({ path: 'edit.md' });
assert.equal(await editPending, null);
const errorPending = open.run(() => open.readPath('error.md'), () => assert.fail('stale error must not commit'));
await Promise.resolve(); context = 'B:revision1:source';
reads.get('error.md').reject(new Error('stale'));
assert.equal(await errorPending, null);
const currentError = open.run(() => Promise.reject(new Error('current')), () => {});
await assert.rejects(currentError, /current/);
const dirty = { path: 'dirty.md', content: 'unsaved' };
let count = 0, active = 0, maxActive = 0;
const bounded = new DocumentOpenCoordinator({
  context: () => context, existing: path => path === dirty.path ? dirty : null, concurrency: 2,
  readFile: async path => { count++; active++; maxActive = Math.max(maxActive, active); await new Promise(resolve => setTimeout(resolve, 5)); active--; return { path }; }
});
assert.equal(await bounded.readPath('dirty.md'), dirty);
await Promise.all([bounded.readPath('shared.md'), bounded.readPath('shared.md')]);
assert.equal(count, 1);
const result = await bounded.readPaths(['a', 'b', 'c', 'a', 'd']);
assert.deepEqual(result.files.map(file => file.path), ['a', 'b', 'c', 'd']);
assert.equal(maxActive, 2);
assert.equal(count, 5);
console.log(JSON.stringify({ latestOpenWins: true, editsCancelOpen: true, staleErrorsIgnored: true, existingDirtyPreserved: true, readDeduplication: true, boundedBatch: true }));
