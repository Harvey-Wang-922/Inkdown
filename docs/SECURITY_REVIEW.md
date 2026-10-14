# Inkdown security review

Reviewed and built: 2026-10-10 (Asia/Shanghai).

## Status

Code/build-side fixes and regressions are complete. Trusted code signing and the internal scanner's verdict are **not complete**; there is no supplied signing certificate/provider or scanner report. Do not label this release as enterprise-approved or malware-free.

Authenticode status for installer/application: `NotSigned`.

## Repairs and evidence

- Non-image local-file export leak reproduced before repair; directory traversal, junction/symlink escapes, forged extensions, absent document base and oversize data are now regression-tested and rejected. Raster signatures are checked, with 16 MiB/image and 64 MiB/export limits. SVG/out-of-directory images are deliberately not automatically embedded.
- Real PDF printing blocks unrelated local files and HTTPS requests, uses an isolated session with denied permissions, and cleans temporary HTML. Verified source service and exact packaged ASAR service under Electron 44.7.0.
- Renderer CSP denies inline scripts and connection requests, alongside explicit sandbox/isolation, permission denial and webview rejection. Source/packaged security regressions verify enforcement, sanitizer behavior and editor startup. Inline styles remain permitted for trusted custom CSS and existing UI operations.
- Production audit previously reported 14 advisories. Full and production `pnpm audit --json` now report zero known advisories. Packaged versions include sanitize-html 2.18.0, Mammoth 1.13.0, xmldom 0.8.15 and source-map-js 1.2.2. Unused vulnerable CLI/proxy dependency chains were removed, not hidden by audit ignore rules. Builds depending on the optional `ELECTRON_GET_USE_PROXY` global-agent bootstrap need a separately reviewed download configuration.
- Electron upgraded from 38.8.6 to 44.7.0; actual distribution version verified. Packaged Node execution/options/inspect fuses are disabled; embedded ASAR integrity/ASAR-only loading are enabled. All 35 source files match ASAR bytes; unused dependency chains are absent.
- Eight core suites, 52 syntax checks, source/packaged ten-suite CDP runs, DOCX roundtrip and real PDF runtime regressions passed. User CSS/JSON configuration remains byte-identical.

## Remaining release actions

1. Provide an organization-approved signing certificate/provider through a secure local configuration, not source control or chat passwords. Use `pnpm dist:signed` so missing signing is a build failure, then inspect signatures for the installer, application, uninstaller and any helper executables.
2. Re-run packaged regressions after any rebuild and calculate the new final hash. Signing changes executable bytes: an unsigned hash must not be reused for the signed installer. Keep exact artifact identifiers in the actual handoff rather than this version-neutral review.
3. Submit the final package to the organization's internal scan process. Obtain the rule, affected file/component and detection category if it still flags. Do not bypass, disable or whitelist the scanner merely to claim success.

Trusted signatures reduce some trust/reputation problems but do not guarantee acceptance. Dependency audits and functional tests are not antivirus scans. The installer was not uploaded to any external scanning service. Renderer path-based IPC and file-protocol architecture remain candidates for future capability/protocol hardening; this repair is not a complete security certification.

References: [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security), [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses), [Microsoft SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).
