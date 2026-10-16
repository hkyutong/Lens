"""Read-only production evidence. Only the closed result schema may leave memory."""

import json
import time

from lens_safe_ops import SafeFailure, _silent_boundary, _trusted_connection

BOOL_FIELDS = frozenset({
    'runtimeIdentified', 'runtimeNodeCompatible', 'attachmentSchemaChecked',
    'attachmentTablePresent', 'attachmentSchemaCompatible',
    'attachmentOwnerIndexPresent', 'privateStoragePresent',
    'privateStorageIsSymlink', 'privateStorageOutsidePublic',
    'privateStorageTemporary', 'privateStoragePermissionsRestricted',
    'legacyScanComplete', 'attachmentBoundaryDeployed',
    'nginxLensPathReferenceFound', 'nginxLegacyStaticMappingCandidate',
    'nginxConfigLocated',
    'nginxConfigLoadComplete',
})
COUNT_FIELDS = frozenset({'publicLegacyDocumentCount',
                          'publicLegacyRasterCandidateCount',
                          'publicLegacyOtherFileCount'})


def parse_readiness(payload):
    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('invalid_readiness')
            result[key] = value
        return result

    try:
        if not isinstance(payload, (bytes, bytearray)) or len(payload) > 4096:
            raise ValueError
        value = json.loads(payload, object_pairs_hook=unique_object)
        if type(value) is not dict or set(value) != BOOL_FIELDS | COUNT_FIELDS:
            raise ValueError
        if any(type(value[key]) is not bool for key in BOOL_FIELDS):
            raise ValueError
        if any(type(value[key]) is not int or not 0 <= value[key] <= 100000
               for key in COUNT_FIELDS):
            raise ValueError
        return value
    except Exception:
        raise ValueError('invalid_readiness') from None


NGINX_HELPER = r"""
function inspectNginx(cwd) {
  const snapshot = {nginxLensPathReferenceFound:false, nginxLegacyStaticMappingCandidate:false, nginxConfigLocated:false, nginxConfigLoadComplete:false};
  try {
    let config, executable;
    for (const pid of fs.readdirSync('/proc')) {
      if (!/^\d+$/.test(pid)) continue;
      let command;
      try {
        if (fs.readFileSync('/proc/' + pid + '/comm', 'utf8').trim() !== 'nginx') continue;
        command = fs.readFileSync('/proc/' + pid + '/cmdline', 'utf8');
      } catch (_) { continue; }
      const match = command.match(/(?:^|[\s\0])-c[\s\0]+([^\s\0]+)/);
      if (match && path.isAbsolute(match[1])) { config=match[1]; break; }
      try {
        const candidate=fs.readlinkSync('/proc/'+pid+'/exe');
        if(path.basename(candidate)==='nginx')executable=candidate;
      } catch (_) {}
    }
    if(!config && executable) {
      const version=require('node:child_process').spawnSync(executable,['-V'],{encoding:'utf8',timeout:3000,maxBuffer:1048576});
      if(version.status!==0 || version.error)return snapshot;
      const options=String(version.stdout||'')+' '+String(version.stderr||'');
      const option = name => {
        const match=options.match(new RegExp('--'+name+'=(?:"([^"\\n]+)"|\'([^\'\\n]+)\'|([^\\s]+))'));
        return match && (match[1]||match[2]||match[3]);
      };
      const configured=option('conf-path');
      const prefix=option('prefix');
      if(configured && path.isAbsolute(configured))config=configured;
      else if(configured && prefix && path.isAbsolute(prefix))config=path.resolve(prefix,configured);
    }
    if (!config) return snapshot;
    snapshot.nginxConfigLocated=true;
    let readBytes=0, readFiles=0;
    const active = new Set();
    const base = path.dirname(config);
    const expand = pattern => {
      let paths = [path.parse(pattern).root];
      for (const segment of pattern.slice(path.parse(pattern).root.length).split(path.sep).filter(Boolean)) {
        const next=[];
        for (const parent of paths) {
          if (!/[?*]/.test(segment)) next.push(path.join(parent,segment));
          else {
            const escaped = segment.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g,'.*').replace(/\?/g,'.');
            const matcher = new RegExp('^'+escaped+'$');
            let entries;
            try { entries=fs.readdirSync(parent); }
            catch(error) { if(error.code==='ENOENT')entries=[]; else throw error; }
            for (const name of entries) if (matcher.test(name)) next.push(path.join(parent,name));
          }
        }
        if (next.length > 256) throw new Error('config_limit');
        paths=next;
      }
      return paths;
    };
    const read = file => {
      if (++readFiles>256 || active.has(file)) throw new Error('config_limit');
      active.add(file);
      if (fs.statSync(file).size>1048576) throw new Error('config_limit');
      const raw=fs.readFileSync(file,'utf8');
      readBytes+=Buffer.byteLength(raw);
      if(readBytes>4194304)throw new Error('config_limit');
      // Tokenize quoted strings and comments before recognizing include directives.
      const tokens=raw.match(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|#[^\n]*|[{};]|[^\s{};#]+/g)||[];
      const output=[];
      for(let i=0;i<tokens.length;i++) {
        const token=tokens[i];
        if(token.startsWith('#'))continue;
        if(token==='include') {
          const target=tokens[++i];
          if(!target||tokens[++i]!==';')throw new Error('invalid_config');
          const unquoted=target.replace(/^(['"])(.*)\1$/,'$2');
          if(unquoted.includes('$'))throw new Error('dynamic_include');
          const pattern=path.isAbsolute(unquoted)?unquoted:path.resolve(base,unquoted);
          for(const include of expand(pattern))output.push(...read(include));
        } else output.push(token);
      }
      active.delete(file);
      return output;
    };
    const tokens=read(config);
    snapshot.nginxConfigLoadComplete=true;
    // Record path references and possible static mappings only. A negative result
    // never certifies route isolation, proxy behavior, Lua, or CDN cache state.
    const values=tokens.map(token=>token.replace(/^(['"])(.*)\1$/,'$2'));
    const serviceParent=path.dirname(cwd);
    const roots=[cwd];
    if(/^lens$/i.test(path.basename(serviceParent)))roots.push(serviceParent);
    snapshot.nginxLensPathReferenceFound=values.some(value=>roots.some(root=>value===root||value.startsWith(root+path.sep)));
    const legacy=path.join(cwd,'public','file');
    snapshot.nginxLegacyStaticMappingCandidate=values.some((directive,index)=>{
      if(!['root','alias'].includes(directive))return false;
      const value=values[index+1];
      if(!value||!path.isAbsolute(value)||value.includes('$'))return false;
      const relative=path.relative(value,legacy);
      return relative==='' || relative==='file';
    });
  } catch (_) {}
  return snapshot;
}
"""


NODE_PROGRAM = r"""
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[1];
const rpcPath = process.argv[2];
const boolFields = __BOOL_FIELDS__;
const result = Object.fromEntries(boolFields.map(key => [key, false]));
for(const key of __COUNT_FIELDS__) result[key]=0;
let req;
let db;
let ended = false;
async function finish() {
  if (ended) return;
  ended = true;
  if (req) { try { req.close(); } catch (_) {} }
  if (db) { try { db.destroy(); } catch (_) {} }
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
}
setTimeout(finish, 18000);
const localRequire = (name, cwd) => require(require.resolve(name, {paths: [cwd]}));
__NGINX_HELPER__
function readJson(file) {
  const st = fs.statSync(file);
  if (!st.isFile() || st.size > 1048576) throw new Error('invalid_metadata');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function below(child, parent) {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}
function legacyScan(directory) {
  let seen = 0;
  const pending = [directory];
  if (!fs.existsSync(directory)) return true;
  while (pending.length) {
    const current = pending.pop();
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) return false;
    if (!stat.isDirectory()) return false;
    for (const item of fs.readdirSync(current, {withFileTypes: true})) {
      if (++seen > 100000) return false;
      if (item.isSymbolicLink()) return false;
      if (item.isDirectory()) pending.push(path.join(current, item.name));
      else if (item.isFile() && /\.(txt|tex|pdf|md|docx?|rtf|csv|xlsx?|zip)$/i.test(item.name)) {
        result.publicLegacyDocumentCount++;
      } else if(item.isFile() && /\.(png|jpe?g|gif|webp)$/i.test(item.name)) result.publicLegacyRasterCandidateCount++;
      else if(item.isFile()) result.publicLegacyOtherFileCount++;
    }
  }
  return true;
}
async function inspect(rows) {
  const candidates = rows.filter(row => {
    const env = row && row.pm2_env || {};
    if (!(/lens/i.test(String(row && row.name || '')) || /(^|[\\/])lens([\\/]|$)/i.test(String(env.pm_cwd || '')))) return false;
    try {
      const pkg = readJson(path.join(env.pm_cwd, 'package.json'));
      return Boolean(pkg.dependencies && pkg.dependencies['@nestjs/core']);
    } catch (_) { return false; }
  });
  if (candidates.length !== 1) return finish();
  const env = candidates[0].pm2_env;
  const cwd = fs.realpathSync(env.pm_cwd);
  result.runtimeIdentified = true;
  try {
    const semver = localRequire('semver', root);
    result.runtimeNodeCompatible = semver.satisfies(env.node_version || '', '__NODE_RANGE__');
  } catch (_) {}
  const storage = path.join(cwd, 'private', 'attachments');
  result.privateStorageOutsidePublic = !below(storage, path.join(cwd, 'public'));
  result.privateStorageTemporary = [require('node:os').tmpdir(), '/tmp', '/var/tmp'].some(dir => below(storage, fs.existsSync(dir) ? fs.realpathSync(dir) : dir));
  try {
    const st = fs.lstatSync(storage);
    result.privateStorageIsSymlink = st.isSymbolicLink() || fs.realpathSync(storage) !== storage;
    result.privateStoragePresent = st.isDirectory();
    result.privateStoragePermissionsRestricted = (st.mode & 0o077) === 0;
  } catch (_) {}
  result.attachmentBoundaryDeployed = fs.existsSync(path.join(cwd, 'dist', 'modules', 'attachment', 'legacyUploadStatic.middleware.js'));
  try { result.legacyScanComplete = legacyScan(path.join(cwd, 'public', 'file')); } catch (_) {}
  Object.assign(result, inspectNginx(cwd));
  try {
    let fileEnv = {};
    const envFile = path.join(cwd, '.env');
    if (fs.existsSync(envFile)) {
      if (fs.statSync(envFile).size > 1048576) throw new Error('invalid_environment');
      fileEnv = localRequire('dotenv', cwd).parse(fs.readFileSync(envFile));
    }
    const settings = Object.assign({}, fileEnv, env.env || {}, env);
    if (!['DB_HOST', 'DB_USER', 'DB_DATABASE'].every(key => typeof settings[key] === 'string' && settings[key])) throw new Error('database_unavailable');
    db = await localRequire('mysql2/promise', cwd).createConnection({
      host: settings.DB_HOST, port: Number(settings.DB_PORT || 3306),
      user: settings.DB_USER, password: settings.DB_PASS,
      database: settings.DB_DATABASE, connectTimeout: 6000,
    });
    const [columns] = await db.execute({sql: 'SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, IS_NULLABLE, COLUMN_KEY, COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', timeout: 6000}, ['attachment']);
    result.attachmentSchemaChecked = true;
    result.attachmentTablePresent = columns.length > 0;
    const expected = {id: ['varchar', 36], ownerId: ['int'], storageKey: ['varchar', 40], filename: ['varchar', 180], contentType: ['varchar', 100], byteSize: ['int'], createdAt: ['datetime']};
    result.attachmentSchemaCompatible = columns.length === Object.keys(expected).length && Object.entries(expected).every(([name, definition]) => {
      const column = columns.find(item => item.COLUMN_NAME === name);
      return column && column.DATA_TYPE === definition[0] && column.IS_NULLABLE === 'NO' &&
        (!definition[1] || Number(column.CHARACTER_MAXIMUM_LENGTH) === definition[1]) &&
        (name !== 'id' || column.COLUMN_KEY === 'PRI') &&
        (name !== 'byteSize' || /unsigned/i.test(column.COLUMN_TYPE));
    });
    if (result.attachmentTablePresent) {
      const [indices] = await db.execute({sql: 'SELECT INDEX_NAME, SEQ_IN_INDEX, COLUMN_NAME FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?', timeout: 6000}, ['attachment']);
      const grouped = new Map();
      for (const index of indices) {
        if (!grouped.has(index.INDEX_NAME)) grouped.set(index.INDEX_NAME, []);
        grouped.get(index.INDEX_NAME).push(index);
      }
      result.attachmentOwnerIndexPresent = [...grouped.values()].some(items => items.sort((a,b) => a.SEQ_IN_INDEX-b.SEQ_IN_INDEX).map(item => item.COLUMN_NAME).join(',') === 'ownerId,id');
    }
  } catch (_) {}
  return finish();
}
try {
  const axon = localRequire('pm2-axon', root);
  const RPC = localRequire('pm2-axon-rpc', root);
  req = axon.socket('req');
  req.on('error', finish);
  const client = new RPC.Client(req);
  req.connect(rpcPath);
  client.call('getMonitorData', {}, (err, rows) => {
    if (err || !Array.isArray(rows) || rows.length > 4096) return finish();
    inspect(rows).catch(finish);
  });
} catch (_) { finish(); }
""".replace('__BOOL_FIELDS__', json.dumps(sorted(BOOL_FIELDS))).replace('__COUNT_FIELDS__', json.dumps(sorted(COUNT_FIELDS))).replace('__NODE_RANGE__', '>=20.0.0').replace('__NGINX_HELPER__', NGINX_HELPER)


def remote_program():
    # Discover the existing PM2 socket without starting a daemon or writing files.
    return r'''
import json, os, pathlib, shutil, stat, subprocess
result = __EMPTY__
try:
    binary = shutil.which('pm2')
    node = shutil.which('node')
    home = pathlib.Path(os.environ.get('PM2_HOME') or pathlib.Path.home() / '.pm2')
    rpc = home / 'rpc.sock'
    if binary and node and stat.S_ISSOCK(rpc.stat().st_mode):
        module_root = pathlib.Path(binary).resolve().parent.parent
        completed = subprocess.run([node, '-e', __NODE__, str(module_root), str(rpc)], capture_output=True, timeout=21)
        if completed.returncode == 0 and not completed.stderr and len(completed.stdout) <= 4096:
            value = json.loads(completed.stdout)
            if type(value) is dict and set(value) == set(result):
                result = value
except Exception:
    pass
print(json.dumps(result, separators=(',', ':')))
'''.replace('__EMPTY__', repr({**dict.fromkeys(BOOL_FIELDS, False), **dict.fromkeys(COUNT_FIELDS, 0)})).replace('__NODE__', repr(NODE_PROGRAM))


def run_release_readiness(secrets, *, host_key_reviewed=False):
    states = dict(ok=False, hostKeyTrusted=False, sshConnected=False,
                  readOnlyProbePassed=False, writeEnabled=False,
                  errorClass='readiness_unavailable')
    streams = ()
    try:
        with _silent_boundary():
            with _trusted_connection(secrets, host_key_reviewed=host_key_reviewed) as client:
                states.update(hostKeyTrusted=True, sshConnected=True)
                streams = client.exec_command('python3 -I -', timeout=30, get_pty=False)
                streams[0].write(remote_program())
                streams[0].flush()
                streams[0].close()
                channel = streams[1].channel
                deadline = time.monotonic() + 30
                payload = bytearray()
                while True:
                    while channel.recv_ready():
                        payload.extend(channel.recv(4097))
                        if len(payload) > 4096:
                            raise ValueError('invalid_readiness')
                    if channel.recv_stderr_ready():
                        raise ValueError('readiness_unavailable')
                    if channel.exit_status_ready() and not channel.recv_ready():
                        break
                    if time.monotonic() >= deadline:
                        raise TimeoutError
                    time.sleep(0.01)
                if channel.recv_exit_status() != 0:
                    raise ValueError('readiness_unavailable')
                result = parse_readiness(payload)
                return dict(states, ok=True, readOnlyProbePassed=True,
                            errorClass='none', **result)
    except SafeFailure:
        return states
    except TimeoutError:
        return dict(states, errorClass='readiness_timeout')
    except Exception:
        return states
    finally:
        for stream in streams:
            try:
                stream.close()
            except Exception:
                pass
