// Screen-space placement is bounded by the editor viewport, not window chrome.
export function floatingToolbarLayout(anchor, viewport, size, { centered = false, gap = 8 } = {}) {
  const left = viewport.left + gap, right = viewport.right - gap;
  const top = viewport.top + gap, bottom = viewport.bottom - gap;
  if (right <= left || bottom <= top || anchor.bottom <= top || anchor.top >= bottom || anchor.right <= left || anchor.left >= right) return null;
  const width = Math.min(size.width, right - left), height = Math.min(size.height, bottom - top);
  const x = centered ? (Math.max(left, anchor.left) + Math.min(right, anchor.right) - width) / 2 : anchor.left;
  const above = anchor.top - gap - height;
  const y = above >= top ? above : anchor.top < top ? top : anchor.bottom + gap;
  return { left: Math.max(left, Math.min(right - width, x)), top: Math.max(top, Math.min(bottom - height, y)), maxWidth: right - left, maxHeight: bottom - top };
}

export function placeFloatingToolbar(toolbar, anchor, viewport, options) {
  toolbar.classList.remove('hidden');
  toolbar.style.maxWidth = `${Math.max(0, viewport.width - 16)}px`;
  toolbar.style.maxHeight = `${Math.max(0, viewport.height - 16)}px`;
  const layout = floatingToolbarLayout(anchor, viewport, { width: toolbar.offsetWidth, height: toolbar.offsetHeight }, options);
  toolbar.classList.toggle('hidden', !layout);
  if (!layout) return;
  toolbar.style.left = `${layout.left}px`; toolbar.style.top = `${layout.top}px`;
}
