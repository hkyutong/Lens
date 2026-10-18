"""Controlled Academic file/config transaction; stdout is a closed status schema.

The controller remains alive while the caller uses the existing PM2 connection.
Runtime paths and the shared secret stay in this process or mode-600 files in
the caller's private stage/bundle. No manager CLI or global PM2 save is used.
"""
from __future__ import annotations

import base64
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import signal
import stat
import sys
import time

import lens_academic_inventory as inventory
import lens_release_transaction as files


CONFIG_NAME = ".lens-academic-private.json"
CONTROL_NAME = "academic-control.json"
READY_NAME = "academic-ready.json"
BACKUP_NAME = "academic-private-backup.json"
RECOVERY_TOOLS = ("lens_academic_transaction.py", "lens_academic_inventory.py", "lens_release_transaction.py")
FIELDS = frozenset({
    "ok", "error", "prepared", "files_applied", "configs_applied",
    "backup_verified", "rollback_completed", "manual_intervention", "changed_files",
})
ERRORS = frozenset({
    "none", "invalid_request", "discovery_failed", "runtime_ambiguous", "runtime_contract_invalid",
    "namespace_mismatch", "private_boundary_invalid", "configuration_invalid", "configuration_conflict",
    "artifact_invalid", "backup_invalid", "apply_failed", "verification_failed", "rollback_incomplete",
    "not_prepared", "already_prepared", "cleanup_failed",
})
ENVIRONMENT = {
    "secret": "LENS_ACADEMIC_INTERNAL_SECRET",
    "workspace_root": "LENS_ACADEMIC_WORKSPACE_ROOT",
    "log_root": "PATH_LOGGING",
    "upload_root": "PATH_PRIVATE_UPLOAD",
}


class AcademicError(Exception):
    def __init__(self, code):
        self.code = code if code in ERRORS else "invalid_request"
        super().__init__(self.code)


class _ReadyDeadline(BaseException):
    pass


def _identity(path):
    value = os.stat(path, follow_symlinks=False)
    return value.st_dev, value.st_ino


def _validated_owner(value):
    if not isinstance(value, (list, tuple)) or len(value) != 2 or any(type(item) is not int or not 0 <= item < 2 ** 32 - 1 for item in value):
        raise AcademicError("configuration_invalid")
    return tuple(value)


def _owner_matches(observed, owner):
    if owner is None:
        return observed.st_uid == os.geteuid()
    return (observed.st_uid, observed.st_gid) == _validated_owner(owner)


def _process_owner(process):
    observed = process["directory"].stat()
    if not stat.S_ISDIR(observed.st_mode):
        raise AcademicError("runtime_contract_invalid")
    return _validated_owner((observed.st_uid, observed.st_gid))


def _storage_owners_supported(node, academic, caller):
    node, academic, caller = (_validated_owner(value) for value in (node, academic, caller))
    return node == academic == caller or caller[0] == academic[0] == 0


def _directory(path, private=False, owner=None):
    value = Path(path)
    if not value.is_absolute() or value != Path(os.path.normpath(value)):
        raise AcademicError("private_boundary_invalid")
    for parent in [*reversed(value.parents), value]:
        observed = os.lstat(parent)
        if not stat.S_ISDIR(observed.st_mode):
            raise AcademicError("private_boundary_invalid")
    if private and (stat.S_IMODE(observed.st_mode) != 0o700 or not _owner_matches(observed, owner)):
        raise AcademicError("private_boundary_invalid")
    return value


def _assign_new_directory_owner(path, owner):
    owner = _validated_owner(owner)
    descriptor = os.open(path, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        observed = os.fstat(descriptor)
        named = os.lstat(path)
        if not stat.S_ISDIR(observed.st_mode) or stat.S_IMODE(observed.st_mode) != 0o700 or (observed.st_dev, observed.st_ino) != (named.st_dev, named.st_ino):
            raise AcademicError("private_boundary_invalid")
        if not _owner_matches(observed, owner):
            os.fchown(descriptor, *owner)
        if not _owner_matches(os.fstat(descriptor), owner):
            raise AcademicError("private_boundary_invalid")
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _read_regular(path, maximum=8192, private=False, owner=None):
    descriptor = None
    try:
        descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        observed = os.fstat(descriptor)
        if not stat.S_ISREG(observed.st_mode) or observed.st_nlink != 1 or observed.st_size > maximum:
            raise AcademicError("configuration_invalid")
        if private and (stat.S_IMODE(observed.st_mode) != 0o600 or not _owner_matches(observed, owner)):
            raise AcademicError("configuration_invalid")
        raw = os.read(descriptor, maximum + 1)
        if len(raw) > maximum:
            raise AcademicError("configuration_invalid")
        return raw, stat.S_IMODE(observed.st_mode)
    finally:
        if descriptor is not None:
            os.close(descriptor)


def _atomic_private(path, data, mode=0o600, owner=None):
    path = Path(path)
    parent = _directory(path.parent)
    if owner is not None:
        owner = _validated_owner(owner)
    temporary = parent / (".lens-config-" + secrets.token_hex(16))
    descriptor = None
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
        with os.fdopen(descriptor, "wb") as stream:
            descriptor = None
            stream.write(data)
            stream.flush()
            if owner is not None and not _owner_matches(os.fstat(stream.fileno()), owner):
                os.fchown(stream.fileno(), *owner)
            os.fchmod(stream.fileno(), mode)
            if owner is not None and not _owner_matches(os.fstat(stream.fileno()), owner):
                raise AcademicError("configuration_invalid")
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        directory = os.open(parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if descriptor is not None:
            os.close(descriptor)
        if temporary.exists():
            temporary.unlink()


def _json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _load_configuration(raw):
    try:
        value = json.loads(raw)
        if not isinstance(value, dict) or set(value) != {"version", *ENVIRONMENT}:
            raise ValueError()
        if type(value["version"]) is not int or value["version"] != 1:
            raise ValueError()
        if not isinstance(value["secret"], str) or re.fullmatch(r"[\x21-\x7e]{32,256}", value["secret"]) is None:
            raise ValueError()
        for name in ("workspace_root", "log_root", "upload_root"):
            if not isinstance(value[name], str) or not Path(value[name]).is_absolute() or "\0" in value[name]:
                raise ValueError()
        return value
    except Exception:
        raise AcademicError("configuration_invalid") from None


def _shares_verified_pm2_parent(node, environment, runtime):
    return 'pm_id' not in environment and type(node.get('parent')) is int and (node['parent'] > 1) and (node['parent'] == runtime._process.get('parent')) and (environment.get('PM2_HOME') == runtime._handle[0])


class AcademicController:
    __slots__ = (
        "_runtime", "_node", "_stage", "_bundle", "_private", "_plan", "_configuration",
        "_original", "_config_paths", "_root_identities", "_created_roots", "_status", "_recovery_manifest",
    )

    def __init__(self):
        self._runtime = self._node = self._stage = self._bundle = self._private = self._plan = None
        self._configuration = self._original = self._config_paths = self._root_identities = None
        self._created_roots = []
        self._recovery_manifest = None
        self._status = dict(ok=False, error="none", prepared=False, files_applied=False,
                            configs_applied=False, backup_verified=False, rollback_completed=False,
                            manual_intervention=False, changed_files=0)

    def __repr__(self):
        return "<AcademicController redacted>"

    def status(self, ok=False, error="none"):
        self._status.update(ok=bool(ok), error=error if error in ERRORS else "invalid_request")
        return dict(self._status)

    def _roots_unchanged(self):
        for path, identity in self._root_identities:
            _directory(path)
            if _identity(path) != identity:
                raise AcademicError("private_boundary_invalid")

    def prepare(self, request, proc="/proc"):
        if self._status["prepared"]:
            raise AcademicError("already_prepared")
        if set(request) != {"action", "stage", "bundle", "release_id", "node_cwd", "private_storage", "entries"}:
            raise AcademicError("invalid_request")
        stage, bundle = _directory(request["stage"], True), _directory(request["bundle"], True)
        node_root = _directory(request["node_cwd"])
        if stage == bundle or stage in bundle.parents or bundle in stage.parents:
            raise AcademicError("private_boundary_invalid")
        observations = {"unreadable_process_count": 0}
        runtimes, nodes = inventory.discover(proc, observations)
        if observations["unreadable_process_count"]:
            raise AcademicError("discovery_failed")
        if len(runtimes) != 1:
            raise AcademicError("runtime_ambiguous")
        runtime = runtimes[0]
        if runtime._manager != "pm2" or runtime._handle is None:
            raise AcademicError("runtime_contract_invalid")
        if runtime._process["directory"].stat().st_uid != os.geteuid():
            raise AcademicError("runtime_contract_invalid")
        academic_root = _directory(runtime._root)
        if _identity(academic_root) != _identity(runtime._view):
            raise AcademicError("namespace_mismatch")
        matching = []
        for node in nodes:
            try:
                if _identity(inventory._filesystem_path(node, node["cwd"])) == _identity(node_root):
                    environment = inventory._environment(node["directory"] / "environ")
                    manager, handle = inventory._manager(proc, node, environment)
                    # PM2 may inject pm_id after exec, outside the initial OS environment.
                    # The already verified academic process attests its direct PM2 parent.
                    shared_pm2_parent = (
                        _shares_verified_pm2_parent(node, environment, runtime)
                    )
                    if (manager == "pm2" and handle and handle[0] == runtime._handle[0]) or shared_pm2_parent:
                        matching.append((node, environment, handle))
            except Exception:
                continue
        if len(matching) != 1:
            raise AcademicError("runtime_contract_invalid")
        node, node_environment, _ = matching[0]
        owners = [_process_owner(node), _process_owner(runtime._process)]
        if not _storage_owners_supported(*owners, (os.geteuid(), os.getegid())):
            raise AcademicError("runtime_contract_invalid")
        if not inventory.node_source_verified(node_root):
            raise AcademicError("runtime_contract_invalid")
        if os.readlink(runtime._process["directory"] / "ns/net") != os.readlink(Path(proc) / "self/ns/net"):
            raise AcademicError("namespace_mismatch")
        if not any(str(inventory._filesystem_path(runtime._process, argument)) == str(runtime._view / "shared_utils/fastapi_stream_server.py")
                   for argument in runtime._process["arguments"][1:] if argument.endswith(".py")):
            raise AcademicError("runtime_contract_invalid")
        attachments = Path(request["private_storage"])
        if attachments != node_root / "private/attachments":
            raise AcademicError("private_boundary_invalid")
        # This is a newly designed persistent location relative to the observed
        # Academic source root; the existing Node attachment tree is untouched.
        private = academic_root.parent / ".lens-academic-storage"
        _directory(private.parent)
        if private.exists():
            _directory(private, private=True, owner=owners[0])
        for code in (node_root, academic_root):
            if private == code or code in private.parents or private in code.parents:
                raise AcademicError("private_boundary_invalid")
            if stage == code or stage in code.parents or code in stage.parents:
                raise AcademicError("private_boundary_invalid")
            if bundle == code or bundle in code.parents or code in bundle.parents:
                raise AcademicError("private_boundary_invalid")
        entries = request["entries"]
        selected = [entry for entry in entries if isinstance(entry, dict) and isinstance(entry.get("source"), str)
                    and entry["source"].startswith("academic-4.0/")]
        expected = {"academic-4.0/" + role for role in inventory.ARTIFACTS}
        if len(selected) != len(expected) or {entry["source"] for entry in selected} != expected:
            raise AcademicError("artifact_invalid")
        source = _directory(stage / "artifacts/academic-4.0")
        for entry in selected:
            if set(entry) != {"source", "role", "sha256", "size"}:
                raise AcademicError("artifact_invalid")
            role = entry["source"][len("academic-4.0/"):]
            _directory((source / role).parent)
            data, _ = _read_regular(source / role, 8 * 1024 * 1024)
            if type(entry["size"]) is not int or entry["size"] != len(data) or entry["sha256"] != hashlib.sha256(data).hexdigest():
                raise AcademicError("artifact_invalid")
        original, paths = [], [node_root / CONFIG_NAME, academic_root / CONFIG_NAME]
        existing = []
        for path, owner in zip(paths, owners):
            try:
                raw, mode = _read_regular(path, private=True, owner=owner)
                value = _load_configuration(raw)
                existing.append(value)
                original.append({"present": True, "raw": base64.b64encode(raw).decode("ascii"), "mode": mode, "owner": list(owner)})
            except FileNotFoundError:
                original.append({"present": False, "raw": "", "mode": 0o600, "owner": list(owner)})
        if existing and any(item != existing[0] for item in existing):
            raise AcademicError("configuration_conflict")
        environments = [node_environment, runtime._environment]
        configured = existing[0] if existing else None
        if configured is None:
            configured = {
                "version": 1, "secret": secrets.token_urlsafe(48),
                "workspace_root": str(private / "academic-workspaces"),
                "log_root": str(private / "academic-logs"),
                "upload_root": str(private / "academic-uploads"),
            }
            _load_configuration(_json(configured))
        if existing:
            for env in environments:
                for field, key in ENVIRONMENT.items():
                    if env.get(key) and env[key] != configured[field]:
                        raise AcademicError("configuration_conflict")
                if env.get("ACADEMIC_TEMP_ROOT") and env["ACADEMIC_TEMP_ROOT"] != configured["upload_root"]:
                    raise AcademicError("configuration_conflict")
        for field in ("workspace_root", "log_root", "upload_root"):
            root = Path(configured[field])
            if root.exists() or root.parent != private:
                # Existing directories must retain the private runtime contract.
                _directory(root, private=True, owner=owners[0])
            for code in (node_root, academic_root):
                if root == code or code in root.parents:
                    raise AcademicError("private_boundary_invalid")
        baseline = files.capture_baseline(academic_root, inventory.ARTIFACTS, artifact_roots=inventory.ARTIFACTS)
        plan = files.prepare_release_plan(
            source, academic_root, [files.ManifestEntry(role, role) for role in inventory.ARTIFACTS],
            release_id=request["release_id"], baseline=baseline, backup_root=bundle / "academic-files",
            artifact_roots=inventory.ARTIFACTS,
        )
        self._runtime, self._node, self._stage, self._bundle, self._private = runtime, node, stage, bundle, private
        self._plan, self._configuration, self._original, self._config_paths = plan, configured, original, paths
        existing_private_roots = [root for root in (private, *(Path(configured[key]) for key in ("workspace_root", "log_root", "upload_root"))) if root.exists()]
        self._root_identities = [(root, _identity(root)) for root in (node_root, academic_root, stage, bundle, *existing_private_roots)]
        recovery = bundle / "academic-recovery"
        recovery.mkdir(mode=0o700)
        recovery_manifest = {}
        for role in RECOVERY_TOOLS:
            payload, _ = _read_regular(Path(__file__).parent / role, 4 * 1024 * 1024)
            _atomic_private(recovery / role, payload)
            copied, _ = _read_regular(recovery / role, 4 * 1024 * 1024, private=True)
            if copied != payload:
                raise AcademicError("backup_invalid")
            recovery_manifest[role] = hashlib.sha256(payload).hexdigest()
        self._recovery_manifest = recovery_manifest
        backup = {
            "version": 1, "configurations": original,
            "roots": {"node": str(node_root), "academic": str(academic_root)},
            "root_identities": [list(_identity(node_root)), list(_identity(academic_root))],
            "candidate_sha256": hashlib.sha256(_json(configured)).hexdigest(),
            "recovery": recovery_manifest,
        }
        backup_path = bundle / BACKUP_NAME
        if backup_path.exists() or (stage / CONTROL_NAME).exists():
            raise AcademicError("backup_invalid")
        _atomic_private(backup_path, _json(backup))
        raw, _ = _read_regular(backup_path, private=True)
        if json.loads(raw) != backup:
            raise AcademicError("backup_invalid")
        control = {
            "version": 1, "process_id": runtime._process["identifier"],
            "pm2_id": runtime._handle[1], "pm2_home": runtime._handle[0],
            "cwd": runtime._process["cwd"], "executable": runtime._process["executable"],
            "arguments": list(runtime._process["arguments"]),
            "clear_environment": [*ENVIRONMENT.values(), "ACADEMIC_TEMP_ROOT"],
            "source_root": str(academic_root), "node_cwd": str(node_root),
            "listener_endpoints": [list(endpoint) for endpoint in sorted(inventory._listeners(runtime._process))],
            "academic_url_environment": node_environment.get("ACADEMIC_API_URL", ""),
        }
        _atomic_private(stage / CONTROL_NAME, _json(control))
        self._status["prepared"] = True
        return self.status(True)

    def _check_original_configurations(self):
        for path, before in zip(self._config_paths, self._original):
            try:
                raw, mode = _read_regular(path, private=True, owner=before["owner"])
            except AcademicError:
                raise AcademicError("configuration_conflict") from None
            except FileNotFoundError:
                if before["present"]:
                    raise AcademicError("configuration_conflict")
                continue
            if not before["present"] or mode != before["mode"] or raw != base64.b64decode(before["raw"]):
                raise AcademicError("configuration_conflict")

    def _backup_valid(self):
        raw, _ = _read_regular(self._bundle / BACKUP_NAME, private=True)
        expected = {
            "version": 1, "configurations": self._original,
            "roots": {"node": str(self._config_paths[0].parent), "academic": str(self._config_paths[1].parent)},
            "root_identities": [list(identity) for _, identity in self._root_identities[:2]],
            "candidate_sha256": hashlib.sha256(_json(self._configuration)).hexdigest(),
            "recovery": self._recovery_manifest,
        }
        if json.loads(raw) != expected:
            raise AcademicError("backup_invalid")
        _verify_recovery_tools(self._bundle, self._recovery_manifest)
        if self._status["files_applied"] and not files.verify_backup(self._plan.backup_root).ok:
            raise AcademicError("backup_invalid")

    def apply(self, fault_injector=None):
        if not self._status["prepared"] or self._status["files_applied"]:
            raise AcademicError("not_prepared")
        self._roots_unchanged()
        self._backup_valid()
        self._check_original_configurations()
        result = files.execute_release(self._plan, fault_injector=fault_injector)
        self._status["backup_verified"] = result.backup_verified
        self._status["changed_files"] = result.changed_files
        if not result.ok:
            self._status["manual_intervention"] = result.manual_intervention
            raise AcademicError("apply_failed")
        self._status["files_applied"] = True
        roots = [self._private, *(Path(self._configuration[key]) for key in ("workspace_root", "log_root", "upload_root"))]
        for root in roots:
            if not root.exists():
                root.mkdir(mode=0o700)
                self._created_roots.append(root)
                _assign_new_directory_owner(root, self._original[0]["owner"])
                self._root_identities.append((root, _identity(root)))
            _directory(root, private=True, owner=self._original[0]["owner"])
        for index, path in enumerate(self._config_paths):
            if fault_injector:
                fault_injector("configuration_write", index)
            _atomic_private(path, _json(self._configuration), owner=self._original[index]["owner"])
        self._status["configs_applied"] = True
        return self.verify()

    def verify(self):
        if not self._status["prepared"]:
            raise AcademicError("not_prepared")
        self._roots_unchanged()
        self._backup_valid()
        if not self._status["files_applied"] or not self._status["configs_applied"]:
            raise AcademicError("verification_failed")
        for root in (self._private, *(Path(self._configuration[key]) for key in ("workspace_root", "log_root", "upload_root"))):
            _directory(root, private=True, owner=self._original[0]["owner"])
        for path, before in zip(self._config_paths, self._original):
            raw, _ = _read_regular(path, private=True, owner=before["owner"])
            if _load_configuration(raw) != self._configuration:
                raise AcademicError("verification_failed")
        for entry, expected in zip(self._plan.entries, self._plan.after):
            raw, _ = _read_regular(self._plan.target_root / entry.target, 8 * 1024 * 1024)
            if hashlib.sha256(raw).hexdigest() != expected.digest:
                raise AcademicError("verification_failed")
        self._status["backup_verified"] = True
        return self.status(True)

    def ready(self):
        def deadline(_number, _frame):
            raise _ReadyDeadline()
        previous_handler = signal.getsignal(signal.SIGALRM)
        previous_timer = signal.getitimer(signal.ITIMER_REAL)
        signal.signal(signal.SIGALRM, deadline)
        signal.setitimer(signal.ITIMER_REAL, 25)
        try:
            self.verify()
            observed = inventory.inventory()
            _atomic_private(self._bundle / "academic-readiness-checks.json", _json({
                "version": 1,
                "checks": {name: observed.get(name) is True for name in sorted(inventory.BOOLEAN_FIELDS)},
            }))
            if not observed["ok"]:
                raise AcademicError("verification_failed")
            candidates, nodes = inventory.discover()
            if len(candidates) != 1 or _identity(candidates[0]._root) != _identity(self._plan.target_root) or _process_owner(candidates[0]._process) != tuple(self._original[1]["owner"]):
                raise AcademicError("verification_failed")
            node_matches = []
            for node in nodes:
                try:
                    root = inventory._filesystem_path(node, node["cwd"])
                    if _identity(root) != _identity(Path(self._node["cwd"])):
                        continue
                    if _process_owner(node) != tuple(self._original[0]["owner"]):
                        continue
                    environment = inventory._environment(node["directory"] / "environ")
                    manager, handle = inventory._manager("/proc", node, environment)
                    if (manager == "pm2" and handle and handle[0] == self._runtime._handle[0]) or _shares_verified_pm2_parent(node, environment, self._runtime):
                        node_matches.append(environment)
                except Exception:
                    continue
            if len(node_matches) != 1:
                raise AcademicError("verification_failed")
            _atomic_private(self._stage / READY_NAME, _json({
                "version": 1,
                "listener_endpoints": [list(endpoint) for endpoint in sorted(inventory._listeners(candidates[0]._process))],
                "academic_url_environment": node_matches[0].get("ACADEMIC_API_URL", ""),
            }))
            return self.status(True)
        except _ReadyDeadline:
            raise AcademicError("verification_failed") from None
        finally:
            signal.setitimer(signal.ITIMER_REAL, *previous_timer)
            signal.signal(signal.SIGALRM, previous_handler)

    def restore(self):
        if not self._status["prepared"]:
            raise AcademicError("not_prepared")
        try:
            self._roots_unchanged()
            self._backup_valid()
            candidate = _json(self._configuration)
            for path, before in zip(self._config_paths, self._original):
                try:
                    current, _ = _read_regular(path, private=True, owner=before["owner"])
                except FileNotFoundError:
                    current = None
                original = base64.b64decode(before["raw"]) if before["present"] else None
                if current not in (original, candidate):
                    raise AcademicError("rollback_incomplete")
                if original is None:
                    if current is not None:
                        path.unlink()
                elif current != original:
                    _atomic_private(path, original, before["mode"], owner=before["owner"])
            if self._status["files_applied"]:
                result = files.restore_backup(self._plan.backup_root, self._plan.target_root)
                if not result.ok:
                    raise AcademicError("rollback_incomplete")
            # Only empty directories created by this transaction are removable.
            # Any newly generated report/upload/log is retained across rollback.
            for root in reversed(self._created_roots):
                try:
                    root.rmdir()
                except OSError:
                    pass
            self._check_original_configurations()
            self._status.update(files_applied=False, configs_applied=False, rollback_completed=True)
            return self.status(True)
        except Exception:
            self._status["manual_intervention"] = True
            raise AcademicError("rollback_incomplete") from None

    def close(self):
        if self._stage is not None:
            for name in (CONTROL_NAME, READY_NAME):
                control = self._stage / name
                if control.exists():
                    _read_regular(control, private=True)
                    control.unlink()
        return self.status(True)

    def dispatch(self, request):
        try:
            if not isinstance(request, dict):
                raise AcademicError("invalid_request")
            action = request.get("action")
            if action == "prepare":
                return self.prepare(request)
            if set(request) != {"action"}:
                raise AcademicError("invalid_request")
            if action not in {"apply", "verify", "ready", "restore", "close"}:
                raise AcademicError("invalid_request")
            return getattr(self, action)()
        except AcademicError as failure:
            return self.status(False, failure.code)
        except BaseException:
            return self.status(False, "apply_failed")


def control(input_stream=None, output_stream=None):
    source = sys.stdin if input_stream is None else input_stream
    output = sys.stdout if output_stream is None else output_stream
    controller = AcademicController()
    for line in source:
        request = None
        try:
            request = json.loads(line) if len(line) <= 1024 * 1024 else None
            result = controller.dispatch(request)
        except BaseException:
            result = controller.status(False, "invalid_request")
        output.write(json.dumps(result, sort_keys=True) + "\n")
        output.flush()
        if isinstance(request, dict) and request.get("action") == "close":
            break


def recover_bundle(request):
    """Restore from the retained bundle even after controller/stage loss."""
    controller = AcademicController()
    status = controller._status
    try:
        if not isinstance(request, dict) or set(request) != {"action", "bundle"} or request["action"] != "restore":
            raise AcademicError("invalid_request")
        bundle = _directory(request["bundle"], True)
        raw, _ = _read_regular(bundle / BACKUP_NAME, private=True)
        record = json.loads(raw)
        if not isinstance(record, dict) or set(record) != {"version", "configurations", "roots", "root_identities", "candidate_sha256", "recovery"}:
            raise AcademicError("backup_invalid")
        if type(record["version"]) is not int or record["version"] != 1:
            raise AcademicError("backup_invalid")
        _verify_recovery_tools(bundle, record["recovery"])
        if not isinstance(record["roots"], dict) or set(record["roots"]) != {"node", "academic"}:
            raise AcademicError("backup_invalid")
        if not isinstance(record["candidate_sha256"], str) or re.fullmatch(r"[0-9a-f]{64}", record["candidate_sha256"]) is None:
            raise AcademicError("backup_invalid")
        roots = [_directory(record["roots"][name]) for name in ("node", "academic")]
        if [list(_identity(root)) for root in roots] != record["root_identities"]:
            raise AcademicError("backup_invalid")
        originals = record["configurations"]
        if not isinstance(originals, list) or len(originals) != 2:
            raise AcademicError("backup_invalid")
        # Check all original/current records before beginning any recovery write.
        changes = []
        for root, before in zip(roots, originals):
            if not isinstance(before, dict) or set(before) not in ({"present", "raw", "mode"}, {"present", "raw", "mode", "owner"}) or type(before["present"]) is not bool or before["mode"] != 0o600:
                raise AcademicError("backup_invalid")
            owner = _validated_owner(before["owner"]) if "owner" in before else None
            original = base64.b64decode(before["raw"], validate=True) if before["present"] else None
            if original is not None:
                _load_configuration(original)
            elif before["raw"] != "":
                raise AcademicError("backup_invalid")
            target = root / CONFIG_NAME
            try:
                current, _ = _read_regular(target, private=True, owner=owner)
            except FileNotFoundError:
                current = None
            old_hash = hashlib.sha256(original).hexdigest() if original is not None else None
            actual_hash = hashlib.sha256(current).hexdigest() if current is not None else None
            if actual_hash not in {old_hash, record["candidate_sha256"]}:
                raise AcademicError("rollback_incomplete")
            changes.append((target, current, original, owner))
        file_backup = bundle / "academic-files"
        if file_backup.exists() and not files.verify_backup(file_backup).ok:
            raise AcademicError("backup_invalid")
        for target, current, original, owner in changes:
            if original is None and current is not None:
                target.unlink()
            elif original is not None and current != original:
                _atomic_private(target, original, owner=owner)
        if file_backup.exists():
            result = files.restore_backup(file_backup, roots[1])
            if not result.ok:
                raise AcademicError("rollback_incomplete")
        status.update(prepared=True, backup_verified=True, rollback_completed=True)
        return controller.status(True)
    except BaseException:
        status["manual_intervention"] = True
        return controller.status(False, "rollback_incomplete")



def old_runtime_ready(request, proc="/proc", timeout=25):
    controller = AcademicController()
    fields = {"action", "source_root", "cwd", "executable", "manager_home", "listener_endpoints"}
    try:
        if not isinstance(request, dict) or set(request) != fields or request["action"] != "old_ready":
            raise AcademicError("invalid_request")
        for field in ("source_root", "cwd", "executable", "manager_home"):
            if not isinstance(request[field], str) or not Path(request[field]).is_absolute():
                raise AcademicError("invalid_request")
        expected_root = _directory(request["source_root"])
        expected_cwd = _directory(request["cwd"])
        endpoints = request["listener_endpoints"]
        if not isinstance(endpoints, list) or len(endpoints) != 1:
            raise AcademicError("invalid_request")
        expected_listener = set()
        for endpoint in endpoints:
            if not isinstance(endpoint, list) or len(endpoint) != 2:
                raise AcademicError("invalid_request")
            host, port = endpoint
            if host not in ("127.0.0.1", "::1") or type(port) is not int or not 1 <= port <= 65535:
                raise AcademicError("invalid_request")
            expected_listener.add((host, port))
        deadline = time.monotonic() + max(0, timeout)
        while True:
            try:
                observations = {"unreadable_process_count": 0}
                candidates, _ = inventory.discover(proc, observations)
                if observations["unreadable_process_count"] or len(candidates) != 1:
                    raise AcademicError("verification_failed")
                runtime = candidates[0]
                if (runtime._manager != "pm2" or not runtime._handle
                    or runtime._handle[0] != request["manager_home"]
                    or _identity(runtime._root) != _identity(expected_root)
                    or _identity(runtime._view) != _identity(expected_root)
                    or os.readlink(runtime._process["directory"] / "ns/net") != os.readlink(Path(proc) / "self/ns/net")
                    or _identity(Path(runtime._process["cwd"])) != _identity(expected_cwd)
                    or runtime._process["executable"] != request["executable"]
                    or runtime._process["directory"].stat().st_uid != os.geteuid()
                    or inventory._listeners(runtime._process) != expected_listener):
                    raise AcademicError("verification_failed")
                controller._status["rollback_completed"] = True
                return controller.status(True)
            except Exception:
                if time.monotonic() >= deadline:
                    raise AcademicError("verification_failed") from None
                time.sleep(min(0.2, max(0, deadline - time.monotonic())))
    except AcademicError as error:
        return controller.status(False, error.code)
    except BaseException:
        return controller.status(False, "verification_failed")


def _verify_recovery_tools(bundle, manifest):
    if not isinstance(manifest, dict) or set(manifest) != set(RECOVERY_TOOLS):
        raise AcademicError("backup_invalid")
    _directory(bundle / "academic-recovery", True)
    for role, digest in manifest.items():
        if not isinstance(digest, str) or re.fullmatch(r"[0-9a-f]{64}", digest) is None:
            raise AcademicError("backup_invalid")
        payload, _ = _read_regular(bundle / "academic-recovery" / role, 4 * 1024 * 1024, private=True)
        if hashlib.sha256(payload).hexdigest() != digest:
            raise AcademicError("backup_invalid")


if __name__ == "__main__":
    if sys.argv[1:] == ["--control"]:
        control()
    elif sys.argv[1:] in (["--recover"], ["--old-ready"]):
        try:
            payload = sys.stdin.buffer.read(1024 * 1024 + 1)
            request = json.loads(payload) if len(payload) <= 1024 * 1024 else None
        except BaseException:
            request = None
        print(json.dumps(recover_bundle(request) if sys.argv[1:] == ["--recover"] else old_runtime_ready(request), sort_keys=True))
