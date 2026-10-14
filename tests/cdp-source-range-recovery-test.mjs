import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const [endpoint, mode, profile] = process.argv.slice(2);
const root = fileURLToPath(new URL('../', import.meta.url));
let socket, requestId = 0, restarted;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function connect() {
  const deadline = Date.now() + 10000;
  for (;;) {
    try {
      const page = (await (await fetch(endpoint + '/json')).json()).find(page => page.type === 'page');
      if (page) {
        socket = new WebSocket(page.webSocketDebuggerUrl);
        await new Promise((resolve,reject) => { socket.addEventListener('open',resolve,{once:true}); socket.addEventListener('error',reject,{once:true}); });
        if (await evaluate("Boolean(document.querySelector('#newBtn')?.onclick&&document.querySelector('#versionLabel')?.textContent)")) return;
        socket.close();
      }
    } catch {}
    if (Date.now() > deadline) throw new Error('Recovery restart did not bind');
    await delay(50);
  }
}
function command(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const listener = event => {
      const message = JSON.parse(event.data);
      if (message.id !== id) return;
      socket.removeEventListener('message', listener);
      if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
      else resolve(message.result);
    };
    socket.addEventListener('message',listener); socket.send(JSON.stringify({id,method,params}));
  });
}
const evaluate = async expression => (await command('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true})).result.value;
try {
  await connect();
  const result = await evaluate(String.raw`(async()=>{
    const assert=(value,message)=>{if(!value)throw new Error(message)};
    const {VisualSourceTransactions}=await import('./core/visual-source-transactions.mjs');
    const {MarkdownCodec}=await import('./core/markdown-codec.js');
    const {SessionRecoveryStorage}=await import('./core/session-recovery-storage.mjs');
    const codec=new MarkdownCodec(),source='__old__\r\n\r\nchange here\r\n\r\n* untouched\r\n';
    const projection=await window.inkdown.renderProjection(source),detached=document.createElement('div');detached.innerHTML=projection.html;
    let calls=0,bytes=0;const model=new VisualSourceTransactions(html=>{calls++;bytes+=html.length;return codec.toMarkdown(html)}),doc={id:100,content:source};
    model.capture(doc,detached,projection.spans);assert(model.baseline,'Source spans not established');
    detached.children[1].textContent+='!';doc.content=model.source(doc,detached);
    assert(doc.content===source.replace('change here','change here!'),'Untouched source bytes changed');
    assert(calls===1&&bytes<100,'Full document codec used for a single-block edit');
    detached.children[1].textContent+='?';doc.content=model.source(doc,detached);
    assert(doc.content===source.replace('change here','change here!?'),'Second edit lost the rebased range');
    detached.children[1].insertAdjacentHTML('afterend','<p>inserted</p>');doc.content=model.source(doc,detached);
    assert(doc.content.includes('__old__\r\n')&&doc.content.endsWith('* untouched\r\n'),'Structural insertion normalized other blocks');
    detached.children[2].remove();doc.content=model.source(doc,detached);
    assert(!doc.content.includes('inserted')&&doc.content.endsWith('* untouched\r\n'),'Structural deletion changed source order');
    const custom=await window.inkdown.renderProjection('---\nkey: value\n---\n\ntext');detached.innerHTML=custom.html;model.capture({id:200,content:'---\nkey: value\n---\n\ntext'},detached,custom.spans);
    assert(!model.baseline,'Unreliable custom projection was mapped');
    const legacy=new Map([['inkdown.session',JSON.stringify({drafts:[{content:'legacy source'}]})]]);
    const legacyAdapter={getItem:key=>legacy.get(key),removeItem:key=>legacy.delete(key)};
    const storage=new SessionRecoveryStorage({name:'migration-probe',legacy:legacyAdapter});
    assert((await storage.load()).drafts[0].content==='legacy source'&&!legacy.has('inkdown.session'),'Atomic legacy migration failed');
    await storage.write({drafts:[{content:'newer source'}]});legacy.set('inkdown.session',JSON.stringify({drafts:[{content:'stale legacy'}]}));
    assert((await storage.load()).drafts[0].content==='newer source','Legacy data overwrote new recovery');
    const failed=new SessionRecoveryStorage({name:'failure-probe',legacy:legacyAdapter}),transaction=failed.transaction.bind(failed);
    failed.transaction=(mode,operation)=>mode==='readwrite'?Promise.reject(new Error('quota')):transaction(mode,operation);
    try{await failed.load();throw new Error('Expected write failure')}catch(error){assert(error.message==='quota','Wrong migration failure')}
    assert(legacy.has('inkdown.session'),'Failed migration deleted legacy data');
    return {changedBlockOnly:true,untouchedCrlfSource:true,repeatedEdit:true,structuralRange:true,conservativeFallback:true,atomicMigration:true,migrationFailureRetainsLegacy:true};
  })()`);
  console.log(JSON.stringify(result));
  await evaluate(String.raw`(async()=>{
    document.querySelector('#newBtn').click();document.querySelector('#sourceModeBtn').click();
    const source=document.querySelector('#sourceEditor');source.value='__old__\n\nchange here\n\n* untouched\n';source.dispatchEvent(new Event('input',{bubbles:true}));
    document.querySelector('#sourceModeBtn').click();
    for(let i=0;i<100&&!document.querySelector('#wysiwyg p:nth-child(2)');i++)await new Promise(r=>setTimeout(r,20));
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    const target=document.querySelector('#wysiwyg').children[1],range=document.createRange();range.selectNodeContents(target);range.collapse(false);document.querySelector('#wysiwyg').focus();getSelection().removeAllRanges();getSelection().addRange(range);
  })()`);
  await command('Input.insertText',{text:'!'});
  const live=await evaluate(`(()=>{document.querySelector('#sourceModeBtn').click();return document.querySelector('#sourceEditor').value})()`);
  assert.equal(live,'__old__\n\nchange here!\n\n* untouched\n');
  await evaluate(`(async()=>{
    const {SessionRecoveryStorage}=await import('./core/session-recovery-storage.mjs');
    const write=SessionRecoveryStorage.prototype.write;
    SessionRecoveryStorage.prototype.write=async function(snapshot){await new Promise(r=>setTimeout(r,300));return write.call(this,snapshot)};
  })()`);
  // Quit before the debounce deadline: the native close handshake must flush it.
  const closing = new Promise(resolve=>socket.addEventListener('close',resolve,{once:true}));
  await evaluate(`window.inkdown.quit()`);
  assert.equal(await evaluate(`document.body.inert`),true,'Closing must freeze source input');
  await evaluate(`window.inkdown.completeRecoveryClose(true,-1)`);
  assert.equal(await evaluate(`document.body.inert`),true,'A stale close acknowledgement must not close the window');
  await command('Input.insertText',{text:'SHOULD_NOT_ENTER'});
  await closing;
  await delay(500);
  const executable=path.join(root,mode==='source'?'node_modules/electron/dist/electron.exe':'release/win-unpacked/Inkdown.exe');
  restarted=spawn(executable,[...(mode==='source'?[root]:[]),'--user-data-dir='+profile,'--remote-debugging-port='+new URL(endpoint).port],{cwd:root,windowsHide:true,stdio:'ignore'});
  await connect();
  let recovered;
  for(let i=0;i<100;i++) {
    recovered=await evaluate(`(async()=>{const storage=new (await import('./core/session-recovery-storage.mjs')).SessionRecoveryStorage();return (await storage.load())?.drafts?.find(draft=>draft.content.includes('change here'))?.content})()`);
    if(recovered)break;await delay(20);
  }
  assert.equal(recovered,live,'Native close lost the final unsaved snapshot');
  console.log(JSON.stringify({nativeInputSourcePreserved:true,nativeCloseFlush:true,restartRecovery:true,closeInputIsolation:true,staleCloseAckIgnored:true}));
} finally {
  socket?.close();
  if(restarted?.pid&&restarted.exitCode===null)execFileSync('taskkill.exe',['/PID',String(restarted.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
}
