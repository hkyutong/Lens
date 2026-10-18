'use strict';

const fs = require('node:fs');
const path = require('node:path');

const MAX_BYTES = 16 * 1024 * 1024;
const MAX_PACKAGES = 20000;
class ClosureError extends Error { constructor(code) { super(code); this.code = code; } }
const fail = code => { throw new ClosureError(code); };
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function stable(value, depth = 0) {
  if (depth > 48) fail('resource_limit');
  if (value === null || ['string', 'boolean', 'number'].includes(typeof value)) return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(item => stable(item, depth + 1)).join(',') + ']';
  if (!record(value)) fail('invalid_document');
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stable(value[key], depth + 1)).join(',') + '}';
}

function readFile(filename) {
  let fd;
  try {
    fd = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const before = fs.fstatSync(fd);
    if (!before.isFile() || before.size > MAX_BYTES) fail('unsafe_path');
    const value = fs.readFileSync(fd, 'utf8');
    const after = fs.fstatSync(fd);
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeMs !== after.mtimeMs) fail('unsafe_path');
    return value;
  } catch (error) {
    if (error instanceof ClosureError) throw error;
    fail('unsafe_path');
  } finally { if (fd !== undefined) fs.closeSync(fd); }
}

function inside(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

function existingYaml(nodeModulesPath) {
  for (const modules of [nodeModulesPath, path.resolve(__dirname, '..', 'node_modules')]) {
    try {
      const store = fs.realpathSync(path.join(modules, '.pnpm'));
      const entries = fs.readdirSync(store).sort();
      for (const entry of [
        ...entries.filter(name => /^yaml@[^/]+$/.test(name)),
        ...entries.filter(name => /^js-yaml@4\.[^/]+$/.test(name)),
      ]) {
        const name = entry.startsWith('js-yaml@') ? 'js-yaml' : 'yaml';
        const location = fs.realpathSync(path.join(store, entry, 'node_modules', name));
        if (!inside(location, store)) continue;
        const api = require(location);
        if (typeof api.parseDocument === 'function' ||
            (typeof api.load === 'function' && api.JSON_SCHEMA)) return api;
      }
    } catch { /* Try the other existing runtime; no installation is permitted. */ }
  }
  fail('parser_unavailable');
}

function document(filename, yaml) {
  try {
    const source = readFile(filename);
    let value;
    if (typeof yaml.parseDocument === 'function') {
      const parsed = yaml.parseDocument(source, { uniqueKeys: true, strict: true, version: '1.2' });
      if (parsed.errors.length || parsed.warnings.length) fail('invalid_document');
      value = parsed.toJS({ maxAliasCount: 0 });
    } else {
      value = yaml.load(source, {
        schema: yaml.JSON_SCHEMA,
        json: false,
        onWarning() { fail('invalid_document'); },
        listener(_event, state) {
          if (!record(state.anchorMap) || Object.keys(state.anchorMap).length) fail('invalid_document');
        },
      });
    }
    if (!record(value)) fail('invalid_document');
    return value;
  } catch (error) {
    if (error instanceof ClosureError) throw error;
    fail('invalid_document');
  }
}

function json(filename) {
  try {
    const value = JSON.parse(readFile(filename));
    if (!record(value)) fail('invalid_document');
    return value;
  } catch (error) {
    if (error instanceof ClosureError) throw error;
    fail('invalid_document');
  }
}

function map(value) {
  if (value === undefined) return {};
  if (!record(value)) fail('invalid_document');
  return value;
}

function packageName(name) {
  if (typeof name !== 'string' || name.length > 214 || !/^(?:@[A-Za-z0-9][A-Za-z0-9._-]*\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name)) fail('unsupported_reference');
  return name;
}

function identity(key) {
  if (typeof key !== 'string' || key.length > 8192) fail('unsupported_reference');
  const base = key.split('(')[0];
  const separator = base.lastIndexOf('@');
  if (separator <= 0) fail('unsupported_reference');
  const name = packageName(base.slice(0, separator));
  const version = base.slice(separator + 1);
  if (!/^[0-9][A-Za-z0-9.+_-]*$/.test(version)) fail('unsupported_reference');
  return { name, version, base };
}

function checkLock(lock) {
  if (String(lock.lockfileVersion) !== '9.0' || !record(lock.importers?.['.']) || !record(lock.packages) || !record(lock.snapshots)) fail('unsupported_lock');
  if (Object.keys(map(lock.patchedDependencies)).length) fail('unsupported_reference');
}

function resolveSnapshot(lock, name, reference) {
  packageName(name);
  if (typeof reference !== 'string' || /^(?:link:|workspace:|file:|https?:|git:)/.test(reference)) fail('unsupported_reference');
  const ref = reference.startsWith('npm:') ? reference.slice(4) : reference;
  const matches = [...new Set([name + '@' + ref, ref])].filter(key => own(lock.snapshots, key));
  if (matches.length !== 1) fail('lock_graph_mismatch');
  identity(matches[0]);
  return matches[0];
}

function condition(values, actual) {
  if (values === undefined) return true;
  if (!Array.isArray(values) || values.some(value => typeof value !== 'string')) fail('invalid_document');
  if (values.includes('!' + actual) || values.includes('!*')) return false;
  const positive = values.filter(value => !value.startsWith('!'));
  return positive.length === 0 || positive.includes(actual) || positive.includes('*') || positive.includes('any');
}

function compatible(metadata) {
  if (!condition(metadata.os, process.platform) || !condition(metadata.cpu, process.arch)) return false;
  if (metadata.libc !== undefined && process.platform === 'linux') {
    const libc = process.report?.getReport()?.header?.glibcVersionRuntime ? 'glibc' : 'musl';
    return condition(metadata.libc, libc);
  }
  return true;
}

function dependencies(snapshot) {
  const normal = map(snapshot.dependencies);
  const optional = map(snapshot.optionalDependencies);
  for (const [name, ref] of Object.entries(optional)) if (own(normal, name) && normal[name] !== ref) fail('lock_graph_mismatch');
  return { ...normal, ...optional };
}

function verify(options) {
  try {
    if (!record(options) || ['lockfilePath', 'nodeModulesPath', 'packagePath', 'workspacePath'].some(key => typeof options[key] !== 'string' || !path.isAbsolute(options[key]))) fail('invalid_input');
    const { lockfilePath, nodeModulesPath, packagePath, workspacePath } = options;
    if (fs.lstatSync(nodeModulesPath).isSymbolicLink() || fs.lstatSync(path.join(nodeModulesPath, '.pnpm')).isSymbolicLink()) fail('unsafe_path');
    const modules = fs.realpathSync(nodeModulesPath);
    const store = fs.realpathSync(path.join(modules, '.pnpm'));
    if (!inside(store, modules)) fail('unsafe_path');
    const yaml = existingYaml(modules);
    const approved = document(lockfilePath, yaml);
    const installed = document(path.join(store, 'lock.yaml'), yaml);
    const workspace = document(workspacePath, yaml);
    const manifest = json(packagePath);
    checkLock(approved); checkLock(installed);
    const overrides = map(workspace.overrides);
    if (stable(map(approved.overrides)) !== stable(overrides) || stable(map(installed.overrides)) !== stable(overrides)) fail('override_mismatch');
    if (manifest.pnpm?.overrides !== undefined && stable(map(manifest.pnpm.overrides)) !== stable(overrides)) fail('override_mismatch');
    if (stable(map(approved.settings)) !== stable(map(installed.settings))) fail('lock_graph_mismatch');
    const importer = approved.importers['.'];
    const currentImporter = installed.importers['.'];
    const roots = [];
    for (const section of ['dependencies', 'optionalDependencies']) {
      const declared = map(manifest[section]);
      const locked = map(importer[section]);
      if (stable(Object.keys(declared).sort()) !== stable(Object.keys(locked).sort()) || stable(locked) !== stable(map(currentImporter[section]))) fail('importer_mismatch');
      for (const [name, specifier] of Object.entries(declared)) {
        packageName(name);
        const row = locked[name];
        const expected = own(overrides, name) ? overrides[name] : specifier;
        if (typeof specifier !== 'string' || !record(row) || row.specifier !== expected) fail('importer_mismatch');
        roots.push({ name, reference: row.version, optional: section === 'optionalDependencies', parent: modules });
      }
    }
    const queue = roots;
    const visited = new Set();
    const expectedPhysical = new Set();
    while (queue.length) {
      if (visited.size > MAX_PACKAGES || queue.length > MAX_PACKAGES * 8) fail('resource_limit');
      const edge = queue.shift();
      const key = resolveSnapshot(approved, edge.name, edge.reference);
      const info = identity(key);
      const metadata = approved.packages[info.base];
      const snapshot = approved.snapshots[key];
      if (!record(metadata) || !record(snapshot) || stable(metadata) !== stable(installed.packages[info.base]) || stable(snapshot) !== stable(installed.snapshots[key])) fail('lock_graph_mismatch');
      if (!compatible(metadata)) { if (edge.optional) continue; fail('platform_mismatch'); }
      let location;
      try { location = fs.realpathSync(path.join(edge.parent, packageName(edge.name))); }
      catch { fail('missing_package'); }
      const relative = path.relative(store, location).split(path.sep);
      if (!inside(location, store) || relative.length < 3 || relative[1] !== 'node_modules') fail('unsafe_path');
      const suffix = info.name.split('/');
      if (relative.slice(2).join('/') !== suffix.join('/')) fail('package_mismatch');
      const pkg = json(path.join(location, 'package.json'));
      if (pkg.name !== info.name || pkg.version !== info.version) fail('package_mismatch');
      const edges = dependencies(snapshot);
      for (const name of Object.keys({ ...map(pkg.dependencies), ...map(pkg.optionalDependencies) })) if (!own(edges, name)) fail('dependency_graph_mismatch');
      const visitKey = key + '\0' + location;
      if (visited.has(visitKey)) continue;
      visited.add(visitKey); expectedPhysical.add(location);
      const parent = path.join(store, relative[0], 'node_modules');
      for (const [name, reference] of Object.entries(edges)) queue.push({ name, reference, parent, optional: own(map(snapshot.optionalDependencies), name) });
    }
    let scanned = 0;
    const scan = directory => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const item = path.join(directory, entry.name);
        if (entry.name.startsWith('@')) {
          const scope = fs.lstatSync(item);
          if (!scope.isDirectory() || scope.isSymbolicLink() ||
              !inside(fs.realpathSync(item), modules) || path.basename(directory).startsWith('@')) fail('unsafe_path');
          scan(item);
          continue;
        }
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        let location;
        try { location = fs.realpathSync(item); } catch { fail('unsafe_path'); }
        if (!inside(location, store)) fail('unsafe_path');
        if (!fs.existsSync(path.join(location, 'package.json'))) continue;
        if (++scanned > MAX_PACKAGES * 12) fail('resource_limit');
        if (!expectedPhysical.has(location)) fail('extraneous_package');
      }
    };
    scan(modules);
    for (const entry of fs.readdirSync(store, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'node_modules') continue;
      const nested = path.join(store, entry.name, 'node_modules');
      if (fs.existsSync(nested)) scan(nested);
    }
    return { passed: true, error: '', count: expectedPhysical.size };
  } catch (error) {
    return { passed: false, error: error instanceof ClosureError ? error.code : 'verification_failed', count: 0 };
  }
}

module.exports = { verify };
