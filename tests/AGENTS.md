# Test guidance

Inherit the root AGENTS.md. These files are development checks, not application startup code.

- Unit tests exercise actual modules, not copied source or rewritten data-URL imports.
- Native input/caret/clipboard issues require real Electron/CDP input, not only synthetic event dispatch.
- Prefer observable readiness conditions over arbitrary sleeps. Do not lower thresholds, delete assertions or disguise flaky failures as product fixes.
- Use run-cdp-suite.mjs for fresh profiles, unique ports and exact process cleanup. For a custom runner, validate the same boundaries; never kill every Inkdown.exe.
- Check exit codes and run serial native UI suites to avoid focus interference. Record failures and unchanged reruns honestly.
- Distinguish targeted debugging from full source/packaged release validation. Resource tests inspect the actual ASAR; DOCX/PDF tests must load packaged modules for packaged claims.
- Fixtures use synthetic data. Never copy real user documents, private profiles or credentials into tests or logs.
