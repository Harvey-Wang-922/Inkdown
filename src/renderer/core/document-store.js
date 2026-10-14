export class DocumentStore {
  constructor() {
    this.docs = [];
    this.activeId = null;
    this.nextId = 1;
    this.closed = [];
  }

  get active() {
    return this.docs.find(doc => doc.id === this.activeId) || null;
  }

  create(data = {}, activate = true) {
    if (data.path) {
      const existing = this.docs.find(doc => doc.path === data.path);
      if (existing) { if (activate) this.activeId = existing.id; return existing; }
    }
    const doc = {
      id: this.nextId++,
      name: data.name || '未命名.md',
      path: data.path || null,
      sourcePath: data.sourcePath || null,
      importedFormat: data.importedFormat || null,
      importWarnings: data.importWarnings || [],
      content: data.content || '',
      dirty: Boolean(data.dirty),
      createdAt: Date.now(),
      scrollTop: 0
    };
    this.docs.push(doc);
    if (activate) this.activeId = doc.id;
    return doc;
  }

  activate(id) {
    if (this.docs.some(doc => doc.id === id)) this.activeId = id;
    return this.active;
  }

  close(id) {
    const index = this.docs.findIndex(doc => doc.id === id);
    if (index < 0) return null;
    const [doc] = this.docs.splice(index, 1);
    this.closed.unshift({ path: doc.path, name: doc.name, content: doc.content });
    this.closed = this.closed.slice(0, 10);
    if (this.activeId === id) this.activeId = this.docs[Math.max(0, index - 1)]?.id || this.docs[0]?.id || null;
    return doc;
  }

  takeClosed() { return this.closed.shift() || null; }

  moveTo(id, targetId) {
    const index = this.docs.findIndex(doc => doc.id === id);
    const target = this.docs.findIndex(doc => doc.id === targetId);
    if (index < 0 || target < 0 || index === target) return false;
    const [doc] = this.docs.splice(index, 1);
    this.docs.splice(target, 0, doc);
    return true;
  }

  adjacentId(delta = 1) {
    if (!this.docs.length) return null;
    const index = this.docs.findIndex(doc => doc.id === this.activeId);
    return this.docs[(index + delta + this.docs.length) % this.docs.length].id;
  }

  serializeSession(folderPath) {
    const drafts = this.docs.filter(doc => !doc.path && (doc.content || doc.dirty));
    const dirtyFiles = this.docs.filter(doc => doc.path && doc.dirty).map(doc => ({
      path: doc.path, name: doc.name, content: doc.content, sourcePath: doc.sourcePath,
      importedFormat: doc.importedFormat
    }));
    return {
      paths: this.docs.map(doc => doc.path).filter(Boolean),
      drafts: drafts.map(doc => ({ name: doc.name, content: doc.content, sourcePath: doc.sourcePath, importedFormat: doc.importedFormat })),
      dirtyFiles,
      activePath: this.active?.path || null,
      activeDraftIndex: this.active && !this.active.path ? drafts.findIndex(doc => doc.id === this.active.id) : null,
      folderPath: folderPath || null
    };
  }
}

export const defaultSettings = {
  theme: 'system',
  fontFamily: 'system',
  fontSize: 17,
  lineHeight: 1.8,
  contentWidth: 820,
  spellcheck: true,
  sidebarMode: 'files',
  restoreSession: true,
  showStatusBar: true,
  showToolbar: true
};

export function loadSettings() {
  try {
    const stored = JSON.parse(localStorage.getItem('inkdown.settings') || '{}');
    // Removed preferences must not be reintroduced by an older installation.
    return Object.fromEntries(Object.entries(defaultSettings).map(([key, value]) => [key, stored?.[key] ?? value]));
  }
  catch { return { ...defaultSettings }; }
}

export function saveSettings(settings) {
  localStorage.setItem('inkdown.settings', JSON.stringify(settings));
}

export function loadRecentFiles() {
  try { return JSON.parse(localStorage.getItem('inkdown.recent') || '[]'); }
  catch { return []; }
}

export function addRecentFile(file) {
  if (!file?.path) return loadRecentFiles();
  const recent = loadRecentFiles().filter(item => item.path !== file.path);
  recent.unshift({ path: file.path, name: file.name, openedAt: Date.now() });
  localStorage.setItem('inkdown.recent', JSON.stringify(recent.slice(0, 12)));
  return recent.slice(0, 12);
}
