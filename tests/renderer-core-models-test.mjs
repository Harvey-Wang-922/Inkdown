import { isMarkdownClipboard } from '../src/renderer/core/markdown-paste.mjs';
import { floatingToolbarLayout } from '../src/renderer/core/floating-toolbar-layout.mjs';

const importSource = relativePath => import(new URL(relativePath, import.meta.url));

const [{ DocumentStore }, { DocumentHistory }, { DocumentTransactionGate }, { DocumentSaveCoordinator }, { SessionRestoreCoordinator }, { compileMarkdownStyle }, { ProjectionCoordinator }, commandRegistry, inputRules, findModel, workspaceSearchModel] = await Promise.all([
  importSource('../src/renderer/core/document-store.js'),
  importSource('../src/renderer/core/document-history.js'),
  importSource('../src/renderer/core/document-transaction-gate.js'),
  importSource('../src/renderer/core/document-save-coordinator.js'),
  importSource('../src/renderer/core/session-restore-coordinator.js'),
  importSource('../src/renderer/core/markdown-style-config.js'),
  importSource('../src/renderer/core/projection-coordinator.js'),
  importSource('../src/renderer/core/command-registry.js'),
  importSource('../src/renderer/core/markdown-input-rules.js'),
  importSource('../src/renderer/core/find-controller.js'),
  importSource('../src/renderer/core/workspace-search-model.js')
]);

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const bounds = { left: 300, right: 900, top: 90, bottom: 700 };
const toolbar = floatingToolbarLayout({ left: 400, right: 800, top: -500, bottom: 500 }, bounds, { width: 850, height: 40 });
assert(toolbar.left === 308 && toolbar.top === 98 && toolbar.maxWidth === 584, 'Floating toolbars must stay inside the editor when table headers scroll offscreen');
assert(floatingToolbarLayout({ left: 400, right: 800, top: -500, bottom: 80 }, bounds, { width: 100, height: 40 }) === null, 'Offscreen anchors must hide toolbars');
assert(floatingToolbarLayout({ left: 400, right: 800, top: 200, bottom: 500 }, bounds, { width: 200, height: 40 }, { centered: true }).left === 500, 'Table tools must center on the table');
assert(floatingToolbarLayout({ left: -400, right: 1200, top: 200, bottom: 500 }, bounds, { width: 200, height: 40 }, { centered: true }).left === 500, 'Wide tables must center tools on the visible portion');
assert(isMarkdownClipboard('# heading\n\n**strong**') && isMarkdownClipboard('- item') && !isMarkdownClipboard('ordinary text'), 'clipboard Markdown recognition must not rewrite ordinary text');

const store = new DocumentStore();
const reorderStore = new DocumentStore();
const reorderDocs = ['a', 'b', 'c'].map(name => reorderStore.create({ name }));
assert(reorderStore.moveTo(reorderDocs[0].id, reorderDocs[2].id), 'drag reorder must move to its destination');
assert(reorderStore.docs.map(doc => doc.name).join(',') === 'b,c,a', 'tab reorder must preserve intervening order');
assert(!reorderStore.moveTo(-1, reorderDocs[0].id), 'invalid drag identifiers must not change tabs');
assert(reorderStore.activeId === reorderDocs[2].id, 'reordering must not activate a different tab');
reorderStore.close(reorderDocs[0].id);
assert(reorderStore.takeClosed()?.name === 'a' && reorderStore.takeClosed() === null, 'closed snapshots must be consumed once');
const first = store.create({ name: 'A.md', path: 'C:/A.md', content: 'dirty source', dirty: true });
const second = store.create({ name: 'B.md' }, false);
assert(store.adjacentId(1) === second.id, 'adjacentId should return the next id');
assert(store.activeId === first.id, 'adjacentId must not activate the next document');
const session = store.serializeSession(null);
assert(session.dirtyFiles.length === 1 && session.dirtyFiles[0].content === 'dirty source', 'dirty path document must have a recovery snapshot');

let current = first; let mode = false; let projectionEpoch = 4;
const gate = new DocumentTransactionGate(() => current, () => mode, () => projectionEpoch);
const transaction = gate.capture();
projectionEpoch++;
assert(!gate.isCurrent(transaction), 'a new projection must invalidate an async transaction');
assert(gate.isCurrent(transaction, { projection: false }), 'projection validation should be explicitly optional');

const history = new DocumentHistory();
history.ensure(first, 'before');
first.content = 'after';
history.schedule(first, () => first.content);
assert(history.restore(first, -1) === 'before', 'the first mutation must be immediately undoable');
history.cancel(first);

const saves = new DocumentSaveCoordinator();
const saveEvents = [];
let releaseFirstSave;
const firstSave = saves.run(first, async isCurrent => {
  saveEvents.push('first-start');
  await new Promise(resolve => { releaseFirstSave = resolve; });
  assert(isCurrent(), 'running save should remain current before cancellation');
  saveEvents.push('first-end');
  return 'first';
});
const secondSave = saves.run(first, async () => { saveEvents.push('second'); return 'second'; });
await Promise.resolve();
assert(saveEvents.join(',') === 'first-start', 'saves for one document must not overlap');
releaseFirstSave();
assert(await firstSave === 'first' && await secondSave === 'second', 'serialized saves must preserve results');
assert(saveEvents.join(',') === 'first-start,first-end,second', 'saves must finish in invocation order');

let releaseCancelledSave;
let cancelledResultApplied = false;
const cancelledSave = saves.run(second, async isCurrent => {
  await new Promise(resolve => { releaseCancelledSave = resolve; });
  cancelledResultApplied = isCurrent();
});
await Promise.resolve();
saves.cancel(second);
releaseCancelledSave();
await cancelledSave;
assert(!cancelledResultApplied, 'closing a document must invalidate an in-flight save result');

const cyclicStyle = compileMarkdownStyle({
  unorderedMarkers: ['A', 'B', 'C'], orderedStyles: ['decimal', 'lower-alpha']
}, 8);
assert(cyclicStyle.includes('--inkdown-ul-marker-4:"A"'), 'unordered markers must cycle after the configured array');
assert(cyclicStyle.includes('--inkdown-ul-marker-7:"A"'), 'unordered marker cycling must continue for deep lists');
assert(cyclicStyle.includes('--inkdown-ol-style-3:decimal'), 'ordered styles must cycle independently');
assert(cyclicStyle.includes('--inkdown-ol-style-8:lower-alpha'), 'ordered style cycling must continue for deep lists');

const { describeBlockTransform, matchInlineShortcut, parseTableHeaderCells } = inputRules;
assert(describeBlockTransform('P', '###', 'content') === null, 'heading markers must wait for an explicit delimiter');
assert(describeBlockTransform('P', '###', 'space')?.tag === 'h3', 'space-delimited heading markers must resolve through the shared rule set');
assert(describeBlockTransform('H1', '# literal', 'content') === null, 'literal hashes inside an existing heading must not change its level');
assert(describeBlockTransform('LI', '[x]', 'space')?.checked === true, 'task recognition must use the shared block rule set');
assert(matchInlineShortcut('prefix **strong**')?.tag === 'strong', 'inline shortcuts must use the shared rule set');
assert(parseTableHeaderCells('| Name | Count |')?.length === 2 && parseTableHeaderCells('| only |') === null, 'table header recognition must use the shared rule set');

let activeProjectionId = 'A';
const projection = new ProjectionCoordinator(() => activeProjectionId);
const firstProjection = projection.begin('A');
assert(projection.loading && projection.isCurrent(firstProjection), 'a projection must own its loading phase');
const secondProjection = projection.begin('A');
assert(!projection.isCurrent(firstProjection) && projection.finish(secondProjection) && !projection.loading, 'a newer projection must invalidate and finish independently of the stale one');
const switchedProjection = projection.begin('A'); activeProjectionId = 'B';
assert(!projection.finish(switchedProjection) && projection.loading, 'a result for another active document must not finish the current projection');
projection.invalidate();
assert(!projection.loading, 'explicit invalidation must release the projection phase');

const { COMMANDS, commandItem, commandPaletteItems, resolveKeyboardAction } = commandRegistry;
assert(new Set(COMMANDS.map(command => command.action)).size === COMMANDS.length, 'command actions must be unique');
assert(commandItem('quote').shortcut === 'Ctrl+Shift+Q', 'menus must resolve shortcut metadata from the command registry');
assert(commandPaletteItems().some(command => command.action === 'table' && command.detail === 'Ctrl+T'), 'the command palette must derive entries from the command registry');
assert(resolveKeyboardAction({ code: 'KeyQ', ctrlKey: true, shiftKey: true }) === 'quote', 'keyboard routing must use the command registry');
assert(resolveKeyboardAction({ code: 'KeyV', ctrlKey: true, shiftKey: true }) === 'paste-plain', 'literal paste shortcut must use the shared command registry');
assert(resolveKeyboardAction({ code: 'Digit1', ctrlKey: true, shiftKey: true }) === 'outline', 'specific shifted shortcuts must take precedence over heading shortcuts');
assert(resolveKeyboardAction({ code: 'Digit1', ctrlKey: true }) === 'heading-1', 'heading shortcuts must be generated by the command registry');

const { findTextRanges, replaceTextRanges, FindNavigator } = findModel;
assert(findTextRanges('One one ONE', 'one').length === 3, 'find ranges must be case-insensitive and include every occurrence');
const replacedRanges = replaceTextRanges('One one ONE', 'one', 'match');
assert(replacedRanges.value === 'match match match' && replacedRanges.count === 3, 'replace-all must use the same case-insensitive match model as find');
const findNavigator = new FindNavigator();
findNavigator.update('first target second target third target', 'target', 'visual');
assert(findNavigator.move().start === 6 && findNavigator.move().start === 20, 'next search must advance through editor matches');
assert(findNavigator.move(true).start === 6, 'previous search must move backwards from the current match');
findNavigator.select(2); assert(findNavigator.move().start === 6, 'next search must wrap after an explicitly selected global result');

const { filterWorkspaceTree, WorkspaceSearchCoordinator } = workspaceSearchModel;
const filteredTree = filterWorkspaceTree([{ type: 'folder', name: 'root', children: [{ type: 'folder', name: 'deep', children: [{ type: 'file', name: 'needle.md', path: 'needle.md' }] }] }], 'needle');
assert(filteredTree[0]?.children[0]?.children[0]?.name === 'needle.md', 'file filtering must retain the complete ancestor chain for nested matches');
let resolveOldSearch; let resolveNewSearch;
const searchCoordinator = new WorkspaceSearchCoordinator((_folder, query, requestId) => new Promise(resolve => {
  if (query === 'old') resolveOldSearch = () => resolve({ requestId, query, results: [{ name: 'old' }] });
  else resolveNewSearch = () => resolve({ requestId, query, results: [{ name: 'new' }] });
}));
const oldSearch = searchCoordinator.run('docs', 'old');
const newSearch = searchCoordinator.run('docs', 'new');
resolveNewSearch();
assert((await newSearch).results[0].name === 'new', 'the newest workspace search result must be accepted');
resolveOldSearch();
assert(await oldSearch === null, 'a late older workspace search must not overwrite newer results');

let restoreRevision = 4; let activeReads = 0; let maxReads = 0;
const startedPaths = []; const completedPaths = []; const readCounts = new Map();
const sessionRestore = new SessionRestoreCoordinator({
  getRevision: () => restoreRevision,
  concurrency: 2,
  loadFolder: async path => ({ path, name: 'Docs' }),
  readFile: async path => {
    startedPaths.push(path); readCounts.set(path, (readCounts.get(path) || 0) + 1);
    activeReads++; maxReads = Math.max(maxReads, activeReads);
    await new Promise(resolve => setTimeout(resolve, 2)); activeReads--; completedPaths.push(path);
    return { path, name: path, content: path };
  }
});
let projectedActive = null;
const restoredSession = await sessionRestore.load(JSON.stringify({
  paths: ['slow.md', 'active.md', 'slow.md', 'other.md'], activePath: 'active.md', folderPath: 'docs'
}), { onActive: ({ active }) => {
  projectedActive = active.data.path;
  assert(completedPaths.join(',') === 'active.md', 'the active document must be available before background tabs finish');
  assert(startedPaths.length === 1, 'background reads must start after the active projection callback');
} });
assert(startedPaths[0] === 'active.md', 'session restoration must prioritize the active path');
assert(projectedActive === 'active.md', 'session restoration must expose the active document progressively');
assert(maxReads <= 2 && readCounts.get('slow.md') === 1, 'session restoration must bound concurrency and deduplicate paths');
assert(restoredSession.files.map(file => file.path).join(',') === 'slow.md,active.md,other.md', 'loaded files must return in original session order');
const dirtyReads = [];
const dirtyRestore = new SessionRestoreCoordinator({
  getRevision: () => restoreRevision, loadFolder: async () => null,
  readFile: async path => { dirtyReads.push(path); return { path, content: 'disk' }; }
});
let projectedDirty = null;
await dirtyRestore.load(JSON.stringify({
  paths: ['dirty.md', 'clean.md'], activePath: 'dirty.md',
  dirtyFiles: [{ path: 'dirty.md', name: 'dirty.md', content: 'unsaved source' }]
}), { onActive: ({ active }) => { projectedDirty = active; } });
assert(projectedDirty?.kind === 'dirty' && projectedDirty.data.content === 'unsaved source', 'an active dirty snapshot must project before its disk copy');
assert(!dirtyReads.includes('dirty.md'), 'restoring an active dirty snapshot must not read and replace it from disk');
const postProjectionReads = [];
const interruptedAfterProjection = new SessionRestoreCoordinator({
  getRevision: () => restoreRevision, loadFolder: async () => null,
  readFile: async path => { postProjectionReads.push(path); return { path, content: path }; }
});
const interruptedResult = await interruptedAfterProjection.load(JSON.stringify({
  paths: ['active.md', 'background.md'], activePath: 'active.md'
}), { onActive: () => { restoreRevision++; } });
assert(interruptedResult === null && postProjectionReads.join(',') === 'active.md', 'navigation during active projection must cancel all background restoration');
const normalizedSession = await sessionRestore.load(JSON.stringify({ paths: 'not-an-array', drafts: {}, dirtyFiles: null }));
assert(normalizedSession.session.paths.length === 0 && normalizedSession.session.drafts.length === 0 && normalizedSession.session.dirtyFiles.length === 0, 'malformed session collections must normalize safely');
assert(await sessionRestore.load('[]') === null, 'non-object session roots must be rejected');
let releaseRestore;
const cancelledRestore = new SessionRestoreCoordinator({
  getRevision: () => restoreRevision, concurrency: 1, loadFolder: async () => null,
  readFile: async path => { await new Promise(resolve => { releaseRestore = resolve; }); return { path }; }
});
const pendingRestore = cancelledRestore.load(JSON.stringify({ paths: ['one.md', 'two.md'] }));
await Promise.resolve(); restoreRevision++; releaseRestore();
assert(await pendingRestore === null, 'user navigation must invalidate an in-flight session restore');

console.log(JSON.stringify({ pureNavigation: true, dirtyRecovery: true, projectionEpoch: true, projectionCoordinator: true, immediateHistory: true, serializedSaves: true, cyclicListStyles: true, sharedInputRules: true, commandRegistry: true, editorFindNavigation: true, workspaceSearchCoordination: true, boundedSessionRestore: true, progressiveSessionRestore: true }));
