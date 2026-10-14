const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');

marked.setOptions({ gfm: true, breaks: true });

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function protectEditableTabs(value) {
  let fence = null;
  return String(value || '').split('\n').map(line => {
    const marker = line.match(/^ {0,3}(`{3,}|~{3,})/)?.[1] || null;
    if (marker) {
      if (!fence) fence = { char: marker[0], length: marker.length };
      else if (marker[0] === fence.char && marker.length >= fence.length) fence = null;
      return line;
    }
    if (fence || /^(?: {4}|\t)/.test(line)) return line;
    const firstText = line.search(/\S/);
    if (firstText < 0) return line;
    return line.slice(0, firstText) + line.slice(firstText).replace(/\t/g, '<span data-md-tab="true">\t</span>');
  }).join('\n');
}

function renderMarkdownDocument(value) {
  let source = String(value || '');
  let frontmatter = '';
  const frontmatterMatch = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (frontmatterMatch) {
    frontmatter = `<pre class="frontmatter"><code>${escapeHtml(frontmatterMatch[1])}</code></pre>`;
    source = source.slice(frontmatterMatch[0].length);
  }
  source = protectEditableTabs(source);
  const mathBlocks = [];
  const footnotes = [];
  source = source.replace(/^\[\^([^\]]+)\]:\s*(.+)$/gm, (_, label, content) => { footnotes.push({ label, content }); return ''; });
  const footnoteOrder = [];
  source = source.replace(/\[\^([^\]]+)\]/g, (_, label) => {
    if (!footnoteOrder.includes(label)) footnoteOrder.push(label);
    const number = footnoteOrder.indexOf(label) + 1;
    return `<sup class="footnote-ref" data-label="${escapeHtml(label)}"><a href="#footnote-${encodeURIComponent(label)}">${number}</a></sup>`;
  });
  source = source.replace(/\$\$\s*\n([\s\S]*?)\n\$\$/g, (_, formula) => {
    const token = `INKDOWNMATHBLOCK${mathBlocks.length}TOKEN`;
    mathBlocks.push(`<pre class="math-block"><code>${escapeHtml(formula.trim())}</code></pre>`);
    return `\n\n${token}\n\n`;
  });
  source = source.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
  let html = marked.parse(source);
  const headings = [];
  html = html.replace(/<h([1-6])>([\s\S]*?)<\/h\1>/g, (_, level, inner) => {
    const label = inner.replace(/<[^>]+>/g, '').trim();
    const id = `heading-${headings.length + 1}`;
    headings.push({ level: Number(level), label, id });
    return `<h${level} id="${id}">${inner}</h${level}>`;
  });
  const toc = `<nav class="document-toc">${headings.map(item => `<a class="toc-level-${item.level}" href="#${item.id}">${escapeHtml(item.label || '未命名标题')}</a>`).join('')}</nav>`;
  html = html.replace(/<p>\s*\[toc\]\s*<\/p>/gi, toc);
  html = html.replace(/<blockquote>\s*<p>\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*/gi, (_, type) => `<blockquote class="callout callout-${type.toLowerCase()}"><p><strong>${type}</strong><br>`);
  mathBlocks.forEach((block, index) => { html = html.replace(`<p>INKDOWNMATHBLOCK${index}TOKEN</p>`, block); });
  if (footnotes.length) html += `<section class="footnotes"><hr><ol>${footnotes.map(item => `<li id="footnote-${encodeURIComponent(item.label)}" data-label="${escapeHtml(item.label)}">${marked.parseInline(item.content)}</li>`).join('')}</ol></section>`;
  return frontmatter + html;
}

function sanitizeRenderedHtml(html, options = {}) {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'details', 'summary', 'input', 'u', 'mark', 'nav', 'sup', 'sub', 'section']),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      '*': ['class', 'id', 'title', 'data-label', 'data-language', 'data-md-tab'],
      a: ['href', 'name', 'target', 'class'],
      img: ['src', 'alt', 'title', 'data-markdown-src'],
      input: ['type', 'checked', 'disabled'],
      th: ['align'], td: ['align']
    },
    allowedSchemes: ['http', 'https', 'data', 'file'],
    ...options
  });
}

function renderMarkdown(source) { return sanitizeRenderedHtml(renderMarkdownDocument(source)); }
function sanitizeClipboardHtml(html) {
  return sanitizeRenderedHtml(String(html || ''), {
    nonTextTags: ['script', 'style', 'textarea', 'option', 'button', 'select', 'svg', 'iframe', 'noscript']
  });
}

function renderProjection(value) {
  const source = String(value || ''), html = renderMarkdown(source);
  const normalized = source.replace(/\r\n?/g, '\n');
  const offsets = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\r' && source[index + 1] === '\n') index++;
    offsets.push(index + 1);
  }
  const tokens = marked.lexer(normalized);
  // Definitions/raw HTML and custom block transforms require the compatibility path.
  if (tokens.map(token => token.raw).join('') !== normalized) return { html, spans: null };
  let cursor = 0;
  const spans = [];
  for (const token of tokens) {
    const start = cursor; cursor += token.raw.length;
    if (token.type === 'space') continue;
    const tag = { paragraph: 'P', heading: `H${token.depth}`, list: token.ordered ? 'OL' : 'UL',
      code: 'PRE', table: 'TABLE', blockquote: 'BLOCKQUOTE', hr: 'HR' }[token.type];
    if (!tag) return { html, spans: null };
    const end = start + token.raw.trimEnd().length;
    spans.push({ start: offsets[start], end: offsets[end], tag });
  }
  return { html, spans };
}

module.exports = { renderMarkdown, renderProjection, sanitizeClipboardHtml };
