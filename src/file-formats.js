const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const mammoth = require('mammoth');
const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');
const TurndownService = require('turndown');
const { gfm } = require('turndown-plugin-gfm');
const { createMarkdownCodec } = require('./shared/markdown-codec.mjs');
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell,
  WidthType, AlignmentType, BorderStyle
} = require('docx');

const MARKDOWN_EXTENSIONS = ['md', 'markdown', 'mdown', 'mkd', 'mkdn'];
const TEXT_EXTENSIONS = ['txt', 'text', 'log'];
const HTML_EXTENSIONS = ['html', 'htm'];
const WORD_EXTENSIONS = ['docx'];
const IMPORT_EXTENSIONS = [...MARKDOWN_EXTENSIONS, ...TEXT_EXTENSIONS, ...HTML_EXTENSIONS, ...WORD_EXTENSIONS];

const markdownCodec = createMarkdownCodec(TurndownService, gfm, { projection: false });

function decodeText(buffer) {
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    for (let index = 0; index + 1 < swapped.length; index += 2) [swapped[index], swapped[index + 1]] = [swapped[index + 1], swapped[index]];
    return swapped.toString('utf16le');
  }
  const utf8 = buffer.toString('utf8').replace(/^\uFEFF/, '');
  const broken = (utf8.match(/\uFFFD/g) || []).length;
  if (broken <= Math.max(1, utf8.length / 500)) return utf8;
  try { return new TextDecoder('gb18030').decode(buffer); } catch { return utf8; }
}

function cleanImportedHtml(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'u', 'mark', 'del', 'table', 'thead', 'tbody', 'tr', 'th', 'td']),
    allowedAttributes: { a: ['href', 'title'], img: ['src', 'alt', 'title'], '*': ['colspan', 'rowspan', 'align'] },
    allowedSchemes: ['http', 'https', 'data', 'file']
  });
}

function htmlToMarkdown(html) {
  return markdownCodec.toMarkdown(cleanImportedHtml(html)).replace(/\n{3,}/g, '\n\n').trim();
}

function resolveHtmlImages(html, filePath) {
  return String(html || '').replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'])/gi, (_, before, source, after) => {
    if (/^(data:|https?:|file:|#)/i.test(source)) return `${before}${source}${after}`;
    return `${before}${pathToFileURL(path.resolve(path.dirname(filePath), decodeURIComponent(source))).href}${after}`;
  });
}

async function importDocument(filePath) {
  const extension = path.extname(filePath).slice(1).toLowerCase();
  if (!IMPORT_EXTENSIONS.includes(extension)) throw new Error(`不支持的文件格式：.${extension || '?'}`);
  if (HTML_EXTENSIONS.includes(extension)) {
    const markdown = htmlToMarkdown(resolveHtmlImages(decodeText(await fs.readFile(filePath)), filePath));
    return { path: null, sourcePath: filePath, name: `${path.basename(filePath, path.extname(filePath))}.md`, content: markdown, importedFormat: extension.toUpperCase() };
  }
  if (WORD_EXTENSIONS.includes(extension)) {
    const result = await mammoth.convertToHtml({ path: filePath }, { includeDefaultStyleMap: true });
    const html = result.value
      .replace(/<table>([\s\S]*?)<\/table>/gi, table => table.replace(/<tr>([\s\S]*?)<\/tr>/i, row => row.replace(/<td>/gi, '<th>').replace(/<\/td>/gi, '</th>')))
      .replace(/<(th|td)>([\s\S]*?)<\/\1>/gi, (_, tag, inner) => `<${tag}>${inner.replace(/<\/?p>/gi, '').replace(/\s+/g, ' ').trim()}</${tag}>`);
    return { path: null, sourcePath: filePath, name: `${path.basename(filePath, path.extname(filePath))}.md`, content: htmlToMarkdown(html), importedFormat: 'DOCX', importWarnings: result.messages.map(item => item.message) };
  }
  return { path: filePath, name: path.basename(filePath), content: decodeText(await fs.readFile(filePath)), importedFormat: MARKDOWN_EXTENSIONS.includes(extension) ? 'Markdown' : 'Text' };
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function buildStandaloneHtml(title, bodyHtml) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data: https:; base-uri 'none'; form-action 'none'"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
  :root{color-scheme:light}*{box-sizing:border-box}body{max-width:860px;margin:52px auto;padding:0 34px;color:#292927;background:#fff;font:17px/1.82 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}h1,h2,h3,h4,h5,h6{line-height:1.3;margin:1.7em 0 .7em}h1{font-size:2.15em;border-bottom:1px solid #e5e5e2;padding-bottom:.28em}h2{font-size:1.65em}a{color:#2766c2}img{max-width:100%;height:auto}pre{padding:16px 18px;background:#f4f4f1;border-radius:6px;overflow:auto;white-space:pre-wrap}code{font-family:Consolas,"SFMono-Regular",monospace;background:#f4f4f1;padding:.12em .3em;border-radius:3px}pre code{padding:0}table{border-collapse:collapse;width:100%;margin:1.2em 0}th,td{border:1px solid #d9d9d5;padding:8px 11px;text-align:left}blockquote{border-left:3px solid #c9c9c4;margin:1.2em 0;padding:.2em 0 .2em 18px;color:#666}hr{border:0;border-top:1px solid #ddd;margin:2em 0}.document-toc{padding:16px 20px;background:#f7f7f4;border-radius:6px}.document-toc a{display:block}@page{size:A4;margin:18mm 17mm}@media print{body{max-width:none;margin:0;padding:0;font-size:11pt}a{color:inherit;text-decoration:none}pre,blockquote,table,img{break-inside:avoid}}
  </style></head><body>${bodyHtml}</body></html>`;
}

function stripMarkdown(markdown) {
  const html = marked.parse(String(markdown || ''));
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function inlineRuns(tokens = [], fallback = '') {
  const runs = [];
  const visit = (items, style = {}) => {
    for (const token of items || []) {
      if (token.type === 'text' || token.type === 'escape') {
        if (token.tokens?.length) visit(token.tokens, style); else runs.push(new TextRun({ text: token.text || token.raw || '', ...style }));
      } else if (token.type === 'strong') visit(token.tokens, { ...style, bold: true });
      else if (token.type === 'em') visit(token.tokens, { ...style, italics: true });
      else if (token.type === 'del') visit(token.tokens, { ...style, strike: true });
      else if (token.type === 'codespan') runs.push(new TextRun({ text: token.text || '', font: 'Consolas', shading: { fill: 'EEEEEC' }, ...style }));
      else if (token.type === 'br') runs.push(new TextRun({ break: 1 }));
      else if (token.type === 'link') visit(token.tokens, { ...style, color: '2766C2', underline: {} });
      else if (token.type === 'image') runs.push(new TextRun({ text: `[图片：${token.text || token.href || ''}]`, italics: true, ...style }));
      else if (token.tokens) visit(token.tokens, style);
      else if (token.text) runs.push(new TextRun({ text: token.text, ...style }));
    }
  };
  visit(tokens);
  if (!runs.length && fallback) runs.push(new TextRun(fallback));
  return runs;
}

function tokensToDocx(tokens, children, depth = 0) {
  const headingMap = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];
  for (const token of tokens || []) {
    if (token.type === 'space') continue;
    if (token.type === 'heading') children.push(new Paragraph({ heading: headingMap[Math.min(5, token.depth - 1)], children: inlineRuns(token.tokens, token.text) }));
    else if (token.type === 'paragraph' || token.type === 'text') children.push(new Paragraph({ children: inlineRuns(token.tokens, token.text), spacing: { after: 140 } }));
    else if (token.type === 'code') children.push(new Paragraph({ children: [new TextRun({ text: token.text || '', font: 'Consolas' })], shading: { fill: 'F2F2EF' }, spacing: { before: 100, after: 140 } }));
    else if (token.type === 'blockquote') {
      const quoteChildren = []; tokensToDocx(token.tokens, quoteChildren, depth + 1);
      quoteChildren.forEach(paragraph => { paragraph.options = paragraph.options || {}; children.push(paragraph); });
    } else if (token.type === 'list') {
      token.items.forEach((item, index) => children.push(new Paragraph({
        children: [...(token.ordered ? [new TextRun(`${Number(token.start || 1) + index}. `)] : []), ...inlineRuns(item.tokens?.[0]?.tokens, item.text)],
        ...(token.ordered ? { indent: { left: 360 * (depth + 1), hanging: 220 } } : { bullet: { level: Math.min(8, depth) } }),
        spacing: { after: 70 }
      })));
    } else if (token.type === 'table') {
      const rows = [token.header, ...token.rows].map(row => new TableRow({ children: row.map(cell => new TableCell({ children: [new Paragraph({ children: inlineRuns(cell.tokens, cell.text) })] })) }));
      children.push(new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE }, borders: { top: { style: BorderStyle.SINGLE, size: 1 }, bottom: { style: BorderStyle.SINGLE, size: 1 }, left: { style: BorderStyle.SINGLE, size: 1 }, right: { style: BorderStyle.SINGLE, size: 1 }, insideHorizontal: { style: BorderStyle.SINGLE, size: 1 }, insideVertical: { style: BorderStyle.SINGLE, size: 1 } } }));
    } else if (token.type === 'hr') children.push(new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CCCCCC' } }, spacing: { before: 120, after: 120 } }));
    else if (token.tokens) tokensToDocx(token.tokens, children, depth);
  }
}

async function markdownToDocx(markdown, title = 'Inkdown 文档') {
  const children = [];
  tokensToDocx(marked.lexer(String(markdown || '')), children);
  if (!children.length) children.push(new Paragraph(''));
  const document = new Document({ creator: 'Inkdown', title, sections: [{ properties: {}, children }] });
  return Packer.toBuffer(document);
}

module.exports = {
  IMPORT_EXTENSIONS, MARKDOWN_EXTENSIONS, importDocument, htmlToMarkdown,
  buildStandaloneHtml, stripMarkdown, markdownToDocx
};
