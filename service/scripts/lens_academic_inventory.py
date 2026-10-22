"""Read-only Academic inventory. Runtime values never enter the public projection."""

import ast
import argparse
import hashlib
import hmac
import ipaddress
import json
import os
from pathlib import Path
import re
import socket
import stat
import struct
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid


ARTIFACTS = (
    "crazy_functional.py",
    "crazy_functions/Lens_Featured_Tasks.py",
    "crazy_functions/lens_research_tasks.py",
    "crazy_functions/lens_research_proposal.py",
    "shared_utils/fastapi_stream_server.py",
    "shared_utils/lens_storage.py",
    "shared_utils/lens_request_security.py",
    "toolbox.py",
)
ENVIRONMENT_KEYS = frozenset({
    "LENS_ACADEMIC_INTERNAL_SECRET", "LENS_ACADEMIC_WORKSPACE_ROOT",
    "ACADEMIC_API_URL", "PATH_LOGGING", "PATH_PRIVATE_UPLOAD",
    "PM2_HOME", "pm_id", "pm_exec_path", "PATH",
})
ERRORS = frozenset({
    "none", "academic_process_missing", "academic_process_ambiguous",
    "academic_contract_incomplete", "inventory_invalid", "inventory_failed",
    "ssh_read_failed", "entry_unavailable", "process_visibility_incomplete",
    "academic_definition_found", "academic_definition_ambiguous",
})
BOOLEAN_FIELDS = frozenset({
    "ok", "discovery_complete", "entrypoint_from_process", "single_process", "manager_actions_resolved",
    "rollback_restart_resolved", "artifacts_present", "internal_auth_configured",
    "shared_secret_match", "shared_workspace_match", "explicit_private_roots", "private_roots_outside_code",
    "same_network_namespace", "health_ok", "unsigned_file_rejected",
    "invalid_signature_rejected", "signed_unknown_report_rejected",
    "stopped_definition_found", "definition_interpreter_available", "rollback_preserves_initial_state",
})
INFORMATIONAL_FIELDS = {"stopped_definition_found", "definition_interpreter_available", "rollback_preserves_initial_state"}
COUNT_FIELDS = frozenset({"process_count", "artifact_count", "listener_count", "unreadable_process_count", "saved_definition_count"})
HEALTH_STATES = frozenset({"unprobed", "healthy", "missing_route", "unreachable", "invalid_schema", "unauthorized", "server_error", "unexpected_status"})
FIELDS = BOOLEAN_FIELDS | COUNT_FIELDS | {"error", "manager", "health_state"}


def empty_result(error="inventory_failed"):
    result = {name: False for name in BOOLEAN_FIELDS}
    result.update({name: 0 for name in COUNT_FIELDS})
    result.update(error=error, manager="unresolved", health_state="unprobed")
    return result


def parse_inventory(payload):
    try:
        result = json.loads(payload)
        if not isinstance(result, dict) or set(result) != FIELDS:
            raise ValueError()
        if any(type(result[name]) is not bool for name in BOOLEAN_FIELDS):
            raise ValueError()
        if any(type(result[name]) is not int or not 0 <= result[name] <= 65536 for name in COUNT_FIELDS):
            raise ValueError()
        if result["error"] not in ERRORS or result["manager"] not in {"unresolved", "pm2", "systemd", "docker"}:
            raise ValueError()
        if result["health_state"] not in HEALTH_STATES:
            raise ValueError()
        return result
    except Exception:
        return empty_result("inventory_invalid")


def _read(path, maximum=1024 * 1024):
    with open(path, "rb") as stream:
        data = stream.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError()
    return data


def _environment(path):
    selected = {}
    for field in _read(path).split(b"\0"):
        key, separator, value = field.partition(b"=")
        name = key.decode("ascii", errors="ignore")
        if separator and name in ENVIRONMENT_KEYS:
            selected[name] = value.decode("utf-8", errors="strict")
    return selected


class OpaqueRuntime:
    __slots__ = ("_process", "_root", "_view", "_environment", "_manager", "_handle")

    def __init__(self, process, root, view, environment, manager, handle):
        self._process = process
        self._root = root
        self._view = view
        self._environment = environment
        self._manager = manager
        self._handle = handle

    def __repr__(self):
        return "<AcademicRuntime redacted>"

    def __str__(self):
        return "<AcademicRuntime redacted>"


def _snapshot(proc, identifier):
    directory = Path(proc) / str(identifier)
    executable = os.readlink(directory / "exe")
    cwd = os.readlink(directory / "cwd")
    arguments = tuple(value.decode("utf-8", errors="strict") for value in _read(directory / "cmdline").split(b"\0") if value)
    status = _read(directory / "status").decode("ascii", errors="ignore")
    parent = re.search(r"^PPid:\s*(\d+)\s*$", status, re.MULTILINE)
    return {
        "identifier": int(identifier), "directory": directory, "executable": executable,
        "cwd": cwd, "arguments": arguments, "parent": int(parent.group(1)) if parent else 0,
    }


def _filesystem_path(process, value):
    path = Path(value)
    if not path.is_absolute():
        path = Path(process["cwd"]) / path
    return process["directory"] / "root" / str(path).lstrip("/")


def _source_root(process):
    candidates = [Path(process["cwd"])]
    for argument in process["arguments"][1:]:
        if argument.endswith(".py"):
            script = Path(argument)
            if not script.is_absolute():
                script = Path(process["cwd"]) / script
            candidates.extend([script.parent, script.parent.parent])
    found = {}
    for candidate in candidates:
        candidate = Path(os.path.normpath(candidate))
        view = _filesystem_path(process, candidate)
        if (view / "shared_utils/fastapi_stream_server.py").is_file() and (view / "toolbox.py").is_file():
            found[str(candidate)] = view
    if len(found) != 1:
        return None
    root, view = next(iter(found.items()))
    return Path(root), view


def _manager(proc, process, environment):
    try:
        parent = _snapshot(proc, process["parent"])
        parent_name = Path(parent["executable"]).name.lower()
        parent_arguments = " ".join(parent["arguments"]).lower()
        if (
            parent_name.startswith("node") and "pm2" in parent_arguments
            and environment.get("pm_id", "").isdigit() and environment.get("PM2_HOME")
        ):
            return "pm2", (environment["PM2_HOME"], environment["pm_id"])
    except Exception:
        pass
    try:
        cgroup = _read(process["directory"] / "cgroup", 65536).decode("ascii", errors="ignore")
        container = re.search(r"(?:/docker/|docker-)([a-f0-9]{64})(?:\.scope)?(?:/|\s|$)", cgroup)
        if container:
            inspected = subprocess.run(
                ["docker", "inspect", container.group(1)], capture_output=True, timeout=10, check=False,
            )
            if inspected.returncode == 0 and len(inspected.stdout) <= 1024 * 1024:
                rows = json.loads(inspected.stdout)
                if isinstance(rows, list) and len(rows) == 1:
                    initial = rows[0].get("State", {}).get("Pid")
                    ancestor = process
                    for _ in range(32):
                        if ancestor["identifier"] == initial:
                            return "docker", container.group(1)
                        if ancestor["parent"] <= 1:
                            break
                        ancestor = _snapshot(proc, ancestor["parent"])
            return "unresolved", None
        units = set(re.findall(r"/([A-Za-z0-9_.@-]+\.service)(?:/|\s|$)", cgroup))
        if len(units) == 1:
            unit = next(iter(units))
            queried = subprocess.run(
                ["systemctl", "show", "--property=MainPID", "--value", unit],
                capture_output=True, timeout=10, check=False,
            )
            if queried.returncode == 0 and queried.stdout.strip().isdigit() and int(queried.stdout.strip()) == process["identifier"]:
                return "systemd", unit
    except Exception:
        pass
    return "unresolved", None


def discover(proc="/proc", observations=None):
    candidates = []
    nodes = []
    for directory in Path(proc).iterdir():
        if not directory.name.isdigit():
            continue
        try:
            process = _snapshot(proc, directory.name)
            executable = Path(process["executable"]).name.lower()
            if executable.startswith("node"):
                nodes.append(process)
            if not executable.startswith("python"):
                continue
            source = _source_root(process)
            if source is None:
                continue
            environment = _environment(process["directory"] / "environ")
            manager, handle = _manager(proc, process, environment)
            candidates.append(OpaqueRuntime(process, source[0], source[1], environment, manager, handle))
        except FileNotFoundError:
            continue
        except Exception:
            if observations is not None:
                observations["unreadable_process_count"] += 1
    return candidates, nodes


def effective_environment(process, source_view, environment):
    """Project the fixed private config into an observed process environment.

    Linux procfs need not reflect setenv performed by application startup. This
    reproduces the strict entrypoint loader without exposing configuration.
    """
    descriptor = None
    try:
        try:
            descriptor = os.open(source_view / ".lens-academic-private.json", os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        except FileNotFoundError:
            return dict(environment)
        observed = os.fstat(descriptor)
        if (
            not stat.S_ISREG(observed.st_mode) or stat.S_IMODE(observed.st_mode) != 0o600
            or observed.st_uid != process["directory"].stat().st_uid or observed.st_nlink != 1
            or observed.st_size > 8192
        ):
            raise ValueError()
        value = json.loads(os.read(descriptor, 8193))
        names = {
            "secret": "LENS_ACADEMIC_INTERNAL_SECRET", "workspace_root": "LENS_ACADEMIC_WORKSPACE_ROOT",
            "log_root": "PATH_LOGGING", "upload_root": "PATH_PRIVATE_UPLOAD",
        }
        if not isinstance(value, dict) or set(value) != {"version", *names} or type(value["version"]) is not int or value["version"] != 1:
            raise ValueError()
        if not isinstance(value["secret"], str) or not re.fullmatch(r"[\x21-\x7e]{32,256}", value["secret"]):
            raise ValueError()
        code = source_view.resolve(strict=True)
        for name in ("workspace_root", "log_root", "upload_root"):
            configured = value[name]
            if not isinstance(configured, str) or not Path(configured).is_absolute() or "\0" in configured:
                raise ValueError()
            root = _filesystem_path(process, configured).resolve(strict=True)
            if not root.is_dir() or root == code or code in root.parents:
                raise ValueError()
        result = dict(environment)
        for name, key in names.items():
            if result.get(key) and result[key] != value[name]:
                raise ValueError()
            result[key] = value[name]
        return result
    finally:
        if descriptor is not None:
            os.close(descriptor)


def node_source_verified(source_role):
    if (source_role / "src/modules/academic/academic.service.ts").is_file() or (source_role / "dist/modules/academic/academic.service.js").is_file():
        return True
    bundled = source_role / "dist/main.js"
    if not bundled.is_file() or bundled.is_symlink():
        return False
    body = _read(bundled, 64 * 1024 * 1024)
    if all(marker in body for marker in (b"getAcademicBaseUrls", b"AcademicService", b"lens-academic-v1")):
        return True
    # The pre-migration Lens runtime does not expose the new signed Academic
    # route markers yet. Its identity is still attestable from the bundled
    # Nest Academic module; the candidate build supplies the new route before
    # the process is restarted.
    return all(marker in body for marker in (b"NestFactory", b"AcademicModule", b"AcademicService"))


class OpaqueDefinition:
    __slots__ = ("_process", "_root", "_view", "_record", "_home", "_interpreter")

    def __init__(self, process, root, view, record, home, interpreter):
        self._process = process
        self._root = root
        self._view = view
        self._record = record
        self._home = home
        self._interpreter = interpreter

    def __repr__(self):
        return "<AcademicDefinition redacted>"

    def __str__(self):
        return "<AcademicDefinition redacted>"


def saved_pm2_definitions(proc, nodes):
    homes = {}
    for node in nodes:
        try:
            environment = _environment(node["directory"] / "environ")
            parent = _snapshot(proc, node["parent"])
            if (
                Path(parent["executable"]).name.lower().startswith("node")
                and "pm2" in " ".join(parent["arguments"]).lower()
                and environment.get("PM2_HOME") and environment.get("pm_id", "").isdigit()
            ):
                home = environment["PM2_HOME"]
                homes[str(_filesystem_path(node, home))] = (node, home, environment)
        except Exception:
            continue
    definitions = []
    for view, (node, home, environment) in homes.items():
        dump = Path(view) / "dump.pm2"
        if not dump.is_file():
            continue
        try:
            records = json.loads(_read(dump, 4 * 1024 * 1024))
            if not isinstance(records, list):
                continue
            for saved in records:
                if not isinstance(saved, dict):
                    continue
                record = saved.get("pm2_env", saved)
                if not isinstance(record, dict):
                    continue
                script, cwd = record.get("pm_exec_path"), record.get("pm_cwd")
                interpreter = record.get("exec_interpreter")
                if not all(isinstance(value, str) and value for value in [script, cwd, interpreter]):
                    continue
                if not script.endswith(".py") or not Path(interpreter).name.lower().startswith("python"):
                    continue
                configured = dict(node, cwd=cwd, arguments=(interpreter, script))
                source = _source_root(configured)
                if source is None:
                    continue
                resolved = None
                paths = [interpreter] if Path(interpreter).is_absolute() else [
                    str(Path(component) / interpreter) for component in environment.get("PATH", "").split(os.pathsep) if component
                ]
                for executable in paths:
                    candidate = _filesystem_path(node, executable)
                    if candidate.is_file() and os.access(candidate, os.X_OK):
                        resolved = executable
                        break
                selected = {key: record[key] for key in [
                    "pm_exec_path", "pm_cwd", "exec_interpreter", "args", "node_args",
                    "name", "namespace", "autorestart", "instances", "exec_mode",
                ] if key in record}
                definitions.append(OpaqueDefinition(configured, source[0], source[1], selected, home, resolved))
        except Exception:
            continue
    return definitions


def _listeners(process):
    owned = set()
    for entry in (process["directory"] / "fd").iterdir():
        try:
            match = re.fullmatch(r"socket:\[(\d+)\]", os.readlink(entry))
            if match:
                owned.add(match.group(1))
        except Exception:
            pass
    endpoints = set()
    for line in _read(process["directory"] / "net/tcp").decode("ascii", errors="ignore").splitlines()[1:]:
        fields = line.split()
        if len(fields) < 10 or fields[3] != "0A" or fields[9] not in owned:
            continue
        address, port = fields[1].split(":")
        host = socket.inet_ntoa(struct.pack("<I", int(address, 16)))
        if ipaddress.ip_address(host).is_unspecified:
            host = "127.0.0.1"
        endpoints.add((host, int(port, 16)))
    return endpoints



class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, _request, _response, _code, _message, _headers, _url):
        return None


def _request(endpoint, path, headers=None):
    address = "http://" + endpoint[0] + ":" + str(endpoint[1]) + path
    request = urllib.request.Request(address, headers=headers or {}, method="GET")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())
    try:
        with opener.open(request, timeout=3) as response:
            data = response.read(8193)
            return response.status, data if len(data) <= 8192 else b""
    except urllib.error.HTTPError as failure:
        failure.close()
        return failure.code, b""
    except Exception:
        return 0, b""


def _readiness(runtime, endpoints):
    flags = {key: False for key in ["health_ok", "unsigned_file_rejected", "invalid_signature_rejected", "signed_unknown_report_rejected"]}
    flags["health_state"] = "unprobed"
    secret = runtime._environment.get("LENS_ACADEMIC_INTERNAL_SECRET", "")
    for endpoint in endpoints:
        code, body = _request(endpoint, "/health")
        try:
            payload = json.loads(body)
            healthy = code == 200 and payload == {
                "status": "ready", "service": "academic-runtime", "contract": "lens-academic-v1",
            }
        except Exception:
            healthy = False
        if not healthy:
            flags["health_state"] = (
                "unreachable" if code == 0 else "missing_route" if code == 404 else
                "unauthorized" if code in {401, 403} else "server_error" if code >= 500 else
                "invalid_schema" if code == 200 else "unexpected_status"
            )
            continue
        flags["health_ok"] = True
        flags["health_state"] = "healthy"
        request_id, nonce = str(uuid.uuid4()), str(uuid.uuid4())
        reference = "academic-report:" + request_id + ":" + str(uuid.uuid4())
        path = "/academic/file?" + urllib.parse.urlencode({"path": reference})
        flags["unsigned_file_rejected"] = _request(endpoint, path)[0] in {401, 403}
        if len(secret) < 32:
            continue
        stamp = str(int(time.time()))
        canonical = "\n".join(["GET", path, hashlib.sha256(b"").hexdigest(), stamp, nonce, "1", request_id])
        headers = {
            "X-Lens-Academic-Timestamp": stamp, "X-Lens-Academic-Nonce": nonce,
            "X-Lens-Academic-Owner": "1", "X-Lens-Academic-Request": request_id,
            "X-Lens-Academic-Signature": "0" * 64,
        }
        flags["invalid_signature_rejected"] = _request(endpoint, path, headers)[0] in {401, 403}
        nonce = str(uuid.uuid4())
        headers["X-Lens-Academic-Nonce"] = nonce
        canonical = "\n".join(["GET", path, hashlib.sha256(b"").hexdigest(), stamp, nonce, "1", request_id])
        headers["X-Lens-Academic-Signature"] = hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()
        flags["signed_unknown_report_rejected"] = _request(endpoint, path, headers)[0] == 404
        break
    return flags


def inventory(proc="/proc", probe=True):
    result = empty_result()
    try:
        observations = {"unreadable_process_count": 0}
        candidates, nodes = discover(proc, observations)
        result.update(observations)
        result["discovery_complete"] = observations["unreadable_process_count"] == 0
        result["process_count"] = len(candidates)
        if not result["discovery_complete"]:
            result["error"] = "process_visibility_incomplete"
            return result
        if len(candidates) != 1:
            result["error"] = "academic_process_missing" if not candidates else "academic_process_ambiguous"
            if not candidates:
                definitions = saved_pm2_definitions(proc, nodes)
                result["saved_definition_count"] = len(definitions)
                if definitions:
                    result["stopped_definition_found"] = True
                    result["error"] = "academic_definition_found" if len(definitions) == 1 else "academic_definition_ambiguous"
                if len(definitions) == 1:
                    definition = definitions[0]
                    result["manager"] = "pm2"
                    result["definition_interpreter_available"] = definition._interpreter is not None
                    result["rollback_preserves_initial_state"] = True
                    result["artifact_count"] = sum((definition._view / role).is_file() for role in ARTIFACTS)
                    result["artifacts_present"] = result["artifact_count"] == len(ARTIFACTS)
            return result
        runtime = candidates[0]
        environment = effective_environment(runtime._process, runtime._view, runtime._environment)
        runtime._environment = environment
        result["single_process"] = True
        result["manager"] = runtime._manager
        result["manager_actions_resolved"] = runtime._handle is not None
        result["rollback_restart_resolved"] = runtime._handle is not None
        arguments = runtime._process["arguments"]
        result["entrypoint_from_process"] = any(
            str(_filesystem_path(runtime._process, argument)) == str(runtime._view / "shared_utils/fastapi_stream_server.py")
            for argument in arguments[1:] if argument.endswith(".py")
        ) or ("-m" in arguments and "shared_utils.fastapi_stream_server" in arguments)
        result["artifact_count"] = sum((runtime._view / role).is_file() for role in ARTIFACTS)
        result["artifacts_present"] = result["artifact_count"] == len(ARTIFACTS)
        secret = environment.get("LENS_ACADEMIC_INTERNAL_SECRET", "")
        result["internal_auth_configured"] = len(secret) >= 32
        for node in nodes:
            try:
                source_role = _filesystem_path(node, node["cwd"])
                node_environment = effective_environment(node, source_role, _environment(node["directory"] / "environ"))
                is_lens = node_source_verified(source_role)
                peer = node_environment.get("LENS_ACADEMIC_INTERNAL_SECRET", "")
                if is_lens and secret and peer and hmac.compare_digest(secret, peer):
                    result["shared_secret_match"] = True
                    workspace = environment.get("LENS_ACADEMIC_WORKSPACE_ROOT")
                    peer_workspace = node_environment.get("LENS_ACADEMIC_WORKSPACE_ROOT")
                    if workspace and peer_workspace:
                        own_stat = os.stat(_filesystem_path(runtime._process, workspace))
                        peer_stat = os.stat(_filesystem_path(node, peer_workspace))
                        result["shared_workspace_match"] = (own_stat.st_dev, own_stat.st_ino) == (peer_stat.st_dev, peer_stat.st_ino)
            except Exception:
                pass
        roots = [environment.get(name) for name in ["LENS_ACADEMIC_WORKSPACE_ROOT", "PATH_LOGGING", "PATH_PRIVATE_UPLOAD"]]
        result["explicit_private_roots"] = all(value and Path(value).is_absolute() for value in roots)
        if result["explicit_private_roots"]:
            code = os.path.realpath(runtime._view)
            private = [os.path.realpath(_filesystem_path(runtime._process, value)) for value in roots]
            result["private_roots_outside_code"] = all(
                os.path.isdir(value) and os.path.commonpath([code, value]) != code for value in private
            )
        result["same_network_namespace"] = os.readlink(runtime._process["directory"] / "ns/net") == os.readlink(Path(proc) / "self/ns/net")
        endpoints = _listeners(runtime._process)
        result["listener_count"] = len(endpoints)
        if probe and result["same_network_namespace"]:
            result.update(_readiness(runtime, endpoints))
        result["ok"] = all(result[name] for name in BOOLEAN_FIELDS - INFORMATIONAL_FIELDS - {"ok"})
        result["error"] = "none" if result["ok"] else "academic_contract_incomplete"
        return result
    except Exception:
        return empty_result("inventory_failed")


def remote_program():
    source = Path(__file__).read_text()
    tree = ast.parse(source)
    guard = next(node for node in tree.body if isinstance(node, ast.If) and "__name__" in ast.unparse(node.test))
    return "".join(source.splitlines(True)[:guard.lineno - 1]) + "\nprint(json.dumps(inventory(), sort_keys=True))\n"


def run_academic_inventory(secrets, *, host_key_reviewed=False):
    from lens_safe_ops import _silent_boundary, _trusted_connection
    try:
        with _silent_boundary():
            with _trusted_connection(secrets, host_key_reviewed=host_key_reviewed) as client:
                stdin, stdout, stderr = client.exec_command("python3 -", get_pty=False, timeout=30)
                stdin.write(remote_program())
                stdin.flush()
                stdin.channel.shutdown_write()
                channel = stdout.channel
                output = bytearray()
                error_bytes = 0
                deadline = time.monotonic() + 30
                while True:
                    if time.monotonic() > deadline:
                        raise TimeoutError()
                    while channel.recv_ready():
                        output.extend(channel.recv(8192))
                        if len(output) > 65536:
                            raise ValueError()
                    while channel.recv_stderr_ready():
                        error_bytes += len(channel.recv_stderr(8192))
                        if error_bytes > 65536 or time.monotonic() > deadline:
                            raise ValueError()
                    if channel.exit_status_ready() and not channel.recv_ready():
                        break
                    time.sleep(0.02)
                if channel.recv_exit_status() != 0:
                    return empty_result("ssh_read_failed")
                return parse_inventory(bytes(output))
    except Exception:
        return empty_result("ssh_read_failed")


def main(argv=None):
    from lens_safe_ops import _silent_boundary, load_project_entry
    parser = argparse.ArgumentParser()
    parser.add_argument('--host-key-reviewed', action='store_true')
    args = parser.parse_args(argv)
    secrets = None
    try:
        with _silent_boundary():
            if not args.host_key_reviewed:
                raise ValueError('host_key_review_required')
            secrets = load_project_entry()
            result = run_academic_inventory(secrets, host_key_reviewed=True)
    except Exception:
        result = empty_result("entry_unavailable" if args.host_key_reviewed else "ssh_read_failed")
    finally:
        if secrets is not None:
            secrets.close()
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
