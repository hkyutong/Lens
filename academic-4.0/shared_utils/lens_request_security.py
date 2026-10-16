"""Private Lens bridge authentication and request-scoped filesystem boundary."""

import contextvars
import hashlib
import hmac
import json
import os
import re
import stat
import threading
import time
import uuid
import zipfile
from dataclasses import dataclass
from pathlib import Path


PRIVATE_CONFIGURATION_NAME = ".lens-academic-private.json"
_PRIVATE_CONFIGURATION_FIELDS = {
    "version", "secret", "workspace_root", "log_root", "upload_root",
}
_PRIVATE_ENVIRONMENT_FIELDS = {
    "secret": "LENS_ACADEMIC_INTERNAL_SECRET",
    "workspace_root": "LENS_ACADEMIC_WORKSPACE_ROOT",
    "log_root": "PATH_LOGGING",
    "upload_root": "PATH_PRIVATE_UPLOAD",
}


def load_private_configuration(source_root=None, environment=None):
    """Load the fixed private deployment contract before application imports.

    Missing files preserve explicitly configured legacy starts. Invalid files
    fail closed with a fixed message; configuration values never enter errors.
    """
    root = Path(source_root) if source_root is not None else Path(__file__).resolve().parents[1]
    target_environment = os.environ if environment is None else environment
    descriptor = None
    try:
        try:
            descriptor = os.open(root / PRIVATE_CONFIGURATION_NAME, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK)
        except FileNotFoundError:
            return False
        observed = os.fstat(descriptor)
        if (
            not stat.S_ISREG(observed.st_mode) or stat.S_IMODE(observed.st_mode) != 0o600
            or observed.st_uid != os.geteuid() or observed.st_nlink != 1 or observed.st_size > 8192
        ):
            raise ValueError()
        raw = os.read(descriptor, 8193)
        value = json.loads(raw)
        if not isinstance(value, dict) or set(value) != _PRIVATE_CONFIGURATION_FIELDS:
            raise ValueError()
        if type(value["version"]) is not int or value["version"] != 1:
            raise ValueError()
        secret = value["secret"]
        if not isinstance(secret, str) or not re.fullmatch(r"[\x21-\x7e]{32,256}", secret):
            raise ValueError()
        code_root = root.resolve(strict=True)
        for name in ("workspace_root", "log_root", "upload_root"):
            configured = value[name]
            if not isinstance(configured, str) or not configured or "\0" in configured:
                raise ValueError()
            path = Path(configured)
            if not path.is_absolute() or not path.is_dir():
                raise ValueError()
            real = path.resolve(strict=True)
            if real == code_root or code_root in real.parents:
                raise ValueError()
        updates = {}
        for name, key in _PRIVATE_ENVIRONMENT_FIELDS.items():
            existing = target_environment.get(key)
            if existing and existing != value[name]:
                raise ValueError()
            updates[key] = value[name]
        # Validate the entire object before changing even one environment key.
        target_environment.update(updates)
        return True
    except Exception:
        raise RuntimeError("Private academic configuration unavailable") from None
    finally:
        if descriptor is not None:
            os.close(descriptor)


_UUID = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$", re.I)
_CONTEXT = contextvars.ContextVar("lens_academic_request", default=None)
_LOCK = threading.Lock()
_REPLAYS = {}
_REPORTS = {}
_REPORT_PATHS = {}
_METADATA = {
    ("GET", "/health"),
    ("POST", "/academic/core-function-list"),
    ("POST", "/academic/plugin-list"),
    ("POST", "/core_functional"),
}


@dataclass(frozen=True)
class RequestIdentity:
    owner_id: int
    request_id: str

    @property
    def user_name(self):
        return f"{self.owner_id}-{self.request_id}"


def current_identity():
    return _CONTEXT.get()


def current_user_name():
    identity = current_identity()
    return identity.user_name if identity else None


def identity_from_values(owner, request_id):
    if not isinstance(owner, str) or not re.fullmatch(r"[1-9][0-9]{0,15}", owner):
        raise ValueError("Invalid request identity")
    owner_id = int(owner)
    if owner_id > 9007199254740991 or not isinstance(request_id, str) or not _UUID.fullmatch(request_id):
        raise ValueError("Invalid request identity")
    return RequestIdentity(owner_id, request_id.lower())


def sign_request(secret, method, resource, body, timestamp, nonce, owner, request_id):
    message = "\n".join([
        method.upper(), resource, hashlib.sha256(body).hexdigest(),
        str(timestamp), nonce, owner, request_id,
    ])
    return hmac.new(secret.encode(), message.encode(), hashlib.sha256).hexdigest()


class LensPrivateBridgeMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] not in ("http", "websocket"):
            return await self.app(scope, receive, send)
        method = scope.get("method", "GET").upper()
        path = scope.get("path", "")
        if scope["type"] == "http" and (method, path) in _METADATA:
            return await self.app(scope, receive, send)
        secret = os.environ.get("LENS_ACADEMIC_INTERNAL_SECRET", "")
        if len(secret) < 32:
            return await self._reject(scope, send, 503)
        headers = {key.decode("latin1").lower(): value.decode("latin1") for key, value in scope.get("headers", [])}
        body = b""
        if scope["type"] == "http":
            while True:
                event = await receive()
                if event.get("type") != "http.request":
                    return await self._reject(scope, send, 401)
                body += event.get("body", b"")
                if len(body) > 25 * 1024 * 1024:
                    return await self._reject(scope, send, 413)
                if not event.get("more_body", False):
                    break
        try:
            owner = headers.get("x-lens-academic-owner", "")
            request_id = headers.get("x-lens-academic-request", "")
            identity = identity_from_values(owner, request_id)
            nonce = headers.get("x-lens-academic-nonce", "")
            timestamp_text = headers.get("x-lens-academic-timestamp", "")
            if not _UUID.fullmatch(nonce) or not re.fullmatch(r"[0-9]{1,12}", timestamp_text):
                raise ValueError("Invalid authentication")
            now = int(time.time())
            timestamp = int(timestamp_text)
            if abs(now - timestamp) > 30:
                raise ValueError("Expired authentication")
            query = scope.get("query_string", b"").decode("ascii")
            resource = path + ("?" + query if query else "")
            expected = sign_request(secret, method, resource, body, timestamp_text, nonce, owner, request_id)
            supplied = headers.get("x-lens-academic-signature", "")
            if not re.fullmatch(r"[0-9a-f]{64}", supplied) or not hmac.compare_digest(expected, supplied):
                raise ValueError("Invalid authentication")
            with _LOCK:
                for key, expires in list(_REPLAYS.items()):
                    if expires < now:
                        del _REPLAYS[key]
                replay_key = (identity.owner_id, nonce)
                if replay_key in _REPLAYS or len(_REPLAYS) >= 4096:
                    raise ValueError("Replay rejected")
                _REPLAYS[replay_key] = now + 60
        except (ValueError, UnicodeError, TypeError):
            return await self._reject(scope, send, 401)
        token = _CONTEXT.set(identity)
        supplied_body = False

        async def replay_receive():
            nonlocal supplied_body
            if not supplied_body and scope["type"] == "http":
                supplied_body = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        scope.setdefault("state", {})["lens_academic_identity"] = identity
        try:
            return await self.app(scope, replay_receive, send)
        finally:
            _CONTEXT.reset(token)

    async def _reject(self, scope, send, status):
        if scope["type"] == "websocket":
            return await send({"type": "websocket.close", "code": 1008})
        body = json.dumps({"error": "Academic bridge unavailable" if status == 503 else "Request rejected"}).encode()
        await send({"type": "http.response.start", "status": status, "headers": [(b"content-type", b"application/json")]})
        await send({"type": "http.response.body", "body": body})


def workspace_root():
    configured = os.environ.get("LENS_ACADEMIC_WORKSPACE_ROOT") or os.environ.get("ACADEMIC_TEMP_ROOT")
    if configured:
        return Path(configured).resolve()
    return (Path(__file__).resolve().parents[2] / "service" / "private" / "academic-workspaces").resolve()


def request_input_root():
    identity = current_identity()
    if not identity:
        raise ValueError("Request identity required")
    return _scoped_root(workspace_root(), str(identity.owner_id), identity.request_id, "input")


def _scoped_root(base, *parts):
    target = Path(base).resolve()
    for part in parts:
        target = target / part
        if target.is_symlink():
            raise ValueError("Request root rejected")
    if target.exists() and target.resolve(strict=True) != target.absolute():
        raise ValueError("Request root rejected")
    return target


def _logging_root():
    from shared_utils.lens_storage import get_logging_root
    return Path(get_logging_root()).resolve()


def request_logging_root():
    identity = current_identity()
    if not identity:
        raise ValueError("Request identity required")
    return _scoped_root(_logging_root(), identity.user_name)


def request_allowed_roots():
    if not current_identity():
        from shared_utils.lens_storage import get_allowed_storage_roots
        return get_allowed_storage_roots()
    return [str(request_input_root()), str(request_logging_root())]


def path_within(path_value, root_value):
    try:
        candidate = Path(path_value).resolve(strict=True)
        root = Path(root_value).resolve(strict=True)
        return candidate == root or root in candidate.parents
    except (OSError, ValueError, TypeError):
        return False


def bind_request_context(callback):
    context = contextvars.copy_context()

    def execute(*args, **kwargs):
        return context.copy().run(callback, *args, **kwargs)

    return execute


def _request_directory(root: Path, component=None):
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if component in (None, ""):
        return root
    component = str(component)
    if (
        component in (".", "..")
        or "/" in component
        or "\\" in component
        or any(ord(character) < 32 for character in component)
    ):
        raise ValueError("Invalid request directory")
    root_descriptor = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        try:
            os.mkdir(component, mode=0o700, dir_fd=root_descriptor)
        except FileExistsError:
            pass
        descriptor = os.open(
            component,
            os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
            dir_fd=root_descriptor,
        )
        os.close(descriptor)
    finally:
        os.close(root_descriptor)
    return root / component


def request_upload_directory(tag=None):
    return _request_directory(request_input_root(), tag)


def request_log_directory(plugin_name=None):
    return _request_directory(request_logging_root(), plugin_name)


def stage_request_report(source_path, filename, transform=None):
    filename = str(filename)
    if (
        not filename
        or filename in (".", "..")
        or "/" in filename
        or "\\" in filename
        or any(ord(character) < 32 for character in filename)
    ):
        raise ValueError("Invalid request report name")
    source_descriptor, _ = open_request_file(source_path)
    with os.fdopen(source_descriptor, "rb") as source:
        data = source.read(50 * 1024 * 1024 + 1)
        if len(data) > 50 * 1024 * 1024:
            raise ValueError("Request report is too large")
        if transform is not None:
            data = transform(data)
        directory = request_log_directory("downloadzone")
        parent_descriptor = os.open(
            directory, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
        )
        created_name = None
        try:
            for attempt in range(2):
                candidate = filename if attempt == 0 else f"{uuid.uuid4().hex}-{filename}"
                try:
                    destination_descriptor = os.open(
                        candidate,
                        os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                        mode=0o600,
                        dir_fd=parent_descriptor,
                    )
                    created_name = candidate
                    break
                except FileExistsError:
                    if attempt:
                        raise ValueError("Request report already exists")
            with os.fdopen(destination_descriptor, "wb") as destination:
                destination.write(data)
            return directory / created_name
        except Exception:
            if created_name is not None:
                os.unlink(created_name, dir_fd=parent_descriptor)
            raise
        finally:
            os.close(parent_descriptor)


def _validate_existing_input_directory(directory: Path, input_root: Path):
    entries = 0
    total_bytes = 0
    for parent, directories, files in os.walk(directory, followlinks=False):
        for name in directories + files:
            item = Path(parent) / name
            if item.is_symlink() or not path_within(item, input_root):
                raise ValueError("Invalid request input directory")
            if item.is_dir():
                continue
            if not item.is_file():
                raise ValueError("Invalid request input directory")
            entries += 1
            total_bytes += item.stat().st_size
            if entries > 500 or total_bytes > 50 * 1024 * 1024:
                raise ValueError("Request input directory is too large")


def prepare_request_inputs():
    root = request_input_root()
    if not root.exists():
        return
    if not path_within(root, workspace_root()):
        raise ValueError("Input workspace rejected")
    for source in list(root.iterdir()):
        if source.is_symlink():
            raise ValueError("Invalid request input file")
        if source.is_dir():
            _validate_existing_input_directory(source, root)
            continue
        if not source.is_file():
            raise ValueError("Invalid request input file")
        if source.suffix.lower() in (".rar", ".7z", ".tar", ".gz", ".bz2", ".xz", ".tgz"):
            raise ValueError("Unsupported archive format")
        if source.suffix.lower() != ".zip":
            continue
        target = root / ("archive-" + uuid.uuid4().hex)
        target.mkdir(mode=0o700)
        try:
            total = 0
            with zipfile.ZipFile(source) as archive:
                entries = archive.infolist()
                if len(entries) > 500:
                    raise ValueError("Archive limit exceeded")
                for item in entries:
                    filename = item.filename
                    components = filename.rstrip("/").split("/")
                    mode = item.external_attr >> 16
                    if not filename or filename.startswith("/") or "\\" in filename or any(part in ("", ".", "..") for part in components):
                        raise ValueError("Archive path rejected")
                    kind = stat.S_IFMT(mode)
                    if stat.S_ISLNK(mode) or kind not in (0, stat.S_IFREG, stat.S_IFDIR):
                        raise ValueError("Archive member rejected")
                    total += item.file_size
                    if total > 50 * 1024 * 1024 or item.flag_bits & 1:
                        raise ValueError("Archive limit exceeded")
                    destination = target.joinpath(*components)
                    if item.is_dir():
                        destination.mkdir(parents=True, exist_ok=True, mode=0o700)
                        continue
                    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
                    with archive.open(item) as origin, destination.open("xb") as output:
                        remaining = item.file_size
                        while True:
                            chunk = origin.read(min(65536, remaining + 1))
                            if not chunk:
                                break
                            remaining -= len(chunk)
                            if remaining < 0:
                                raise ValueError("Archive size rejected")
                            output.write(chunk)
                    destination.chmod(0o600)
            source.unlink()
        except Exception:
            import shutil
            shutil.rmtree(target, ignore_errors=True)
            raise ValueError("Archive preparation failed") from None


def report_reference(file_value):
    identity = current_identity()
    if not identity:
        return file_value
    source = Path(file_value)
    root = request_logging_root()
    if not path_within(source, root) or not source.is_file() or source.is_symlink():
        raise ValueError("Report rejected")
    canonical = str(source.resolve(strict=True))
    now = time.time()
    path_key = (identity.owner_id, identity.request_id, canonical)
    with _LOCK:
        for key, record in list(_REPORTS.items()):
            if record[3] < now:
                del _REPORTS[key]
                _REPORT_PATHS.pop((record[0], record[1], record[2]), None)
        token = _REPORT_PATHS.get(path_key)
        if token is None:
            if len(_REPORTS) >= 4096:
                raise ValueError("Report registration unavailable")
            token = str(uuid.uuid4())
            _REPORTS[token] = (identity.owner_id, identity.request_id, canonical, now + 3600)
            _REPORT_PATHS[path_key] = token
    return {"path": f"academic-report:{identity.request_id}:{token}", "name": source.name}


def open_report_reference(reference):
    identity = current_identity()
    pieces = reference.split(":") if isinstance(reference, str) else []
    if not identity or len(pieces) != 3 or pieces[0] != "academic-report" or pieces[1] != identity.request_id or not _UUID.fullmatch(pieces[2]):
        raise ValueError("Report not found")
    with _LOCK:
        record = _REPORTS.get(pieces[2])
    if not record or record[:2] != (identity.owner_id, identity.request_id) or record[3] < time.time():
        raise ValueError("Report not found")
    return _open_under_root(Path(record[2]), request_logging_root())


def open_request_file(file_value):
    source = Path(file_value)
    for root in request_allowed_roots():
        if path_within(source, root):
            return _open_under_root(source, Path(root))
    raise ValueError("Request file rejected")


def _open_under_root(source, root):
    root = root.resolve(strict=True)
    if not path_within(source, root):
        raise ValueError("Report not found")
    if source.is_symlink():
        raise ValueError("Report not found")
    relative = source.absolute().relative_to(root)
    descriptor = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
    try:
        for component in relative.parts[:-1]:
            next_descriptor = os.open(component, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=descriptor)
            os.close(descriptor)
            descriptor = next_descriptor
        result = os.open(relative.parts[-1], os.O_RDONLY | os.O_NOFOLLOW, dir_fd=descriptor)
        if not stat.S_ISREG(os.fstat(result).st_mode):
            os.close(result)
            raise ValueError("Report not found")
        return result, source.name
    finally:
        os.close(descriptor)


def iter_report_bytes(descriptor):
    try:
        while True:
            chunk = os.read(descriptor, 65536)
            if not chunk:
                break
            yield chunk
    finally:
        os.close(descriptor)
