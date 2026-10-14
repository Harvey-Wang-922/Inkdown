// Plain clipboard Markdown is a source operation, not literal editable text.
export function isMarkdownClipboard(text) {
  return /(^|\n) {0,3}(?:#{1,6}\s|```|~~~|>\s|[-+*]\s|\d+[.)]\s|\|.*\||---\s*$)|(?:\*{1,2}|_{1,2}|~~|`)[^\n]+(?:\*{1,2}|_{1,2}|~~|`)|\[[^\n\]]+\]\([^\n)]+\)/m.test(text);
}

// Clipboard HTML carries structure that text/plain cannot express. Normalize
// a sanitized detached fragment, never the live editor or another document.
export function clipboardToMarkdown(text, safeHtml, decode) {
  if (!safeHtml) return isMarkdownClipboard(text) ? text : null;
  const fragment = document.createElement('div');
  fragment.innerHTML = safeHtml;
  const semantic = fragment.querySelectorAll('h1,h2,h3,h4,h5,h6,ul,ol,blockquote,pre,table,strong,b,em,i,del,s,a[href],img[src],code');
  if (!semantic.length) return isMarkdownClipboard(text) ? text : null;
  const pre = fragment.querySelector('pre');
  // Copying raw Markdown from a code/plain-text surface must retain its bytes.
  if (pre && semantic.length <= 2 && pre.textContent.trim() === text.trim() && isMarkdownClipboard(text)) return text;
  for (const block of fragment.querySelectorAll('pre')) {
    const code = block.querySelector('code');
    if (code) block.replaceChildren(code.cloneNode(true));
  }
  for (const node of fragment.querySelectorAll('*')) {
    const language = node.tagName === 'CODE' ? (node.className.match(/(?:^|\s)language-([\w+-]+)/)?.[1] || node.getAttribute('data-language')) : null;
    for (const attr of [...node.attributes]) {
      if (/^(class|id|style|dir|role|data-|aria-)/i.test(attr.name)) node.removeAttribute(attr.name);
    }
    if (language && /^[\w+-]{1,64}$/.test(language)) node.className = `language-${language}`;
  }
  for (const table of fragment.querySelectorAll('table')) {
    if (!table.querySelector('th')) {
      for (const cell of table.querySelector('tr')?.children || []) {
        const heading = document.createElement('th'); heading.append(...cell.childNodes); cell.replaceWith(heading);
      }
    }
  }
  return decode(fragment.innerHTML);
}

export function markdownPasteSource(editor, range, source, text, decode) {
  const before = range.cloneRange();
  before.selectNodeContents(editor);
  before.setEnd(range.startContainer, range.startOffset);
  const after = range.cloneRange();
  after.selectNodeContents(editor);
  after.setStart(range.endContainer, range.endOffset);
  const nonempty = fragment => Boolean(fragment.textContent || fragment.querySelector('img,hr,table,pre'));
  const hasBefore = nonempty(before.cloneContents());
  const hasAfter = nonempty(after.cloneContents());
  if (!hasBefore && !hasAfter) return text;
  if (!hasAfter && range.collapsed) {
    const element = range.startContainer.nodeType === Node.ELEMENT_NODE ? range.startContainer : range.startContainer.parentElement;
    const block = element.closest('p,div');
    const emptyLine = block && block !== editor && !block.textContent && !block.querySelector('img,hr,table');
    const separator = emptyLine && source ? (source.endsWith('\n\n') ? '' : source.endsWith('\n') ? '\n' : '\n\n') : '';
    return source + separator + text;
  }
  if (!hasBefore && range.collapsed) return text + source;
  // Partial visual selections currently use the same codec bridge as visual edits.
  // Decode a detached projection once; the clipboard payload never enters Turndown.
  const token = `INKDOWNPASTE${crypto.randomUUID().replaceAll('-', '')}`;
  const startPath = nodePath(editor, range.startContainer);
  const endPath = nodePath(editor, range.endContainer);
  const clone = editor.cloneNode(true);
  const replacement = document.createRange();
  replacement.setStart(resolvePath(clone, startPath), range.startOffset);
  replacement.setEnd(resolvePath(clone, endPath), range.endOffset);
  replacement.deleteContents();
  replacement.insertNode(document.createTextNode(token));
  const markdown = decode(clone.innerHTML);
  if (!markdown.includes(token)) throw new Error('无法确定 Markdown 粘贴位置');
  return markdown.replace(token, () => text);
}

// Restore the clipboard caret inside the newly activated projection without
// browser focus scrolling or an intermediate selection at the document start.
export function restoreClipboardCaret(editor, offset) {
  let remaining = Math.max(0, offset);
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  let node;
  const caret = document.createRange();
  while ((node = walker.nextNode())) {
    if (remaining <= node.length) {
      caret.setStart(node, remaining); caret.collapse(true); break;
    }
    remaining -= node.length;
  }
  if (!node) { caret.selectNodeContents(editor.lastElementChild || editor); caret.collapse(false); }
  editor.focus({ preventScroll: true });
  const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(caret);
}

function nodePath(root, node) {
  const path = [];
  while (node !== root) {
    path.unshift([...node.parentNode.childNodes].indexOf(node));
    node = node.parentNode;
  }
  return path;
}
function resolvePath(root, path) {
  return path.reduce((node, index) => node.childNodes[index], root);
}
