# Inkdown contributor guide

This file is the first stop for any new Codex session working in this directory. Read `docs/ARCHITECTURE.md` before changing editor behavior.

## AI development entry points

This is the canonical shared project guide. `docs/ai/README.md` maps development directories, task/handoff templates and verification tiers; consult it when setting up a session or planning a substantial change. `.codex/config.toml` contains only a local instruction-size setting, not model, credential or permission policy. Do not change global AI settings, connect external services, or start parallel agents/recurring work without explicit user authorization. Applicable subdirectory AGENTS.md files add local guidance without weakening these invariants. For documentation-only changes, validate configuration/links and project contracts; no application version bump or installer rebuild is required.

## Product intent

Inkdown is a Windows, offline-first, Typora-style Markdown desktop editor. The user values predictable source semantics over one-off visual fixes. Prefer a shared architectural rule and regression test over a special case for one screenshot.

## Non-negotiable invariants

- Markdown in `doc.content` is the persisted authority for documents, history, sessions, save, and export.
- The editable HTML is a temporary projection. Saving, exporting, switching tabs, and switching modes must not serialize an otherwise untouched DOM back into Markdown.
- User operations must preserve Markdown source order. This is especially important for nested-list Enter, Tab, Shift+Tab, and Backspace.
- Async results must be bound to document id, source revision, and editor mode when relevant. Stale dialogs, clipboard reads, renders, and image operations must not commit into another tab.
- IME composition and the first editable line must follow the same path as every other line.
- Custom display CSS and generated markers/Emoji must never become Markdown source.
- Do not add a narrowly named `fix*` path for each bug. Extend the relevant model or transaction boundary.

## Important paths

- `src/main.js`: Electron main process, Markdown rendering/sanitizing, filesystem IPC, custom-style file.
- `src/preload.js`: the complete renderer IPC allow-list.
- `src/renderer/app.js`: renderer orchestration and UI state. It is currently large; keep new domain logic out of it.
- `src/renderer/core/source-document-engine.mjs`: the only normal commit path into `doc.content`.
- `src/renderer/core/visual-source-transactions.mjs`: verified top-level projection spans and changed-block source patches; preserve untouched source bytes and use the explicit compatibility path when mapping is unverified.
- `src/renderer/core/session-recovery-storage.mjs`: asynchronous IndexedDB recovery, conditional legacy migration, debounced/ordered snapshots and native close flushing; never treat private recovery as document file saving.
- `src/renderer/core/markdown-input.js`: visual input routing and canonical editable blocks.
- `src/renderer/core/markdown-paste.mjs`: Markdown clipboard recognition and detached source replacement; partial visual selection still uses the codec bridge.
- `src/renderer/core/markdown-input-rules.js`: pure block, inline-shortcut, and table-header recognition rules; keep syntax matching out of DOM event handlers.
- `src/renderer/core/list-editing-model.js`: semantic list operations and source-order-preserving DOM transitions.
- `src/renderer/core/table-editing-model.js`: semantic table navigation, rows/columns, resize, alignment, and selection.
- `src/renderer/core/caret-model.js`: row hit testing and caret placement.
- `src/renderer/core/document-history.js`: source-only undo/redo history.
- `src/renderer/core/editor-view-state.mjs`: transient block-relative caret/selection and viewport capture/restoration for history projection.
- `src/renderer/core/document-transaction-gate.js`: stale async-result guard.
- `src/renderer/core/projection-coordinator.js`: the sole owner of projection revision, loading phase, and stale-render completion.
- `src/renderer/core/editor-projection-controller.mjs`: guarded source/visual projection installation, block normalization, source-span capture and view activation; keep DOM projection transactions out of app orchestration.
- `src/renderer/core/command-registry.js`: canonical command labels, shortcuts, keyboard resolution, and command-palette entries.
- `src/renderer/core/document-save-coordinator.js`: per-document save serialization and close-time invalidation.
- `src/renderer/core/session-restore-coordinator.js`: bounded, deduplicated, progressive active-document-first session I/O with revision cancellation.
- `src/renderer/core/find-controller.js`: editor-scoped visual/source matching, selection, counting, and cyclic next/previous navigation.
- `src/renderer/core/workspace-search-model.js`: stale-result cancellation and recursive file-tree filtering.
- `src/renderer/core/workspace-search-pane.mjs`: search UI debounce/IME, grouped results, counts, clearing, and keyboard navigation.
- `src/renderer/core/document-open-coordinator.mjs`: normal file/folder open transactions, existing-document reuse, and bounded/deduplicated reads.
- `src/services/workspace-search-service.js`: bounded concurrent workspace content search with metadata-aware caching.
- `src/services/local-image-policy.js`: bounded in-directory verified raster-image embedding; never read arbitrary files referenced as images.
- `src/renderer/core/markdown-codec.js`: renderer-side HTML-to-Markdown codec.
- `tests/`: unit and real Electron/CDP regressions.
- `src/assets/custom.css`: packaged template copied to the user profile only when no custom style exists.
- `release/`: generated artifacts; never hand-edit.

## Working rules

- Use `apply_patch` for source and documentation edits.
- Preserve unrelated workspace changes. This directory may not be a Git repository, so do not assume Git recovery is available.
- Add or extend a regression before declaring an editor bug fixed. Test both source Electron and `release/win-unpacked` for input/caret/list/startup changes.
- Use a fresh `--user-data-dir` and unique remote-debugging port for each CDP run.
- Stop only the exact test executable/port process tree. Never kill every `Inkdown.exe`; a user instance may contain unsaved work.
- Delete only the explicitly resolved test profile inside this workspace.
- Keep installer metadata and artifact naming driven by package.json. Documentation must use generic installer examples rather than advertise a current application version or record version-numbered release history.
- The NSIS installer must remain assisted (`oneClick: false`) with `allowToChangeInstallationDirectory: true`. Do not restore a global `taskkill` custom installer hook.
- Markdown file association must remain an explicit assisted-installer choice. Silent upgrades preserve the previous choice, and uninstall must not overwrite a different default application selected later by the user.
- Windows 10/11 protects default-app `UserChoice`. Register Inkdown through `RegisteredApplications`/Capabilities, but do not automatically open system settings after installation. Explain manual Open With/Default Apps confirmation; do not add a hash bypass or claim that registry writes alone can force the default.

## Verification commands

Load the bundled workspace dependencies first to obtain Node. In this environment Node is normally:

`C:\Users\wanghang\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`

Core test:

`pnpm test`

If the bundled `pnpm.cmd` is available but its child shell cannot find Node, prepend the bundled Node directory for that command:

`$env:PATH="C:\Users\wanghang\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;$env:PATH"; pnpm test`

With Inkdown running on a fresh profile and CDP endpoint such as `http://127.0.0.1:9399`:

- `node tests/cdp-new-document-latency-test.mjs http://127.0.0.1:9399`
- `node tests/cdp-tab-list-test.mjs http://127.0.0.1:9399`
- `node tests/cdp-user-style-test.mjs http://127.0.0.1:9399`
- `node tests/cdp-app-menu-test.mjs http://127.0.0.1:9399`
- `node tests/cdp-search-test.mjs http://127.0.0.1:9399`

Build:

`node node_modules/electron-builder/out/cli/cli.js --win nsis`

After building, run the same CDP suite against `release/win-unpacked/Inkdown.exe`, then hash the final installer.

## User-owned configuration

The packaged app creates `config/markdown-style.json` and `config/custom.css` beside `Inkdown.exe` with `wx` semantics. Never overwrite existing files. The JSON arrays `unorderedMarkers` and `orderedStyles` cycle by nesting depth; generated markers, numbering, and optional Markdown-element Emoji affect display only. Source-mode development uses the isolated Electron user-data directory instead of writing beside the development runtime.

## Before handoff

- Update `docs/ARCHITECTURE.md` if an invariant, data flow, test, release rule, or known limitation changed.
- Report the installer path and SHA-256 only after packaged-app regressions pass.
- Record remaining architectural debt honestly; passing current regressions does not make the DOM-to-Markdown editing bridge source-preserving.
