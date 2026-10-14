const endpoint = process.argv[2];
const page = (await (await fetch(`${endpoint}/json`)).json()).find(item => item.type === 'page');
const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
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
try {
  console.log(JSON.stringify(await evaluate(`(async()=>{
    const assert=(v,m)=>{if(!v)throw new Error(m)};
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const csp=document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content;
    assert(csp?.includes("script-src 'self'")&&csp.includes("connect-src 'none'"),'CSP缺失');
    window.securityInlineExecuted=false;
    const script=document.createElement('script');script.textContent='window.securityInlineExecuted=true';document.body.append(script);await wait(30);script.remove();
    assert(!window.securityInlineExecuted,'内联脚本执行未被阻止');
    let networkBlocked=false;try{await fetch('https://example.com/inkdown-security-probe')}catch{networkBlocked=true}
    assert(networkBlocked,'页面可以未经授权联网');
    assert(await Notification.requestPermission()==='denied','通知权限未默认拒绝');
    const html=await window.inkdown.renderMarkdown('<script>window.attack=true</script><img src="x" onerror="window.attack=true"><iframe src="https://example.com"></iframe><a href="javascript:alert(1)">bad</a>');
    assert(!/<script|<iframe|onerror|javascript:/i.test(html),'不安全HTML穿过清理层');
    document.querySelector('#newBtn').click();await wait(60);
    assert(document.querySelector('#wysiwyg p'),'加固后编辑器无法创建文档');
    return {inlineScriptBlocked:true,networkBlocked,permissionDenied:true,sanitizer:true,editorUsable:true};
  })()`)));
} finally { socket.close(); }
