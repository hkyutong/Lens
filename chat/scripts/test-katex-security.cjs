'use strict';

const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');

const projectRequire = createRequire(path.join(process.cwd(), 'package.json'));
const katex = projectRequire('katex');

function withInheritedTrust(render) {
  const original = Object.getOwnPropertyDescriptor(Object.prototype, 'trust');
  Object.defineProperty(Object.prototype, 'trust', {
    configurable: true,
    writable: true,
    value: true,
  });
  try {
    return render();
  } finally {
    if (original) Object.defineProperty(Object.prototype, 'trust', original);
    else delete Object.prototype.trust;
  }
}

test('inherited trust cannot enable an executable formula link', () => {
  const html = withInheritedTrust(() =>
    katex.renderToString(String.raw`\href{javascript:alert(1)}{synthetic}`, {
      throwOnError: false,
    }),
  );
  assert.doesNotMatch(html, /href\s*=\s*["']javascript:/i);
});

test('inherited trust cannot load an external formula image', () => {
  const html = withInheritedTrust(() =>
    katex.renderToString(String.raw`\includegraphics{https://example.invalid/synthetic.svg}`, {
      throwOnError: false,
    }),
  );
  assert.doesNotMatch(html, /<img\b/i);
});

test('ordinary research formula rendering is preserved', () => {
  const html = katex.renderToString(String.raw`\frac{a+b}{2}=\sqrt{x^2+y^2}`, {
    throwOnError: false,
  });
  assert.match(html, /class="katex"/);
  assert.match(html, /<math\b/);
  assert.doesNotMatch(html, /katex-error/);
});

test('the Markdown plugin preserves text, code and safe formulas under inherited trust', async () => {
  const imported = await import(pathToFileURL(projectRequire.resolve('@traptitech/markdown-it-katex')));
  const plugin = imported.default;
  const MarkdownIt = projectRequire('markdown-it');
  const markdown = new MarkdownIt().use(plugin, { throwOnError: false });
  const html = withInheritedTrust(() => markdown.render([
    '# 合成研究记录',
    '',
    '正常公式 $x^2+y^2$ 与 `code`。',
    '',
    String.raw`$\href{javascript:alert(1)}{synthetic}$`,
    '',
    String.raw`$\includegraphics{https://example.invalid/synthetic.svg}$`,
  ].join('\n')));
  assert.match(html, /合成研究记录/);
  assert.match(html, /<code>code<\/code>/);
  assert.match(html, /class="katex"/);
  assert.doesNotMatch(html, /href\s*=\s*["']javascript:/i);
  assert.doesNotMatch(html, /<img\b/i);
});
