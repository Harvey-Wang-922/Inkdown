export class CaretModel {
  constructor(editor, resolveListContent) {
    this.editor = editor;
    this.resolveListContent = resolveListContent;
    this.pointerPlacementHandled = false;
  }

  bind() {
    this.editor.addEventListener('pointerdown', event => this.handlePointerDown(event));
    this.editor.addEventListener('pointerup', event => this.handlePointerUp(event));
  }

  place(element, atStart = false) {
    if (!element) return;
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(atStart);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  textOffset(root, node, offset) {
    const range = document.createRange();
    range.selectNodeContents(root);
    try { range.setEnd(node, offset); } catch { return this.cleanLength(root.textContent); }
    return this.cleanLength(range.toString());
  }

  placeAtTextOffset(root, offset) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let remaining = Math.max(0, offset); let node;
    while ((node = walker.nextNode())) {
      const length = this.cleanLength(node.nodeValue);
      if (remaining <= length) {
        const range = document.createRange(); range.setStart(node, Math.min(remaining, node.nodeValue.length)); range.collapse(true);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); return;
      }
      remaining -= length;
    }
    this.place(root, false);
  }

  handlePointerDown(event) {
    this.pointerPlacementHandled = false;
    if (event.button !== 0 || event.shiftKey || event.detail > 1 || event.target.closest?.('input[type="checkbox"]')) return;
    const target = this.pointerTarget(event);
    if (!target) return;
    const rect = this.contentRect(target.content);
    if (event.clientX >= rect.left && event.clientX <= rect.right) return;
    event.preventDefault();
    this.pointerPlacementHandled = true;
    this.editor.focus({ preventScroll: true });
    this.place(target.content, event.clientX < rect.left);
  }

  handlePointerUp(event) {
    if (this.pointerPlacementHandled) { this.pointerPlacementHandled = false; return; }
    if (event.button !== 0 || event.shiftKey || event.target.closest?.('input[type="checkbox"]')) return;
    const selection = window.getSelection();
    if (!selection.rangeCount || !selection.isCollapsed) return;
    const target = this.pointerTarget(event);
    if (!target || target.content.contains(selection.anchorNode)) return;
    const rect = this.contentRect(target.content);
    this.place(target.content, event.clientX <= rect.left || event.clientX < (rect.left + rect.right) / 2);
  }

  pointerTarget(event) {
    let item = this.itemAtY(event.clientY);
    if (!item) item = event.target.closest?.('li');
    if (!item || !this.editor.contains(item)) return null;
    return { item, content: this.resolveListContent(item, true) };
  }

  itemAtY(y) {
    const candidates = [...this.editor.querySelectorAll('li')].map(item => ({ item, content: this.resolveListContent(item, false) }))
      .filter(entry => entry.content)
      .map(entry => ({ ...entry, rect: this.contentRect(entry.content) }))
      .filter(entry => y >= entry.rect.top - 5 && y <= entry.rect.bottom + 5);
    candidates.sort((a, b) => Math.abs(y - (a.rect.top + a.rect.bottom) / 2) - Math.abs(y - (b.rect.top + b.rect.bottom) / 2) || this.depth(a.item) - this.depth(b.item));
    return candidates[0]?.item || null;
  }

  contentRect(content) {
    const range = document.createRange(); range.selectNodeContents(content);
    const rect = range.getBoundingClientRect();
    return rect.width || rect.height ? rect : content.getBoundingClientRect();
  }

  depth(item) {
    let depth = 0; let node = item.parentElement;
    while (node && node !== this.editor) { if (node.tagName === 'LI') depth++; node = node.parentElement; }
    return depth;
  }

  cleanLength(value) { return String(value || '').replace(/[\uFEFF\u200B]/g, '').length; }
}
