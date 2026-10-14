const { app, BrowserWindow, dialog, ipcMain, Menu, clipboard, shell, nativeTheme } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { renderMarkdown, renderProjection, sanitizeClipboardHtml } = require('./services/markdown-render-service');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');
const { IMPORT_EXTENSIONS, MARKDOWN_EXTENSIONS, importDocument } = require('./file-formats');
const { ExportService } = require('./services/export-service');
const { ExternalOpenCoordinator } = require('./services/external-open-coordinator');
const { WorkspaceSearchService } = require('./services/workspace-search-service');
const { createMarkdownCodec } = require('./shared/markdown-codec.mjs');
const USER_STYLE_TEMPLATE_PATH = path.join(__dirname, 'assets', 'custom.css');
const MARKDOWN_STYLE_TEMPLATE_PATH = path.join(__dirname, 'assets', 'markdown-style.json');
const externalOpenCoordinator = new ExternalOpenCoordinator(MARKDOWN_EXTENSIONS);

const markdownCodec = createMarkdownCodec(TurndownService, gfm);


const exportService = new ExportService({
  BrowserWindow,
  getTempDirectory: () => app.getPath('temp'),
  renderMarkdown
});

const RENDERER_ENTRY_PATH = path.join(__dirname, 'renderer', 'index.html');
const RENDERER_ENTRY_URL = pathToFileURL(RENDERER_ENTRY_PATH).href;
let mainWindow;
let recoveryClosePending = false;
let recoveryCloseAllowed = false;
let recoveryCloseTimer;
let recoveryCloseGeneration = 0;

function requestRecoveryClose() {
  recoveryClosePending = true;
  const generation = ++recoveryCloseGeneration;
  mainWindow.webContents.send('recovery-flush-requested', generation);
  clearTimeout(recoveryCloseTimer);
  recoveryCloseTimer = setTimeout(async () => {
    if (!recoveryClosePending || generation !== recoveryCloseGeneration || !mainWindow || mainWindow.isDestroyed()) return;
    const result = await dialog.showMessageBox(mainWindow, {
      type: 'warning', message: '恢复快照保存尚未响应',
      detail: '直接关闭可能丢失最近的未保存恢复内容，不会修改原文件。',
      buttons: ['继续等待', '取消关闭', '直接关闭'], defaultId: 1, cancelId: 1
    });
    if (!recoveryClosePending || generation !== recoveryCloseGeneration || !mainWindow || mainWindow.isDestroyed()) return;
    if (result.response === 0) requestRecoveryClose();
    else {
      recoveryClosePending = false;
      if (result.response === 2) { recoveryCloseAllowed = true; mainWindow.close(); }
      else mainWindow.webContents.send('recovery-close-cancelled', ++recoveryCloseGeneration);
    }
  }, 10000);
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function queueExternalOpen(argumentsList) {
  if (!externalOpenCoordinator.enqueue(argumentsList)) return;
  focusMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('external-open-paths-available');
}

function isTrustedRenderer(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  const sender = event?.sender;
  const frame = event?.senderFrame;
  if (!sender || sender !== mainWindow.webContents || frame !== sender.mainFrame) return false;
  try {
    const senderUrl = new URL(frame.url);
    senderUrl.hash = '';
    return senderUrl.href === RENDERER_ENTRY_URL;
  } catch {
    return false;
  }
}

function handleTrusted(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedRenderer(event)) throw new Error('拒绝来自非可信页面的请求');
    return handler(event, ...args);
  });
}

function openExternalNavigation(target) {
  try {
    const protocol = new URL(target).protocol;
    if (['http:', 'https:', 'mailto:'].includes(protocol)) void shell.openExternal(target);
  } catch {}
}

function createWindow() {
  recoveryClosePending = false; recoveryCloseAllowed = false;
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 840,
    minWidth: 860,
    minHeight: 560,
    backgroundColor: '#f7f7f5',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });
  const windowSession = mainWindow.webContents.session;
  windowSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  windowSession.setPermissionCheckHandler(() => false);
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { openExternalNavigation(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const current = mainWindow?.webContents.getURL().split('#')[0];
    if (current && url.split('#')[0] === current) return;
    event.preventDefault();
    openExternalNavigation(url);
  });
  mainWindow.loadFile(RENDERER_ENTRY_PATH);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('close', event => {
    if (recoveryCloseAllowed) return;
    event.preventDefault();
    if (!recoveryClosePending) requestRecoveryClose();
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

handleTrusted('complete-recovery-close', (_, success, generation) => {
  if (!recoveryClosePending || generation !== recoveryCloseGeneration) return;
  recoveryClosePending = false;
  clearTimeout(recoveryCloseTimer);
  if (success === true) { recoveryCloseAllowed = true; setImmediate(() => mainWindow?.close()); }
});

async function readDocument(filePath) {
  return importDocument(filePath);
}

const workspaceSearch = new WorkspaceSearchService({ stat: filePath => fs.stat(filePath), readDocument, concurrency: 4, maxResults: 200 });

async function collectMarkdown(dir, base = dir, depth = 0) {
  if (depth > 8) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const result = [];
  for (const entry of entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const children = await collectMarkdown(full, base, depth + 1);
      if (children.length) result.push({ type: 'folder', name: entry.name, path: full, children });
    } else if (new RegExp(`\\.(${IMPORT_EXTENSIONS.join('|')})$`, 'i').test(entry.name)) {
      result.push({ type: 'file', name: entry.name, path: full });
    }
  }
  return result;
}

async function loadFolder(folderPath) {
  const children = await collectMarkdown(folderPath);
  workspaceSearch.primeCatalog(folderPath, flattenWorkspaceFiles(children));
  return { path: folderPath, name: path.basename(folderPath), children };
}

function flattenWorkspaceFiles(items, files = []) {
  for (const item of items || []) {
    if (item.type === 'folder') flattenWorkspaceFiles(item.children, files);
    else files.push(item);
  }
  return files;
}

async function searchFolder(folderPath, query, requestId = 0) {
  return workspaceSearch.searchFolder(folderPath, query, requestId, async () => flattenWorkspaceFiles(await collectMarkdown(folderPath)));
}

function safeChildPath(parent, name) {
  const base = path.resolve(parent);
  const target = path.resolve(base, path.basename(name));
  if (path.dirname(target) !== base) throw new Error('Invalid child path');
  return target;
}

async function ensureRuntimeConfig(targetPath, templatePath) {
  try {
    const template = await fs.readFile(templatePath, 'utf8');
    await fs.writeFile(targetPath, template, { encoding: 'utf8', flag: 'wx' });
  }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
}

async function ensureUserStyleFiles() {
  const configDirectory = app.isPackaged
    ? path.join(path.dirname(app.getPath('exe')), 'config')
    : path.join(app.getPath('userData'), 'themes');
  const stylePath = path.join(configDirectory, 'custom.css');
  const configPath = path.join(configDirectory, 'markdown-style.json');
  await fs.mkdir(configDirectory, { recursive: true });
  await Promise.all([
    ensureRuntimeConfig(stylePath, USER_STYLE_TEMPLATE_PATH),
    ensureRuntimeConfig(configPath, MARKDOWN_STYLE_TEMPLATE_PATH)
  ]);
  return { stylePath, configPath, configDirectory };
}

handleTrusted('open-files', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '所有支持的文档', extensions: IMPORT_EXTENSIONS },
      { name: 'Markdown', extensions: ['md', 'markdown', 'mdown', 'mkd', 'mkdn'] },
      { name: '网页', extensions: ['html', 'htm'] },
      { name: 'Word', extensions: ['docx'] },
      { name: '纯文本', extensions: ['txt', 'text', 'log'] }
    ]
  });
  if (result.canceled) return [];
  return Promise.all(result.filePaths.map(readDocument));
});

handleTrusted('open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] });
  if (result.canceled) return null;
  const folderPath = result.filePaths[0];
  return loadFolder(folderPath);
});
handleTrusted('take-external-open-paths', () => externalOpenCoordinator.take());

handleTrusted('read-file', (_, filePath) => readDocument(filePath));
handleTrusted('load-folder', (_, folderPath) => loadFolder(folderPath));
handleTrusted('search-folder', (_, folderPath, query, requestId) => searchFolder(folderPath, query, requestId));
handleTrusted('create-file', async (_, folderPath, name) => {
  const fileName = /\.(md|markdown|txt)$/i.test(name || '') ? name : `${name || '未命名'}.md`;
  const target = safeChildPath(folderPath, fileName);
  await fs.writeFile(target, '', { encoding: 'utf8', flag: 'wx' });
  workspaceSearch.invalidate(target);
  workspaceSearch.invalidateCatalogs();
  return readDocument(target);
});
handleTrusted('rename-path', async (_, filePath, name) => {
  const target = safeChildPath(path.dirname(filePath), name);
  await fs.rename(filePath, target);
  workspaceSearch.invalidate(filePath); workspaceSearch.invalidate(target);
  workspaceSearch.invalidateCatalogs();
  return { path: target, name: path.basename(target) };
});
handleTrusted('reveal-path', (_, filePath) => shell.showItemInFolder(filePath));
handleTrusted('render-markdown', (_, source) => renderMarkdown(source));
handleTrusted('render-projection', (_, source) => renderProjection(source));
handleTrusted('sanitize-html-fragment', (_, html) => sanitizeClipboardHtml(html));
handleTrusted('html-to-markdown', (_, html) => markdownCodec.toMarkdown(html));
handleTrusted('copy-text', (_, text) => clipboard.writeText(String(text || '')));
handleTrusted('read-clipboard-text', () => clipboard.readText());
handleTrusted('read-clipboard-content', async () => {
  const items = await clipboard.read();
  const item = items.find(item => item.types.includes('text/html') || item.types.includes('text/plain'));
  if (!item) return { text: '', html: '' };
  const read = async type => item.types.includes(type) ? (await item.getType(type)).text() : '';
  const [text, html] = await Promise.all([read('text/plain'), read('text/html')]);
  return { text, html };
});
handleTrusted('get-app-version', () => app.getVersion());
handleTrusted('get-system-theme', () => nativeTheme.shouldUseDarkColors ? 'dark' : 'light');
handleTrusted('load-user-style', async () => {
  const { stylePath, configPath, configDirectory } = await ensureUserStyleFiles();
  const [styleStats, configStats] = await Promise.all([fs.stat(stylePath), fs.stat(configPath)]);
  if (styleStats.size > 1024 * 1024) throw new Error('custom.css 不能超过 1 MB');
  if (configStats.size > 1024 * 1024) throw new Error('markdown-style.json 不能超过 1 MB');
  const [css, configSource] = await Promise.all([fs.readFile(stylePath, 'utf8'), fs.readFile(configPath, 'utf8')]);
  let config;
  try { config = JSON.parse(configSource); }
  catch (error) { throw new Error(`markdown-style.json 格式错误：${error.message}`); }
  return { path: configPath, cssPath: stylePath, directory: configDirectory, installedConfig: app.isPackaged, css, config };
});
handleTrusted('open-user-style', async () => {
  const { configPath } = await ensureUserStyleFiles();
  shell.showItemInFolder(configPath);
  return { path: configPath, error: null };
});
handleTrusted('toggle-fullscreen', () => {
  if (!mainWindow) return false;
  mainWindow.setFullScreen(!mainWindow.isFullScreen());
  return mainWindow.isFullScreen();
});
handleTrusted('quit-app', () => app.quit());
async function importImageFile(imagePath, documentPath) {
  if (!documentPath) return { path: imagePath, markdownPath: imagePath.replace(/\\/g, '/') };
  const documentDir = path.dirname(documentPath);
  const assetsDir = path.join(documentDir, 'assets');
  await fs.mkdir(assetsDir, { recursive: true });
  let target = path.join(assetsDir, path.basename(imagePath));
  let suffix = 1;
  while (true) {
    try { await fs.access(target); target = path.join(assetsDir, `${path.parse(imagePath).name}-${suffix++}${path.extname(imagePath)}`); }
    catch { break; }
  }
  await fs.copyFile(imagePath, target);
  return { path: target, markdownPath: `assets/${path.basename(target)}` };
}
handleTrusted('choose-image', async (_, documentPath) => {
  const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] }] });
  if (result.canceled) return null;
  const imagePath = result.filePaths[0];
  return importImageFile(imagePath, documentPath);
});
handleTrusted('import-image', (_, imagePath, documentPath) => importImageFile(imagePath, documentPath));

handleTrusted('export-document', async (_, format, suggestedName, markdown, documentPath) => {
  const selected = exportService.suggestedPath(format, suggestedName);
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath: selected.defaultPath, filters: [{ name: selected.label, extensions: [selected.extension] }] });
  if (result.canceled) return null;
  return exportService.write({ format, targetPath: result.filePath, suggestedName, markdown, documentPath });
});

handleTrusted('save-file', async (_, filePath, content) => {
  await fs.writeFile(filePath, content, 'utf8');
  workspaceSearch.invalidate(filePath);
  return { path: filePath, name: path.basename(filePath) };
});
handleTrusted('save-file-as', async (_, suggestedName, content) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: suggestedName || '未命名.md',
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }, { name: '纯文本', extensions: ['txt'] }]
  });
  if (result.canceled) return null;
  await fs.writeFile(result.filePath, content, 'utf8');
  workspaceSearch.invalidate(result.filePath);
  workspaceSearch.invalidateCatalogs();
  return { path: result.filePath, name: path.basename(result.filePath) };
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  externalOpenCoordinator.enqueue(process.argv.slice(1));
  app.on('second-instance', (_event, commandLine) => queueExternalOpen(commandLine.slice(1)));
  app.on('open-file', (event, filePath) => { event.preventDefault(); queueExternalOpen([filePath]); });
  app.whenReady().then(() => { Menu.setApplicationMenu(null); createWindow(); });
  app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); else focusMainWindow(); });
}
