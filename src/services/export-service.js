const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { pathToFileURL } = require('node:url');
const sanitizeHtml = require('sanitize-html');
const { localImageData, safeDataImage, MAX_EXPORT_IMAGE_BYTES } = require('./local-image-policy');
const { buildStandaloneHtml, stripMarkdown, markdownToDocx } = require('../file-formats');

const EXPORT_FORMATS = Object.freeze({
  markdown: { extension: 'md', label: 'Markdown' },
  text: { extension: 'txt', label: '纯文本' },
  html: { extension: 'html', label: 'HTML 网页' },
  pdf: { extension: 'pdf', label: 'PDF 文档' },
  docx: { extension: 'docx', label: 'Word 文档' }
});

class ExportService {
  constructor({ BrowserWindow, getTempDirectory, renderMarkdown }) {
    this.BrowserWindow = BrowserWindow;
    this.getTempDirectory = getTempDirectory;
    this.renderMarkdown = renderMarkdown;
  }

  format(format) {
    const selected = EXPORT_FORMATS[format];
    if (!selected) throw new Error(`不支持的导出格式：${format}`);
    return selected;
  }

  suggestedPath(format, suggestedName) {
    const selected = this.format(format);
    const baseName = (suggestedName || 'document.md').replace(/\.(md|markdown|mdown|mkd|mkdn|txt|html?|docx|pdf)$/i, '');
    return { ...selected, baseName, defaultPath: `${baseName}.${selected.extension}` };
  }

  async embedLocalImages(html, documentPath) {
    const sources = new Set();
    const options = {
      allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'input', 'u', 'mark', 'nav', 'sup', 'sub', 'section']),
      allowedAttributes: { '*': ['class', 'id', 'title', 'data-label'], a: ['href', 'name', 'class'], img: ['src', 'alt', 'title'], input: ['type', 'checked', 'disabled'], th: ['align'], td: ['align'] },
      allowedSchemes: ['https', 'http', 'mailto', 'data', 'file'], allowProtocolRelative: false
    };
    const clean = sanitizeHtml(html, { ...options, transformTags: { img: (tagName, attribs) => { if (attribs.src) sources.add(attribs.src); return { tagName, attribs }; } } });
    const replacements = new Map();
    let remaining = MAX_EXPORT_IMAGE_BYTES;
    for (const source of sources) {
      if (/^https:\/\//i.test(source)) { replacements.set(source, { url: source, bytes: 0 }); continue; }
      const image = /^data:/i.test(source) ? safeDataImage(source, remaining) : await localImageData(source, documentPath, remaining);
      if (image) { remaining -= image.bytes; replacements.set(source, image); }
    }
    remaining = MAX_EXPORT_IMAGE_BYTES;
    return sanitizeHtml(clean, { ...options, transformTags: { img: (tagName, attribs) => {
      const replacement = replacements.get(attribs.src);
      if (replacement && replacement.bytes <= remaining) { attribs.src = replacement.url; remaining -= replacement.bytes; }
      else { delete attribs.src; attribs.alt = `${attribs.alt || '图片'}（未嵌入：不安全、不支持或超出大小限制）`; }
      return { tagName, attribs };
    } } });
  }

  async html(suggestedName, markdown, documentPath) {
    const title = path.basename(suggestedName || 'document.md', path.extname(suggestedName || 'document.md'));
    const body = await this.embedLocalImages(this.renderMarkdown(markdown), documentPath);
    return buildStandaloneHtml(title, body);
  }

  async printPdf(html, targetPath) {
    const temporaryPath = path.join(this.getTempDirectory(), `inkdown-export-${crypto.randomUUID()}.html`);
    const printWindow = new this.BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, partition: `inkdown-export-${crypto.randomUUID()}` } });
    const contents = printWindow.webContents;
    const expectedUrl = pathToFileURL(temporaryPath).href;
    contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    contents.session.setPermissionCheckHandler(() => false);
    contents.session.webRequest.onBeforeRequest((details, callback) => callback({ cancel: details.url !== expectedUrl && !details.url.startsWith('data:') }));
    contents.setWindowOpenHandler(() => ({ action: 'deny' }));
    contents.on('will-navigate', (event, url) => { if (url !== expectedUrl) event.preventDefault(); });
    try {
      await fs.writeFile(temporaryPath, html, 'utf8');
      await printWindow.loadFile(temporaryPath);
      const pdf = await printWindow.webContents.printToPDF({ printBackground: true, pageSize: 'A4', margins: { top: 0.5, bottom: 0.5, left: 0.5, right: 0.5 } });
      await fs.writeFile(targetPath, pdf);
    } finally {
      if (!printWindow.isDestroyed()) printWindow.destroy();
      await fs.unlink(temporaryPath).catch(() => {});
    }
  }

  async write({ format, targetPath, suggestedName, markdown, documentPath }) {
    const selected = this.suggestedPath(format, suggestedName);
    if (format === 'markdown') await fs.writeFile(targetPath, String(markdown || ''), 'utf8');
    else if (format === 'text') await fs.writeFile(targetPath, stripMarkdown(markdown), 'utf8');
    else if (format === 'docx') await fs.writeFile(targetPath, await markdownToDocx(markdown, selected.baseName));
    else {
      const html = await this.html(suggestedName, markdown, documentPath);
      if (format === 'html') await fs.writeFile(targetPath, html, 'utf8');
      else await this.printPdf(html, targetPath);
    }
    return targetPath;
  }
}

module.exports = { ExportService, EXPORT_FORMATS };
