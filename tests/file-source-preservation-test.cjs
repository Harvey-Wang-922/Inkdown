const path = require('node:path');
const { importDocument } = require('../src/file-formats');

(async () => {
  const document = await importDocument(path.join(__dirname, 'fixtures', 'source-preservation.md'));
  const expected = '\\# literal\n#tag\n## valid heading\n';
  if (document.content !== expected) throw new Error(`file import rewrote Markdown: ${JSON.stringify(document.content)}`);
  console.log(JSON.stringify({ escapedHeading: true, hashText: true, sourcePreserved: true }));
})().catch(error => { console.error(error); process.exitCode = 1; });
