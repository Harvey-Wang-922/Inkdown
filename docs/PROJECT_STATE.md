# Inkdown project state

Updated: 2026-11-04

This document records development state and limitations, not application version numbers or version-numbered release history. Runtime release metadata remains in package.json; exact artifact paths and hashes belong in the actual build handoff.

## Build status

- The latest requested rebuild completed from current source. Earlier batch directory clearing was rejected before running; it was not retried or bypassed. The rebuild generated its target installer without clearing unrelated historical artifacts.
- Existing custom.css and markdown-style.json were independently backed up under .build-backups/, restored after building and verified byte-identical after regression runs.
- Eleven core suites, 70 script syntax checks and all twelve source/packaged CDP suites passed. Both dependency audits, real source/packaged DOCX/PDF checks, packaged resource policy, 46 runtime-file ASAR parity and hardened fuses were verified.
- A historical source list run failed its tab reprojection assertion; isolated and full fresh-profile reruns passed unchanged. No assertions or thresholds were relaxed; the cause remains unestablished. The latest history/dependency rebuild passed complete source and packaged suites without that failure.
- The installer is unsigned. No signing certificate/provider or internal scanner verdict was supplied; enterprise approval is unknown. Final artifact details and hash are reported in the build handoff, not numbered in this document.
- These checks verify this build only, not every future rebuild. Run the release checklist again for any subsequent artifact.
- Theme synchronization now couples the last requested body palette/root color-scheme with trusted native Electron theme updates. Dark scrollbars and native form controls no longer retain the light scheme; highlight variables follow each palette. Explicit sepia uses light native controls, and system events do not override explicit preferences. No OS-wide theme or user CSS file is modified.
- Theme tests verified dark/light/sepia/system transitions, rapid request ordering, invalid IPC rejection and unchanged document HTML/source. Source and packaged client screenshots were visually inspected. Native caption pixels and actual OS accessibility/theme transitions were not captured end-to-end; native window decoration remains platform-managed.
- Two source paste/redo runs failed with no paragraph anchor at the fixed-delay check. Additional diagnostics were added without changing editing code or assertions; an isolated rerun, full fresh-profile source run and full packaged run passed. The underlying cause remains unestablished and is not claimed fixed by theme changes.
- History coalescing now requires touching/overlapping source changes within the typing interval. Rapid edits in distant paragraphs form separate undo steps in both editor modes; adjacent input and deletion still coalesce. Explicit recording/undo/redo ends the group, and obsolete timer callbacks cannot clear a newer group. Pure timer regressions and native input/undo/redo verified these boundaries without relaxing the typing interval.
- Dependency maintenance applied same-major runtime/sanitizer patches and transitive security patches; the sanitizer no longer requires deepmerge. Full and production audits reported zero known advisories without ignore rules. Official checksum-verified Electron runtime preparation is now an explicit setup command and runs before start/build.
- During dependency preparation an initial source run timed out, and a later launch found the newly installed Electron package lacked its executable. After completing verified runtime preparation, the full source suite passed. This was not treated as an editor fix. Complete packaged suites and real packaged PDF/DOCX checks then passed; user configurations remained byte-identical.
- Current search-cache verification reproduced an old directory enumeration overwriting a newer catalog after invalidation. Publication and error cleanup now require request-entry identity. Deterministic regressions cover late success, late failure, explicit priming, global invalidation and normal failure/retry; overlapping queries still share the current enumeration. Old callers retain their own result/error, with renderer query/navigation cancellation unchanged.
- After the catalog repair, all eleven core suites, 70 syntax checks and twelve source/packaged CDP suites passed. Real source/packaged PDF and DOCX checks, actual packaged resources, 46-file runtime/ASAR parity and hardened fuses were verified. The final task-list diagnostics also passed a targeted source rerun; custom CSS/JSON hashes match the pre-build backup. Production/full audit results are stated separately below.
- The current production audit reports zero known advisories; the full audit reports one moderate development-only minimatch advisory in build-tool chains. Its published fix requires a new major; no blanket incompatible override or ignore rule was added. See SECURITY_REVIEW.md. Earlier clean-audit results below are historical, not the current full-audit status.
- In the current packaged run, task-list projection retained checkboxes/canonical structure but the test's inserted exclamation mark was absent. Input-state/execCommand diagnostics were added without changing production editing code, waits or assertions; the isolated packaged list suite and complete fresh-profile packaged run then passed. This failure's cause remains unestablished, not fixed by the directory-cache repair.

## Implemented boundaries

- doc.content is authoritative Markdown for saving, history, recovery and export. No untouched DOM serialization is performed during tab/mode switching or saving.
- Ordinary visual projections have verified top-level source spans. Changed blocks patch source while preserving untouched neighboring bytes; detached partial paste uses the same boundary.
- EditorProjectionController owns installation, normalization, span capture and view activation. ProjectionCoordinator binds epoch, document id, source revision and editor mode, including stale success/error/cleanup protection.
- History stores source-only strings and groups nearby source changes rather than every edit within one timer window. Transient block-relative caret and pane/textarea scroll restoration prevent unconditional document-end placement during undo/redo.
- Source editing, list/table semantics, normal opening, manual save serialization and bounded session restoration have dedicated models/coordinators.
- Recovery uses debounced, ordered atomic IndexedDB writes and conditional legacy migration. Normal close waits for startup restoration and final recovery writing; stale close acknowledgements are rejected.
- Document file saving remains manual-only. Removed autosave and typewriter settings cannot be re-enabled by loading old preferences.
- Find/search models own match navigation and stale-result cancellation. Workspace search targets saved files and validates content before opening exact source offsets.
- Search directory catalog requests own their cache entry; invalidation or replacement prevents obsolete success/error from publishing or deleting the newer cache.
- File menu Open Recent dynamically reuses the welcome-screen recent metadata, with bounded/deduplicated entries, full-path tooltips, submenu keyboard navigation, empty/malformed storage handling and viewport boundaries. Opening uses.

The full architecture and verification commands remain in docs/ARCHITECTURE.md and AGENTS.md. Existing source-mapping, conversion and storage limitations must not be described as entirely solved.
