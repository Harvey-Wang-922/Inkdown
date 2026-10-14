import assert from 'node:assert/strict';
import { SessionRecoveryCoordinator } from '../src/renderer/core/session-recovery-storage.mjs';
let callback, current = { drafts: [{ content: 'first' }] }, release;
const writes = [], errors = [];
const coordinator = new SessionRecoveryCoordinator({
  snapshot: () => structuredClone(current), onError: error => errors.push(error.message),
  setTimer: next => { callback = next; return 1; }, clearTimer: () => {},
  storage: { write: async snapshot => { writes.push(snapshot); if (writes.length === 1) await new Promise(resolve => { release = resolve; }); } }
});
coordinator.schedule(); current.drafts[0].content = 'latest'; coordinator.schedule(); callback();
await Promise.resolve();
const final = coordinator.flush();
await Promise.resolve(); assert.equal(writes.length, 1, 'writes must serialize');
release(); await final;
assert.equal(writes[0].drafts[0].content, 'latest', 'debounce must capture current source');
assert.equal(writes[1].drafts[0].content, 'latest', 'close flush must include current source');
let fail = true;
const retry = new SessionRecoveryCoordinator({ snapshot: () => current,
  storage: { write: async () => { if (fail) throw new Error('quota'); } } });
await assert.rejects(retry.flush(), /quota/);
fail = false; await retry.flush();
assert.deepEqual(errors, []);
console.log(JSON.stringify({ orderedAsyncWrites:true, debouncedSourceSnapshot:true, closeFlush:true, retryAfterFailure:true }));
