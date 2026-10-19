import { DocumentStore, defaultSettings, loadSettings, saveSettings, loadRecentFiles, addRecentFile, clearRecentFiles } from './core/document-store.js';
import { MarkdownInputController } from './core/markdown-input.js';
import { SourceDocumentEngine } from './core/source-document-engine.mjs';
import { DocumentHistory } from './core/document-history.js';
import { captureEditorView, restoreEditorView } from './core/editor-view-state.mjs';
import { AppMenu } from './core/app-menu.js';
import { MarkdownCodec } from './core/markdown-codec.js';
import { markdownPasteSource, clipboardToMarkdown, restoreClipboardCaret } from './core/markdown-paste.mjs';
import { DocumentTransactionGate } from './core/document-transaction-gate.js';
import { DocumentSaveCoordinator } from './core/document-save-coordinator.js';
import { compileMarkdownStyle, DEFAULT_MARKDOWN_STYLE } from './core/markdown-style-config.js';
import { ProjectionCoordinator } from './core/projection-coordinator.js';
import { EditorProjectionController } from './core/editor-projection-controller.mjs';
import { commandPaletteItems, resolveKeyboardAction, commandItem } from './core/command-registry.js';
import { SessionRestoreCoordinator } from './core/session-restore-coordinator.js';
import { EditorFindController, replaceTextRanges } from './core/find-controller.js';
import { filterWorkspaceTree, WorkspaceSearchCoordinator } from './core/workspace-search-model.js';
import { SearchResultNavigation } from './core/search-result-navigation.js';
import { WorkspaceSearchPane } from './core/workspace-search-pane.mjs';
import { DocumentOpenCoordinator } from './core/document-open-coordinator.mjs';
import { placeFloatingToolbar } from './core/floating-toolbar-layout.mjs';
import { SourceEditingController } from './core/source-editing-model.mjs';
import { VisualSourceTransactions } from './core/visual-source-transactions.mjs';
import { SessionRecoveryStorage, SessionRecoveryCoordinator } from './core/session-recovery-storage.mjs';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const store = new DocumentStore();
const state = {
  sourceMode: false,
  folder: null,
  settings: loadSettings(),
  outlineTimer: null,
  documentRevision: 0,
  paletteItems: [],
  paletteIndex: 0,
  paletteMode: 'files',
  draggedTabId: null
};

const markdownCodec = new MarkdownCodec();
const visualTransactions = new VisualSourceTransactions(html => markdownCodec.toMarkdown(html));
const sourceEngine = new SourceDocumentEngine(
  html => markdownCodec.toMarkdown(html),
  doc => {
    if (doc === activeDoc()) updateStatus();
    schedulePersistSession();
  }
);
const documentHistory = new DocumentHistory();
const projection = new ProjectionCoordinator(() => activeDoc()?.id,
  () => JSON.stringify([activeDoc()?.sourceRevision || 0, state.sourceMode]));
const transactionGate = new DocumentTransactionGate(() => activeDoc(), () => state.sourceMode, () => projection.revision);
const saveCoordinator = new DocumentSaveCoordinator();
const recoveryStorage = new SessionRecoveryStorage();
const sessionRecovery = new SessionRecoveryCoordinator({
  storage: recoveryStorage, snapshot: () => store.serializeSession(state.folder?.path),
  onError: error => toast(`恢复快照未写入，原文件未受影响：${error.message}`)
});
const sessionRestoreCoordinator = new SessionRestoreCoordinator({
  readFile: filePath => window.inkdown.readFile(filePath),
  loadFolder: folderPath => window.inkdown.loadFolder(folderPath),
  getRevision: () => state.documentRevision,
  concurrency: 4
});

const els = {
  appMenuBar: $('#appMenuBar'),
  sidebar: $('#sidebar'), folderName: $('#folderName'), filesPane: $('#filesPane'), outlinePane: $('#outlinePane'), searchPane: $('#searchPane'),
  fileTree: $('#fileTree'), fileFilter: $('#fileFilter'), outline: $('#outline'), globalSearchInput: $('#globalSearchInput'), globalSearchResults: $('#globalSearchResults'),
  tabs: $('#tabs'), welcome: $('#welcome'), recentFiles: $('#recentFiles'), pane: $('#editorPane'), wysiwyg: $('#wysiwyg'), source: $('#sourceEditor'),
  sourceModeBtn: $('#sourceModeBtn'), statusbar: $('#statusbar'), saveState: $('#saveState'), stats: $('#statusStats'), statsDetails: $('#statusDetails'),
  findbar: $('#findbar'), findInput: $('#findInput'), replaceInput: $('#replaceInput'), findCount: $('#findCount'), selectionToolbar: $('#selectionToolbar'),
  palette: $('#palette'), paletteInput: $('#paletteInput'), paletteResults: $('#paletteResults'), settings: $('#settingsModal'), contextMenu: $('#contextMenu'), moreMenu: $('#moreMenu'), tableToolbar: $('#tableToolbar'), tableRows: $('#tableRows'), tableColumns: $('#tableColumns'), toast: $('#toast')
};

let appMenu;
const sourceEditing = new SourceEditingController(els.source, sourceChanged);
const findController = new EditorFindController({ source: els.source, visual: els.wysiwyg, pane: els.pane, isSourceMode: () => state.sourceMode });
const workspaceSearch = new WorkspaceSearchCoordinator((folderPath, query, requestId) => window.inkdown.searchFolder(folderPath, query, requestId));
const searchNavigation = new SearchResultNavigation({
  context: () => JSON.stringify([state.documentRevision, transactionGate.capture(), workspaceSearch.revision, els.globalSearchInput.value]),
  read: path => store.docs.find(doc => doc.path === path) || window.inkdown.readFile(path),
  commit: async (data, result, query, isLatest) => {
    const doc = store.docs.find(item => item.path === data.path) || store.create({ ...data, dirty: false }, false);
    const ready = activateDocument(doc.id, { sourceMode: true });
    const transaction = transactionGate.capture();
    const revision = state.documentRevision;
    await ready;
    if (!isLatest() || revision !== state.documentRevision || !transactionGate.isCurrent(transaction)) return false;
    addRecentFile(doc); renderRecentFiles();
    openFind(false, query);
    const selected = findController.selectSourceResult(query, result, doc.content);
    updateFindCount(findController.navigator.status());
    return selected;
  }
});
const documentOpen = new DocumentOpenCoordinator({
  context: () => JSON.stringify([state.documentRevision, transactionGate.capture()]),
  existing: path => store.docs.find(doc => doc.path === path),
  readFile: path => window.inkdown.readFile(path)
});
const searchPane = new WorkspaceSearchPane({
  input: els.globalSearchInput, results: els.globalSearchResults,
  summary: $('#globalSearchSummary'), clear: $('#globalSearchClear'),
  coordinator: workspaceSearch, folder: () => state.folder,
  navigate: (result, query) => searchNavigation.navigate(result, query), notify: toast
});

const inputController = new MarkdownInputController(els.wysiwyg, {
  onInput: block => visualChanged(block),
  onMarkdownPaste: (text, range) => pasteMarkdown(text, range),
  decodeClipboard: html => markdownCodec.toMarkdown(html),
  onSelectionChange: (block, selection) => selectionChanged(block, selection),
  onToc: node => renderToc(node),
  onKeydown: event => editorKeydown(event),
  captureTransaction: () => transactionGate.capture(),
  isTransactionCurrent: transaction => transactionGate.isCurrent(transaction)
});
const editorProjection = new EditorProjectionController({
  coordinator: projection, render: source => window.inkdown.renderProjection(source),
  source: els.source, visual: els.wysiwyg, pane: els.pane,
  normalize: () => inputController.normalizeDocument(),
  capture: (doc, spans) => visualTransactions.capture(doc, els.wysiwyg, spans),
  activate: (doc, sourceMode) => {
    els.pane.scrollTo({ top: doc.scrollTop || 0, behavior: 'instant' });
    if (sourceMode) els.source.focus({ preventScroll: true });
    else inputController.ensureCaretBlock('start');
  },
  onError: (error, doc) => {
    state.sourceMode = true;
    els.wysiwyg.classList.add('hidden'); els.source.classList.remove('hidden'); els.sourceModeBtn.classList.add('active');
    els.source.value = doc.content; els.source.focus({ preventScroll: true });
    documentHistory.ensure(doc, doc.content); updateStatus(); renderOutline();
    toast(`实时投影失败，已保留源码：${error.message}`);
  }
});

function activeDoc() { return store.active; }
function currentEditor() { return state.sourceMode ? els.source : els.wysiwyg; }

function createDocument(data = {}) {
  const doc = store.create(data, false);
  if (!doc.history) { doc.history = []; doc.historyIndex = -1; }
  void activateDocument(doc.id);
  return doc;
}

async function addDocument(data) {
  const [doc] = await addDocuments([data]);
  return doc;
}

async function addDocuments(items) {
  const docs = [];
  for (const data of items) {
    let doc = data.path && store.docs.find(item => item.path === data.path);
    if (!doc) {
      doc = store.create({ ...data, dirty: false }, false);
      doc.history = []; doc.historyIndex = -1;
    }
    addRecentFile(doc);
    docs.push(doc);
  }
  const target = docs.at(-1);
  if (!target) return docs;
  await activateDocument(target.id);
  schedulePersistSession();
  renderRecentFiles();
  return docs;
}

async function activateDocument(id, { sourceMode = null } = {}) {
  state.documentRevision++;
  const current = activeDoc();
  if (current && current.id !== id) {
    current.scrollTop = els.pane.scrollTop;
    flushEditor();
    documentHistory.record(current, current.content);
  }
  store.activate(id);
  if (sourceMode !== null) setEditorMode(sourceMode);
  renderTabs();
  await renderActive();
  schedulePersistSession();
}

async function renderActive(view = null) {
  findController.reset();
  const doc = activeDoc();
  const hasDocument = Boolean(doc);
  els.welcome.classList.toggle('hidden', hasDocument);
  els.pane.classList.toggle('hidden', !hasDocument);
  els.statusbar.classList.toggle('hidden', !hasDocument || !state.settings.showStatusBar);
  const pending = editorProjection.project(doc, state.sourceMode, view);
  const revision = projection.revision;
  if (!await pending || revision !== projection.revision) return false;
  if (!doc) { els.findbar.classList.add('hidden'); renderOutline(); return true; }
  documentHistory.ensure(doc, doc.content);
  updateStatus();
  renderOutline();
  refreshFind();
  selectionChanged(inputController.currentBlock(), window.getSelection());
  return true;
}

async function restoreHistory(delta) {
  const doc = activeDoc();
  if (!doc) return;
  documentHistory.cancel(doc);
  const markdown = documentHistory.restore(doc, delta);
  if (markdown == null) return;
  const editor = state.sourceMode ? els.source : els.wysiwyg;
  const view = captureEditorView(editor, els.pane, state.sourceMode);
  sourceEngine.commitSource(doc, markdown, true, 'history');
  if (!await renderActive({ scrollTop: view.scrollTop, activate: () => restoreEditorView(editor, els.pane, view) })) return;
  schedulePersistSession();
  renderOutline(); renderTabs(); updateStatus();
}

function visualChanged(block) {
  const doc = activeDoc();
  if (!doc || projection.loading || state.sourceMode) return;
  markFocusedBlock(block);
  const source = visualTransactions.source(doc, els.wysiwyg);
  if (!sourceEngine.commitSource(doc, source, true, visualTransactions.origin)) return;
  documentHistory.schedule(doc, () => doc.content);
  renderTabs();
  updateStatus();
  scheduleOutline();
  schedulePersistSession();
  refreshFind();
}

async function pasteMarkdown(text, range) {
  const doc = activeDoc();
  if (!doc || projection.loading || state.sourceMode) return;
  try {
    const scrollTop = els.pane.scrollTop;
    const prefix = range.cloneRange();
    prefix.selectNodeContents(els.wysiwyg);
    prefix.setEnd(range.startContainer, range.startOffset);
    const prefixLength = prefix.toString().length;
    const source = markdownPasteSource(els.wysiwyg, range, doc.content, text, html => {
      const detached = document.createElement('div'); detached.innerHTML = html;
      return visualTransactions.preview(doc, detached);
    });
    documentHistory.cancel(doc);
    documentHistory.record(doc, doc.content);
    if (!sourceEngine.commitSource(doc, source, true, 'markdown-paste')) return;
    documentHistory.schedule(doc, () => doc.content);
    renderTabs(); updateStatus(); schedulePersistSession();
    const revision = doc.sourceRevision;
    const transaction = transactionGate.capture();
    const pastedHtml = await window.inkdown.renderMarkdown(text);
    if (!transactionGate.isCurrent(transaction) || activeDoc() !== doc || doc.sourceRevision !== revision || state.sourceMode) return;
    const fragment = document.createElement('div'); fragment.innerHTML = pastedHtml;
    await renderActive({ scrollTop, activate: () => restoreClipboardCaret(els.wysiwyg, prefixLength + fragment.textContent.trimEnd().length) });
  } catch (error) { toast(`粘贴失败：${error.message}`); }
}

function sourceChanged() {
  const doc = activeDoc();
  if (!doc || !state.sourceMode) return;
  if (els.source.value === doc.content.replace(/\r\n?/g, '\n')) return false;
  if (!sourceEngine.commitSource(doc, els.source.value, true)) return false;
  documentHistory.schedule(doc, () => doc.content);
  renderTabs(); updateStatus();
  schedulePersistSession();
  refreshFind();
  return true;
}

async function pasteSourceClipboard(text, html = '', plain = false) {
  const transaction = transactionGate.capture();
  const start = els.source.selectionStart, end = els.source.selectionEnd;
  const safeHtml = html && !plain ? await window.inkdown.sanitizeHtml(html) : '';
  if (!transactionGate.isCurrent(transaction) || !state.sourceMode || els.source.selectionStart !== start || els.source.selectionEnd !== end) return;
  const markdown = plain ? null : clipboardToMarkdown(text, safeHtml, html => markdownCodec.toMarkdown(html));
  documentHistory.cancel(activeDoc());
  sourceEditing.insert(markdown ?? text);
}

function flushEditor() {
  const doc = activeDoc();
  if (!doc) return null;
  if (state.sourceMode) sourceChanged();
  return doc;
}

async function openFiles() {
  state.documentRevision++;
  try {
    await documentOpen.run(() => window.inkdown.openFiles(), async files => {
      for (const file of files) {
        if (file.importedFormat && !['Markdown', 'Text'].includes(file.importedFormat))
          toast(`${file.importedFormat} 已转换为 Markdown${file.importWarnings?.length ? `（${file.importWarnings.length} 条提示）` : ''}`);
      }
      await addDocuments(files);
    });
  } catch (error) { toast(`导入失败：${error.message}`); }
}

async function openFolder(folderPath = null) {
  state.documentRevision++;
  try {
    await documentOpen.run(() => folderPath ? window.inkdown.loadFolder(folderPath) : window.inkdown.openFolder(), folder => {
      searchPane.invalidate();
      state.folder = folder;
      els.folderName.textContent = folder.name;
      renderFileTree(); setSidebarMode('files', true); persistSession();
    });
  } catch (error) { toast(`无法打开文件夹：${error.message}`); }
}

async function openPath(filePath) {
  state.documentRevision++;
  try { await documentOpen.run(() => documentOpen.readPath(filePath), addDocument); }
  catch (error) { toast(`无法打开文件：${error.message}`); }
}

let externalOpenTask = Promise.resolve(false);
function consumeExternalOpenPaths() {
  if (document.body.inert) return Promise.resolve(false);
  externalOpenTask = externalOpenTask.then(async () => {
    const paths = await window.inkdown.takeExternalOpenPaths();
    if (!paths.length) return false;
    state.documentRevision++;
    const result = await documentOpen.run(isCurrent => documentOpen.readPaths(paths, isCurrent), async ({ files, errors }) => {
      for (const { error } of errors) toast(`无法打开文件：${error.message}`);
      if (files.length) await addDocuments(files);
    });
    return Boolean(result?.files.length);
  });
  return externalOpenTask;
}

async function saveDocument(doc = activeDoc(), as = false) {
  if (!doc) return null;
  if (doc === activeDoc()) await flushEditor();
  const savedContent = doc.content;
  const savedRevision = doc.sourceRevision || 0;
  return saveCoordinator.run(doc, async isCurrent => {
    let result;
    try {
      result = as || !doc.path ? await window.inkdown.saveFileAs(doc.name, savedContent) : await window.inkdown.saveFile(doc.path, savedContent);
    } catch (error) {
      if (isCurrent()) toast(`保存失败：${error.message}`);
      return null;
    }
    if (!result || !isCurrent()) return null;
    doc.path = result.path; doc.name = result.name;
    doc.dirty = doc.content !== savedContent || (doc.sourceRevision || 0) !== savedRevision;
    addRecentFile(doc); renderRecentFiles(); renderTabs(); updateStatus(); persistSession();
    toast(doc.dirty ? '已保存此前版本，当前修改尚未保存' : '已保存');
    return result;
  });
}

async function closeDocument(id) {
  const doc = store.docs.find(item => item.id === id);
  if (!doc) return;
  if (doc.dirty && !confirm(`“${doc.name}”尚未保存，确定关闭吗？`)) return;
  documentHistory.cancel(doc);
  saveCoordinator.cancel(doc);
  store.close(id);
  renderTabs(); await renderActive(); persistSession();
}

async function reopenClosed() {
  const cached = store.takeClosed();
  if (!cached) return toast('没有最近关闭的文档');
  if (cached.path) await openPath(cached.path); else createDocument({ name: cached.name, content: cached.content, dirty: true });
}

function renderTabs() {
  els.tabs.innerHTML = '';
  store.docs.forEach(doc => {
    const tab = document.createElement('div');
    tab.className = `tab${doc.id === store.activeId ? ' active' : ''}`;
    tab.role = 'tab'; tab.draggable = true; tab.dataset.id = doc.id;
    if (doc.dirty) { const dot = document.createElement('span'); dot.className = 'dirty-dot'; tab.append(dot); }
    const name = document.createElement('span'); name.className = 'tab-name'; name.textContent = doc.name; name.title = doc.path || doc.name;
    const close = document.createElement('button'); close.className = 'tab-close'; close.textContent = '×'; close.title = '关闭';
    close.onclick = event => { event.stopPropagation(); closeDocument(doc.id); };
    tab.append(name, close);
    tab.onclick = () => activateDocument(doc.id);
    tab.ondblclick = () => doc.path ? renameDocument(doc) : saveDocument(doc, true);
    tab.ondragstart = () => { state.draggedTabId = doc.id; };
    tab.ondragover = event => event.preventDefault();
    tab.ondrop = event => {
      event.preventDefault();
      if (store.moveTo(state.draggedTabId, doc.id)) renderTabs();
    };
    els.tabs.append(tab);
  });
}

async function renameDocument(doc) {
  if (!doc.path) return saveDocument(doc, true);
  const name = prompt('重命名文件：', doc.name);
  if (!name || name === doc.name) return;
  try {
    const result = await window.inkdown.renamePath(doc.path, name);
    doc.path = result.path; doc.name = result.name; renderTabs();
    if (state.folder) await openFolder(state.folder.path);
    persistSession();
  } catch (error) { toast(`重命名失败：${error.message}`); }
}

function flattenTree(items = state.folder?.children || [], output = []) {
  items.forEach(item => item.type === 'folder' ? flattenTree(item.children, output) : output.push(item));
  return output;
}

function renderFileTree() {
  const query = els.fileFilter.value.trim().toLowerCase();
  els.fileTree.innerHTML = '';
  if (!state.folder) { els.fileTree.innerHTML = '<div class="empty-side">打开文件夹，在这里管理 Markdown 文档。</div>'; return; }
  const appendItems = (items, parent) => items.forEach(item => {
    const row = document.createElement('div'); row.className = 'tree-item'; row.dataset.path = item.path; row.tabIndex = -1;
    const caret = document.createElement('span'); caret.className = 'tree-caret'; caret.textContent = item.type === 'folder' ? '▾' : '';
    const icon = document.createElement('span'); icon.className = 'tree-icon'; icon.textContent = item.type === 'folder' ? '▱' : '◇';
    const label = document.createElement('span'); label.className = 'tree-label'; label.textContent = item.name;
    row.append(caret, icon, label); parent.append(row);
    if (item.type === 'folder') {
      const children = document.createElement('div'); children.className = 'tree-children'; parent.append(children); appendItems(item.children, children);
      row.onclick = () => { children.classList.toggle('hidden'); caret.textContent = children.classList.contains('hidden') ? '›' : '▾'; };
    } else {
      if (activeDoc()?.path === item.path) row.classList.add('active');
      row.onclick = () => openPath(item.path);
      row.oncontextmenu = event => { event.preventDefault(); fileContextMenu(item, event.clientX, event.clientY); };
    }
  });
  appendItems(filterWorkspaceTree(state.folder.children, query), els.fileTree);
}

function fileContextMenu(item, x, y) {
  const menu = els.contextMenu;
  menu.innerHTML = '';
  const actions = [
    ['打开', () => openPath(item.path)],
    ['重命名…', async () => { const name = prompt('重命名文件：', item.name); if (name) { try { await window.inkdown.renamePath(item.path, name); await openFolder(state.folder.path); } catch (error) { toast(error.message); } } }],
    ['在资源管理器中显示', () => window.inkdown.revealPath(item.path)]
  ];
  actions.forEach(([label, handler]) => { const button = document.createElement('button'); button.textContent = label; button.onclick = () => { hideMenus(); handler(); }; menu.append(button); });
  showMenu(menu, x, y);
}

function editorContextMenu(x, y, target = null) {
  const menu = els.contextMenu; menu.innerHTML = '';
  const tableContext = inputController.tableContext(target);
  if (tableContext) inputController.activateTableCell(target);
  const groups = tableContext ? [
    [['在上方插入行','table-row-before'],['在下方插入行','table-row-after'],['删除当前行','table-row-delete']],
    [['在左侧插入列','table-column-before'],['在右侧插入列','table-column-after'],['删除当前列','table-column-delete']],
    [['左对齐','table-align-left'],['居中','table-align-center'],['右对齐','table-align-right'],['默认对齐','table-align-default']],
    [['调整表格尺寸','table-resize'],['删除表格','table-delete']]
  ] : [
    [['剪切','cut'],['复制','copy'],['粘贴','paste']],
    [['粗体','bold'],['斜体','italic'],['链接','link']],
    [['正文','paragraph'],['一级标题','heading-1'],['二级标题','heading-2']]
  ];
  groups.forEach((group, groupIndex) => {
    if (groupIndex) menu.append(document.createElement('span'));
    group.forEach(([label, action]) => { const button = document.createElement('button'); button.textContent = label; button.dataset.action = action; menu.append(button); });
  });
  showMenu(menu, x, y);
}

async function createFileInFolder() {
  if (!state.folder) return openFolder();
  const name = prompt('新建 Markdown 文件：', '未命名.md');
  if (!name) return;
  try {
    const folderPath = state.folder.path;
    const file = await window.inkdown.createFile(folderPath, name);
    await addDocument(file);
    void refreshFolderTree(folderPath);
  }
  catch (error) { toast(`新建失败：${error.message}`); }
}

async function refreshFolderTree(folderPath) {
  try {
    const folder = await window.inkdown.loadFolder(folderPath);
    if (!folder || state.folder?.path !== folderPath) return;
    state.folder = folder;
    els.folderName.textContent = folder.name;
    renderFileTree();
    persistSession();
  } catch (error) { toast(`文件树刷新失败：${error.message}`); }
}

function setSidebarMode(mode, reveal = false) {
  state.settings.sidebarMode = mode; saveSettings(state.settings);
  $$('.sidebar-modes button').forEach(button => button.classList.toggle('active', button.dataset.sidebarMode === mode));
  els.filesPane.classList.toggle('hidden', mode !== 'files');
  els.outlinePane.classList.toggle('hidden', mode !== 'outline');
  els.searchPane.classList.toggle('hidden', mode !== 'search');
  if (reveal) toggleSidebar(true);
  if (mode === 'outline') renderOutline();
  if (mode === 'search') setTimeout(() => {
    els.globalSearchInput.focus();
    if (els.globalSearchInput.value.trim()) void searchPane.search();
  }, 0);
}

function toggleSidebar(forceOpen = null) {
  const collapse = forceOpen === null ? !els.sidebar.classList.contains('collapsed') : !forceOpen;
  els.sidebar.classList.toggle('collapsed', collapse);
  $('#showSidebarBtn').classList.toggle('hidden', !collapse);
}

function scheduleOutline() { clearTimeout(state.outlineTimer); state.outlineTimer = setTimeout(renderOutline, 120); }

function getHeadings() {
  if (state.sourceMode) {
    return activeDoc()?.content.split(/\r?\n/).map((line, index) => {
      const match = line.match(/^(#{1,6})\s+(.+)/); return match ? { level: match[1].length, text: match[2], line: index + 1 } : null;
    }).filter(Boolean) || [];
  }
  return [...els.wysiwyg.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((node, index) => {
    node.id ||= `inkdown-heading-${index + 1}`;
    return { level: Number(node.tagName.slice(1)), text: node.textContent || '未命名标题', node, id: node.id };
  });
}

function renderOutline() {
  const headings = getHeadings();
  els.outline.innerHTML = '';
  if (!headings.length) { els.outline.innerHTML = '<div class="empty-side">当前文档还没有标题。</div>'; refreshTocs([]); return; }
  headings.forEach(item => {
    const link = document.createElement('a'); link.className = `outline-item level-${item.level}`; link.textContent = item.text;
    link.onclick = () => {
      if (state.sourceMode) {
        const lines = els.source.value.split('\n'); const offset = lines.slice(0, item.line - 1).reduce((sum, line) => sum + line.length + 1, 0);
        els.source.focus(); els.source.setSelectionRange(offset, offset + lines[item.line - 1].length);
      } else item.node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    els.outline.append(link);
  });
  refreshTocs(headings);
}

function renderToc(node, headings = getHeadings()) {
  node.innerHTML = '<strong>目录</strong>';
  headings.forEach(item => {
    const link = document.createElement('a'); link.className = `toc-level-${item.level}`; link.textContent = item.text;
    link.onclick = event => { event.preventDefault(); item.node?.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    node.append(link);
  });
}

function refreshTocs(headings = getHeadings()) { $$('.document-toc').forEach(node => renderToc(node, headings)); }

function renderRecentFiles() {
  const recent = loadRecentFiles(); els.recentFiles.innerHTML = '';
  if (!recent.length) { els.recentFiles.innerHTML = '<div class="empty-side">还没有最近打开的文档。</div>'; return; }
  recent.forEach(file => {
    const button = document.createElement('button'); button.className = 'recent-file';
    button.innerHTML = `<span>◇</span><div><strong>${escapeText(file.name)}</strong><small>${escapeText(file.path)}</small></div>`;
    button.onclick = () => openPath(file.path); els.recentFiles.append(button);
  });
}

function setEditorMode(sourceMode) {
  projection.invalidate();
  state.sourceMode = sourceMode;
  els.wysiwyg.classList.toggle('hidden', sourceMode);
  els.source.classList.toggle('hidden', !sourceMode);
  els.sourceModeBtn.classList.toggle('active', sourceMode);
  els.tableToolbar.classList.add('hidden');
  els.selectionToolbar.classList.add('hidden');
  findController.reset();
}

async function toggleSource() {
  const doc = activeDoc(); if (!doc) return;
  if (state.sourceMode) sourceChanged();
  setEditorMode(!state.sourceMode);
  await renderActive();
}

function format(command, value = null) {
  if (state.sourceMode) return sourceEditing.format(command);
  els.wysiwyg.focus(); document.execCommand(command, false, value); inputController.handleInput();
}

function formatBlock(tag) { format('formatBlock', tag); }


function handleSourceTab(event) {
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl && event.code === 'KeyZ') { event.preventDefault(); return restoreHistory(event.shiftKey ? 1 : -1); }
  if (ctrl && event.code === 'KeyY') { event.preventDefault(); return restoreHistory(1); }
  if (event.key !== 'Tab' || ctrl || event.altKey) return;
  event.preventDefault(); event.stopPropagation();
  sourceEditing.indent(event.shiftKey);
}

async function insertImage() {
  const doc = activeDoc(); if (!doc) return;
  const transaction = transactionGate.capture();
  const image = await window.inkdown.chooseImage(doc.path);
  if (!image || !transactionGate.isCurrent(transaction)) return;
  if (state.sourceMode) return sourceEditing.insert(`![图片](${image.markdownPath})`);
  insertImageNode(image);
}

function insertImageNode(image, range = null) {
  if (range) { const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); }
  const src = `file:///${image.path.replace(/\\/g, '/')}`;
  format('insertHTML', `<img src="${escapeAttribute(src)}" data-markdown-src="${escapeAttribute(image.markdownPath)}" alt="图片">`);
}

async function handleDrop(event) {
  event.preventDefault(); els.pane.classList.remove('drag-over');
  const files = [...event.dataTransfer.files]; if (!files.length) return;
  const images = files.filter(file => /^image\//.test(file.type));
  const doc = activeDoc();
  if (images.length && doc) {
    const transaction = transactionGate.capture();
    let range = document.caretRangeFromPoint?.(event.clientX, event.clientY) || null;
    for (const file of images) {
      try {
        const image = await window.inkdown.importImage(file, doc.path);
        if (!transactionGate.isCurrent(transaction)) return toast('文档已变化，已取消过期的图片插入');
        insertImageNode(image, range); range = null; transactionGate.refresh(transaction);
      }
      catch (error) { toast(`图片导入失败：${error.message}`); }
    }
    return;
  }
  for (const file of files) {
    const filePath = window.inkdown.filePath(file);
    if (/\.(md|markdown|mdown|mkd|mkdn|txt|text|log|html?|docx)$/i.test(filePath)) await openPath(filePath);
  }
}

function insertTable() {
  if (state.sourceMode) return sourceEditing.wrap('| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n| 内容 | 内容 | 内容 |\n', '');
  format('insertHTML', '<table><thead><tr><th>列 1</th><th>列 2</th><th>列 3</th></tr></thead><tbody><tr><td><br></td><td><br></td><td><br></td></tr></tbody></table><p><br></p>');
}

function executeTableAction(action) {
  if (state.sourceMode) return false;
  const command = action.replace(/^table-/, '');
  if (command === 'resize') {
    const context = inputController.tableContext();
    if (!context) return false;
    return inputController.executeTableCommand('resize', { rows: els.tableRows.value, columns: els.tableColumns.value });
  }
  return inputController.executeTableCommand(command);
}

async function executeAction(action, value) {
  if (document.body.inert) return;
  const doc = activeDoc();
  if (action.startsWith('table-')) return executeTableAction(action);
  if (/^heading-[1-6]$/.test(action)) { const level = Number(action.slice(-1)); return state.sourceMode ? sourceEditing.prefix('#'.repeat(level) + ' ', true) : formatBlock(`h${level}`); }
  switch (action) {
    case 'new': return createDocument();
    case 'open': return openFiles();
    case 'open-recent': return typeof value === 'string' ? openPath(value) : undefined;
    case 'clear-recent': clearRecentFiles(); renderRecentFiles(); return;
    case 'folder': return openFolder();
    case 'save': return saveDocument();
    case 'save-as': return saveDocument(doc, true);
    case 'close': return doc && closeDocument(doc.id);
    case 'reopen-closed': return reopenClosed();
    case 'quick-open': return openPalette('files');
    case 'command-palette': return openPalette('commands');
    case 'paragraph': return state.sourceMode ? sourceEditing.prefix('', true) : formatBlock('p');
    case 'bold': return format('bold');
    case 'italic': return format('italic');
    case 'underline': return format('underline');
    case 'strike': return format('strikeThrough');
    case 'inline-code': return state.sourceMode ? sourceEditing.wrap('`') : wrapSelection('code');
    case 'highlight': return state.sourceMode ? sourceEditing.wrap('==') : wrapSelection('mark');
    case 'code-block': return state.sourceMode ? sourceEditing.wrap('```\n', '\n```') : formatBlock('pre');
    case 'math-block': return state.sourceMode ? sourceEditing.wrap('$$\n', '\n$$') : format('insertHTML', '<pre class="math-block"><code><br></code></pre><p><br></p>');
    case 'quote': return state.sourceMode ? sourceEditing.prefix('> ') : formatBlock('blockquote');
    case 'ordered-list': return state.sourceMode ? sourceEditing.prefix('1. ') : format('insertOrderedList');
    case 'unordered-list': return state.sourceMode ? sourceEditing.prefix('- ') : format('insertUnorderedList');
    case 'task-list': return state.sourceMode ? sourceEditing.prefix('- [ ] ') : format('insertHTML', '<ul><li><input type="checkbox"> <span><br></span></li></ul><p><br></p>');
    case 'table': return insertTable();
    case 'toc': {
      if (state.sourceMode) return sourceEditing.insert('[toc]');
      const toc = document.createElement('nav'); toc.className = 'document-toc'; toc.contentEditable = 'false'; renderToc(toc);
      const block = inputController.currentBlock(); if (block) { block.parentNode.insertBefore(toc, block); inputController.handleInput(); }
      return;
    }
    case 'horizontal-rule': return state.sourceMode ? sourceEditing.insert('\n---\n') : format('insertHorizontalRule');
    case 'frontmatter': {
      if (state.sourceMode) { els.source.setRangeText('---\ntitle: \ntags: []\n---\n\n', 0, 0, 'end'); sourceChanged(); return; }
      const pre = document.createElement('pre'); pre.className = 'frontmatter'; pre.innerHTML = '<code>title: <br>tags: []</code>'; els.wysiwyg.prepend(pre); inputController.placeCaret(pre.querySelector('code'), false); inputController.handleInput(); return;
    }
    case 'link': return insertLink();
    case 'image': return insertImage();
    case 'clear-format': return state.sourceMode ? null : format('removeFormat');
    case 'source': return toggleSource();
    case 'sidebar': return toggleSidebar();
    case 'files': return setSidebarMode('files', true);
    case 'outline': return setSidebarMode('outline', true);
    case 'global-search': return setSidebarMode('search', true);
    case 'focus-mode': return toggleMode('focus-mode', $('#focusBtn'));
    case 'theme': return cycleTheme();
    case 'toolbar': state.settings.showToolbar = !state.settings.showToolbar; saveSettings(state.settings); return toast(`浮动工具栏已${state.settings.showToolbar ? '开启' : '关闭'}`);
    case 'settings': return openSettings();
    case 'open-user-style': {
      const result = await window.inkdown.openUserStyle();
      return toast(result?.error ? `无法打开样式文件：${result.error}` : `样式文件：${result.path}`);
    }
    case 'reload-user-style': return loadUserStyle(true);
    case 'copy-markdown': await flushEditor(); await window.inkdown.copyText(doc?.content || ''); return toast('Markdown 已复制');
    case 'export-markdown': return exportDocument('markdown');
    case 'export-text': return exportDocument('text');
    case 'export-html': return exportDocument('html');
    case 'export-pdf': return exportDocument('pdf');
    case 'export-docx': return exportDocument('docx');
    case 'undo': return restoreHistory(-1);
    case 'redo': return restoreHistory(1);
    case 'cut': return document.execCommand('cut');
    case 'copy': return document.execCommand('copy');
    case 'select-all': currentEditor().focus(); return document.execCommand('selectAll');
    case 'paste':
    case 'paste-plain': {
      const transaction = transactionGate.capture();
      const { text, html } = action === 'paste-plain' ? { text: await window.inkdown.readClipboardText(), html: '' } : await window.inkdown.readClipboardContent();
      if (!transactionGate.isCurrent(transaction)) return;
      if (state.sourceMode) await pasteSourceClipboard(text, html, action === 'paste-plain');
      else { els.wysiwyg.focus({ preventScroll: true }); await inputController.pasteContent(text, html, action === 'paste-plain'); }
      return;
    }
    case 'increase-heading': return changeHeadingLevel(-1);
    case 'decrease-heading': return changeHeadingLevel(1);
    case 'shortcut-help': return openPalette('commands', '快捷键');
    case 'find': return openFind(false);
    case 'replace': return openFind(true);
    case 'fullscreen': return window.inkdown.toggleFullscreen();
    case 'quit': return window.inkdown.quit();
  }
}

async function exportDocument(format) {
  const doc = await flushEditor();
  if (!doc) return;
  const labels = { markdown: 'Markdown', text: '纯文本', html: 'HTML', pdf: 'PDF', docx: 'Word' };
  try {
    const result = await window.inkdown.exportDocument(format, doc.name, doc.content, doc.path || doc.sourcePath);
    if (result) toast(`${labels[format]} 已导出`);
  } catch (error) { toast(`导出失败：${error.message}`); }
}

function wrapSelection(tag) {
  if (state.sourceMode) return;
  const selection = window.getSelection(); if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0); const element = document.createElement(tag); element.append(range.extractContents());
  if (!element.textContent) element.innerHTML = '<br>'; range.insertNode(element); range.setStartAfter(element); range.collapse(true); selection.removeAllRanges(); selection.addRange(range); inputController.handleInput();
}

function insertLink() {
  const url = prompt('请输入链接地址：', 'https://'); if (!url) return;
  return state.sourceMode ? sourceEditing.wrap('[', `](${url})`) : format('createLink', url);
}

function changeHeadingLevel(delta) {
  if (state.sourceMode) return;
  const block = inputController.currentBlock(); if (!block) return;
  const match = block.tagName.match(/^H([1-6])$/); const current = match ? Number(match[1]) : 0;
  const target = Math.max(0, Math.min(6, current + delta)); formatBlock(target ? `h${target}` : 'p');
}

function editorKeydown(event) {
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl && event.key.toLowerCase() === 'z') { event.preventDefault(); restoreHistory(event.shiftKey ? 1 : -1); }
  else if (ctrl && event.key.toLowerCase() === 'y') { event.preventDefault(); restoreHistory(1); }
}

function selectionChanged(block, selection) {
  markFocusedBlock(block);
  const viewport = els.pane.getBoundingClientRect();
  const expanded = Boolean(selection?.rangeCount && !selection.isCollapsed && els.wysiwyg.contains(selection.anchorNode));
  const tableContext = inputController.tableContext();
  if (tableContext && !state.sourceMode && !expanded && !projection.loading) {
    const rect = tableContext.table.getBoundingClientRect();
    els.tableRows.value = String(tableContext.table.tBodies[0]?.rows.length || 1);
    els.tableColumns.value = String(tableContext.table.rows[0]?.cells.length || 1);
    placeFloatingToolbar(els.tableToolbar, rect, viewport, { centered: true });
  } else els.tableToolbar.classList.add('hidden');
  if (!state.settings.showToolbar || state.sourceMode || !expanded || projection.loading) return els.selectionToolbar.classList.add('hidden');
  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (!rect.width && !rect.height) return els.selectionToolbar.classList.add('hidden');
  placeFloatingToolbar(els.selectionToolbar, rect, viewport, { centered: true });
}

function markFocusedBlock(block) {
  $$('.wysiwyg > .md-focus,.wysiwyg > .md-focus-parent').forEach(node => node.classList.remove('md-focus', 'md-focus-parent'));
  const top = block?.parentElement === els.wysiwyg ? block : block?.closest('.wysiwyg > *');
  top?.classList.add('md-focus');
}

function toggleMode(className, button) { document.body.classList.toggle(className); button?.classList.toggle('active', document.body.classList.contains(className)); }

function openFind(replace = false, value = null) {
  els.findbar.classList.remove('hidden'); els.replaceInput.classList.toggle('hidden', !replace); $('#replaceBtn').classList.toggle('hidden', !replace); $('#replaceAllBtn').classList.toggle('hidden', !replace);
  if (value !== null) els.findInput.value = value;
  findController.reset(); els.findInput.focus(); els.findInput.select(); updateFindCount();
}

function closeFind() { els.findbar.classList.add('hidden'); findController.reset(); currentEditor().focus(); }

function refreshFind() {
  if (!els.findbar.classList.contains('hidden')) updateFindCount();
}

function updateFindCount(status = null) {
  const result = status || findController.snapshot(els.findInput.value);
  els.findCount.textContent = `${result.current}/${result.total}`;
  const hasQuery = Boolean(els.findInput.value);
  const hasResults = result.total > 0;
  els.findbar.classList.toggle('no-results', hasQuery && !hasResults);
  els.findCount.title = hasQuery && !hasResults ? '没有匹配结果' : `共 ${result.total} 处匹配`;
  $('#findPrev').disabled = !hasResults;
  $('#findNext').disabled = !hasResults;
}

function findText(backwards = false) {
  const query = els.findInput.value; if (!query) return;
  const keepFindInputFocused = document.activeElement === els.findInput;
  updateFindCount(findController.find(query, { backwards }));
  if (keepFindInputFocused) els.findInput.focus({ preventScroll: true });
}

function replaceText(all = false) {
  const query = els.findInput.value; const replacement = $('#replaceInput').value; if (!query) return;
  if (all) return replaceAllInDocument(query, replacement);
  if (!findController.restoreCurrent(query)) return;
  if (state.sourceMode && els.source.selectionStart !== els.source.selectionEnd) { els.source.setRangeText(replacement, els.source.selectionStart, els.source.selectionEnd, 'end'); sourceChanged(); }
  else if (!state.sourceMode) { document.execCommand('insertText', false, replacement); inputController.handleInput(); }
  findController.reset();
  findText(false);
}

async function replaceAllInDocument(query, replacement) {
  const doc = await flushEditor(); if (!doc) return;
  const result = replaceTextRanges(doc.content, query, replacement);
  if (!result.count) { toast('没有匹配内容'); return; }
  documentHistory.record(doc, doc.content);
  sourceEngine.commitSource(doc, result.value, true, 'replace-all');
  documentHistory.record(doc, doc.content);
  await renderActive(); renderTabs(); toast(`已替换 ${result.count} 处`);
}

const commands = commandPaletteItems();

function openPalette(mode = 'files', initial = '') {
  state.paletteMode = mode; state.paletteIndex = 0; els.palette.classList.remove('hidden'); els.paletteInput.value = initial === '快捷键' ? '' : initial;
  els.paletteInput.placeholder = mode === 'commands' ? '输入命令' : '快速打开文件';
  refreshPalette(); setTimeout(() => els.paletteInput.focus(), 0);
}

function refreshPalette() {
  const query = els.paletteInput.value.trim().toLowerCase();
  const source = state.paletteMode === 'commands' ? commands : flattenTree().map(file => ({ label: file.name, detail: file.path, path: file.path, type: 'file' }));
  state.paletteItems = source.filter(item => !query || `${item.label} ${item.detail}`.toLowerCase().includes(query)).slice(0, 60);
  state.paletteIndex = Math.min(state.paletteIndex, Math.max(0, state.paletteItems.length - 1));
  els.paletteResults.innerHTML = '';
  if (!state.paletteItems.length) els.paletteResults.innerHTML = '<div class="empty-side">没有匹配项目。</div>';
  state.paletteItems.forEach((item, index) => {
    const row = document.createElement('div'); row.className = `palette-item${index === state.paletteIndex ? ' selected' : ''}`;
    row.innerHTML = `<span class="palette-icon">${item.type === 'file' ? '◇' : '›'}</span><div><strong>${escapeText(item.label)}</strong><small>${escapeText(item.detail || '')}</small></div>`;
    row.onclick = () => choosePaletteItem(index); els.paletteResults.append(row);
  });
}

function choosePaletteItem(index = state.paletteIndex) {
  const item = state.paletteItems[index]; if (!item) return;
  els.palette.classList.add('hidden'); item.type === 'file' ? openPath(item.path) : executeAction(item.action);
}

function openSettings() {
  const s = state.settings;
  $('#settingTheme').value = s.theme; $('#settingFont').value = s.fontFamily; $('#settingFontSize').value = s.fontSize; $('#settingLineHeight').value = s.lineHeight; $('#settingContentWidth').value = s.contentWidth;
  $('#settingSpellcheck').checked = s.spellcheck; $('#settingStatusBar').checked = s.showStatusBar; $('#settingToolbar').checked = s.showToolbar; $('#settingRestore').checked = s.restoreSession;
  updateSettingsOutputs(); els.settings.classList.remove('hidden');
}

function updateSettingsOutputs() { $('#fontSizeOutput').textContent = `${$('#settingFontSize').value}px`; $('#lineHeightOutput').textContent = $('#settingLineHeight').value; $('#contentWidthOutput').textContent = `${$('#settingContentWidth').value}px`; }

function readSettingsForm() {
  state.settings = { ...state.settings, theme: $('#settingTheme').value, fontFamily: $('#settingFont').value, fontSize: Number($('#settingFontSize').value), lineHeight: Number($('#settingLineHeight').value), contentWidth: Number($('#settingContentWidth').value), spellcheck: $('#settingSpellcheck').checked, showStatusBar: $('#settingStatusBar').checked, showToolbar: $('#settingToolbar').checked, restoreSession: $('#settingRestore').checked };
  saveSettings(state.settings); applySettings();
}

async function applySettings() {
  let theme = state.settings.theme; if (theme === 'system') theme = await window.inkdown.getSystemTheme();
  document.body.classList.remove('theme-dark', 'theme-sepia'); if (theme === 'dark') document.body.classList.add('theme-dark'); if (theme === 'sepia') document.body.classList.add('theme-sepia');
  const fonts = { system: '"Segoe UI Variable Text","Segoe UI","Microsoft YaHei UI",sans-serif', serif: 'Georgia,"Noto Serif SC","Songti SC",serif', mono: '"Cascadia Code","Cascadia Mono",Consolas,monospace' };
  document.documentElement.style.setProperty('--editor-font', fonts[state.settings.fontFamily]); document.documentElement.style.setProperty('--editor-size', `${state.settings.fontSize}px`); document.documentElement.style.setProperty('--editor-line', state.settings.lineHeight); document.documentElement.style.setProperty('--content-width', `${state.settings.contentWidth}px`);
  els.wysiwyg.spellcheck = state.settings.spellcheck; document.body.classList.toggle('hide-status', !state.settings.showStatusBar);
}

async function loadUserStyle(notify = false) {
  const styleNode = $('#userStyle');
  try {
    const result = await window.inkdown.loadUserStyle();
    styleNode.textContent = `${compileMarkdownStyle(result.config)}\n${result.css || ''}`;
    if (notify) toast(`已重新加载：${result.path}`);
    return result;
  } catch (error) {
    if (!styleNode.textContent) styleNode.textContent = compileMarkdownStyle(DEFAULT_MARKDOWN_STYLE);
    if (notify) toast(`自定义样式加载失败：${error.message}`);
    return null;
  }
}

function cycleTheme() { const order = ['light','dark','sepia','system']; state.settings.theme = order[(order.indexOf(state.settings.theme) + 1) % order.length]; saveSettings(state.settings); applySettings(); toast(`主题：${({light:'明亮',dark:'深色',sepia:'暖色',system:'跟随系统'})[state.settings.theme]}`); }

function updateStatus() {
  const doc = activeDoc(); if (!doc) return;
  els.saveState.textContent = doc.dirty ? '未保存' : '已保存'; els.saveState.style.color = doc.dirty ? '#c38b4a' : '';
  const content = doc.content || ''; const chars = content.replace(/\s/g, '').length; const words = (content.match(/[\u3400-\u9fff]|[A-Za-z0-9]+/g) || []).length; const lines = content.split('\n').length; const minutes = Math.max(1, Math.ceil(words / 300));
  els.stats.textContent = `${chars} 字`;
  els.statsDetails.textContent = `${words} 词\n${chars} 字\n${lines} 行\n约 ${minutes} 分钟阅读`;
  const panel = $('#documentStats');
  if (panel.dataset.documentId !== String(doc.id)) panel.open = false;
  panel.dataset.documentId = String(doc.id);
}

function persistSession() {
  return sessionRecovery.flush().then(() => true, error => { toast(`恢复快照未写入，原文件未受影响：${error.message}`); return false; });
}
function schedulePersistSession() { sessionRecovery.schedule(); }

async function restoreSession() {
  if (!state.settings.restoreSession) return;
  let earlyActive = null;
  let snapshot;
  const navigationRevision = state.documentRevision;
  try { snapshot = await recoveryStorage.load(); }
  catch (error) { state.recoveryReadFailed = true; toast(`无法读取恢复快照：${error.message}`); return; }
  if (navigationRevision !== state.documentRevision) return;
  const restored = await sessionRestoreCoordinator.load(snapshot, {
    onActive: async ({ active }) => {
      const data = active.data;
      if (!data) return;
      const doc = store.create({ ...data, dirty: active.kind !== 'file' }, false);
      doc.history = []; doc.historyIndex = -1;
      if (doc.path) addRecentFile(doc);
      store.activate(doc.id); earlyActive = { ...active, doc };
      renderRecentFiles(); renderTabs(); await renderActive();
    }
  });
  if (!restored) return;
  const { session, folder, files } = restored;
  if (folder) {
    searchPane.invalidate();
    state.folder = folder;
    els.folderName.textContent = folder.name;
    renderFileTree();
    setSidebarMode('files', true);
  }
  for (const file of files.filter(Boolean)) {
    const doc = store.create({ ...file, dirty: false }, false);
    if (!doc.history) { doc.history = []; doc.historyIndex = -1; }
    addRecentFile(doc);
  }
  for (const snapshot of session.dirtyFiles || []) {
    if (earlyActive?.kind === 'dirty' && snapshot.path === earlyActive.doc.path) continue;
    let doc = store.docs.find(item => item.path === snapshot.path);
    if (!doc) doc = store.create({ ...snapshot, dirty: true }, false);
    else Object.assign(doc, snapshot, { dirty: true });
    doc.history = []; doc.historyIndex = -1;
  }
  const restoredDrafts = [];
  for (let index = 0; index < (session.drafts || []).length; index++) {
    const draft = session.drafts[index];
    const doc = earlyActive?.kind === 'draft' && earlyActive.index === index
      ? earlyActive.doc
      : store.create({ ...draft, dirty: true }, false);
    if (!doc.history) { doc.history = []; doc.historyIndex = -1; }
    restoredDrafts.push(doc);
  }
  const pathOrder = new Map([...new Set(session.paths || [])].map((filePath, index) => [filePath, index]));
  const draftOrder = new Map(restoredDrafts.map((doc, index) => [doc.id, pathOrder.size + index]));
  store.docs.sort((left, right) => (pathOrder.get(left.path) ?? draftOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER)
    - (pathOrder.get(right.path) ?? draftOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER));
  const activeFile = session.activePath ? store.docs.find(doc => doc.path === session.activePath) : null;
  const activeDraft = Number.isInteger(session.activeDraftIndex) ? restoredDrafts[session.activeDraftIndex] : null;
  const restoredActive = activeFile || activeDraft || store.docs[0];
  if (restoredActive) store.activate(restoredActive.id);
  renderRecentFiles(); renderTabs();
  if (!earlyActive) await renderActive();
  schedulePersistSession();
}

function showMenu(menu, x, y) { hideMenus(); menu.style.left = `${Math.min(x, innerWidth - 180)}px`; menu.style.top = `${Math.min(y, innerHeight - 260)}px`; menu.classList.remove('hidden'); }
function hideMenus() { els.contextMenu.classList.add('hidden'); els.moreMenu.classList.add('hidden'); appMenu?.close(); }

let toastTimer;
function toast(message) { clearTimeout(toastTimer); els.toast.textContent = message; els.toast.classList.remove('hidden'); toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 1800); }
function escapeText(value) { const span = document.createElement('span'); span.textContent = String(value || ''); return span.innerHTML; }
function escapeAttribute(value) { return escapeText(value).replace(/"/g, '&quot;'); }

function bindUi() {
  els.source.addEventListener('paste', event => {
    event.preventDefault();
    void pasteSourceClipboard(event.clipboardData.getData('text/plain'), event.clipboardData.getData('text/html'));
  });
  appMenu = new AppMenu(els.appMenuBar, executeAction, () => {
    const recent = loadRecentFiles();
    return recent.length ? [...recent.map(file => ({ action: 'open-recent', label: file.name, title: file.path, value: file.path })),
      null, commandItem('clear-recent')] : [{ label: '暂无最近文件', disabled: true }];
  });
  $('#newBtn').onclick = $('#welcomeNew').onclick = () => executeAction('new');
  $('#welcomeOpen').onclick = () => executeAction('open');
  $('#welcomeFolder').onclick = $('#openFolderSideBtn').onclick = () => executeAction('folder');
  $('#createFileBtn').onclick = createFileInFolder;
  $('#collapseSidebarBtn').onclick = () => toggleSidebar(false); $('#showSidebarBtn').onclick = () => toggleSidebar(true);
  els.sourceModeBtn.onclick = toggleSource; $('#moreBtn').onclick = event => { event.stopPropagation(); els.moreMenu.classList.toggle('hidden'); };
  $$('.sidebar-modes button').forEach(button => button.onclick = () => setSidebarMode(button.dataset.sidebarMode));
  els.fileFilter.oninput = renderFileTree;
  searchPane.bind();
  els.source.addEventListener('input', sourceChanged);
  els.source.addEventListener('keydown', handleSourceTab);
  let toolbarFrame = null;
  const scheduleToolbars = () => {
    if (toolbarFrame !== null) return;
    toolbarFrame = requestAnimationFrame(() => { toolbarFrame = null; selectionChanged(inputController.currentBlock(), window.getSelection()); });
  };
  els.pane.addEventListener('scroll', scheduleToolbars, { passive: true });
  window.addEventListener('resize', scheduleToolbars);
  new ResizeObserver(scheduleToolbars).observe(els.pane);
  els.pane.addEventListener('dragover', event => { event.preventDefault(); els.pane.classList.add('drag-over'); });
  els.pane.addEventListener('dragleave', () => els.pane.classList.remove('drag-over'));
  els.pane.addEventListener('drop', handleDrop);
  $('#focusBtn').onclick = () => executeAction('focus-mode');
  document.addEventListener('mousedown', event => { if (!event.target.closest('#documentStats')) $('#documentStats').open = false; });
  $$('.selection-toolbar [data-action]').forEach(button => button.onmousedown = event => { event.preventDefault(); executeAction(button.dataset.action); els.selectionToolbar.classList.add('hidden'); });
  els.wysiwyg.addEventListener('contextmenu', event => { event.preventDefault(); editorContextMenu(event.clientX, event.clientY, event.target); });
  els.tableToolbar.addEventListener('mousedown', event => { if (!event.target.closest('input')) event.preventDefault(); });
  els.tableToolbar.addEventListener('click', event => {
    const action = event.target.closest('[data-table-action]')?.dataset.tableAction;
    if (action) executeTableAction(`table-${action}`);
  });
  els.contextMenu.onclick = event => { const action = event.target.closest('[data-action]')?.dataset.action; if (action) { hideMenus(); executeAction(action); } };
  els.moreMenu.onclick = event => { const action = event.target.closest('[data-action]')?.dataset.action; if (action) { hideMenus(); executeAction(action); } };
  document.addEventListener('mousedown', event => {
    if (!event.target.closest('.context-menu') && !event.target.closest('#moreBtn') && !event.target.closest('#appMenuBar')) hideMenus();
  });
  $('#findPrev').onclick = () => findText(true); $('#findNext').onclick = () => findText(false); $('#replaceBtn').onclick = () => replaceText(false); $('#replaceAllBtn').onclick = () => replaceText(true); $('#findClose').onclick = closeFind;
  els.findInput.oninput = () => updateFindCount(); els.findInput.onkeydown = event => { if (event.key === 'Enter') findText(event.shiftKey); if (event.key === 'Escape') closeFind(); }; els.replaceInput.onkeydown = event => { if (event.key === 'Enter') replaceText(false); if (event.key === 'Escape') closeFind(); };
  els.paletteInput.oninput = refreshPalette; els.paletteInput.onkeydown = event => {
    if (event.key === 'ArrowDown') { event.preventDefault(); state.paletteIndex = Math.min(state.paletteItems.length - 1, state.paletteIndex + 1); refreshPalette(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); state.paletteIndex = Math.max(0, state.paletteIndex - 1); refreshPalette(); }
    else if (event.key === 'Enter') { event.preventDefault(); choosePaletteItem(); }
    else if (event.key === 'Escape') els.palette.classList.add('hidden');
  };
  els.palette.onclick = event => { if (event.target === els.palette) els.palette.classList.add('hidden'); };
  $('#settingsClose').onclick = $('#settingsDone').onclick = () => { readSettingsForm(); els.settings.classList.add('hidden'); };
  els.settings.onclick = event => { if (event.target === els.settings) { readSettingsForm(); els.settings.classList.add('hidden'); } };
  $$('#settingsModal input,#settingsModal select').forEach(control => control.oninput = () => { updateSettingsOutputs(); readSettingsForm(); });
  $('#resetSettingsBtn').onclick = () => { state.settings = { ...defaultSettings }; saveSettings(state.settings); applySettings(); openSettings(); };
}

function bindKeyboard() {
  document.addEventListener('keydown', event => {
    if (document.body.inert) { event.preventDefault(); return; }
    if (!els.settings.classList.contains('hidden') && event.key === 'Escape') return els.settings.classList.add('hidden');
    if (!els.palette.classList.contains('hidden')) return;
    if (event.key === 'Escape') { closeFind(); hideMenus(); els.selectionToolbar.classList.add('hidden'); return; }
    const action = resolveKeyboardAction(event);
    if (action === 'next-document') { event.preventDefault(); return activateDocument(store.adjacentId(event.shiftKey ? -1 : 1)); }
    if (action) { event.preventDefault(); executeAction(action); }
  });
}

async function boot() {
  bindUi(); bindKeyboard(); void applySettings(); setSidebarMode(state.settings.sidebarMode || 'files'); renderRecentFiles();
  let closeGeneration = null;
  window.inkdown.onRecoveryFlushRequested(async generation => {
    closeGeneration = generation;
    document.body.inert = true;
    // Do not replace a still-loading recovery snapshot with partial/empty tabs.
    await startupRecoveryTask.catch(() => {});
    if (closeGeneration !== generation) return;
    state.documentRevision++;
    projection.begin(activeDoc()?.id); // Invalidate late clipboard/render/open results.
    const success = state.recoveryReadFailed && !store.docs.length ? true : await persistSession();
    if (closeGeneration !== generation) return;
    if (!success) { closeGeneration = null; document.body.inert = false; await renderActive(); void consumeExternalOpenPaths(); }
    await window.inkdown.completeRecoveryClose(success, generation);
  });
  window.inkdown.onRecoveryCloseCancelled(() => {
    closeGeneration = null; document.body.inert = false; void renderActive().then(() => consumeExternalOpenPaths());
  });
  window.inkdown.onExternalOpenPathsAvailable(() => { void consumeExternalOpenPaths(); });
  void loadUserStyle();
  window.inkdown.getVersion().then(version => { $('#versionLabel').textContent = `Inkdown ${version}`; });
  renderTabs(); void renderActive();
  if (!await consumeExternalOpenPaths()) await restoreSession();
}

const startupRecoveryTask = boot();
void startupRecoveryTask.catch(error => toast(`启动恢复失败：${error.message}`));
