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
- Theme tests verified dark/light/sepia/system transitions, rapid request ordering, invalid IPC rejection and unchanged document HTML/source. Source and packaged client screenshots were visually inspected. Native caption pixels and actual OS accessibility/theme transitions were not captured end-to-end; native window decoration research models own match navigation and stale-result cancellation. Workspace search targets saved files and validates content before opening exact source offsets.
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
