const baseCommands = [
  ['new', '新建', 'Ctrl+N', true], ['open', '打开/导入文件…', 'Ctrl+O', true], ['folder', '打开文件夹…', 'Ctrl+Shift+O', true],
  ['recent-files', '打开最近文件'], ['open-recent', '打开最近文件'], ['clear-recent', '清空最近文件记录'],
  ['quick-open', '快速打开…', 'Ctrl+P'], ['command-palette', '命令面板…', 'Ctrl+Shift+P'], ['reopen-closed', '重新打开关闭的文件', 'Ctrl+Shift+T'],
  ['save', '保存', 'Ctrl+S', true], ['save-as', '另存为…', 'Ctrl+Shift+S', true], ['close', '关闭标签', 'Ctrl+W'],
  ['export-markdown', '导出 Markdown…', '', true], ['export-text', '导出纯文本…', '', true], ['export-html', '导出 HTML 网页…', '', true],
  ['export-pdf', '导出 PDF 文档…', '', true], ['export-docx', '导出 Word 文档…', '', true], ['settings', '偏好设置…', 'Ctrl+,', true], ['quit', '退出'],
  ['undo', '撤销', 'Ctrl+Z'], ['redo', '重做', 'Ctrl+Y'], ['cut', '剪切', 'Ctrl+X'], ['copy', '复制', 'Ctrl+C'],
  ['paste', '粘贴', 'Ctrl+V'], ['paste-plain', '粘贴为纯文本', 'Ctrl+Shift+V'], ['select-all', '全选', 'Ctrl+A'],
  ['paragraph', '正文', 'Ctrl+0', true], ['increase-heading', '提升标题级别', 'Ctrl+='], ['decrease-heading', '降低标题级别', 'Ctrl+-'],
  ['code-block', '代码块', 'Ctrl+Shift+K', true], ['math-block', '公式块', 'Ctrl+Shift+M', true], ['quote', '引用', 'Ctrl+Shift+Q', true],
  ['ordered-list', '有序列表', 'Ctrl+Shift+['], ['unordered-list', '无序列表', 'Ctrl+Shift+]'], ['task-list', '任务列表', 'Ctrl+Shift+X'],
  ['table', '插入表格', 'Ctrl+T', true], ['table-row-before', '在上方插入行'], ['table-row-after', '在下方插入行', 'Ctrl+Enter'],
  ['table-row-delete', '删除当前行', 'Ctrl+Shift+Backspace'], ['table-column-before', '在左侧插入列'], ['table-column-after', '在右侧插入列'],
  ['table-column-delete', '删除当前列'], ['table-resize', '调整表格尺寸'], ['toc', '插入目录', '', true],
  ['horizontal-rule', '插入分隔线', '', true], ['frontmatter', 'YAML 元数据', '', true],
  ['bold', '粗体', 'Ctrl+B', true], ['italic', '斜体', 'Ctrl+I', true], ['underline', '下划线', 'Ctrl+U', true],
  ['strike', '删除线', 'Alt+Shift+5', true], ['inline-code', '行内代码', 'Ctrl+Shift+`', true], ['highlight', '高亮'],
  ['link', '超链接', 'Ctrl+K', true], ['image', '插入图片', 'Ctrl+Shift+I', true], ['clear-format', '清除格式', 'Ctrl+\\'],
  ['sidebar', '切换侧栏', 'Ctrl+Shift+L'], ['outline', '大纲', 'Ctrl+Shift+1', true], ['files', '文件树', 'Ctrl+Shift+3', true],
  ['global-search', '全局搜索', 'Ctrl+Shift+F', true], ['source', '切换源码模式', 'Ctrl+/', true], ['toolbar', '浮动工具栏'],
  ['focus-mode', '专注模式', 'F8', true], ['theme', '切换主题', 'Ctrl+Alt+L'],
  ['open-user-style', '打开 Markdown 样式配置'], ['reload-user-style', '重新加载 Markdown 样式'], ['fullscreen', '全屏', 'F11'],
  ['shortcut-help', '快捷键速查', 'F1'], ['copy-markdown', '复制 Markdown', 'Ctrl+Shift+C'], ['find', '查找', 'Ctrl+F'], ['replace', '替换', 'Ctrl+H'],
  ['next-document', '切换文档', 'Ctrl+Tab']
];

const headingCommands = Array.from({ length: 6 }, (_, index) => [
  `heading-${index + 1}`, `${'一二三四五六'[index]}级标题`, `Ctrl+${index + 1}`, index < 3
]);

export const COMMANDS = Object.freeze([...baseCommands, ...headingCommands].map(([action, label, shortcut = '', palette = false]) => Object.freeze({
  action, label, shortcut, palette
})));

const commandMap = new Map(COMMANDS.map(command => [command.action, command]));

export function commandItem(action, overrides = {}) {
  const command = commandMap.get(action);
  if (!command) throw new Error(`Unknown command: ${action}`);
  return { label: command.label, shortcut: command.shortcut, action, ...overrides };
}

export function commandPaletteItems() {
  return COMMANDS.filter(command => command.palette).map(command => ({
    label: command.label.replace(/…$/, ''), detail: command.shortcut, action: command.action, type: 'command'
  }));
}

const bind = (action, code, modifiers = {}) => ({ action, code, ctrl: false, shift: false, alt: false, ...modifiers });
const keyBindings = [
  bind('new', 'KeyN', { ctrl: true }), bind('open', 'KeyO', { ctrl: true }), bind('folder', 'KeyO', { ctrl: true, shift: true }),
  bind('save', 'KeyS', { ctrl: true }), bind('save-as', 'KeyS', { ctrl: true, shift: true }), bind('close', 'KeyW', { ctrl: true }),
  bind('reopen-closed', 'KeyT', { ctrl: true, shift: true }), bind('quick-open', 'KeyP', { ctrl: true }), bind('command-palette', 'KeyP', { ctrl: true, shift: true }),
  bind('settings', 'Comma', { ctrl: true }), bind('source', 'Slash', { ctrl: true }), bind('outline', 'Digit1', { ctrl: true, shift: true }),
  bind('files', 'Digit3', { ctrl: true, shift: true }), bind('sidebar', 'KeyL', { ctrl: true, shift: true }), bind('global-search', 'KeyF', { ctrl: true, shift: true }),
  bind('find', 'KeyF', { ctrl: true }), bind('replace', 'KeyH', { ctrl: true }), bind('bold', 'KeyB', { ctrl: true }), bind('italic', 'KeyI', { ctrl: true }),
  bind('underline', 'KeyU', { ctrl: true }), bind('link', 'KeyK', { ctrl: true }), bind('image', 'KeyI', { ctrl: true, shift: true }),
  bind('code-block', 'KeyK', { ctrl: true, shift: true }), bind('math-block', 'KeyM', { ctrl: true, shift: true }), bind('quote', 'KeyQ', { ctrl: true, shift: true }),
  bind('ordered-list', 'BracketLeft', { ctrl: true, shift: true }), bind('unordered-list', 'BracketRight', { ctrl: true, shift: true }),
  bind('task-list', 'KeyX', { ctrl: true, shift: true }), bind('inline-code', 'Backquote', { ctrl: true, shift: true }),
  bind('copy-markdown', 'KeyC', { ctrl: true, shift: true }), bind('clear-format', 'Backslash', { ctrl: true }), bind('table', 'KeyT', { ctrl: true }),
  bind('paste-plain', 'KeyV', { ctrl: true, shift: true }),
  bind('increase-heading', 'Equal', { ctrl: true, shift: null }), bind('decrease-heading', 'Minus', { ctrl: true, shift: null }),
  bind('next-document', 'Tab', { ctrl: true, shift: null }), bind('strike', 'Digit5', { shift: true, alt: true }), bind('theme', 'KeyL', { ctrl: true, alt: true }),
  bind('shortcut-help', 'F1'), bind('focus-mode', 'F8'), bind('fullscreen', 'F11')
];

for (let level = 0; level <= 6; level++) keyBindings.push(bind(level ? `heading-${level}` : 'paragraph', `Digit${level}`, { ctrl: true }));

export function resolveKeyboardAction(event) {
  const ctrl = Boolean(event.ctrlKey || event.metaKey);
  return keyBindings.find(binding => binding.code === event.code
    && binding.ctrl === ctrl
    && (binding.shift === null || binding.shift === Boolean(event.shiftKey))
    && binding.alt === Boolean(event.altKey))?.action || null;
}
