// View state is transient: never part of source history or persisted Markdown.
export function captureEditorView(editor, pane, sourceMode = false) {
  const point = (node, offset) => {
    if (!node || !editor.contains(node)) return null;
    let block = node.nodeType === 1 ? node : node.parentElement;
    while (block !== editor && block.parentElement !== editor) block = block.parentElement;
    const range = editor.ownerDocument.createRange();
    range.selectNodeContents(block); range.setEnd(node, offset);
    return { block: block === editor ? -1 : [...editor.children].indexOf(block), offset: range.toString().length };
  };
  const selection = editor.ownerDocument.defaultView.getSelection();
  return { scrollTop: pane.scrollTop, scrollLeft: pane.scrollLeft, sourceMode,
    editorScrollTop: editor.scrollTop, editorScrollLeft: editor.scrollLeft,
    anchor: sourceMode ? editor.selectionStart : point(selection.anchorNode, selection.anchorOffset),
    focus: sourceMode ? editor.selectionEnd : point(selection.focusNode, selection.focusOffset),
    direction: sourceMode ? editor.selectionDirection : null };
}

export function restoreEditorView(editor, pane, view) {
  editor.focus({ preventScroll: true });
  if (view.sourceMode) {
    editor.setSelectionRange(view.anchor, view.focus, view.direction);
  } else {
    const resolve = point => {
      const block = point?.block >= 0 ? editor.children[Math.min(point.block, editor.children.length - 1)] : editor;
      const root = block || editor;
      const walker = editor.ownerDocument.createTreeWalker(root, 4);
      let node, last, remaining = point?.offset || 0;
      while ((node = walker.nextNode())) {
        if (remaining <= node.length) return [node, remaining];
        remaining -= node.length; last = node;
      }
      return last ? [last, last.length] : [root, root.childNodes.length];
    };
    const selection = editor.ownerDocument.defaultView.getSelection();
    selection.setBaseAndExtent(...resolve(view.anchor), ...resolve(view.focus));
  }
  pane.scrollTo({ top: view.scrollTop, left: view.scrollLeft, behavior: 'instant' });
  editor.scrollTo({ top: view.editorScrollTop, left: view.editorScrollLeft, behavior: 'instant' });
}
