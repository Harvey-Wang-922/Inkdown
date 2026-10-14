export const DEFAULT_MARKDOWN_STYLE = Object.freeze({
  unorderedMarkers: Object.freeze(['●', '○', '■']),
  orderedStyles: Object.freeze(['decimal', 'lower-alpha', 'lower-roman']),
  headingPrefixes: Object.freeze(['', '', '', '', '', '']),
  quotePrefix: ''
});

const MAX_CONFIG_ITEMS = 32;
const MAX_LIST_DEPTH = 16;

function strings(value, fallback, validate = () => true) {
  if (!Array.isArray(value)) return [...fallback];
  const result = value.slice(0, MAX_CONFIG_ITEMS).map(item => String(item).slice(0, 64)).filter(validate);
  return result.length ? result : [...fallback];
}

export function normalizeMarkdownStyle(value = {}) {
  const unorderedMarkers = strings(value.unorderedMarkers, DEFAULT_MARKDOWN_STYLE.unorderedMarkers);
  const orderedStyles = strings(value.orderedStyles, DEFAULT_MARKDOWN_STYLE.orderedStyles,
    item => /^[a-zA-Z][a-zA-Z0-9-]*$/.test(item));
  const headingPrefixes = Array.from({ length: 6 }, (_, index) => String(value.headingPrefixes?.[index] ?? '').slice(0, 64));
  return {
    unorderedMarkers,
    orderedStyles,
    headingPrefixes,
    quotePrefix: String(value.quotePrefix ?? '').slice(0, 64)
  };
}

function listSelector(depth, type, suffix = '') {
  let chain = '';
  for (let level = 1; level < depth; level++) chain += ':is(ul,ol) > li > ';
  chain += type;
  return `.wysiwyg > ${chain}${suffix},.wysiwyg :not(li,ul,ol) > ${chain}${suffix}`;
}

export function compileMarkdownStyle(value = {}, maxDepth = MAX_LIST_DEPTH) {
  const config = normalizeMarkdownStyle(value);
  const depthLimit = Math.max(1, Math.min(MAX_LIST_DEPTH, Number(maxDepth) || MAX_LIST_DEPTH));
  const variables = [];
  const rules = [];
  for (let depth = 1; depth <= depthLimit; depth++) {
    const marker = config.unorderedMarkers[(depth - 1) % config.unorderedMarkers.length];
    const orderedStyle = config.orderedStyles[(depth - 1) % config.orderedStyles.length];
    variables.push(`--inkdown-ul-marker-${depth}:${JSON.stringify(marker)}`);
    variables.push(`--inkdown-ol-style-${depth}:${orderedStyle}`);
    rules.push(`${listSelector(depth, 'ul', ' > li::marker')}{content:var(--inkdown-ul-marker-${depth}) "  "}`);
    rules.push(`${listSelector(depth, 'ol')}{list-style-type:var(--inkdown-ol-style-${depth})}`);
  }
  config.headingPrefixes.forEach((prefix, index) => variables.push(`--inkdown-h${index + 1}-prefix:${JSON.stringify(prefix)}`));
  variables.push(`--inkdown-quote-prefix:${JSON.stringify(config.quotePrefix)}`);
  return `:root{${variables.join(';')}}\n${rules.join('\n')}`;
}
