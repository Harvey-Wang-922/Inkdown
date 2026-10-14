const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
(async () => {
  const root = path.resolve(__dirname, '..');
  const profiles = path.join(root, '.test-profiles'); await fs.mkdir(profiles, { recursive: true });
  const profile = await fs.mkdtemp(path.join(profiles, 'pdf-runtime-'));
  try {
    const code = await new Promise((resolve, reject) => {
      const child = spawn(path.join(root, 'node_modules/electron/dist/electron.exe'), [path.join(__dirname, 'electron-export-runtime-test.cjs'), `--user-data-dir=${profile}`, ...process.argv.slice(2)], { cwd: root, windowsHide: true, stdio: 'inherit' });
      const timer = setTimeout(() => { if (child.pid) spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }); }, 30000);
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('close', code => { clearTimeout(timer); resolve(code); });
    });
    if (code !== 0) throw new Error(`PDF runtime test failed: ${code}`);
  } finally {
    if (!path.resolve(profile).startsWith(profiles + path.sep)) throw new Error('Unsafe test profile cleanup');
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
