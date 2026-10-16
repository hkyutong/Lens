'use strict';

// This harness accepts only locally generated synthetic fixtures.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const cp = require('child_process');

async function run(input) {
  const context = input.context;
  const stage = input.stage;
  const events = [];
  const data = ['original'];
  let status = 'online';
  let academicOnline = true, academicNew = false;
  let starts = 0;
  let smokes = 0;
  let injected = false;
  let report;
  let captured;








  const startupFlags = [];
const startupEnvironmentChecks=[];
  const database = { async end() {}, async query() { return [[], []]; } };
  const backup = {
    async createDatabaseBackup(connection, options) {
      events.push('database_backup');
      fs.mkdirSync(options.bundleDirectory, { mode: 0o700 });
      fs.writeFileSync(path.join(options.bundleDirectory, 'synthetic'), 'backup', { mode: 0o600 });
      return { ok: true, verified: false };
    },
    async verifyDatabaseBackupInSession(connection, handle, restoreConnection) {
      if (!restoreConnection || restoreConnection === connection) throw new Error('synthetic_restore_connection_reused');
      events.push('database_restore');
      handle.verified = true;
      return handle;
    },
    isVerifiedDatabaseBackup(connection, handle) { return handle.verified; }
  };
  const migration = {
    async planAdditiveMigration(connection, metadata) {
      return { ok: true, create_tables: metadata.syntheticNew ? 1 : 0, add_columns: 0 };
    },
    async executeAdditiveMigration() {
      if (!events.includes('database_restore')) throw new Error('synthetic_order_failure');
      events.push('migration');
      data.push('new_business_row');
      return { ok: true, create_tables: 1, add_columns: 0, data_preserved: true };
    },
    async verifyHistoricalSchemaCompatibility() {
      events.push('historical_schema_verified');
      return { ok: true, data_preserved: true };
    }
  };
  let activeConfig;
  const pm2 = {
    connect(callback) { callback(null); },
    disconnect() {},
    list(callback) {
      const runtime = context.runtime;
      const environment = activeConfig ? activeConfig.env : runtime.environment;
      callback(null, [{ pm_id: context.processId, name: runtime.name, pm2_env: {
        name: runtime.name, pm_cwd: context.serviceCwd, pm_exec_path: runtime.script,
        exec_mode: runtime.execMode, instances: runtime.instances, watch: false,
        args: runtime.args, exec_interpreter: runtime.interpreter, status,
        ...environment, env: environment
      } }]);
    },
    stop(identity, callback) { events.push('stop'); status = 'stopped'; if (input.fault === 'node_stop_partial' && !events.includes('node_stop_partial_injected')) { events.push('node_stop_partial_injected'); callback(new Error('synthetic_stop_callback_failed')); return; }
callback(null, []); },
    delete(identity, callback) { events.push('delete'); status = 'stopped'; callback(null, []); },
    start(options, callback) {
      starts += 1;
      events.push('start');
      const app = options.apps ? options.apps[0] : options;
      startupFlags.push(app.env && app.env.INIT_DB_ON_BOOT === 'false');
startupEnvironmentChecks.push({cleared:['LENS_ACADEMIC_INTERNAL_SECRET','LENS_ACADEMIC_WORKSPACE_ROOT','PATH_LOGGING','PATH_PRIVATE_UPLOAD','ACADEMIC_TEMP_ROOT'].every(key=>!Object.hasOwn(app.env,key)),preserved:['LENS_ACADEMIC_INTERNAL_SECRET','LENS_ACADEMIC_WORKSPACE_ROOT','PATH_LOGGING','PATH_PRIVATE_UPLOAD','ACADEMIC_TEMP_ROOT'].every(key=>app.env[key]===context.runtime.environment[key])});
      if ((input.fault === 'start' && starts === 1) || (input.fault === 'rollback' && starts > 1)) {
        status = 'stopped';
        callback(new Error('synthetic_start_failure'));
        return;
      }
      activeConfig = app;
      status = 'online';
      callback(null, []);
    }
  };
  const fsAdapter = new Proxy(fs, { get(target, key) {
    if (key === 'renameSync') return (source, destination) => {
      if (input.fault === 'dependency_swap' && !injected &&
          destination === path.join(context.serviceCwd, 'node_modules') &&
          source !== destination && !source.includes('restore')) {
        injected = true;
        events.push('dependency_swap_failure');
        throw new Error('synthetic_swap_failure');
      }
      return target.renameSync(source, destination);
    };
    if (key === 'rmSync') return (targetPath, options) => {
      if (input.fault === 'cleanup' && targetPath === stage && !injected) {
        injected = true;
        fs.rmSync(path.join(stage, 'lens_production_file_worker.py'), { force: true });
        events.push('partial_stage_cleanup');
        throw new Error('synthetic_cleanup_failure');
      }
      return target.rmSync(targetPath, options);
    };
    return target[key];
  } });
  const childAdapter = { ...cp, spawnSync(command, args, options) {
    if (path.basename(command) === 'pnpm') {

      fs.mkdirSync(path.join(options.cwd, 'node_modules', 'synthetic'), { recursive: true });
      fs.writeFileSync(path.join(options.cwd, 'node_modules', 'synthetic', 'index.js'), 'module.exports={};');
      return { status: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) };
    }
    if (path.basename(command) === 'python3') return cp.spawnSync(input.python, args, options);
    return cp.spawnSync(command, args, options);
  } };
  function injectedRequire(name) {
if (String(name).endsWith('lens_academic_release.cjs')) return { prepare:async () => {
      events.push('academic_prepare');
      if (input.fault === 'academic_prepare') throw new Error('academic_transaction_failed');
      const faultsInjected = new Set();
      const invoke = async operation => {
        events.push('academic_' + operation);
        if (operation === 'stop') academicOnline = false;
        if (operation === 'apply') academicNew = true;
        if ((input.fault === 'academic_' + operation || ((input.fault === 'academic_restore' || input.fault === 'academic_startOld') && operation === 'ready')) && !faultsInjected.has(operation)) { faultsInjected.add(operation); events.push('academic_fault_injected'); throw Object.assign(new Error('academic_transaction_failed'), operation === 'ready' ? { lensCode: 'academic_route_invalid' } : {}); }
        if (operation === 'restore') academicNew = false;
        if (operation === 'startNew' || operation === 'startOld') academicOnline = true;
      };
      return {stop:()=>invoke('stop'),apply:()=>invoke('apply'),startNew:()=>invoke('startNew'),ready:()=>invoke('ready'),restore:()=>invoke('restore'),startOld:()=>invoke('startOld'),close:()=>invoke('close'),nodeEnvironment:async environment => {
        await invoke('nodeEnvironment');
        return {...environment,ACADEMIC_API_URL:'http://127.0.0.1:19081',INIT_DB_ON_BOOT:'false'};
      }};
    }};
    if(String(name).endsWith('lens_dependency_closure.cjs'))return {verify(){events.push('lock_graph_verify');return {passed:true,error:'none',count:1};}};

    if (name === 'fs') return fsAdapter;
    if (name === 'child_process') return childAdapter;
    if (name === context.pm2ModuleRoot) return pm2;
    if (name.includes('mysql2/promise')) return { async createConnection() { return { ...database }; } };
    if (name.endsWith('lens_database_backup.cjs')) return backup;
    if (name.endsWith('lens_additive_migration.cjs')) return migration;
    return require(name);
  }
  const sandbox = {
    require: injectedRequire, Buffer, URL,
    setTimeout(callback) { return setTimeout(callback, 1); },
    clearTimeout, setInterval, clearInterval,
    process: { ...process, env: { ...process.env }, stdout: { write() { return true; } }, stderr: { write() { return true; } } },
    __lensRequest: input.request,
    __testContext: context,
    __testFault: input.fault,
    __capture(value) { captured = value; },
    __record(value) {  },

    __metadataHook(service) {
      const rows = [];
      rows.syntheticNew = service !== context.serviceCwd;
      return rows;
    },
    __smokeHook() {
      smokes += 1;
      events.push('smoke');
      if ((input.fault === 'health' || input.fault === 'rollback') && smokes === 1) {
        throw new Error('smoke_failed');
      }
      return Promise.resolve(true);
    }
  , __lensDownloadBoundaryHash: require('crypto').createHash('sha256').update(fs.readFileSync(path.join(stage,'lens_download_boundary.cjs'))).digest('hex'), __lensMaintenance:{prepare(){events.push('maintenance_prepare');return {verifyBackup(){return true;},async open(){events.push('maintenance_open');if(input.fault==='maintenance_open')throw new Error('synthetic_open_failure');},async restore(){events.push('maintenance_restore');}};}},
__lensDownloadBoundary:{selectPublicHosts(){return ['lens.example.test'];},captureDownloadBoundary(){events.push('download_capture');return Object.freeze({legacyFileCount:0});},async verifyDownloadBoundary(_context,options){if(input.fault==='origin_download_boundary')return {passed:false,filesPreserved:true,originDenied:false,publicDenied:false,error:'boundary_origin_not_denied'};events.push('origin_denied');if(options.beforePublic)await options.beforePublic();events.push('download_verify');if(input.fault.startsWith('download_boundary'))return {passed:false,filesPreserved:true,originDenied:true,publicDenied:false,error:input.fault==='download_boundary'?'boundary_request_failed':'synthetic-runtime-detail',unexpected:'synthetic-sensitive-value'};return {passed:true,filesPreserved:true,originDenied:true,publicDenied:true,error:'none'};}}};
  vm.createContext(sandbox);
  const source = fs.readFileSync(input.worker, 'utf8');
  const hooks = ("const __filePreflightFault = " + JSON.stringify(input.fault) + ";\n\n    __lensEmit = __capture;\n    const __originalOwnedStage = __ownedStage;\n    __ownedStage = (...args) => {\n      __record('owner_check');\n      try { return __originalOwnedStage(...args); }\n      catch (error) { __record(['ReferenceError','TypeError','Error'].includes(error.name) ? 'owner_' + error.name : 'owner_other'); throw error; }\n    };\n    const __originalFileWorker = __fileWorker;\n    __fileWorker = (...args) => {\nif (args[1]?.action === 'files_preflight') return {ok: __filePreflightFault !== 'file_preflight'};\n __record('file_worker'); return __originalFileWorker(...args); };\n    __metadata = async service => __metadataHook(service);\n    __dependencyClosure = () => true;\n    __smoke = __smokeHook;\n    globalThis.__run = async()=>{if(__testFault==='cleanup_owned'||__testFault==='cleanup_wrong_owner'){__lensRequest.mode='cleanup';__lensRequest.deploy=true;globalThis.__lensCapture=()=>__testContext;if(__testFault==='cleanup_wrong_owner'){const marker=__path.join(__lensRequest.stage,'stage-owner.json');const owner=JSON.parse(__fs.readFileSync(marker));owner.project='synthetic-wrong-owner';__fs.writeFileSync(marker,JSON.stringify(owner));}return __lensControl();}return (async () => {\n      const config = __config(__testContext);\n      const report = __baseResult();\n      await __deploy(__testContext, config, __lensRequest, report);\n    })();};\n  ");
  const localFixtures = 'globalThis.__lensRequest = JSON.parse(' + JSON.stringify(JSON.stringify(input.request)) + ');' +
    'globalThis.__testContext = JSON.parse(' + JSON.stringify(JSON.stringify(context)) + ');';
  vm.runInContext(localFixtures + source + hooks, sandbox, { timeout: 2000 });
  await sandbox.__run();
  report = captured && (captured.public || captured);
  const parent = path.dirname(context.serviceCwd);
  function countBackups(directory) {
    let count = 0;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      const child = path.join(directory, entry.name);
      if (fs.existsSync(path.join(child, 'database', 'synthetic'))) count += 1;
      if (child !== stage && child !== context.serviceCwd && child !== context.privateStorage) count += countBackups(child);
    }
    return count;
  }
  const downloadEvidence=[];
  function findDownloadEvidence(directory){
    for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
      if(entry.isSymbolicLink())continue;
      const file=path.join(directory,entry.name);
      if(entry.isDirectory())findDownloadEvidence(file);
      else if(entry.name==='download-boundary-checks.json')downloadEvidence.push(file);
    }
  }
  findDownloadEvidence(parent);
  let downloadEvidenceClosed=false,downloadEvidenceError='none';
  if(downloadEvidence.length===1){
    const evidence=JSON.parse(fs.readFileSync(downloadEvidence[0],'utf8'));
    const fields=['version','passed','files_preserved','origin_denied','public_denied','error'];
    const errors=new Set(['none','download_boundary_failed','boundary_context_invalid','boundary_config_invalid','boundary_origin_unproven','boundary_public_unproven','boundary_snapshot_invalid','boundary_files_changed','boundary_origin_not_denied','boundary_public_not_denied','boundary_request_failed']);
    downloadEvidenceClosed=Object.keys(evidence).sort().join(',')===fields.sort().join(',')&&evidence.version===1&&['passed','files_preserved','origin_denied','public_denied'].every(k=>typeof evidence[k]==='boolean')&&errors.has(evidence.error)&&(fs.statSync(downloadEvidence[0]).mode&0o777)===0o600;
    if(errors.has(evidence.error))downloadEvidenceError=evidence.error;
  }
  const oldBytes = Buffer.from('old-service');
  const currentBytes = fs.readFileSync(path.join(context.serviceCwd, 'dist', 'main.js'));
  return {
    download_evidence_present:downloadEvidence.length===1,
    download_evidence_closed:downloadEvidenceClosed,
    download_evidence_error:downloadEvidenceError,
    captured: !!report,
    direct_status_schema: !!captured && typeof captured.ok === 'boolean' && !Object.hasOwn(captured, 'public'),
    success: !!report && report.ok === true,
    cleanup_failed: !!report && report.error === 'cleanup_failed',
    rollback_attempted: !!report && report.rollback_attempted === true,
    rollback_completed: !!report && report.rollback_completed === true,
    needs_manual_review: !!report && report.needs_manual_review === true,
    stage_retained: fs.existsSync(stage),
    backup_count: countBackups(parent),
    app_online: status === 'online',
    academic_online: academicOnline,
    academic_original_restored: !academicNew,
    old_application_restored: currentBytes.equals(oldBytes),
    all_startup_flags_disabled: startupFlags.length > 0 && startupFlags.every(Boolean),
    new_data_retained: data.includes('new_business_row'),
    database_restore_before_migration: events.indexOf('database_restore') >= 0 && events.indexOf('database_restore') < events.indexOf('migration'),
    stops: events.filter(value => value === 'stop').length,
    starts,
    fault_injected: ((injected || input.fault === 'start' || input.fault === 'health' || input.fault === 'rollback') || events.includes('academic_fault_injected')) || events.includes('node_stop_partial_injected'),
    error_category: report && input.allowed_errors.includes(report.error) ? report.error : 'unknown',







       persistent_flag_disabled:(()=>{const value=JSON.parse(fs.readFileSync(path.join(context.serviceCwd,'pm2.conf.json')));const app=Array.isArray(value)?value[0]:Array.isArray(value.apps)?value.apps[0]:value.apps||value;return app.env.INIT_DB_ON_BOOT==='false';})(),new_environment_cleared:input.fault==='dependency_swap'||startupEnvironmentChecks[0]?.cleared===true,rollback_environment_preserved:input.fault==='cleanup'||startupEnvironmentChecks[startupEnvironmentChecks.length-1]?.preserved===true,production_changed:report.production_changed===true,maintenance_opened:events.includes('maintenance_open'),maintenance_open_after_origin_denial:events.indexOf('maintenance_open')>events.indexOf('origin_denied')&&events.includes('origin_denied'),maintenance_restored_before_old_application:events.includes('maintenance_restore')&&events.indexOf('maintenance_restore')<events.indexOf('academic_restore'),partial_stage_cleanup_observed:input.fault==='cleanup'&&fs.existsSync(stage)&&!fs.existsSync(path.join(stage,'lens_production_file_worker.py'))};
}

let raw = '';
process.stdin.on('data', chunk => { raw += chunk; });
process.stdin.on('end', () => run(JSON.parse(raw)).then(
  result => process.stdout.write(JSON.stringify(result)),
  () => process.stdout.write(JSON.stringify({ captured: false, harness_failed: true }))
));
