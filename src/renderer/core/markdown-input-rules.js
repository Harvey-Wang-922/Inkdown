const INLINE_SHORTCUTS = [
  { regex: /\*\*([^*\n]+)\*\*$/, tag: 'strong' },
  { regex: /__([^_\n]+)__$/, tag: 'strong' },
  { regex: /~~([^~\n]+)~~$/, tag: 'del' },
  { regex: /==([^=\n]+)==$/, tag: 'mark' },
  { regex: /`([^`\n]+)`$/, tag: 'code' },
  { regex: /(?:^|[^*])\*([^*\n]+)\*$/, tag: 'em', prefixOffset: 1 },
  { regex: /(?:^|[^_])_([^_\n]+)_$/, tag: 'em', prefixOffset: 1 }
];

export function describeBlockTransform(tagName, text, trigger = 'content') {
  const tag = String(tagName || '').toUpperCase();
  const value = String(text || '');
  if (tag === 'LI') {
    const task = trigger === 'space'
      ? value.match(/^\[([ xX])\]$/)
      : value.match(/^\[([ xX])\][\s\u00a0]+$/);
    return task ? { task: true, token: `- [${task[1]}] `, checked: /[xX]/.test(task[1]) } : null;
  }
  if (!['P', 'DIV'].includes(tag)) return null;

  let match;
  if (trigger === 'space') {
    if ((match = value.match(/^(#{1,6})$/))) return { tag: `h${match[1].length}`, token: `${match[1]} `, text: '', caret: 'start' };
    if (value === '>') return { tag: 'blockquote', token: '> ', text: '', caret: 'start' };
    if (/^[-+*]$/.test(value)) return { tag: 'li', wrapper: 'ul', token: '- ', text: '', caret: 'start' };
    if (/^1[.)]$/.test(value)) return { tag: 'li', wrapper: 'ol', token: '1. ', text: '', caret: 'start' };
    if ((match = value.match(/^```([a-zA-Z0-9_+-]*)$/))) return { tag: 'code', wrapper: 'pre', token: `\`\`\`${match[1]}`, text: '', language: match[1], caret: 'start' };
    return null;
  }

  if (/^#{1,6}$/.test(value)) return null;
  if ((match = value.match(/^(#{1,6})[\s\u00a0]+$/))) return { tag: `h${match[1].length}`, token: `${match[1]} `, text: '', caret: 'start' };
  if ((match = value.match(/^(#{1,6})[\s\u00a0]*(\S.*)$/))) return { tag: `h${match[1].length}`, token: `${match[1]} `, text: match[2], caret: 'end' };
  if (/^>[\s\u00a0]+$/.test(value)) return { tag: 'blockquote', token: '> ', text: '', caret: 'start' };
  if ((match = value.match(/^>[\s\u00a0]*(\S.*)$/))) return { tag: 'blockquote', token: '> ', text: match[1], caret: 'end' };
  if ((match = value.match(/^[-+*][\s\u00a0]+(.*)$/))) return { tag: 'li', wrapper: 'ul', token: '- ', text: match[1], caret: match[1] ? 'end' : 'start' };
  if ((match = value.match(/^1[.)][\s\u00a0]+(.*)$/))) return { tag: 'li', wrapper: 'ol', token: '1. ', text: match[1], caret: match[1] ? 'end' : 'start' };
  if ((match = value.match(/^```([a-zA-Z0-9_+-]*)[\s\u00a0]+$/))) return { tag: 'code', wrapper: 'pre', token: `\`\`\`${match[1]}`, text: '', language: match[1], caret: 'start' };
  return null;
}

export function matchInlineShortcut(text) {
  const value = String(text || '');
  for (const rule of INLINE_SHORTCUTS) {
    const match = value.match(rule.regex);
    if (!match) continue;
    const prefixOffset = rule.prefixOffset && match[0].length > match[1].length + 2 ? rule.prefixOffset : 0;
    return { tag: rule.tag, text: match[1], start: match.index + prefixOffset, end: value.length };
  }
  return null;
}

export function parseTableHeaderCells(text) {
  const value = String(text || '');
  if (!/^\s*\|.*\|\s*$/.test(value)) return null;
  const cells = value.trim().slice(1, -1).split('|').map(cell => cell.trim());
  return cells.length >= 2 && cells.every(Boolean) ? cells : null;
}
