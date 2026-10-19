# Inkdown architecture and project state

Last updated: 2026-10-14  
Workspace: `D:\workspace\Inkdown`

## 1. Product shape

Inkdown is an Electron 44 Windows application intended to work completely offline after installation. It provides a single Typora-style visual editor, a source mode, tabs, a file tree, outline/search, import/export, source-only history, and an assisted NSIS installer that allows a custom installation directory.

The current packaged artifact is generated as:

`release/Inkdown-*-Windows-Setup.exe`

`release/win-unpacked/Inkdown.exe` is used for packaged regression testing.

## 2. Runtime boundaries

### Main process

`src/main.js` owns native windows, dialogs, filesystem access, imports, clipboard IPC, custom CSS persistence, and export dispatch. `services/markdown-render-service.js` owns Markdown-to-HTML projection and its sanitizer, exposing only safe rendering and clipboard sanitization entry points. Renderer code cannot access Node directly.

The main window cannot navigate away from the packaged local renderer. New windows are denied and supported external links are handed to the system browser. Every IPC handler is registered through `handleTrusted()`, which accepts only the current main window's local top-level frame; adding a preload method therefore also requires a matching trusted handler.

`src/services/export-service.js` owns Markdown/text/HTML/PDF/DOCX export. `src/file-formats.js` owns import detection and conversion.

`local-image-policy.js` bounds automatic export embedding to real files inside the document directory (including its assets subdirectories), rejecting traversal and symlink/junction escapes. Only PNG/JPEG/GIF/WebP with matching signatures are embedded, at most 16 MiB per image and 64 MiB per export, including repeated references. Unsupported/blocked images lose their source reference and receive an explanatory alt label; they are never silently embedded as generic binary data. SVG and out-of-directory images must be converted/copied into supported in-directory images before export. Data images follow the same MIME/signature/size limits. HTML exports preserve HTTPS image references but forbid scripts and local image loads using their own CSP. PDF printing uses a fresh in-memory partition, sandbox/isolation, denied permissions/navigation/popups, and request filtering permitting only its own temporary HTML and data URLs; remote images are not fetched during printing. Temporary HTML is removed on success/failure.

The renderer has a restrictive CSP: packaged scripts only, no eval/inline scripts, no fetch/WebSocket connections, frames/objects/forms/base changes blocked. Inline styles are permitted for trusted user CSS and existing geometry/UI operations; local/data/blob/HTTPS images remain supported. HTTP remote images are blocked. Runtime permission checks/requests deny by default, and webview attachment is rejected. Context isolation, sandbox and web security are explicit. These controls do not turn renderer-supplied filesystem paths into capabilities.

### Preload

`src/preload.js` is the explicit IPC surface exposed as `window.inkdown`. New filesystem or shell capability must use a fixed or validated target; do not expose arbitrary read/write paths from renderer input.

Windows shell-open paths are queued in the main process before renderer startup. The renderer atomically drains that queue through trusted IPC before session restoration. A second launch forwards Markdown paths to the existing window through Electron's single-instance event, so file association never creates a competing editor session.

### Renderer

`src/renderer/app.js` coordinates the store, active projection, UI, session restore, menus, settings, and asynchronous operations. Domain-heavy editing behavior lives under `src/renderer/core/`.

The renderer directory has an explicit ESM package boundary; main/services remain CommonJS. Shared dependency-injected modules use .mjs so both environments consume the actual same implementation. Node development requires 22.12 or later for synchronous CommonJS-to-ESM loading; Electron uses its bundled runtime. Unit tests import real renderer modules without copying or rewriting their source into data URLs.

`shared/markdown-codec.mjs` owns Turndown configuration and rules for renderer editing, main-process HTML conversion and file imports. Projection mode retains editable tabs, local-image source paths, TOC, frontmatter, math and footnotes. Import mode deliberately retains its historical delimiters/blank handling and sanitizer rather than silently changing imported documents. Dependency injection supplies each environment's Turndown/GFM implementation; browser/main parity is verified through real IPC fixtures. Saving still consumes source, never this converter on an untouched projection.

`DocumentOpenCoordinator` is the normal file/folder open transaction boundary. File dialogs, recent/file-tree opens, folder dialogs, and shell-open batches capture the navigation revision and active-document transaction (id, source revision, mode, projection). Late results and errors are discarded if another open, an edit, or navigation supersedes them. Open documents are reused without rereading disk; overlapping reads share only their pending I/O promise, and shell-open batches deduplicate paths and read at most four at a time. This does not roll back filesystem operations already performed by the main process.

`WorkspaceSearchPane` owns search debounce, IME composition, loading/error/empty states, grouping, counts, preview DOM, clear action, and keyboard result navigation. The app supplies folder state, the existing query coordinator, navigation, and notifications. Query edits clear old interactive rows immediately; stale completion cannot clear a newer loading state. Display groups use relative paths to distinguish same-named files. Enter in the input runs pending search immediately, then opens the selected/first match; arrows/Home/End move among results and Escape returns to the input.

Application command metadata lives in `command-registry.js`. The app menu, command palette, and global keyboard router consume the same labels and shortcuts. Context-sensitive editing keys such as table Enter/Tab and list Backspace remain inside their editing models so a bubbling event cannot execute the same operation twice.

The File menu exposes a dynamic Open Recent submenu using the same bounded recent metadata as the welcome screen. AppMenu owns generic submenu rendering, viewport-clamped placement, click/hover and arrow-key/Escape navigation; its data provider supplies paths without embedding filesystem logic. Recent records normalize malformed data, deduplicate Windows path spelling and cap entries at twelve. Selecting a record uses the existing guarded openPath/DocumentOpenCoordinator, reuses dirty open tabs and reports missing files without changing the active document. Clearing records affects only inkdown.recent and the welcome list, not files, tabs or recovery snapshots. Names use textContent and full paths are available as tooltips. Resizing closes menus so stale screen coordinates cannot leave a submenu outside the viewport.

The editor chrome is deliberately compact: the sidebar header identifies the workspace/folder rather than duplicating the application logo, tab actions expose new/source/more, and the footer keeps save state, focus toggle and character count. Native details/summary exposes full source statistics on demand and closes on outside click/document change. The version lives in settings, not the footer. Removed duplicate buttons do not remove canonical menu/palette/keyboard commands. This is display-only; document Markdown, custom marker/style configuration, saved preferences and source-statistics counting semantics are unchanged.

Floating table/selection toolbars share floating-toolbar-layout.mjs, which computes top-left screen coordinates within the editor viewport rather than combining fixed window constants with negative CSS transforms. Oversized toolbars use bounded dimensions and internal scrolling; offscreen anchors hide them. The table toolbar appears for a collapsed table caret; an expanded text selection uses only the formatting toolbar. Pane scrolling, window resizing and ResizeObserver geometry changes coalesce into an animation-frame refresh using current selection/mode/projection state. No source commit is performed by toolbar positioning.

Both toolbars center horizontally on the visible part of their anchor, clamped within the editor. Table controls remain above the table when space permits and within the viewport when its header scrolls away; horizontal centering does not place controls over middle-row text.

Editor-local find behavior lives in `find-controller.js`; it indexes only the visual editor or source textarea, owns the current match number, wraps next/previous navigation without relying on browser-global `window.find`, and uses the CSS Custom Highlight API to show every visual-mode match without mutating editable HTML. Workspace search uses a separate `WorkspaceSearchCoordinator`, so each query has a revision and stale results are discarded before UI mutation.

`search-scroll.js` reveals the exact visual text range, including horizontally scrolled code, and measures wrapped textarea text using a temporary noneditable mirror. Reduced-motion preferences disable smooth scrolling. Find state refreshes on edits, projection changes, document switches, and mode switches. Source no-op checks account for textarea newline normalization without rewriting persisted CRLF source.

Workspace search indexes saved source, not visible prose. Results carry source offsets, exact matched text, and a SHA-256 content digest. `SearchResultNavigation` validates the current in-memory document (or a fresh read) before opening anything. Preparation is bound to navigation revision, document id/source revision/mode/projection, and query revision. Only the latest still-current request can commit. Results open explicitly in source mode, mapping CRLF offsets to textarea offsets; changed documents require a fresh search rather than guessing a different occurrence. Open failure leaves the active document alone.

## 3. Authoritative document flow

The intended direction is:

```text
Markdown doc.content
        |
        v
main renderMarkdown + sanitize
        |
        v
temporary editable DOM projection
        |
        v  only after a real visual edit
renderer MarkdownCodec / SourceDocumentEngine
        |
        v
new Markdown doc.content + sourceRevision
```

Save, export, tab changes, session persistence, source-mode changes, and history consume `doc.content`; they do not perform a no-op DOM flush. `SourceDocumentEngine.commitSource()` increments `sourceRevision` and records transaction origin only when source changed.

File reads do not “repair” Markdown syntax. Escaped headings such as `\# literal` and hash text such as `#tag` remain unchanged in `doc.content`; projection compatibility must never rewrite imported source.

`renderProjection` returns sanitized HTML plus verified top-level source spans. It lexes normalized line endings and maps offsets back to original CRLF/CR bytes. Token raw strings must reproduce the source, and every editable DOM child must match the expected block tag before a baseline is accepted. Projection formatting whitespace is removed before canonical editable-block normalization, not serialized as extra source paragraphs.

`VisualSourceTransactions` binds the baseline to document id and exact source, compares display-neutral block fingerprints, and decodes only the changed contiguous top-level block range. Untouched prefixes, suffixes and gaps remain original source bytes. Changed/new block spans are rebased after commit; detached partial-paste previews use the same boundary without mutating the live baseline. SourceDocumentEngine still owns the actual commit. This is block-granularity preservation, not a character-level syntax tree: edits within a list/table can normalize that whole changed block.

Important limitation: raw HTML, link definitions, frontmatter, math, TOC and footnote projections may not have a reliable one-to-one map. An unverified/stale baseline uses the explicit rendered-edit compatibility path, which can normalize the whole document. Fingerprint scanning remains linear in document size. General source-span/AST mapping and efficient dirty-block detection remain work, not claimed complete.

## 4. Projection and startup lifecycle

`renderActive()` delegates projection ownership to `ProjectionCoordinator`. The coordinator issues a monotonically increasing revision, owns the loading phase, validates the active document id, and prevents stale completion from clearing a newer render's state. Empty documents install a canonical `<p><br></p>` synchronously, so the first character is immediately editable.

EditorProjectionController owns source/empty/async HTML installation, formatting-whitespace cleanup, canonical block normalization, source-span capture, view activation and guarded failure handling. App orchestration supplies DOM adapters and updates its chrome after a successful current transaction. Projection context includes source revision and editor mode in addition to document id/epoch. Loading spans the activation frame, not just HTML IPC; stale render failures cannot switch mode, and release clears only its own epoch. App completion also rechecks the epoch after awaiting immediate projections. Current failures fall back to authoritative source mode without a DOM-to-Markdown write. This does not queue edit intents attempted during a nonempty loading phase.

For nonempty visual documents, `renderActive()` resolves after the guarded animation-frame activation and scroll restoration. Callers can then navigate without competing with a later scroll restoration; empty and source projections still activate synchronously.

Clipboard projection activation supplies its captured live viewport and caret-restoration callback to this same lifecycle. It does not install an intermediate start-of-document caret or restore the tab's stale cached scroll offset. Clipboard focus uses preventScroll, with viewport restoration after selection activation. Selection changes only mark the focused block. Typewriter mode is removed: no button/menu/palette command/F9 binding, centering logic, display CSS, or preference remains. Old preferences are ignored by supported-key settings loading. Focus mode (F8) still dims non-focused paragraphs without requesting scroll. Clipboard caret offsets still rely on the rendered text bridge, not a general source-span mapper; partial visual replacement may normalize surrounding source.

Session restoration is background and transactional:

1. Bind UI and show the shell immediately.
2. `SessionRestoreCoordinator` deduplicates paths and resolves the active clean file, dirty recovery snapshot, or draft first.
3. Project that active document immediately, then load the remaining files and folder tree with at most four concurrent file reads.
4. Compare `state.documentRevision` before and after the early projection and while dispatching background work; stale work stops scheduling more reads.
5. If the user has created, opened, or switched a document, discard the old restoration result. Otherwise add background tabs without re-rendering the already editable active projection.

The latency regression restores 80 session paths while immediately creating and typing into a new document. The typed source must remain authoritative after the restore requests finish.

## 5. Editing models

- `MarkdownInputController` routes key/input/composition events and applies visual transforms. Environment-neutral recognition lives in `markdown-input-rules.js`, so block markers, inline shortcuts, and table-header detection can be tested without DOM mutation. Existing semantic blocks never reinterpret newly typed marker characters as another structural level.
- `SourceEditingController` owns source-mode wrapping, insertion, line prefixes and indentation. The pure planSourceEdit function produces a bounded source patch plus explicit resulting selection; the DOM adapter applies it and calls the existing sourceChanged/SourceDocumentEngine path once. First-line and selection-ending-newline boundaries have independent coverage. This source-mode model does not solve visual-edit source-span mapping.
- `DocumentStore` owns tab reorder and consuming closed snapshots; app.js no longer splices document arrays. Removed unused swap/reopen convenience methods do not remove their user-facing commands. Reopening files still passes through normal guarded opening.
- Markdown clipboard payloads use `markdown-paste.mjs` and one source transaction, with a separate undo boundary, rather than Chromium multiline `insertText`. Empty/full-selection and start/end insertion preserve existing source bytes; empty-line insertion adds required paragraph separators. Partial visual selections still use a detached codec bridge and may normalize surrounding source. The clipboard payload is substituted after decoding, so its syntax is not escaped. Semantic clipboard HTML takes priority over incidental Markdown-looking plain text: asynchronously sanitized HTML is normalized in a detached fragment, decoded to Markdown, and passed to the same source transaction. Clipboard-only sanitization discards controls/non-text elements; normalization removes website styles/identifiers, retains code language, and supplies a GFM table header when needed. Raw Markdown copied inside a sole pre/code surface remains byte-preserving. Menu paste reads coherent HTML/plain formats from one clipboard item; source-mode paste uses the same converter and checks the selection after async sanitization. Non-semantic HTML retains the legacy structural browser fallback. Literal paste and visual code/table contexts do not parse Markdown; code newlines remain text. Projection completion and post-paste caret placement are document/revision guarded. Plain text without Markdown markers cannot reconstruct absent HTML structure.
- `ListEditingModel` owns nested-list Enter, Tab, Shift+Tab, and line-start Backspace. Outdent moves trailing siblings beneath the lifted item to preserve preorder/source order.
- `TableEditingModel` owns table navigation and structure: Tab/Enter movement, row/column insertion and deletion, resize, column alignment, cell/row selection, and spreadsheet-style tab/newline matrix paste. Toolbars and context menus dispatch semantic commands into this model rather than mutating table DOM themselves. It remembers the active cell while the size controls hold focus, but clears that reference when the table is removed.
- `CaretModel` resolves a pointer to the vertically nearest editable list row and performs at most one custom placement per pointer gesture.
- `DocumentHistory` stores Markdown strings only. First mutation creates an immediately undoable state; nearby typing updates the current history entry.
- History projection captures transient caret/selection endpoints by top-level block and rendered-text offset, plus pane and textarea scroll positions, through editor-view-state.mjs. Undo/redo activate that view within the guarded projection rather than placing the caret at the document end. Deleted blocks/shortened text clamp to valid nearby positions. This retains the current editing location, not historical exact selection metadata or a source/AST caret map. History source changes also schedule private recovery persistence.
- `DocumentTransactionGate` captures document id, source revision, and mode for async clipboard/image/save flows.
- `DocumentSaveCoordinator` serializes explicit manual saves per document. No edit/history/paste path schedules a file write. Closing a document increments its save epoch, so late IPC results cannot update a closed document or its UI. Edits made while a manual save is in flight remain dirty and require another explicit save.

`WorkspaceSearchService` runs in the main process. It imports searchable files with at most four concurrent reads, caches content by file size and modification time, preserves deterministic file order, and returns at most 200 occurrences with line/column and preview metadata. A short-lived directory catalog is shared by overlapping and rapid queries, so typing a search term does not recursively enumerate the workspace for every character. Loading a folder primes that catalog; creating, renaming, and Save As clear catalog snapshots, while ordinary saves invalidate only the affected content entry. Renderer input invalidates the previous query immediately.

Do not mutate list DOM directly from `app.js`. Extend these models and add real rendered-list CDP coverage.

## 6. Persistence

Renderer localStorage keys:

- `inkdown.settings`: display/editor preferences.
- `inkdown.recent`: recent file metadata.
- `inkdown.session`: legacy localStorage recovery data, read only for migration; no new snapshots are written here.

`SessionRecoveryStorage` stores structured source snapshots under the session key in the inkdown-recovery IndexedDB database. Writes are asynchronous atomic transactions, not synchronous JSON/localStorage serialization. On first load, a legacy snapshot is conditionally inserted only if no newer database snapshot exists; legacy data is removed only after successful transaction completion. Migration/write failure retains legacy data and reports a recovery error rather than pretending the original file was saved.

`SessionRecoveryCoordinator` owns debounce and serialized writes. Each flush captures current source; a failed write does not poison later retries. Native window close freezes editor input and awaits startup restoration so partial/empty loading state cannot replace the old recovery, then invalidates stale clipboard/render/open results, and waits for renderer flush completion through trusted generation-bound IPC; stale acknowledgements cannot close a newer request. Failures or user cancellation restore editing and leave the window open. A ten-second nonresponse offers wait/cancel/explicit direct close, with a recovery-loss warning. App quit uses the same boundary. Forced process termination or OS shutdown before a debounce/transaction completes can still lose recent recovery data. Page reload is not a native close handshake. Startup async database reads capture navigation revision so late recovery cannot replace immediately typed text.

Sessions never store editable HTML. In the packaged app, user styles live in `config/markdown-style.json` and `config/custom.css` beside `Inkdown.exe`. Initial creation copies templates with `flag: wx`, so application startup never replaces existing configuration. Development mode uses the isolated Electron user-data directory.

Document file saving is manual-only (Ctrl+S/menu Save or Save As). Automatic-save timers and their settings/UI are removed. Settings load only supported default keys, so older stored automatic-save preferences cannot re-enable writes. Session recovery snapshots still persist after edits/exit but never write to the original document file; recovery and automatic file saving are separate behaviors.

## 7. Custom style architecture

`src/assets/markdown-style.json` defines unordered-marker and ordered-style arrays plus H1-H6 and quote prefixes. The renderer validates these values and compiles exact-depth rules for up to 16 levels; list depths beyond an array's length cycle from its first entry. `src/assets/custom.css` remains an advanced override layer. Both outputs are loaded into `style#userStyle` with generated CSS first and custom CSS last.

Markers and Emoji use `::marker`/`::before`, so they are not part of editor `innerHTML` and cannot reach Turndown or Markdown source. Task-list items suppress the generated bullet. The style file affects the editor projection only; exported HTML/PDF does not currently include it.

Only trusted CSS should be loaded because CSS can request external resources with `url()` or `@import`.

## 8. Tests

`node tests/run-cdp-suite.mjs source` and `node tests/run-cdp-suite.mjs packaged` run the CDP release suites with a fresh profile and unique port for each suite. The runner waits for renderer binding and stops only its own application process tree. Temporary profiles are removed after the test processes exit.

- `source-document-engine-test.mjs`: source commit/revision/no-op behavior.
- `file-source-preservation-test.cjs`: disk import preserves escaped headings and hash text exactly.
- `renderer-core-models-test.mjs`: pure tab navigation, dirty recovery snapshots, projection-epoch invalidation, immediate history, serialized/cancelled saves, command resolution, and bounded/cancellable/progressive session restoration.
- `project-contract-test.cjs`: assisted-installer settings, trusted IPC parity, runtime configuration templates, install-directory contract, and handoff-document presence.
- `architecture-boundaries-test.mjs`: shared codec projection/import profiles, source-range plans/selection, first-line and multiline boundaries, single commit/focus behavior, safe Markdown rendering and clipboard sanitization. Project contracts also enforce codec sharing, explicit renderer ESM and store-owned tab mutation. The paste CDP suite compares browser/main conversion for eight fixtures over real IPC and exercises source formatting/prefix/indent boundaries.
- `session-recovery-coordinator-test.mjs`: ordered async snapshots, debounce capture, final flush and recovery after write failure.
- `editor-projection-controller-test.mjs`: same-document source-revision cancellation, mode-switch stale errors, activation-frame loading ownership, superseded-frame cleanup, current error recovery and synchronous empty/source installation.
- `cdp-source-range-recovery-test.mjs`: changed-block-only decoding, CRLF/untouched source preservation, repeated and structural changes, conservative custom-block fallback, real IndexedDB migration/failure retention, native input, actual app quit/restart and final unsaved recovery. The runner gives this test its own profile and stops only its exact restarted process tree. Existing startup/manual-save/search/session tests now use async recovery fixtures.
- `workspace-search-service-test.cjs`: all-occurrence matching, deterministic ordering, bounded concurrency, metadata caching/invalidation, and truncation.
- `search-result-navigation-test.mjs`: last-click wins, context cancellation, changed-content rejection, and read-failure isolation.
- `document-open-coordinator-test.mjs`: latest-open wins, edit cancellation, stale-error suppression, existing dirty-document reuse, pending-read deduplication, and bounded batch reads.
- `cdp-new-document-latency-test.mjs`: welcome-page focus, immediate first input, rapid creates, editor top layout, and startup restore isolation.
- `cdp-tab-list-test.mjs`: nested list structure, Enter/Tab/Backspace, source order, task markers, pointer placement, undo/redo, source stability, and CSS list configuration isolation.
- `cdp-user-style-test.mjs`: external custom.css creation/reload, Emoji markers/prefixes, and task marker isolation.
- `cdp-app-menu-test.mjs`: click-only menu behavior and action dispatch; typewriter button/menu/palette/F9 removal, ignored legacy preferences, retained F8 focus behavior, compact chrome and on-demand statistics/dismissal.
- `cdp-manual-save-test.mjs`: legacy autosave preferences are ignored; editing a real file and switching tabs do not write it, Ctrl+S writes the intended source, dirty status and recovery snapshots remain intact.
- `cdp-search-test.mjs`: editor-scoped visual matching, all-match highlighting and cleanup, empty-result feedback, forward/backward wrapping, and current/total count updates.
- `cdp-search-navigation-test.mjs`: native key/mouse navigation through long visual paragraphs and wrapped source; exact workspace offsets including hidden link targets and CRLF; stale-result rejection and open-document preservation; grouped counts, result keyboard navigation, clear, and immediate Enter.
- `cdp-external-open-test.mjs`: command-line shell open on first launch and Markdown forwarding into the existing single instance.
- `cdp-table-editing-test.mjs`: rendered-table keyboard navigation, safe header operations, row/column commands, resize, context menu, matrix paste, selection shortcuts, source-mode cleanup, GFM alignment persistence, editor-bounded toolbar placement for scrolled long tables, offscreen hiding/reappearance, mutually exclusive selection tools and sidebar resize tracking. Pure placement bounds/offscreen cases also run in renderer-core-models-test.mjs.
- `cdp-paste-test.mjs`: exact Markdown source, representative GPT semantic HTML (heading/list/bold/link/table/fenced code), HTML precedence over numbered plain text, removal of styles/code-copy controls, source-mode rich paste, native menu clipboard reading, partial replacement/caret, multiline code/literal paste, stale rich-text cancellation, and large clipboard latency. `electron-clipboard-fixture.cjs` supplies actual Windows HTML/plain formats for the menu test without adding a production clipboard-writing API.
- The paste suite also sends native Ctrl+C/Ctrl+V in the middle of a 150-paragraph document and checks viewport/caret stability with focus mode both disabled and enabled.
- `export-security-test.cjs`: export directory/symlink boundaries, non-image/signature/size rejection, CSP, and DOCX export/import roundtrip after removing unused Mammoth CLI dependencies.
- `cdp-security-test.mjs`: actual inline-script/network/permission blocking, sanitizer checks, and usable editor under CSP, in source and packaged Electron.
- `node tests/run-export-runtime-test.cjs [--packaged]`: real PDF generation and request cancellation for unrelated local files/HTTPS, temporary-file cleanup, using source Electron with a fresh profile; `--packaged` loads the exact service from the packaged ASAR.

CDP tests exercise real Chromium input. Do not replace them with only `element.click()`, `execCommand()`, or fixed-delay DOM mocks when investigating focus or native key behavior.

## 9. Installer and release

`package.json` is authoritative:

- `oneClick: false`
- `perMachine: false`
- `allowToChangeInstallationDirectory: true`
- desktop and Start Menu shortcuts enabled

The assisted installer includes an optional, default-unchecked Markdown association page for `.md`, `.markdown`, `.mdown`, `.mkd`, and `.mkdn`. Each extension has its own `Inkdown.<extension>` ProgID and uses the dedicated packaged Markdown document icon. `Applications\Inkdown.exe`, SupportedTypes, RegisteredApplications, and Capabilities make Inkdown a complete Windows Default Apps candidate.

Manual upgrades preserve/preselect an existing Inkdown choice, including migration from the legacy `Inkdown.Markdown` class; silent upgrades do not change it. A real uninstall removes only extension defaults that still point to Inkdown, so a later user choice is not overwritten. Windows 10/11 protects the per-user `UserChoice` hash, so the installer does not attempt an unsupported forced write. Installation never automatically opens system settings, even when the association option is selected. If Windows requires confirmation, the user must manually choose Inkdown through Open With or Default Apps. The association page explains this limitation; project-contract-test.cjs rejects installer shell/settings launches and UserChoice writes.

Keep `appId` unchanged so upgrades find the existing installation. Electron-builder already handles a running previous version; there must be no custom global `taskkill` hook. User data and custom CSS remain outside the install directory.

Release checklist:

Packaging retains en-US, zh-CN and zh-TW Electron locale packs only, with English fallback; other native UI locales are intentionally unavailable (document Unicode content is unaffected). Build filters exclude dependency tests/examples/docs/tooling, source maps/type declarations, known duplicate DOCX/Mammoth browser builds and unused JSZip/Pako/XML-JS browser distributions. Runtime entry points, graphics/software-rendering fallbacks, ICU, codec/Word features, licenses and user configuration are retained. Do not manually trim generated release files. tests/packaged-resources-test.cjs checks the actual ASAR/locales and required runtime resources; the export-runtime test loads packaged modules for a real DOCX roundtrip as well as PDF security. These checks must pass after building; filters do not alter development dependencies.

1. Validate `package.json` release metadata and artifact naming; keep README installer examples version-neutral.
2. Run syntax/core checks.
3. Run all CDP regressions against source Electron with a fresh profile.
4. Build NSIS.
5. Run all regressions against `win-unpacked` with another fresh profile, plus `node tests/packaged-resources-test.cjs` and `node tests/run-export-runtime-test.cjs --packaged` for actual shipped resources and DOCX/PDF dependencies.
6. Ensure generated NSIS debug output contains no legacy custom installer include/taskkill.
7. Compute SHA-256 and only then hand off the installer.

Packaged fuses disable RunAsNode, NODE_OPTIONS and Node CLI inspectors, and enable embedded ASAR integrity checks and ASAR-only application loading. Chromium CDP remains available only when explicitly launched with a debugging port for regressions; there is no default debug listener. Signing must happen after these build transformations. `pnpm dist:signed` fails rather than silently producing an unsigned release when signing is unavailable; configure electron-builder's trusted signing provider/certificate without committing credentials. Ordinary `dist` permits local unsigned builds and must be labeled as such. Digital signing and internal scanner approval are external release requirements, not results of unit tests or dependency audit.

Dependency overrides live in `pnpm-workspace.yaml` (pnpm 11 ignores `package.json.pnpm.overrides`). Same-major patched transitive packages are locked. Unused Mammoth argparse CLI support and the optional `@electron/get` global-agent proxy bootstrap were removed because they transitively included unpatched sprintf-js; the application uses Mammoth's library API and does not use global-agent. The latter means custom builds relying on `ELECTRON_GET_USE_PROXY` need a separately reviewed download/proxy setup, not reintroduction of the vulnerable optional chain. Run full and production `pnpm audit`, core/CDP regressions, real export runtime checks, fuse inspection and source/ASAR parity before release. Zero audit findings only describe the current registry advisory data, not proof of a malware-free binary.

## 10. Known architectural debt

AI contributor configuration is development-only: root/subdirectory AGENTS.md, .codex/config.toml and docs/ai/ form the guide and workflow/template layer. They contain no application model integration, credentials, global trust/permission changes or auto-running hooks. These paths are outside the packaged runtime allow-list. Documentation-only changes do not create a new binary release; validate project contracts and configuration syntax/links instead. See docs/ai/README.md for directory and verification guidance.

Prioritized, not silently solved:

1. **Source-range coverage:** verified ordinary projections use top-level block range patches. Custom/raw/reference projections retain a whole-document codec compatibility path, and a changed large list/table still decodes as one block. General syntax-tree mapping and dirty-block tracking are not implemented.
2. **Renderer orchestration size:** session I/O, normal async opening, and workspace search pane logic are extracted, but `app.js` still coordinates store/projection lifecycle, commands, outline, and other panes.
3. **Conversion fidelity:** shared Turndown rules remove configuration duplication, but browser/Node DOM parsers and lossy HTML imports still require representative parity fixtures. Shared configuration is not proof of lossless Markdown roundtrips.
4. **Shortcut documentation generation:** runtime menus, keyboard routing, and command-palette entries now share `command-registry.js`; README shortcut prose is still maintained manually.
5. **Async projection input queue:** `ProjectionCoordinator` now owns revisions and loading state, but input attempted during a large asynchronous projection is not yet queued as an edit intent.
6. **Persistence scale:** recovery now uses asynchronous IndexedDB transactions; snapshot creation and structured cloning still have CPU cost. The native close handshake does not guarantee recovery after forced termination or unexpected OS shutdown.
7. **Custom CSS scope:** exporting custom styles is not supported yet.
8. **Filesystem capabilities:** trusted sender checks and tested CSP/sandbox/permission restrictions protect the current IPC boundary, but preload still exposes path-based file operations. Move toward main-issued file capabilities; a future renderer compromise must not authorize arbitrary local writes.
9. **Search scope/mapping:** workspace search indexes saved files and deliberately opens results in source mode. Mapping arbitrary source spans to visual positions is not implemented. Unsaved edits can invalidate a disk-search result; users must save and search again. Source-range visual transactions remain necessary for a general bidirectional mapping.

When addressing these, protect existing behavior with tests first and prefer a coherent boundary change over a sequence of symptom patches.
