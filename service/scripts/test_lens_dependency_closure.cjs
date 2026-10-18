'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');

function productionParserFixture(f) {
  const store = fs.realpathSync(path.join(__dirname, '..', 'node_modules', '.pnpm'));
  const entry = fs.readdirSync(store).find(name => /^js-yaml@4\.3\./.test(name));
  assert.ok(entry, 'the existing patched production parser must be available');
  const installed = new Map();
  function copyPackage(source) {
    const metadata = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
    if (installed.has(metadata.name)) return installed.get(metadata.name);
    const target = f.install(metadata.name, metadata.version, metadata.dependencies || {});
    installed.set(metadata.name, { version: metadata.version, target });
    fs.cpSync(source, target, { recursive: true, filter: item => path.basename(item) !== 'node_modules' });
    const key = metadata.name + '@' + metadata.version;
    f.lock.packages[key] = { resolution: { integrity: 'synthetic-parser' } };
    f.lock.snapshots[key] = { dependencies: {} };
    const resolve = createRequire(path.join(source, 'package.json'));
    for (const name of Object.keys(metadata.dependencies || {})) {
      const child = copyPackage(path.dirname(resolve.resolve(name + '/package.json')));
      f.lock.snapshots[key].dependencies[name] = child.version;
      f.link(path.dirname(target), name, child.target);
    }
    return installed.get(metadata.name);
  }
  const parser = copyPackage(path.join(store, entry, 'node_modules', 'js-yaml'));
  const specifier = '^' + parser.version;
  f.pkg.dependencies['js-yaml'] = specifier;
  f.lock.importers['.'].dependencies['js-yaml'] = { specifier, version: parser.version };
  f.link(f.nodeModulesPath, 'js-yaml', parser.target);
  const tools = path.join(f.root, 'tools');
  fs.mkdirSync(tools);
  f.verifierPath = path.join(tools, 'lens_dependency_closure.cjs');
  fs.copyFileSync(path.join(__dirname, 'lens_dependency_closure.cjs'), f.verifierPath);
  f.flush();
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-dependency-test-'));
  fs.chmodSync(root, 0o700);
  const nodeModulesPath = path.join(root, 'node_modules');
  const store = path.join(nodeModulesPath, '.pnpm');
  fs.mkdirSync(store, { recursive: true });
  const packagePath = path.join(root, 'package.json');
  const lockfilePath = path.join(root, 'pnpm-lock.yaml');
  const workspacePath = path.join(root, 'pnpm-workspace.yaml');
  const pkg = { name: 'synthetic-service', version: '1.0.0', dependencies: { alpha: '^1.0.0' } };
  const lock = {
    lockfileVersion: '9.0', settings: { autoInstallPeers: true }, overrides: { beta: '2.0.0' },
    importers: { '.': { dependencies: { alpha: { specifier: '^1.0.0', version: '1.0.0' } } } },
    packages: { 'alpha@1.0.0': { resolution: { integrity: 'synthetic-alpha' } }, 'beta@2.0.0': { resolution: { integrity: 'synthetic-beta' } } },
    snapshots: { 'alpha@1.0.0': { dependencies: { beta: '2.0.0' } }, 'beta@2.0.0': {} },
  };
  const workspace = { overrides: { beta: '2.0.0' } };
  const packageDirs = new Map();
  function install(name, version, dependencies = {}) {
    const entry = name.replace('/', '+') + '@' + version;
    const location = path.join(store, entry, 'node_modules', name);
    fs.mkdirSync(location, { recursive: true });
    fs.writeFileSync(path.join(location, 'package.json'), JSON.stringify({ name, version, dependencies }));
    packageDirs.set(name, location);
    return location;
  }
  function link(parent, name, target) {
    const destination = path.join(parent, name);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.symlinkSync(path.relative(path.dirname(destination), target), destination);
  }
  install('alpha', '1.0.0', { beta: '^2.0.0' });
  install('beta', '2.0.0');
  link(nodeModulesPath, 'alpha', packageDirs.get('alpha'));
  link(path.dirname(packageDirs.get('alpha')), 'beta', packageDirs.get('beta'));
  function flush(installed = lock) {
    fs.writeFileSync(packagePath, JSON.stringify(pkg));
    fs.writeFileSync(lockfilePath, JSON.stringify(lock));
    fs.writeFileSync(workspacePath, JSON.stringify(workspace));
    fs.writeFileSync(path.join(store, 'lock.yaml'), JSON.stringify(installed));
  }
  flush();
  return { root, store, nodeModulesPath, packagePath, lockfilePath, workspacePath, pkg, lock, workspace, packageDirs, install, link, flush };
}

let tests = 0;
function check(name, mutate, expected, expectedCount = 2) {
  const f = fixture();
  try {
    mutate?.(f);
    const api = require(f.verifierPath || './lens_dependency_closure.cjs');
    const result = api.verify(f);
    assert.equal(result.passed, expected, name);
    assert.deepEqual(Object.keys(result).sort(), ['count', 'error', 'passed']);
    assert.equal(typeof result.error, 'string');
    assert.equal(result.count, expected ? expectedCount : 0);
    assert.equal(JSON.stringify(result).includes(f.root), false);
    tests++;
  } finally {
    fs.rmSync(f.root, { recursive: true, force: true });
  }
}

function main() {
  check('a complete production closure is accepted', null, true);
  check('missing root package is rejected', f => fs.unlinkSync(path.join(f.nodeModulesPath, 'alpha')), false);
  check('missing transitive package is rejected', f => fs.unlinkSync(path.join(path.dirname(f.packageDirs.get('alpha')), 'beta')), false);
  check('a physical version differing from the lock is rejected', f => fs.writeFileSync(path.join(f.packageDirs.get('beta'), 'package.json'), JSON.stringify({ name: 'beta', version: '3.0.0' })), false);
  check('a missing snapshot is rejected', f => { delete f.lock.snapshots['beta@2.0.0']; f.flush(); }, false);
  check('installed snapshot edges must match the approved lock', f => { const installed = structuredClone(f.lock); delete installed.snapshots['alpha@1.0.0'].dependencies; f.flush(installed); }, false);
  check('installed package integrity metadata must match the approved lock', f => { const installed = structuredClone(f.lock); installed.packages['beta@2.0.0'].resolution.integrity = 'synthetic-changed'; f.flush(installed); }, false);
  check('workspace overrides cannot drift from the approved lock', f => { f.workspace.overrides.beta = '3.0.0'; f.flush(); }, false);
  check('package overrides cannot contradict workspace policy', f => { f.pkg.pnpm = { overrides: { beta: '3.0.0' } }; f.flush(); }, false);
  check('an undeclared importer dependency is rejected', f => { f.lock.importers['.'].dependencies.extra = { specifier: '1.0.0', version: '1.0.0' }; f.flush(); }, false);
  check('a changed manifest dependency requires a matching frozen importer', f => { f.pkg.dependencies.alpha = '^2.0.0'; f.flush(); }, false);
  check('an exact direct override may legitimately replace its specifier', f => { f.workspace.overrides.alpha = '1.0.0'; f.lock.overrides.alpha = '1.0.0'; f.lock.importers['.'].dependencies.alpha.specifier = '1.0.0'; f.flush(); }, true);
  check('a dev-only physical package cannot remain in the production tree', f => { f.install('synthetic-dev', '1.0.0'); }, false);
  check('an unrecorded physical dependency cannot extend the runtime graph', f => { fs.writeFileSync(path.join(f.packageDirs.get('beta'), 'package.json'), JSON.stringify({ name: 'beta', version: '2.0.0', dependencies: { extra: '1.0.0' } })); }, false);
  check('package symlinks cannot escape the isolated dependency root', f => { const external = path.join(f.root, 'external'); fs.mkdirSync(external); fs.writeFileSync(path.join(external, 'package.json'), JSON.stringify({ name: 'alpha', version: '1.0.0' })); fs.unlinkSync(path.join(f.nodeModulesPath, 'alpha')); fs.symlinkSync(external, path.join(f.nodeModulesPath, 'alpha')); }, false);
  check('scope directory symlinks cannot escape the isolated dependency root', f => {
    const outside = path.join(f.root, 'outside-modules');
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(f.nodeModulesPath, '@escape'));
  }, false);
  check('recursive scope directory symlinks are rejected', f => {
    fs.symlinkSync(f.nodeModulesPath, path.join(f.nodeModulesPath, '@cycle'));
  }, false);
  check('YAML aliases are rejected without diagnostic contents', f => {
    const aliased = JSON.stringify(f.lock).replace(/}$/, ',"anchor": &shared {},"alias": *shared}');
    fs.writeFileSync(f.lockfilePath, aliased);
  }, false);
  check('a symlinked lockfile is rejected', f => { const other = path.join(f.root, 'other-lock'); fs.renameSync(f.lockfilePath, other); fs.symlinkSync(other, f.lockfilePath); }, false);
  check('malformed YAML is rejected without leaking parser diagnostics', f => fs.writeFileSync(f.lockfilePath, 'snapshots: [synthetic-private-data'), false);
  check('duplicate YAML keys are rejected', f => fs.writeFileSync(f.lockfilePath, 'lockfileVersion: 9.0\nlockfileVersion: 9.0\n'), false);
  check('a cyclic runtime graph terminates and verifies its real edges', f => { f.lock.snapshots['beta@2.0.0'].dependencies = { alpha: '1.0.0' }; fs.writeFileSync(path.join(f.packageDirs.get('beta'), 'package.json'), JSON.stringify({ name: 'beta', version: '2.0.0', dependencies: { alpha: '^1.0.0' } })); f.link(path.dirname(f.packageDirs.get('beta')), 'alpha', f.packageDirs.get('alpha')); f.flush(); }, true);
  check('an incompatible optional platform package may be absent', f => { const other = process.platform === 'linux' ? 'darwin' : 'linux'; f.lock.packages['platform-only@1.0.0'] = { os: [other] }; f.lock.snapshots['platform-only@1.0.0'] = {}; f.lock.snapshots['alpha@1.0.0'].optionalDependencies = { 'platform-only': '1.0.0' }; const p = JSON.parse(fs.readFileSync(path.join(f.packageDirs.get('alpha'), 'package.json'), 'utf8')); p.optionalDependencies = { 'platform-only': '1.0.0' }; fs.writeFileSync(path.join(f.packageDirs.get('alpha'), 'package.json'), JSON.stringify(p)); f.flush(); }, true);
  check('a compatible optional package cannot silently disappear', f => { f.lock.packages['platform-only@1.0.0'] = { os: [process.platform] }; f.lock.snapshots['platform-only@1.0.0'] = {}; f.lock.snapshots['alpha@1.0.0'].optionalDependencies = { 'platform-only': '1.0.0' }; f.flush(); }, false);
  check('dependency aliases resolve to their actual locked package', f => { delete f.pkg.dependencies.alpha; f.pkg.dependencies.alias = 'npm:alpha@^1.0.0'; delete f.lock.importers['.'].dependencies.alpha; f.lock.importers['.'].dependencies.alias = { specifier: 'npm:alpha@^1.0.0', version: 'alpha@1.0.0' }; fs.renameSync(path.join(f.nodeModulesPath, 'alpha'), path.join(f.nodeModulesPath, 'alias')); f.flush(); }, true);
  check('scoped peer-context snapshots keep their resolved physical graph', f => { fs.unlinkSync(path.join(f.nodeModulesPath, 'alpha')); fs.rmSync(path.dirname(path.dirname(f.packageDirs.get('alpha'))), { recursive: true }); const dir = f.install('@scope/alpha', '1.0.0', { beta: '^2.0.0' }); f.link(path.join(f.store, '@scope+alpha@1.0.0', 'node_modules'), 'beta', f.packageDirs.get('beta')); f.link(f.nodeModulesPath, '@scope/alpha', dir); f.pkg.dependencies = { '@scope/alpha': '^1.0.0' }; f.lock.importers['.'].dependencies = { '@scope/alpha': { specifier: '^1.0.0', version: '1.0.0(beta@2.0.0)' } }; delete f.lock.packages['alpha@1.0.0']; delete f.lock.snapshots['alpha@1.0.0']; f.lock.packages['@scope/alpha@1.0.0'] = {}; f.lock.snapshots['@scope/alpha@1.0.0(beta@2.0.0)'] = { dependencies: { beta: '2.0.0' } }; f.flush(); }, true);
  check('the standalone verifier uses the existing production parser without development dependencies', productionParserFixture, true, 4);
  check('the production parser rejects duplicate YAML keys', f => {
    productionParserFixture(f);
    fs.writeFileSync(f.workspacePath, 'overrides:\n  beta: 2.0.0\n  beta: 2.0.0\n');
  }, false);
  check('the production parser rejects scalar anchors and aliases', f => {
    productionParserFixture(f);
    fs.writeFileSync(f.workspacePath, 'overrides:\n  beta: &shared 2.0.0\nunused: *shared\n');
  }, false);
  check('the production parser rejects collection anchors before expansion', f => {
    productionParserFixture(f);
    fs.writeFileSync(f.workspacePath, 'overrides: &shared { beta: 2.0.0 }\nunused: [*shared, *shared]\n');
  }, false);
  check('the production parser rejects custom tags', f => {
    productionParserFixture(f);
    fs.writeFileSync(f.workspacePath, 'overrides: !synthetic { beta: 2.0.0 }\n');
  }, false);
  check('the production parser rejects multiple documents', f => {
    productionParserFixture(f);
    fs.writeFileSync(f.workspacePath, 'overrides: { beta: 2.0.0 }\n---\noverrides: { beta: 2.0.0 }\n');
  }, false);
  process.stdout.write(JSON.stringify({ passed: true, tests }));
}

try { main(); } catch { process.stdout.write(JSON.stringify({ passed: false, tests })); process.exitCode = 1; }
