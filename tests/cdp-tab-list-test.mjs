const endpoint = process.argv[2] || 'http://127.0.0.1:9378';
const pages = await (await fetch(`${endpoint}/json`)).json();
const page = pages.find(item => item.type === 'page');
if (!page) throw new Error('找不到 Inkdown 页面');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let id = 0;
const command = (method, params = {}) => new Promise((resolve, reject) => {
  const requestId = ++id;
  const listener = event => {
    const message = JSON.parse(event.data); if (message.id !== requestId) return;
    socket.removeEventListener('message', listener);
    if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
    else resolve(message.result);
  };
  socket.addEventListener('message', listener);
  socket.send(JSON.stringify({ id: requestId, method, params }));
});
const evaluate = async expression => (await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value;

const result = await evaluate(`(async () => {
  const editor = document.querySelector('#wysiwyg');
  const source = document.querySelector('#sourceEditor');
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  if (!source.classList.contains('hidden')) { document.querySelector('#sourceModeBtn').click(); await new Promise(resolve => setTimeout(resolve, 80)); }
  if (document.querySelector('#editorPane').classList.contains('hidden')) {
    document.querySelector('#newBtn').click(); await new Promise(resolve => setTimeout(resolve, 50));
  }
  const caret = node => { editor.focus(); const range = document.createRange(); range.selectNodeContents(node); range.collapse(false); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); };
  const tab = (target, shiftKey = false) => target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', code: 'Tab', shiftKey, bubbles: true, cancelable: true }));

  editor.innerHTML = '<ul><li>父项</li><li>子项</li></ul>';
  let child = editor.querySelectorAll('li')[1]; caret(child); tab(editor);
  assert(editor.querySelectorAll(':scope > ul > li').length === 1, 'Tab 后外层列表项数量错误');
  assert(editor.querySelector(':scope > ul > li > ul > li')?.textContent === '子项', 'Tab 未生成下一级列表');
  child = editor.querySelector(':scope > ul > li > ul > li'); caret(child); tab(editor, true);
  assert(editor.querySelectorAll(':scope > ul > li').length === 2, 'Shift+Tab 未返回上一级');

  editor.innerHTML = '<ol><li>第一项</li><li>第二项</li></ol>';
  child = editor.querySelectorAll('li')[1]; caret(child); tab(editor);
  assert(editor.querySelector(':scope > ol > li > ol > li')?.textContent === '第二项', '有序列表嵌套失败');

  editor.innerHTML = '<ul><li><input type="checkbox"><span>父任务</span></li><li><input type="checkbox"><span>子任务</span></li></ul>';
  child = editor.querySelectorAll('li')[1]; caret(child.querySelector('span')); tab(editor);
  assert(editor.querySelector(':scope > ul > li > ul > li input[type="checkbox"]'), '任务列表嵌套失败');
  const nestedMarkdown = await window.inkdown.htmlToMarkdown(editor.innerHTML);
  const nestedLines = nestedMarkdown.split('\\n');
  assert(nestedLines.length > 1 && nestedLines[1].startsWith(' ') && nestedLines[1].includes('子任务'), '嵌套任务列表没有正确序列化为 Markdown：' + JSON.stringify(nestedMarkdown));

  editor.innerHTML = '<p>普通文本</p>'; const paragraph = editor.querySelector('p'); caret(paragraph); tab(editor);
  assert(paragraph.textContent === '普通文本\\t' && document.activeElement === editor, '普通文本 Tab 没有留在编辑器内插入缩进：' + JSON.stringify({ text: paragraph.textContent, active: document.activeElement?.id }));

  editor.innerHTML = '<ul><li>一级<ul><li>二级<ul><li>三级<ul><li>末级</li></ul></li></ul></li></ul></li></ul>';
  let deepest = [...editor.querySelectorAll('li')].at(-1); caret(deepest); tab(editor); tab(editor);
  const deepestContent = deepest.querySelector(':scope > [data-list-content]');
  assert(deepestContent?.textContent === '末级\\t\\t', '无法继续嵌套时 Tab 应连续插入制表符');
  const caretRange = document.createRange(); caretRange.selectNodeContents(deepestContent); caretRange.setEnd(getSelection().anchorNode, getSelection().anchorOffset);
  assert(caretRange.toString().length === deepestContent.textContent.length, 'Tab 后光标没有停在最后一个字符之后：' + JSON.stringify({range:caretRange.toString(),text:deepestContent.textContent,anchor:window.getSelection().anchorNode?.nodeName,offset:window.getSelection().anchorOffset,html:deepestContent.innerHTML}));
  const contentRect = deepestContent.getBoundingClientRect();
  const mouseRange = document.caretRangeFromPoint(contentRect.right - 1, contentRect.top + contentRect.height / 2);
  const mouseOffsetRange = document.createRange(); mouseOffsetRange.selectNodeContents(deepestContent); mouseOffsetRange.setEnd(mouseRange.startContainer, mouseRange.startOffset);
  assert(deepestContent.contains(mouseRange.startContainer) && mouseOffsetRange.toString().length === deepestContent.textContent.length, '鼠标无法定位到列表项最后一个字符之后');

  editor.innerHTML = '<ul><li>一级<ul><li>二级<ul><li><br></li></ul></li></ul></li></ul>';
  deepest = [...editor.querySelectorAll('li')].at(-1); caret(deepest);
  const backspace = () => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', code: 'Backspace', bubbles: true, cancelable: true }));
  backspace(); backspace(); backspace();
  assert(editor.querySelector(':scope > p') && !editor.querySelector('li > p'), '空列表项 Backspace 没有逐级退出或仍残留卡死结构：' + editor.innerHTML);

  editor.innerHTML = '<ul><li>父级</li><li><br><ul><li>应保持二级</li></ul></li></ul>'; editor.dispatchEvent(new Event('input', { bubbles: true }));
  let emptyParent = editor.querySelectorAll(':scope > ul > li')[1]; caret(emptyParent.querySelector(':scope > [data-list-content]')); backspace();
  const onlyParent = editor.querySelector(':scope > ul > li');
  assert(editor.querySelectorAll(':scope > ul > li').length === 1 && onlyParent.querySelector(':scope > ul > li')?.textContent === '应保持二级', '删除空父行后子列表层级被提升：' + editor.innerHTML);
  const preservedGap = onlyParent.querySelector(':scope > [data-list-gap]');
  assert(preservedGap && preservedGap.contains(getSelection().anchorNode), '删除空父列表项后没有保留当前可编辑空行：' + editor.innerHTML);
  const adoptedMarkdown = await window.inkdown.htmlToMarkdown(editor.innerHTML); const adoptedLines = adoptedMarkdown.split('\\n');
  assert(adoptedLines.some(line => line.startsWith(' ') && line.includes('应保持二级')), '删除空父行后 Markdown 丢失二级缩进：' + JSON.stringify(adoptedMarkdown));

  editor.innerHTML = '<ul><li>父级<ul><li>二级</li><li>\\t\\t</li></ul></li></ul>'; editor.dispatchEvent(new Event('input', { bubbles: true }));
  let indentedEmpty = [...editor.querySelectorAll('li')].at(-1); const indentedContent = indentedEmpty.querySelector(':scope > [data-list-content]'); caret(indentedContent);
  backspace(); assert(indentedContent.textContent === '\\t', '第一次 Backspace 没有删除一个 Tab 缩进');
  backspace(); assert(indentedContent.textContent === '', '第二次 Backspace 没有删除剩余 Tab 缩进');
  backspace(); assert(editor.querySelectorAll(':scope > ul > li').length === 2, '缩进删除完后 Backspace 没有退出二级列表');

  editor.innerHTML = '<ul><li>父级<ul><li>\\u00a0\\u00a0\\u00a0\\u00a0</li></ul></li></ul>'; editor.dispatchEvent(new Event('input', { bubbles: true }));
  const nbspContent = editor.querySelector('li li > [data-list-content]'); caret(nbspContent); backspace();
  assert(nbspContent.textContent === '', '不可见空格没有作为一个缩进单位删除');

  editor.innerHTML = '<ul><li>回车测试</li></ul>'; editor.dispatchEvent(new Event('input', { bubbles: true }));
  const enterItem = editor.querySelector('li'); caret(enterItem.querySelector(':scope > [data-list-content]'));
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  assert(editor.querySelectorAll(':scope > ul > li').length === 2 && !editor.querySelectorAll(':scope > ul > li')[1].textContent, '列表 Enter 没有创建规范的同级空列表项');

  editor.innerHTML = '<ul><li>上一项</li><li>当前位置<ul><li><br></li></ul></li><li><br></li></ul>'; editor.dispatchEvent(new Event('input', { bubbles: true }));
  const owner = editor.querySelectorAll(':scope > ul > li')[1]; caret(owner.querySelector(':scope > [data-list-content]'));
  editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
  const directAfterEnter = editor.querySelectorAll(':scope > ul > li'); const created = directAfterEnter[2];
  assert(directAfterEnter.length === 4 && !owner.querySelector(':scope > ul') && created.querySelector(':scope > ul > li'), 'Enter 后新列表项仍出现在原子列表之后：' + editor.innerHTML);
  const createdRect = created.querySelector(':scope > [data-list-content]').getBoundingClientRect(); const childRect = created.querySelector(':scope > ul > li > [data-list-content]').getBoundingClientRect();
  assert(createdRect.top < childRect.top, 'Enter 创建的新同级项视觉位置没有紧跟当前行');

  source.value = '第一行\\n第二行'; source.selectionStart = source.selectionEnd = 3; tab(source);
  assert(source.value === '第一行\\t\\n第二行', '源码模式 Tab 未插入制表符');
  source.value = '第一行\\n第二行'; source.selectionStart = 0; source.selectionEnd = source.value.length; tab(source);
  assert(source.value === '\\t第一行\\n\\t第二行', '多行 Tab 未统一缩进');
  source.selectionStart = 0; source.selectionEnd = source.value.length; tab(source, true);
  assert(source.value === '第一行\\n第二行', '多行 Shift+Tab 未取消缩进');
  return { unorderedNested: true, orderedNested: true, taskNested: true, markdownPreserved: true, visualTab: true, repeatedTab: true, caretAtEnd: true, mouseAtEnd: true, backspaceUnnests: true, childLevelPreserved: true, emptyParentGap: true, indentDeletion: true, semanticEnter: true, enterTransfersChildren: true, sourceTab: true, multilineTab: true };
})()`);

const rows = await evaluate(`(() => {
  const editor = document.querySelector('#wysiwyg'); editor.classList.remove('hidden'); editor.parentElement.classList.remove('hidden');
  editor.innerHTML = '<ul><li>一级<ul><li>二级<ul><li>三级<ul><li>四级</li></ul></li></ul></li></ul></li></ul>';
  editor.dispatchEvent(new Event('input', { bubbles: true }));
  return [...editor.querySelectorAll('li > [data-list-content]')].map((content, index) => {
    const rect = content.getBoundingClientRect(); return { index, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
  });
})()`);
const click = async (x, y) => {
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
};
const pressKey = async (key, code, windowsVirtualKeyCode) => {
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode });
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode, nativeVirtualKeyCode: windowsVirtualKeyCode });
};
for (let pass = 0; pass < 5; pass++) {
  for (const row of rows) {
    const y = (row.top + row.bottom) / 2;
    await click(row.left - 16, y);
    const start = await evaluate(`(() => { const s=getSelection(), c=document.querySelectorAll('li > [data-list-content]')[${row.index}]; if(!s.rangeCount||!c.contains(s.anchorNode)) return false; const r=document.createRange();r.selectNodeContents(c);r.setEnd(s.anchorNode,s.anchorOffset);return r.toString().length===0; })()`);
    if (!start) throw new Error(`第 ${row.index + 1} 级列表左侧点击产生了结构光标`);
    await click(row.right + 28, y);
    const end = await evaluate(`(() => { const s=getSelection(), c=document.querySelectorAll('li > [data-list-content]')[${row.index}]; if(!s.rangeCount||!c.contains(s.anchorNode)) return false; const r=document.createRange();r.selectNodeContents(c);r.setEnd(s.anchorNode,s.anchorOffset);return r.toString().length===c.textContent.length; })()`);
    if (!end) throw new Error(`第 ${row.index + 1} 级列表右侧点击没有落到行尾`);
  }
}
result.pointerCanonical = true; result.pointerPasses = rows.length * 5;

const farRow = await evaluate(`(() => {
  const editor=document.querySelector('#wysiwyg');
  editor.innerHTML='<ul><li>top one</li><li>target row<ul><li>child row<ul><li>deep row</li></ul></li></ul></li></ul>';
  editor.dispatchEvent(new Event('input',{bubbles:true}));
  const target=editor.querySelectorAll(':scope > ul > li')[1].querySelector(':scope > [data-list-content]');
  const row=target.getBoundingClientRect(),box=editor.getBoundingClientRect();
  return {x:box.right-100,y:(row.top+row.bottom)/2};
})()`);
for (let pass=0;pass<20;pass++) {
  await click(farRow.x,farRow.y);
  const correctRow=await evaluate(`(() => {
    const editor=document.querySelector('#wysiwyg'),target=editor.querySelectorAll(':scope > ul > li')[1].querySelector(':scope > [data-list-content]'),selection=getSelection();
    if(!selection.rangeCount||!target.contains(selection.anchorNode))return false;
    const range=document.createRange();range.selectNodeContents(target);range.setEnd(selection.anchorNode,selection.anchorOffset);
    return range.toString().length===target.textContent.length;
  })()`);
  if(!correctRow)throw new Error('列表行右侧空白点击被错误派发到了嵌套子项');
}
result.farRowPointerPasses=20;

await evaluate(`(() => {
  const e=document.querySelector('#wysiwyg'); e.innerHTML='<ul><li>父级</li><li><br><ul><li>二级保持</li></ul></li></ul>';e.dispatchEvent(new Event('input',{bubbles:true}));
  const c=e.querySelectorAll(':scope > ul > li')[1].querySelector(':scope > [data-list-content]');e.focus();const r=document.createRange();r.selectNodeContents(c);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);
})()`);
await pressKey('Backspace', 'Backspace', 8);
const realAdoption = await evaluate(`(() => {const e=document.querySelector('#wysiwyg'),p=e.querySelector(':scope > ul > li'),gap=p?.querySelector(':scope > [data-list-gap]'),s=getSelection();return e.querySelectorAll(':scope > ul > li').length===1&&p.querySelector(':scope > ul > li')?.textContent==='二级保持'&&Boolean(gap&&s.rangeCount&&gap.contains(s.anchorNode));})()`);
if (!realAdoption) throw new Error('真实 Backspace 删除空父行时没有同时保留层级和空行');

await evaluate(`(() => {
  const e=document.querySelector('#wysiwyg');e.innerHTML='<ul><li>父级<ul><li>\\t\\t</li></ul></li></ul>';e.dispatchEvent(new Event('input',{bubbles:true}));
  const c=e.querySelector('li li > [data-list-content]');e.focus();const r=document.createRange();r.selectNodeContents(c);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);
})()`);
await pressKey('Backspace', 'Backspace', 8); await pressKey('Backspace', 'Backspace', 8);
const realIndentDeleted = await evaluate(`document.querySelector('li li > [data-list-content]')?.textContent === ''`);
if (!realIndentDeleted) throw new Error('真实 Backspace 无法删除列表内 Tab 缩进');
await evaluate(`(() => {
  const e=document.querySelector('#wysiwyg');e.innerHTML='<ul><li>上一项</li><li>按回车<ul><li>原二级</li></ul></li><li>末项</li></ul>';e.dispatchEvent(new Event('input',{bubbles:true}));
  const c=e.querySelectorAll(':scope > ul > li')[1].querySelector(':scope > [data-list-content]');e.focus();const r=document.createRange();r.selectNodeContents(c);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);
})()`);
await pressKey('Enter', 'Enter', 13);
const realEnterOrder = await evaluate(`(() => {const e=document.querySelector('#wysiwyg'),items=e.querySelectorAll(':scope > ul > li'),old=items[1],created=items[2];return items.length===4&&!old.querySelector(':scope > ul')&&Boolean(created.querySelector(':scope > ul > li'));})()`);
if (!realEnterOrder) throw new Error('真实 Enter 仍把新同级项放在子列表之后');
const sourceSnapshot = await evaluate(`(async()=>{const button=document.querySelector('#sourceModeBtn');button.click();await new Promise(r=>setTimeout(r,80));const value=document.querySelector('#sourceEditor').value;button.click();await new Promise(r=>setTimeout(r,80));return value;})()`);
const sourceLines = sourceSnapshot.split('\n');
const currentLine = sourceLines.findIndex(line => line.includes('按回车')); const childLine = sourceLines.findIndex(line => line.includes('原二级')); const lastLine = sourceLines.findIndex(line => line.includes('末项'));
if (!(currentLine >= 0 && childLine === currentLine + 2 && lastLine === childLine + 1 && /^\s*-\s*$/.test(sourceLines[currentLine + 1]) && sourceLines[childLine].search(/\S/) > sourceLines[currentLine + 1].search(/\S/))) throw new Error('Markdown 源码顺序未按新同级项→原二级项→末项提交：' + JSON.stringify(sourceSnapshot));
result.realBackspace = true; result.realEnterOrder = true; result.sourceAuthoritative = true;
const tabReprojection = await evaluate(`(async()=>{
  const editor=document.querySelector('#wysiwyg');editor.innerHTML='<ul><li>源码父项<ul><li>源码子项</li></ul></li><li>源码末项</li></ul>';editor.dispatchEvent(new Event('input',{bubbles:true}));
  const originalId=document.querySelector('.tab.active')?.dataset.id;document.querySelector('#newBtn').click();await new Promise(r=>setTimeout(r,100));
  [...document.querySelectorAll('.tab')].find(tab=>tab.dataset.id===originalId)?.click();await new Promise(r=>setTimeout(r,140));
  const parent=editor.querySelector(':scope > ul > li');return Boolean(parent&&parent.querySelector(':scope > ul > li')?.textContent==='源码子项'&&editor.querySelectorAll(':scope > ul > li')[1]?.textContent==='源码末项');
})()`);
if (!tabReprojection) throw new Error('标签切换后未能仅凭 Markdown 重建原列表顺序');
result.tabReprojection = true;
const outdentOrder = await evaluate(`(async()=>{
  const editor=document.querySelector('#wysiwyg'),button=document.querySelector('#sourceModeBtn');
  const caretStart=content=>{editor.focus();const r=document.createRange();r.selectNodeContents(content);r.collapse(true);const s=getSelection();s.removeAllRanges();s.addRange(r);};
  const labels=()=>[...editor.querySelectorAll('li > [data-list-content]')].map(node=>node.textContent.trim());
  const snapshot=async()=>{button.click();await new Promise(r=>setTimeout(r,90));const value=document.querySelector('#sourceEditor').value;button.click();await new Promise(r=>setTimeout(r,110));return value;};
  const setup=()=>{editor.innerHTML='<ul><li>P<ul><li>A</li><li>B</li></ul></li><li>C</li></ul>';editor.dispatchEvent(new Event('input',{bubbles:true}));};
  setup();let target=editor.querySelector('li li > [data-list-content]');caretStart(target);editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',code:'Tab',shiftKey:true,bubbles:true,cancelable:true}));
  const tabLabels=labels(),tabStructure=Boolean(editor.querySelector(':scope > ul > li:nth-child(2) > ul > li > [data-list-content]')?.textContent.trim()==='B'),tabSource=await snapshot();
  setup();target=editor.querySelector('li li > [data-list-content]');caretStart(target);editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',code:'Backspace',bubbles:true,cancelable:true}));
  const backspaceLabels=labels(),backspaceStructure=Boolean(editor.querySelector(':scope > ul > li:nth-child(2) > ul > li > [data-list-content]')?.textContent.trim()==='B'),backspaceSource=await snapshot();
  const ordered=value=>['P','A','B','C'].every((label,index,array)=>index===0||value.indexOf(array[index-1])<value.indexOf(label));
  return {tab:tabLabels.join(',')==='P,A,B,C'&&tabStructure&&ordered(tabSource),backspace:backspaceLabels.join(',')==='P,A,B,C'&&backspaceStructure&&ordered(backspaceSource)};
})()`);
if (!outdentOrder.tab || !outdentOrder.backspace) throw new Error('列表外移改变了 P→A→B→C 的源码逻辑顺序：'+JSON.stringify(outdentOrder));
result.outdentOrder = true;
const taskProjection = await evaluate(`(async()=>{
  const button=document.querySelector('#sourceModeBtn'),source=document.querySelector('#sourceEditor'),editor=document.querySelector('#wysiwyg');
  if(source.classList.contains('hidden')){button.click();await new Promise(r=>setTimeout(r,90));}
  document.querySelector('#newBtn').click();await new Promise(r=>setTimeout(r,100));source.value='- [ ] task\\n- [x] done';source.dispatchEvent(new Event('input',{bubbles:true}));button.click();await new Promise(r=>setTimeout(r,140));
  const first=editor.querySelector(':scope > ul > li'),content=first?.querySelector(':scope > [data-list-content]'),canonical=Boolean(first?.querySelector(':scope > input[type="checkbox"]')&&content&&!first.querySelector(':scope > [data-list-content] input'));
  if(content){editor.focus();const r=document.createRange();r.selectNodeContents(content);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);document.execCommand('insertText',false,'!');}
  await new Promise(r=>setTimeout(r,40));button.click();await new Promise(r=>setTimeout(r,100));const value=source.value;button.click();await new Promise(r=>setTimeout(r,100));
  return {ok:canonical&&/\\[ \\]\\s*task!/.test(value)&&/\\[x\\]\\s*done/i.test(value),canonical,value,html:editor.innerHTML};
})()`);
if (!taskProjection.ok) throw new Error('真实 Markdown 任务列表投影后丢失了 checkbox 或任务标记：'+JSON.stringify(taskProjection));
result.taskProjection = true;
const tabSourcePersistence = await evaluate(`(async()=>{
  const editor=document.querySelector('#wysiwyg'),button=document.querySelector('#sourceModeBtn'),source=document.querySelector('#sourceEditor');document.querySelector('#newBtn').click();await new Promise(r=>setTimeout(r,100));
  editor.innerHTML='<p>A</p>';editor.dispatchEvent(new Event('input',{bubbles:true}));const p=editor.querySelector('p');editor.focus();const r=document.createRange();r.selectNodeContents(p);r.collapse(false);const s=getSelection();s.removeAllRanges();s.addRange(r);
  editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',code:'Tab',bubbles:true,cancelable:true}));editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',code:'Tab',bubbles:true,cancelable:true}));const beforeHtml=editor.innerHTML,codecValue=await window.inkdown.htmlToMarkdown(beforeHtml);
  button.click();await new Promise(r=>setTimeout(r,100));const value=source.value;button.click();await new Promise(r=>setTimeout(r,130));const count=editor.querySelectorAll('[data-md-tab]').length;return {ok:value==='A\\t\\t'&&count===2,value,count,html:editor.innerHTML,beforeHtml,codecValue};
})()`);
if (!tabSourcePersistence.ok) throw new Error('Tab 字符提交到源码或重新投影后丢失：'+JSON.stringify(tabSourcePersistence));
result.tabSourcePersistence = true;
const noOpSourceStable = await evaluate(`(async()=>{
  const button=document.querySelector('#sourceModeBtn'),source=document.querySelector('#sourceEditor');if(source.classList.contains('hidden')){button.click();await new Promise(r=>setTimeout(r,90));}
  document.querySelector('#newBtn').click();await new Promise(r=>setTimeout(r,90));const original='* alpha\\n    * child\\n\\n3. third\\n\\n__strong__\\n\\n[ref]: https://example.com';source.value=original;source.dispatchEvent(new Event('input',{bubbles:true}));const originalId=document.querySelector('.tab.active')?.dataset.id;
  button.click();await new Promise(r=>setTimeout(r,120));document.querySelector('#newBtn').click();await new Promise(r=>setTimeout(r,90));[...document.querySelectorAll('.tab')].find(tab=>tab.dataset.id===originalId)?.click();await new Promise(r=>setTimeout(r,130));button.click();await new Promise(r=>setTimeout(r,100));const value=source.value;button.click();await new Promise(r=>setTimeout(r,90));return value===original;
})()`);
if (!noOpSourceStable) throw new Error('未编辑时切源码/切标签仍反向改写 Markdown');
result.noOpSourceStable = true;
const sourceOnlySession = await evaluate(`(async()=>{await new Promise(r=>setTimeout(r,650));const session=(await new (await import('./core/session-recovery-storage.mjs')).SessionRecoveryStorage().load() || {});return (session.drafts||[]).every(draft=>!Object.prototype.hasOwnProperty.call(draft,'visualHtml'));})()`);
if (!sourceOnlySession) throw new Error('会话中仍持久化了渲染 DOM');
result.sourceOnlySession = true;
const configurableListStyles = await evaluate(`(async()=>{
  const editor=document.querySelector('#wysiwyg'),button=document.querySelector('#sourceModeBtn'),userStyle=document.querySelector('#userStyle'),originalStyle=userStyle.textContent;
  if(!document.querySelector('#sourceEditor').classList.contains('hidden')){button.click();await new Promise(r=>setTimeout(r,100));}
  document.querySelector('#newBtn').click();await new Promise(r=>setTimeout(r,80));
  const nested=(tag,prefix,depth=1)=>depth===6?'<'+tag+'><li>'+prefix+depth+'</li></'+tag+'>':'<'+tag+'><li>'+prefix+depth+nested(tag,prefix,depth+1)+'</li></'+tag+'>';
  editor.innerHTML=nested('ul','U')+nested('ol','O');editor.dispatchEvent(new Event('input',{bubbles:true}));
  button.click();await new Promise(r=>setTimeout(r,80));const before=document.querySelector('#sourceEditor').value;button.click();await new Promise(r=>setTimeout(r,100));
  userStyle.textContent=':root{--inkdown-ul-marker-1:"🌱";--inkdown-ul-marker-2:"🌿";--inkdown-ul-marker-3:"🌳";--inkdown-ul-marker-4:"🌱";--inkdown-ul-marker-5:"🌿";--inkdown-ul-marker-6:"🌳";--inkdown-ol-style-1:decimal;--inkdown-ol-style-2:lower-alpha;--inkdown-ol-style-3:lower-roman;--inkdown-ol-style-4:decimal;--inkdown-ol-style-5:lower-alpha;--inkdown-ol-style-6:lower-roman;--inkdown-h2-prefix:"✨ ";}';
  const markers=[...editor.querySelectorAll('ul > li')].map(node=>getComputedStyle(node,'::marker').content.replace(/["']/g,'').trim());
  const ordered=[...editor.querySelectorAll('ol')].map(node=>getComputedStyle(node).listStyleType);
  editor.insertAdjacentHTML('afterbegin','<h2>Styled heading</h2>');const headingPrefix=getComputedStyle(editor.querySelector('h2'),'::before').content.replace(/["']/g,'').trim();
  button.click();await new Promise(r=>setTimeout(r,80));const after=document.querySelector('#sourceEditor').value;
  userStyle.textContent=originalStyle;
  return {markers,ordered,headingPrefix,sourceStable:before===after};
})()`);
const expectedMarkers=['🌱','🌿','🌳','🌱','🌿','🌳'];
const expectedMixed=['decimal','lower-alpha','lower-roman','decimal','lower-alpha','lower-roman'];
if(configurableListStyles.markers.join(',')!==expectedMarkers.join(',')||configurableListStyles.ordered.join(',')!==expectedMixed.join(',')||configurableListStyles.headingPrefix!=='✨'||!configurableListStyles.sourceStable)throw new Error('用户 CSS 列表/Emoji 配置或源码隔离失败：'+JSON.stringify(configurableListStyles));
result.configurableListStyles = true;
const historySourceOnly = await evaluate(`(async()=>{
  const button=document.querySelector('#sourceModeBtn');if(!document.querySelector('#sourceEditor').classList.contains('hidden')){button.click();await new Promise(r=>setTimeout(r,100));}
  document.querySelector('#newBtn').click();await new Promise(r=>setTimeout(r,140));
  const editor=document.querySelector('#wysiwyg');editor.innerHTML='<p>撤销必须回到空源码</p>';editor.dispatchEvent(new Event('input',{bubbles:true}));await new Promise(r=>setTimeout(r,20));
  editor.focus();editor.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',ctrlKey:true,bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,180));
  button.click();await new Promise(r=>setTimeout(r,120));const value=document.querySelector('#sourceEditor').value;button.click();await new Promise(r=>setTimeout(r,100));
  editor.focus();editor.dispatchEvent(new KeyboardEvent('keydown',{key:'y',code:'KeyY',ctrlKey:true,bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,180));button.click();await new Promise(r=>setTimeout(r,100));const redoValue=document.querySelector('#sourceEditor').value;
  const source=document.querySelector('#sourceEditor');document.querySelector('#newBtn').click();await new Promise(r=>setTimeout(r,100));source.value='源码历史';source.dispatchEvent(new Event('input',{bubbles:true}));source.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',ctrlKey:true,bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,100));const sourceUndo=source.value;source.dispatchEvent(new KeyboardEvent('keydown',{key:'y',code:'KeyY',ctrlKey:true,bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,100));const sourceRedo=source.value;button.click();await new Promise(r=>setTimeout(r,100));
  return {value,redoValue,sourceUndo,sourceRedo};
})()`);
if (historySourceOnly.value!==''||historySourceOnly.redoValue!=='撤销必须回到空源码'||historySourceOnly.sourceUndo!==''||historySourceOnly.sourceRedo!=='源码历史') throw new Error('Markdown 统一历史的立即撤销/重做失败：'+JSON.stringify(historySourceOnly));
result.historySourceOnly = true;
const headingLiteralHash = await evaluate(`(async()=>{
  const button=document.querySelector('#sourceModeBtn');if(!document.querySelector('#sourceEditor').classList.contains('hidden')){button.click();await new Promise(r=>setTimeout(r,100));}
  document.querySelector('#newBtn').click();await new Promise(r=>setTimeout(r,100));
  const editor=document.querySelector('#wysiwyg');editor.innerHTML='<h2>Title</h2>';editor.dispatchEvent(new Event('input',{bubbles:true}));
  const heading=editor.querySelector('h2');editor.focus();const range=document.createRange();range.setStart(heading,0);range.collapse(true);const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
  document.execCommand('insertText',false,'#tag ');await new Promise(r=>setTimeout(r,60));
  const visual={tag:editor.firstElementChild?.tagName,text:editor.firstElementChild?.textContent};button.click();await new Promise(r=>setTimeout(r,100));const source=document.querySelector('#sourceEditor').value;
  return visual.tag==='H2'&&visual.text==='#tag Title'&&source==='## #tag Title';
})()`);
if (!headingLiteralHash) throw new Error('现有标题中的普通 # 文本仍被历史特例解释为标题级别变化');
result.headingLiteralHash = true;
console.log(JSON.stringify(result)); socket.close();
