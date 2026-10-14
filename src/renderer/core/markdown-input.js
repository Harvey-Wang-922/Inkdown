import { CaretModel } from './caret-model.js';
import { ListEditingModel } from './list-editing-model.js';
import { TableEditingModel } from './table-editing-model.js';
import { describeBlockTransform, matchInlineShortcut, parseTableHeaderCells } from './markdown-input-rules.js';
import { clipboardToMarkdown } from './markdown-paste.mjs';

const BLOCK_SELECTOR = 'p,div,h1,h2,h3,h4,h5,h6,blockquote,li,pre,th,td';
const INSERT_INPUT_TYPES = new Set([
  'insertText', 'insertCompositionText', 'insertFromComposition', 'insertParagraph',
  'insertLineBreak', 'insertFromPaste', 'insertFromDrop', 'insertReplacementText'
]);

export class MarkdownInputController {
  constructor(editor, hooks = {}) {
    this.editor = editor;
    this.hooks = hooks;
    this.composing = false;
    this.caretModel = new CaretModel(editor, (item, create) => this.listItemContent(item, create));
    this.listEditing = new ListEditingModel(
      editor,
      this.caretModel,
      (item, create) => this.listItemContent(item, create),
      () => this.insertTabCharacter()
    );
    this.tableEditing = new TableEditingModel(editor, this.caretModel, cell => this.handleInput(cell));
    this.bind();
  }

  bind() {
    this.caretModel.bind();
    this.editor.addEventListener('beforeinput', event => {
      if (INSERT_INPUT_TYPES.has(event.inputType) && !this.hasStableCaret()) this.ensureCaretBlock();
    });
    this.editor.addEventListener('compositionstart', () => {
      if (!this.hasStableCaret()) this.ensureCaretBlock();
      this.composing = true;
    });
    this.editor.addEventListener('compositionend', () => {
      this.composing = false;
      this.handleInput();
    });
    this.editor.addEventListener('input', () => { if (!this.insertingClipboard) this.handleInput(); });
    this.editor.addEventListener('keydown', event => this.handleKeydown(event));
    this.editor.addEventListener('paste', event => this.handlePaste(event));
    this.editor.addEventListener('click', event => this.handleCheckbox(event));
    document.addEventListener('selectionchange', () => {
      const block = this.currentBlock();
      this.hooks.onSelectionChange?.(block, window.getSelection());
    });
  }

  currentBlock() {
    const selection = window.getSelection();
    if (!selection.rangeCount || !this.editor.contains(selection.anchorNode)) return null;
    if (selection.anchorNode === this.editor) return this.blockAtRootOffset(selection.anchorOffset);
    const node = selection.anchorNode.nodeType === Node.ELEMENT_NODE ? selection.anchorNode : selection.anchorNode.parentElement;
    const listContent = node?.closest('[data-list-content]');
    const listItem = listContent?.parentElement;
    if (listItem?.tagName === 'LI' && this.editor.contains(listItem)) return listItem;
    const block = node?.closest(BLOCK_SELECTOR) || null;
    return block && this.editor.contains(block) ? block : null;
  }

  editableBlockWithin(node, fromEnd = false) {
    if (!node || node === this.editor) return null;
    if (node.matches?.(BLOCK_SELECTOR)) return node;
    const blocks = node.querySelectorAll?.(BLOCK_SELECTOR);
    if (!blocks?.length) return null;
    return blocks[fromEnd ? blocks.length - 1 : 0];
  }

  blockAtRootOffset(offset) {
    const children = [...this.editor.children];
    if (!children.length) return null;
    const next = children[Math.min(offset, children.length - 1)];
    const previous = children[Math.max(0, Math.min(offset - 1, children.length - 1))];
    return this.editableBlockWithin(next, false) || this.editableBlockWithin(previous, true);
  }

  normalizeDocument() {
    const directNodes = [...this.editor.childNodes];
    if (!directNodes.length) {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = '<br>';
      this.editor.append(paragraph);
      return paragraph;
    }
    let firstCreated = null;
    for (const node of directNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.nodeValue) {
          const paragraph = document.createElement('p');
          paragraph.textContent = node.nodeValue;
          node.replaceWith(paragraph);
          firstCreated ||= paragraph;
        } else node.remove();
      } else if (node.nodeName === 'BR') {
        const paragraph = document.createElement('p');
        paragraph.innerHTML = '<br>';
        node.replaceWith(paragraph);
        firstCreated ||= paragraph;
      }
    }
    if (!this.editor.children.length) {
      const paragraph = document.createElement('p');
      paragraph.innerHTML = '<br>';
      this.editor.append(paragraph);
      firstCreated = paragraph;
    }
    this.normalizeListItems();
    return firstCreated || this.blockAtRootOffset(0);
  }

  normalizeListItems() {
    this.editor.querySelectorAll('li').forEach(item => this.listItemContent(item, true));
  }

  listItemContent(item, create = false) {
    if (!item || item.tagName !== 'LI') return item;
    let content = [...item.children].find(node => node.matches?.('[data-list-content]'));
    if (!create) return content || item;
    const selection = window.getSelection();
    const caretWasOnItem = selection.rangeCount && selection.anchorNode === item;
    const caretWasAtEnd = caretWasOnItem && selection.anchorOffset > 0;
    const nestedLists = [...item.children].filter(node => /^(UL|OL)$/.test(node.tagName));
    const listGaps = [...item.children].filter(node => node.matches?.('[data-list-gap]'));
    const ownNodes = [...item.childNodes].filter(node => node !== content && !nestedLists.includes(node) && !listGaps.includes(node));
    const checkboxHosts = [...(content ? [content] : []), ...ownNodes].filter(node => node.nodeType === Node.ELEMENT_NODE);
    const checkbox = checkboxHosts.map(node => node.matches?.('input[type="checkbox"]') ? node : node.querySelector?.('input[type="checkbox"]')).find(Boolean);
    if (!content) { content = document.createElement('span'); content.dataset.listContent = ''; }
    const anchor = nestedLists[0] || null;
    const contentBeforeAnchor = !anchor || Boolean(content.compareDocumentPosition(anchor) & Node.DOCUMENT_POSITION_FOLLOWING);
    if (content.parentElement !== item || !contentBeforeAnchor) item.insertBefore(content, anchor);
    if (checkbox) {
      checkbox.removeAttribute('disabled');
      if (checkbox.parentElement !== item || checkbox.nextSibling !== content) item.insertBefore(checkbox, content);
    }
    ownNodes.forEach(node => {
      if (node === checkbox) return;
      if (node.nodeType === Node.ELEMENT_NODE && ['P', 'DIV'].includes(node.tagName)) {
        if (content.childNodes.length && node.childNodes.length) content.append(document.createElement('br'), document.createElement('br'));
        while (node.firstChild) {
          if (node.firstChild === checkbox) node.firstChild.remove();
          else content.append(node.firstChild);
        }
        node.remove();
      } else content.append(node);
    });
    if (!content.textContent && !content.querySelector('img')) content.innerHTML = '<br>';
    if (caretWasOnItem) this.placeCaret(content, !caretWasAtEnd);
    return content;
  }

  hasStableCaret() {
    const selection = window.getSelection();
    return Boolean(selection.rangeCount
      && selection.anchorNode !== this.editor
      && this.editor.contains(selection.anchorNode)
      && this.currentBlock());
  }

  ensureCaretBlock(prefer = 'start') {
    this.normalizeDocument();
    if (document.activeElement !== this.editor) this.editor.focus({ preventScroll: true });
    const selection = window.getSelection();
    const existing = this.currentBlock();
    if (existing && selection.anchorNode !== this.editor) return existing;

    let block = null;
    let atStart = prefer !== 'end';
    if (selection.rangeCount && selection.anchorNode === this.editor) {
      const offset = selection.anchorOffset;
      block = this.blockAtRootOffset(offset);
      atStart = offset < this.editor.children.length;
    }
    block ||= prefer === 'end'
      ? this.editableBlockWithin(this.editor.lastElementChild, true)
      : this.editableBlockWithin(this.editor.firstElementChild, false);
    if (!block) {
      block = document.createElement('p');
      block.innerHTML = '<br>';
      prefer === 'end' ? this.editor.append(block) : this.editor.prepend(block);
    }
    this.placeCaret(block, atStart);
    return block;
  }

  cleanText(block) {
    const content = block?.tagName === 'LI' ? this.listItemContent(block, true) : block;
    return content.textContent.replace(/[\uFEFF\u200B]/g, '');
  }

  blockSyntax(block) {
    if (!block) return null;
    const heading = block.tagName.match(/^H([1-6])$/);
    if (heading) return { kind: 'heading', token: `${'#'.repeat(Number(heading[1]))} `, root: block };
    if (block.tagName === 'BLOCKQUOTE') return { kind: 'quote', token: '> ', root: block };
    if (block.tagName === 'PRE') {
      const language = block.dataset.language || block.querySelector('code')?.className.match(/language-([^\s]+)/)?.[1] || '';
      return { kind: 'code', token: `\`\`\`${language}`, root: block };
    }
    if (block.tagName === 'LI') {
      const list = block.closest('ul,ol');
      if (!list || !this.editor.contains(list)) return null;
      const checkbox = block.querySelector(':scope > input[type="checkbox"]');
      if (checkbox) return { kind: 'task', token: `- [${checkbox.checked ? 'x' : ' '}] `, root: list };
      return { kind: list.tagName === 'OL' ? 'ordered-list' : 'unordered-list', token: list.tagName === 'OL' ? '1. ' : '- ', root: list };
    }
    return null;
  }

  caretOffset(block) {
    const selection = window.getSelection();
    if (!selection.rangeCount || !selection.isCollapsed || !block.contains(selection.anchorNode)) return null;
    const range = document.createRange();
    range.selectNodeContents(block);
    try { range.setEnd(selection.anchorNode, selection.anchorOffset); }
    catch { return null; }
    return range.toString().replace(/[\uFEFF\u200B]/g, '').length;
  }

  describe(block, trigger) {
    if (!block) return null;
    return describeBlockTransform(block.tagName, this.cleanText(block), trigger);
  }

  apply(block, transform, preserveCaret = true) {
    if (!transform) return false;
    if (transform.task) {
      block.innerHTML = `<input type="checkbox"${transform.checked ? ' checked' : ''}> <span><br></span>`;
      block.dataset.mdToken = transform.token || '- [ ] ';
      const content = this.listItemContent(block, true);
      if (preserveCaret) this.placeCaret(content, true);
      return block;
    }
    const replacement = document.createElement(transform.tag);
    if (transform.token) replacement.dataset.mdToken = transform.token;
    if (transform.text) replacement.textContent = transform.text;
    else replacement.innerHTML = '<br>';
    if (transform.wrapper) {
      const wrapper = document.createElement(transform.wrapper);
      if (transform.token) wrapper.dataset.mdToken = transform.token;
      if (transform.language) { replacement.className = `language-${transform.language}`; wrapper.dataset.language = transform.language; }
      wrapper.append(replacement);
      block.replaceWith(wrapper);
    } else block.replaceWith(replacement);
    const editable = replacement.tagName === 'LI' ? this.listItemContent(replacement, true) : replacement;
    if (preserveCaret) this.placeCaret(editable, transform.caret === 'start');
    return replacement;
  }

  transformCurrent(trigger) {
    const block = this.currentBlock();
    return this.apply(block, this.describe(block, trigger));
  }

  placeCaret(element, atStart = false) {
    this.caretModel.place(element, atStart);
  }

  insertTabCharacter() {
    const selection = window.getSelection();
    if (!selection.rangeCount || !this.editor.contains(selection.anchorNode)) return false;
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const tab = document.createElement('span');
    tab.dataset.mdTab = '';
    tab.textContent = '\t';
    range.insertNode(tab);
    range.setStartAfter(tab); range.collapse(true);
    selection.removeAllRanges(); selection.addRange(range);
    return true;
  }

  insertAfter(reference, element) {
    reference.parentNode.insertBefore(element, reference.nextSibling);
    this.placeCaret(element, true);
  }

  paragraphFromBlock(block) {
    const paragraph = document.createElement('p');
    if (block.tagName === 'LI') {
      paragraph.innerHTML = this.listItemContent(block, true).innerHTML;
    } else if (block.tagName === 'PRE') {
      paragraph.textContent = block.querySelector('code')?.textContent || block.textContent;
    } else paragraph.innerHTML = block.innerHTML;
    paragraph.querySelectorAll('[data-md-token]').forEach(node => node.removeAttribute('data-md-token'));
    if (!paragraph.textContent && !paragraph.querySelector('img')) paragraph.innerHTML = '<br>';
    return paragraph;
  }

  handleBackspace(event) {
    const block = this.currentBlock();
    if (block?.tagName === 'LI' && this.listEditing.handleBackspace(block)) {
      event.preventDefault(); this.handleInput(); return true;
    }
    if (block?.tagName === 'LI') return false;
    const syntax = this.blockSyntax(block);
    const contentBlock = block?.tagName === 'LI' ? this.listItemContent(block, true) : block;
    const offset = this.caretOffset(contentBlock);
    if (!syntax) {
      const topBlock = block?.parentElement === this.editor ? block : block?.closest('.wysiwyg > *');
      if (offset === 0 && topBlock === this.editor.firstElementChild) {
        event.preventDefault();
        if (!block.textContent && !block.querySelector('img')) block.innerHTML = '<br>';
        this.placeCaret(block, true);
        return true;
      }
      return false;
    }
    if (offset !== 0) return false;
    event.preventDefault();
    const paragraph = this.paragraphFromBlock(block);
    syntax.root.replaceWith(paragraph);
    this.placeCaret(paragraph, true);
    this.handleInput();
    return Boolean(paragraph);
  }

  splitParagraph(block) {
    const selection = window.getSelection();
    if (!selection.rangeCount || !selection.isCollapsed || !block.contains(selection.anchorNode)) return false;
    const tailRange = document.createRange();
    tailRange.selectNodeContents(block);
    try { tailRange.setStart(selection.anchorNode, selection.anchorOffset); }
    catch { return false; }
    const tail = tailRange.extractContents();
    const paragraph = document.createElement('p');
    paragraph.append(tail);
    if (!block.textContent && !block.querySelector('img')) block.innerHTML = '<br>';
    if (!paragraph.textContent && !paragraph.querySelector('img')) paragraph.innerHTML = '<br>';
    this.insertAfter(block, paragraph);
    return true;
  }

  applyInlineShortcut() {
    const selection = window.getSelection();
    const node = selection.anchorNode;
    if (!node || node.nodeType !== Node.TEXT_NODE || selection.anchorOffset !== node.nodeValue.length) return false;
    const match = matchInlineShortcut(node.nodeValue);
    if (match) {
      const range = document.createRange();
      range.setStart(node, match.start);
      range.setEnd(node, match.end);
      range.deleteContents();
      const formatted = document.createElement(match.tag);
      formatted.textContent = match.text;
      range.insertNode(formatted);
      range.setStartAfter(formatted);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
      return true;
    }
    return false;
  }

  handleInput() {
    if (this.composing) return;
    this.normalizeListItems();
    this.transformCurrent('content') || this.applyInlineShortcut();
    const block = this.currentBlock();
    this.hooks.onInput?.(block);
    this.hooks.onSelectionChange?.(block, window.getSelection());
  }

  handleKeydown(event) {
    if (!this.hasStableCaret()) this.ensureCaretBlock();
    if (event.isComposing || this.composing) return;
    if (this.tableEditing.handleKeydown(event)) return;
    if (event.key === 'Backspace' && this.handleBackspace(event)) return;
    if (event.key === ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
      if (this.transformCurrent('space')) {
        event.preventDefault();
        this.handleInput();
        return;
      }
    }
    if (event.key === 'Enter' && !event.shiftKey && this.handleEnter(event)) return;
    if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey && this.handleTab(event)) return;
    this.hooks.onKeydown?.(event);
  }

  handleEnter(event) {
    const block = this.currentBlock();
    if (!block) return false;
    if (block.tagName === 'LI' && this.listEditing.handleEnter(block)) {
      event.preventDefault(); this.handleInput(); return true;
    }
    if (/^H[1-6]$/.test(block.tagName)) {
      event.preventDefault();
      const selection = window.getSelection();
      const activeRange = selection.getRangeAt(0);
      const prefixRange = document.createRange();
      prefixRange.selectNodeContents(block);
      prefixRange.setEnd(activeRange.startContainer, activeRange.startOffset);
      const offset = prefixRange.toString().length;
      const text = block.textContent;
      const before = text.slice(0, offset);
      const after = text.slice(offset);
      block.innerHTML = before ? '' : '<br>';
      if (before) block.textContent = before;
      const paragraph = document.createElement('p');
      paragraph.innerHTML = after ? '' : '<br>';
      if (after) paragraph.textContent = after;
      this.insertAfter(block, paragraph);
      this.handleInput();
      return true;
    }
    if (['P', 'DIV'].includes(block.tagName)) {
      const text = this.cleanText(block);
      const heading = describeBlockTransform(block.tagName, text, 'content');
      if (/^h[1-6]$/.test(heading?.tag || '')) {
        event.preventDefault();
        const headingNode = this.apply(block, heading, false);
        const paragraph = document.createElement('p'); paragraph.innerHTML = '<br>';
        this.insertAfter(headingNode, paragraph);
        this.handleInput();
        return true;
      }
      if (/^```[a-zA-Z0-9_+-]*$/.test(text.trim())) {
        event.preventDefault();
        const language = text.trim().slice(3);
        this.apply(block, { tag: 'code', wrapper: 'pre', token: `\`\`\`${language}`, text: '', language, caret: 'start' });
        this.handleInput();
        return true;
      }
      if (/^\$\$$/.test(text.trim())) {
        event.preventDefault();
        this.apply(block, { tag: 'code', wrapper: 'pre', text: '', caret: 'start' });
        const pre = this.currentBlock()?.closest('pre'); if (pre) pre.classList.add('math-block');
        this.handleInput();
        return true;
      }
      if (/^\s*(---+|___+|\*\*\*+)\s*$/.test(text)) {
        event.preventDefault();
        const rule = document.createElement('hr');
        const paragraph = document.createElement('p'); paragraph.innerHTML = '<br>';
        block.replaceWith(rule); this.insertAfter(rule, paragraph); this.handleInput(); return true;
      }
      if (/^\[toc\]$/i.test(text.trim())) {
        event.preventDefault();
        const toc = document.createElement('nav'); toc.className = 'document-toc'; toc.contentEditable = 'false';
        block.replaceWith(toc); const paragraph = document.createElement('p'); paragraph.innerHTML = '<br>';
        this.insertAfter(toc, paragraph); this.hooks.onToc?.(toc); this.handleInput(); return true;
      }
      const table = this.tableFromHeader(text);
      if (table) {
        event.preventDefault(); block.replaceWith(table);
        const paragraph = document.createElement('p'); paragraph.innerHTML = '<br>';
        table.parentNode.insertBefore(paragraph, table.nextSibling);
        this.placeCaret(table.querySelector('tbody td'), true); this.handleInput(); return true;
      }
      event.preventDefault();
      if (this.splitParagraph(block)) { this.handleInput(); return true; }
    }
    return false;
  }

  tableFromHeader(text) {
    const cells = parseTableHeaderCells(text);
    if (!cells) return null;
    const table = document.createElement('table');
    const thead = document.createElement('thead'); const headerRow = document.createElement('tr');
    const tbody = document.createElement('tbody'); const bodyRow = document.createElement('tr');
    cells.forEach(value => {
      const th = document.createElement('th'); th.textContent = value; headerRow.append(th);
      const td = document.createElement('td'); td.innerHTML = '<br>'; bodyRow.append(td);
    });
    thead.append(headerRow); tbody.append(bodyRow); table.append(thead, tbody);
    return table;
  }

  handleTab(event) {
    event.preventDefault();
    const block = this.currentBlock();
    const cell = block?.closest('td,th');
    if (!cell) {
      const item = block?.closest('li');
      if (item) this.listEditing.handleTab(item, event.shiftKey);
      else if (!event.shiftKey) this.insertTabCharacter();
      this.handleInput();
      return true;
    }
    return this.tableEditing.navigate(event.shiftKey);
  }

  tableContext(node = null) { return this.tableEditing.context(node); }
  activateTableCell(node) { return this.tableEditing.activateCell(node?.closest?.('th,td')) || false; }
  executeTableCommand(command, value = null) { return this.tableEditing.execute(command, value); }

  async handlePaste(event) {
    event.preventDefault();
    return this.pasteContent(event.clipboardData.getData('text/plain'), event.clipboardData.getData('text/html'));
  }

  async pasteContent(text, html = '', plain = false) {
    if (this.composing) return;
    if (!this.hasStableCaret()) this.ensureCaretBlock();
    const transaction = this.hooks.captureTransaction?.();
    if (this.tableEditing.pasteMatrix(text)) return;
    const selection = window.getSelection();
    const savedRange = selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    if (!savedRange || !this.editor.contains(savedRange.commonAncestorContainer)) return;
    const inCode = Boolean(this.currentBlock()?.closest('pre'));
    const literalContext = Boolean(this.currentBlock()?.closest('pre,td,th'));
    const safeHtml = html && !plain && !inCode ? await window.inkdown.sanitizeHtml(html) : '';
    if (transaction && !this.hooks.isTransactionCurrent?.(transaction)) return;
    if (!plain && !literalContext) {
      const markdown = clipboardToMarkdown(text, safeHtml, html => this.hooks.decodeClipboard?.(html));
      if (markdown != null) return this.hooks.onMarkdownPaste?.(markdown, savedRange);
    }
    if (savedRange && this.editor.contains(savedRange.commonAncestorContainer)) { selection.removeAllRanges(); selection.addRange(savedRange); }
    // A single DOM range operation avoids Chromium's expensive multiline
    // insertText path and its extra input-triggered whole-document conversion.
    if (safeHtml) {
      this.insertingClipboard = true;
      try { document.execCommand('insertHTML', false, safeHtml); }
      finally { this.insertingClipboard = false; }
    } else {
      const fragment = document.createDocumentFragment();
      if (inCode) fragment.append(document.createTextNode(text));
      else {
      const lines = text.split(/\r\n?|\n/);
      lines.forEach((line, index) => { if (index) fragment.append(document.createElement('br')); fragment.append(document.createTextNode(line)); });
      }
      const last = fragment.lastChild;
      savedRange.deleteContents();
      savedRange.insertNode(fragment);
      if (last) savedRange.setStartAfter(last);
      savedRange.collapse(true);
      selection.removeAllRanges(); selection.addRange(savedRange);
    }
    this.normalizeListItems();
    const block = this.currentBlock();
    this.hooks.onInput?.(block);
    this.hooks.onSelectionChange?.(block, selection);
  }

  handleCheckbox(event) {
    if (event.target.matches('input[type="checkbox"]')) {
      event.target.toggleAttribute('checked', event.target.checked);
      this.hooks.onInput?.(this.currentBlock());
    }
  }
}
