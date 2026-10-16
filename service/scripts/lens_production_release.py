"""Closed-artifact Lens release transport. Default execution is read-only.

Runtime paths and database settings are discovered inside the existing readiness
program's selected process. They never become command arguments or public output.
The reviewed artifact manifest is an input attestation, not a Git cleanliness test.
"""

from __future__ import annotations

import argparse
import contextlib
import dataclasses
import hashlib
import io
import json
import os
from pathlib import Path
import re
import secrets
import stat
import tarfile
import time
import types

import lens_release_readiness as readiness
import lens_safe_ops as safe_ops


_MAX_ARCHIVE = 1024 * 1024 * 1024
_MAX_RESPONSE = 1024 * 1024
_DENIED = frozenset({"private", "uploads", "upload", "user_uploads", "node_modules",
                     "logs", "log", "data", "database", "config", "configs", "secrets",
                     "memory", "memories", "__pycache__"})
_DENIED_SUFFIXES = (".env", ".key", ".pem", ".p12", ".pfx", ".sqlite", ".sqlite3", ".db", ".log", ".map")
_ERRORS = frozenset({"none", "artifact_invalid", "source_attestation_missing", "deploy_gate_required",
                     "connection_blocked", "transport_failed", "remote_output_invalid", "context_unavailable",
                     "pm2_config_invalid", "static_roots_invalid", "private_storage_unsafe", "tools_unavailable",
                     "database_settings_invalid", "stage_invalid", "dependency_install_failed",
                     "dependency_closure_invalid", "database_backup_failed", "migration_blocked",
                     "file_transaction_failed", "dependency_swap_failed", "start_failed", "smoke_failed",
                     "rollback_incomplete", "backup_verification_failed", "cleanup_failed", "worker_unavailable"})
_ERRORS = _ERRORS | frozenset({'pm2_config_mode_invalid', 'pm2_config_path_invalid', 'pm2_config_interpreter_invalid', 'pm2_config_shape_invalid', 'pm2_config_instances_invalid', 'pm2_config_interpreter_path_invalid', 'pm2_config_args_invalid', 'pm2_config_identity_invalid'})
_ERRORS = _ERRORS | frozenset({"bootstrap_discovery_failed", "bootstrap_module_discovery_failed", "bootstrap_child_failed"})
_ERRORS = _ERRORS | frozenset({'bootstrap_contract_changed', 'empty_output', 'remote_response_too_large', 'remote_stderr_present', 'remote_exit_failed', 'invalid_json', 'schema_mismatch', 'remote_bootstrap_failed'})
_ERRORS = _ERRORS | frozenset({"download_public_hosts_invalid", "download_boundary_failed"})
_ERRORS |= {"boundary_config_invalid", "boundary_context_invalid",
            "boundary_public_unproven", "runtime_config_changed", "academic_transaction_failed",
    'academic_context_invalid', 'academic_controller_failed', 'academic_route_invalid', 'academic_ready_failed', 'academic_restore_failed', 'academic_manager_failed', 'academic_apply_failed', 'academic_cleanup_failed'}


class ReleaseError(Exception):
    def __init__(self, code):
        self.code = code if code in _ERRORS else "transport_failed"
        super().__init__(self.code)


@dataclasses.dataclass(frozen=True)
class ReleaseResult:
    ok: bool = False
    mode: str = "preflight"
    error: str = "none"
    artifact_checked: bool = False
    artifact_file_count: int = 0
    source_attestation_present: bool = False
    runtime_context_ok: bool = False
    pm2_config_ok: bool = False
    static_roots_ok: bool = False
    private_storage_safe: bool = False
    database_settings_ok: bool = False
    tools_ready: bool = False
    production_changed: bool = False
    backup_verified: bool = False
    database_restore_verified: bool = False
    dependency_closure_verified: bool = False
    academic_runtime_verified: bool = False
    application_started: bool = False
    smoke_passed: bool = False
    public_hosts_verified: bool = False
    download_boundary_verified: bool = False
    rollback_attempted: bool = False
    rollback_completed: bool = False
    schema_retained: bool = False
    needs_manual_review: bool = False
    evidence_retained: bool = False
    cleanup_succeeded: bool = True
    old_backup_removed_count: int = 0

    def to_dict(self):
        return dataclasses.asdict(self)


@dataclasses.dataclass(frozen=True, repr=False)
class ArtifactBundle:
    root: Path
    entries: tuple
    source_attested: bool
    archive: bytes
    archive_digest: str

    def __repr__(self):
        return "<ArtifactBundle>"


def _relative(value):
    if (type(value) is not str or not re.fullmatch(r"[A-Za-z0-9_./@+~-]+", value)
            or any(p in ("", ".", "..") or p.startswith(".") or p.lower() in _DENIED for p in value.split("/"))
            or value.lower().endswith(_DENIED_SUFFIXES)
            or any(p.lower() in {"agents.md", "status.md", "changelog.md", "memory.md", "server.txt"} for p in value.split("/"))):
        raise ReleaseError("artifact_invalid")
    return value


_ACADEMIC_RUNTIME_FILES = frozenset({
    "academic-4.0/crazy_functions/Lens_Featured_Tasks.py",
    "academic-4.0/crazy_functions/lens_research_tasks.py",
    "academic-4.0/crazy_functions/lens_research_proposal.py",
    "academic-4.0/shared_utils/fastapi_stream_server.py",
    "academic-4.0/shared_utils/lens_storage.py",
    "academic-4.0/shared_utils/lens_request_security.py",
    "academic-4.0/toolbox.py",
})


_STATIC_HTML_FILES = frozenset({'chat/dist/seo/paper-summary.html', 'chat/dist/seo/research-workspace.html', 'chat/dist/seo/academic-polishing.html', 'chat/dist/seo/faq.html', 'chat/dist/seo/arxiv-summary.html', 'chat/dist/seo/latex-translation.html', 'chat/dist/seo/literature-review.html'})


def _role_path(role, source):
    source = _relative(source)
    if role == "academic_runtime":
        if source not in _ACADEMIC_RUNTIME_FILES:
            raise ReleaseError("artifact_invalid")
        return source
    prefixes = {"service_build": "service/dist/", "chat_static": "chat/dist/", "admin_static": "admin/dist/"}
    exact = {'service_package': 'service/package.json', 'service_lock': 'service/pnpm-lock.yaml', 'service_workspace': 'service/pnpm-workspace.yaml'}
    if role in exact:
        if source != exact[role]:
            raise ReleaseError("artifact_invalid")
        return source
    if role not in prefixes or not source.startswith(prefixes[role]) or source.endswith("/"):
        raise ReleaseError("artifact_invalid")
    suffix = Path(source).suffix.lower()
    allowed = ({".js", ".cjs", ".mjs", ".json", ".wasm"} if role == "service_build" else
               {".html", ".js", ".cjs", ".mjs", ".css", ".json", ".svg", ".png", ".jpg", ".jpeg",
                ".gif", ".webp", ".avif", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".wasm", ".txt", ".xml", ".webmanifest"})
    if suffix not in allowed:
        raise ReleaseError("artifact_invalid")
    if role != "service_build" and suffix == ".html" and source != prefixes[role] + "index.html" and source not in _STATIC_HTML_FILES:
        raise ReleaseError("artifact_invalid")
    return source


def _safe_root(value):
    p = Path(value)
    if not p.is_absolute() or ".." in p.parts:
        raise ReleaseError("artifact_invalid")
    current = Path(p.anchor)
    for part in p.parts[1:]:
        current /= part
        if not stat.S_ISDIR(current.lstat().st_mode) or current.is_symlink():
            raise ReleaseError("artifact_invalid")
    return p


def prepare_artifact_bundle(artifact_root, manifest) -> ArtifactBundle:
    """Read only the exact reviewed build files; never recurse a project directory.

    Manifest schema: version=1, clean_source_verified=true, entries=[{role,source,
    sha256,size}]. SHA256s are input integrity expectations and stay in memory.
    """
    try:
        root = _safe_root(artifact_root)
        if type(manifest) is not dict or set(manifest) != {"version", "clean_source_verified", "entries"}:
            raise ReleaseError("artifact_invalid")
        if type(manifest["version"]) is not int or manifest["version"] != 1:
            raise ReleaseError("artifact_invalid")
        if manifest["clean_source_verified"] is not True:
            raise ReleaseError("source_attestation_missing")
        entries = manifest["entries"]
        if type(entries) is not list or not 0 < len(entries) <= 100000:
            raise ReleaseError("artifact_invalid")
        names, roles, total, approved = set(), set(), 0, []
        archive = io.BytesIO()
        with tarfile.open(fileobj=archive, mode="w") as tar:
            for item in entries:
                if type(item) is not dict or set(item) != {"role", "source", "sha256", "size"}:
                    raise ReleaseError("artifact_invalid")
                relative = _role_path(item["role"], item["source"])
                if relative in names or type(item["size"]) is not int or item["size"] < 0:
                    raise ReleaseError("artifact_invalid")
                if type(item["sha256"]) is not str or not re.fullmatch(r"[0-9a-f]{64}", item["sha256"]):
                    raise ReleaseError("artifact_invalid")
                names.add(relative)
                roles.add(item["role"])
                total += item["size"]
                if total > _MAX_ARCHIVE:
                    raise ReleaseError("artifact_invalid")
                current = root
                for part in relative.split("/")[:-1]:
                    current /= part
                    if not stat.S_ISDIR(current.lstat().st_mode) or current.is_symlink():
                        raise ReleaseError("artifact_invalid")
                file = root / relative
                before = file.lstat()
                if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1 or before.st_mode & 0o7000:
                    raise ReleaseError("artifact_invalid")
                fd = os.open(file, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
                try:
                    with os.fdopen(fd, "rb", closefd=False) as stream:
                        content = stream.read(_MAX_ARCHIVE + 1)
                    after = os.fstat(fd)
                    signature = lambda s: (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns)
                    if (signature(before) != signature(after) or len(content) != item["size"]
                            or hashlib.sha256(content).hexdigest() != item["sha256"]):
                        raise ReleaseError("artifact_invalid")
                finally:
                    os.close(fd)
                info = tarfile.TarInfo(relative)
                info.size, info.mode, info.mtime, info.uid, info.gid = len(content), 0o600, 0, 0, 0
                tar.addfile(info, io.BytesIO(content))
                approved.append(dict(item))
        if {entry["source"] for entry in approved if entry["role"] == "academic_runtime"} != _ACADEMIC_RUNTIME_FILES:
            raise ReleaseError("artifact_invalid")
        if roles != {'service_build', 'service_package', 'service_lock', 'chat_static', 'admin_static', 'service_workspace', "academic_runtime"}:
            raise ReleaseError("artifact_invalid")
        if "chat/dist/index.html" not in names or "admin/dist/index.html" not in names:
            raise ReleaseError("artifact_invalid")
        data = archive.getvalue()
        if len(data) > _MAX_ARCHIVE:
            raise ReleaseError("artifact_invalid")
        return ArtifactBundle(root, tuple(approved), True, data, hashlib.sha256(data).hexdigest())
    except ReleaseError:
        raise
    except BaseException:
        raise ReleaseError("artifact_invalid") from None


def _replace_finish(program, replacement):
    match = re.search(r"function\s+finish\s*\(\s*\)\s*\{", program)
    if match is None:
        raise ReleaseError("worker_unavailable")
    depth, quote, escaped, index = 1, None, False, match.end()
    while index < len(program) and depth:
        char = program[index]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
        elif char in "\"'`":
            quote = char
        elif char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
        index += 1
    if depth:
        raise ReleaseError("worker_unavailable")
    return program[:match.start()] + replacement + program[index:]


_CAPTURE = '\nglobalThis.__lensCapture = () => ({\n serviceCwd: cwd, privateStorage: storage, pm2ModuleRoot: root, staticRoutes: { admin: settings.ADMIN_SERVE_ROOT || env.ADMIN_SERVE_ROOT || (env.env || {}).ADMIN_SERVE_ROOT || "/admin" },\n processId: candidates.length === 1 ? candidates[0].pm_id : null,\n runtime: { name: env.name, script: env.pm_exec_path, cwd: env.pm_cwd,\n   execMode: env.exec_mode, instances: env.instances, watch: env.watch,\n   environment: env.env, args: env.args, interpreter: env.exec_interpreter },\n database: { host: settings.DB_HOST, port: settings.DB_PORT, user: settings.DB_USER,\n   password: settings.DB_PASS, database: settings.DB_DATABASE },\n nginxTokens:(()=>{globalThis.__lensCaptureHookReached=true;if(!Array.isArray(globalThis.__lensNginxTokens)){globalThis.__lensInspectNginxEntered=true;inspectNginx(cwd);globalThis.__lensInspectNginxCompleted=true;}return globalThis.__lensNginxTokens;})(),smokePort: (()=>{const v=settings.PORT;if(typeof v==="string"&&String(Number(v))!==v)return null;const n=typeof v==="string"?Number(v):v;return Number.isSafeInteger(n)&&n>0&&n<=65535?n:null;})()\n});\n'



_FINISH_CONTROL = "function finish() {\n  if (finish.__lensFinished) return;\n  finish.__lensFinished = true;\n  const flush = process.stdout.write.bind(process.stdout);\n  return Promise.resolve(__lensControl()).then(\n    () => flush('', () => process.exit(0)),\n    () => flush('', () => process.exit(1))\n  );\n}\n"

def _adapt_control_bootstrap(source: str, mode: str) -> str:
    """Reuse discovery while replacing readiness-only response filtering."""
    import ast
    tree = ast.parse(source)
    initial = [node for node in tree.body if isinstance(node, ast.Assign)
               and len(node.targets) == 1 and isinstance(node.targets[0], ast.Name)
               and node.targets[0].id == "result"]
    attempts = [node for node in tree.body if isinstance(node, ast.Try)]
    if len(initial) != 1 or len(attempts) != 1:
        raise ReleaseError("bootstrap_contract_changed")
    assignments = [node for node in ast.walk(attempts[0])
                   if isinstance(node, ast.Assign) and isinstance(node.value, ast.Call)
                   and isinstance(node.value.func, ast.Attribute)
                   and node.value.func.attr == "run"]
    if len(assignments) != 1 or not isinstance(assignments[0].targets[0], ast.Name):
        raise ReleaseError("bootstrap_contract_changed")
    child = assignments[0]
    command = child.value.args[0] if child.value.args else None
    if not isinstance(command, ast.List) or len(command.elts) != 5 or not isinstance(command.elts[1], ast.Constant) or command.elts[1].value != "-e" or not isinstance(command.elts[2], ast.Constant) or not isinstance(command.elts[2].value, str):
        raise ReleaseError("bootstrap_contract_changed")
    # Linux limits each argv item independently of the overall command size.
    # The full, verified program travels over stdin; argv stays bounded and
    # retains the discovery bootstrap's existing argument positions.
    script = command.elts[2]
    command.elts[2] = ast.Constant("eval(require('node:fs').readFileSync(0, 'utf8'))")
    if any(keyword.arg == "input" for keyword in child.value.keywords):
        raise ReleaseError("bootstrap_contract_changed")
    child.value.keywords.append(ast.keyword(arg="input", value=ast.Call(func=ast.Attribute(value=script, attr="encode", ctx=ast.Load()), args=[ast.Constant("utf-8")], keywords=[])))
    timeouts = [keyword for keyword in child.value.keywords if keyword.arg == "timeout"]
    if len(timeouts) != 1:
        raise ReleaseError("bootstrap_contract_changed")
    timeouts[0].value = ast.Constant(1500 if mode == "deploy" else 90)
    parents = [node for node in ast.walk(attempts[0])
               if isinstance(node, ast.If) and child in node.body]
    if len(parents) != 1 or len(parents[0].body[parents[0].body.index(child) + 1:]) != 1:
        raise ReleaseError("bootstrap_contract_changed")
    failed = {"public": ReleaseResult(mode=mode, error="bootstrap_discovery_failed").to_dict()}
    initial[0].value = ast.parse(repr(failed), mode="eval").body
    name = child.targets[0].id
    response = f"""
if {name}.returncode != 0:
    result['public']['error'] = 'remote_exit_failed'
elif {name}.stderr:
    result['public']['error'] = 'remote_stderr_present'
elif not {name}.stdout:
    result['public']['error'] = 'empty_output'
elif len({name}.stdout) > {_MAX_RESPONSE}:
    result['public']['error'] = 'remote_response_too_large'
else:
    try:
        control_value = json.loads({name}.stdout)
        if type(control_value) is dict and set(control_value) in ({{'public'}}, {{'public', 'private'}}):
            result = control_value
        else:
            result['public']['error'] = 'schema_mismatch'
    except Exception:
        result['public']['error'] = 'invalid_json'
"""
    parents[0].body[parents[0].body.index(child) + 1:] = ast.parse(response).body
    parent = parents[0]
    parent.body.insert(0, ast.parse("result['public']['error'] = 'bootstrap_module_discovery_failed'").body[0])
    child_index = parent.body.index(child)
    parent.body.insert(child_index, ast.parse("result['public']['error'] = 'bootstrap_child_failed'").body[0])
    return ast.unparse(ast.fix_missing_locations(tree)) + "\n"


def _decode_remote_response(raw: bytes | str) -> dict:
    if not raw:
        raise ReleaseError("empty_output")
    try:
        value = json.loads(raw)
    except Exception:
        raise ReleaseError("invalid_json") from None
    if type(value) is not dict or set(value) not in ({"public"}, {"public", "private"}):
        raise ReleaseError("schema_mismatch")
    return value


def _inject_context_capture(program: str) -> str:
    # settings is block scoped in the reviewed readiness probe.
    marker = re.compile(r"((?:const|let)\s+settings\s*=\s*[^\n;]*;)")
    if len(marker.findall(program)) != 1:
        raise ReleaseError("bootstrap_contract_changed")
    return marker.sub(lambda match: match.group(1) + "\n" + _CAPTURE, program, count=1)

def _inject_nginx_capture(program: str) -> str:
    tokenizer = re.compile(r"const\s+tokens\s*=\s*raw\.match\([^\n]+\)\s*\|\|\s*\[\];")
    if len(tokenizer.findall(program)) != 1:
        raise ReleaseError("bootstrap_module_discovery_failed")
    program = tokenizer.sub("const tokens = __lensDownloadBoundary.tokenizeNginx(raw);"
                            "globalThis.__lensNginxFiles??=new Map();"
                            "globalThis.__lensNginxFiles.set(file,raw);", program, count=1)
    marker = re.compile(r"const\s+tokens\s*=\s*read\([^;\n]+\);")
    if len(marker.findall(program)) != 1:
        raise ReleaseError("bootstrap_module_discovery_failed")
    return marker.sub(lambda match: match.group(0) + "globalThis.__lensNginxTokens=tokens;"
                      "globalThis.__lensNginxRuntime={config,executable};", program, count=1)


def build_remote_program(request):
    """Generate the existing readiness bootstrap with a controlled final consumer."""
    try:
        base = readiness.NODE_PROGRAM
        marker = re.search(r"(?:async\s+)?function\s+inspect\s*\(\s*rows\s*\)\s*\{", base)
        if marker is None:
            raise ReleaseError("worker_unavailable")
        base = _inject_context_capture(base)
        base = _inject_nginx_capture(base)
        worker = Path(__file__).with_name("lens_production_release_worker.cjs").read_text()
        download_source = Path(__file__).with_name('lens_download_boundary.cjs').read_text()
        maintenance_source = Path(__file__).with_name("lens_maintenance_gate.cjs").read_text()
        worker = "const __lensMaintenance=(()=>{const module={exports:{}};" + maintenance_source + ";return module.exports;})();\n" + worker
        worker = 'const __lensDownloadBoundaryHash=' + json.dumps(hashlib.sha256(download_source.encode()).hexdigest()) + ';' + 'const __lensDownloadBoundary=(()=>{const module={exports:{}};' + download_source + ';return module.exports;})();\n' + worker
        base = _replace_finish(base, _FINISH_CONTROL)
        combined = "const __lensRequest = " + json.dumps(request, separators=(",", ":")) + ";\n" + worker + "\n" + base
        scope = dict(readiness.remote_program.__globals__)
        scope["NODE_PROGRAM"] = combined
        clone = types.FunctionType(readiness.remote_program.__code__, scope)
        return _adapt_control_bootstrap(clone(), "deploy" if request.get("mode") in {"stage", "deploy", "cleanup"} else "preflight")
    except ReleaseError:
        raise
    except BaseException:
        raise ReleaseError("worker_unavailable") from None


def _collect_channel(stdout, stderr, timeout):
    channel = stdout.channel
    end, output, errors = time.monotonic() + timeout, bytearray(), bytearray()
    while True:
        while channel.recv_ready():
            output.extend(channel.recv(65536))
            if len(output) > _MAX_RESPONSE:
                channel.close()
                raise ReleaseError("remote_output_invalid")
        while channel.recv_stderr_ready():
            errors.extend(channel.recv_stderr(65536))
            if len(errors) > _MAX_RESPONSE:
                channel.close()
                raise ReleaseError("remote_output_invalid")
        if channel.exit_status_ready() and not channel.recv_ready() and not channel.recv_stderr_ready():
            if channel.recv_exit_status() != 0:
                raise ReleaseError("transport_failed")
            return bytes(output)
        if time.monotonic() >= end:
            channel.close()
            raise ReleaseError("transport_failed")
        time.sleep(0.01)


def _execute(client, request, timeout=120):
    stdin, stdout, stderr = client.exec_command("python3 -I -", timeout=timeout)
    stdin.write(build_remote_program(request))
    stdin.flush()
    stdin.channel.shutdown_write()
    raw = _collect_channel(stdout, stderr, timeout)
    return _decode_remote_response(raw)


def _project(public):
    if type(public) is not dict:
        raise ReleaseError("remote_output_invalid")
    template = ReleaseResult().to_dict()
    if set(public) - set(template):
        raise ReleaseError("remote_output_invalid")
    result = dict(template)
    for key, value in public.items():
        if key == "error":
            if value not in _ERRORS:
                raise ReleaseError("remote_output_invalid")
        elif key == "mode":
            if value not in {"preflight", "deploy"}:
                raise ReleaseError("remote_output_invalid")
        elif type(template[key]) is bool:
            if type(value) is not bool:
                raise ReleaseError("remote_output_invalid")
        elif type(value) is not int or not 0 <= value <= 1000000:
            raise ReleaseError("remote_output_invalid")
        result[key] = value
    return ReleaseResult(**result)


def _upload(client, stage, bundle):
    if type(stage) is not str or not stage.startswith("/") or not re.search(r"/\.lens-stage-[0-9a-f]{32}$", stage):
        raise ReleaseError("stage_invalid")
    with client.open_sftp() as sftp:
        s = sftp.lstat(stage)
        if not stat.S_ISDIR(s.st_mode) or stat.S_IMODE(s.st_mode) != 0o700:
            raise ReleaseError("stage_invalid")
        files = {"payload.tar": bundle.archive}
        base = Path(__file__).parent
        for name in ('lens_release_transaction.py', 'lens_production_file_worker.py', 'lens_additive_migration.cjs', 'attachment_schema_plan.cjs', 'lens_database_backup.cjs', 'lens_download_boundary.cjs', "lens_academic_transaction.py", "lens_academic_inventory.py", "lens_academic_release.cjs", "lens_dependency_closure.cjs"):
            file = base / name
            if not file.is_file() or file.is_symlink():
                raise ReleaseError("worker_unavailable")
            files[name] = file.read_bytes()
        for name, data in files.items():
            destination = stage + "/" + name
            with sftp.open(destination, 'wx') as stream:
                sftp.chmod(destination, 0o600)
                stream.write(data)
                stream.flush()
            if stat.S_IMODE(sftp.lstat(destination).st_mode) != 0o600:
                raise ReleaseError("stage_invalid")


def run_release(*, artifact_bundle=None, deploy=False, host_key_reviewed=False) -> ReleaseResult:
    """Preflight by default. --deploy authorizes this particular release action."""
    stage, request, previous = None, None, ReleaseResult(mode="deploy" if deploy else "preflight")
    try:
        if deploy and type(artifact_bundle) is not ArtifactBundle:
            raise ReleaseError("artifact_invalid")
        release_id = secrets.token_hex(16)
        request = {"mode": "preflight", "deploy": False, "release_id": release_id}
        with safe_ops._trusted_connection(safe_ops.load_project_entry(), host_key_reviewed=host_key_reviewed) as client:
            previous = _project(_execute(client, request)["public"])
            if not previous.ok or not deploy:
                return previous
            request.update(mode="stage", deploy=True)
            prepared = _execute(client, request)
            staged = _project(prepared["public"])
            if not staged.ok:
                return staged
            private = prepared.get("private")
            if type(private) is not dict or set(private) != {"stage"}:
                raise ReleaseError("stage_invalid")
            stage = private["stage"]
            try:
                _upload(client, stage, artifact_bundle)
            except BaseException:
                # Upload never dispatches application changes. Cleanup still needs
                # the remote worker's project/release ownership proof.
                try:
                    cleanup_request = dict(request, mode="cleanup", stage=stage)
                    cleanup = _project(_execute(client, cleanup_request)["public"])
                    if cleanup.ok and cleanup.cleanup_succeeded and not cleanup.production_changed:
                        stage = None
                except BaseException:
                    pass
                raise
            request.update(mode="deploy", stage=stage, entries=list(artifact_bundle.entries),
                           archive_sha256=artifact_bundle.archive_digest,
                           source_attested=artifact_bundle.source_attested)
            completed = _project(_execute(client, request, timeout=1800)["public"])
            if completed.error.startswith("bootstrap_") or completed.error in {"remote_exit_failed", "remote_stderr_present", "empty_output", "remote_response_too_large", "schema_mismatch", "invalid_json", "remote_output_invalid"}:
                # A launcher failure cannot certify production or cleanup state.
                # Keep the owned stage as recovery evidence until read-only review.
                return dataclasses.replace(previous, ok=False, mode="deploy", error=completed.error,
                    artifact_checked=True, artifact_file_count=len(artifact_bundle.entries),
                    source_attestation_present=artifact_bundle.source_attested,
                    evidence_retained=True, needs_manual_review=True, cleanup_succeeded=False)
            return completed
    except ReleaseError as error:
        code = error.code
    except PermissionError:
        # Keep local socket denial distinct from remote/authentication
        # failures while returning only a fixed, non-sensitive classification.
        code = "connection_permission_denied" if stage is None else "release_connection_permission_denied"
    except BaseException:
        code = "connection_blocked" if stage is None else "transport_failed"
    # Once dispatch can have changed production, disconnected execution is
    # uncertain. Never remove its stage or bundle through a fresh connection.
    dispatched = request is not None and request.get("mode") == "deploy"
    return dataclasses.replace(previous, ok=False, mode="deploy" if deploy else "preflight", error=code,
                               artifact_checked=artifact_bundle is not None,
                               artifact_file_count=len(artifact_bundle.entries) if type(artifact_bundle) is ArtifactBundle else 0,
                               evidence_retained=stage is not None, needs_manual_review=dispatched,
                               cleanup_succeeded=stage is None)



def run_config_shape_probe(*, host_key_reviewed: bool = False) -> dict:
    """Read only approved shape fields; never return values or paths."""
    empty = {"topType": "unavailable", "parsePassed": False, "appsPresent": False,
             "appsArray": False, "appsCount": 0, "singleAppPresent": False,
             "singleAppArray": False, "appNamePresent": False,
             "appScriptPresent": False, "appCwdPresent": False,"nameMatchesRuntime":False,"scriptMatchesRuntime":False,"cwdMatchesRuntime":False,"watchExplicitFalse":False,"watchAbsent":False,"tokensArray":False,"tokenCountNonzero":False,"smokePortNumber":False,"smokePortValid":False,"inspectNginxEntered":False,"inspectNginxCompleted":False,"captureHookReached":False}
    try:
        with safe_ops._trusted_connection(safe_ops.load_project_entry(),
                                          host_key_reviewed=host_key_reviewed) as client:
            value = _execute(client, {"mode": "config_probe", "deploy": False})["public"]
        if type(value) is not dict or set(value) != set(empty):
            return empty
        if value["topType"] not in {"unavailable", "null", "array", "object", "other"}:
            return empty
        if type(value["appsCount"]) is not int or not 0 <= value["appsCount"] <= 10000:
            return empty
        if any(type(value[key]) is not bool for key in empty if key not in {"topType", "appsCount"}):
            return empty
        return value
    except Exception:
        return empty

def main(argv=None):
    parser = argparse.ArgumentParser(description="Lens read-only release preflight; explicit deploy gate")
    parser.add_argument("--deploy", action="store_true")
    parser.add_argument("--artifact-root")
    parser.add_argument("--manifest")
    parser.add_argument("--host-key-reviewed", action="store_true")
    args = parser.parse_args(argv)
    try:
        bundle = None
        if args.deploy:
            if not args.artifact_root or not args.manifest:
                raise ReleaseError("artifact_invalid")
            with open(args.manifest, "rb") as stream:
                payload = stream.read(16 * 1024 * 1024 + 1)
            if len(payload) > 16 * 1024 * 1024:
                raise ReleaseError("artifact_invalid")
            bundle = prepare_artifact_bundle(args.artifact_root, json.loads(payload))
        result = run_release(artifact_bundle=bundle, deploy=args.deploy, host_key_reviewed=args.host_key_reviewed)
    except BaseException:
        result = ReleaseResult(mode="deploy" if args.deploy else "preflight", error="artifact_invalid")
    print(json.dumps(result.to_dict(), separators=(",", ":")))
    return 0 if result.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
