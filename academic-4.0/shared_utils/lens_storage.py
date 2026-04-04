import glob
import json
import os
import shutil
import time
from typing import Iterable, List, Optional

from shared_utils.config_loader import get_conf

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DEFAULT_USER_NAME = "default_user"
LENS_EXPORT_PLUGIN = "lens_exports"
LENS_RUNTIME_MARKER = ".lens-runtime.json"


def _resolve_path(value: str, base: str = PROJECT_ROOT) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    if os.path.isabs(raw):
        return os.path.abspath(raw)
    return os.path.abspath(os.path.join(base, raw))


def _candidate_shared_roots() -> Iterable[str]:
    env_root = os.environ.get("ACADEMIC_SHARED_UPLOAD_ROOT")
    if env_root:
        yield _resolve_path(env_root)
    yield os.path.abspath(os.path.join(PROJECT_ROOT, "..", "service", "public", "file"))
    yield os.path.abspath(os.path.join(PROJECT_ROOT, "..", "AIWebQuickDeploy", "public", "file"))


def get_shared_upload_root() -> str:
    for candidate in _candidate_shared_roots():
        if candidate and os.path.isdir(candidate):
            return candidate
    for candidate in _candidate_shared_roots():
        if candidate:
            return candidate
    return ""


def get_private_upload_root() -> str:
    configured = os.environ.get("ACADEMIC_TEMP_ROOT") or get_conf("PATH_PRIVATE_UPLOAD")
    return _resolve_path(configured)


def get_logging_root() -> str:
    return _resolve_path(get_conf("PATH_LOGGING"))


def get_lens_export_plugin_name() -> str:
    return os.environ.get("ACADEMIC_RESULT_PLUGIN_DIR", LENS_EXPORT_PLUGIN).strip() or LENS_EXPORT_PLUGIN


def get_runtime_marker_name() -> str:
    return LENS_RUNTIME_MARKER


def get_temp_ttl_seconds() -> int:
    hours = max(int(float(os.environ.get("ACADEMIC_TEMP_TTL_HOURS", "24"))), 1)
    return hours * 3600


def get_extract_ttl_seconds() -> int:
    hours = max(int(float(os.environ.get("ACADEMIC_EXTRACT_TTL_HOURS", "6"))), 1)
    return hours * 3600


def get_result_ttl_seconds() -> int:
    days = max(int(float(os.environ.get("ACADEMIC_RESULT_TTL_DAYS", "7"))), 1)
    return days * 86400


def path_is_within(path_value: str, root_value: str) -> bool:
    path_abs = os.path.abspath(str(path_value or ""))
    root_abs = os.path.abspath(str(root_value or ""))
    if not path_abs or not root_abs:
        return False
    try:
        return os.path.commonpath([path_abs, root_abs]) == root_abs
    except ValueError:
        return False


def get_allowed_storage_roots() -> List[str]:
    roots = [
        get_private_upload_root(),
        get_logging_root(),
        get_shared_upload_root(),
    ]
    result = []
    seen = set()
    for root in roots:
        normalized = os.path.abspath(str(root or ""))
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        result.append(normalized)
    return result


def is_shared_upload_path(path_value: str) -> bool:
    shared_root = get_shared_upload_root()
    if not shared_root:
        return False
    return path_is_within(path_value, shared_root)


def is_private_upload_path(path_value: str) -> bool:
    return path_is_within(path_value, get_private_upload_root())


def _safe_listdir(path_value: str) -> List[str]:
    try:
        return os.listdir(path_value)
    except Exception:
        return []


def _remove_path(path_value: str) -> bool:
    if not os.path.lexists(path_value):
        return False
    try:
        if os.path.islink(path_value) or os.path.isfile(path_value):
            os.unlink(path_value)
        else:
            shutil.rmtree(path_value, ignore_errors=True)
        return True
    except Exception:
        return False


def write_runtime_marker(
    target_dir: str,
    kind: str,
    user_name: str = DEFAULT_USER_NAME,
    extra: Optional[dict] = None,
) -> str:
    marker_path = os.path.join(target_dir, get_runtime_marker_name())
    payload = {
        "kind": str(kind or "").strip() or "temp",
        "user": str(user_name or DEFAULT_USER_NAME).strip() or DEFAULT_USER_NAME,
        "createdAt": int(time.time()),
    }
    if isinstance(extra, dict):
        payload.update(extra)
    with open(marker_path, "w", encoding="utf-8") as marker_file:
        json.dump(payload, marker_file, ensure_ascii=False)
    return marker_path


def _has_runtime_marker(target_dir: str) -> bool:
    return os.path.isfile(os.path.join(target_dir, get_runtime_marker_name()))


def cleanup_private_upload_root(now: Optional[float] = None) -> dict:
    now_ts = float(now or time.time())
    temp_root = get_private_upload_root()
    temp_ttl = get_temp_ttl_seconds()
    extract_ttl = get_extract_ttl_seconds()
    removed_temp_dirs = 0
    removed_extract_dirs = 0
    if not os.path.isdir(temp_root):
        return {
            "removedTempDirs": 0,
            "removedExtractDirs": 0,
        }

    for user_dir in glob.glob(os.path.join(temp_root, "*")):
        if not os.path.isdir(user_dir):
            continue
        for workspace_dir in glob.glob(os.path.join(user_dir, "*")):
            if not os.path.isdir(workspace_dir):
                continue
            if not _has_runtime_marker(workspace_dir):
                continue
            try:
                workspace_mtime = os.path.getmtime(workspace_dir)
            except Exception:
                continue
            for extract_dir in glob.glob(os.path.join(workspace_dir, "**", "*.extract"), recursive=True):
                if not os.path.isdir(extract_dir):
                    continue
                try:
                    mtime = os.path.getmtime(extract_dir)
                except Exception:
                    continue
                if mtime < now_ts - extract_ttl and _remove_path(extract_dir):
                    removed_extract_dirs += 1
            if workspace_mtime < now_ts - temp_ttl and _remove_path(workspace_dir):
                removed_temp_dirs += 1
        if not _safe_listdir(user_dir):
            try:
                os.rmdir(user_dir)
            except Exception:
                pass

    return {
        "removedTempDirs": removed_temp_dirs,
        "removedExtractDirs": removed_extract_dirs,
    }


def cleanup_lens_export_root(now: Optional[float] = None) -> dict:
    now_ts = float(now or time.time())
    log_root = get_logging_root()
    plugin_name = get_lens_export_plugin_name()
    result_ttl = get_result_ttl_seconds()
    removed_result_dirs = 0
    if not os.path.isdir(log_root):
        return {"removedResultDirs": 0}

    for user_dir in glob.glob(os.path.join(log_root, "*")):
        export_root = os.path.join(user_dir, plugin_name)
        if not os.path.isdir(export_root):
            continue
        for export_dir in glob.glob(os.path.join(export_root, "*")):
            if not os.path.isdir(export_dir):
                continue
            try:
                mtime = os.path.getmtime(export_dir)
            except Exception:
                continue
            if mtime < now_ts - result_ttl and _remove_path(export_dir):
                removed_result_dirs += 1
        if not _safe_listdir(export_root):
            try:
                os.rmdir(export_root)
            except Exception:
                pass

    return {"removedResultDirs": removed_result_dirs}


def cleanup_lens_runtime_artifacts(now: Optional[float] = None) -> dict:
    now_ts = float(now or time.time())
    private_stats = cleanup_private_upload_root(now_ts)
    export_stats = cleanup_lens_export_root(now_ts)
    return {
        **private_stats,
        **export_stats,
    }


def ensure_lens_export_dir(user_name: str, time_tag: str) -> str:
    user = str(user_name or DEFAULT_USER_NAME).strip() or DEFAULT_USER_NAME
    target = os.path.join(get_logging_root(), user, get_lens_export_plugin_name(), time_tag)
    os.makedirs(target, exist_ok=True)
    return target
