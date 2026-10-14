// Invoke with source Electron; optionally load the exact packaged service from ASAR.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const mode = process.argv.includes('--packaged') ? 'packaged' : 'source';
const servicePath = mode === 'packaged' ? '../release/win-unpacked/resources/app.asar/src/services/export-service.js' : '../src/services/export-service.js';
const { ExportService } = require(servicePath);
const profileArg = process.argv.find(arg => arg.startsWith('--user-data-dir='));
if (!profileArg) throw new Error('Fresh explicit profile required');
const root = path.resolve(profileArg.slice('--user-data-dir='.length));
if (!root.startsWith(path.resolve(__dirname, '../.test-profiles') + path.sep)) throw new Error('Invalid test profile');
app.setPath('userData', root);
app.on('window-all-closed', () => {});
const requests = [];
class TestWindow extends BrowserWindow {
  constructor(options) {
    assert.equal(options.webPreferences.nodeIntegration, false);
    assert.equal(options.webPreferences.sandbox, true);
    assert.ok(options.webPreferences.partition.startsWith('inkdown-export-'));
    super(options);
    const session = this.webContents.session;
    const original = session.webRequest.onBeforeRequest.bind(session.webRequest);
    session.webRequest.onBeforeRequest = listener => original((details, callback) => listener(details, result => { requests.push({ url: details.url, cancel: result.cancel }); callback(result); }));
  }
}
app.whenReady().then(async () => {
  const formats = require(mode === 'packaged' ? '../release/win-unpacked/resources/app.asar/src/file-formats.js' : '../src/file-formats.js');
  const wordPath = path.join(root, 'roundtrip.docx');
  await fs.writeFile(wordPath, await formats.markdownToDocx('# Resource test\n\n**Word export/import**\n\n- 保留中文'));
  const imported = await formats.importDocument(wordPath);
  assert.ok(imported.content.includes('Resource test') && imported.content.includes('Word export/import') && imported.content.includes('保留中文'), 'DOCX dependencies did not survive packaging');
  const service = new ExportService({ BrowserWindow: TestWindow, getTempDirectory: () => root });
  const target = path.join(root, 'test.pdf');
  const local = pathToFileURL(path.resolve(__dirname, '../package.json')).href;
  await service.printPdf(`<html><body>PDF regression<img src="${local}"><img src="https://example.com/blocked.png"></body></html>`, target);
  assert.equal((await fs.readFile(target)).subarray(0, 5).toString(), '%PDF-');
  assert.ok(requests.some(request => request.url === local && request.cancel), 'arbitrary local file request was not blocked');
  assert.ok(requests.some(request => request.url.startsWith('https:') && request.cancel), 'network request was not blocked');
  assert.ok(!(await fs.readdir(root)).some(name => name.startsWith('inkdown-export-') && name.endsWith('.html')), 'temporary HTML survived export');
  console.log(JSON.stringify({ mode, realPdf: true, docxRoundtrip: true, blockedLocalRead: true, blockedNetwork: true, temporaryCleanup: true }));
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
