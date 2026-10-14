export function filterWorkspaceTree(items, query) {
  const needle = String(query || '').trim().toLocaleLowerCase();
  if (!needle) return items || [];
  const visit = item => {
    const ownMatch = String(item?.name || '').toLocaleLowerCase().includes(needle);
    if (item?.type !== 'folder') return ownMatch ? item : null;
    if (ownMatch) return item;
    const children = (item.children || []).map(visit).filter(Boolean);
    return children.length ? { ...item, children } : null;
  };
  return (items || []).map(visit).filter(Boolean);
}

export class WorkspaceSearchCoordinator {
  constructor(search) {
    this.search = search;
    this.revision = 0;
  }

  cancel() { this.revision++; }

  async run(folderPath, query) {
    const requestId = ++this.revision;
    const normalized = String(query || '').trim();
    if (!folderPath || !normalized) return { requestId, query: normalized, results: [], truncated: false };
    try {
      const result = await this.search(folderPath, normalized, requestId);
      if (requestId !== this.revision || result?.requestId !== requestId || result?.cancelled) return null;
      return result;
    } catch (error) {
      if (requestId !== this.revision) return null;
      throw error;
    }
  }
}
