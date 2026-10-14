const behavior = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth';

// Re-read the range rect after each nested scroll so horizontally scrolling code
// blocks and the outer document pane can both reveal the same exact text range.
export function revealTextRange(range, pane) {
  let element = range.startContainer.parentElement;
  while (element) {
    const rect = range.getClientRects()[0];
    if (!rect) return;
    const bounds = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const vertical = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
    const horizontal = /(auto|scroll)/.test(style.overflowX) && element.scrollWidth > element.clientWidth;
    if (vertical || horizontal) {
      element.scrollTo({
        top: vertical ? element.scrollTop + rect.top - bounds.top - element.clientHeight / 2 + rect.height / 2 : element.scrollTop,
        left: horizontal ? Math.max(0, element.scrollLeft + rect.left - bounds.left - element.clientWidth / 2) : element.scrollLeft,
        behavior: element === pane ? behavior() : 'instant'
      });
    }
    if (element === pane) break;
    element = element.parentElement;
  }
}

// Textareas expose source offsets but no DOM Range. Measure wrapped text with
// the same computed typography in a noneditable, temporary offscreen mirror.
export function sourceMatchBox(source, match) {
  const style = getComputedStyle(source);
  const mirror = document.createElement('div');
  mirror.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;white-space:pre-wrap;overflow-wrap:break-word;box-sizing:border-box;';
  for (const property of ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight', 'letterSpacing', 'tabSize', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'textIndent', 'textTransform']) {
    mirror.style[property] = style[property];
  }
  mirror.style.width = `${source.clientWidth}px`;
  const marker = document.createElement('span');
  marker.textContent = source.value.slice(match.start, match.end) || '\u200b';
  mirror.append(document.createTextNode(source.value.slice(0, match.start)), marker,
    document.createTextNode(source.value.slice(match.end) || '\u200b'));
  document.body.append(mirror);
  try {
    const rect = marker.getClientRects()[0];
    const base = mirror.getBoundingClientRect();
    return { top: rect.top - base.top, left: rect.left - base.left, height: rect.height };
  } finally { mirror.remove(); }
}

export function revealSourceMatch(source, match, pane) {
  const box = sourceMatchBox(source, match);
  source.scrollTo({ top: Math.max(0, box.top - source.clientHeight / 2 + box.height / 2), behavior: behavior() });
  if (pane && pane.scrollHeight > pane.clientHeight) {
    const sourceRect = source.getBoundingClientRect();
    const paneRect = pane.getBoundingClientRect();
    const targetScroll = Math.max(0, Math.min(source.scrollHeight - source.clientHeight, box.top - source.clientHeight / 2 + box.height / 2));
    pane.scrollTo({ top: pane.scrollTop + sourceRect.top - paneRect.top + box.top - targetScroll - pane.clientHeight / 2, behavior: behavior() });
  }
}
