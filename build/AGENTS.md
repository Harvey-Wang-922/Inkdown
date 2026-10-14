# Installer/build guidance

Inherit the root AGENTS.md. This directory contains source assets and installer configuration; release/ is generated.

- Preserve assisted NSIS and installation-directory selection. No global process-killing hooks or automatic Windows Settings launch.
- Keep Markdown association an explicit choice; preserve silent-upgrade state and ownership-aware uninstall. Never bypass protected UserChoice.
- Use build configuration for trimming, not manual edits to packaged files. Retain runtime entry points, license notices, ICU, graphics compatibility and Word/PDF support.
- Back up existing release/win-unpacked/config before rebuilding and restore it byte-identically if the build removes it. Never overwrite user style/config files with templates.
- New releases keep package metadata and installer artifact synchronized. README uses generic examples without a current application version. Verify actual resources, ASAR/source parity, fuses and source/packaged regressions before hashing.
- Do not add signing secrets or fabricate a signature/scanner pass. Document unsigned releases and external scanner uncertainty.
