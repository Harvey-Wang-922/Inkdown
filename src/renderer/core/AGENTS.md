# Renderer core guidance

Inherit the root AGENTS.md; read docs/ARCHITECTURE.md before editor changes.

- Keep recognition/planning pure where possible. DOM adapters apply plans; SourceDocumentEngine alone commits authoritative Markdown.
- Keep visual range mapping conservative. Unverified projections use the documented compatibility boundary; never guess source ranges from matching visible text.
- Keep history strings source-only and caret/viewport transient. Rendering/normalizing/focus changes must not create a source edit.
- Bind async work to document id, source revision, editor mode and projection epoch as applicable. Old success, failure and cleanup must not alter newer state.
- Avoid importing app.js into models or adding hidden global state. Inject environment and I/O dependencies; verify empty/first-line/IME and nested structure paths.
- Regression coverage must include the relevant pure model plus native Electron behavior. Source and packaged suites remain release requirements; preserve existing viewport/source assertions.
