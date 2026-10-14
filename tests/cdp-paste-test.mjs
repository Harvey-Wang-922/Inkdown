import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
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
const shortcut = async (key, code) => {
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers: 2, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers: 2, windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0) });
};
try {
  console.log(JSON.stringify(await evaluate(`(async()=>{
    const { MarkdownCodec } = await import('./core/markdown-codec.js');
    const codec = new MarkdownCodec();
    const fixtures = [
      '<h2>Title</h2><p><em>italic</em> <u>under</u> <mark>light</mark></p>',
      '<p>a<span data-md-tab="true">\\t</span>b</p>',
      '<nav class="document-toc">generated</nav>',
      '<pre class="frontmatter"><code>key: value</code></pre>',
      '<pre class="math-block"><code>x+y</code></pre>',
      '<p><img src="file:///generated" data-markdown-src="assets/a.png" alt="A"></p>',
      '<p>a<sup class="footnote-ref" data-label="one">1</sup></p><section class="footnotes"><ol><li data-label="one">note</li></ol></section>',
      '<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><br></td><td>v</td></tr></tbody></table>'
    ];
    for (const html of fixtures) {
      const local = codec.toMarkdown(html), remote = await window.inkdown.htmlToMarkdown(html);
      if (local !== remote) throw new Error('Codec process mismatch: '+JSON.stringify({html,local,remote}));
    }
    const source = document.querySelector('#sourceEditor');
    document.querySelector('#newBtn').click(); document.querySelector('#sourceModeBtn').click();
    source.value = 'word'; source.dispatchEvent(new Event('input',{bubbles:true})); source.setSelectionRange(0,4);
    document.querySelector('[data-action="bold"]').click();
    if (source.value !== '**word**' || source.selectionStart !== 2 || source.selectionEnd !== 6) throw new Error('Source format selection changed');
    source.value = '\\nsecond'; source.dispatchEvent(new Event('input',{bubbles:true})); source.setSelectionRange(0,0);
    document.querySelector('[data-action="heading-1"]').click();
    if (source.value !== '# \\nsecond') throw new Error('Empty first source line prefix crossed a boundary');
    source.value = 'first\\nsecond\\nlast'; source.dispatchEvent(new Event('input',{bubbles:true})); source.setSelectionRange(0,6);
    source.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',code:'Tab',bubbles:true,cancelable:true}));
    if (source.value !== '\\tfirst\\nsecond\\nlast') throw new Error('Trailing selection newline indented the next line');
    source.setSelectionRange(0,7);
    source.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',code:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
    if (source.value !== 'first\\nsecond\\nlast') throw new Error('Source outdent changed another line');
    return {crossProcessCodecParity:true,sourceFormatting:true,firstLineBoundary:true,selectedNewlineBoundary:true};
  })()`)));
  console.log(JSON.stringify(await evaluate(`(async()=>{
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const assert=(v,m)=>{if(!v)throw new Error(m)};
    const editor=document.querySelector('#wysiwyg'),source=document.querySelector('#sourceEditor'),mode=document.querySelector('#sourceModeBtn');
    const fresh=async()=>{document.querySelector('#newBtn').click();await wait(40);if(!source.classList.contains('hidden')){mode.click();await wait(40)}};
    const place=(node,start,end=start)=>{editor.focus();const r=document.createRange();r.setStart(node,start);r.setEnd(node,end);const s=getSelection();s.removeAllRanges();s.addRange(r)};
    const paste=(text,html='')=>{const data=new DataTransfer();data.setData('text/plain',text);if(html)data.setData('text/html',html);editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}))};
    const read=async()=>{mode.click();await wait(40);const text=source.value;mode.click();await wait(80);return text};
    await fresh();
    const markdown='# 粘贴标题\\n\\n**粗体**与[链接](https://example.com)\\n\\n- 子项\\n  - 嵌套\\n\\n\\x60\\x60\\x60js\\nconst x = 1;\\n\\x60\\x60\\x60\\n';
    paste(markdown,'<pre>'+markdown+'</pre>');await wait(250);
    assert(editor.querySelector('h1')?.textContent==='粘贴标题','Markdown没有按语义渲染');
    assert(await read()===markdown,'Markdown粘贴新增转义或改写了源码');
    const richText='GPT标题\\n1. 第一项\\n粗体与链接\\n名称 值\\nconst x = 1;';
    const richHtml='<div class="markdown prose" style="color:red"><h2>GPT标题</h2><ol><li>第一项</li></ol><p><strong>粗体</strong>与<a href="https://example.com">链接</a></p><table><tbody><tr><td>名称</td><td>值</td></tr><tr><td>A</td><td>B</td></tr></tbody></table><pre><button>复制代码</button><code class="language-js"><span>const x = 1;</span></code></pre></div>';
    const checkRich=async()=>{
      assert(editor.querySelector('h2')?.textContent==='GPT标题','富文本标题丢失');
      assert(editor.querySelector('strong')?.textContent==='粗体'&&editor.querySelector('ol li')?.textContent==='第一项','GPT列表或粗体丢失');
      assert(editor.querySelector('table th')?.textContent==='名称','GPT表格没有转换为Markdown表头');
      assert(editor.querySelector('pre code')?.textContent.trim()==='const x = 1;','代码夹带复制按钮文本');
      const value=await read();
      assert(value.includes('## GPT标题')&&value.includes('**粗体**')&&value.includes('[链接](https://example.com)'),'富文本源码缺少Markdown语义');
      assert(value.includes('\\x60\\x60\\x60js')&&value.includes('| 名称 | 值 |'),'代码语言或表格源码丢失: '+value);
      assert(!value.includes('复制代码')&&!value.includes('prose')&&!value.includes('color:red'),'复制页面样式或控件污染源码');
    };
    await fresh();paste(richText,richHtml);await wait(200);await checkRich();
    await fresh();mode.click();await wait(40);
    const richData=new DataTransfer();richData.setData('text/plain',richText);richData.setData('text/html',richHtml);
    source.dispatchEvent(new ClipboardEvent('paste',{clipboardData:richData,bubbles:true,cancelable:true}));await wait(150);
    mode.click();await wait(100);await checkRich();
    await fresh();await window.inkdown.copyText('# Menu clipboard');
    const menuClipboard=await window.inkdown.readClipboardContent();
    assert(menuClipboard.text==='# Menu clipboard'&&!menuClipboard.html,'菜单剪贴板读取类型错误');
    document.querySelector('[data-action="paste"]').click();await wait(150);
    assert(await read()==='# Menu clipboard','菜单粘贴没有走Markdown源码事务');
    await fresh();await window.inkdown.copyText('# literal **text**');
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'V',code:'KeyV',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}));await wait(100);
    assert(!editor.querySelector('h1,strong')&&editor.textContent.includes('# literal **text**'),'粘贴为纯文本仍解释了Markdown');
    await fresh();paste('old','<p><strong>old</strong></p>');document.querySelector('#newBtn').click();await wait(150);
    assert(await read()==='','迟到的富文本粘贴写入了新标签');
    await fresh();paste('before');await wait(60);
    place(editor.querySelector('p').firstChild,3,6);paste('**NEW**');await wait(150);
    assert(await read()==='bef**NEW**','局部选择粘贴错误');
    assert(editor.querySelector('strong')?.textContent==='NEW','局部Markdown没有渲染');
    document.querySelector('[data-action="undo"]').click();await wait(100);
    assert(await read()==='before','Markdown粘贴与前一次输入合并了撤销历史');
    document.querySelector('[data-action="redo"]').click();await wait(100);
    place(editor.querySelector('strong').firstChild,3);paste('!');await wait(50);
    assert(editor.textContent.includes('NEW!'),'粘贴后的光标没有停在插入处');
    await fresh();paste('before');await wait(40);
    const line=document.createElement('p');line.innerHTML='<br>';editor.append(line);place(line,0);
    paste('# Next');await wait(120);
    assert(await read()==='before\\n\\n# Next','空行粘贴标题没有保留块边界');
    await fresh();source.classList.contains('hidden')&&mode.click();await wait(30);
    source.value='\\x60\\x60\\x60txt\\ncode\\n\\x60\\x60\\x60';source.dispatchEvent(new Event('input',{bubbles:true}));mode.click();await wait(80);
    place(editor.querySelector('code').firstChild,4);paste('**literal**\\nsecond line');await wait(80);
    assert(editor.querySelector('code').textContent.includes('**literal**')&&!editor.querySelector('strong'),'代码块粘贴被解释成Markdown');
    assert((await read()).includes('**literal**\\nsecond line'),'代码块粘贴丢失换行');
    await fresh();const large='# Large\\n\\n'+Array.from({length:700},(_,i)=>'Paragraph '+i+' **bold** [link](https://example.com)\\n\\n').join('');
    const began=performance.now();paste(large);
    for(let i=0;i<100&&!editor.querySelector('h1');i++)await wait(25);
    const latency=performance.now()-began;
    assert(editor.querySelector('h1')?.textContent==='Large','大段粘贴未完成');
    assert(latency<2500,'大段Markdown粘贴卡顿 '+latency);
    assert(await read()===large,'大段粘贴源码被转义');
    return {exactMarkdown:true,gptRichHtml:true,sourceRichHtml:true,menuClipboard:true,partialSelection:true,literalCode:true,literalPaste:true,stalePaste:true,paragraphs:700,latencyMs:Math.round(latency)};
  })()`)));
  const profiles = path.join(root, '.test-profiles');
  const profile = await mkdtemp(path.join(profiles, 'clipboard-native-'));
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(path.join(root, 'node_modules/electron/dist/electron.exe'),
        [path.join(root, 'tests/electron-clipboard-fixture.cjs'), `--user-data-dir=${profile}`],
        { cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let errors = ''; child.stderr.on('data', data => { errors += data; });
      const timer = setTimeout(() => { if (child.pid) spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }); }, 15000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(errors)); });
    });
    console.log(JSON.stringify(await evaluate(`(async()=>{
      const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
      const assert=(v,m)=>{if(!v)throw new Error(m)};
      const clipboard=await window.inkdown.readClipboardContent();
      assert(clipboard.html.includes('<h2>Native GPT heading</h2>'),'系统剪贴板HTML没有被读取');
      document.querySelector('#newBtn').click();await wait(50);
      const source=document.querySelector('#sourceEditor'),mode=document.querySelector('#sourceModeBtn');
      if(!source.classList.contains('hidden')){mode.click();await wait(40)}
      document.querySelector('[data-action="paste"]').click();await wait(200);
      assert(document.querySelector('#wysiwyg h2')?.textContent==='Native GPT heading','系统HTML菜单粘贴缺少标题');
      mode.click();await wait(40);
      assert(source.value.includes('## Native GPT heading')&&source.value.includes('**formatted**'),'系统HTML菜单粘贴没有转换为Markdown源码');
      return {nativeHtmlClipboard:true,nativeRichMenuPaste:true};
    })()`)));
  } finally {
    if (!path.resolve(profile).startsWith(profiles + path.sep)) throw new Error('Unsafe clipboard profile cleanup');
    await rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
  for (const focusMode of [false, true]) {
    await evaluate(`(async()=>{
      const wait=ms=>new Promise(r=>setTimeout(r,ms));
      document.body.classList.remove('focus-mode');
      document.querySelector('#newBtn').click();await wait(50);
      const source=document.querySelector('#sourceEditor'),mode=document.querySelector('#sourceModeBtn');
      if(source.classList.contains('hidden')){mode.click();await wait(50)}
      source.value=Array.from({length:150},(_,i)=>'Paragraph '+i+' **MARK** tail').join('\\n\\n');
      source.dispatchEvent(new Event('input',{bubbles:true}));mode.click();await wait(150);
      const editor=document.querySelector('#wysiwyg'),pane=document.querySelector('#editorPane'),block=[...editor.querySelectorAll('p')].filter(p=>p.textContent.startsWith('Paragraph'))[95];
      if(!block?.querySelector('strong'))throw new Error('Position fixture render: '+block?.outerHTML);
      editor.focus({preventScroll:true});const r=document.createRange();r.selectNodeContents(block.querySelector('strong'));
      getSelection().removeAllRanges();getSelection().addRange(r);block.scrollIntoView({block:'center',behavior:'instant'});await wait(80);
      document.body.classList.toggle('focus-mode',${focusMode});
      window.clipboardScroll=pane.scrollTop;
    })()`);
    await shortcut('c', 'KeyC');
    {
      const copy = await evaluate(`new Promise(r=>setTimeout(()=>r({before:window.clipboardScroll,after:document.querySelector('#editorPane').scrollTop}),200))`);
      if (Math.abs(copy.before - copy.after) > 4) throw new Error('Ctrl+C moved viewport: '+JSON.stringify(copy));
    }
    await evaluate(`(()=>{const editor=document.querySelector('#wysiwyg'),node=[...editor.querySelectorAll('p')].filter(p=>p.textContent.startsWith('Paragraph'))[95].firstChild,r=document.createRange();r.setStart(node,4);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);window.clipboardScroll=document.querySelector('#editorPane').scrollTop})()`);
    await shortcut('v', 'KeyV');
    const pastePosition = await evaluate(`new Promise(r=>setTimeout(()=>r({before:window.clipboardScroll,after:document.querySelector('#editorPane').scrollTop,block:getSelection().anchorNode?.parentElement.closest('p')?.textContent,offset:getSelection().anchorOffset}),500))`);
    if (Math.abs(pastePosition.before - pastePosition.after) > 4 || pastePosition.block !== 'ParaMARKgraph 95 MARK tail') throw new Error('Ctrl+V moved viewport/caret: '+JSON.stringify(pastePosition));
    await shortcut('z', 'KeyZ');
    const undone = await evaluate(`new Promise(r=>setTimeout(()=>r({scroll:document.querySelector('#editorPane').scrollTop,block:getSelection().anchorNode?.parentElement.closest('p')?.textContent,offset:getSelection().anchorOffset}),300))`);
    if (Math.abs(undone.scroll-pastePosition.after)>4 || undone.block!=='Paragraph 95 MARK tail') throw new Error('Ctrl+Z moved to unrelated block/viewport: '+JSON.stringify(undone));
    await shortcut('y', 'KeyY');
    const redone = await evaluate(`new Promise(r=>setTimeout(()=>r({scroll:document.querySelector('#editorPane').scrollTop,block:getSelection().anchorNode?.parentElement.closest('p')?.textContent}),300))`);
    if (Math.abs(redone.scroll-undone.scroll)>4 || redone.block!=='ParaMARKgraph 95 MARK tail') throw new Error('Ctrl+Y moved to unrelated block/viewport: '+JSON.stringify(redone));
  }
  await evaluate(`(async()=>{
    document.querySelector('#newBtn').click();document.querySelector('#sourceModeBtn').click();
    const source=document.querySelector('#sourceEditor');source.value=Array.from({length:150},(_,i)=>'Source paragraph '+i).join('\\n\\n');source.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>setTimeout(r,320));
    const offset=source.value.indexOf('Source paragraph 95')+4;source.focus();source.setSelectionRange(offset,offset);source.scrollTop=1200;
    window.historySourceOffset=offset;window.historySourceScroll=source.scrollTop;
  })()`);
  await command('Input.insertText',{text:'X'});
  await evaluate(`new Promise(r=>requestAnimationFrame(()=>{window.historySourceScroll=document.querySelector('#sourceEditor').scrollTop;r()}))`);
  await shortcut('z','KeyZ');
  const sourceUndo=await evaluate(`({offset:document.querySelector('#sourceEditor').selectionStart,expected:window.historySourceOffset+1,scroll:document.querySelector('#sourceEditor').scrollTop,before:window.historySourceScroll,value:document.querySelector('#sourceEditor').value.includes('SourXce')})`);
  if(sourceUndo.offset!==sourceUndo.expected||Math.abs(sourceUndo.scroll-sourceUndo.before)>4||sourceUndo.value)throw new Error('Source undo moved caret/viewport: '+JSON.stringify(sourceUndo));
  console.log(JSON.stringify({nativeCopyPasteViewport:true,focusClipboardViewport:true,nativeUndoRedoViewport:true,sourceUndoViewport:true}));
} finally { socket.close(); }
