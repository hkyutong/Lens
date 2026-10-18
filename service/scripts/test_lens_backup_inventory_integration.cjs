'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { inventoryBackupNamespace } = require('./lens_backup_inventory.cjs');

test('inventory dispatch reads only its owned namespace and bypasses release operations', async () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'lens-inventory-contract-')));
  try {
    const source = fs.readFileSync(path.join(__dirname, 'lens_production_release_worker.cjs'), 'utf8');
    const tree = ts.createSourceFile('synthetic.cjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
    let namespaceExpression;
    function visit(node) {
      if (ts.isVariableDeclaration(node) && node.name.getText(tree) === 'namespace') {
        namespaceExpression = node.initializer.getText(tree);
      }
      ts.forEachChild(node, visit);
    }
    visit(tree);
    assert.ok(namespaceExpression);
    const forbidden = () => { throw new Error('forbidden_operation'); };
    const readOnlyFs = new Proxy(fs, {
      get(target, name) {
        if (/^(write|append|mkdir|rm|unlink|rename|copy|chmod|chown|truncate|symlink|link|createWrite)/.test(String(name))) return forbidden;
        return target[name];
      },
    });
    const context = { serviceCwd: path.join(root, 'synthetic-service') };
    const sandbox = {
      require(name) {
        if (name === 'fs' || name === 'node:fs') return readOnlyFs;
        if (name === 'child_process' || name === 'node:child_process') return new Proxy({}, { get: () => forbidden });
        return require(name);
      },
      process: { stdout: { write: forbidden }, stderr: { write: forbidden } },
      __lensRequest: { mode: 'backup_inventory' },
      __lensBackupInventory: { inventoryBackupNamespace },
      context,
      forbidden,
    };
    vm.createContext(sandbox);
    vm.runInContext(source + '\n' +
      '__lensCapture = () => context; __owner = () => "synthetic-owner";\n' +
      '__lensEmit = (value) => { globalThis.result = value; };\n' +
      '__preflight = forbidden; __deploy = forbidden; __command = forbidden;\n' +
      '__configShapeProbe = forbidden;\n' +
      'globalThis.namespace = ' + namespaceExpression + ';', sandbox);
    fs.mkdirSync(sandbox.namespace, { recursive: true });
    const metadata = { version: 1, project: 'synthetic-owner' };
    fs.writeFileSync(path.join(sandbox.namespace, 'owner.json'), JSON.stringify(metadata));
    const backup = path.join(sandbox.namespace, 'synthetic-bundle');
    fs.mkdirSync(backup);
    fs.writeFileSync(path.join(backup, 'control.json'), JSON.stringify(metadata));
    fs.writeFileSync(path.join(backup, 'verified.json'), JSON.stringify({ ...metadata, bundle_verified: true }));
    const before = fs.readdirSync(sandbox.namespace).sort();
    await vm.runInContext('__lensControl()', sandbox);
    assert.equal(sandbox.result.sole_verified_backup, true);
    assert.equal(sandbox.result.backup_directory_count, 1);
    assert.deepEqual(fs.readdirSync(sandbox.namespace).sort(), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
