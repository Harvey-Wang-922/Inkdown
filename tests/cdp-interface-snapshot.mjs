import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const endpoint = process.argv[2], mode = process.argv[3];
const page = (await (await fetch(`${endpoint}/json`)).json()).find(item => item.type === 'page');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const command = (method, params) => new Promise((resolve, reject) => {
  const requestId = ++id;
  const listener = event => {
    const message = JSON.parse(event.data); if (message.id !== requestId) return;
    socket.removeEventListener('message', listener);
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
  };
  socket.addEventListener('message', listener);
  socket.send(JSON.stringify({ id: requestId, method, params }));
});
try {
  await command('Emulation.setDeviceMetricsOverride', { width: 1360, height: 880, deviceScaleFactor: 1, mobile: false });
  await command('Runtime.evaluate', { expression: 'new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))', awaitPromise: true });
  const screenshot = await command('Page.captureScreenshot', { format: 'png' });
  const folder = fileURLToPath(new URL('../.test-artifacts/', import.meta.url));
  await mkdir(folder, { recursive: true });
  const target = path.join(folder, `interface-${mode}.png`);
  await writeFile(target, Buffer.from(screenshot.data, 'base64'));
  console.log(target);
} finally { socket.close(); }
