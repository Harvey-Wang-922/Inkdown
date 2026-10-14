import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const endpoint = process.argv[2];
const page = (await (await fetch(`${endpoint}/json`)).json()).find(item => item.type === 'page');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
let id = 0;
const command = (method, params) => new Promise((resolve, reject) => {
  const requestId = ++id;
  const listener = event => {
    const message = JSON.parse(event.data);
    if (message.id !== requestId) return;
    socket.removeEventListener('message', listener);
    if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
    else resolve(message.result);
  };
  socket.addEventListener('message', listener);
  socket.send(JSON.stringify({ id: requestId, method, params }));
});
const evaluate = async expression => (await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const profiles = path.resolve(fileURLToPath(new URL('../.test-profiles/', import.meta.url)));
await mkdir(profiles, { recursive: true });
const folder = await mkdtemp(path.join(profiles, 'manual-save-'));
const file = path.join(folder, 'manual.md');
try {
  await writeFile(file, '# Original\n');
  await command('Page.enable', {});
  await evaluate(`(async()=>{
    localStorage.setItem('inkdown.settings',JSON.stringify({autoSave:true,autoSaveDelay:50,restoreSession:true}));
    await new (await import('./core/session-recovery-storage.mjs')).SessionRecoveryStorage().write({paths:[${JSON.stringify(file)}],activePath:${JSON.stringify(file)},drafts:[],dirtyFiles:[]});
  })()`);
  await command('Page.reload', {});
  const deadline = Date.now() + 10000;
  while (!await evaluate(`document.querySelector('.tab.active .tab-name')?.textContent==='manual.md' && Boolean(document.querySelector('#sourceModeBtn')?.onclick)`)) {
    if (Date.now() > deadline) throw new Error('Manual-save fixture did not open: '+JSON.stringify(await evaluate(`({tabs:[...document.querySelectorAll('.tab-name')].map(e=>e.textContent),session:localStorage.getItem('inkdown.session'),settings:localStorage.getItem('inkdown.settings'),toast:document.querySelector('#toast')?.textContent})`)));
    await wait(50);
  }
  assert.equal(await evaluate(`(async()=>{
    const {loadSettings}=await import('./core/document-store.js');
    return !document.querySelector('#settingAutoSave')&&!('autoSave' in loadSettings())&&!('autoSaveDelay' in loadSettings());
  })()`), true, 'Old preferences or autosave settings remain');
  await evaluate(`(async()=>{document.querySelector('#sourceModeBtn').click();await new Promise(r=>setTimeout(r,80));const s=document.querySelector('#sourceEditor');s.value='# Edited';s.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await wait(1800);
  assert.equal(await readFile(file, 'utf8'), '# Original\n', 'Editing automatically overwrote the file');
  assert.equal(await evaluate(`document.querySelector('#saveState').textContent`), '未保存');
  assert.equal(await evaluate(`(async()=> (await new (await import('./core/session-recovery-storage.mjs')).SessionRecoveryStorage().load()).dirtyFiles[0]?.content)()`), '# Edited', 'Recovery snapshot lost');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 's', code: 'KeyS', modifiers: 2, windowsVirtualKeyCode: 83 });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 's', code: 'KeyS', modifiers: 2, windowsVirtualKeyCode: 83 });
  await wait(250);
  assert.equal(await readFile(file, 'utf8'), '# Edited', 'Ctrl+S did not save');
  assert.equal(await evaluate(`document.querySelector('#saveState').textContent`), '已保存');
  await evaluate(`(async()=>{const s=document.querySelector('#sourceEditor');s.value='# Unsaved again';s.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#newBtn').click()})()`);
  await wait(1800);
  assert.equal(await readFile(file, 'utf8'), '# Edited', 'Background tab automatically saved');
  console.log(JSON.stringify({manualOnly:true,legacySettingsIgnored:true,ctrlSSaves:true,backgroundNotSaved:true,recoveryPreserved:true}));
} finally {
  socket.close();
  if (!path.resolve(folder).startsWith(profiles + path.sep)) throw new Error('Unsafe fixture cleanup');
  await rm(folder, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
}
