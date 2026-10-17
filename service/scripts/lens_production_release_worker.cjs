'use strict';

// No runtime values are embedded here. The readiness inspect scope supplies them.
const __fs = require('fs');
const __path = require('path');
const __crypto = require('crypto');
const __cp = require('child_process');
const __http = require('http');
const __baseResult = () => ({
  ok: false, mode: 'preflight', error: 'none', artifact_checked: false, artifact_file_count: 0,
  source_attestation_present: false, runtime_context_ok: false, pm2_config_ok: false,
  static_roots_ok: false, private_storage_safe: false, database_settings_ok: false, tools_ready: false,
  production_changed: false, backup_verified: false, database_restore_verified: false,
  dependency_closure_verified: false, application_started: false, smoke_passed: false,
  rollback_attempted: false, rollback_completed: false, schema_retained: false,
  needs_manual_review: false, evidence_retained: false, cleanup_succeeded: true, old_backup_removed_count: 0,public_hosts_verified:false,download_boundary_verified:false,academic_runtime_verified:false});
let __emitted = false;
const __publicWrite = process.stdout.write.bind(process.stdout);
function __lensEmit(value, privateValue) {
  if (__emitted) return;
  __emitted = true;
  const response = { public: value };
  if (privateValue) response.private = privateValue;
  __publicWrite(JSON.stringify(response));
}
function __lensFailure(code) {
  const value = __baseResult(); value.error = code; __lensEmit(value);
}
function __fail(code) { const e = new Error(code); e.lensCode = code; throw e; }
function __hash(data) { return __crypto.createHash('sha256').update(data).digest('hex'); }
function __below(base, target) {
  const relative = __path.relative(base, target);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + __path.sep) && !__path.isAbsolute(relative);
}
function __safePath(value, allowMissing = false) {
  if (typeof value !== 'string' || !__path.isAbsolute(value) || value.includes('\0') || value.split('/').includes('..')) __fail('context_unavailable');
  let current = '/';
  for (const part of value.split('/').filter(Boolean)) {
    current = __path.join(current, part);
    try { if (__fs.lstatSync(current).isSymbolicLink()) __fail('context_unavailable'); }
    catch (e) { if (allowMissing && e.code === 'ENOENT') return value; throw e; }
  }
  return value;
}
function __regular(path) {
  const s = __fs.lstatSync(__safePath(path));
  if (!s.isFile() || s.nlink !== 1) __fail('context_unavailable');
  return s;
}
function __directory(path) {
  if (!__fs.lstatSync(__safePath(path)).isDirectory()) __fail('context_unavailable');
  return __fs.realpathSync(path);
}
function __command(name) {
  for (const folder of (process.env.PATH || '').split(__path.delimiter)) {
    if (!folder) continue;
    const file = __path.join(folder, name);
    try { __fs.accessSync(file, __fs.constants.X_OK); if (__fs.statSync(file).isFile()) return file; } catch (_) {}
  }
  return null;
}
function __mode(value) { return value === 'fork' ? 'fork_mode' : value === 'cluster' ? 'cluster_mode' : value; }
function __config(context) {
  const file = __path.join(context.serviceCwd, 'pm2.conf.json');
  __regular(file);
  const raw = __fs.readFileSync(file);
  const parsed = JSON.parse(raw);
  const __configApps = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.apps) ? parsed.apps : (parsed && parsed.apps && typeof parsed.apps === 'object' && !Array.isArray(parsed.apps) && typeof parsed.apps.script === 'string' ? [parsed.apps] : (parsed && typeof parsed === 'object' && typeof parsed.script === 'string' ? [parsed] : null)));
  if (!__configApps || __configApps.length !== 1) __fail("pm2_config_shape_invalid");
  const app = __configApps[0];
  if (!app || typeof app.name !== 'string' || !app.name.trim() || typeof app.script !== 'string' || app.watch !== false) __fail("pm2_config_identity_invalid");
  if (app.cwd !== undefined && (typeof app.cwd !== 'string' || !app.cwd)) __fail('pm2_config_path_invalid');
const cwd = __directory(__path.resolve(context.serviceCwd, app.cwd || '.'));
  const script = __fs.realpathSync(__path.resolve(cwd, app.script));
  if (cwd !== context.serviceCwd || script !== __fs.realpathSync(context.runtime.script)) __fail("pm2_config_path_invalid");
  __regular(script);
  if (app.exec_mode !== undefined && __mode(app.exec_mode) !== __mode(context.runtime.execMode)) __fail("pm2_config_mode_invalid");
  const instances = app.instances === undefined ? (context.runtime.instances || 1) : app.instances;
  if (Number(instances) !== 1 || Number(context.runtime.instances || 1) !== 1 || context.runtime.watch !== false) __fail("pm2_config_instances_invalid");
  if (app.args !== undefined && JSON.stringify(app.args) !== JSON.stringify(context.runtime.args)) __fail("pm2_config_args_invalid");
  const interpreter = app.interpreter || app.exec_interpreter;
  if (interpreter && interpreter !== context.runtime.interpreter) {
    const resolve = v => __fs.realpathSync(__path.isAbsolute(v) ? v : __command(v));
    if (resolve(interpreter) !== resolve(context.runtime.interpreter)) __fail("pm2_config_interpreter_path_invalid");
  }
  app.name=context.runtime.name;app.cwd=context.serviceCwd;
return { file, raw, app, mode: __fs.statSync(file).mode & 0o777 };
}
function __preflight(context) {
  const report = __baseResult();
  let config;
  try {
    if (!context || !Number.isInteger(context.processId) || context.processId < 0 || !context.runtime) __fail('context_unavailable');
    context.serviceCwd = __directory(context.serviceCwd);
    if (__fs.realpathSync(context.runtime.cwd) !== context.serviceCwd) __fail('context_unavailable');
    __directory(context.pm2ModuleRoot);
    report.runtime_context_ok = true;
    try { config = __config(context); report.pm2_config_ok = true; } catch (_) { __fail((["pm2_config_shape_invalid","pm2_config_identity_invalid","pm2_config_path_invalid","pm2_config_mode_invalid","pm2_config_instances_invalid","pm2_config_args_invalid","pm2_config_interpreter_invalid","pm2_config_interpreter_path_invalid"].includes((typeof _ === "string" ? _ : _ instanceof Error ? _.message : "")) ? (typeof _ === "string" ? _ : _ instanceof Error ? _.message : "") : "pm2_config_invalid")); }
    try {
      for (const kind of ['chat', 'admin']) __directory(__path.join(context.serviceCwd, 'public', kind));
      report.static_roots_ok = true;
    } catch (_) { __fail('static_roots_invalid'); }
    try {
      const storage = __safePath(context.privateStorage, true);
      const publicRoot = __path.join(context.serviceCwd, 'public');
      if (storage === publicRoot || __below(publicRoot, storage) || __below(storage, publicRoot) || storage === context.serviceCwd) __fail('private_storage_unsafe');
      let existingStorageAncestor=storage; while (!__fs.existsSync(existingStorageAncestor)) { const parent=__path.dirname(existingStorageAncestor); if (parent===existingStorageAncestor) __fail('private_storage_unsafe'); existingStorageAncestor=parent; } __directory(existingStorageAncestor);
      report.private_storage_safe = true;
    } catch (_) { __fail('private_storage_unsafe'); }
    const db = context.database;
    if (!db || !['host', 'user', 'password', 'database'].every(k => typeof db[k] === 'string' && db[k].length > 0)
        || !Number.isInteger(Number(db.port || 3306)) || Number(db.port || 3306) < 1 || Number(db.port || 3306) > 65535) __fail('database_settings_invalid');
    report.database_settings_ok = true;
    report.tools_ready = ['node', 'pnpm', 'python3', 'tar', 'mysql', 'mysqldump'].every(n => !!__command(n));
    if (!report.tools_ready) __fail('tools_unavailable');
    try { __lensDownloadBoundary.selectPublicHosts(context.nginxTokens, context.smokePort); report.public_hosts_verified=true; } catch (_) { const allowed=['boundary_config_invalid','boundary_context_invalid','boundary_public_unproven']; __fail(allowed.includes(_.message)?_.message:'download_public_hosts_invalid'); }
report.ok = true;
  } catch (e) { report.error = e.lensCode || 'context_unavailable'; }
  return { report, config };
}
function __owner(context) { return __hash(Buffer.from(context.serviceCwd)); }
function __write600(file, data) {
  const fd = __fs.openSync(file, 'wx', 0o600);
  try { __fs.writeFileSync(fd, data); __fs.fsyncSync(fd); } finally { __fs.closeSync(fd); }
}
function __configShapeProbe(context) {
  const fs = require('fs'), path = require('path');
  const result = {tokensArray:Array.isArray(context.nginxTokens),tokenCountNonzero:Array.isArray(context.nginxTokens)&&context.nginxTokens.length>0,smokePortNumber:typeof context.smokePort==='number',smokePortValid:Number.isSafeInteger(context.smokePort)&&context.smokePort>0&&context.smokePort<=65535,inspectNginxEntered:globalThis.__lensInspectNginxEntered===true,inspectNginxCompleted:globalThis.__lensInspectNginxCompleted===true,captureHookReached:globalThis.__lensCaptureHookReached===true, topType: 'unavailable', parsePassed: false, appsPresent: false, appsArray: false, appsCount: 0, singleAppPresent: false, singleAppArray: false, appNamePresent: false, appScriptPresent: false, appCwdPresent: false ,nameMatchesRuntime:false,scriptMatchesRuntime:false,cwdMatchesRuntime:false,watchExplicitFalse:false,watchAbsent:false};
  try {
    const file = path.join(context.serviceCwd, 'pm2.conf.json');
    __regular(file);
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    result.parsePassed = true;
    result.topType = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'object' ? 'object' : 'other';
    result.appsPresent = !!value && Object.prototype.hasOwnProperty.call(value, 'apps');
    result.appsArray = result.appsPresent && Array.isArray(value.apps);
    const apps = Array.isArray(value) ? value : result.appsArray ? value.apps : result.appsPresent ? [value.apps] : [value];
    result.appsCount = apps.length;
    const app = apps.length === 1 ? apps[0] : null;
    result.singleAppPresent = !!app && typeof app === 'object';
    result.singleAppArray = Array.isArray(app);
    result.appNamePresent = result.singleAppPresent && typeof app.name === 'string';
    result.appScriptPresent = result.singleAppPresent && typeof app.script === 'string';
    result.appCwdPresent = result.singleAppPresent && typeof app.cwd === 'string';
result.nameMatchesRuntime=!!app && app.name===context.runtime.name;
result.watchExplicitFalse=!!app && app.watch===false;result.watchAbsent=!!app && app.watch===undefined;
if (app && typeof app.script==='string' && (app.cwd===undefined || typeof app.cwd==='string')) { const resolvedCwd=fs.realpathSync(path.resolve(context.serviceCwd,app.cwd||'.')); result.cwdMatchesRuntime=resolvedCwd===fs.realpathSync(context.runtime.cwd); result.scriptMatchesRuntime=fs.realpathSync(path.resolve(resolvedCwd,app.script))===fs.realpathSync(context.runtime.script); }
  } catch (_) {}
  return result;
}

async function __lensControl() {
  // Library warnings, entity imports, and PM2 diagnostics never reach SSH output.
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  let context;
  try { context = globalThis.__lensCapture(); } catch (_) { return __lensFailure('context_unavailable'); }
  if (__lensRequest.mode === "config_probe") { __lensEmit(__configShapeProbe(context)); return; }
  if (__lensRequest.mode === 'cleanup') {
    const report = __baseResult();
    report.mode = 'deploy';
    try {
      const owned = __ownedStage(context, __lensRequest);
      __fs.rmSync(owned, { recursive: true });
      report.ok = true;
      report.cleanup_succeeded = true;
      report.error = 'none';
    } catch (_) {
      report.error = 'cleanup_failed';
      report.evidence_retained = true;
      report.cleanup_succeeded = false;
    }
    __lensEmit(report);
    return;
  }
const checked = __preflight(context), request = __lensRequest;
  if (!checked.report.ok || request.mode === 'preflight') return __lensEmit(checked.report);
  checked.report.mode = 'deploy';
  if (request.deploy !== true || !/^[0-9a-f]{32}$/.test(request.release_id || '')) {
    checked.report.ok = false; checked.report.error = 'deploy_gate_required'; return __lensEmit(checked.report);
  }
  if (request.mode === 'stage') {
    const stage = __path.join(__path.dirname(context.serviceCwd), '.lens-stage-' + request.release_id);
    __fs.mkdirSync(stage, { mode: 0o700 });
    __write600(__path.join(stage, 'stage-owner.json'), JSON.stringify({ version: 1, project: __owner(context), release: request.release_id }));
    return __lensEmit(checked.report, { stage });
  }
  return __deploy(context, checked.config, request, checked.report);
}

function __tree(root) {
  root = __directory(root);
  const records = [];
  function walk(directory) {
    for (const name of __fs.readdirSync(directory).sort()) {
      const file = __path.join(directory, name), s = __fs.lstatSync(file), relative = __path.relative(root, file);
      if (s.isSymbolicLink()) {
        const link = __fs.readlinkSync(file);
        if (__path.isAbsolute(link) || !__below(root, __fs.realpathSync(file))) __fail('dependency_closure_invalid');
        records.push([relative, 'link', link]);
      } else if (s.isDirectory()) {
        records.push([relative, 'dir', s.mode & 0o777]); walk(file);
      } else if (s.isFile() && !(s.mode & 0o7000)) {
        records.push([relative, 'file', s.mode & 0o777, __hash(__fs.readFileSync(file))]);
      } else __fail('dependency_closure_invalid');
    }
  }
  walk(root);
  return { hash: __hash(Buffer.from(JSON.stringify(records))), records };
}
function __copyTree(source, destination) {
  const expected = __tree(source).hash;
  __fs.cpSync(source, destination, { recursive: true, dereference: false, verbatimSymlinks: true, errorOnExist: true, force: false });
  if (__tree(source).hash !== expected || __tree(destination).hash !== expected) __fail('backup_verification_failed');
  return expected;
}
function __fileWorker(stage, request) {
  const result = __cp.spawnSync('python3', ['-B', 'lens_production_file_worker.py'], {
    cwd: stage, input: JSON.stringify(request), encoding: 'utf8', timeout: 600000,
    maxBuffer: 1024 * 1024, env: { PATH: process.env.PATH, PYTHONDONTWRITEBYTECODE: '1' },
  });
  if (result.status !== 0 || result.error) __fail('file_transaction_failed');
  let response; try { response = JSON.parse(result.stdout); } catch (_) { __fail('file_transaction_failed'); }
  if (!response || typeof response.ok !== 'boolean') __fail('file_transaction_failed');
  return response;
}
function __ownedStage(context, request) {
  const expected = __path.join(__path.dirname(context.serviceCwd), '.lens-stage-' + request.release_id);
  if (request.stage !== expected || (__fs.lstatSync(__safePath(expected)).mode & 0o777) !== 0o700) __fail('stage_invalid');
  __regular(__path.join(expected, 'stage-owner.json'));
  const owner = JSON.parse(__fs.readFileSync(__path.join(expected, 'stage-owner.json')));
  if (owner.version !== 1 || owner.project !== __owner(context) || owner.release !== request.release_id) __fail('stage_invalid');
  return expected;
}
function __pm2Call(pm2, method, ...args) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('supervisor_timeout')), 60000);
    pm2[method](...args, (error, result) => { clearTimeout(timer); error ? reject(error) : resolve(result); });
  });
}
async function __current(pm2, context) {
  const rows = await __pm2Call(pm2, 'list');
  return rows.filter(row => row.name === context.runtime.name && row.pm2_env
    && row.pm2_env.pm_cwd === context.serviceCwd && row.pm2_env.pm_exec_path === context.runtime.script);
}
function __persistStartupConfig(context, config, clearEnvironment, environmentOverride) {
  const parsed = JSON.parse(config.raw);
  const apps = Array.isArray(parsed) ? parsed : (Array.isArray(parsed.apps) ? parsed.apps : [parsed.apps || parsed]);
  if (apps.length !== 1 || !apps[0] || typeof apps[0] !== 'object') __fail('runtime_config_changed');
  const app = apps[0];
  app.name = context.runtime.name;
  app.cwd = context.serviceCwd;
  if (app.env !== undefined && (!app.env || typeof app.env !== 'object' || Array.isArray(app.env))) __fail('runtime_config_changed');
  app.env = {...(app.env || {}), INIT_DB_ON_BOOT: 'false'};
  if (environmentOverride !== undefined) {
    if (!environmentOverride || typeof environmentOverride.ACADEMIC_API_URL !== 'string' || !environmentOverride.ACADEMIC_API_URL) throw new Error('academic_transaction_failed');
    app.env.ACADEMIC_API_URL = environmentOverride.ACADEMIC_API_URL;
  }
  if (clearEnvironment) for (const key of ['LENS_ACADEMIC_INTERNAL_SECRET','LENS_ACADEMIC_WORKSPACE_ROOT','PATH_LOGGING','PATH_PRIVATE_UPLOAD','ACADEMIC_TEMP_ROOT']) delete app.env[key];
  const current = __fs.readFileSync(config.file);
  if (!current.equals(config.raw) && (!config.effectiveRaw || !current.equals(config.effectiveRaw))) __fail('runtime_config_changed');
  const effective = Buffer.from(JSON.stringify(parsed));
  const temporary = config.file + '.lens-release-' + __crypto.randomBytes(12).toString('hex');
  let created = false, descriptor;
  try {
    descriptor = __fs.openSync(temporary, 'wx', 0o600); created = true;
    __fs.writeFileSync(descriptor, effective); __fs.fsyncSync(descriptor);
    __fs.closeSync(descriptor); descriptor = undefined;
    __fs.renameSync(temporary, config.file); created = false; config.effectiveRaw = effective;
    const directory = __fs.openSync(__path.dirname(config.file), 'r');
    try { __fs.fsyncSync(directory); } finally { __fs.closeSync(directory); }
  } finally {
    if (descriptor !== undefined) try { __fs.closeSync(descriptor); } catch (_) {}
    if (created) try { __fs.unlinkSync(temporary); } catch (_) {}
  }
  if (!__fs.readFileSync(config.file).equals(effective)) __fail('runtime_config_changed');
}

async function __start(pm2, context, config, clearEnvironment = false, environmentOverride) {
  __persistStartupConfig(context, config, clearEnvironment, environmentOverride);
  const current = await __current(pm2, context);
  if (current.length > 1) __fail('start_failed');
  if (current.length === 1) await __pm2Call(pm2, 'delete', current[0].pm_id);
  const app = { ...config.app,name:context.runtime.name, cwd: context.serviceCwd, script: context.runtime.script,
    args: context.runtime.args === undefined ? config.app.args : context.runtime.args,
    interpreter: context.runtime.interpreter || config.app.interpreter,
    env: { ...(config.app.env || {}), ...(context.runtime.environment || {}), ...(environmentOverride || {}), INIT_DB_ON_BOOT: 'false' },
    watch: false, instances: 1 };
if(clearEnvironment) for(const key of ['LENS_ACADEMIC_INTERNAL_SECRET','LENS_ACADEMIC_WORKSPACE_ROOT','PATH_LOGGING','PATH_PRIVATE_UPLOAD','ACADEMIC_TEMP_ROOT']) delete app.env[key];
  // The same forced flag is used for both the new application and old-code recovery.
  await __pm2Call(pm2, 'start', app);
  const deadline = Date.now() + 30000;
  do {
    const rows = await __current(pm2, context);
    if (rows.length === 1) {
      const env = rows[0].pm2_env;
      if (String(env.INIT_DB_ON_BOOT ?? (env.env || {}).INIT_DB_ON_BOOT) !== 'false') {
        await __pm2Call(pm2, 'stop', rows[0].pm_id); __fail('start_failed');
      }
      if (env.status === 'online') return;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  __fail('start_failed');
}
async function __metadata(service, database) {
  const files = [];
  function scan(directory) {
    for (const item of __fs.readdirSync(directory, { withFileTypes: true })) {
      const file = __path.join(directory, item.name);
      if (item.isSymbolicLink()) __fail('migration_blocked');
      if (item.isDirectory()) scan(file);
      else if (item.isFile() && item.name.endsWith('.entity.js')) files.push(file);
    }
  }
  scan(__path.join(service, 'dist'));
  if (!files.length) __fail('migration_blocked');
  const typeorm = require(__path.join(service, 'node_modules', 'typeorm'));
  const dataSource = new typeorm.DataSource({ type: 'mysql', host: database.host, port: Number(database.port || 3306),
    username: database.user, password: database.password, database: database.database,
    entities: files, synchronize: false, migrationsRun: false });
  await dataSource.buildMetadatas();
  if (dataSource.entityMetadatas.length !== files.length) __fail('migration_blocked');
  return dataSource.entityMetadatas;
}
async function __smoke(context, hashes) {
  const deadline = Date.now() + 10000;
  for (let attempt = 0; ; attempt++) {
    try {
      await __smokeOnce(context, hashes);
      return;
    } catch (error) {
      const retryable = ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(error?.code);
      if (!retryable || attempt >= 39 || Date.now() >= deadline) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
}

async function __smokeOnce(context, hashes) {
  const port = Number(context.smokePort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) __fail('smoke_failed');
  for (const kind of ['chat', 'admin']) {
    const resource = kind === 'chat' ? '/' : (context.staticRoutes?.admin || '/admin').replace(/\/$/, '') + '/';
    if (!/^\/(?:[A-Za-z0-9_-]+\/)*$/.test(resource)) __fail('smoke_failed');
    const response = await new Promise((resolve, reject) => {
      const request = __http.get({ hostname: '127.0.0.1', port, path: resource, timeout: 10000 }, res => {
        const body = []; let size = 0;
        res.on('data', data => { size += data.length; if (size > 16 * 1024 * 1024) request.destroy(); else body.push(data); });
        res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(body) }));
      });
      request.on('error', reject); request.on('timeout', () => request.destroy(new Error('timeout')));
    });
    if (response.status !== 200 || __hash(response.body) !== hashes[kind]) __fail('smoke_failed');
  }
}
async function __academicInvoke(bridge, operation, options) { try { return await bridge[operation](options); } catch (error) {
    const academicErrors = new Set([
      "academic_context_invalid",
      "academic_controller_failed",
      "academic_route_invalid",
      "academic_ready_failed",
      "academic_restore_failed",
      "academic_manager_failed",
      "academic_apply_failed",
      "academic_cleanup_failed"
    ]);
    __fail(academicErrors.has(error?.lensCode) ? error.lensCode : 'academic_transaction_failed');
  } }

async function __deploy(context, config, request, report) {
let academic, maintenance;

  let stage, bundle, pm2, connection, backup, oldDependencies, newDependencies, migrationPlan, migrationCore;
  let stopped = false, filesApplied = false, dependenciesSwapped = false, schemaTouched = false, oldCompatible = false;
  const oldIndexes = {};
  report.ok = false;
  let committed = false;
  try {
    if (request.mode !== 'deploy' || request.source_attested !== true || !Array.isArray(request.entries) || !request.entries.length) __fail('artifact_invalid');
    stage = __ownedStage(context, request);
    if (!Number.isInteger(Number(context.smokePort)) || Number(context.smokePort) < 1 || Number(context.smokePort) > 65535) __fail('smoke_failed');
    if (__hash(__fs.readFileSync(__path.join(stage,'lens_download_boundary.cjs'))) !== __lensDownloadBoundaryHash) __fail('download_boundary_failed');
const downloadSnapshot=__lensDownloadBoundary.captureDownloadBoundary({serviceCwd:context.serviceCwd});
const unpacked = __fileWorker(stage, { ...request, action: 'unpack' });
    if (!unpacked.ok) __fail('artifact_invalid');
    report.artifact_checked = true; report.artifact_file_count = request.entries.length; report.source_attestation_present = true;
    const serviceStage = __path.join(stage, 'service'); __fs.mkdirSync(serviceStage, { mode: 0o700 });

for (const file of ['package.json','pnpm-lock.yaml','pnpm-workspace.yaml']) __fs.copyFileSync(__path.join(stage, 'artifacts', 'service', file), __path.join(serviceStage, file), __fs.constants.COPYFILE_EXCL);
    __fs.cpSync(__path.join(stage, 'artifacts', 'service', 'dist'), __path.join(serviceStage, 'dist'), { recursive: true });
    const home = __path.join(stage, 'home'); __fs.mkdirSync(home, { mode: 0o700 });
    const install = __cp.spawnSync('pnpm', ['install', '--prod', '--frozen-lockfile', '--ignore-scripts',
      '--registry=https://registry.npmjs.org/', '--store-dir=.store', '--package-import-method=copy'],
      { cwd: serviceStage, timeout: 1200000, maxBuffer: 1024 * 1024, encoding: 'utf8',
        env: { PATH: process.env.PATH, HOME: home, CI: '1', NPM_CONFIG_USERCONFIG: '/dev/null', NPM_CONFIG_GLOBALCONFIG: '/dev/null',
          npm_config_registry: 'https://registry.npmjs.org/', npm_config_ignore_scripts: 'true',
          npm_config_manage_package_manager_versions: 'false' } });
    if (install.status !== 0 || install.error) __fail('dependency_install_failed');
    // Resolve TypeORM from the verified isolated install without changing module globals.
    for (const name of ['lens_additive_migration.cjs', 'attachment_schema_plan.cjs']) {
      __regular(__path.join(stage, name));
      __fs.copyFileSync(__path.join(stage, name), __path.join(serviceStage, name), __fs.constants.COPYFILE_EXCL);
    }
const dependencyGraph=require(__path.join(stage,'lens_dependency_closure.cjs')).verify({lockfilePath:__path.join(serviceStage,'pnpm-lock.yaml'),nodeModulesPath:__path.join(serviceStage,'node_modules'),packagePath:__path.join(serviceStage,'package.json'),workspacePath:__path.join(serviceStage,'pnpm-workspace.yaml')});
if(!dependencyGraph.passed)__fail('dependency_closure_invalid'); report.dependency_closure_verified = true;
    newDependencies = __tree(__path.join(serviceStage, 'node_modules')).hash;
    process.env.INIT_DB_ON_BOOT = 'false';
    const newMetadata = await __metadata(serviceStage, context.database);
    const mysql = require(__path.join(serviceStage, 'node_modules', 'mysql2', 'promise'));
    connection = await mysql.createConnection({ ...context.database, port: Number(context.database.port || 3306),
      multipleStatements: false, supportBigNumbers: true, bigNumberStrings: true, dateStrings: true });
    const databaseCore = require(__path.join(stage, 'lens_database_backup.cjs'));
    migrationCore = require(__path.join(serviceStage, 'lens_additive_migration.cjs'));
    const fingerprint = __hash(Buffer.from(context.database.database));
    migrationPlan = await migrationCore.planAdditiveMigration(connection, newMetadata, { databaseFingerprint: fingerprint });
    if (!migrationPlan.ok) __fail('migration_blocked');
    pm2 = require(context.pm2ModuleRoot); await __pm2Call(pm2, 'connect');
    const current = await __current(pm2, context);
    if (current.length !== 1 || current[0].pm_id !== context.processId) __fail('context_unavailable');

    for (const kind of ['chat', 'admin']) oldIndexes[kind] = __hash(__fs.readFileSync(__path.join(context.serviceCwd, 'public', kind, 'index.html')));
    const namespace = __path.join(__path.dirname(context.serviceCwd), '.lens-release-bundles');
    if (!__fs.existsSync(namespace)) {
      __fs.mkdirSync(namespace, { mode: 0o700 });
      __write600(__path.join(namespace, 'owner.json'), JSON.stringify({ version: 1, project: __owner(context) }));
    }
    __directory(namespace);
    const owner = JSON.parse(__fs.readFileSync(__path.join(namespace, 'owner.json')));
    if (owner.version !== 1 || owner.project !== __owner(context) || (__fs.statSync(namespace).mode & 0o777) !== 0o700) __fail('stage_invalid');
    bundle = __path.join(namespace, request.release_id); __fs.mkdirSync(bundle, { mode: 0o700 });
    report.evidence_retained = true;
    __write600(__path.join(bundle, 'pm2.conf.json'), config.raw);
    __write600(__path.join(bundle, 'control.json'), JSON.stringify({ version: 1, project: __owner(context), init_db_on_boot: false,
      config_hash: __hash(config.raw), config_mode: config.mode, old_indexes: oldIndexes }));
    maintenance = __lensMaintenance.prepare({files:globalThis.__lensNginxFiles,runtime:globalThis.__lensNginxRuntime,
      hosts:__lensDownloadBoundary.selectPublicHosts(context.nginxTokens,context.smokePort),
      parse:__lensDownloadBoundary.parseTokens,tokenize:__lensDownloadBoundary.tokenizeNginx,bundle});
    const configProbe = __path.join(bundle, 'config-restore-probe');
    __fs.copyFileSync(__path.join(bundle, 'pm2.conf.json'), configProbe, __fs.constants.COPYFILE_EXCL);
    if (!__fs.readFileSync(configProbe).equals(config.raw)) __fail('backup_verification_failed');
    __fs.unlinkSync(configProbe);
    oldDependencies = __copyTree(__path.join(context.serviceCwd, 'node_modules'), __path.join(bundle, 'dependencies'));
    const probe = __path.join(bundle, 'dependency-restore-probe');
    if (__copyTree(__path.join(bundle, 'dependencies'), probe) !== oldDependencies) __fail('backup_verification_failed');
    __fs.rmSync(probe, { recursive: true });
    __write600(__path.join(bundle, 'dependencies.json'), JSON.stringify({ hash: oldDependencies }));
    try { academic=await require(__path.join(stage,'lens_academic_release.cjs')).prepare({stage,bundle,releaseId:request.release_id,nodeCwd:context.serviceCwd,privateStorage:context.privateStorage,entries:request.entries,pm2,pm2Call:__pm2Call}); } catch (_) { __fail('academic_transaction_failed'); }
backup = await databaseCore.createDatabaseBackup(connection, { databaseFingerprint: fingerprint, bundleDirectory: __path.join(bundle, 'database') });
    if (!backup.ok) {
      report.needs_manual_review = !!backup.needs_manual_review;
      __fail('database_backup_failed');
    }
    const restoreConnection = await mysql.createConnection({ ...context.database, port: Number(context.database.port || 3306),
      multipleStatements: false, supportBigNumbers: true, bigNumberStrings: true, dateStrings: true });
    let verified;
    try {
      verified = await databaseCore.verifyDatabaseBackupInSession(connection, backup, restoreConnection);
    } finally {
      try { await restoreConnection.end(); }
      catch (_) { report.needs_manual_review = true; __fail('database_backup_failed'); }
    }
    if (!databaseCore.isVerifiedDatabaseBackup(connection, verified)) {
      report.needs_manual_review = !!verified.needs_manual_review; __fail('database_backup_failed');
    }
    report.database_restore_verified = true;
    const filePreparation = await __fileWorker(stage, { action: 'files_preflight', stage, target: context.serviceCwd, bundle,
      release_id: request.release_id, entries: request.entries });
    if (!filePreparation.ok) {
      const preflightErrors = new Set(['invalid_input','unsafe_path','protected_path','unsupported_file','source_changed','baseline_changed','io_failed','busy','target_unsupported','target_mode_unsafe','target_directory_unsupported','artifact_unsupported','static_target_mismatch','static_asset_name_invalid','chat_static_target_mismatch','admin_static_target_mismatch']);
      __fail(preflightErrors.has(filePreparation.error) ? 'file_preflight_' + filePreparation.error : 'file_transaction_failed');
    }
    stopped = true;
report.production_changed = true;

    await __pm2Call(pm2, 'stop', context.processId);
await __academicInvoke(academic,'stop');
    const migration = await migrationCore.executeAdditiveMigration(connection, newMetadata, migrationPlan);
    schemaTouched = migration.create_tables > 0 || migration.add_columns > 0 || migration.needs_manual_review;
    report.schema_retained = schemaTouched;
    if (!migration.ok) { report.needs_manual_review = !!migration.needs_manual_review; __fail('migration_blocked'); }
    const compatibility = await migrationCore.verifyHistoricalSchemaCompatibility(connection, migrationPlan);
    oldCompatible = compatibility.ok && compatibility.data_preserved === true;
    if (!oldCompatible) __fail('migration_blocked');
    const applied = __fileWorker(stage, { action: 'files', stage, target: context.serviceCwd, bundle,
      release_id: request.release_id, entries: request.entries });
    filesApplied = !!applied.backup_verified;
    if (!applied.ok) { report.needs_manual_review = !!applied.manual_intervention; __fail('file_transaction_failed'); }
    report.backup_verified = true;
    const runtimeModules = __path.join(context.serviceCwd, 'node_modules');
    if (__tree(runtimeModules).hash !== oldDependencies) __fail('dependency_swap_failed');
    __fs.renameSync(runtimeModules, __path.join(stage, 'old-node_modules'));
    try { __fs.renameSync(__path.join(serviceStage, 'node_modules'), runtimeModules); dependenciesSwapped = true; }
    catch (e) { __fs.renameSync(__path.join(stage, 'old-node_modules'), runtimeModules); throw e; }
    if (__tree(runtimeModules).hash !== newDependencies) __fail('dependency_swap_failed');
    if (!__fs.existsSync(context.privateStorage)) __fs.mkdirSync(context.privateStorage, { recursive: true, mode: 0o700 });
    __directory(context.privateStorage);
    await __academicInvoke(academic,'apply');
await __academicInvoke(academic,'startNew');
await __start(pm2, context, config,true, await __academicInvoke(academic, 'nodeEnvironment', context.runtime.environment)); report.application_started = true;
    const hashes = {};
    for (const kind of ['chat', 'admin']) {
      const entry = request.entries.find(item => item.source === kind + '/dist/index.html');
      if (!entry) __fail('artifact_invalid'); hashes[kind] = entry.sha256;
    }
    await __smoke(context, hashes);
await __academicInvoke(academic,'ready');report.academic_runtime_verified=true; report.smoke_passed = true;
const downloadCheck=await __lensDownloadBoundary.verifyDownloadBoundary({serviceCwd:context.serviceCwd,smokePort:context.smokePort,nginxTokens:context.nginxTokens},
  {snapshot:downloadSnapshot,beforePublic:async()=>{if(maintenance)await maintenance.open(hashes.chat);}});
const downloadErrors=new Set(['boundary_context_invalid','boundary_config_invalid','boundary_origin_unproven','boundary_public_unproven','boundary_snapshot_invalid','boundary_files_changed','boundary_origin_not_denied','boundary_public_not_denied','boundary_request_failed']);
__write600(__path.join(bundle,'download-boundary-checks.json'),JSON.stringify({version:1,
  passed:downloadCheck.passed===true,files_preserved:downloadCheck.filesPreserved===true,
  origin_denied:downloadCheck.originDenied===true,public_denied:downloadCheck.publicDenied===true,
  error:downloadErrors.has(downloadCheck.error)?downloadCheck.error:downloadCheck.passed===true?'none':'download_boundary_failed'}));
if (!downloadCheck.passed || !downloadCheck.filesPreserved || !downloadCheck.originDenied || !downloadCheck.publicDenied) __fail('download_boundary_failed');
report.download_boundary_verified=true;
    if (maintenance && !maintenance.verifyBackup()) __fail('backup_verification_failed');
    if (!__fileWorker(stage, { action: 'verify', bundle }).ok || __tree(__path.join(bundle, 'dependencies')).hash !== oldDependencies
        || !__fs.readFileSync(__path.join(bundle, 'pm2.conf.json')).equals(config.raw)) __fail('backup_verification_failed');
    __write600(__path.join(bundle, 'verified.json'), JSON.stringify({ version: 1, project: __owner(context), bundle_verified: true }));
    // Only explicit, previously verified bundles in this owned namespace qualify.
    committed=true;
await academic.close({committed:true});
for (const name of __fs.readdirSync(namespace)) {
      if (name === request.release_id || !/^[0-9a-f]{32}$/.test(name)) continue;
      const old = __path.join(namespace, name);
      try {
        __directory(old); __regular(__path.join(old, 'verified.json'));
        const state = JSON.parse(__fs.readFileSync(__path.join(old, 'verified.json')));
        if (state.version === 1 && state.project === __owner(context) && state.bundle_verified === true) {
          __fs.rmSync(old, { recursive: true }); report.old_backup_removed_count += 1;
        }
      } catch (_) { /* Unidentified evidence is preserved. */ }
    }
    __fs.rmSync(stage, { recursive: true }); report.cleanup_succeeded = true;  report.ok = true; report.error = 'none';
  } catch (e) {
    if (committed) { report.ok=true; report.error='cleanup_failed'; report.cleanup_succeeded=false; report.evidence_retained=true; } else {
    report.error = e.lensCode || (stopped ? 'rollback_incomplete' : 'context_unavailable');
    if (stopped) {
      report.rollback_attempted = true;
      try {
        if (maintenance) await maintenance.restore();
        if (academic) await __academicInvoke(academic, 'stop');
        if (pm2) for (const row of await __current(pm2, context)) await __pm2Call(pm2, 'stop', row.pm_id);
        if (filesApplied && !__fileWorker(stage, { action: 'restore', bundle, target: context.serviceCwd }).ok) __fail('rollback_incomplete');
        if (dependenciesSwapped) {
          const destination = __path.join(stage, 'restore-node_modules');
          if (__copyTree(__path.join(bundle, 'dependencies'), destination) !== oldDependencies) __fail('rollback_incomplete');
          const runtime = __path.join(context.serviceCwd, 'node_modules');
          if (__tree(runtime).hash !== newDependencies) __fail('rollback_incomplete');
          __fs.renameSync(runtime, __path.join(stage, 'failed-node_modules'));
          __fs.renameSync(destination, runtime);
        }
        if (!__fs.readFileSync(config.file).equals(config.effectiveRaw || config.raw)) __fail('rollback_incomplete');
        if (schemaTouched && !oldCompatible) {
          const compatibility = await migrationCore.verifyHistoricalSchemaCompatibility(connection, migrationPlan);
          oldCompatible = compatibility.ok && compatibility.data_preserved === true;
          if (!oldCompatible) __fail('rollback_incomplete');
        }
        if(academic){await __academicInvoke(academic,'restore');await __academicInvoke(academic,'startOld');}
await __start(pm2, context, config);
        await __smoke(context, oldIndexes);
        report.rollback_completed = true;
      } catch (_) { report.error = 'rollback_incomplete'; report.needs_manual_review = true; }
    }
    if (stage && !report.needs_manual_review && (!stopped || report.rollback_completed)) {
      try { __ownedStage(context, request); __fs.rmSync(stage, { recursive: true }); }
      catch (_) { report.cleanup_succeeded = false; }
    } else if (stage) { report.cleanup_succeeded = false; report.evidence_retained = true; }

    }
} finally {
if(academic)try{await academic.close({committed});}catch(_){report.evidence_retained=true;report.cleanup_succeeded=false;if(committed)report.error='cleanup_failed';}

    if (connection) { try { await connection.end(); } catch (_) { report.needs_manual_review = true; } }
    if (pm2) { try { pm2.disconnect(); } catch (_) { report.needs_manual_review = true; } }
  }
  __lensEmit(report);
}

if (typeof module !== 'undefined') module.exports = { preflight: __preflight, config: __config, safePath: __safePath,
  tree: __tree, copyTree: __copyTree };
