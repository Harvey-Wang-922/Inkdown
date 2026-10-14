const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const builderRequire = createRequire(require.resolve('electron-builder'));
const libraryRequire = createRequire(builderRequire.resolve('app-builder-lib'));
const asar = libraryRequire('@electron/asar');
const root = path.resolve(__dirname, '..');
const directory = path.join(root, 'release/win-unpacked');
const archive = path.join(directory, 'resources/app.asar');
const entries = asar.listPackage(archive).map(name => name.slice(1));
const files = entries.filter(name => !asar.statFile(archive, name).files);
const normalized = files.map(name => name.replaceAll('\\', '/'));
for (const name of normalized) {
  assert.ok(!/\.(map|ts|tsx|cts|mts)$/.test(name), `Development artifact shipped: ${name}`);
  assert.ok(!/\/(test|tests|__tests__|example|examples|docs|coverage|\.yarn|\.github)\//.test(name), `Tooling/fixture shipped: ${name}`);
  assert.ok(!/node_modules\/docx\/dist\/index\.(iife\.js|umd\.cjs|mjs)$/.test(name), `Duplicate DOCX build shipped: ${name}`);
  assert.ok(!/node_modules\/mammoth\/mammoth\.browser/.test(name), `Duplicate Mammoth browser build shipped: ${name}`);
  assert.ok(!/node_modules\/(jszip|pako|xml-js)\/dist\//.test(name), `Unused browser build shipped: ${name}`);
  assert.ok(!/node_modules\/marked\/lib\/marked\.(esm|umd)\.js$/.test(name), `Unused Marked build shipped: ${name}`);
  assert.ok(!/node_modules\/underscore\/underscore(-min|-umd|-umd-min|-esm|-esm-min)?\.js$/.test(name), `Unused Underscore build shipped: ${name}`);
}
for (const name of ['src/main.js', 'src/preload.js', 'src/assets/custom.css', 'src/assets/markdown-style.json',
  'node_modules/docx/dist/index.cjs', 'node_modules/mammoth/lib/index.js', 'node_modules/jszip/lib/index.js',
  'node_modules/turndown/dist/turndown.js', 'node_modules/turndown-plugin-gfm/dist/turndown-plugin-gfm.js',
  'node_modules/marked/lib/marked.cjs', 'node_modules/underscore/underscore-node.cjs', 'node_modules/underscore/underscore-node-f.cjs']) {
  assert.ok(normalized.includes(name), `Required runtime resource missing: ${name}`);
}
const locales = fs.readdirSync(path.join(directory, 'locales')).sort();
assert.deepEqual(locales, ['en-US.pak', 'zh-CN.pak', 'zh-TW.pak']);
for (const name of ['LICENSE.electron.txt', 'LICENSES.chromium.html', 'icudtl.dat', 'resources.pak', 'ffmpeg.dll',
  'd3dcompiler_47.dll', 'dxcompiler.dll', 'dxil.dll', 'vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll']) {
  assert.ok(fs.existsSync(path.join(directory, name)), `Runtime/license resource missing: ${name}`);
}
assert.ok(normalized.some(name => /node_modules\/docx\/LICENSE/i.test(name)), 'DOCX license missing');
const version = JSON.parse(asar.extractFile(archive, 'package.json')).version;
assert.equal(version, JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version);
console.log(JSON.stringify({ packagedResources: true, locales, version, archiveBytes: fs.statSync(archive).size, files: files.length }));
