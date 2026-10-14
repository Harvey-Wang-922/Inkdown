import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import net from 'node:net';

const root = fileURLToPath(new URL('../', import.meta.url));
const mode = process.argv[2];
if (!['source', 'packaged'].includes(mode)) throw new Error('Usage: run-cdp-suite.mjs source|packaged');
const executable = path.join(root, mode === 'source' ? 'node_modules/electron/dist/electron.exe' : 'release/win-unpacked/Inkdown.exe');
const baseArgs = mode === 'source' ? [root] : [];
const profiles = path.join(root, '.test-profiles');
await mkdir(profiles, { recursive: true });
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const usedPorts = new Set();

async function reservePort() {
  for (;;) {
    const server = net.createServer();
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    if (!usedPorts.has(port)) { usedPorts.add(port); return port; }
  }
}

function run(file, args, timeout = 90000) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; });
    child.stderr.on('data', chunk => { output += chunk; });
    const timer = setTimeout(() => child.kill(), timeout);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`${path.basename(file)} failed (${code}): ${output}`));
      else resolve(output.trim());
    });
  });
}

async function rendererReady(endpoint) {
  const pages = await (await fetch(`${endpoint}/json`, { signal: AbortSignal.timeout(1500) })).json();
  const page = pages.find(item => item.type === 'page' && item.url.startsWith('file:'));
  if (!page) return false;
  return new Promise(resolve => {
    const socket = new WebSocket(page.webSocketDebuggerUrl);
    const finish = value => { clearTimeout(timer); socket.close(); resolve(value); };
    const timer = setTimeout(() => finish(false), 1500);
    socket.addEventListener('error', () => finish(false), { once: true });
    socket.addEventListener('open', () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: {
      expression: "Boolean(document.readyState === 'complete' && document.querySelector('#newBtn')?.onclick && document.querySelector('#versionLabel')?.textContent)", returnByValue: true
    } })), { once: true });
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (message.id === 1) finish(message.result?.result?.value === true);
    });
  });
}

async function suite(name, initialFiles = []) {
  const profile = await mkdtemp(path.join(profiles, `release-${mode}-`));
  const port = await reservePort();
  const endpoint = `http://127.0.0.1:${port}`;
  const args = [...baseArgs, `--user-data-dir=${profile}`, `--remote-debugging-port=${port}`, ...initialFiles];
  const app = spawn(executable, args, { cwd: root, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let stderr = '';
  let spawnError;
  app.stderr.on('data', chunk => { stderr += chunk; });
  app.on('error', error => { spawnError = error; });
  try {
    const deadline = Date.now() + 20000;
    for (;;) {
      if (spawnError) throw spawnError;
      if (app.exitCode !== null) throw new Error(`Application exited: ${stderr}`);
      if (await rendererReady(endpoint).catch(() => false)) break;
      if (Date.now() > deadline) throw new Error(`Renderer did not become ready: ${stderr}`);
      await delay(100);
    }
    const test = path.join(root, 'tests', `${name}.mjs`);
    const extraArgs = name === 'cdp-source-range-recovery-test' ? [mode, profile] : initialFiles.map(file => path.basename(file));
    console.log(`${mode} ${name}: ${await run(process.execPath, [test, endpoint, ...extraArgs])}`);
    if (name === 'cdp-app-menu-test') console.log(await run(process.execPath, [path.join(root, 'tests/cdp-interface-snapshot.mjs'), endpoint, mode]));
    if (initialFiles.length) {
      const second = path.join(root, 'tests/fixtures/source-preservation.md');
      await run(executable, [...baseArgs, `--user-data-dir=${profile}`, second], 15000);
      console.log(`${mode} second-instance: ${await run(process.execPath, [test, endpoint, ...[...initialFiles, second].map(file => path.basename(file))])}`);
    }
  } finally {
    if (app.pid && app.exitCode === null) {
      await run('taskkill.exe', ['/PID', String(app.pid), '/T', '/F'], 10000);
    }
    const resolved = path.resolve(profile);
    if (!resolved.startsWith(`${path.resolve(profiles)}${path.sep}`)) throw new Error('Unsafe test profile cleanup path');
    await rm(resolved, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
}

const suites = [
  'cdp-new-document-latency-test', 'cdp-tab-list-test', 'cdp-user-style-test',
  'cdp-app-menu-test', 'cdp-search-test', 'cdp-search-navigation-test', 'cdp-table-editing-test', 'cdp-paste-test', 'cdp-security-test', 'cdp-manual-save-test', 'cdp-source-range-recovery-test'
];
const requested = process.argv[3];
if (requested && !suites.includes(requested)) throw new Error(`Unknown suite: ${requested}`);
for (const name of requested ? [requested] : suites) await suite(name);
if (!requested) await suite('cdp-external-open-test', [path.join(root, 'tests/fixtures/startup-session.md')]);
console.log(`${mode}: ${requested || `all ${suites.length + 1} CDP suites`} passed`);
