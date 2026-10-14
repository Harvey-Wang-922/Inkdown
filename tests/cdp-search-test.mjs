const endpoint = process.argv[2] || 'http://127.0.0.1:9381';
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

const result = await evaluate(`(async()=>{
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const assert=(condition,message)=>{if(!condition)throw new Error(message)};
  document.querySelector('#newBtn').click();await wait(60);
  const source=document.querySelector('#sourceEditor'),mode=document.querySelector('#sourceModeBtn');
  if(source.classList.contains('hidden')){mode.click();await wait(40)}
  source.value='first target\\n\\nsecond target\\n\\nthird target';source.dispatchEvent(new Event('input',{bubbles:true}));
  mode.click();await wait(100);
  document.dispatchEvent(new KeyboardEvent('keydown',{key:'f',code:'KeyF',ctrlKey:true,bubbles:true,cancelable:true}));
  const input=document.querySelector('#findInput'),next=document.querySelector('#findNext'),previous=document.querySelector('#findPrev'),count=document.querySelector('#findCount');
  input.value='target';input.dispatchEvent(new Event('input',{bubbles:true}));
  const highlighted=CSS.highlights?.get('inkdown-find-match')?.size||0;
  assert(highlighted===3,'输入关键词后没有高亮全部匹配项：'+JSON.stringify({highlighted,count:count.textContent,highlightApi:typeof Highlight,keys:CSS.highlights?[...CSS.highlights.keys()]:[]}));
  const currentRange=()=>[...(CSS.highlights?.get('inkdown-find-current')||[])][0]||null;
  const selectedBlock=()=>currentRange()?.startContainer?.parentElement?.closest('p')?.textContent||'';
  const sequence=[];
  for(let index=0;index<4;index++){next.click();await wait(20);sequence.push({text:currentRange()?.toString()||'',block:selectedBlock(),count:count.textContent})}
  previous.click();await wait(20);const backwards={text:currentRange()?.toString()||'',block:selectedBlock(),count:count.textContent};
  assert(sequence.map(item=>item.block).join('|')==='first target|second target|third target|first target','下一个没有按文档顺序循环：'+JSON.stringify(sequence));
  assert(sequence.every(item=>item.text==='target'),'查找选择区没有精确选中关键词：'+JSON.stringify(sequence));
  assert(sequence.map(item=>item.count).join('|')==='1/3|2/3|3/3|1/3','查找计数没有随当前结果更新：'+JSON.stringify(sequence));
  assert(backwards.block==='third target'&&backwards.count==='3/3','上一个没有从首项循环到末项：'+JSON.stringify(backwards));
  input.value='missing';input.dispatchEvent(new Event('input',{bubbles:true}));
  assert(count.textContent==='0/0'&&document.querySelector('#findbar').classList.contains('no-results'),'无结果状态没有明确反馈');
  document.querySelector('#findClose').click();
  assert(!CSS.highlights?.has('inkdown-find-match')&&!CSS.highlights?.has('inkdown-find-current'),'关闭查找后仍残留高亮');
  return {nextSequence:sequence.map(item=>item.count),previousWrap:backwards.count,highlighted,emptyState:true,editorScoped:true};
})()`);
console.log(JSON.stringify(result));
socket.close();
