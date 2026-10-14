export class SessionRestoreCoordinator {
  constructor({ readFile, loadFolder, getRevision, concurrency = 4 }) {
    this.readFile = readFile;
    this.loadFolder = loadFolder;
    this.getRevision = getRevision;
    const requestedConcurrency = Number(concurrency);
    this.concurrency = Number.isFinite(requestedConcurrency) ? Math.max(1, Math.floor(requestedConcurrency)) : 4;
  }

  parse(serialized) {
    try {
      const value = typeof serialized === 'string' ? JSON.parse(serialized || '{}') : serialized;
      if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
      return {
        ...value,
        paths: Array.isArray(value.paths) ? value.paths : [],
        drafts: Array.isArray(value.drafts) ? value.drafts : [],
        dirtyFiles: Array.isArray(value.dirtyFiles) ? value.dirtyFiles : []
      };
    }
    catch { return null; }
  }

  uniquePaths(session) {
    return [...new Set(session.paths.filter(path => typeof path === 'string' && path))];
  }

  activeDescriptor(session) {
    if (session.activePath) {
      const dirty = session.dirtyFiles.find(snapshot => snapshot?.path === session.activePath);
      if (dirty) return { kind: 'dirty', data: dirty };
      return { kind: 'file', path: session.activePath };
    }
    if (Number.isInteger(session.activeDraftIndex) && session.drafts[session.activeDraftIndex]) {
      return { kind: 'draft', data: session.drafts[session.activeDraftIndex], index: session.activeDraftIndex };
    }
    return null;
  }

  async load(serialized, { onActive } = {}) {
    const session = this.parse(serialized);
    if (!session) return null;
    const revision = this.getRevision();
    const paths = this.uniquePaths(session);
    const active = this.activeDescriptor(session);
    const loadedByPath = new Map();
    const folderPromise = session.folderPath
      ? Promise.resolve(this.loadFolder(session.folderPath)).catch(() => null)
      : Promise.resolve(null);

    let activeResult = active;
    if (active?.kind === 'file') {
      try {
        const file = await this.readFile(active.path);
        if (file) { loadedByPath.set(active.path, file); activeResult = { kind: 'file', data: file }; }
        else activeResult = null;
      } catch { activeResult = null; }
    }
    if (revision !== this.getRevision()) return null;
    if (activeResult && onActive) await onActive({ session, active: activeResult });
    if (revision !== this.getRevision()) return null;

    const remainingPaths = paths.filter(path => path !== session.activePath);
    let nextIndex = 0;

    const worker = async () => {
      while (revision === this.getRevision()) {
        const index = nextIndex++;
        if (index >= remainingPaths.length) return;
        const filePath = remainingPaths[index];
        try {
          const file = await this.readFile(filePath);
          if (file) loadedByPath.set(filePath, file);
        } catch {}
      }
    };

    await Promise.all([
      folderPromise,
      ...Array.from({ length: Math.min(this.concurrency, remainingPaths.length) }, () => worker())
    ]);
    const folder = await folderPromise;
    if (revision !== this.getRevision()) return null;
    return { session, folder, files: paths.map(path => loadedByPath.get(path)).filter(Boolean), active: activeResult };
  }
}
