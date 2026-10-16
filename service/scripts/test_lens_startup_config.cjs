'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const source = fs.readFileSync(path.join(__dirname, 'lens_production_release_worker.cjs'), 'utf8');
const managed = ['LENS_ACADEMIC_INTERNAL_SECRET','LENS_ACADEMIC_WORKSPACE_ROOT','PATH_LOGGING','PATH_PRIVATE_UPLOAD','ACADEMIC_TEMP_ROOT'];
function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-config-contract-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  const file = path.join(root, 'pm2.conf.json');
  const environment = Object.fromEntries(managed.map(key => [key, 'synthetic-old-value']));
  environment.INIT_DB_ON_BOOT = 'true';
  environment.SYNTHETIC_PRESERVED = 'synthetic-preserved';
  const originalApp = {name:'synthetic-config-name', script:'synthetic.js', env:environment};
  const value = options.shape === 'array' ? [originalApp] : options.shape === 'direct' ? originalApp : options.shape === 'object-app' ? {apps:originalApp} : {apps:[originalApp]};
  const raw = Buffer.from(JSON.stringify(value));
  fs.writeFileSync(file, raw, {mode:0o644});
  const sandbox = {
    require(name) { if (name === 'fs') return options.fs || fs; if (name === 'crypto') return options.crypto || crypto; return require(name); },
    process:{stdout:{write(){return true;}},stderr:{write(){return true;}},env:{}},
    Buffer, setTimeout, clearTimeout, URL,
  };
  vm.createContext(sandbox);
  vm.runInContext(source + '\nglobalThis.__persist=__persistStartupConfig;', sandbox);
  const context = {serviceCwd:root,runtime:{name:'synthetic-runtime-name'}};
  const config = {file,raw};
  const readApp = () => { const current=JSON.parse(fs.readFileSync(file)); return Array.isArray(current)?current[0]:Array.isArray(current.apps)?current.apps[0]:current.apps||current; };
  return {root,file,raw,config,context,readApp,persist:(clear, environmentOverride) =>sandbox.__persist(context,config,clear, environmentOverride)};
}
for (const shape of ['wrapped','object-app','array','direct']) {
  test('persists verified runtime identity and disabled boot flag in '+shape, t => {
    const f=fixture(t,{shape});f.persist(true);
    const app=f.readApp();
    assert.equal(app.name,f.context.runtime.name);
    assert.equal(app.cwd,f.context.serviceCwd);
    assert.equal(app.env.INIT_DB_ON_BOOT,'false');
    assert.equal(app.env.SYNTHETIC_PRESERVED,'synthetic-preserved');
    assert.ok(managed.every(key=>!Object.hasOwn(app.env,key)));
    assert.equal(fs.statSync(f.file).mode&0o777,0o600);
    assert.ok(f.config.raw.equals(f.raw));
    assert.equal(fs.readdirSync(f.root).length,1);
  });
  test('selected startup URL persists while unrelated runtime values stay in memory', (t) => {
    const state = fixture(t,{shape});
    const application = value => Array.isArray(value) ? value[0] : value.apps ? (Array.isArray(value.apps) ? value.apps[0] : value.apps) : value;
    try {
      state.persist(true, {ACADEMIC_API_URL:'http://127.0.0.1:19081', SYNTHETIC_RUNTIME_ONLY:'memory-only'});
      const current = JSON.parse(fs.readFileSync(state.file, 'utf8'));
      assert.equal(application(current).env.ACADEMIC_API_URL, 'http://127.0.0.1:19081');
      assert.equal(application(current).env.SYNTHETIC_RUNTIME_ONLY, undefined);
      assert.equal(state.config.raw, state.raw);
      state.persist(false);
      const restored = application(JSON.parse(fs.readFileSync(state.file, 'utf8')));
      const original = application(JSON.parse(state.raw));
      assert.equal(restored.env.ACADEMIC_API_URL, original.env.ACADEMIC_API_URL);
      assert.equal(restored.env.INIT_DB_ON_BOOT, 'false');
    } finally { fs.rmSync(state.root, {recursive:true, force:true}); }
  });

}
test('rollback restores original environment while keeping boot disabled',t=>{
  const f=fixture(t);f.persist(true);f.persist(false);
  const app=f.readApp();
  assert.equal(app.env.INIT_DB_ON_BOOT,'false');
  assert.ok(managed.every(key=>app.env[key]==='synthetic-old-value'));
  assert.ok(f.config.raw.equals(f.raw));
  assert.equal(fs.readdirSync(f.root).length,1);
});
test('refuses to overwrite unknown concurrent configuration changes',t=>{
  const f=fixture(t);const changed=Buffer.from(JSON.stringify({synthetic_external_change:true}));
  fs.writeFileSync(f.file,changed);
  assert.throws(()=>f.persist(true),error=>error.lensCode==='runtime_config_changed');
  assert.ok(fs.readFileSync(f.file).equals(changed));
  assert.equal(fs.readdirSync(f.root).length,1);
});
test('cleans its exclusive temporary file after a partial write failure',t=>{
  let injected=false;
  const adapter=new Proxy(fs,{get(target,key){if(key==='writeFileSync')return function(destination,...args){if(typeof destination==='number'&&!injected){injected=true;throw new Error('synthetic_write_failure');}return target.writeFileSync(destination,...args);};return target[key];}});
  const f=fixture(t,{fs:adapter});assert.throws(()=>f.persist(true));
  assert.ok(injected);assert.ok(fs.readFileSync(f.file).equals(f.raw));
  assert.equal(fs.readdirSync(f.root).length,1);
});
test('an exclusive-open collision never removes an unowned file',t=>{
  const fixed=Buffer.alloc(12,1);const adapter={...crypto,randomBytes(){return fixed;}};
  const f=fixture(t,{crypto:adapter});const temporary=f.file+'.lens-release-'+fixed.toString('hex');
  fs.writeFileSync(temporary,'synthetic-unowned');assert.throws(()=>f.persist(true));
  assert.equal(fs.readFileSync(temporary,'utf8'),'synthetic-unowned');
  assert.ok(fs.readFileSync(f.file).equals(f.raw));
});
