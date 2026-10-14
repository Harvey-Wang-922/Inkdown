const endpoint = process.argv[2] || 'http://127.0.0.1:9431';
const pages = await (await fetch(`${endpoint}/json`)).json();
const page = pages.find(item => item.type === 'page');
if (!page) throw new Error('Inkdown page was not found');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});

let id = 0;
const evaluate = expression => new Promise((resolve, reject) => {
  const requestId = ++id;
  const listener = event => {
    const message = JSON.parse(event.data);
    if (message.id !== requestId) return;
    socket.removeEventListener('message', listener);
    if (message.error || message.result?.exceptionDetails) reject(new Error(JSON.stringify(message.error || message.result.exceptionDetails)));
    else resolve(message.result.result.value);
  };
  socket.addEventListener('message', listener);
  socket.send(JSON.stringify({ id: requestId, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
});

const result = await evaluate(`(async () => {
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (value, message) => { if (!value) throw new Error(message); };
  document.querySelector('#newBtn').click(); await wait(30);
  if (!document.querySelector('#sourceEditor').classList.contains('hidden')) {
    document.querySelector('#sourceModeBtn').click(); await wait(30);
  }
  const editor = document.querySelector('#wysiwyg');
  editor.innerHTML = '<table><thead><tr><th>Name</th><th>Count</th><th>Note</th></tr></thead><tbody><tr><td>A</td><td>1</td><td>Initial</td></tr><tr><td>B</td><td>2</td><td>Last</td></tr></tbody></table><p><br></p>';
  const place = (cell, end = false) => {
    editor.focus();
    const range = document.createRange(); range.selectNodeContents(cell); range.collapse(!end);
    const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  };
  const key = (key, options = {}) => editor.dispatchEvent(new KeyboardEvent('keydown', {
    key, code: options.code || key, ctrlKey: !!options.ctrlKey, shiftKey: !!options.shiftKey,
    bubbles: true, cancelable: true
  }));

  place(editor.querySelector('tbody tr:first-child td:first-child'));
  key('Tab', { code: 'Tab' });
  const secondCell = editor.querySelector('tbody tr:first-child td:nth-child(2)');
  assert(secondCell.contains(getSelection().anchorNode), 'Tab did not move to the next cell');

  place(editor.querySelector('tbody tr:last-child td:last-child'), true);
  key('Tab', { code: 'Tab' });
  assert(editor.querySelectorAll('tbody tr').length === 3 && editor.querySelector('tbody tr:last-child td:first-child').contains(getSelection().anchorNode), 'Tab at the last cell did not append a row');

  place(editor.querySelector('tbody tr:first-child td:nth-child(2)'));
  key('Enter', { code: 'Enter' });
  assert(editor.querySelector('tbody tr:nth-child(2) td:nth-child(2)').contains(getSelection().anchorNode), 'Enter did not move vertically');
  place(editor.querySelector('tbody tr:first-child td:nth-child(2)'));
  key('Enter', { code: 'Enter', ctrlKey: true });
  assert(editor.querySelectorAll('tbody tr').length === 4, 'Ctrl+Enter did not insert a row');
  key('Backspace', { code: 'Backspace', ctrlKey: true, shiftKey: true });
  assert(editor.querySelectorAll('tbody tr').length === 3, 'Ctrl+Shift+Backspace did not delete the current row');

  place(editor.querySelector('thead th:first-child'));
  key('Enter', { code: 'Enter', ctrlKey: true });
  assert(editor.querySelectorAll('thead tr').length === 1 && editor.querySelectorAll('tbody tr').length === 4, 'Header insertion did not route to tbody');
  key('Backspace', { code: 'Backspace', ctrlKey: true, shiftKey: true });

  place(editor.querySelector('tbody td:first-child'));
  const toolbar = document.querySelector('#tableToolbar');
  assert(!toolbar.classList.contains('hidden'), 'Table toolbar was not displayed');
  toolbar.querySelector('[data-table-action="column-after"]').click();
  assert([...editor.querySelectorAll('tr')].every(row => row.cells.length === 4), 'Toolbar did not add a full column');
  toolbar.querySelector('[data-table-action="align-center"]').click();
  assert([...editor.querySelectorAll('tr')].every(row => row.cells[1].getAttribute('align') === 'center'), 'Alignment did not follow the active inserted column');

  document.querySelector('#tableRows').value = '2';
  document.querySelector('#tableColumns').value = '3';
  toolbar.querySelector('[data-table-action="resize"]').click();
  assert(editor.querySelectorAll('tbody tr').length === 2 && [...editor.querySelectorAll('tr')].every(row => row.cells.length === 3), 'Resize did not produce the requested dimensions');

  place(editor.querySelector('tbody td:nth-child(3)'));
  editor.querySelector('tbody td:nth-child(3)').dispatchEvent(new MouseEvent('contextmenu', { clientX: 200, clientY: 200, bubbles: true, cancelable: true }));
  assert([...document.querySelectorAll('#contextMenu button')].some(button => button.dataset.action === 'table-column-delete'), 'Context menu lacks column operations');
  document.querySelector('#contextMenu [data-action="table-column-delete"]').click();
  assert([...editor.querySelectorAll('tr')].every(row => row.cells.length === 2), 'Context menu did not delete the active column');

  place(editor.querySelector('tbody td:first-child'));
  const clipboardData = { getData: type => type === 'text/plain' ? '\\u7532\\t10\\n\\u4e59\\t20' : '' };
  const pasteEvent = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(pasteEvent, 'clipboardData', { value: clipboardData }); editor.dispatchEvent(pasteEvent);
  assert(editor.querySelector('tbody tr:first-child td:first-child').textContent === '\\u7532' && editor.querySelector('tbody tr:nth-child(2) td:nth-child(2)').textContent === '20', 'Spreadsheet matrix paste did not fill cells');

  place(editor.querySelector('tbody td:first-child'));
  key('e', { code: 'KeyE', ctrlKey: true }); assert(!getSelection().isCollapsed, 'Ctrl+E did not select the current cell');
  place(editor.querySelector('tbody td:first-child'));
  key('l', { code: 'KeyL', ctrlKey: true }); assert(!getSelection().isCollapsed, 'Ctrl+L did not select the current row');

  place(editor.querySelector('tbody td:first-child'));
  document.querySelector('#sourceModeBtn').click(); await wait(80);
  const source = document.querySelector('#sourceEditor').value;
  assert(source.includes(':-:'), 'Centered column alignment was not persisted: ' + source);
  assert(!source.includes('  \\n |'), 'Empty table placeholders leaked line breaks: ' + source);
  assert(source.includes('| Name |') && source.includes('| \\u7532 |'), 'Table content was not persisted: ' + source);
  assert(document.querySelector('#tableToolbar').classList.contains('hidden'), 'Table toolbar remained visible in source mode');
  return { tabNavigation: true, tabAppend: true, rowShortcuts: true, headerSafety: true, toolbar: true, columnOperations: true, resize: true, contextMenu: true, matrixPaste: true, selectionShortcuts: true, alignmentMarkdown: true };
})()`);

Object.assign(result, await evaluate(`(async()=>{
  const wait=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,m)=>{if(!v)throw new Error(m)};
  document.querySelector('#newBtn').click();await wait(50);
  if(!document.querySelector('#sourceEditor').classList.contains('hidden')){document.querySelector('#sourceModeBtn').click();await wait(70)}
  const editor=document.querySelector('#wysiwyg'),pane=document.querySelector('#editorPane'),bar=document.querySelector('#tableToolbar'),format=document.querySelector('#selectionToolbar');
  editor.innerHTML='<table><thead><tr><th>Header</th></tr></thead><tbody>'+Array.from({length:80},(_,i)=>'<tr><td>Row '+i+'</td></tr>').join('')+'</tbody></table>'+Array.from({length:100},()=>'<p>After table</p>').join('');
  editor.dispatchEvent(new Event('input',{bubbles:true}));
  const cell=editor.querySelectorAll('td')[70];editor.focus({preventScroll:true});
  const r=document.createRange();r.selectNodeContents(cell);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);
  cell.scrollIntoView({block:'center',behavior:'instant'});await wait(100);
  const inside=e=>{const a=e.getBoundingClientRect(),b=pane.getBoundingClientRect();return a.top>=b.top+7&&a.bottom<=b.bottom-7&&a.left>=b.left+7&&a.right<=b.right-7};
  assert(!bar.classList.contains('hidden')&&inside(bar),'Scrolled table toolbar overlaps app chrome or is clipped');
  const tableRect=editor.querySelector('table').getBoundingClientRect(),paneRect=pane.getBoundingClientRect(),barRect=bar.getBoundingClientRect();
  const center=(Math.max(paneRect.left+8,tableRect.left)+Math.min(paneRect.right-8,tableRect.right))/2;
  const expected=Math.max(paneRect.left+8,Math.min(paneRect.right-8-barRect.width,center-barRect.width/2));
  assert(Math.abs(barRect.left-expected)<2,'Table toolbar is not horizontally centered');
  pane.scrollTo({top:pane.scrollHeight,behavior:'instant'});await wait(100);
  assert(bar.classList.contains('hidden'),'Offscreen table toolbar stayed visible');
  cell.scrollIntoView({block:'center',behavior:'instant'});await wait(100);
  assert(!bar.classList.contains('hidden')&&inside(bar),'Table toolbar did not follow scrolling');
  r.selectNodeContents(cell);getSelection().removeAllRanges();getSelection().addRange(r);await wait(80);
  assert(bar.classList.contains('hidden')&&!format.classList.contains('hidden')&&inside(format),'Selection/table toolbars collide or leave editor bounds');
  document.querySelector('#collapseSidebarBtn').click();await wait(250);
  assert(inside(format),'Toolbar did not follow editor viewport resize');
  return {toolbarEditorBounds:true,tableCentered:true,scrollUpdates:true,offscreenHidden:true,selectionExclusivity:true,sidebarResize:true};
})()`));
socket.close();
console.log(JSON.stringify(result));
