// Test-only native clipboard writer; no production renderer capability is added.
const { app, clipboard, ClipboardItem } = require('electron');
app.whenReady().then(async () => {
  await clipboard.write([new ClipboardItem({
    'text/plain': 'Native GPT heading\n1. item\nformatted',
    'text/html': '<div class="prose"><h2>Native GPT heading</h2><ol><li>item</li></ol><p><strong>formatted</strong></p></div>'
  })]);
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
