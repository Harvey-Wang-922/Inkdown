const endpoint = process.argv[2] || 'http://127.0.0.1:9376';
const pages = await (await fetch(`${endpoint}/json`)).json();
const page = pages.find(item => item.type === 'page');
if (!page) throw new Error('找不到 Inkdown 页面');

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
  const wait = () => new Promise(resolve => setTimeout(resolve, 50));
  const titles = [...document.querySelectorAll('.app-menu-title')];
  const groups = [...document.querySelectorAll('.app-menu-group')];
  const open = () => groups.map(group => group.classList.contains('open'));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  assert(titles.map(title => title.textContent).join(',') === '文件,编辑,段落,格式,视图,帮助', '菜单标题不完整');
  titles[0].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); await wait();
  assert(open().every(value => !value), '悬停不应打开菜单');
  titles[0].click(); await wait(); assert(open()[0] && open().filter(Boolean).length === 1, '点击文件应只打开文件菜单');
  titles[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true })); await wait();
  assert(open()[0] && !open()[1], '悬停编辑不应切换菜单');
  titles[1].click(); await wait(); assert(!open()[0] && open()[1], '点击编辑应切换菜单');
  titles[1].click(); await wait(); assert(open().every(value => !value), '再次点击应关闭菜单');
  titles[2].click(); await wait(); document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); await wait();
  assert(open().every(value => !value), '点击菜单外部应关闭菜单');
  const beforeTabs = document.querySelectorAll('.tab').length;
  titles[0].click(); await wait(); document.querySelector('.app-menu-item[data-action="new"]').click(); await wait();
  assert(document.querySelectorAll('.tab').length === beforeTabs + 1, '菜单项没有执行对应功能');
  assert(open().every(value => !value), '执行菜单项后应关闭菜单');
  return { titles: titles.length, hoverOpens: false, clickSwitches: true, outsideCloses: true, actionRuns: true };
})()`);

Object.assign(result, await evaluate(`(async()=>{
  const [{DocumentStore},{DocumentTransactionGate},{DocumentHistory}]=await Promise.all([
    import('./core/document-store.js'),import('./core/document-transaction-gate.js'),import('./core/document-history.js')
  ]);
  const store=new DocumentStore(),first=store.create({name:'A',path:'C:/A.md',content:'old',dirty:true}),second=store.create({name:'B'},false);
  const next=store.adjacentId(1),activeStayed=store.activeId===first.id,session=store.serializeSession(null);
  let current=first,mode=false,epoch=7;const gate=new DocumentTransactionGate(()=>current,()=>mode,()=>epoch),transaction=gate.capture();epoch++;
  const projectionInvalidated=!gate.isCurrent(transaction)&&gate.isCurrent(transaction,{projection:false});
  const history=new DocumentHistory();history.ensure(first,'old');first.content='new';history.schedule(first,()=>first.content);const immediateUndo=history.restore(first,-1)==='old';history.cancel(first);
  return {pureNextId:next===second.id&&activeStayed,dirtyRecoverySnapshot:session.dirtyFiles?.[0]?.content==='old',projectionEpochGuard:projectionInvalidated,immediateHistory:immediateUndo};
})()`));
if(!result.pureNextId||!result.dirtyRecoverySnapshot||!result.projectionEpochGuard||!result.immediateHistory)throw new Error('核心模型架构回归失败：'+JSON.stringify(result));

Object.assign(result, await evaluate(`(async()=>{
  const source=document.querySelector('#sourceEditor'),button=document.querySelector('#sourceModeBtn');
  if(source.classList.contains('hidden')){button.click();await new Promise(r=>setTimeout(r,80));}
  const invoke=code=>document.dispatchEvent(new KeyboardEvent('keydown',{code,key:code,ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}));
  source.value='';source.setSelectionRange(0,0);invoke('BracketLeft');const ordered=source.value;
  source.value='';source.setSelectionRange(0,0);invoke('BracketRight');const unordered=source.value;
  source.value='';source.setSelectionRange(0,0);invoke('KeyX');const task=source.value;
  return {declaredListShortcuts:ordered==='1. '&&unordered==='- '&&task==='- [ ] '};
})()`));
if(!result.declaredListShortcuts)throw new Error('菜单声明的列表快捷键没有进入统一命令入口');

Object.assign(result, await evaluate(`(async()=>{
  const {COMMANDS,resolveKeyboardAction}=await import('./core/command-registry.js');
  const {loadSettings}=await import('./core/document-store.js');
  const previous=localStorage.getItem('inkdown.settings');
  localStorage.setItem('inkdown.settings',JSON.stringify({...loadSettings(),typewriterCenter:true}));
  const legacyIgnored=!('typewriterCenter' in loadSettings());
  if(previous===null)localStorage.removeItem('inkdown.settings');else localStorage.setItem('inkdown.settings',previous);
  const absent=!document.querySelector('#typewriterBtn,[data-action="typewriter-mode"]')&&!COMMANDS.some(c=>c.action==='typewriter-mode')&&resolveKeyboardAction({code:'F9'})===null;
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'F9',code:'F9',bubbles:true,cancelable:true}));
  const f9Inactive=!document.body.classList.contains('typewriter-mode');
  const before=document.body.classList.contains('focus-mode');
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'F8',code:'F8',bubbles:true,cancelable:true}));
  const focusWorks=document.body.classList.contains('focus-mode')!==before&&Boolean(document.querySelector('#focusBtn'));
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'F8',code:'F8',bubbles:true,cancelable:true}));
  if(!absent||!legacyIgnored||!f9Inactive||!focusWorks)throw new Error('模式删除/专注保留回归失败');
  return {typewriterRemoved:true,legacyModeSettingsIgnored:true,focusModeRetained:true};
})()`));
Object.assign(result, await evaluate(`(async()=>{
  document.querySelector('#newBtn').click();await new Promise(r=>setTimeout(r,60));
  const source=document.querySelector('#sourceEditor'),mode=document.querySelector('#sourceModeBtn');
  if(source.classList.contains('hidden')){mode.click();await new Promise(r=>setTimeout(r,60))}
  source.value='# 简洁界面\\n\\n正文与统计。';source.dispatchEvent(new Event('input',{bubbles:true}));
  mode.click();await new Promise(r=>setTimeout(r,100));
  const stats=document.querySelector('#statusStats'),panel=document.querySelector('#documentStats');
  const compact=/^\\d+ 字$/.test(stats.textContent)&&!document.querySelector('#statusbar #versionLabel,#statusName,#modeLabel,#newSideBtn,#quickOpenBtn,#openBtn');
  stats.click();
  const details=panel.open&&document.querySelector('#statusDetails').textContent.includes('3 行')&&document.querySelector('#settingsModal').classList.contains('hidden');
  document.querySelector('#wysiwyg').dispatchEvent(new MouseEvent('mousedown',{bubbles:true}));
  const dismissed=!panel.open;
  if(!compact||!details||!dismissed)throw new Error('精简界面/按需统计回归失败');
  return {compactChrome:true,onDemandStatistics:true};
})()`));
console.log(JSON.stringify(result));
socket.close();
