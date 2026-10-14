const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const packageJson = JSON.parse(read('package.json'));
const readme = read('README.md');
const main = read('src/main.js');
const preload = read('src/preload.js');
const customStyle = read('src/assets/custom.css');
const markdownStyle = JSON.parse(read('src/assets/markdown-style.json'));
const installer = read('build/installer.nsh');
const rendererApp = read('src/renderer/app.js');
for (const file of ['.codex/config.toml', '.codex/README.md', 'docs/ai/README.md',
  'docs/ai/templates/task.md', 'docs/ai/templates/handoff.md', 'src/renderer/core/AGENTS.md',
  'tests/AGENTS.md', 'build/AGENTS.md']) assert.ok(fs.existsSync(path.join(root, file)), `Missing AI development entry: ${file}`);
assert.ok(packageJson.build.files.includes('!src/**/AGENTS.md'), 'Local AI instructions must not ship as runtime files');
assert.doesNotMatch(read('.codex/config.toml'), /^\s*(?:model|model_provider|approval_policy|sandbox_mode|default_permissions)\s*=/m, 'Project AI guide must not override model or permission preferences');
assert.equal(JSON.parse(read('src/renderer/package.json')).type, 'module', 'renderer modules need an explicit ESM boundary');
for (const file of ['src/main.js', 'src/file-formats.js', 'src/renderer/core/markdown-codec.js']) {
  assert.match(read(file), /createMarkdownCodec/, 'conversion entry points must use the shared codec');
  assert.doesNotMatch(read(file), /\.addRule\(/, 'conversion rules must not drift into separate entry points');
}
assert.match(rendererApp, /SourceEditingController/);
assert.match(rendererApp, /VisualSourceTransactions/);
assert.match(rendererApp, /EditorProjectionController/);
assert.doesNotMatch(rendererApp, /els\.wysiwyg\.innerHTML\s*=\s*(?:html|rendered\.html)/, 'Projection installation must stay in its controller');
assert.doesNotMatch(rendererApp, /commitRenderedEdit\(/, 'visual commits must go through the source range boundary');
assert.doesNotMatch(rendererApp, /localStorage\.(?:setItem|getItem)\('inkdown\.session'/, 'recovery storage must use the async boundary');
assert.match(main, /recovery-flush-requested/);
assert.doesNotMatch(rendererApp, /store\.docs\.splice|store\.closed\.shift/, 'tab mutation must stay inside the document store');
for (const file of ['src/renderer/app.js', 'src/renderer/index.html', 'src/renderer/styles.css', 'src/renderer/core/command-registry.js', 'src/renderer/core/document-store.js', 'src/renderer/core/app-menu.js']) {
  assert.doesNotMatch(read(file), /typewriter|打字机/, 'Typewriter mode must be removed from all runtime surfaces');
}
assert.match(read('src/renderer/core/command-registry.js'), /bind\('focus-mode', 'F8'\)/, 'Focus mode must remain available');
assert.doesNotMatch(rendererApp, /scheduleAutoSave|autoSaveTimer|settingAutoSave/, 'Document writes must be manual-only');
assert.doesNotMatch(read('src/renderer/index.html'), /settingAutoSave/, 'Removed autosave must not remain in settings');
assert.doesNotMatch(read('src/renderer/core/document-store.js'), /autoSave/, 'Legacy autosave preferences must not be loaded');
const appMenu = read('src/renderer/core/app-menu.js');
const commandRegistry = read('src/renderer/core/command-registry.js');
const findController = read('src/renderer/core/find-controller.js');
const workspaceSearchModel = read('src/renderer/core/workspace-search-model.js');
const { ExternalOpenCoordinator } = require('../src/services/external-open-coordinator');

assert.equal(packageJson.build.nsis.oneClick, false);
assert.deepEqual(packageJson.build.electronLanguages, ['en-US', 'zh-CN', 'zh-TW'], 'Keep English fallback and both Chinese locales');
assert.ok(packageJson.build.files.includes('!node_modules/**/*.{map,ts,tsx,cts,mts}'), 'Development artifacts must stay outside the installer');
assert.ok(packageJson.build.files.includes('!node_modules/**/{test,tests,__tests__,example,examples,docs,coverage,.yarn,.github}/**/*'), 'Dependency tooling and fixtures must not ship');
assert.ok(!packageJson.build.files.some(pattern => /LICENSE|COPYING|NOTICE/i.test(pattern)), 'Do not exclude license notices');
assert.deepEqual(packageJson.build.electronFuses, { runAsNode: false, enableNodeOptionsEnvironmentVariable: false, enableNodeCliInspectArguments: false, enableEmbeddedAsarIntegrityValidation: true, onlyLoadAppFromAsar: true });
assert.match(read('src/renderer/index.html'), /Content-Security-Policy/);
assert.match(main, /sandbox: true/);
assert.match(main, /setPermissionCheckHandler\(\(\) => false\)/);
assert.equal(packageJson.build.nsis.perMachine, false);
assert.equal(packageJson.build.nsis.allowToChangeInstallationDirectory, true);
assert.equal(packageJson.build.nsis.include, 'build/installer.nsh');
assert.deepEqual(packageJson.build.extraResources, [{ from: 'build/markdown-file.ico', to: 'assets/markdown-file.ico' }]);
assert.ok(fs.statSync(path.join(root, 'build/markdown-file.ico')).size > 1000, 'Markdown document icon must be generated');
assert.ok(packageJson.build.files.includes('src/**/*'), 'packaged app must include src/assets/custom.css');
assert.ok(readme.includes('Inkdown-*-Windows-Setup.exe'), 'README must use a version-neutral installer example');
assert.doesNotMatch(readme, /Inkdown-\d+\.\d+\.\d+-Windows-Setup\.exe|当前版本为\s*\d/, 'README must not advertise an application version');
const documentationFiles = ['README.md', 'AGENTS.md', 'build/AGENTS.md', 'tests/AGENTS.md',
  'src/renderer/core/AGENTS.md', '.codex/README.md'];
function collectDocumentation(directory) {
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const file = `${directory}/${entry.name}`;
    if (entry.isDirectory()) collectDocumentation(file);
    else if (entry.name.endsWith('.md')) documentationFiles.push(file);
  }
}
collectDocumentation('docs');
for (const file of documentationFiles) assert.doesNotMatch(read(file),
  /Inkdown[- ]\d+\.\d+(?:\.\d+)?|^Current source version:|^##\s+\d+\.\d+\.\d+|\b(?:in|Since|from)\s+2\.0\.\d+/m,
  `Project documentation must remain application-version-neutral: ${file}`);
assert.match(rendererApp, /commandPaletteItems, resolveKeyboardAction/);
assert.match(appMenu, /commandItem as item/);
assert.doesNotMatch(rendererApp, /const commands\s*=\s*\[/, 'command palette metadata must not be duplicated in app.js');
assert.doesNotMatch(rendererApp, /else if \(ctrl && .*code ===/, 'global keyboard routing must not grow another conditional shortcut chain');
assert.match(commandRegistry, /export function resolveKeyboardAction/);
assert.match(rendererApp, /SessionRestoreCoordinator/);
assert.doesNotMatch(rendererApp, /Promise\.all\(\(session\.paths/, 'app.js must not restore every path with unbounded Promise.all');
assert.match(rendererApp, /onActive:\s*async/, 'the active restored document must project before background tabs finish');
assert.match(rendererApp, /if \(!earlyActive\) await renderActive\(\)/, 'background restore completion must not overwrite an already editable projection');
assert.match(rendererApp, /EditorFindController/);
assert.doesNotMatch(rendererApp, /window\.find\(/, 'editor search must never fall back to browser-global window.find');
assert.match(findController, /class EditorFindController/);
assert.match(workspaceSearchModel, /class WorkspaceSearchCoordinator/);
assert.match(main, /WorkspaceSearchService/);

assert.equal(/ipcMain\.handle\(\s*['"]/.test(main), false, 'channels must use the trusted IPC registrar');
const registeredChannels = new Set([...main.matchAll(/handleTrusted\('([^']+)'/g)].map(match => match[1]));
const exposedChannels = new Set([...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map(match => match[1]));
for (const channel of exposedChannels) assert.ok(registeredChannels.has(channel), `missing trusted handler for ${channel}`);
assert.match(preload, /onExternalOpenPathsAvailable/);
assert.match(main, /requestSingleInstanceLock\(\)/);
assert.match(main, /second-instance/);
assert.match(installer, /customPageAfterChangeDir/);
assert.match(installer, /将 Inkdown 配置为 Markdown 文件的默认打开程序/);
for (const extension of ['md', 'markdown', 'mdown', 'mkd', 'mkdn']) {
  assert.match(installer, new RegExp(`InkdownProgId \\"${extension}\\"`));
}
assert.match(installer, /Software\\RegisteredApplications/);
assert.match(installer, /Software\\Classes\\Applications\\Inkdown\.exe/);
assert.match(installer, /ApplicationDescription/);
assert.match(installer, /resources\\assets\\markdown-file\.ico/);
assert.doesNotMatch(installer, /ExecShell|ms-settings:/i, 'installation must not automatically launch system settings');
assert.match(installer, /安装后不会自动打开系统设置/, 'association page must explain manual Windows confirmation');
assert.doesNotMatch(installer, /WriteReg\w+[^\r\n]*UserChoice/i, 'installer must not bypass protected Windows defaults');
assert.match(installer, /InkdownMigrateLegacyExtension/);
assert.match(installer, /\$\{IfNot\} \$\{Silent\}[\s\S]*InkdownSetDefault/,
  'silent upgrades must preserve the existing association choice');
assert.match(installer, /customUnInstall[\s\S]*\$\{IfNot\} \$\{isUpdated\}/,
  'upgrade uninstall must preserve existing associations');
assert.doesNotMatch(installer, /taskkill/i, 'installer customization must not terminate every Inkdown process');
const externalOpen = new ExternalOpenCoordinator(['md', 'markdown']);
externalOpen.enqueue(['--updated', 'C:\\Docs\\one.md', 'C:\\Docs\\ignored.txt', 'C:\\Docs\\one.md']);
assert.deepEqual(externalOpen.take(), [path.resolve('C:\\Docs\\one.md')]);
assert.deepEqual(externalOpen.take(), [], 'external-open queue must drain atomically');
assert.match(main, /USER_STYLE_TEMPLATE_PATH\s*=\s*path\.join\(__dirname, 'assets', 'custom\.css'\)/);
assert.match(main, /MARKDOWN_STYLE_TEMPLATE_PATH\s*=\s*path\.join\(__dirname, 'assets', 'markdown-style\.json'\)/);
assert.deepEqual(markdownStyle.unorderedMarkers, ['●', '○', '■']);
assert.deepEqual(markdownStyle.orderedStyles, ['decimal', 'lower-alpha', 'lower-roman']);
assert.match(main, /app\.isPackaged[\s\S]*path\.dirname\(app\.getPath\('exe'\)\)[\s\S]*'config'/);

for (const variable of ['ul-marker-1', 'ul-marker-6', 'ol-style-1', 'ol-style-6', 'h1-prefix', 'h6-prefix', 'quote-prefix']) {
  assert.match(customStyle, new RegExp(`--inkdown-${variable}:`));
}
assert.equal(customStyle.split(/\r?\n/).some(line => /^\s*--inkdown-/.test(line)), false,
  'fresh custom.css must not override built-in defaults until the user opts in');

for (const file of ['AGENTS.md', 'docs/ARCHITECTURE.md', 'docs/PROJECT_STATE.md']) {
  assert.ok(fs.statSync(path.join(root, file)).isFile(), `${file} must exist for the next session`);
}

console.log(JSON.stringify({
  assistedInstaller: true,
  trustedIpcChannels: exposedChannels.size,
  externalStyleTemplate: true, cyclicStyleConfig: true,
  handoffDocs: true, commandRegistry: true, editorFindNavigation: true, workspaceSearchCoordination: true,
  boundedSessionRestore: true, progressiveSessionRestore: true
}));
