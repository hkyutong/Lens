"""Generic stdin-only file worker. All responses use a closed, path-free schema."""

import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import sys
import tarfile

import lens_release_transaction as tx


class _PreflightValueError(ValueError):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def _regular(path):
    s = path.lstat()
    if not stat.S_ISREG(s.st_mode) or s.st_nlink != 1:
        raise ValueError
    return s


def _name(value):
    if (type(value) is not str or not re.fullmatch(r"[A-Za-z0-9_./@+~-]+", value)
            or any(p in ("", ".", "..") or p.startswith(".") for p in value.split("/"))):
        raise ValueError
    return value


def _role(item):
    source = _name(item["source"])
    role = item["role"]
    if role == "service_build" and source.startswith("service/dist/"):
        return source.removeprefix("service/")
    if role == "service_package" and source == "service/package.json":
        return "package.json"
    if role == 'service_workspace' and source == 'service/pnpm-workspace.yaml':
        return 'pnpm-workspace.yaml'
    if role == "service_lock" and source == "service/pnpm-lock.yaml":
        return "pnpm-lock.yaml"
    for kind in ("chat", "admin"):
        if role == kind + "_static" and source.startswith(kind + "/dist/"):
            return "public/" + kind + "/" + source.removeprefix(kind + "/dist/")
    if role == "academic_runtime" and source in frozenset({'academic-4.0/crazy_functions/Lens_Featured_Tasks.py', 'academic-4.0/shared_utils/lens_request_security.py', 'academic-4.0/toolbox.py', 'academic-4.0/shared_utils/lens_storage.py', 'academic-4.0/crazy_functions/lens_research_tasks.py', 'academic-4.0/crazy_functions/lens_research_proposal.py', 'academic-4.0/shared_utils/fastapi_stream_server.py'}):
        return source
    raise ValueError


def _hash(path):
    h = hashlib.sha256()
    with open(path, "rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def _unpack(request):
    stage = tx._absolute(request["stage"])
    archive = stage / "payload.tar"
    _regular(archive)
    if _hash(archive) != request["archive_sha256"]:
        raise ValueError
    items = {x["source"]: x for x in request["entries"]}
    if len(items) != len(request["entries"]):
        raise ValueError
    destination = stage / "artifacts"
    destination.mkdir(mode=0o700)
    with tarfile.open(archive, "r:") as tar:
        members = tar.getmembers()
        if len(members) != len(items):
            raise ValueError
        seen = set()
        for member in members:
            name = _name(member.name)
            if not member.isfile() or member.linkname or name not in items or name in seen:
                raise ValueError
            item = items[name]
            _role(item)
            if member.size != item["size"] or member.size > 1024 * 1024 * 1024:
                raise ValueError
            seen.add(name)
            path = destination / name
            path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            try:
                with tar.extractfile(member) as source, os.fdopen(fd, "wb", closefd=False) as target:
                    shutil.copyfileobj(source, target, 1024 * 1024)
                    target.flush()
                    os.fsync(fd)
            finally:
                os.close(fd)
            if _hash(path) != item["sha256"]:
                raise ValueError
    return {"ok": True, "file_count": len(items)}


# Fixed-name brand assets need the same verified backup and rollback as HTML.
# Content-addressed and unreviewed static assets remain immutable.
_MUTABLE_BRAND_TARGETS = frozenset({
    "public/chat/logo.svg",
    "public/chat/logo.png",
    "public/chat/favicon.svg",
    "public/chat/apple-touch-icon.png",
    "public/chat/mstile-150x150.png",
    "public/chat/safari-pinned-tab.svg",
    "public/chat/icon/favicon.svg",
    "public/chat/icon/favicon-16x16.png",
    "public/chat/icon/favicon-32x32.png",
    "public/chat/icon/apple-touch-icon.png",
    "public/chat/icon/android-chrome-192x192.png",
    "public/chat/icon/android-chrome-512x512.png",
})


def _prepare_file_plan(request):
    (stage, target, bundle) = map(tx._absolute, (request['stage'], request['target'], request['bundle']))
    source = stage / 'publish-source'
    source.mkdir(mode=448)
    (entries, targets) = ([], set())
    for item in request['entries']:
        if item['role'] == 'academic_runtime':
            _role(item)
            continue
        target_name = _role(item)
        tx._allowed(target_name, ('dist', 'public/chat', 'public/admin', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml'), ())
        original = stage / 'artifacts' / item['source']
        try:
            _regular(original)
        except ValueError:
            raise _PreflightValueError('artifact_unsupported') from None
        if _hash(original) != item['sha256']:
            raise _PreflightValueError('source_changed')
        existing = target / target_name
        mode = 420
        if existing.exists() or existing.is_symlink():
            try:
                previous = _regular(existing)
            except ValueError:
                raise _PreflightValueError('target_unsupported') from None
            mode = stat.S_IMODE(previous.st_mode)
            if mode & 3602:
                raise _PreflightValueError('target_mode_unsafe')
        if (item['role'] in ('chat_static', 'admin_static') and (not target_name.endswith('/index.html'))) and target_name not in _MUTABLE_BRAND_TARGETS:
            if existing.exists():
                if _hash(existing) != item['sha256']:
                    scope = 'chat' if item['role'] == 'chat_static' else 'admin'
                    raise _PreflightValueError(f'{scope}_static_target_mismatch')
            elif re.search('[-.][A-Za-z0-9_-]{8,}\\.[A-Za-z0-9]+$', existing.name) is None:
                raise _PreflightValueError('static_asset_name_invalid')
        published = source / item['source']
        published.parent.mkdir(parents=True, exist_ok=True, mode=448)
        shutil.copyfile(original, published, follow_symlinks=False)
        os.chmod(published, mode)
        entries.append(tx.ManifestEntry(item['source'], target_name))
        targets.add(target_name)
    dist = target / 'dist'
    with tx._root(target):
        if dist.exists():
            for (directory, directories, files) in os.walk(dist, followlinks=False):
                for leaf in directories:
                    if (Path(directory) / leaf).is_symlink():
                        raise _PreflightValueError('target_directory_unsupported')
                for leaf in files:
                    path = Path(directory) / leaf
                    try:
                        _regular(path)
                    except ValueError:
                        raise _PreflightValueError('target_unsupported') from None
                    relative = str(path.relative_to(target))
                    tx._allowed(relative, ('dist',), ())
                    if relative not in targets:
                        entries.append(tx.ManifestEntry(None, relative))
                        targets.add(relative)
    roots = ('dist', 'public/chat', 'public/admin', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml')
    baseline = tx.capture_baseline(target, targets, artifact_roots=roots)
    plan = tx.prepare_release_plan(source, target, entries, release_id=request['release_id'], baseline=baseline, backup_root=bundle / 'files', artifact_roots=roots, source_artifact_roots=('service/dist', 'service/package.json', 'service/pnpm-lock.yaml', 'chat/dist', 'admin/dist', 'service/pnpm-workspace.yaml'))
    return plan


def _files(request):
    return tx.execute_release(_prepare_file_plan(request)).to_dict()


def _files_preflight(request):
    plan = _prepare_file_plan(request)
    source = Path(plan.source_root)
    stage = Path(request["stage"])
    if source.parent != stage or source == stage / "artifacts":
        raise tx.TransactionError("unsafe_path")
    shutil.rmtree(source)
    return {"ok": True}


def main():
    try:
        raw = sys.stdin.buffer.read(16 * 1024 * 1024 + 1)
        if len(raw) > 16 * 1024 * 1024:
            raise ValueError
        request = json.loads(raw)
        action = request.get('action')
        if action == 'unpack':
            result = _unpack(request)
        elif action == 'files_preflight':
            result = _files_preflight(request)
        elif action == 'files':
            result = _files(request)
        elif action == 'restore':
            result = tx.restore_backup(Path(request['bundle']) / 'files', request['target']).to_dict()
        elif action == 'verify':
            result = tx.verify_backup(Path(request['bundle']) / 'files').to_dict()
        else:
            raise ValueError
    except tx.TransactionError as error:
        result = {'ok': False, 'error': error.code}
    except FileNotFoundError:
        result = {'ok': False, 'error': 'source_changed' if action == 'files_preflight' else 'file_transaction_failed'}
    except PermissionError:
        result = {'ok': False, 'error': 'io_failed' if action == 'files_preflight' else 'file_transaction_failed'}
    except ValueError as error:
        result = {'ok': False, 'error': getattr(error, 'code', 'unsupported_file') if action == 'files_preflight' else 'file_transaction_failed'}
    except OSError:
        result = {'ok': False, 'error': 'io_failed' if action == 'files_preflight' else 'file_transaction_failed'}
    except BaseException:
        result = {'ok': False, 'error': 'file_transaction_failed'}
    sys.stdout.write(json.dumps(result, separators=(',', ':')))

if __name__ == "__main__":
    main()
