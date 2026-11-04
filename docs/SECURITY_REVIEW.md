# Inkdown security review

Reviewed: 2026-11-04 (Asia/Shanghai). Recheck actual artifacts after rebuilding.

## Status

The repairs below have regression evidence within their stated scope. Trusted code signing and the internal scanner's verdict are **not complete**; there is no supplied signing certificate/provider or scanner report. Do not label this release as enterprise-approved or malware-free.

Authenticode status for installer/application: `NotSigned`.

## Repairs and evidence

- Non-image local-file export leak reproduced before repair; directory traversal, junction/symlink escapes, forged extensions, absent document base and oversize data are now regression-tested and rejected. Raster signatures are checked, with 16 MiB/image and 64 MiB/export limits. SVG/out-of-directory images are deliberately not automatically embedded.
- Real PDF printing blocks unrelated local files and HTTPS requests, uses an isolated session with denied permissions, and cleans temporary HTML. Verification covers the source service and exact packaged ASAR service under the installed Electron runtime.
- Renderer CSP denies inline scripts and connection requests, alongside explicit sandbox/isolation, permission denial and webview rejection. Source/packaged security regressions verify enforcement, sanitizer behavior and editor startup. Inline styles remain permitted for trusted custom CSS and existing UI operations.
- The earlier dependency maintenance applied same-major patches across the runtime, sanitizer and transitive packages; the sanitizer update removed deepmerge entirely. The latest full audit now reports one moderate minimatch advisory in development-only electron-builder chains; the production audit reports no known advisories. No ignore rules were added. The advisory lists a fixed new major; several older consumers use incompatible API shapes, so blanket overrides were not applied. A reviewed build-tool migration remains open. Builds depending on the optional ELECTRON_GET_USE_PROXY global-agent bootstrap also need a separately reviewed download configuration.
- Runtime preparation uses the official Electron installer with checksum verification, not disabled TLS or borrowed old executable files. Packaged Node execution/options/inspect fuses must remain disabled and embedded ASAR integrity/ASAR-only loading enabled; confirm these and source/ASAR parity on every actual rebuild.
- Release verification includes core models, script syntax, complete source/packaged CDP runs, DOCX roundtrip and real PDF runtime regressions. Actual completion and scope are recorded in PROJECT_STATE.md and the build handoff; user CSS/JSON configuration must remain byte-identical.

## Remaining release actions

1. Provide an organization-approved signing certificate/provider through a secure local configuration, not source control or chat passwords. Use `pnpm dist:signed` so missing signing is a build failure, then inspect signatures for the installer, application, uninstaller and any helper executables.
2. Re-run packaged regressions after any rebuild and calculate the new final hash. Signing changes executable bytes: an unsigned hash must not be reused for the signed installer. Keep exact artifact identifiers in the actual handoff rather than this version-neutral review.
3. Submit the final package to the organization's internal scan process. Obtain the rule, affected file/component and detection category if it still flags. Do not bypass, disable or whitelist the scanner merely to claim success.
4. Migrate affected build-tool minimatch chains with consumer/API compatibility and actual packaging checks. The [upstream advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) describes pattern-processing resource amplification. Build patterns are project configuration; this development dependency audit result must not be presented as a clean full audit or as evidence that user Markdown executes glob patterns.

Trusted signatures reduce some trust/reputation problems but do not guarantee acceptance. Dependency audits and functional tests are not antivirus scans. The installer was not uploaded to any external scanning service. Renderer path-based IPC and file-protocol architecture remain candidates for future capability/protocol hardening; this repair is not a complete security certification.

References: [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security), [Electron fuses](https://www.electronjs.org/docs/latest/tutorial/fuses), [Microsoft SmartScreen reputation](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation).
