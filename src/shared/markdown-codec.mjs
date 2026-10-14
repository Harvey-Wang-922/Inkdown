const TAB_SENTINEL = '\uE000';

// One rule set for sandboxed Chromium and Node; import keeps historical defaults.
export function createMarkdownCodec(Service, gfm, { projection = true } = {}) {
  const options = { headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' };
  if (projection) Object.assign(options, {
    emDelimiter: '*', strongDelimiter: '**',
    blankReplacement: (_, node) => node.nodeName === 'SPAN' && node.hasAttribute('data-md-tab')
      ? TAB_SENTINEL : (node.isBlock ? '\n\n' : '')
  });
  const service = new Service(options);
  if (gfm) service.use(gfm);
  service.addRule('emptyTableCellPlaceholder', {
    filter: node => node.nodeName === 'BR' && /^(TH|TD)$/.test(node.parentNode?.nodeName) && !node.parentNode.textContent,
    replacement: () => ''
  });
  service.addRule('underline', { filter: ['u'], replacement: content => `<u>${content}</u>` });
  service.addRule('highlight', { filter: ['mark'], replacement: content => `==${content}==` });
  if (projection) {
    service.addRule('tabCharacter', { filter: node => node.nodeName === 'SPAN' && node.hasAttribute('data-md-tab'), replacement: () => TAB_SENTINEL });
    service.addRule('localImage', {
      filter: node => node.nodeName === 'IMG' && node.getAttribute('data-markdown-src'),
      replacement: (_, node) => `![${node.getAttribute('alt') || '图片'}](${node.getAttribute('data-markdown-src')})`
    });
    service.addRule('documentToc', { filter: node => node.nodeName === 'NAV' && node.classList.contains('document-toc'), replacement: () => '\n\n[toc]\n\n' });
    service.addRule('frontmatter', { filter: node => node.nodeName === 'PRE' && node.classList.contains('frontmatter'), replacement: content => `---\n${content.trim()}\n---\n\n` });
    service.addRule('mathBlock', { filter: node => node.nodeName === 'PRE' && node.classList.contains('math-block'), replacement: content => `\n\n$$\n${content.trim()}\n$$\n\n` });
    service.addRule('footnoteRef', { filter: node => node.nodeName === 'SUP' && node.classList.contains('footnote-ref'), replacement: (_, node) => `[^${node.getAttribute('data-label')}]` });
    service.addRule('footnotes', {
      filter: node => node.nodeName === 'SECTION' && node.classList.contains('footnotes'),
      replacement: (_, node) => `\n\n${[...node.querySelectorAll('li[data-label]')].map(item => `[^${item.getAttribute('data-label')}]: ${item.textContent.trim()}`).join('\n')}\n\n`
    });
  }
  return {
    toMarkdown(html) {
      const markdown = service.turndown(String(html || ''));
      return projection ? markdown.replaceAll(TAB_SENTINEL, '\t') : markdown;
    }
  };
}
