# Inkdown project state

Updated: 2026-10-14

This document records development state and limitations, not application version numbers or version-numbered release history. Runtime release metadata remains in package.json; exact artifact paths and hashes belong in the actual build handoff.

## Build status

- The requested release-directory cleanup and new build remain pending. The execution safety policy rejected batch clearing before it ran; no old artifacts were removed and no new installer was built for that request.
- Existing custom.css and markdown-style.json were independently backed up under .build-backups/ and their hashes were verified. Continue after the user clears release/; do not bypass the rejected deletion with another tool or shell.
- Previously completed source and packaged regression checks do not verify a future rebuild. Run the release checklist again for the actual new artifact.
- The previously inspected application and installer were unsigned. No signing certificate/provider or internal scanner verdict was supplied; enterprise approval is unknown.

## Implemented boundaries

- doc.content is authoritative Markdown for saving, history, recovery and export. No untouched DOM serialization is performed during tab/mode switching or saving.
- Ordinary visual projections have verified top-level source spans. Changed blocks patch source while preserving untouched neighboring bytes; detached partial paste uses the same boundary.
- EditorProjectionController owns installation, normalization, span capture and view activation. ProjectionCoordinator binds epoch, document id, source revision and editor mode, including stale success/error/cleanup protection.
- History stores source-only strings. Transient block-relative caret and pane/textarea scroll restoration prevent unconditional document-end placement during undo/redo.
- Source editing, list/table semantics, normal opening, manual save serialization and bounded session restoration have dedicated models/coordinators.
- Recovery uses debounced, ordered atomic IndexedDB writes and conditional legacy migration. Normal close waits for startup restoration and final recovery writing; stale close acknowledgements are rejected.
- Document file saving remains manual-only. Removed autosave and typewriter settings cannot be re-enabled by loading old preferences.
- Find/search models own match navigation and stale-result cancellation. Workspace search targets saved files and validates content before opening exact source offsets.
- Floating controls are editor-bounded, centered on visible anchors, hidden offscreen and mutually exclusive for table caret versus expanded text selection.
- Shared codec configuration and render/sanitization services separate conversion rules from process/UI orchestration.

## Installation, resources and security

- Assisted NSIS preserves installation-directory selection and explicit optional Markdown association. Installation does not open Windows Settings automatically, bypass UserChoice or kill every application process.
- Packaging retains English and both Chinese locale packs. Development tooling/fixtures, maps/types and confirmed unused duplicate browser builds are excluded.
- Runtime entry points, licenses, ICU, graphics/software-rendering compatibility and Word/PDF support are retained.
- Custom configuration creation uses wx semantics; rebuilds preserve and restore existing configuration byte-for-byte.
- Export automatically embeds only verified in-directory raster images within bounded sizes. PDF blocks unrelated file/network requests and cleans its temporary HTML.
- Renderer/export CSP, sandbox/isolation, permission denial, navigation constraints and packaged fuses are enforced and regression-tested.
- Source and packaged resource checks do not establish antivirus clearance or lossless conversion for every possible document.

## AI development configuration

- Root AGENTS.md is canonical. Renderer core, tests and build have local contributor guidance; docs/ai contains directory/workflow and task/handoff templates.
- .codex/config.toml sets only the project instruction-read budget. It does not override models, providers, credentials, trust, sandbox, approvals, external services or hooks.
- .gitignore excludes generated outputs, isolated test data, private task notes and credential/signing material without deleting them.
- Contributor guides under src are excluded from runtime packaging. AI configuration is development-only, not an in-application model integration.
- Config parsing, local links, instruction-chain size and project/core tests were checked. Client trust/config loading was not end-to-end verified; check it in a new trusted session.

## Verification evidence and limits

- Completed source/packaged checks include startup/native input, nested lists, tables, search, clipboard, undo/redo viewport, manual saves, recovery close/restart and shell-open behavior.
- Eleven core suites, script syntax checks, both dependency audits, DOCX roundtrip, real PDF security, resource policy, source/ASAR parity and fuses were previously verified. These results are time- and artifact-specific, not perpetual guarantees.
- Some runs observed fixed-delay/native input failures; isolated and complete fresh-profile reruns passed unchanged. Causes were not established and thresholds were not relaxed. Test readiness/focus timing remains debt.
- Documentation and AI-guide-only changes do not require an installer rebuild. Such checks must not be reported as a new packaged release verification.

## Remaining architectural work

1. Extend source-range coverage beyond ordinary top-level blocks. Custom/raw/reference projections still use whole-DOM compatibility conversion; a changed large list/table still converts the full block.
2. Replace linear document fingerprint scans with trustworthy dirty-block tracking; implement general source/AST caret mapping.
3. Add input-intent handling during large async projections; input attempted during loading is not yet queued.
4. Further separate substantial UI/session/command orchestration from app.js.
5. Budget recovery snapshot/structured-clone CPU costs. Forced termination or unexpected OS shutdown can still lose recent private recovery data.
6. Introduce main-issued filesystem capabilities; trusted path-based IPC is not a capability boundary against a compromised renderer.
7. Map arbitrary source search locations back into visual projections and support exported custom styles.
8. Generate shortcut documentation from the canonical command registry.

The full architecture and verification commands remain in docs/ARCHITECTURE.md and AGENTS.md. Existing source-mapping, conversion and storage limitations must not be described as entirely solved.
