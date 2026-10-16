'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const Module = require('node:module');
const assert = require('node:assert/strict');
const { test } = require('node:test');
const ts = require('typescript');

const filename = path.resolve(__dirname, '../vite/plugins/svg-sprite.ts');
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, esModuleInterop: true },
}).outputText;
const instance = new Module(filename, module);
instance.filename = filename;
instance.paths = Module._nodeModulePaths(path.dirname(filename));
instance._compile(compiled, filename);
const { compileSvgSprite, createSvgIconsPlugin } = instance.exports;

function fixture(run) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-svg-test-'));
  try {
    fs.writeFileSync(path.join(root, 'sample.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path d="M0 0h24v24H0z"/></svg>');
    return run(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test('retains existing root icon IDs and viewBox', () => fixture(root => {
  for (const svgoOptions of [true, false]) {
    const result = compileSvgSprite({ iconDirs: [root], svgoOptions });
    assert.deepEqual(result.ids, ['icon-sample']);
    assert.match(result.symbols, /viewBox="0 0 24 24"/);
    assert.doesNotMatch(result.symbols, /\bwidth=|\bheight=|<svg/);
  }
}));

test('retains nested directory ID behavior', () => fixture(root => {
  fs.mkdirSync(path.join(root, 'nested'));
  fs.copyFileSync(path.join(root, 'sample.svg'), path.join(root, 'nested/second.svg'));
  assert.deepEqual(compileSvgSprite({ iconDirs: [root] }).ids, ['icon-nested-second', 'icon-sample']);
}));

test('preserves icons that rely on width and height for their viewport', () => fixture(root => {
  fs.writeFileSync(path.join(root, 'sample.svg'),
    '<svg width="32px" height="16"><path d="M0 0h32v16H0z"/></svg>');
  for (const svgoOptions of [true, false]) {
    assert.match(compileSvgSprite({ iconDirs: [root], svgoOptions }).symbols,
      /viewBox="0 0 32 16"/);
  }
}));

test('rejects ambiguous IDs across roots', () => fixture(root => {
  assert.throws(() => compileSvgSprite({ iconDirs: [root, root] }), /^Error: Invalid SVG symbol$/);
}));

test('rejects symbolic links and external XML entities', () => fixture(root => {
  const file = path.join(root, 'sample.svg');
  fs.symlinkSync(file, path.join(root, 'linked.svg'));
  assert.throws(() => compileSvgSprite({ iconDirs: [root] }), /^Error: Invalid SVG source$/);
  fs.unlinkSync(path.join(root, 'linked.svg'));
  fs.writeFileSync(file, '<!DOCTYPE svg [<!ENTITY external SYSTEM "synthetic-private-file">]><svg/>');
  assert.throws(() => compileSvgSprite({ iconDirs: [root] }), /^Error: Invalid SVG source$/);
}));

test('uses the existing virtual registration and names modules', () => fixture(root => {
  const plugin = createSvgIconsPlugin({ iconDirs: [root] });
  assert.equal(plugin.resolveId('virtual:svg-icons-register'), '\0virtual:svg-icons-register');
  assert.equal(plugin.resolveId('virtual:svg-icons-names'), '\0virtual:svg-icons-names');
  assert.equal(plugin.resolveId('unrelated'), undefined);
  assert.equal(plugin.load('unrelated'), undefined);
  assert.match(plugin.load('\0virtual:svg-icons-names'), /\["icon-sample"\]/);
}));

test('mounts once and preserves non-browser module loading', () => fixture(root => {
  const plugin = createSvgIconsPlugin({ iconDirs: [root] });
  const code = plugin.load('\0virtual:svg-icons-register').replace(/export default [^;]+;/, '');
  vm.runInNewContext(code, {});
  let current;
  let mounts = 0;
  const document = {
    readyState: 'complete',
    getElementById: () => current,
    createElementNS: () => ({ style: {}, setAttribute() {}, remove() { current = undefined; } }),
    body: { appendChild(node) { current = node; mounts++; } },
  };
  vm.runInNewContext(code, { document });
  vm.runInNewContext(code, { document });
  assert.equal(mounts, 2);
  assert.equal(current.id, '__svg__icons__dom__');
  assert.match(current.innerHTML, /id="icon-sample"/);
}));

test('waits for the DOM and registers a one-shot listener', () => fixture(root => {
  const plugin = createSvgIconsPlugin({ iconDirs: [root] });
  const code = plugin.load('\0virtual:svg-icons-register').replace(/export default [^;]+;/, '');
  let listener;
  const document = {
    readyState: 'loading',
    addEventListener(event, callback, options) { listener = { event, callback, options }; },
  };
  vm.runInNewContext(code, { document });
  assert.equal(listener.event, 'DOMContentLoaded');
  assert.equal(listener.options.once, true);
}));
