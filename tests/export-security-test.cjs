const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { ExportService } = require('../src/services/export-service');
const { localImageData, MAX_IMAGE_BYTES } = require('../src/services/local-image-policy');
const { markdownToDocx, importDocument, buildStandaloneHtml } = require('../src/file-formats');

(async () => {
  const profiles = path.resolve(__dirname, '../.test-profiles'); await fs.mkdir(profiles, { recursive: true });
  const root = await fs.mkdtemp(path.join(profiles, 'export-security-'));
  try {
    const docDir = path.join(root, 'document'); await fs.mkdir(docDir);
    const doc = path.join(docDir, 'document.md'); await fs.writeFile(doc, '# Test');
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jD1sAAAAASUVORK5CYII=', 'base64');
    await fs.writeFile(path.join(docDir, 'safe.png'), png);
    await fs.writeFile(path.join(root, 'outside.png'), png);
    await fs.writeFile(path.join(docDir, 'secret.txt'), 'NOT_AN_IMAGE_SECRET');
    await fs.writeFile(path.join(docDir, 'fake.png'), 'NOT_AN_IMAGE_SECRET');
    const large = await fs.open(path.join(docDir, 'large.png'), 'w'); await large.write(png); await large.truncate(MAX_IMAGE_BYTES + 1); await large.close();
    assert.ok(await localImageData('safe.png', doc));
    assert.ok(await localImageData(pathToFileURL(path.join(docDir, 'safe.png')).href, doc));
    for (const source of ['../outside.png', '%2e%2e/outside.png', 'secret.txt', 'fake.png', 'large.png', '%broken', 'missing.png', 'file:///not-present.png']) assert.equal(await localImageData(source, doc), null, source);
    assert.equal(await localImageData('safe.png', doc, 1), null);
    // A symlink/junction must not make an external image part of the document scope.
    await fs.symlink(root, path.join(docDir, 'escape'), 'junction');
    assert.equal(await localImageData('escape/outside.png', doc), null);
    const service = new ExportService({ renderMarkdown: () => '' });
    const html = await service.embedLocalImages('<img src="safe.png"><img src="secret.txt"><img src="../outside.png"><img src="fake.png"><img src="data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="><script>alert(1)</script>', doc);
    assert.ok(html.includes('data:image/png;base64,'));
    assert.ok(!html.includes('NOT_AN_IMAGE_SECRET') && !html.includes('secret.txt') && !html.includes('outside.png') && !html.includes('fake.png') && !html.includes('svg+xml') && !html.includes('<script'));
    assert.ok(!(await service.embedLocalImages('<img src="safe.png">', null)).includes('src='));
    const exported = buildStandaloneHtml('Title', html);
    assert.ok(exported.includes("script-src 'none'") && !exported.includes("img-src file:"));
    const wordPath = path.join(docDir, 'roundtrip.docx'); await fs.writeFile(wordPath, await markdownToDocx('# Word roundtrip\n\nSafe **content**'));
    const imported = await importDocument(wordPath);
    assert.ok(imported.content.includes('Word roundtrip') && imported.content.includes('content'));
    console.log(JSON.stringify({ directoryBoundary: true, symlinkBoundary: true, nonImageRejected: true, sizeBounded: true, exportCsp: true, wordRoundtrip: true }));
  } finally {
    const resolved = path.resolve(root);
    if (!resolved.startsWith(profiles + path.sep)) throw new Error('Unsafe profile cleanup');
    await fs.rm(resolved, { recursive: true, force: true });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
