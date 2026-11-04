import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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

const initial = await evaluate(`window.inkdown.loadUserStyle()`);
if (!initial.path.endsWith('markdown-style.json') || !initial.cssPath.endsWith('custom.css') || !Array.isArray(initial.config?.unorderedMarkers))
  throw new Error(`运行时样式配置未创建：${JSON.stringify(initial)}`);
if (initial.installedConfig && !initial.path.includes('win-unpacked\\config\\markdown-style.json'))
  throw new Error(`打包版配置没有位于安装目录：${JSON.stringify(initial)}`);
const originalConfig = await readFile(initial.path, 'utf8');
const originalCss = await readFile(initial.cssPath, 'utf8');
try {
  console.log(JSON.stringify(await evaluate(`(async()=>{
    const assert=(v,m)=>{if(!v)throw new Error(m)};
    const waitFor=async check=>{for(let i=0;i<150;i++){if(check())return;await new Promise(r=>setTimeout(r,20))}throw new Error('Theme readiness timeout')};
    const editor=document.querySelector('#wysiwyg'),source=document.querySelector('#sourceEditor');
    const before=editor.innerHTML,sourceBefore=source.value;
    document.querySelector('[data-action="settings"]').click();
    const select=document.querySelector('#settingTheme');
    const set=value=>{select.value=value;select.dispatchEvent(new Event('input',{bubbles:true}))};
    set('dark');await waitFor(()=>getComputedStyle(document.documentElement).colorScheme==='dark');
    assert(document.body.classList.contains('theme-dark'),'Dark class missing');
    await waitFor(()=>matchMedia('(prefers-color-scheme: dark)').matches);
    const scrollbar=getComputedStyle(document.querySelector('#editorPane')).scrollbarColor;
    assert(scrollbar.includes('rgb(115, 119, 128)')&&scrollbar.includes('rgb(29, 30, 32)'),'Scrollbar retained light palette: '+scrollbar);
    assert(getComputedStyle(document.querySelector('#settingTheme')).colorScheme==='dark','Select did not inherit dark controls');
    set('light');await waitFor(()=>getComputedStyle(document.documentElement).colorScheme==='light'&&!document.body.classList.contains('theme-dark'));
    set('sepia');await waitFor(()=>document.body.classList.contains('theme-sepia'));
    assert(!matchMedia('(prefers-color-scheme: dark)').matches,'Sepia forced native dark theme');
    set('dark');set('light');set('dark');await waitFor(()=>document.body.classList.contains('theme-dark')&&getComputedStyle(document.documentElement).colorScheme==='dark');
    set('system');const resolved=await window.inkdown.setTheme('system');
    await waitFor(()=>document.body.classList.contains('theme-dark')===(resolved==='dark'));
    let rejected=false;try{await window.inkdown.setTheme('invalid')}catch{rejected=true}assert(rejected,'Invalid native theme accepted');
    assert(editor.innerHTML===before&&source.value===sourceBefore,'Theme changed document projection/source');
    set('light');await waitFor(()=>getComputedStyle(document.documentElement).colorScheme==='light');
    document.querySelector('#settingsDone').click();
    return {darkScrollbar:true,nativeThemeSynced:true,controlColorScheme:true,rapidThemeSwitch:true,systemTheme:true,invalidThemeRejected:true,themeSourceUnchanged:true};
  })()`)));
  await evaluate(`(async()=>{
    document.querySelector('#newBtn').click();
    const source=document.querySelector('#sourceEditor'),mode=document.querySelector('#sourceModeBtn');
    if(source.classList.contains('hidden'))mode.click();
    source.value='# 深色主题\\n\\n'+Array.from({length:50},(_,i)=>'段落 '+i+' **强调文字** 与 \\x60inline code\\x60。').join('\\n\\n');
    source.dispatchEvent(new Event('input',{bubbles:true}));mode.click();
    document.querySelector('[data-action="settings"]').click();
    const theme=document.querySelector('#settingTheme');theme.value='dark';theme.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#settingsDone').click();
    for(let i=0;i<100;i++){if(document.querySelector('#wysiwyg h1')&&getComputedStyle(document.documentElement).colorScheme==='dark')break;await new Promise(r=>setTimeout(r,20))}
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  })()`);
  const screenshot = await command('Page.captureScreenshot', { format: 'png' });
  await mkdir(new URL('../.test-artifacts/', import.meta.url), { recursive: true });
  await writeFile(fileURLToPath(new URL(`../.test-artifacts/theme-${initial.installedConfig ? 'packaged' : 'source'}.png`, import.meta.url)), Buffer.from(screenshot.data, 'base64'));
  await writeFile(initial.path, JSON.stringify({ unorderedMarkers: ['🚀', '🌙', '⭐'], orderedStyles: ['decimal', 'lower-alpha'], headingPrefixes: ['', '', '', '', '', ''], quotePrefix: '' }, null, 2), 'utf8');
  await writeFile(initial.cssPath, ':root{--inkdown-h1-prefix:"📝 ";}', 'utf8');
  const reloaded = await evaluate(`(async()=>{
    document.querySelector('[data-action="reload-user-style"]').click();await new Promise(r=>setTimeout(r,120));
    const nested=(tag,depth,max)=>'<'+tag+'><li><span>L'+depth+'</span>'+(depth<max?nested(tag,depth+1,max):'')+'</li></'+tag+'>';
    const editor=document.querySelector('#wysiwyg');
    editor.innerHTML='<h1>Title</h1>'+nested('ul',1,8)+nested('ol',1,6)+'<ul><li><input type="checkbox"> Task</li></ul>';
    const marker=value=>getComputedStyle(value,'::marker').content.replace(/["']/g,'').trim();
    const unordered=[...editor.querySelectorAll('ul > li')].slice(0,8).map(marker);
    const ordered=[...editor.querySelectorAll('ol')].map(node=>getComputedStyle(node).listStyleType);
    const taskMarker=marker([...editor.querySelectorAll('ul > li')].at(-1));
    const prefix=getComputedStyle(editor.querySelector('h1'),'::before').content.replace(/["']/g,'').trim();
    return {css:document.querySelector('#userStyle').textContent,unordered,ordered,taskMarker,prefix,openAction:Boolean(document.querySelector('[data-action="open-user-style"]'))};
  })()`);
  const expectedMarkers = ['🚀', '🌙', '⭐', '🚀', '🌙', '⭐', '🚀', '🌙'];
  const expectedOrdered = ['decimal', 'lower-alpha', 'decimal', 'lower-alpha', 'decimal', 'lower-alpha'];
  if (!reloaded.css.includes('--inkdown-ul-marker-7:"🚀"') || JSON.stringify(reloaded.unordered) !== JSON.stringify(expectedMarkers)
      || JSON.stringify(reloaded.ordered) !== JSON.stringify(expectedOrdered) || reloaded.taskMarker !== ''
      || reloaded.prefix !== '📝' || !reloaded.openAction) throw new Error(`循环样式重载失败：${JSON.stringify(reloaded)}`);
  console.log(JSON.stringify({ runtimeConfig: true, reload: true, cyclicEmojiMarkers: true, cyclicOrderedStyles: true, markdownPrefixes: true, taskMarkerIsolated: true }));
} finally {
  await writeFile(initial.path, originalConfig, 'utf8');
  await writeFile(initial.cssPath, originalCss, 'utf8');
  await evaluate(`document.querySelector('[data-action="reload-user-style"]').click()`);
  socket.close();
}
