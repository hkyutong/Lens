const test = require('node:test');
const assert = require('node:assert/strict');
const { diagramSource, renderMindmap } = require('./academic_mindmap_render.cjs');

test('isolated renderer accepts fenced mindmaps without evaluating surrounding prose', () => {
  assert.equal(diagramSource('Here is the diagram.\n```mermaid\nmindmap\n  root((Research))\n    Rainfall\n```'), 'mindmap\n  root((Research))\n    Rainfall');
});

test('isolated renderer retains ordinary flowchart edges', () => {
  assert.equal(diagramSource('flowchart LR\n  Rainfall --> Growth'), 'flowchart LR\n  Rainfall --> Growth');
});

test('isolated renderer rejects links, callbacks, HTML and configuration directives', async () => {
  for (const source of ['mindmap\n  https://example.invalid', 'flowchart LR\n  click A callback', 'mindmap\n  <script>example</script>', 'mindmap\n  %%{init: {}}%%']) {
    assert.equal(diagramSource(source), null);
    assert.deepEqual(await renderMindmap(source), { passed: false, invalidSource: true });
  }
});

test('isolated renderer rejects missing diagram declarations and oversized responses', () => {
  assert.equal(diagramSource('Rainfall causes plant growth'), null);
  assert.equal(diagramSource('mindmap\n' + 'x'.repeat(16384)), null);
  assert.equal(diagramSource(null), null);
});
