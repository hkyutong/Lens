"""Fixed read-only remote inventory program; all output is a closed projection."""

import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys


MAX_PROBE_BYTES = 1024 * 1024
MAX_CANDIDATES = 4096
LENS_NAME = re.compile(r'(?:^|[-_./])lens(?:$|[-_./])', re.IGNORECASE)

NODE_RPC_PROGRAM = r'''
const write = process.stdout.write.bind(process.stdout);
const sink = (chunk, encoding, callback) => {
  if (typeof encoding === 'function') encoding();
  if (typeof callback === 'function') callback();
  return true;
};
process.stdout.write = sink;
process.stderr.write = sink;
console.log = console.warn = console.error = () => {};
let socket;
let timer;
let finished = false;
const unknown = { candidateCount: 0, watchEnabled: false, undetermined: true };
function finish(result) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  try { if (socket) socket.close(); } catch (_) {}
  write(JSON.stringify(result), () => process.exit(0));
}
process.on('uncaughtException', () => finish(unknown));
process.on('unhandledRejection', () => finish(unknown));
timer = setTimeout(() => finish(unknown), 2500);
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  if (Buffer.byteLength(input) > 16384) finish(unknown);
});
process.stdin.on('end', () => {
  try {
    const fs = require('fs');
    const path = require('path');
    const request = JSON.parse(input);
    if (!request || Object.keys(request).sort().join(',') !== 'pm2Binary,rpcSocket') return finish(unknown);
    if (![request.pm2Binary, request.rpcSocket].every(value => typeof value === 'string' && path.isAbsolute(value) && !value.includes('\0'))) return finish(unknown);
    const socketInfo = fs.lstatSync(request.rpcSocket);
    if (!socketInfo.isSocket() || socketInfo.uid !== process.getuid()) return finish(unknown);
    const binary = fs.realpathSync(request.pm2Binary);
    const packagePath = path.join(path.dirname(path.dirname(binary)), 'package.json');
    const metadata = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    if (metadata.name !== 'pm2') return finish(unknown);
    const vendorRequire = require('module').createRequire(packagePath);
    const axon = vendorRequire('pm2-axon');
    const rpc = vendorRequire('pm2-axon-rpc');
    socket = axon.socket('req');
    socket.on('error', () => finish(unknown));
    const client = new rpc.Client(socket);
    socket.connect(request.rpcSocket);
    client.call('getMonitorData', {}, (error, rows) => {
      if (error || !Array.isArray(rows) || rows.length > 4096) return finish(unknown);
      const result = { candidateCount: 0, watchEnabled: false, undetermined: false };
      const lens = /(?:^|[-_./])lens(?:$|[-_./])/i;
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) { result.undetermined = true; continue; }
        const environment = row.pm2_env;
        if (!environment || typeof environment !== 'object' || Array.isArray(environment)) { result.undetermined = true; continue; }
        const labels = [row.name, environment.name, environment.pm_cwd, environment.pm_exec_path];
        if (!labels.some(value => typeof value === 'string' && lens.test(value))) continue;
        result.candidateCount += 1;
        const watch = environment.watch;
        if (watch === true || typeof watch === 'string' && watch.length > 0 || Array.isArray(watch) && watch.length > 0) result.watchEnabled = true;
        else if (!(watch === undefined || watch === null || watch === false || watch === '' || Array.isArray(watch) && watch.length === 0)) result.undetermined = true;
      }
      finish(result);
    });
  } catch (_) { finish(unknown); }
});
'''


def _unknown_pm2():
    return {'candidateCount': 0, 'watchEnabled': False, 'undetermined': True}


def _pm2_projection(value):
    if not isinstance(value, dict) or set(value) != {'candidateCount', 'watchEnabled', 'undetermined'}:
        return _unknown_pm2()
    if type(value['candidateCount']) is not int or not 0 <= value['candidateCount'] <= MAX_CANDIDATES:
        return _unknown_pm2()
    if type(value['watchEnabled']) is not bool or type(value['undetermined']) is not bool:
        return _unknown_pm2()
    return {key: value[key] for key in ('candidateCount', 'watchEnabled', 'undetermined')}


def _pm2_inventory():
    binary = shutil.which('pm2')
    node = shutil.which('node')
    if not binary or not node:
        return _unknown_pm2()
    home = os.environ.get('PM2_HOME')
    if home is None:
        home = str(Path.home() / '.pm2')
    directory = Path(home)
    socket_path = directory / 'rpc.sock'
    try:
        directory_info = directory.lstat()
        socket_info = socket_path.lstat()
        if not stat.S_ISDIR(directory_info.st_mode) or directory_info.st_uid != os.geteuid() or directory_info.st_mode & 0o022:
            return _unknown_pm2()
        if not stat.S_ISSOCK(socket_info.st_mode) or socket_info.st_uid != os.geteuid():
            return _unknown_pm2()
        request = json.dumps({'pm2Binary': binary, 'rpcSocket': str(socket_path)}).encode('utf8')
        result = subprocess.run(
            [node, '-e', NODE_RPC_PROGRAM], input=request, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, timeout=5, check=False,
        )
        if result.returncode != 0 or len(result.stdout) > 1024:
            return _unknown_pm2()
        return _pm2_projection(json.loads(result.stdout))
    except Exception:
        return _unknown_pm2()


def _docker_projection(output):
    count = 0
    undetermined = False
    if len(output) > MAX_PROBE_BYTES:
        return 0, True
    rows = output.splitlines()
    if len(rows) > MAX_CANDIDATES:
        return 0, True
    for line in rows:
        try:
            name = json.loads(line)
        except Exception:
            undetermined = True
            continue
        if not isinstance(name, str) or len(name) > 4096:
            undetermined = True
        elif LENS_NAME.search(name):
            count += 1
    return count, undetermined


def _docker_inventory():
    binary = shutil.which('docker')
    if not binary:
        return 0, True
    try:
        result = subprocess.run(
            [binary, 'ps', '--format', '{{json .Names}}'], stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=5, check=False,
        )
        if result.returncode != 0:
            return 0, True
        return _docker_projection(result.stdout)
    except Exception:
        return 0, True


def inventory():
    pm2 = _pm2_inventory()
    docker_count, docker_unknown = _docker_inventory()
    return {
        'lensPm2CandidateCount': pm2['candidateCount'],
        'lensDockerCandidateCount': docker_count,
        'lensPm2WatchEnabled': pm2['watchEnabled'],
        'runtimeUndetermined': pm2['undetermined'] or docker_unknown or pm2['candidateCount'] + docker_count == 0,
    }


def main():
    result = inventory()
    sys.stdout.write(json.dumps(result, separators=(',', ':')))


if __name__ == '__main__':
    main()
