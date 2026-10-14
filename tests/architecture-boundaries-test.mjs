import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createMarkdownCodec } from '../src/shared/markdown-codec.mjs';
import { planSourceEdit, SourceEditingController } from '../src/renderer/core/source-editing-model.mjs';
const require = createRequire(import.meta.url);
const { renderMarkdown, sanitizeClipboardHtml } = require('../src/services/markdown-render-service');
const { renderProjection } = require('../src/services/markdown-render-service');
const original = '__old__\r\n\r\nchange here\r\n\r\n* untouched\r\n';
const mapped = renderProjection(original);
assert.deepEqual(mapped.spans.map(span => original.slice(span.start, span.end)), ['__old__', 'change here', '* untouched']);
assert.equal(renderProjection('[ref]: https://example.test\n\n[text][ref]').spans, null);
const rendered = renderMarkdown('---\nkey: value\n---\n\n# Title\n\n[toc]\n\n==light== a\tb\n\n$$\nx+y\n$$\n\nref[^one]\n\n[^one]: note');
for (const fragment of ['class="frontmatter"', 'id="heading-1"', 'class="document-toc"', '<mark>light</mark>', 'data-md-tab="true"', 'class="math-block"', 'class="footnote-ref"', 'class="footnotes"']) assert.ok(rendered.includes(fragment), fragment);
assert.doesNotMatch(renderMarkdown('<script>alert(1)</script><img src="x" onerror="bad()">'), /<script|onerror/);
assert.equal(sanitizeClipboardHtml('<p>text</p><button>copy</button><script>bad</script><svg>icon</svg>'), '<p>text</p>');
assert.doesNotMatch(renderMarkdown('```text\na\tb\n```'), /data-md-tab/, 'code tabs must remain literal');
const Service = require('turndown'), { gfm } = require('turndown-plugin-gfm');
const codec = createMarkdownCodec(Service, gfm);
const cases = [
  ['<h2>Title</h2><p><em>italic</em> <u>under</u> <mark>light</mark></p>', '## Title\n\n*italic* <u>under</u> ==light=='],
  ['<p>a<span data-md-tab="true">\t</span>b</p>', 'a \tb'],
  ['<nav class="document-toc">generated</nav>', '[toc]'],
  ['<pre class="frontmatter"><code>key: value</code></pre>', '---\nkey: value\n---'],
  ['<pre class="math-block"><code>x+y</code></pre>', '$$\nx+y\n$$'],
  ['<p><img src="file:///generated" data-markdown-src="assets/a.png" alt="A"></p>', '![A](assets/a.png)'],
  ['<p>a<sup class="footnote-ref" data-label="one">1</sup></p><section class="footnotes"><ol><li data-label="one">note</li></ol></section>', 'a[^one]\n\n[^one]: note']
];
for (const [html, markdown] of cases) assert.equal(codec.toMarkdown(html), markdown);
const imported = createMarkdownCodec(Service, gfm, { projection: false });
assert.equal(imported.toMarkdown('<p><em>italic</em> <u>under</u> <mark>light</mark></p>'), '_italic_ <u>under</u> ==light==');
assert.equal(codec.toMarkdown('<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><br></td><td>v</td></tr></tbody></table>'), '| A | B |\n| --- | --- |\n|  | v |');

const apply = (value, start, end, operation, argument, extra) => {
  const plan = planSourceEdit(value, start, end, operation, argument, extra);
  return { value: plan ? value.slice(0, plan.start) + plan.text + value.slice(plan.end) : value, plan };
};
assert.equal(apply('before word after', 7, 11, 'wrap', '**').value, 'before **word** after');
assert.equal(apply('first\nsecond\nlast', 0, 6, 'indent', false).value, '\tfirst\nsecond\nlast');
assert.equal(apply('first\nsecond\nlast', 0, 10, 'indent', false).value, '\tfirst\n\tsecond\nlast');
assert.equal(apply('\tfirst\n    second\nlast', 0, 15, 'indent', true).value, 'first\nsecond\nlast');
assert.equal(apply('\nsecond', 0, 0, 'prefix', '# ', true).value, '# \nsecond');
assert.equal(apply('## first\nlast', 0, 0, 'prefix', '# ', true).value, '# first\nlast');
assert.equal(apply('tail', 0, 0, 'indent', true).plan, null);
assert.equal(apply('  tail', 2, 2, 'indent', true).value, 'tail');
assert.equal(apply('outside\nselected\noutside', 8, 16, 'insert', 'new').value, 'outside\nnew\noutside');
let changes = 0, focusOptions;
const editor = {
  value: 'word', selectionStart: 0, selectionEnd: 4,
  setRangeText(text, start, end) { this.value = this.value.slice(0, start) + text + this.value.slice(end); },
  setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; },
  focus(options) { focusOptions = options; }
};
const controller = new SourceEditingController(editor, () => changes++);
controller.format('bold');
assert.equal(editor.value, '**word**');
assert.deepEqual([editor.selectionStart, editor.selectionEnd], [2, 6]);
assert.deepEqual(focusOptions, { preventScroll: true });
assert.equal(changes, 1);
assert.equal(controller.format('unsupported'), false);
assert.equal(changes, 1);
console.log(JSON.stringify({ sharedCodec: true, importProfilePreserved: true, sourceRangePlans: true, firstLine: true, multilineSelection: true, singleCommit: true }));
