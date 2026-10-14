import { commandItem as item } from './command-registry.js';

export const APP_MENU_DEFINITIONS = [
  { label: '文件', items: [
    item('new'), item('open'), item('folder'), item('quick-open'), item('reopen-closed'), null,
    item('save'), item('save-as'), item('close'), null,
    item('export-markdown'), item('export-text'), item('export-html'), item('export-pdf'), item('export-docx'), null,
    item('settings'), item('quit')
  ]},
  { label: '编辑', items: [
    item('undo'), item('redo'), null, item('cut'), item('copy'), item('paste'), item('paste-plain'), item('select-all')
  ]},
  { label: '段落', items: [
    item('paragraph'), ...Array.from({ length: 6 }, (_, index) => item(`heading-${index + 1}`)),
    item('increase-heading'), item('decrease-heading'), null, item('code-block'), item('math-block'), item('quote'),
    item('ordered-list'), item('unordered-list'), item('task-list'), item('table'), item('table-row-before'), item('table-row-after'),
    item('table-row-delete'), item('table-column-before'), item('table-column-after'), item('table-column-delete'), item('table-resize'),
    item('toc'), item('horizontal-rule'), item('frontmatter')
  ]},
  { label: '格式', items: [
    item('bold'), item('italic'), item('underline'), item('strike'), item('inline-code'), item('highlight'), item('link'), item('image'), item('clear-format')
  ]},
  { label: '视图', items: [
    item('sidebar'), item('outline'), item('files'), item('global-search'), item('source'), item('toolbar'), item('focus-mode'),
    item('theme'), null, item('open-user-style'), item('reload-user-style'), item('fullscreen')
  ]},
  { label: '帮助', items: [item('shortcut-help')] }
];

export class AppMenu {
  constructor(root, onAction) {
    this.root = root;
    this.onAction = onAction;
    this.openIndex = -1;
    this.render();
  }

  render() {
    this.root.replaceChildren(...APP_MENU_DEFINITIONS.map((menu, index) => {
      const group = document.createElement('div');
      group.className = 'app-menu-group';
      const title = document.createElement('button');
      title.className = 'app-menu-title';
      title.type = 'button';
      title.textContent = menu.label;
      title.setAttribute('aria-haspopup', 'true');
      title.setAttribute('aria-expanded', 'false');
      title.addEventListener('mousedown', event => event.preventDefault());
      title.addEventListener('click', event => { event.stopPropagation(); this.toggle(index); });
      const dropdown = document.createElement('div');
      dropdown.className = 'app-menu-dropdown';
      dropdown.setAttribute('role', 'menu');
      for (const item of menu.items) {
        if (!item) {
          const separator = document.createElement('div');
          separator.className = 'app-menu-separator';
          separator.setAttribute('role', 'separator');
          dropdown.append(separator);
          continue;
        }
        const button = document.createElement('button');
        button.className = 'app-menu-item';
        button.type = 'button';
        button.dataset.action = item.action;
        button.setAttribute('role', 'menuitem');
        const label = document.createElement('span'); label.textContent = item.label;
        const shortcut = document.createElement('kbd'); shortcut.textContent = item.shortcut || '';
        button.append(label, shortcut);
        button.addEventListener('mousedown', event => event.preventDefault());
        button.addEventListener('click', event => { event.stopPropagation(); this.close(); this.onAction(item.action); });
        dropdown.append(button);
      }
      group.append(title, dropdown);
      return group;
    }));
  }

  toggle(index) { this.setOpen(this.openIndex === index ? -1 : index); }
  close() { this.setOpen(-1); }
  setOpen(index) {
    this.openIndex = index;
    [...this.root.children].forEach((group, groupIndex) => {
      const open = groupIndex === index;
      group.classList.toggle('open', open);
      group.querySelector('.app-menu-title').setAttribute('aria-expanded', String(open));
    });
  }
}
