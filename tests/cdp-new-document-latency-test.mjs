import { fileURLToPath } from 'node:url';

const startupFixture = fileURLToPath(new URL('./fixtures/startup-session.md', import.meta.url));
const preservationFixture = fileURLToPath(new URL('./fixtures/source-preservation.md', import.meta.url));
const endpoint = process.argv[2] || 'http://127.0.0.1:9378';
const pages = await (await fetch(`${endpoint}/json`)).json();
const page = pages.find(item => item.type === 'page');
if (!page) throw new Error('找不到 Inkdown 页面');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

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

const rendererDeadline = Date.now() + 5000;
while (!await evaluate(`Boolean(
  document.readyState === 'complete' &&
  document.querySelector('#newBtn')?.onclick &&
  document.querySelector('#versionLabel')?.textContent
)`)) {
  if (Date.now() >= rendererDeadline) throw new Error('Inkdown renderer did not finish binding the startup UI');
  await new Promise(resolve => setTimeout(resolve, 25));
}

const preservedRead = await evaluate(`window.inkdown.readFile(${JSON.stringify(preservationFixture)})`);
if(preservedRead.content!=='\\# literal\n#tag\n## valid heading\n')throw new Error(`Opening a file rewrote Markdown source: ${JSON.stringify(preservedRead.content)}`);

const rect = await evaluate(`(() => {
  const editor=document.querySelector('#wysiwyg'),welcome=document.querySelector('#welcomeNew'),button=welcome&&!welcome.closest('.hidden')?welcome:document.querySelector('#newBtn'),rect=button.getBoundingClientRect();
  window.__inkdownNewLatency={start:performance.now(),focused:null};
  editor.addEventListener('focus',()=>{window.__inkdownNewLatency.focused??=performance.now();},{once:true});
  return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};
})()`);
await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });

const firstReady = await evaluate(`(() => {
  const editor=document.querySelector('#wysiwyg'),latency=window.__inkdownNewLatency;
  const selection=getSelection();
  return {
    focusMs:latency.focused==null?null:latency.focused-latency.start,
    focused:document.activeElement===editor,
    emptyParagraph:Boolean(editor.querySelector(':scope > p'))&&!editor.textContent.trim(),
    stableCaret:Boolean(selection.rangeCount&&editor.contains(selection.anchorNode))
  };
})()`);
if (!firstReady.focused || !firstReady.emptyParagraph || !firstReady.stableCaret || firstReady.focusMs == null || firstReady.focusMs > 50) {
  throw new Error(`新建文档没有在当前帧进入可编辑状态：${JSON.stringify(firstReady)}`);
}

await command('Input.insertText', { text: '首' });
const firstInput = await evaluate(`(async()=>{
  const editor=document.querySelector('#wysiwyg'),button=document.querySelector('#sourceModeBtn');
  const visual=editor.textContent.trim();button.click();await new Promise(r=>setTimeout(r,60));const source=document.querySelector('#sourceEditor').value;button.click();await new Promise(r=>setTimeout(r,60));
  return {visual,source};
})()`);
if (firstInput.visual !== '首' || firstInput.source !== '首') throw new Error(`新建后的首字符未立即提交：${JSON.stringify(firstInput)}`);

const rapid = await evaluate(`(async()=>{
  const button=document.querySelector('#newBtn'),editor=document.querySelector('#wysiwyg'),sourceButton=document.querySelector('#sourceModeBtn');
  for(let i=0;i<12;i++)button.click();
  const immediate=document.activeElement===editor&&Boolean(editor.querySelector(':scope > p'))&&!editor.textContent.trim();
  document.execCommand('insertText',false,'末');await new Promise(r=>setTimeout(r,20));sourceButton.click();await new Promise(r=>setTimeout(r,60));const source=document.querySelector('#sourceEditor').value;sourceButton.click();await new Promise(r=>setTimeout(r,60));
  return {immediate,source,tabCount:document.querySelectorAll('.tab').length};
})()`);
if (!rapid.immediate || rapid.source !== '末' || rapid.tabCount < 13) throw new Error(`连续新建出现投影竞态：${JSON.stringify(rapid)}`);

const topProjection = await evaluate(`(() => {
  const editor=document.querySelector('#wysiwyg'),pane=document.querySelector('#editorPane');
  editor.innerHTML='<p>opened content</p>';pane.scrollTop=0;
  const editorTop=editor.getBoundingClientRect().top,contentTop=editor.firstElementChild.getBoundingClientRect().top;
  return {offset:contentTop-editorTop};
})()`);
if(topProjection.offset>120)throw new Error(`Editor created a large blank area: ${JSON.stringify(topProjection)}`);

await command('Page.enable');
const loaded = new Promise(resolve => {
  const listener = event => {
    const message = JSON.parse(event.data);
    if(message.method!=='Page.loadEventFired')return;
    socket.removeEventListener('message',listener);resolve();
  };
  socket.addEventListener('message',listener);
});
await evaluate(`(async()=>{await new (await import('./core/session-recovery-storage.mjs')).SessionRecoveryStorage().write({paths:Array(80).fill(${JSON.stringify(startupFixture)}),activePath:${JSON.stringify(startupFixture)},drafts:[]});})()`);
await command('Page.reload'); await loaded;
const startupNew = await evaluate(`(() => { document.querySelector('#welcomeNew').click(); const editor=document.querySelector('#wysiwyg'),selection=getSelection(); return document.activeElement===editor&&selection.rangeCount&&editor.contains(selection.anchorNode); })()`);
if(!startupNew)throw new Error('Startup session restore owned the editor before the first user action');
await command('Input.insertText',{text:'启'});
await new Promise(resolve=>setTimeout(resolve,1000));
const startupInput = await evaluate(`(async()=>{const editor=document.querySelector('#wysiwyg'),button=document.querySelector('#sourceModeBtn'),visual=editor.textContent.trim(),tab=document.querySelector('.tab.active .tab-name')?.textContent;button.click();await new Promise(r=>setTimeout(r,80));return {visual,source:document.querySelector('#sourceEditor').value,tab};})()`);
if(startupInput.visual!=='启'||startupInput.source!=='启')throw new Error(`Background session restore replaced startup input: ${JSON.stringify(startupInput)}`);

const recoveryLoaded = new Promise(resolve => {
  const listener = event => { const message=JSON.parse(event.data);if(message.method!=='Page.loadEventFired')return;socket.removeEventListener('message',listener);resolve(); };
  socket.addEventListener('message',listener);
});
await evaluate(`(async()=>{await new (await import('./core/session-recovery-storage.mjs')).SessionRecoveryStorage().write({paths:[${JSON.stringify(startupFixture)}],activePath:${JSON.stringify(startupFixture)},drafts:[],dirtyFiles:[{path:${JSON.stringify(startupFixture)},name:'startup-session.md',content:'RECOVERED DIRTY SOURCE'}]});})()`);
await command('Page.reload');await recoveryLoaded;await new Promise(resolve=>setTimeout(resolve,300));
const dirtyRecovery=await evaluate(`(async()=>{document.querySelector('#sourceModeBtn').click();await new Promise(r=>setTimeout(r,80));return document.querySelector('#sourceEditor').value;})()`);
if(dirtyRecovery!=='RECOVERED DIRTY SOURCE')throw new Error(`Dirty file recovery snapshot was lost: ${JSON.stringify(dirtyRecovery)}`);

console.log(JSON.stringify({ sourceReadPreserved: true, welcomeNewImmediateFocus: true, focusMs: firstReady.focusMs, firstInput: true, rapidCreates: 12, topProjection: true, startupInputIsolation: true, dirtyFileRecovery: true }));
socket.close();
