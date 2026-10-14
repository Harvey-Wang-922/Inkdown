const lineStartAt = (value, position) => position === 0 ? 0 : value.lastIndexOf('\n', position - 1) + 1;
const lineEndAt = (value, position) => {
  const end = value.indexOf('\n', position);
  return end < 0 ? value.length : end;
};
const patch = (start, end, text, selectionStart = start + text.length, selectionEnd = selectionStart) =>
  ({ start, end, text, selectionStart, selectionEnd });

// Plans only touch the requested source range; callers own history and commits.
export function planSourceEdit(value, start, end, operation, argument, extra) {
  switch (operation) {
    case 'insert': return patch(start, end, argument);
    case 'wrap': {
      const selected = value.slice(start, end), after = extra ?? argument;
      return patch(start, end, argument + selected + after, start + argument.length, start + argument.length + selected.length);
    }
    case 'prefix': {
      const first = lineStartAt(value, start), last = lineEndAt(value, start);
      const line = value.slice(first, last);
      return patch(first, last, argument + (extra ? line.replace(/^#{1,6}\s+/, '') : line));
    }
    case 'indent': {
      const first = lineStartAt(value, start), outdent = Boolean(argument);
      if (!value.slice(start, end).includes('\n')) {
        if (!outdent) return patch(start, end, '\t');
        const removable = value.slice(first, start).match(/(?:\t| {1,4})$/)?.[0] || '';
        return removable ? patch(start - removable.length, start, '') : null;
      }
      const last = lineEndAt(value, end > start && value[end - 1] === '\n' ? end - 1 : end);
      const text = value.slice(first, last).split('\n').map(line =>
        outdent ? line.replace(/^(?:\t| {1,4})/, '') : `\t${line}`).join('\n');
      return patch(first, last, text, first, first + text.length);
    }
    default: throw new Error(`Unknown source operation: ${operation}`);
  }
}

export class SourceEditingController {
  constructor(editor, onChange) { this.editor = editor; this.onChange = onChange; }
  edit(operation, argument, extra, focus = true) {
    const editor = this.editor;
    const plan = planSourceEdit(editor.value, editor.selectionStart, editor.selectionEnd, operation, argument, extra);
    if (!plan) return false;
    editor.setRangeText(plan.text, plan.start, plan.end, 'end');
    editor.setSelectionRange(plan.selectionStart, plan.selectionEnd);
    this.onChange();
    if (focus) editor.focus({ preventScroll: true });
    return true;
  }
  wrap(before, after) { return this.edit('wrap', before, after); }
  insert(text) { return this.edit('insert', text); }
  prefix(prefix, heading = false) { return this.edit('prefix', prefix, heading); }
  indent(outdent = false) { return this.edit('indent', outdent, undefined, false); }
  format(command) {
    const wrappers = { bold: ['**'], italic: ['*'], underline: ['<u>', '</u>'], strikeThrough: ['~~'], inlineCode: ['`'] };
    return wrappers[command] ? this.wrap(...wrappers[command]) : false;
  }
}
