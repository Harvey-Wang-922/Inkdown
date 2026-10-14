const endpoint = process.argv[2];
const expectedNames = process.argv.slice(3);
if (!endpoint || !expectedNames.length) throw new Error('Usage: cdp-external-open-test.mjs <endpoint> <file-name> [...]');

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
  socket.send(JSON.stringify({ id: requestId, method: 'Runtime.evaluate', params: { expression, returnByValue: true } }));
});

const deadline = Date.now() + 8000;
let result;
do {
  result = await evaluate(`(() => ({
    names: [...document.querySelectorAll('.tab-name')].map(node => node.textContent),
    active: document.querySelector('.tab.active .tab-name')?.textContent || null,
    visible: !document.querySelector('#editorPane').classList.contains('hidden')
  }))()`);
  if (expectedNames.every(name => result.names.includes(name)) && result.active === expectedNames.at(-1) && result.visible) break;
  await new Promise(resolve => setTimeout(resolve, 100));
} while (Date.now() < deadline);

socket.close();
if (!expectedNames.every(name => result.names.includes(name))) throw new Error(`Missing shell-open document: ${JSON.stringify(result)}`);
if (result.active !== expectedNames.at(-1)) throw new Error(`Newest shell-open document is not active: ${JSON.stringify(result)}`);
if (!result.visible) throw new Error(`Shell-open document has no visible editor: ${JSON.stringify(result)}`);
console.log(JSON.stringify({ singleInstanceShellOpen: true, names: result.names, active: result.active }));
