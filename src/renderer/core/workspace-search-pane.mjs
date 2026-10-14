export function groupSearchResults(results, folderPath = '') {
  const groups = new Map();
  const prefix = String(folderPath).replace(/[\\/]+$/, '') + '/';
  for (const result of results) {
    if (!groups.has(result.path)) {
      const normalized = result.path.replace(/\\/g, '/');
      const relative = normalized.toLocaleLowerCase().startsWith(prefix.replace(/\\/g, '/').toLocaleLowerCase())
        ? normalized.slice(prefix.length) : normalized;
      groups.set(result.path, { path: result.path, name: result.name, relative, results: [] });
    }
    groups.get(result.path).results.push(result);
  }
  return [...groups.values()];
}

export class WorkspaceSearchPane {
  constructor({ input, results, summary, clear, coordinator, folder, navigate, notify }) {
    Object.assign(this, { input, results, summary, clear, coordinator, folder, navigate, notify });
    this.rows = [];
    this.items = [];
    this.response = null;
    this.timer = null;
    this.composing = false;
    this.index = -1;
  }

  bind() {
    this.input.addEventListener('input', () => {
      this.invalidate();
      if (!this.composing) this.timer = setTimeout(() => void this.search(), 260);
    });
    this.input.addEventListener('compositionstart', () => { this.composing = true; this.invalidate(); });
    this.input.addEventListener('compositionend', () => {
      this.composing = false;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.search(), 260);
    });
    this.input.addEventListener('keydown', event => this.keydown(event));
    this.results.addEventListener('keydown', event => this.keydown(event));
    this.clear.addEventListener('click', () => {
      this.input.value = '';
      this.invalidate();
      this.input.focus();
    });
    this.invalidate();
  }

  invalidate() {
    this.coordinator.cancel();
    clearTimeout(this.timer);
    this.rows = [];
    this.items = [];
    this.response = null;
    this.index = -1;
    this.clear.disabled = !this.input.value;
    this.summary.textContent = '';
    this.results.setAttribute('aria-busy', 'false');
    this.message(this.input.value.trim() ? '等待搜索…' : '输入关键词搜索所有文档。');
  }

  message(value) {
    const message = document.createElement('div');
    message.className = 'empty-side'; message.textContent = value;
    this.results.replaceChildren(message);
  }

  async search() {
    clearTimeout(this.timer);
    if (this.composing) return false;
    const query = this.input.value.trim();
    const folder = this.folder();
    this.rows = []; this.items = []; this.response = null; this.index = -1;
    if (!query || !folder) {
      this.coordinator.cancel();
      this.summary.textContent = '';
      this.results.setAttribute('aria-busy', 'false');
      this.message(query ? '请先打开文件夹。' : '输入关键词搜索所有文档。');
      return false;
    }
    this.results.setAttribute('aria-busy', 'true');
    this.summary.textContent = '正在搜索…';
    this.message('正在搜索…');
    const pending = this.coordinator.run(folder.path, query);
    const requestRevision = this.coordinator.revision;
    try {
      const response = await pending;
      if (!response || this.folder()?.path !== folder.path) return false;
      this.response = response;
      this.render(response, folder.path);
      return true;
    } catch (error) {
      this.summary.textContent = '';
      this.message(`搜索失败：${error.message}`);
      return false;
    } finally {
      // An older request must not clear a newer request's busy state.
      if (this.coordinator.revision === requestRevision) this.results.setAttribute('aria-busy', 'false');
    }
  }

  render(response, folderPath) {
    const groups = groupSearchResults(response.results, folderPath);
    this.summary.textContent = `${response.truncated ? '前 ' : ''}${response.results.length} 处匹配 · ${groups.length} 个文件`;
    this.results.replaceChildren();
    if (!groups.length) { this.message('没有匹配结果。'); return; }
    const fragment = document.createDocumentFragment();
    for (const group of groups) {
      const section = document.createElement('section'); section.className = 'search-group';
      const header = document.createElement('div'); header.className = 'search-group-title';
      const name = document.createElement('strong'); name.textContent = group.relative; name.title = group.path;
      const count = document.createElement('span'); count.textContent = String(group.results.length);
      header.append(name, count); section.append(header);
      for (const result of group.results) {
        const index = this.rows.length;
        const row = document.createElement('button'); row.type = 'button'; row.className = 'search-result';
        row.dataset.resultIndex = String(index);
        row.title = `${result.path}\n点击在源码模式中定位到第 ${result.line} 行、第 ${result.column} 列`;
        const location = document.createElement('strong'); location.textContent = `第 ${result.line} 行 · 第 ${result.column} 列`;
        const preview = document.createElement('p');
        const start = Math.max(0, result.previewColumn || 0);
        const end = Math.min(result.preview.length, start + response.query.length);
        const mark = document.createElement('mark'); mark.textContent = result.preview.slice(start, end);
        preview.append(document.createTextNode(result.preview.slice(0, start)), mark, document.createTextNode(result.preview.slice(end)));
        row.append(location, preview);
        row.addEventListener('focus', () => { this.index = index; });
        row.addEventListener('click', () => void this.open(index));
        this.rows.push(row); this.items.push(result); section.append(row);
      }
      fragment.append(section);
    }
    if (response.truncated) {
      const note = document.createElement('div'); note.className = 'empty-side';
      note.textContent = '仅显示前 200 处匹配，请增加关键词缩小范围。'; fragment.append(note);
    }
    this.results.append(fragment);
  }

  async open(index) {
    const response = this.response;
    if (!response || response.requestId !== this.coordinator.revision) return;
    try {
      const outcome = await this.navigate(this.items[index], response.query);
      if (this.response !== response) return;
      if (outcome === 'changed') this.notify('文档内容已变化，请重新搜索后定位');
      if (outcome === 'opened') {
        this.index = index;
        this.rows.forEach((row, at) => {
          row.classList.toggle('active', at === index);
          row.setAttribute('aria-current', at === index ? 'true' : 'false');
        });
      }
    } catch (error) { if (this.response === response) this.notify(`无法打开搜索结果：${error.message}`); }
  }

  keydown(event) {
    if (event.isComposing || this.composing || event.ctrlKey || event.altKey || event.metaKey) return;
    if (event.key === 'Escape' && event.target !== this.input) {
      event.preventDefault(); event.stopPropagation(); this.input.focus(); return;
    }
    if (event.key === 'Enter' && event.target === this.input) {
      event.preventDefault(); event.stopPropagation();
      void (async () => {
        if (!this.response && !await this.search()) return;
        if (this.rows.length) await this.open(Math.max(0, this.index));
      })();
      return;
    }
    if (event.key === 'Enter' && this.rows.includes(event.target)) {
      event.preventDefault(); event.stopPropagation(); void this.open(this.rows.indexOf(event.target)); return;
    }
    const fromInput = event.target === this.input;
    const keys = fromInput ? ['ArrowDown', 'ArrowUp'] : ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key) || !this.rows.length) return;
    event.preventDefault(); event.stopPropagation();
    let index = this.index;
    if (event.key === 'Home') index = 0;
    else if (event.key === 'End') index = this.rows.length - 1;
    else if (fromInput) index = event.key === 'ArrowDown' ? 0 : this.rows.length - 1;
    else index = (index + (event.key === 'ArrowDown' ? 1 : -1) + this.rows.length) % this.rows.length;
    this.rows[index].focus({ preventScroll: true });
    this.rows[index].scrollIntoView({ block: 'nearest', behavior: 'instant' });
  }
}
