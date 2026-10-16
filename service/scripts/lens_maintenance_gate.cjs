'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const https = require('node:https');

function fail() { throw new Error('maintenance_gate_failed'); }
function hash(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function flatten(nodes) { return nodes.flatMap(node => [node, ...flatten(node.children)]); }
function normalize(word) { return word.replace(/^\(/, '').replace(/\)$/, ''); }

function activeMaster(config) {
  const candidates = [];
  for (const pid of fs.readdirSync('/proc').filter(value => /^\d+$/.test(value))) {
    try {
      if (fs.readFileSync(`/proc/${pid}/comm`, 'utf8').trim() !== 'nginx') continue;
      const command = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8');
      if (!command.startsWith('nginx: master process ') || /(?:^|[\s\0])-g[\s\0]/.test(command)) continue;
      const executable = fs.readlinkSync(`/proc/${pid}/exe`);
      if (path.basename(executable) !== 'nginx') continue;
      const explicit = command.match(/(?:^|[\s\0])-c[\s\0]+([^\s\0]+)/);
      if (explicit && explicit[1] !== config) continue;
      const prefix = command.match(/(?:^|[\s\0])-p[\s\0]+([^\s\0]+)/);
      const args = prefix ? ['-p', prefix[1], '-c', config] : ['-c', config];
      candidates.push({pid: Number(pid), executable, args});
    } catch (_) { /* Processes may exit while the snapshot is collected. */ }
  }
  if (candidates.length !== 1) fail();
  return candidates[0];
}

function atomicWrite(file, value, expected, stat) {
  if (!fs.lstatSync(file).isFile() || fs.realpathSync(file) !== file || !fs.readFileSync(file).equals(expected)) fail();
  const temporary = file + '.lens-' + crypto.randomBytes(12).toString('hex');
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, value);
    fs.fchownSync(descriptor, stat.uid, stat.gid);
    fs.fchmodSync(descriptor, stat.mode & 0o777);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor); descriptor = undefined;
    fs.renameSync(temporary, file);
    const directory = fs.openSync(path.dirname(file), 'r');
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

async function waitForFrontend(host, expectedHash, closed = false) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    const passed = await new Promise(resolve => {
      let done = false;
      const finish = value => { if (!done) { done = true; resolve(value); } };
      const pin = {address: '127.0.0.1', family: 4};
      const request = https.get(new URL('https://' + host + '/'), {
        timeout: 1000,
        lookup: (_host, options, callback) => options?.all ? callback(null, [pin]) : callback(null, pin.address, pin.family),
      }, response => {
        const digest = crypto.createHash('sha256'); let size = 0;
        response.on('data', chunk => {
          size += chunk.length;
          if (size > 4 * 1024 * 1024) { finish(false); response.destroy(); }
          else digest.update(chunk);
        });
        response.on('end', () => finish(closed ? response.statusCode === 503
          : response.statusCode === 200 && digest.digest('hex') === expectedHash));
        response.on('error', () => finish(false));
      });
      request.on('timeout', () => { finish(false); request.destroy(); });
      request.on('error', () => finish(false));
    });
    if (passed) return true;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  return false;
}

function prepare(options) {
  const {files, runtime, hosts, parse, tokenize, bundle} = options;
  if (!(files instanceof Map) || !files.size || !runtime || !path.isAbsolute(runtime.config)
      || !Array.isArray(hosts) || hosts.length !== 1 || typeof parse !== 'function' || typeof tokenize !== 'function') fail();
  const candidates = [];
  for (const [file, raw] of files) {
    const nodes = flatten(parse(tokenize(raw)));
    for (const server of nodes.filter(node => node.words[0] === 'server')) {
      const names = server.children.filter(node => node.words[0] === 'server_name').flatMap(node => node.words.slice(1));
      if (!names.some(name => hosts.includes(name))) continue;
      if (names.some(name => !hosts.includes(name))) fail();
      for (const guard of flatten(server.children).filter(node => node.words[0] === 'if'
          && flatten(node.children).some(child => child.words[0] === 'return' && child.words[1] === '503'))) {
        const words = guard.words.map(normalize);
        if (words.length !== 4 || !/^\$[A-Za-z_][A-Za-z0-9_]*$/.test(words[1]) || words[2] !== '=' || words[3] !== '1'
            || guard.children.length !== 1 || guard.children[0].words.join(' ') !== 'return 503') fail();
        const setters = server.children.filter(node => node.words[0] === 'set' && node.words[1] === words[1]);
        if (setters.length !== 1 || setters[0].words.length !== 3 || !['0','1'].includes(setters[0].words[2])) fail();
        if (setters[0].words[2] === '1') candidates.push({file, raw, variable: words[1]});
      }
    }
  }
  if (!candidates.length) return Object.freeze({required: false, open: async () => {}, restore: async () => {}, verifyBackup: () => true});
  if (candidates.length !== 1) fail();
  const {file, raw, variable} = candidates[0];
  if (!path.isAbsolute(file) || fs.realpathSync(file) !== file || !fs.lstatSync(file).isFile()) fail();
  const before = Buffer.from(raw), stat = fs.statSync(file);
  if (!fs.readFileSync(file).equals(before)) fail();
  const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const setter = new RegExp('(^[ \\t]*set[ \\t]+' + escaped + '[ \\t]+)1([ \\t]*;)', 'gm');
  if ([...raw.matchAll(setter)].length !== 1) fail();
  const after = Buffer.from(raw.replace(setter, (_match, prefix, suffix) => prefix + '0' + suffix));
  const oldTokens = tokenize(raw), newTokens = tokenize(after.toString());
  const changes = oldTokens.map((value, index) => value === newTokens[index] ? -1 : index).filter(index => index !== -1);
  if (oldTokens.length !== newTokens.length || changes.length !== 1) fail();
  const index = changes[0];
  if (oldTokens[index] !== '1' || newTokens[index] !== '0' || oldTokens[index - 1] !== variable || oldTokens[index - 2] !== 'set') fail();
  const master = options.master || activeMaster(runtime.config);
  if (options.inspectOnly === true) return Object.freeze({required: true});
  const validate = options.validate || (() => {
    const check = childProcess.spawnSync(master.executable, ['-t', ...master.args], {timeout: 10000, maxBuffer: 1048576});
    return !check.error && check.status === 0;
  });
  const reload = options.reload || (() => process.kill(master.pid, 'SIGHUP'));
  const wait = options.waitForOpen || waitForFrontend;
  const snapshot = Buffer.from(JSON.stringify({version: 1, file, root_config: runtime.config,
    original: before.toString('base64'), opened: after.toString('base64'), original_hash: hash(before),
    mode: stat.mode & 0o777, uid: stat.uid, gid: stat.gid}));
  const evidence = path.join(bundle, 'nginx-maintenance-backup.json');
  fs.writeFileSync(evidence, snapshot, {mode: 0o600, flag: 'wx'});
  let changed = false;
  function verifyBackup() {
    if (!fs.readFileSync(evidence).equals(snapshot) || (fs.statSync(evidence).mode & 0o777) !== 0o600) return false;
    const probe = path.join(bundle, 'nginx-maintenance-restore-probe');
    try {
      fs.writeFileSync(probe, Buffer.from(JSON.parse(snapshot).original, 'base64'), {mode: 0o600, flag: 'wx'});
      return fs.readFileSync(probe).equals(before);
    } finally { if (fs.existsSync(probe)) fs.unlinkSync(probe); }
  }
  if (!verifyBackup()) fail();
  return Object.freeze({required: true, verifyBackup,
    async open(expectedHash) {
      if (changed || !verifyBackup()) fail();
      changed = true;
      atomicWrite(file, after, before, stat);
      if (!validate()) fail();
      reload();
      if (!await wait(hosts[0], expectedHash)) fail();
    },
    async restore() {
      if (!changed) return;
      if (!verifyBackup()) fail();
      if (!fs.readFileSync(file).equals(before)) atomicWrite(file, before, after, stat);
      if (!validate()) fail();
      reload();
      if (!await wait(hosts[0], undefined, true)) fail();
      changed = false;
    },
  });
}

module.exports = {prepare};
