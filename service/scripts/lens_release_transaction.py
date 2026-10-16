"""Local, file-only release transactions. No network or application lifecycle work.

The caller supplies an explicit file manifest, artifact roots, a captured baseline,
and an unused directory inside its single backup bundle. The caller must quiesce
writers: directory flock coordinates this module's callers, not arbitrary writers.
Each replacement is atomic; the complete manifest is recovered by compensating
rollback. Database/configuration backup and old-bundle retention belong to callers.
All public errors and results intentionally omit paths and exception details.
"""

from __future__ import annotations

import contextlib
import dataclasses
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import stat
import tempfile
from typing import Callable, Iterable, Mapping


_NOFOLLOW = os.O_NOFOLLOW
_DIRECTORY = os.O_DIRECTORY
_MAX_ENTRIES = 100000
_MAX_METADATA = 16 * 1024 * 1024
_BLOCKED_PARTS = frozenset({
    "upload", "uploads", "user_uploads", "user-files", "userdata", "user_data",
    "storage", "persistent", "persistence", "data", "instance", "config",
    "configs", "configuration", "log", "logs", "secrets", "certificates",
    "backups", "backup", "node_modules", ".git", ".env", "__pycache__",
})
_BLOCKED_SUFFIXES = (".env", ".key", ".pem", ".p12", ".pfx", ".crt", ".cer",
                     ".db", ".sqlite", ".sqlite3", ".log")
_CODES = frozenset({
    "none", "invalid_input", "unsafe_path", "protected_path", "unsupported_file",
    "source_changed", "baseline_changed", "backup_failed", "backup_invalid",
    "copy_failed", "verification_failed", "swap_failed", "rollback_conflict",
    "rollback_failed", "cleanup_failed", "busy", "io_failed",
})


class TransactionError(Exception):
    """A fixed classification, never an underlying exception or filesystem path."""

    def __init__(self, code: str):
        self.code = code if code in _CODES else "io_failed"
        super().__init__(self.code)


@dataclasses.dataclass(frozen=True)
class ManifestEntry:
    """source=None explicitly removes target; all other entries copy one file."""

    source: str | None = dataclasses.field(repr=False)
    target: str = dataclasses.field(repr=False)


@dataclasses.dataclass(frozen=True)
class TransactionResult:
    ok: bool = False
    phase: str = "validation"
    error: str = "none"
    planned_files: int = 0
    changed_files: int = 0
    restored_files: int = 0
    backup_verified: bool = False
    rollback_attempted: bool = False
    rollback_succeeded: bool = False
    manual_intervention: bool = False
    evidence_retained: bool = False
    cleanup_succeeded: bool = True

    def to_dict(self) -> dict:
        return dataclasses.asdict(self)


@dataclasses.dataclass(frozen=True, repr=False)
class _State:
    digest: str
    size: int
    mode: int
    signature: tuple


@dataclasses.dataclass(frozen=True, repr=False)
class ReleasePlan:
    source_root: Path
    target_root: Path
    backup_root: Path
    release_id: str
    entries: tuple[ManifestEntry, ...]
    artifact_roots: tuple[str, ...]
    protected_roots: tuple[str, ...]
    before: tuple[_State | None, ...]
    after: tuple[_State | None, ...]

    def __repr__(self):
        return "<ReleasePlan>"


FaultInjector = Callable[[str, int], None]


def _fault(injector, event, index=-1):
    if injector is not None:
        injector(event, index)


def _relative(value, *, allow_hidden=False):
    if (not isinstance(value, str) or not value or "\\" in value or "\x00" in value
            or value.startswith("/") or any(p in ("", ".", "..") for p in value.split("/"))):
        raise TransactionError("unsafe_path")
    if not allow_hidden and any(part.startswith(".") for part in value.split("/")):
        raise TransactionError("protected_path")
    return value


def _policy(artifact_roots, protected_roots):
    roots = tuple(_relative(p) for p in artifact_roots)
    protected = tuple(_relative(p) for p in protected_roots)
    if not roots or len(set(roots)) != len(roots):
        raise TransactionError("invalid_input")
    return roots, protected


def _is_compiled_configuration_module(path: str) -> bool:
    """Class artifacts are code; runtime configuration names remain protected."""
    suffixes = ("controller", "service", "module", "entity", "dto")
    compiled_names = {
        f"config.{suffix}.js{mapping}"
        for suffix in suffixes
        for mapping in ("", ".map")
    }
    return (
        path.startswith(('dist/', 'service/dist/'))
        and path.rsplit("/", 1)[-1] in compiled_names
    )


def _allowed(path, roots, protected):
    path = _relative(path)
    parts = path.lower().split("/")
    if (any(p in _BLOCKED_PARTS for p in parts)
            or parts[-1].endswith(_BLOCKED_SUFFIXES)
            or (parts[-1].startswith((".env", "config.", "appsettings.")) and not _is_compiled_configuration_module(path))
            or any(path == p or path.startswith(p + "/") for p in protected)
            or not any(path == p or path.startswith(p + "/") for p in roots)):
        raise TransactionError("protected_path")
    return path


def _absolute(value):
    p = Path(value)
    if not p.is_absolute() or ".." in p.parts:
        raise TransactionError("unsafe_path")
    # Do not resolve first: resolving would silently accept symlink ancestors.
    current = Path(p.anchor)
    for part in p.parts[1:]:
        current /= part
        try:
            s = current.lstat()
        except FileNotFoundError:
            if current != p:
                raise TransactionError("unsafe_path") from None
            break
        if stat.S_ISLNK(s.st_mode):
            raise TransactionError("unsafe_path")
        if current != p and not stat.S_ISDIR(s.st_mode):
            raise TransactionError("unsafe_path")
    return p


class _Root:
    def __init__(self, path):
        self.path = _absolute(path)
        self.fd = os.open(self.path, os.O_RDONLY | _DIRECTORY | _NOFOLLOW)
        s = os.fstat(self.fd)
        self.identity = (s.st_dev, s.st_ino)

    def close(self):
        os.close(self.fd)

    def check(self):
        _absolute(self.path)
        s = self.path.lstat()
        if not stat.S_ISDIR(s.st_mode) or (s.st_dev, s.st_ino) != self.identity:
            raise TransactionError("baseline_changed")

    @contextlib.contextmanager
    def parent(self, relative, create=False, created=None):
        # Public manifest paths have already passed the stricter artifact policy.
        # Internal record files can be hidden, but can never traverse directories.
        parts = _relative(relative, allow_hidden=True).split("/")
        fd = os.dup(self.fd)
        prefix = []
        try:
            for part in parts[:-1]:
                prefix.append(part)
                try:
                    child = os.open(part, os.O_RDONLY | _DIRECTORY | _NOFOLLOW, dir_fd=fd)
                except FileNotFoundError:
                    if not create:
                        raise
                    os.mkdir(part, 0o755, dir_fd=fd)
                    if created is not None:
                        made = os.stat(part, dir_fd=fd, follow_symlinks=False)
                        created.append(("/".join(prefix), made.st_dev, made.st_ino))
                    os.fsync(fd)
                    child = os.open(part, os.O_RDONLY | _DIRECTORY | _NOFOLLOW, dir_fd=fd)
                os.close(fd)
                fd = child
                if os.fstat(fd).st_dev != self.identity[0]:
                    raise TransactionError("unsafe_path")
            yield fd, parts[-1]
        finally:
            os.close(fd)


@contextlib.contextmanager
def _root(path):
    r = _Root(path)
    try:
        yield r
    finally:
        r.close()


def _signature(s):
    return (s.st_dev, s.st_ino, s.st_size, s.st_mtime_ns, s.st_ctime_ns, s.st_mode)


@contextlib.contextmanager
def _open_regular(root, relative):
    with root.parent(relative) as (parent, name):
        before = os.stat(name, dir_fd=parent, follow_symlinks=False)
        if not stat.S_ISREG(before.st_mode) or before.st_nlink != 1:
            raise TransactionError("unsupported_file")
        fd = os.open(name, os.O_RDONLY | _NOFOLLOW | os.O_NONBLOCK, dir_fd=parent)
        try:
            actual = os.fstat(fd)
            if _signature(actual) != _signature(before):
                raise TransactionError("baseline_changed")
            yield fd, actual
        finally:
            os.close(fd)


def _read_state(root, relative, sink=None):
    try:
        with _open_regular(root, relative) as (fd, s):
            digest = hashlib.sha256()
            size = 0
            while True:
                block = os.read(fd, 1024 * 1024)
                if not block:
                    break
                digest.update(block)
                size += len(block)
                if sink is not None:
                    view = memoryview(block)
                    while view:
                        written = os.write(sink, view)
                        if written <= 0:
                            raise TransactionError("copy_failed")
                        view = view[written:]
            if _signature(os.fstat(fd)) != _signature(s) or size != s.st_size:
                raise TransactionError("baseline_changed")
            return _State(digest.hexdigest(), size, stat.S_IMODE(s.st_mode), _signature(s))
    except FileNotFoundError:
        return None


def _hash(state):
    return None if state is None else state.digest


def _same_content(a, b):
    return a is None and b is None or (a is not None and b is not None
           and (a.digest, a.size, a.mode) == (b.digest, b.size, b.mode))


def _baseline_valid(baseline, targets):
    if not isinstance(baseline, Mapping) or set(baseline) != set(targets):
        raise TransactionError("invalid_input")
    if any(v is not None and (not isinstance(v, str) or re.fullmatch(r"[0-9a-f]{64}", v) is None)
           for v in baseline.values()):
        raise TransactionError("invalid_input")


def capture_baseline(target_root, targets: Iterable[str], *, artifact_roots,
                     protected_roots=()) -> dict[str, str | None]:
    """Return hashes for in-process planning; do not print the returned mapping."""
    try:
        roots, protected = _policy(artifact_roots, protected_roots)
        names = tuple(_allowed(p, roots, protected) for p in targets)
        if not names or len(names) > _MAX_ENTRIES or len(set(names)) != len(names):
            raise TransactionError("invalid_input")
        with _root(target_root) as target:
            return {p: _hash(_read_state(target, p)) for p in names}
    except TransactionError:
        raise
    except BaseException:
        raise TransactionError("io_failed") from None


def prepare_release_plan(source_root, target_root, manifest: Iterable[ManifestEntry], *,
                         release_id, baseline, backup_root, artifact_roots,
                         protected_roots=(), source_artifact_roots=None) -> ReleasePlan:
    """Validate an explicit manifest without creating or changing any files.

    release_id must be generated lowercase hex (16-64 characters). backup_root is
    an unused dedicated files subdirectory in the caller's logical backup bundle.
    Configurations, persistent data, logs and credentials are never release files.
    """
    try:
        if not isinstance(release_id, str) or re.fullmatch(r"[0-9a-f]{16,64}", release_id) is None:
            raise TransactionError("invalid_input")
        roots, protected = _policy(artifact_roots, protected_roots)
        source_roots, _ = _policy(roots if source_artifact_roots is None else source_artifact_roots,
                                  protected_roots)
        entries = tuple(manifest)
        if not entries or len(entries) > _MAX_ENTRIES or any(type(e) is not ManifestEntry for e in entries):
            raise TransactionError("invalid_input")
        targets = [_allowed(e.target, roots, protected) for e in entries]
        sources = [_allowed(e.source, source_roots, protected) for e in entries if e.source is not None]
        if len(set(targets)) != len(targets) or len(set(sources)) != len(sources):
            raise TransactionError("invalid_input")
        for a in targets:
            if any(b.startswith(a + "/") for b in targets):
                raise TransactionError("invalid_input")
        _baseline_valid(baseline, targets)
        src, dst, bak = map(_absolute, (source_root, target_root, backup_root))
        for a, b in ((src, dst), (src, bak), (dst, bak)):
            if a == b or a in b.parents or b in a.parents:
                raise TransactionError("unsafe_path")
        if bak.exists():
            with _root(bak) as b:
                if os.listdir(b.fd):
                    raise TransactionError("invalid_input")
        else:
            with _root(bak.parent):
                pass
        # Static entry points become visible only after every other artifact.
        entries = tuple(sorted(entries, key=lambda e: (PurePosixPath(e.target).name == "index.html", e.target)))
        with _root(src) as source, _root(dst) as target:
            before, after = [], []
            for e in entries:
                old = _read_state(target, e.target)
                if _hash(old) != baseline[e.target]:
                    raise TransactionError("baseline_changed")
                if old is not None and old.mode & 0o7000:
                    raise TransactionError("unsupported_file")
                new = _read_state(source, e.source) if e.source is not None else None
                if e.source is not None and new is None:
                    raise TransactionError("source_changed")
                if new is not None and new.mode & 0o7000:
                    raise TransactionError("unsupported_file")
                before.append(old)
                after.append(new)
        return ReleasePlan(src, dst, bak, release_id, entries, roots, protected,
                           tuple(before), tuple(after))
    except TransactionError:
        raise
    except BaseException:
        raise TransactionError("io_failed") from None


def _create_file(root, name, mode=0o600):
    return os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | _NOFOLLOW,
                   mode, dir_fd=root.fd)


def _copy_file(source, source_name, destination, name, expected, mode):
    fd = _create_file(destination, name)
    try:
        actual = _read_state(source, source_name, fd)
        if actual is None or actual != expected:
            raise TransactionError("baseline_changed")
        os.fchmod(fd, mode)
        os.fsync(fd)
    finally:
        os.close(fd)
    copied = _read_state(destination, name)
    if not _same_content(copied, dataclasses.replace(expected, mode=mode)):
        raise TransactionError("verification_failed")
    return copied


def _json_bytes(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _write_record(root, name, value):
    temporary = ".record-" + secrets.token_hex(8)
    fd = _create_file(root, temporary)
    try:
        try:
            raw = _json_bytes(value)
            with os.fdopen(fd, "wb", closefd=False) as stream:
                stream.write(raw)
                stream.flush()
            os.fsync(fd)
        finally:
            os.close(fd)
        os.replace(temporary, name, src_dir_fd=root.fd, dst_dir_fd=root.fd)
        os.fsync(root.fd)
    finally:
        try:
            os.unlink(temporary, dir_fd=root.fd)
        except FileNotFoundError:
            pass


def _read_record(root, name):
    with _open_regular(root, name) as (fd, s):
        if s.st_size > _MAX_METADATA or stat.S_IMODE(s.st_mode) != 0o600:
            raise TransactionError("backup_invalid")
        raw = bytearray()
        while len(raw) <= _MAX_METADATA:
            block = os.read(fd, min(65536, _MAX_METADATA + 1 - len(raw)))
            if not block:
                break
            raw.extend(block)
        if len(raw) > _MAX_METADATA or _signature(os.fstat(fd)) != _signature(s):
            raise TransactionError("backup_invalid")
    return json.loads(raw), bytes(raw)


def _build_backup(plan, target, injector):
    try:
        os.mkdir(plan.backup_root, 0o700)
    except FileExistsError:
        pass
    with _root(plan.backup_root.parent) as parent:
        os.fsync(parent.fd)
    with _root(plan.backup_root) as backup:
        if os.listdir(backup.fd) or stat.S_IMODE(os.fstat(backup.fd).st_mode) != 0o700:
            raise TransactionError("backup_failed")
        records = []
        for i, (e, before, after) in enumerate(zip(plan.entries, plan.before, plan.after)):
            payload = None
            if before is not None:
                payload = "payload-" + str(i).zfill(8) + ".bin"
                _fault(injector, "backup_copy", i)
                _copy_file(target, e.target, backup, payload, before, 0o600)
            records.append({"target": e.target, "before_hash": _hash(before),
                            "after_hash": _hash(after),
                            "before_size": 0 if before is None else before.size,
                            "before_mode": 0 if before is None else before.mode,
                            "after_size": 0 if after is None else after.size,
                            "after_mode": 0 if after is None else after.mode,
                            "payload": payload})
        record = {"version": 1, "artifact_roots": list(plan.artifact_roots),
                  "protected_roots": list(plan.protected_roots), "entries": records}
        _write_record(backup, "manifest.json", record)
        _write_record(backup, "complete.json", {"manifest_sha256": hashlib.sha256(_json_bytes(record)).hexdigest()})
        _fault(injector, "backup_verify", -1)
    result = verify_backup(plan.backup_root)
    if not result.ok:
        raise TransactionError("backup_invalid")


def _load_bundle(backup):
    record, raw = _read_record(backup, "manifest.json")
    complete, _ = _read_record(backup, "complete.json")
    if (type(record) is not dict or set(record) != {"version", "artifact_roots", "protected_roots", "entries"}
            or type(record["version"]) is not int or record["version"] != 1 or type(complete) is not dict
            or set(complete) != {"manifest_sha256"}
            or complete["manifest_sha256"] != hashlib.sha256(raw).hexdigest()
            or type(record["entries"]) is not list or not 0 < len(record["entries"]) <= _MAX_ENTRIES
            or type(record["artifact_roots"]) is not list or type(record["protected_roots"]) is not list):
        raise TransactionError("backup_invalid")
    roots, protected = _policy(record["artifact_roots"], record["protected_roots"])
    names, targets = {"manifest.json", "complete.json", "journal.json"}, set()
    for i, item in enumerate(record["entries"]):
        if type(item) is not dict or set(item) != {"target", "before_hash", "after_hash", "before_size", "before_mode", "after_size", "after_mode", "payload"}:
            raise TransactionError("backup_invalid")
        target = _allowed(item["target"], roots, protected)
        if target in targets or any(target.startswith(p + "/") or p.startswith(target + "/") for p in targets):
            raise TransactionError("backup_invalid")
        targets.add(target)
        for prefix in ("before", "after"):
            digest = item[prefix + "_hash"]
            size, mode = item[prefix + "_size"], item[prefix + "_mode"]
            if (digest is not None and (type(digest) is not str or re.fullmatch(r"[0-9a-f]{64}", digest) is None)
                    or type(size) is not int or size < 0 or type(mode) is not int or not 0 <= mode <= 0o777
                    or digest is None and (size != 0 or mode != 0)):
                raise TransactionError("backup_invalid")
        payload = item["payload"]
        expected_name = "payload-" + str(i).zfill(8) + ".bin"
        if item["before_hash"] is None:
            if payload is not None:
                raise TransactionError("backup_invalid")
        else:
            if payload != expected_name:
                raise TransactionError("backup_invalid")
            names.add(payload)
            current = _read_state(backup, payload)
            if (current is None or current.digest != item["before_hash"]
                    or current.size != item["before_size"] or current.mode != 0o600):
                raise TransactionError("backup_invalid")
    for name in os.listdir(backup.fd):
        if name in names:
            continue
        # A killed process may leave an uncommitted record write. It is not a
        # committed manifest or payload and is retained, never trusted or deleted.
        if re.fullmatch(r"\.record-[0-9a-f]{16}", name) is None:
            raise TransactionError("backup_invalid")
        abandoned = _read_state(backup, name)
        if abandoned is None or abandoned.mode != 0o600 or abandoned.size > _MAX_METADATA:
            raise TransactionError("backup_invalid")
    return record


def _item_state(item, prefix):
    digest = item[prefix + "_hash"]
    if digest is None:
        return None
    return _State(digest, item[prefix + "_size"], item[prefix + "_mode"], ())


def verify_backup(backup_root) -> TransactionResult:
    """Restore from backup alone into a new temporary tree and verify all bytes."""
    count = 0
    try:
        with _root(backup_root) as backup:
            record = _load_bundle(backup)
            count = len(record["entries"])
            temporary_parent = Path(tempfile.gettempdir()).resolve()
            with tempfile.TemporaryDirectory(prefix="lens-restore-probe-", dir=temporary_parent) as directory:
                with _root(directory) as probe:
                    for item in record["entries"]:
                        before = _item_state(item, "before")
                        if before is None:
                            continue
                        payload = _read_state(backup, item["payload"])
                        with probe.parent(item["target"], create=True) as (fd, name):
                            destination = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | _NOFOLLOW,
                                                  0o600, dir_fd=fd)
                            try:
                                copied = _read_state(backup, item["payload"], destination)
                                if copied != payload:
                                    raise TransactionError("backup_invalid")
                                os.fchmod(destination, before.mode)
                                os.fsync(destination)
                            finally:
                                os.close(destination)
                    for item in record["entries"]:
                        if not _same_content(_read_state(probe, item["target"]), _item_state(item, "before")):
                            raise TransactionError("backup_invalid")
            # Re-read the bundle after the independent restore, including hashes.
            if _load_bundle(backup) != record:
                raise TransactionError("backup_invalid")
        return TransactionResult(ok=True, phase="backup_verification", planned_files=count,
                                 backup_verified=True, evidence_retained=True)
    except BaseException:
        return TransactionResult(phase="backup_verification", error="backup_invalid",
                                 planned_files=count, evidence_retained=True)


class _Stage:
    def __init__(self, target, release_id):
        self.target = target
        self.name = ".lens-txn-" + release_id + "-" + secrets.token_hex(8)
        os.mkdir(self.name, 0o700, dir_fd=target.fd)
        self.fd = os.open(self.name, os.O_RDONLY | _DIRECTORY | _NOFOLLOW, dir_fd=target.fd)
        self.identity = _signature(os.fstat(self.fd))[:2]
        self.files = set()

    @contextlib.contextmanager
    def parent(self, relative):
        name = _relative(relative)
        if "/" in name:
            raise TransactionError("unsafe_path")
        yield self.fd, name

    def cleanup(self):
        try:
            # Failure recovery may run after the transaction's root context has
            # closed. Reopen and verify identity instead of using a recycled fd.
            with _root(self.target.path) as target:
                if target.identity != self.target.identity:
                    return False
                current = os.stat(self.name, dir_fd=target.fd, follow_symlinks=False)
                if (current.st_dev, current.st_ino) != self.identity or not stat.S_ISDIR(current.st_mode):
                    return False
                if not set(os.listdir(self.fd)).issubset(self.files):
                    return False
                for name in self.files:
                    try:
                        os.unlink(name, dir_fd=self.fd)
                    except FileNotFoundError:
                        pass
                os.rmdir(self.name, dir_fd=target.fd)
                os.fsync(target.fd)
                return True
        except BaseException:
            return False
        finally:
            os.close(self.fd)


def _remove_created(target, created):
    ok = True
    for relative, device, inode in reversed(created):
        try:
            with target.parent(relative) as (fd, name):
                current = os.stat(name, dir_fd=fd, follow_symlinks=False)
                if not stat.S_ISDIR(current.st_mode) or (current.st_dev, current.st_ino) != (device, inode):
                    ok = False
                    continue
                os.rmdir(name, dir_fd=fd)
                os.fsync(fd)
        except FileNotFoundError:
            pass
        except OSError:
            ok = False
    return ok


def _journal(backup_root, phase, changed, error="none"):
    with _root(backup_root) as backup:
        _write_record(backup, "journal.json", {"phase": phase, "changed_files": changed, "error": error})


def _restore_locked(backup, record, target, injector, expected_current=None):
    entries = record["entries"]
    if expected_current is not None:
        _baseline_valid(expected_current, [i["target"] for i in entries])
    stage = _Stage(target, secrets.token_hex(8))
    created, restored, failure = [], 0, None
    try:
        # Complete all restore copying before the first target change.
        for i, item in enumerate(entries):
            current = _read_state(target, item["target"])
            before, after = _item_state(item, "before"), _item_state(item, "after")
            if expected_current is not None:
                accepted = _hash(current) == expected_current[item["target"]]
            else:
                accepted = _same_content(current, before) or _same_content(current, after)
            if not accepted:
                raise TransactionError("rollback_conflict")
            if before is not None and not _same_content(current, before):
                name = "restore-" + str(i).zfill(8)
                stage.files.add(name)
                _fault(injector, "restore_copy", i)
                payload = _read_state(backup, item["payload"])
                if not _same_content(payload, dataclasses.replace(before, mode=0o600)):
                    raise TransactionError("backup_invalid")
                _copy_file(backup, item["payload"], stage, name,
                           payload, before.mode)
        os.fsync(stage.fd)
        for i, item in enumerate(entries):
            target.check()
            before, after = _item_state(item, "before"), _item_state(item, "after")
            current = _read_state(target, item["target"])
            if _same_content(current, before):
                continue
            accepted = (_hash(current) == expected_current[item["target"]]
                        if expected_current is not None else _same_content(current, after))
            if not accepted:
                raise TransactionError("rollback_conflict")
            _fault(injector, "restore_swap", i)
            # Hooks also model a writer acting at the last checked boundary.
            checked = _read_state(target, item["target"])
            if not _same_content(checked, current):
                raise TransactionError("rollback_conflict")
            if before is not None and not _same_content(
                    _read_state(stage, "restore-" + str(i).zfill(8)), before):
                raise TransactionError("rollback_failed")
            with target.parent(item["target"], create=before is not None, created=created) as (fd, name):
                if before is None:
                    os.unlink(name, dir_fd=fd)
                else:
                    os.replace("restore-" + str(i).zfill(8), name,
                               src_dir_fd=stage.fd, dst_dir_fd=fd)
                os.fsync(fd)
            restored += 1
        _fault(injector, "restore_verify", -1)
        for item in entries:
            if not _same_content(_read_state(target, item["target"]), _item_state(item, "before")):
                raise TransactionError("rollback_conflict")
        target.check()
    except BaseException as exc:
        failure = exc.code if isinstance(exc, TransactionError) and exc.code == "rollback_conflict" else "rollback_failed"
    clean = stage.cleanup()
    if failure is not None:
        # Nonempty created parents may contain restored files and must be retained.
        _remove_created(target, created)
    return failure, restored, clean


def restore_backup(backup_root, target_root, *, expected_current=None,
                   fault_injector: FaultInjector | None = None) -> TransactionResult:
    """Restore only hashes matching this bundle's old/new files (or caller hashes).

    Unexpected contents stop restoration. An incomplete restore retains the bundle
    and reports manual_intervention; the caller must not delete that evidence.
    """
    count, restored, clean = 0, 0, True
    try:
        bak, dst = map(_absolute, (backup_root, target_root))
        if bak == dst or bak in dst.parents or dst in bak.parents:
            raise TransactionError("unsafe_path")
        verified = verify_backup(backup_root)
        if not verified.ok:
            return dataclasses.replace(verified, phase="rollback", manual_intervention=True)
        with _root(backup_root) as backup, _root(target_root) as target:
            fcntl.flock(target.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            record = _load_bundle(backup)
            count = len(record["entries"])
            failure, restored, clean = _restore_locked(backup, record, target, fault_injector, expected_current)
        if failure is None and not clean:
            failure = "cleanup_failed"
        _journal(backup_root, "rolled_back" if failure is None else "manual_intervention", restored,
                 "none" if failure is None else failure)
        return TransactionResult(ok=failure is None, phase="rollback", error=failure or "none",
                                 planned_files=count, restored_files=restored, backup_verified=True,
                                 rollback_attempted=True, rollback_succeeded=failure is None,
                                 manual_intervention=failure is not None, evidence_retained=True,
                                 cleanup_succeeded=clean)
    except BlockingIOError:
        code = "busy"
    except BaseException:
        code = "rollback_failed"
    return TransactionResult(phase="rollback", error=code, planned_files=count,
                             restored_files=restored, rollback_attempted=True,
                             manual_intervention=True, evidence_retained=True,
                             cleanup_succeeded=clean)


def execute_release(plan: ReleasePlan, *, fault_injector: FaultInjector | None = None) -> TransactionResult:
    """Back up, independently restore-verify, stage, replace, verify, and recover.

    Fault hooks are for synthetic tests and must never disclose their arguments.
    No old backups, source files, configuration, logs or user data are removed.
    """
    if type(plan) is not ReleasePlan:
        return TransactionResult(error="invalid_input")
    count, changed, restored = len(plan.entries), 0, 0
    stage, verified, rollback, rollback_ok, clean = None, False, False, False, True
    mutation_attempted = False
    created, phase, code, evidence = [], "validation", "none", False
    try:
        with _root(plan.source_root) as source, _root(plan.target_root) as target:
            fcntl.flock(target.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            for e, before in zip(plan.entries, plan.before):
                if _read_state(target, e.target) != before:
                    raise TransactionError("baseline_changed")
            phase, code, evidence = "backup", "backup_failed", True
            _build_backup(plan, target, fault_injector)
            verified = True
            _journal(plan.backup_root, "prepared", 0)
            phase, code = "staging", "copy_failed"
            stage = _Stage(target, plan.release_id)
            for i, (e, after) in enumerate(zip(plan.entries, plan.after)):
                if after is not None:
                    name = "entry-" + str(i).zfill(8)
                    stage.files.add(name)
                    _fault(fault_injector, "stage_copy", i)
                    _copy_file(source, e.source, stage, name, after, after.mode)
            os.fsync(stage.fd)
            phase, code = "verification", "verification_failed"
            _fault(fault_injector, "stage_verify", -1)
            for i, after in enumerate(plan.after):
                if after is not None and not _same_content(_read_state(stage, "entry-" + str(i).zfill(8)), after):
                    raise TransactionError("verification_failed")
            _fault(fault_injector, "before_swap", -1)
            for e, before in zip(plan.entries, plan.before):
                if _read_state(target, e.target) != before:
                    raise TransactionError("baseline_changed")
            phase, code = "replacement", "swap_failed"
            for i, (e, before, after) in enumerate(zip(plan.entries, plan.before, plan.after)):
                target.check()
                if _read_state(target, e.target) != before:
                    raise TransactionError("baseline_changed")
                if _same_content(before, after):
                    continue
                _fault(fault_injector, "swap", i)
                if _read_state(target, e.target) != before:
                    raise TransactionError("baseline_changed")
                if after is not None and not _same_content(
                        _read_state(stage, "entry-" + str(i).zfill(8)), after):
                    raise TransactionError("verification_failed")
                with target.parent(e.target, create=after is not None, created=created) as (fd, name):
                    # A failed/interrupted system call can have an ambiguous
                    # outcome. Recovery checks hashes even without an acked swap.
                    mutation_attempted = True
                    if after is None:
                        os.unlink(name, dir_fd=fd)
                    else:
                        os.replace("entry-" + str(i).zfill(8), name,
                                   src_dir_fd=stage.fd, dst_dir_fd=fd)
                    changed += 1
                    os.fsync(fd)
                _journal(plan.backup_root, "replacing", changed)
                _fault(fault_injector, "after_swap", i)
            phase, code = "verification", "verification_failed"
            _fault(fault_injector, "target_verify", -1)
            for e, after in zip(plan.entries, plan.after):
                if not _same_content(_read_state(target, e.target), after):
                    raise TransactionError("baseline_changed")
            target.check()
            _journal(plan.backup_root, "committed", changed)
            if stage is not None:
                clean = stage.cleanup()
                stage = None
            if not clean:
                return TransactionResult(phase="cleanup", error="cleanup_failed", planned_files=count,
                                         changed_files=changed, backup_verified=True,
                                         manual_intervention=True, evidence_retained=True,
                                         cleanup_succeeded=False)
            return TransactionResult(ok=True, phase="committed", planned_files=count,
                                     changed_files=changed, backup_verified=True, evidence_retained=True)
    except BaseException as exc:
        if isinstance(exc, TransactionError):
            code = exc.code
            if phase == "staging" and code == "baseline_changed":
                code = "source_changed"
        elif isinstance(exc, BlockingIOError):
            code = "busy"
        elif code == "none":
            code = "io_failed"
        if mutation_attempted:
            rollback = True
            # Reacquire the cooperative lock before recovery; never restore over an
            # intervening release or arbitrary concurrent contents.
            recovered = restore_backup(plan.backup_root, plan.target_root,
                                       fault_injector=fault_injector)
            restored, rollback_ok = recovered.restored_files, recovered.ok
            clean = recovered.cleanup_succeeded
            if not rollback_ok:
                code = recovered.error
        if stage is not None:
            clean = stage.cleanup() and clean
        try:
            with _root(plan.target_root) as target:
                if not changed or rollback_ok:
                    clean = _remove_created(target, created) and clean
        except BaseException:
            clean = False
        if evidence:
            try:
                _journal(plan.backup_root, "rolled_back" if rollback_ok else "failed", changed, code)
            except BaseException:
                clean = False
        return TransactionResult(phase=phase, error=code, planned_files=count,
                                 changed_files=changed, restored_files=restored,
                                 backup_verified=verified, rollback_attempted=rollback,
                                 rollback_succeeded=rollback_ok,
                                 manual_intervention=(rollback and not rollback_ok) or not clean,
                                 evidence_retained=evidence, cleanup_succeeded=clean)
