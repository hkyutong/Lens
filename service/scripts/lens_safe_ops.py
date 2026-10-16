"""Lens-only credential validation and strictly bounded read-only SSH preflight.

There is deliberately no deployment, shell, upload, migration, or backup API.
Production writes require a separately reviewed manifest and rollback boundary.
The CLI emits only RESULT_KEYS; all other material remains in process memory.
"""

import base64
import contextlib
import hashlib
import hmac
import io
import ipaddress
import json
import logging
import os
from pathlib import Path
import pwd
import re
import shlex
import stat
import sys
import time
import warnings


MAX_ENTRY_BYTES = 128 * 1024
MAX_KNOWN_HOSTS_BYTES = 1024 * 1024
ERROR_CLASSES = frozenset({
    'ambiguous_authentication',
    'ambiguous_fields',
    'authentication_failed',
    'connection_failed',
    'credentials_closed',
    'credentials_immutable',
    'credentials_not_serializable',
    'entry_not_regular',
    'entry_permissions_unsafe',
    'entry_too_large',
    'entry_unavailable',
    'host_key_mismatch',
    'host_key_review_required',
    'host_key_trust_missing',
    'internal_failure',
    'invalid_authentication',
    'invalid_fields',
    'invalid_format',
    'invalid_host_key_configuration',
    'invalid_private_key',
    'missing_authentication',
    'missing_fields',
    'none',
    'normalization_concurrent_update',
    'normalization_confirmation_mismatch',
    'normalization_confirmation_missing',
    'normalization_durability_unconfirmed',
    'normalization_entry_changed',
    'normalization_entry_unsafe',
    'normalization_failed',
    'normalization_precondition_failed',
    'normalization_write_failed',
    'operation_not_allowed',
    'probe_failed',
    'ssh_library_unavailable',
    'unknown_fields',
    'runtime_inventory_invalid', 'runtime_inventory_unavailable', 'runtime_inventory_timeout',
})

RESULT_KEYS = frozenset({
    "ok", "entryValid", "hostKeyTrusted", "sshConnected", "readOnlyProbePassed",
    "writeEnabled", "errorClass",
})
FORMAT_CLASSES = frozenset({
    "empty", "json", "keyvalue_colon", "keyvalue_equal", "keyvalue_mixed",
    "heading", "fenced", "unlabeled", "mixed", "unknown",
})
FORMAT_RESULT_KEYS = frozenset({
    "ok", "formatClass", "recognizedAliasCount", "hasHeadings", "hasFences",
    "hasUnlabelledPrivateKeyBlock", "hasRequiredConnectionLabels",
    "hasAuthenticationLabel", "hasUnknownLabels", "parseErrorClass",
    "entryRead", "networkAttempted",
    "hasStandaloneSshCommand", "standaloneSshCommandSafe", "pemBlockWellFormed",
    "hasHostAlias", "hasPortAlias", "hasUsernameAlias", "hasAuthenticationAlias",
    "sshCommandHasHost", "sshCommandHasPort", "sshCommandHasUsername", "unknownLabelCount",
    "usernameAliasCandidateApproved",
})

_ALIASES = {
    "host": ("host", "hostname", "server", "ip", "服务器地址", "服务器ip", "主机", "主机地址", "ip地址", "公网ip", "公网ip地址"),
    "port": ("port", "ssh_port", "端口", "ssh端口", "ssh登录端口"),
    "username": (
        'username',
        'user',
        'ssh_user',
        '用户名',
        '账号',
        'ssh用户名',
        '登录用户名',
        'user name',
        'ssh user',
        'login user',
        'ssh username',
        'login username',
        '登录用户',
        '登陆用户名',
        '登陆用户',
        '用户',
        '用户名称',
        '登录账号',
        '登陆账号',
        '账户',
        '帐户',
    ),
    "password": ("password", "ssh_password", "密码", "ssh密码", "登录密码", "ssh登录密码"),
    "private_key": ("private_key", "ssh_private_key", "私钥", "ssh私钥"),
    "key_passphrase": ("key_passphrase", "private_key_passphrase", "私钥口令"),
    "host_key_fingerprint": ("host_key_fingerprint", "ssh_host_key_fingerprint", "主机密钥指纹"),
    "host_key_source": ("host_key_source", "主机密钥来源"),
    "host_key_verified": ("host_key_verified", "主机密钥已核验"),
}
_CANONICAL = {alias.casefold(): field for field, aliases in _ALIASES.items() for alias in aliases}
_USERNAME_CANDIDATE_ALIASES = frozenset({
    "登录用户", "账户", "ssh账号", "ssh账户", "user name", "ssh user",
    "ssh user name", "ssh username", "user_name",
})
_TRUST_SOURCES = frozenset({"user_verified", "provider_verified"})
_PEM_START = re.compile(r"^-----BEGIN (OPENSSH PRIVATE KEY|RSA PRIVATE KEY|EC PRIVATE KEY|PRIVATE KEY)-----$")
_PIN_PATTERN = re.compile(r"^SHA256:[A-Za-z0-9+/]{43}$")


class SafeFailure(Exception):
    """Only predefined, non-data-bearing error classifications are accepted."""

    def __init__(self, code):
        super().__init__(code if code in ERROR_CLASSES else "internal_failure")


class ConnectionSecrets(dict):
    """An empty mapping with explicit access to non-enumerable in-memory fields."""

    __slots__ = ("__values", "__closed")

    def __init__(self, values):
        dict.__init__(self)
        self.__values = dict(values)
        self.__closed = False

    def __repr__(self):
        return "{}"

    __str__ = __repr__

    def __dir__(self):
        # Prevent inspect.getmembers() from enumerating private slot storage.
        return []

    def field(self, name):
        if self.__closed:
            raise SafeFailure("credentials_closed")
        if name not in _ALIASES:
            raise SafeFailure("invalid_fields")
        return self.__values.get(name)

    def close(self):
        self.__values.clear()
        self.__closed = True

    def _immutable(self, *args, **kwargs):
        raise SafeFailure("credentials_immutable")

    __setitem__ = __delitem__ = update = setdefault = pop = popitem = __ior__ = _immutable
    clear = close

    def __reduce_ex__(self, protocol):
        raise SafeFailure("credentials_not_serializable")


class _ObjectPairs(list):
    pass


def _canonical_name(label):
    if not isinstance(label, str):
        raise SafeFailure("invalid_fields")
    name = _CANONICAL.get(label.strip().casefold())
    if name is None:
        raise SafeFailure("unknown_fields")
    return name


def _consume_pem(lines, index, opening=None):
    if opening is None:
        if index == len(lines):
            raise SafeFailure("invalid_private_key")
        opening = lines[index].strip()
        index += 1
    start = _PEM_START.fullmatch(opening)
    if not start:
        raise SafeFailure("invalid_private_key")
    end = "-----END " + start.group(1) + "-----"
    block = [opening]
    while index < len(lines):
        line = lines[index].strip()
        index += 1
        block.append(line)
        if line == end:
            break
    if block[-1] != end:
        raise SafeFailure("invalid_private_key")
    return "\n".join(block) + "\n", index


def _text_pairs(text):
    pairs = []
    lines = text.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        index += 1
        if not line or line.startswith("#"):
            continue
        if _PEM_START.fullmatch(line):
            value, index = _consume_pem(lines, index, opening=line)
            pairs.append(("private_key", value))
            continue
        match = re.fullmatch(r"([^:=：]+)\s*[:=：]\s*(.*)", line)
        if not match:
            raise SafeFailure("invalid_format")
        label, value = match.groups()
        name = _canonical_name(label)
        if name == "private_key":
            value, index = _consume_pem(lines, index, opening=value or None)
        pairs.append((label, value))
    return pairs


def _valid_host(value):
    if not isinstance(value, str) or not value or len(value) > 253:
        return False
    try:
        ipaddress.ip_address(value)
        return True
    except ValueError:
        return bool(re.fullmatch(r"(?=.{1,253}$)[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?", value)) and all(
            label and len(label) <= 63 and not label.startswith("-") and not label.endswith("-")
            for label in value.split(".")
        )


def _string(value, *, maximum=4096):
    return isinstance(value, str) and 0 < len(value) <= maximum and not any(ord(char) < 32 or ord(char) == 127 for char in value)


def _standalone_ssh_fields(line):
    """Recognize a small SSH-text grammar, never execute or expand it."""
    if not isinstance(line, str) or any(char in line for char in "\x00\r\n;$`|&<>\\()"):
        raise SafeFailure("invalid_format")
    invalid = False
    try:
        tokens = shlex.split(line, comments=False, posix=True)
    except ValueError:
        invalid = True
    if invalid or not tokens or tokens[0] != "ssh":
        raise SafeFailure("invalid_format")
    port = None
    if len(tokens) == 2:
        destination = tokens[1]
    elif len(tokens) == 4 and tokens[1] == "-p":
        port, destination = tokens[2], tokens[3]
    elif len(tokens) == 4 and tokens[2] == "-p":
        destination, port = tokens[1], tokens[3]
    elif len(tokens) == 3 and re.fullmatch(r"-p[0-9]{1,5}", tokens[1]):
        port, destination = tokens[1][2:], tokens[2]
    elif len(tokens) == 3 and re.fullmatch(r"-p[0-9]{1,5}", tokens[2]):
        destination, port = tokens[1], tokens[2][2:]
    else:
        raise SafeFailure("invalid_format")
    if destination.count("@") != 1:
        raise SafeFailure("invalid_format")
    username, host = destination.split("@", 1)
    if not _valid_host(host) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.-]{0,63}", username):
        raise SafeFailure("invalid_format")
    fields = {"host": host, "username": username}
    if port is not None:
        if not re.fullmatch(r"[0-9]{1,5}", port) or not 1 <= int(port) <= 65535:
            raise SafeFailure("invalid_format")
        fields["port"] = int(port)
    return fields


def _pem_structure(lines):
    """Report block framing and ranges only; callers never project key material."""
    ranges = []
    wellformed = True
    index = 0
    while index < len(lines):
        start = _PEM_START.fullmatch(lines[index].strip())
        if not start:
            index += 1
            continue
        begin = index
        end = "-----END " + start.group(1) + "-----"
        index += 1
        body = []
        while index < len(lines) and lines[index].strip() != end:
            body.append(lines[index].strip())
            index += 1
        if index == len(lines) or not body or not all(re.fullmatch(r"[A-Za-z0-9+/=]+", part) for part in body):
            wellformed = False
        ranges.append((begin, min(index, len(lines) - 1)))
        index += 1
    return ranges, wellformed and len(ranges) == 1


def _validated_values(pairs):
    values = {}
    for label, value in pairs:
        name = _canonical_name(label)
        if name in values:
            raise SafeFailure("ambiguous_fields")
        values[name] = value
    if not {"host", "port", "username"} <= values.keys():
        raise SafeFailure("missing_fields")
    if "password" in values and "private_key" in values:
        raise SafeFailure("ambiguous_authentication")
    if not ({"password", "private_key"} & values.keys()):
        raise SafeFailure("missing_authentication")
    if "key_passphrase" in values and "private_key" not in values:
        raise SafeFailure("invalid_authentication")
    port = values["port"]
    if isinstance(port, str) and re.fullmatch(r"[0-9]{1,5}", port):
        port = int(port)
    if type(port) is not int or not 1 <= port <= 65535:
        raise SafeFailure("invalid_fields")
    values["port"] = port
    if not _valid_host(values["host"]):
        raise SafeFailure("invalid_fields")
    username = values["username"]
    if not isinstance(username, str) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_.-]{0,63}", username):
        raise SafeFailure("invalid_fields")
    for field in ("password", "key_passphrase"):
        if field in values and not _string(values[field]):
            raise SafeFailure("invalid_fields")
    if "private_key" in values:
        key = values["private_key"]
        if not isinstance(key, str) or len(key) > MAX_ENTRY_BYTES or "\x00" in key:
            raise SafeFailure("invalid_private_key")
        lines = key.strip().splitlines()
        start = _PEM_START.fullmatch(lines[0]) if lines else None
        if not start or len(lines) < 3 or lines[-1] != "-----END " + start.group(1) + "-----":
            raise SafeFailure("invalid_private_key")
    trust_fields = {"host_key_fingerprint", "host_key_source", "host_key_verified"}
    configured = trust_fields & values.keys()
    if configured:
        if configured != trust_fields:
            raise SafeFailure("invalid_host_key_configuration")
        pin, source, verified = (values[name] for name in ("host_key_fingerprint", "host_key_source", "host_key_verified"))
        if not isinstance(pin, str) or not _PIN_PATTERN.fullmatch(pin) or not isinstance(source, str) or source not in _TRUST_SOURCES:
            raise SafeFailure("invalid_host_key_configuration")
        if isinstance(verified, str) and verified in ("true", "false"):
            verified = verified == "true"
        if type(verified) is not bool:
            raise SafeFailure("invalid_host_key_configuration")
        values["host_key_verified"] = verified
    return values


def parse_entry(text):
    """Parse only the closed JSON or labelled-text formats; never echo input."""
    if not isinstance(text, str):
        raise SafeFailure("invalid_format")
    invalid_encoding = False
    try:
        encoded_length = len(text.encode("utf-8"))
    except UnicodeError:
        invalid_encoding = True
    if invalid_encoding:
        raise SafeFailure("invalid_format")
    if encoded_length > MAX_ENTRY_BYTES:
        raise SafeFailure("entry_too_large")
    stripped = text.lstrip("\ufeff \t\r\n")
    if stripped.startswith(("{", "[")):
        failed = False
        try:
            pairs = json.loads(stripped, object_pairs_hook=_ObjectPairs)
        except (ValueError, RecursionError):
            failed = True
        if failed or not isinstance(pairs, _ObjectPairs):
            raise SafeFailure("invalid_format")
    else:
        pairs = _text_pairs(stripped)
    secret = ConnectionSecrets(_validated_values(pairs))
    if secret.field("private_key") is not None:
        failure = None
        try:
            with _silent_boundary():
                import paramiko
                _private_key(paramiko, secret)
        except ImportError:
            failure = "ssh_library_unavailable"
        except Exception:
            failure = "invalid_private_key"
        if failure:
            secret.close()
            raise SafeFailure(failure)
    return secret


def _format_result(*, error="none", format_class="unknown", recognized=0, names=frozenset(),
                   headings=False, fences=False, unlabelled_key=False, unknown_labels=False,
                   entry_read=False, ok=True, has_ssh=False, safe_ssh=False, ssh_names=frozenset(),
                   pem_wellformed=False, unknown_count=0, username_candidate=False):
    return {
        "ok": ok is True,
        "formatClass": format_class if format_class in FORMAT_CLASSES else "unknown",
        "recognizedAliasCount": recognized if type(recognized) is int and recognized >= 0 else 0,
        "hasHeadings": headings is True,
        "hasFences": fences is True,
        "hasUnlabelledPrivateKeyBlock": unlabelled_key is True,
        "hasRequiredConnectionLabels": {"host", "port", "username"} <= names,
        "hasAuthenticationLabel": bool({"password", "private_key"} & names),
        "hasUnknownLabels": unknown_labels is True,
        "parseErrorClass": error if error in ERROR_CLASSES else "internal_failure",
        "entryRead": entry_read is True,
        "networkAttempted": False,
        "hasStandaloneSshCommand": has_ssh is True,
        "standaloneSshCommandSafe": safe_ssh is True,
        "pemBlockWellFormed": pem_wellformed is True,
        "hasHostAlias": "host" in names,
        "hasPortAlias": "port" in names,
        "hasUsernameAlias": "username" in names,
        "hasAuthenticationAlias": bool({"password", "private_key"} & names),
        "sshCommandHasHost": "host" in ssh_names,
        "sshCommandHasPort": "port" in ssh_names,
        "sshCommandHasUsername": "username" in ssh_names,
        "unknownLabelCount": unknown_count if type(unknown_count) is int and unknown_count >= 0 else 0,
        "usernameAliasCandidateApproved": username_candidate is True,
    }


def diagnose_format(text):
    """Classify structure and approved aliases; never report original labels/values."""
    if not isinstance(text, str):
        return _format_result(error="invalid_format", ok=False)
    encoding_failed = False
    try:
        size = len(text.encode("utf-8"))
    except UnicodeError:
        encoding_failed = True
    if encoding_failed:
        return _format_result(error="invalid_format", ok=False)
    if size > MAX_ENTRY_BYTES:
        return _format_result(error="entry_too_large", ok=False)
    stripped = text.lstrip("\ufeff \t\r\n")
    names = set()
    recognized = 0
    unknown = False
    headings = False
    fences = False
    unlabelled = False
    private_key_marker = False
    pem_wellformed = False
    has_ssh = False
    ssh_safe_flags = []
    ssh_names = set()
    unknown_count = 0
    username_candidate = False
    styles = set()
    if not stripped:
        format_class = "empty"
    elif stripped.startswith(("{", "[")):
        format_class = "json"
        pairs = None
        try:
            candidate = json.loads(stripped, object_pairs_hook=_ObjectPairs)
            if isinstance(candidate, _ObjectPairs):
                pairs = candidate
        except (ValueError, RecursionError):
            pass
        if pairs is not None:
            for label, unused_value in pairs:
                name = _CANONICAL.get(label.strip().casefold()) if isinstance(label, str) else None
                if name:
                    recognized += 1
                    names.add(name)
                else:
                    unknown = True
                    unknown_count += 1
                    username_candidate = username_candidate or label.strip().casefold() in _USERNAME_CANDIDATE_ALIASES
    else:
        all_lines = stripped.splitlines()
        pem_ranges, pem_wellformed = _pem_structure(all_lines)
        pem_line_indexes = {index for begin, end in pem_ranges for index in range(begin, end + 1)}
        private_key_marker = bool(pem_ranges)
        for line_index, original_line in enumerate(all_lines):
            line = original_line.strip()
            if not line:
                continue
            if line_index in pem_line_indexes:
                unlabelled = True
                continue
            if re.match(r"^ssh(?:\s|$)", line) and ("@" in line or not any(separator in line for separator in ":=：")):
                has_ssh = True
                unlabelled = True
                try:
                    command_fields = _standalone_ssh_fields(line)
                    ssh_names.update(command_fields)
                    ssh_safe_flags.append(True)
                except SafeFailure:
                    ssh_safe_flags.append(False)
                continue
            if line.startswith("```"):
                fences = True
                continue
            if line.startswith("#") or re.fullmatch(r"\[[^\]\r\n]{1,100}\]|【[^】\r\n]{1,100}】", line):
                headings = True
                continue
            if _PEM_START.fullmatch(line):
                private_key_marker = True
            match = re.fullmatch(r"([^:=：]+)\s*([:=：])\s*(.*)", line)
            if not match:
                unlabelled = True
                continue
            label, separator, unused_value = match.groups()
            styles.add("keyvalue_equal" if separator == "=" else "keyvalue_colon")
            name = _CANONICAL.get(label.strip().casefold())
            if name:
                recognized += 1
                names.add(name)
            else:
                unknown = True
                unknown_count += 1
                username_candidate = username_candidate or label.strip().casefold() in _USERNAME_CANDIDATE_ALIASES
        categories = styles.copy()
        if headings:
            categories.add("heading")
        if fences:
            categories.add("fenced")
        if unlabelled:
            categories.add("unlabeled")
        if categories == {"keyvalue_colon", "keyvalue_equal"}:
            format_class = "keyvalue_mixed"
        elif len(categories) > 1:
            format_class = "mixed"
        else:
            format_class = next(iter(categories), "unknown")
    error = "none"
    secret = None
    try:
        secret = parse_entry(text)
    except SafeFailure as failure:
        error = str(failure)
    except Exception:
        error = "internal_failure"
    finally:
        if secret is not None:
            secret.close()
    return _format_result(error=error, format_class=format_class, recognized=recognized, names=names,
                          headings=headings, fences=fences, unlabelled_key=private_key_marker and "private_key" not in names,
                          unknown_labels=unknown, has_ssh=has_ssh, safe_ssh=len(ssh_safe_flags) == 1 and ssh_safe_flags[0],
                          ssh_names=ssh_names, pem_wellformed=pem_wellformed, unknown_count=unknown_count,
                          username_candidate=username_candidate)


def diagnose_project_format():
    """Read the unique project entry through the same safe loader; never network."""
    try:
        with _silent_boundary():
            result = diagnose_format(_load_project_text())
        result["entryRead"] = True
        return result
    except SafeFailure as failure:
        return _format_result(error=str(failure), ok=False)
    except Exception:
        return _format_result(error="internal_failure", ok=False)


def _entry_path():
    return Path(__file__).resolve().parents[2] / "服务器.txt"


def _known_hosts_path():
    """Fixed user known-hosts path; SSH config and environment are not consulted."""
    return Path(pwd.getpwuid(os.getuid()).pw_dir) / ".ssh" / "known_hosts"


def _trusted_known_host(secrets):
    """Return exact-target existing keys; an explicit pin narrows the trusted set."""
    path = _known_hosts_path()
    try:
        text = _read_private_text(path, maximum=MAX_KNOWN_HOSTS_BYTES)
        import paramiko
        host = secrets.field("host")
        port = secrets.field("port")
        candidate = host if port == 22 else f"[{host}]:{port}"
        keys = []
        for original_line in text.splitlines():
            line = original_line.strip()
            if not line or line.startswith("#"):
                continue
            parts = line.split()
            marker = parts[0].startswith("@")
            hostname_index = 1 if marker else 0
            if len(parts) <= hostname_index:
                continue
            hostnames = parts[hostname_index].split(",")
            matches = False
            for name in hostnames:
                if name == candidate:
                    matches = True
                elif name.startswith("|1|"):
                    matches = matches or hmac.compare_digest(paramiko.HostKeys.hash_host(candidate, name), name)
            if not matches:
                continue
            if marker:
                raise SafeFailure("host_key_trust_missing")
            entry = paramiko.hostkeys.HostKeyEntry.from_line(line)
            if entry is None or entry.key is None:
                raise SafeFailure("host_key_trust_missing")
            keys.append(entry.key)
        if not keys:
            raise SafeFailure('host_key_trust_missing')
        by_algorithm = {}
        for key in keys:
            algorithm = key.get_name()
            if algorithm in by_algorithm:
                raise SafeFailure('host_key_trust_missing')
            by_algorithm[algorithm] = key
        configured_pin = secrets.field('host_key_fingerprint')
        if configured_pin:
            pinned = tuple(key for key in keys if hmac.compare_digest(_fingerprint(key), configured_pin))
            if len(pinned) != 1:
                raise SafeFailure('host_key_mismatch')
            return pinned
        return tuple(keys)
    except SafeFailure as failure:
        if str(failure) == "host_key_mismatch":
            raise
        raise SafeFailure("host_key_trust_missing") from None
    except Exception:
        raise SafeFailure("host_key_trust_missing")


def _read_private_text(path, *, maximum):
    """Bounded, race-resistant local reads shared by both fixed input sources."""
    error = None
    descriptor = None
    data = None
    try:
        if path.is_symlink():
            error = "entry_not_regular"
        else:
            # lstat before open prevents FIFOs/devices from blocking the caller.
            preliminary = os.lstat(path)
            if not stat.S_ISREG(preliminary.st_mode):
                error = "entry_not_regular"
            elif preliminary.st_uid != os.getuid() or preliminary.st_mode & 0o077:
                error = "entry_permissions_unsafe"
            elif preliminary.st_size > maximum:
                error = "entry_too_large"
            if error:
                raise SafeFailure(error)
            descriptor = os.open(path, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK)
            metadata = os.fstat(descriptor)
            if not stat.S_ISREG(metadata.st_mode):
                error = "entry_not_regular"
            elif (preliminary.st_dev, preliminary.st_ino) != (metadata.st_dev, metadata.st_ino):
                error = "entry_unavailable"
            elif metadata.st_uid != os.getuid() or metadata.st_mode & 0o077:
                error = "entry_permissions_unsafe"
            elif metadata.st_size > maximum:
                error = "entry_too_large"
            else:
                with os.fdopen(descriptor, "rb") as stream:
                    descriptor = None
                    data = stream.read(maximum + 1)
                    after_read = os.fstat(stream.fileno())
                if len(data) > maximum:
                    error = "entry_too_large"
                elif (metadata.st_mtime_ns, metadata.st_size) != (after_read.st_mtime_ns, after_read.st_size):
                    error = "entry_unavailable"
    except OSError:
        error = "entry_unavailable"
    finally:
        if descriptor is not None:
            os.close(descriptor)
    if error:
        raise SafeFailure(error)
    decode_failed = False
    try:
        text = data.decode("utf-8")
    except UnicodeError:
        decode_failed = True
    if decode_failed:
        raise SafeFailure("invalid_format")
    return text


def _load_project_text():
    """The only production connection source; no CLI, env, or SSH-config override."""
    return _read_private_text(_entry_path(), maximum=MAX_ENTRY_BYTES)


def load_project_entry():
    return parse_entry(_load_project_text())


def _result(error="none", **states):
    result = {"ok": error == "none", "entryValid": False, "hostKeyTrusted": False,
              "sshConnected": False, "readOnlyProbePassed": False, "writeEnabled": False,
              "errorClass": error if error in ERROR_CLASSES else "internal_failure"}
    for name in ("entryValid", "hostKeyTrusted", "sshConnected", "readOnlyProbePassed"):
        if name in states:
            result[name] = states[name] is True
    return result


def _fingerprint(key):
    return "SHA256:" + base64.b64encode(hashlib.sha256(key.asbytes()).digest()).decode("ascii").rstrip("=")


def _private_key(paramiko, secrets):
    material = secrets.field("private_key")
    for kind in (paramiko.Ed25519Key, paramiko.ECDSAKey, paramiko.RSAKey):
        try:
            with io.StringIO(material) as source:
                return kind.from_private_key(source, password=secrets.field("key_passphrase"))
        except Exception:
            pass
    raise SafeFailure("invalid_private_key")


@contextlib.contextmanager
def _silent_boundary():
    """Library logs and unexpected prints cannot cross the result boundary."""
    previous = logging.root.manager.disable
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()), warnings.catch_warnings():
        logging.disable(logging.CRITICAL)
        warnings.simplefilter("ignore")
        try:
            yield
        finally:
            logging.disable(previous)


@contextlib.contextmanager
def _trusted_connection(secrets: ConnectionSecrets, *, host_key_reviewed=False):
    """Open only a reviewed, existing-key-pinned connection; always close it."""
    if host_key_reviewed is not True:
        raise SafeFailure('host_key_review_required')
    entry_trust_configured = any(
        secrets.field(name) is not None
        for name in ('host_key_fingerprint', 'host_key_verified', 'host_key_source')
    )
    if entry_trust_configured and (not secrets.field('host_key_fingerprint') or secrets.field('host_key_verified') is not True or (not secrets.field('host_key_source'))):
        raise SafeFailure('host_key_trust_missing')
    client = None
    try:
        with _silent_boundary():
            import paramiko
            trusted_keys = _trusted_known_host(secrets)
            trusted_identities = tuple((trusted.get_name(), trusted.asbytes()) for trusted in trusted_keys)
            def is_trusted_key(candidate_key):
                candidate_algorithm = candidate_key.get_name()
                candidate_bytes = candidate_key.asbytes()
                return any(
                    hmac.compare_digest(candidate_algorithm, algorithm)
                    and hmac.compare_digest(candidate_bytes, raw_key)
                    for algorithm, raw_key in trusted_identities
                )
            class PinnedHostKeyPolicy(paramiko.MissingHostKeyPolicy):
                def missing_host_key(self, unused_client, unused_hostname, key):
                    if not is_trusted_key(key):
                        raise SafeFailure("host_key_mismatch")
            key = _private_key(paramiko, secrets) if secrets.field("private_key") is not None else None
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(PinnedHostKeyPolicy())
            client.connect(hostname=secrets.field("host"), port=secrets.field("port"), username=secrets.field("username"),
                           password=secrets.field("password"), pkey=key, allow_agent=False, look_for_keys=False,
                           timeout=15, banner_timeout=15, auth_timeout=15, channel_timeout=15)
            transport = client.get_transport()
            if not transport or not is_trusted_key(transport.get_remote_server_key()):
                raise SafeFailure("host_key_mismatch")
            yield client
    finally:
        if client is not None:
            with _silent_boundary():
                try:
                    client.close()
                except Exception:
                    pass


def run_runtime_inventory(secrets, *, host_key_reviewed=False):
    from lens_runtime_inventory import PROGRAM, parse_inventory

    states = dict(entryValid=True, hostKeyTrusted=False, sshConnected=False,
                  readOnlyProbePassed=False)
    unavailable = dict(lensPm2CandidateCount=0, lensDockerCandidateCount=0,
                       lensPm2WatchEnabled=False, runtimeUndetermined=True)
    streams = ()
    try:
        with _silent_boundary():
            with _trusted_connection(secrets, host_key_reviewed=host_key_reviewed) as client:
                states.update(hostKeyTrusted=True, sshConnected=True)
                streams = client.exec_command("python3 -I -", timeout=12, get_pty=False)
                streams[0].write(PROGRAM)
                streams[0].flush()
                streams[0].close()
                channel = streams[1].channel
                deadline = time.monotonic() + 12
                payload = bytearray()
                while True:
                    while channel.recv_ready():
                        payload.extend(channel.recv(4097))
                        if len(payload) > 4096:
                            raise SafeFailure("runtime_inventory_invalid")
                    if channel.recv_stderr_ready():
                        raise SafeFailure("runtime_inventory_unavailable")
                    if channel.exit_status_ready() and not channel.recv_ready():
                        break
                    if time.monotonic() >= deadline:
                        raise SafeFailure("runtime_inventory_timeout")
                    time.sleep(0.01)
                if channel.recv_exit_status() != 0:
                    raise SafeFailure("runtime_inventory_unavailable")
                try:
                    inventory = parse_inventory(payload)
                except Exception:
                    raise SafeFailure("runtime_inventory_invalid") from None
                states.update(readOnlyProbePassed=True)
                return dict(_result(**states), **inventory)
    except ImportError:
        return dict(_result("runtime_inventory_unavailable", **states), **unavailable)
    except SafeFailure as failure:
        return dict(_result(str(failure), **states), **unavailable)
    except Exception:
        return dict(_result("runtime_inventory_unavailable", **states), **unavailable)
    finally:
        for stream in streams:
            try:
                stream.close()
            except Exception:
                pass


def run_preflight(secrets, *, host_key_reviewed=False):
    """Authenticate a reviewed pinned key and run only the fixed read-only probe."""
    streams = ()
    states = {"entryValid": True, "hostKeyTrusted": False, "sshConnected": False, "readOnlyProbePassed": False}
    error = "none"
    with _silent_boundary():
        try:
            with _trusted_connection(secrets, host_key_reviewed=host_key_reviewed) as client:
                try:
                    states["hostKeyTrusted"] = True
                    states["sshConnected"] = True
                    streams = client.exec_command("true", timeout=15, get_pty=False)
                    streams[0].close()
                    deadline = time.monotonic() + 15
                    while not streams[1].channel.exit_status_ready() and time.monotonic() < deadline:
                        time.sleep(0.05)
                    if not streams[1].channel.exit_status_ready() or streams[1].channel.recv_exit_status() != 0:
                        error = "probe_failed"
                    else:
                        states["readOnlyProbePassed"] = True
                finally:
                    for stream in streams:
                        try:
                            stream.close()
                        except Exception:
                            pass
        except ImportError:
            error = "ssh_library_unavailable"
        except SafeFailure as failure:
            error = str(failure)
        except Exception as failure:
            error = "authentication_failed" if type(failure).__name__ in ("AuthenticationException", "BadAuthenticationType", "PartialAuthentication") else "connection_failed"
    return _result(error, **states)



def _unique_unknown_username_label(text):
    diagnostic = diagnose_format(text)
    required = {
        "hasHostAlias": True, "hasPortAlias": True, "hasUsernameAlias": False,
        "hasUnknownLabels": True, "unknownLabelCount": 1,
        "hasUnlabelledPrivateKeyBlock": True, "pemBlockWellFormed": True,
        "hasHeadings": False, "hasFences": False, "hasStandaloneSshCommand": False,
    }
    if any(diagnostic.get(key) != value for key, value in required.items()):
        raise SafeFailure("normalization_precondition_failed")
    lines = text.splitlines(keepends=True)
    unknown = []
    in_pem = False
    for index, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("-----BEGIN "):
            in_pem = True
            continue
        if in_pem:
            if stripped.startswith("-----END "):
                in_pem = False
            continue
        if not stripped:
            continue
        match = re.match(r"^([ \t]*)([^:=：\r\n]+?)([ \t]*)([:=：])", line)
        if not match:
            raise SafeFailure("normalization_precondition_failed")
        try:
            _canonical_name(match.group(2))
        except SafeFailure:
            unknown.append((index, match.start(2), match.end(2), match.group(2)))
    if len(unknown) != 1 or in_pem:
        raise SafeFailure("normalization_precondition_failed")
    return lines, unknown[0]


def normalize_confirmed_username_label_text(text, *, confirmed_label=None):
    """The caller must bind an exact label whose meaning the human confirmed."""
    if not isinstance(confirmed_label, str) or not confirmed_label:
        raise SafeFailure("normalization_confirmation_missing")
    lines, (index, start, end, label) = _unique_unknown_username_label(text)
    if not hmac.compare_digest(label.encode("utf-8"), confirmed_label.encode("utf-8")):
        raise SafeFailure("normalization_confirmation_mismatch")
    lines[index] = lines[index][:start] + "username" + lines[index][end:]
    candidate = "".join(lines)
    secrets = parse_entry(candidate)
    secrets.close()
    return candidate


def _replace_entry_text(path, original, candidate):
    """Serialize private-entry edits and resolve replacements through a directory fd."""
    import fcntl
    import secrets as randomness
    directory_fd = entry_fd = temporary_fd = None
    temporary_name = None
    try:
        parent = path.parent.lstat()
        if (not stat.S_ISDIR(parent.st_mode) or parent.st_uid != os.getuid()
                or stat.S_IMODE(parent.st_mode) & 0o022):
            raise SafeFailure("normalization_entry_unsafe")
        directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        parent_fd = os.fstat(directory_fd)
        if (parent.st_dev, parent.st_ino) != (parent_fd.st_dev, parent_fd.st_ino):
            raise SafeFailure("normalization_entry_changed")
        fcntl.flock(directory_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        entry_fd = os.open(path.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=directory_fd)
        before = os.fstat(entry_fd)
        if (not stat.S_ISREG(before.st_mode) or stat.S_IMODE(before.st_mode) != 0o600
                or before.st_uid != os.getuid() or before.st_nlink != 1):
            raise SafeFailure("normalization_entry_unsafe")
        fcntl.flock(entry_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        source_bytes = original.encode("utf-8")
        if len(source_bytes) > MAX_ENTRY_BYTES or os.read(entry_fd, MAX_ENTRY_BYTES + 1) != source_bytes:
            raise SafeFailure("normalization_entry_changed")
        data = candidate.encode("utf-8")
        if len(data) > MAX_ENTRY_BYTES:
            raise SafeFailure("normalization_precondition_failed")
        for unused_attempt in range(4):
            name = ".lens-entry-" + randomness.token_hex(16)
            try:
                temporary_fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW,
                                       0o600, dir_fd=directory_fd)
                temporary_name = name
                break
            except FileExistsError:
                continue
        if temporary_fd is None:
            raise SafeFailure("normalization_write_failed")
        os.fchmod(temporary_fd, 0o600)
        with os.fdopen(temporary_fd, "wb") as handle:
            temporary_fd = None
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        now = os.stat(path.name, dir_fd=directory_fd, follow_symlinks=False)
        current_parent = path.parent.lstat()
        if (current_parent.st_dev, current_parent.st_ino, current_parent.st_mode) != (parent.st_dev, parent.st_ino, parent.st_mode):
            raise SafeFailure("normalization_entry_changed")
        expected = (before.st_dev, before.st_ino, before.st_uid, before.st_mode, before.st_nlink,
                    before.st_size, before.st_mtime_ns, before.st_ctime_ns)
        actual = (now.st_dev, now.st_ino, now.st_uid, now.st_mode, now.st_nlink,
                  now.st_size, now.st_mtime_ns, now.st_ctime_ns)
        if actual != expected:
            raise SafeFailure("normalization_entry_changed")
        os.lseek(entry_fd, 0, os.SEEK_SET)
        if os.read(entry_fd, MAX_ENTRY_BYTES + 1) != source_bytes:
            raise SafeFailure("normalization_entry_changed")
        os.replace(temporary_name, path.name, src_dir_fd=directory_fd, dst_dir_fd=directory_fd)
        temporary_name = None
        try:
            os.fsync(directory_fd)
        except Exception:
            raise SafeFailure("normalization_durability_unconfirmed") from None
        return True
    except SafeFailure:
        raise
    except BlockingIOError:
        raise SafeFailure("normalization_concurrent_update") from None
    except Exception:
        raise SafeFailure("normalization_write_failed") from None
    finally:
        if temporary_fd is not None:
            os.close(temporary_fd)
        if temporary_name is not None and directory_fd is not None:
            try:
                os.unlink(temporary_name, dir_fd=directory_fd)
            except FileNotFoundError:
                pass
        for descriptor in (entry_fd, directory_fd):
            if descriptor is not None:
                os.close(descriptor)


def normalize_project_username_label(*, human_confirmed_unknown_username=False):
    """Explicit human confirmation applies only to this fixed entry snapshot."""
    result = {"ok": False, "entryLabelNormalized": False, "valuesPreserved": False,
              "privateKeyPreserved": False, "directorySyncVerified": False, "networkAttempted": False, "errorClass": ""}
    try:
        if human_confirmed_unknown_username is not True:
            raise SafeFailure("normalization_confirmation_missing")
        original = _load_project_text()
        unused_lines, candidate_label = _unique_unknown_username_label(original)
        candidate = normalize_confirmed_username_label_text(original, confirmed_label=candidate_label[3])
        _replace_entry_text(_entry_path(), original, candidate)
        result.update(ok=True, entryLabelNormalized=True, valuesPreserved=True, privateKeyPreserved=True, directorySyncVerified=True)
    except SafeFailure as error:
        result["errorClass"] = str(error)
        if str(error) == "normalization_durability_unconfirmed":
            try:
                verified = _read_private_text(_entry_path(), maximum=MAX_ENTRY_BYTES) == candidate
                result.update(entryLabelNormalized=verified, valuesPreserved=verified, privateKeyPreserved=verified)
            except Exception:
                pass
    except Exception:
        result["errorClass"] = "normalization_failed"
    return result



def normalize_confirmed_multiline_entry_text(text, *, confirmed_username=None):
    """Support labels whose values occupy the following line; never guess identity."""
    if not isinstance(confirmed_username, str) or not confirmed_username:
        raise SafeFailure("normalization_confirmation_missing")
    lines = text.splitlines(keepends=True)
    fields = {}
    pem = None
    index = 0
    while index < len(lines):
        line = lines[index].strip()
        if not line:
            index += 1
            continue
        match = re.fullmatch(r"([^:=：\r\n]+?)\s*[:=：]\s*", line)
        if not match:
            raise SafeFailure("normalization_precondition_failed")
        label = match.group(1)
        try:
            canonical = _canonical_name(label)
        except SafeFailure:
            # An unfamiliar empty heading carries no connection value. Accept
            # it only as the single key heading: the next branch requires an
            # immediately adjacent complete PEM, then parse_entry verifies the
            # actual key. Unknown scalar fields and inline values still fail.
            canonical = "private_key"
        index += 1
        while index < len(lines) and not lines[index].strip():
            index += 1
        if index >= len(lines) or canonical in fields:
            raise SafeFailure("normalization_precondition_failed")
        if canonical == "private_key":
            start = index
            opening = lines[index].strip()
            if not opening.startswith("-----BEGIN "):
                raise SafeFailure("normalization_precondition_failed")
            end_marker = opening.replace("-----BEGIN ", "-----END ", 1)
            index += 1
            while index < len(lines) and lines[index].strip() != end_marker:
                index += 1
            if index >= len(lines):
                raise SafeFailure("normalization_precondition_failed")
            pem = "".join(lines[start:index + 1])
            fields[canonical] = pem
            index += 1
        elif canonical in ("host", "port", "username"):
            value = lines[index].strip()
            if not value or any(separator in value for separator in ("=", "：")):
                raise SafeFailure("normalization_precondition_failed")
            fields[canonical] = value
            index += 1
        else:
            raise SafeFailure("normalization_precondition_failed")
    if set(fields) not in ({"host", "port", "private_key"}, {"host", "port", "username", "private_key"}):
        raise SafeFailure("normalization_precondition_failed")
    if "username" in fields and not hmac.compare_digest(fields["username"].encode(), confirmed_username.encode()):
        raise SafeFailure("normalization_confirmation_mismatch")
    newline = "\r\n" if "\r\n" in text else "\n"
    candidate = newline.join(("host: " + fields["host"], "port: " + fields["port"],
                              "username: " + confirmed_username, "")) + pem
    secrets = parse_entry(candidate)
    secrets.close()
    return candidate


def normalize_project_confirmed_superuser_entry(*, human_confirmed_superuser=False):
    """The human selected the standard system superuser; this is never a fallback."""
    result = {"ok": False, "entryLabelNormalized": False, "usernameAdded": False,
              "valuesPreserved": False, "privateKeyPreserved": False,
              "directorySyncVerified": False, "networkAttempted": False, "errorClass": ""}
    candidate = None
    try:
        if human_confirmed_superuser is not True:
            raise SafeFailure("normalization_confirmation_missing")
        original = _load_project_text()
        confirmed_username = pwd.getpwuid(0).pw_name
        candidate = normalize_confirmed_multiline_entry_text(original, confirmed_username=confirmed_username)
        _replace_entry_text(_entry_path(), original, candidate)
        result.update(ok=True, entryLabelNormalized=True, usernameAdded=True, valuesPreserved=True,
                      privateKeyPreserved=True, directorySyncVerified=True)
    except SafeFailure as error:
        result["errorClass"] = str(error)
        if str(error) == "normalization_durability_unconfirmed" and candidate is not None:
            try:
                verified = _read_private_text(_entry_path(), maximum=MAX_ENTRY_BYTES) == candidate
                result.update(entryLabelNormalized=verified, usernameAdded=verified,
                              valuesPreserved=verified, privateKeyPreserved=verified)
            except Exception:
                pass
    except Exception:
        result["errorClass"] = "normalization_failed"
    return result


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if argv == ["diagnose-format"]:
        result = diagnose_project_format()
    elif argv not in (['validate'], ['preflight', '--host-key-reviewed'], ['inventory', '--host-key-reviewed']):
        result = _result("host_key_review_required" if argv == ["preflight"] else "operation_not_allowed")
    else:
        secrets = None
        try:
            with _silent_boundary():
                secrets = load_project_entry()
                result = _result(entryValid=True) if argv == ['validate'] else (run_runtime_inventory(secrets, host_key_reviewed=True) if argv == ['inventory', '--host-key-reviewed'] else run_preflight(secrets, host_key_reviewed=True))
        except SafeFailure as failure:
            result = _result(str(failure))
        except Exception:
            result = _result("internal_failure")
        finally:
            if secrets is not None:
                secrets.close()
    print(json.dumps(result, sort_keys=True))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
