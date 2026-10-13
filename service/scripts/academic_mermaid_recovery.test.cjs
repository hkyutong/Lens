const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.resolve(__dirname, '../../chat/src/utils/mermaidRecovery.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const exportsObject = {};
vm.runInNewContext(compiled, { exports: exportsObject, Error });
const { groupMindmapRoots, renderMermaidWithRecovery } = exportsObject;

test('valid historical mindmaps and other diagram types are left unchanged', () => {
  assert.equal(groupMindmapRoots('mindmap\n  root((Research))\n    Rainfall\n    Plant growth'), null);
  assert.equal(groupMindmapRoots('flowchart LR\n  A --> B'), null);
  assert.equal(groupMindmapRoots('sequenceDiagram\n  A->>B: hello'), null);
});

test('forest recovery preserves labels and the relative hierarchy of each branch', () => {
  const recovered = groupMindmapRoots('mindmap\n  Rainfall\n    Soil moisture\n  Plant growth\n    Dry matter');
  assert.equal(recovered, 'mindmap\n  root((Mind map))\n    Rainfall\n      Soil moisture\n    Plant growth\n      Dry matter');
});

test('comments and node styling do not create false roots', () => {
  assert.equal(groupMindmapRoots('mindmap\n%% comment\n  Research\n    Rainfall\n    :::important\n    ::icon(fa fa-book)'), null);
});

test('forest recovery accepts surrounding whitespace, CRLF and tabs', () => {
  const recovered = groupMindmapRoots('\n mindmap\r\n\tRainfall\r\n\tPlant growth\r\n');
  assert.equal(recovered, 'mindmap\n  root((Mind map))\n    Rainfall\n    Plant growth');
});

test('successful rendering forwards the original source and container exactly once', async () => {
  const container = {};
  const expected = { svg: '<svg></svg>', bindFunctions() {} };
  let calls = 0;
  const result = await renderMermaidWithRecovery({ async render(id, text, target) {
    calls++;
    assert.equal(id, 'synthetic');
    assert.equal(text, 'mindmap\n  Research');
    assert.equal(target, container);
    return expected;
  } }, 'synthetic', 'mindmap\n  Research', container);
  assert.equal(result, expected);
  assert.equal(calls, 1);
});

test('only a rejected multiple-root mindmap is retried with a distinct ID', async () => {
  const calls = [];
  const container = {};
  const result = await renderMermaidWithRecovery({ async render(...args) {
    calls.push(args);
    if (calls.length === 1) throw new Error('There can be only one root. No parent could be found.');
    return { svg: '<svg></svg>' };
  } }, 'synthetic', 'mindmap\n  Rainfall\n  Plant growth', container);
  assert.equal(calls.length, 2);
  assert.equal(calls[1][0], 'synthetic-single-root');
  assert.equal(calls[1][2], container);
  assert.equal(result.svg, '<svg></svg>');
});

test('unrelated errors and non-mindmap failures retain their original fallback', async () => {
  for (const [text, message] of [['mindmap\n  Rainfall\n  Plant growth', 'resource unavailable'], ['flowchart LR\n  A --> B', 'multiple roots']]) {
    let calls = 0;
    const failure = new Error(message);
    await assert.rejects(renderMermaidWithRecovery({ async render() { calls++; throw failure; } }, 'synthetic', text), error => error === failure);
    assert.equal(calls, 1);
  }
});

test('an unsuccessful retry is propagated without looping or concealing failure', async () => {
  let calls = 0;
  const failure = new Error('retry failed');
  await assert.rejects(renderMermaidWithRecovery({ async render() {
    calls++;
    throw calls === 1 ? new Error('multiple roots') : failure;
  } }, 'synthetic', 'mindmap\n  Rainfall\n  Plant growth'), error => error === failure);
  assert.equal(calls, 2);
});
