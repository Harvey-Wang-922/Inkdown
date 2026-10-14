import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const endpoint = process.argv[2];
const pages = await (await fetch(`${endpoint}/json`)).json();
const socket = new WebSocket(pages.find(page => page.type === 'page').webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let id = 0;
const command = (method, params = {}) => new Promise((resolve, reject) => {
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
const waitFor = async expression => {
  const deadline = Date.now() + 6000;
  while (!await evaluate(expression)) {
    if (Date.now() > deadline) throw new Error(`Timed out: ${expression}; ${JSON.stringify(await evaluate(`({focus:document.activeElement?.id,count:document.querySelector('#findCount')?.textContent,query:document.querySelector('#findInput')?.value,toast:document.querySelector('#toast')?.textContent,activeTab:document.querySelector('.tab.active .tab-name')?.textContent})`))}`);
    await new Promise(resolve => setTimeout(resolve, 30));
  }
};
const click = async selector => {
  const rect = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest',behavior:'instant'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', ...rect, button: 'left', clickCount: 1 });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', ...rect, button: 'left', clickCount: 1 });
};
const key = async (key, code, modifiers = 0) => {
  const virtual = { Enter: 13, Escape: 27, ArrowDown: 40, ArrowUp: 38, Home: 36, End: 35 }[key];
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, ...(virtual ? { windowsVirtualKeyCode: virtual } : {}) });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, ...(virtual ? { windowsVirtualKeyCode: virtual } : {}) });
};
const root = fileURLToPath(new URL('../.test-profiles/', import.meta.url));
await mkdir(root, { recursive: true });
const folder = await mkdtemp(path.join(root, 'search-fixtures-'));
try {
  await click('#newBtn');
  await click('#sourceModeBtn');
  const longText = 'needle ' + '长段落用于验证搜索滚动位置。'.repeat(500) + ' needle ' + '后半段用于验证连续跳转。'.repeat(500) + ' needle';
  await evaluate(`(()=>{const s=document.querySelector('#sourceEditor');s.value=${JSON.stringify(longText)};s.dispatchEvent(new Event('input',{bubbles:true}))})()`);
  await click('#sourceModeBtn');
  await waitFor(`document.querySelector('#wysiwyg').textContent.includes('needle') && document.activeElement.id==='wysiwyg'`);
  await key('f', 'KeyF', 2);
  await command('Input.insertText', { text: 'needle' });
  await waitFor(`document.querySelector('#findCount').textContent==='0/3'`);
  for (let current = 1; current <= 3; current++) {
    await key('Enter', 'Enter');
    await waitFor(`document.querySelector('#findCount').textContent===${JSON.stringify(`${current}/3`)}`);
    await waitFor(`(()=>{const range=[...(CSS.highlights.get('inkdown-find-current')||[])][0];if(!range)return false;const r=range.getClientRects()[0],p=document.querySelector('#editorPane').getBoundingClientRect();return r.top>p.top+40&&r.bottom<p.bottom-20})()`);
  }
  assert.equal(await evaluate(`document.activeElement.id`), 'findInput', 'Enter navigation should retain find input focus');
  // Rapid native clicks must end at the requested last occurrence.
  await click('#findNext'); await click('#findNext'); await click('#findPrev');
  await waitFor(`document.querySelector('#findCount').textContent==='1/3'`);
  await click('#sourceModeBtn');
  assert.equal(await evaluate(`document.querySelector('#sourceEditor').value`), longText, 'Search must preserve source');
  assert.equal(await evaluate(`CSS.highlights.has('inkdown-find-match')`), false, 'Mode changes clear old visual highlights');
  await click('#findPrev');
  await waitFor(`document.querySelector('#sourceEditor').selectionStart===${longText.lastIndexOf('needle')}`);
  await waitFor(`(()=>{const s=document.querySelector('#sourceEditor');return s.scrollTop>s.scrollHeight-s.clientHeight-250})()`);
  await click('#newBtn');
  assert.equal(await evaluate(`document.querySelector('#findCount').textContent`), '0/0', 'New document must refresh find count');

  const first = '[label](https://example.test/needle)\r\n\r\nvisible needle\r\n\r\nlast needle';
  const firstTextarea = first.replace(/\r\n/g, '\n');
  const second = 'second needle';
  await writeFile(path.join(folder, 'a.md'), first);
  await writeFile(path.join(folder, 'b.md'), second);
  await evaluate(`(async()=>{await new (await import('./core/session-recovery-storage.mjs')).SessionRecoveryStorage().write({paths:[],drafts:[],dirtyFiles:[],folderPath:${JSON.stringify(folder)}});localStorage.setItem('inkdown.settings',JSON.stringify({restoreSession:true}));})()`);
  await command('Page.reload');
  await waitFor(`document.querySelector('#folderName')?.textContent===${JSON.stringify(path.basename(folder))}`);
  await click('[data-sidebar-mode="search"]');
  await click('#globalSearchInput');
  await command('Input.insertText', { text: 'needle' });
  await waitFor(`document.querySelectorAll('.search-result').length===4`);
  assert.equal(await evaluate(`document.querySelectorAll('.search-group').length`), 2);
  assert.equal(await evaluate(`document.querySelector('#globalSearchSummary').textContent`), '4 处匹配 · 2 个文件');
  await key('ArrowDown', 'ArrowDown');
  await key('ArrowDown', 'ArrowDown');
  assert.equal(await evaluate(`document.activeElement.dataset.resultIndex`), '1');
  await key('Enter', 'Enter');
  await waitFor(`document.querySelector('#sourceEditor').selectionStart===${firstTextarea.indexOf('needle', firstTextarea.indexOf('needle') + 1)}`);
  assert.equal(await evaluate(`document.querySelector('#sourceEditor').value`), firstTextarea);
  assert.equal(await evaluate(`document.querySelector('#sourceEditor').classList.contains('hidden')`), false);
  await click('.search-result[data-result-index="0"]');
  await waitFor(`document.querySelector('#sourceEditor').selectionStart===${first.indexOf('needle')}`);
  await click('.search-result[data-result-index="1"]'); await click('.search-result[data-result-index="3"]');
  await waitFor(`document.querySelector('.tab.active .tab-name')?.textContent==='b.md'`);
  await waitFor(`document.querySelector('#sourceEditor').selectionStart===7`);
  await writeFile(path.join(folder, 'c.md'), 'changed needle');
  // A result from a file changed after searching must not open an incorrect target.
  await writeFile(path.join(folder, 'a.md'), first + ' changed');
  // For an open document its in-memory content is authoritative, even if disk changed.
  await click('.search-result[data-result-index="1"]');
  await waitFor(`document.querySelector('.tab.active .tab-name')?.textContent==='a.md'`);
  assert.equal(await evaluate(`document.querySelector('#sourceEditor').value`), firstTextarea);
  await command('Input.insertText', { text: 'edited' });
  await click('.search-result[data-result-index="2"]');
  await waitFor(`document.querySelector('#toast').textContent.includes('内容已变化')`);
  assert.equal(await evaluate(`document.querySelector('#sourceEditor').value.includes('edited')`), true);
  await click('#globalSearchInput');
  await key('ArrowUp', 'ArrowUp');
  assert.equal(await evaluate(`document.activeElement.dataset.resultIndex`), '3');
  await key('Home', 'Home');
  assert.equal(await evaluate(`document.activeElement.dataset.resultIndex`), '0');
  await key('Escape', 'Escape');
  assert.equal(await evaluate(`document.activeElement.id`), 'globalSearchInput');
  await click('#globalSearchClear');
  assert.equal(await evaluate(`document.querySelectorAll('.search-result').length`), 0);
  assert.equal(await evaluate(`document.querySelector('#globalSearchInput').value`), '');
  await command('Input.insertText', { text: 'second' });
  await key('Enter', 'Enter');
  await waitFor(`document.querySelector('.tab.active .tab-name')?.textContent==='b.md' && document.querySelector('#sourceEditor').selectionStart===0`);
  await click('[data-sidebar-mode="files"]');
  await click('#fileTree .tree-item:first-child');
  await waitFor(`document.querySelector('.tab.active .tab-name')?.textContent==='a.md'`);
  assert.equal(await evaluate(`document.querySelector('#sourceEditor').value.includes('edited')`), true, 'Opening an existing file from the tree must preserve unsaved edits');
  assert.equal(await evaluate(`document.querySelectorAll('.tab').length`), 2, 'Opening an existing file must reuse its tab');
  console.log(JSON.stringify({ longParagraphReveal: true, rapidNavigation: true, sourceWrapReveal: true, sourcePreserved: true, documentRefresh: true, hiddenMarkdownTarget: true, exactWorkspaceOffset: true, changedResultRejected: true, groupedSummary: true, keyboardResults: true, clearAndImmediateEnter: true, dirtyTreeOpenPreserved: true }));
} finally {
  socket.close();
  const resolved = path.resolve(folder);
  if (!resolved.startsWith(path.resolve(root) + path.sep)) throw new Error('Unsafe fixture path');
  await rm(resolved, { recursive: true, force: true });
}
