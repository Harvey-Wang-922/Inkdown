const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('inkdown', {
  openFiles: () => ipcRenderer.invoke('open-files'),
  takeExternalOpenPaths: () => ipcRenderer.invoke('take-external-open-paths'),
  onRecoveryFlushRequested: callback => {
    const listener = (_event, generation) => callback(generation);
    ipcRenderer.on('recovery-flush-requested', listener);
    return () => ipcRenderer.removeListener('recovery-flush-requested', listener);
  },
  onRecoveryCloseCancelled: callback => {
    const listener = () => callback();
    ipcRenderer.on('recovery-close-cancelled', listener);
    return () => ipcRenderer.removeListener('recovery-close-cancelled', listener);
  },
  completeRecoveryClose: (success, generation) => ipcRenderer.invoke('complete-recovery-close', success, generation),
  onExternalOpenPathsAvailable: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('external-open-paths-available', listener);
    return () => ipcRenderer.removeListener('external-open-paths-available', listener);
  },
  openFolder: () => ipcRenderer.invoke('open-folder'),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  loadFolder: (folderPath) => ipcRenderer.invoke('load-folder', folderPath),
  searchFolder: (folderPath, query, requestId) => ipcRenderer.invoke('search-folder', folderPath, query, requestId),
  createFile: (folderPath, name) => ipcRenderer.invoke('create-file', folderPath, name),
  renamePath: (filePath, name) => ipcRenderer.invoke('rename-path', filePath, name),
  revealPath: (filePath) => ipcRenderer.invoke('reveal-path', filePath),
  saveFile: (filePath, content) => ipcRenderer.invoke('save-file', filePath, content),
  saveFileAs: (name, content) => ipcRenderer.invoke('save-file-as', name, content),
  renderMarkdown: (source) => ipcRenderer.invoke('render-markdown', source),
  renderProjection: (source) => ipcRenderer.invoke('render-projection', source),
  sanitizeHtml: (html) => ipcRenderer.invoke('sanitize-html-fragment', html),
  htmlToMarkdown: (html) => ipcRenderer.invoke('html-to-markdown', html),
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  readClipboardText: () => ipcRenderer.invoke('read-clipboard-text'),
  readClipboardContent: () => ipcRenderer.invoke('read-clipboard-content'),
  chooseImage: (documentPath) => ipcRenderer.invoke('choose-image', documentPath),
  importImage: (file, documentPath) => ipcRenderer.invoke('import-image', webUtils.getPathForFile(file), documentPath),
  filePath: (file) => webUtils.getPathForFile(file),
  exportDocument: (format, name, markdown, documentPath) => ipcRenderer.invoke('export-document', format, name, markdown, documentPath),
  getVersion: () => ipcRenderer.invoke('get-app-version'),
  getSystemTheme: () => ipcRenderer.invoke('get-system-theme'),
  loadUserStyle: () => ipcRenderer.invoke('load-user-style'),
  openUserStyle: () => ipcRenderer.invoke('open-user-style'),
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  quit: () => ipcRenderer.invoke('quit-app')
});
