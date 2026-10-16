"""Fixed, read-only remote inventory. No application or connection data is emitted."""

# PM2's CLI can start a daemon. Connect only to an already existing RPC socket,
# using the installed transport modules without importing PM2's startup API.
PROGRAM = r'''
import json, os, pathlib, shutil, socket, stat, subprocess

result = {"lensPm2CandidateCount": 0, "lensDockerCandidateCount": 0,
          "lensPm2WatchEnabled": False, "runtimeUndetermined": True}
pm2_known = False
docker_known = False

def command(arguments, timeout=5):
    return subprocess.run(arguments, stdin=subprocess.DEVNULL,
                          stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                          timeout=timeout, check=False)

try:
    binary = shutil.which("pm2")
    node = shutil.which("node")
    home = pathlib.Path(os.environ.get("PM2_HOME", str(pathlib.Path.home() / ".pm2")))
    rpc = home / "rpc.sock"
    if binary and node and rpc.exists() and stat.S_ISSOCK(rpc.stat().st_mode):
        module_root = str(pathlib.Path(binary).resolve().parent.parent)
        node_program = r"""
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[1];
const rpcPath = process.argv[2];
let req;
let ended = false;
function finish(value) {
  if (ended) return;
  ended = true;
  if (req) { try { req.close(); } catch (_) {} }
  if (value) process.stdout.write(JSON.stringify(value));
  process.exit(value ? 0 : 1);
}
setTimeout(() => finish(null), 2500);
try {
  const axon = require(require.resolve('pm2-axon', {paths: [root]}));
  const RPC = require(require.resolve('pm2-axon-rpc', {paths: [root]}));
  req = axon.socket('req');
  req.on('error', () => finish(null));
  const client = new RPC.Client(req);
  req.connect(rpcPath);
  client.call('getMonitorData', {}, (err, rows) => {
    if (err || !Array.isArray(rows) || rows.length > 4096) return finish(null);
    const candidates = rows.filter(row => {
      const environment = row && row.pm2_env || {};
      return /lens/i.test(String(row && row.name || '')) ||
        /(^|[\\/])lens([\\/]|$)/i.test(String(environment.pm_cwd || '')) ||
        /(^|[\\/])lens([\\/]|$)/i.test(String(environment.pm_exec_path || ''));
    });
    finish({count: candidates.length, watch: candidates.some(row => {
      const value = row.pm2_env && row.pm2_env.watch;
      return Array.isArray(value) ? value.length > 0 : Boolean(value);
    })});
  });
} catch (_) { finish(null); }
"""
        completed = command([node, "-e", node_program, module_root, str(rpc)])
        if completed.returncode == 0 and len(completed.stdout) <= 4096:
            value = json.loads(completed.stdout)
            if (set(value) == {"count", "watch"} and type(value["count"]) is int
                    and 0 <= value["count"] <= 4096 and type(value["watch"]) is bool):
                result["lensPm2CandidateCount"] = value["count"]
                result["lensPm2WatchEnabled"] = value["watch"]
                pm2_known = True
except Exception:
    pass

try:
    docker = shutil.which("docker")
    if docker:
        completed = command([docker, "ps", "-a", "--format", "{{json .}}"])
        if completed.returncode == 0 and len(completed.stdout) <= 1048576:
            rows = [json.loads(row) for row in completed.stdout.splitlines() if row]
            if len(rows) <= 4096:
                result["lensDockerCandidateCount"] = sum(
                    any("lens" in str(row.get(key, "")).lower() for key in ("Names", "Image", "Labels"))
                    for row in rows)
                docker_known = True
except Exception:
    pass

result["runtimeUndetermined"] = not (
    (pm2_known and result["lensPm2CandidateCount"] > 0) or
    (docker_known and result["lensDockerCandidateCount"] > 0))
print(json.dumps(result, separators=(",", ":")))
'''


def parse_inventory(payload):
    """Reject unknown fields and bool-as-int values before returning any data."""
    import json

    if len(payload) > 4096:
        raise ValueError()
    value = json.loads(payload)
    count_keys = ('lensPm2CandidateCount', 'lensDockerCandidateCount')
    bool_keys = ('lensPm2WatchEnabled', 'runtimeUndetermined')
    if not isinstance(value, dict) or set(value) != set(count_keys + bool_keys):
        raise ValueError()
    if any(type(value[key]) is not int or not 0 <= value[key] <= 4096 for key in count_keys):
        raise ValueError()
    if any(type(value[key]) is not bool for key in bool_keys):
        raise ValueError()
    return {key: value[key] for key in count_keys + bool_keys}
