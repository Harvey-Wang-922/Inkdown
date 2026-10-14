export class ListEditingModel {
  constructor(editor, caretModel, resolveContent, insertTab = null) {
    this.editor = editor;
    this.caret = caretModel;
    this.resolveContent = resolveContent;
    this.insertTab = insertTab;
  }

  handleTab(item, backwards = false) {
    const content = this.resolveContent(item, true);
    if (backwards) {
      if (this.removeTrailingIndent(content)) return true;
      return this.outdent(item);
    }
    return this.indent(item) || this.insertIndent(content);
  }

  handleBackspace(item) {
    const selection = window.getSelection();
    const content = this.resolveContent(item, true);
    if (!selection.rangeCount || !selection.isCollapsed || !content.contains(selection.anchorNode)) return false;
    const offset = this.caret.textOffset(content, selection.anchorNode, selection.anchorOffset);
    const ownText = this.cleanText(content);
    if (/^[\t \u00a0]+$/.test(ownText)) return this.removeTrailingIndent(content);
    if (offset !== 0) return false;

    const childLists = this.childLists(item);
    const previous = item.previousElementSibling;
    if (!ownText && childLists.length && previous?.tagName === 'LI') {
      this.adoptChildren(previous, childLists);
      const gap = document.createElement('p');
      gap.dataset.listGap = '';
      gap.innerHTML = '<br>';
      previous.insertBefore(gap, this.childLists(previous)[0] || null);
      const list = item.parentElement; item.remove(); this.removeEmptyList(list);
      this.caret.place(gap, true);
      return true;
    }
    if (this.isNested(item)) return this.outdent(item);
    this.replaceWithParagraph(item, childLists);
    return true;
  }

  handleEnter(item) {
    const selection = window.getSelection();
    const content = this.resolveContent(item, true);
    if (!selection.rangeCount || !selection.isCollapsed || !content.contains(selection.anchorNode)) return false;
    if (!this.cleanText(content) && !content.querySelector('img')) {
      if (this.isNested(item)) return this.outdent(item);
      this.replaceWithParagraph(item, this.childLists(item));
      return true;
    }

    const range = selection.getRangeAt(0);
    const tailRange = document.createRange(); tailRange.selectNodeContents(content);
    try { tailRange.setStart(range.startContainer, range.startOffset); } catch { return false; }
    const tail = tailRange.extractContents();
    if (!content.textContent && !content.querySelector('img')) content.innerHTML = '<br>';
    const next = this.createSibling(item, tail);
    item.parentElement.insertBefore(next, item.nextSibling);
    this.moveTrailingChildren(item, next);
    this.caret.place(this.resolveContent(next, true), true);
    return true;
  }

  indent(item) {
    const list = item.parentElement;
    const previous = item.previousElementSibling;
    if (!list || !/^(UL|OL)$/.test(list.tagName) || previous?.tagName !== 'LI') return false;
    let nested = this.childLists(previous).find(node => node.tagName === list.tagName);
    if (!nested) { nested = document.createElement(list.tagName.toLowerCase()); previous.append(nested); }
    const content = this.resolveContent(item, true);
    const selection = window.getSelection();
    const offset = content.contains(selection.anchorNode) ? this.caret.textOffset(content, selection.anchorNode, selection.anchorOffset) : this.cleanText(content).length;
    nested.append(item); this.caret.placeAtTextOffset(content, offset); return true;
  }

  outdent(item) {
    const list = item.parentElement;
    const parentItem = list?.parentElement?.closest('li');
    if (!parentItem || !this.editor.contains(parentItem)) return false;
    const content = this.resolveContent(item, true);
    const selection = window.getSelection();
    const offset = content.contains(selection.anchorNode) ? this.caret.textOffset(content, selection.anchorNode, selection.anchorOffset) : 0;
    const trailingItems = [];
    for (let sibling = item.nextElementSibling; sibling; sibling = sibling.nextElementSibling) {
      if (sibling.tagName === 'LI') trailingItems.push(sibling);
    }
    if (trailingItems.length) {
      let continuation = this.childLists(item).find(node => node.tagName === list.tagName);
      if (!continuation) {
        continuation = document.createElement(list.tagName.toLowerCase());
        item.append(continuation);
      }
      trailingItems.forEach(sibling => continuation.append(sibling));
    }
    parentItem.parentElement.insertBefore(item, parentItem.nextSibling);
    this.removeEmptyList(list); this.caret.placeAtTextOffset(content, offset); return true;
  }

  replaceWithParagraph(item, childLists = []) {
    const paragraph = document.createElement('p');
    const content = this.resolveContent(item, true);
    paragraph.append(...content.childNodes);
    if (!paragraph.textContent && !paragraph.querySelector('img')) paragraph.innerHTML = '<br>';
    this.replaceItem(item, [paragraph, ...childLists]);
    this.caret.place(paragraph, true);
  }

  replaceItem(item, blocks) {
    const list = item.parentElement;
    const items = [...list.children].filter(node => node.tagName === 'LI');
    const index = items.indexOf(item);
    const trailingItems = items.slice(index + 1);
    const trailing = trailingItems.length ? list.cloneNode(false) : null;
    trailingItems.forEach(node => trailing.append(node));
    if (index === 0) {
      list.before(...blocks, ...(trailing ? [trailing] : []));
      list.remove();
    } else {
      item.remove();
      list.after(...blocks, ...(trailing ? [trailing] : []));
    }
  }

  adoptChildren(parent, lists) {
    for (const list of lists) {
      const existing = this.childLists(parent).find(node => node.tagName === list.tagName);
      if (existing) { [...list.children].forEach(child => existing.append(child)); list.remove(); }
      else parent.append(list);
    }
  }

  moveTrailingChildren(source, target) {
    this.childLists(source).forEach(list => target.append(list));
  }

  createSibling(item, fragment) {
    const sibling = document.createElement('li');
    if (item.querySelector(':scope > input[type="checkbox"]')) {
      const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; sibling.append(checkbox);
    }
    const content = document.createElement('span'); content.dataset.listContent = ''; content.append(fragment);
    if (!content.textContent && !content.querySelector('img')) content.innerHTML = '<br>';
    sibling.append(content); return sibling;
  }

  insertIndent(content) {
    return this.insertTab ? this.insertTab(content) : false;
  }

  removeTrailingIndent(content) {
    const text = this.cleanText(content);
    if (!text || !/^[\t \u00a0]+$/.test(text)) return false;
    const next = text.endsWith('\t') ? text.slice(0, -1) : text.replace(/[ \u00a0]{1,4}$/, '');
    content.textContent = next;
    if (!next) content.innerHTML = '<br>';
    this.caret.place(content, false);
    return true;
  }

  childLists(item) { return [...item.children].filter(node => /^(UL|OL)$/.test(node.tagName)); }
  isNested(item) { return Boolean(item.parentElement?.parentElement?.closest('li'));
  }
  removeEmptyList(list) { if (list && !list.querySelector(':scope > li')) list.remove(); }
  cleanText(node) { return String(node?.textContent || '').replace(/[\uFEFF\u200B]/g, ''); }
}
