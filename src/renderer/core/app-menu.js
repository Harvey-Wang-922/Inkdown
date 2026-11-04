import { commandItem as item } from './command-registry.js';

export const APP_MENU_DEFINITIONS = [
  { label: '文件', items: [
    item('new'), item('open'), item('recent-files', { submenu: 'recent-files' }), item('folder'), item('quick-open'), item('reopen-closed'), null,
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
  constructor(root, onAction, getSubmenuItems = () => []) {
    this.root = root;
    this.onAction = onAction;
    this.getSubmenuItems = getSubmenuItems;
    this.openIndex = -1;
    this.render();
    window.addEventListener('resize', () => this.close());
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
      title.addEventListener('keydown', event => {
        if (event.key !== 'ArrowDown') return;
        event.preventDefault(); event.stopPropagation(); this.setOpen(index);
        dropdown.querySelector('button:not(:disabled)')?.focus();
      });
      for (const item of menu.items) dropdown.append(this.entry(item));
      this.bindNavigation(dropdown);
      group.append(title, dropdown);
      return group;
    }));
  }

  entry(item) {
        if (!item) {
          const separator = document.createElement('div');
          separator.className = 'app-menu-separator';
          separator.setAttribute('role', 'separator');
          return separator;
        }
        const button = document.createElement('button');
        button.className = 'app-menu-item';
        button.type = 'button';
        if (item.action) button.dataset.action = item.action;
        button.setAttribute('role', 'menuitem');
        button.disabled = Boolean(item.disabled);
        if (item.title) button.title = item.title;
        const label = document.createElement('span'); label.textContent = item.label;
        const shortcut = document.createElement('kbd'); shortcut.textContent = item.shortcut || '';
        button.append(label, shortcut);
        button.addEventListener('mousedown', event => event.preventDefault());
        if (!item.submenu) {
          button.addEventListener('click', event => { event.stopPropagation(); this.close(); this.onAction(item.action, item.value); });
          return button;
        }
        const group = document.createElement('div'); group.className = 'app-menu-submenu';
        const panel = document.createElement('div'); panel.className = 'app-menu-submenu-panel'; panel.setAttribute('role', 'menu');
        button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false'); shortcut.textContent = '›';
        const close = () => { group.classList.remove('open'); button.setAttribute('aria-expanded', 'false'); };
        const open = () => {
          this.closeSubmenus();
          panel.replaceChildren(...this.getSubmenuItems(item.submenu).map(entry => this.entry(entry)));
          group.classList.add('open'); button.setAttribute('aria-expanded', 'true');
          const rect = button.getBoundingClientRect();
          const width = panel.offsetWidth, height = panel.offsetHeight;
          const x = rect.right + width <= window.innerWidth - 8 ? rect.right : rect.left - width;
          panel.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, x))}px`;
          panel.style.top = `${Math.max(8, Math.min(window.innerHeight - height - 8, rect.top))}px`;
        };
        button.addEventListener('mouseenter', open);
        button.addEventListener('click', event => { event.stopPropagation(); open(); });
        button.addEventListener('keydown', event => {
          if (event.key !== 'ArrowRight') return;
          event.preventDefault(); event.stopPropagation(); open(); panel.querySelector('button:not(:disabled)')?.focus();
        });
        group.addEventListener('mouseleave', close);
        this.bindNavigation(panel, () => { close(); button.focus(); });
        group.append(button, panel); return group;
  }

  bindNavigation(panel, back = null) {
    panel.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape', 'ArrowLeft'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Escape' || event.key === 'ArrowLeft') {
        if (back) back(); else { const title = this.root.children[this.openIndex]?.querySelector('.app-menu-title'); this.close(); title?.focus(); }
        return;
      }
      const buttons = [...panel.querySelectorAll(':scope > button:not(:disabled), :scope > .app-menu-submenu > button:not(:disabled)')];
      if (!back) this.closeSubmenus();
      const index = buttons.indexOf(document.activeElement), last = buttons.length - 1;
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? last : (index + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length;
      buttons[next]?.focus();
    });
  }

  closeSubmenus() {
    for (const group of this.root.querySelectorAll('.app-menu-submenu.open')) {
      group.classList.remove('open'); group.firstElementChild.setAttribute('aria-expanded', 'false');
    }
  }

  toggle(index) { this.setOpen(this.openIndex === index ? -1 : index); }
  close() { this.setOpen(-1); }
  setOpen(index) {
    this.closeSubmenus();
    this.openIndex = index;
    [...this.root.children].forEach((group, groupIndex) => {
      const open = groupIndex === index;
      group.classList.toggle('open', open);
      group.querySelector('.app-menu-title').setAttribute('aria-expanded', String(open));
    });
  }
}
