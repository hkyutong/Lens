"""Read-only schema inventory using the project's trusted connection boundary."""

import json
import subprocess
import types
from pathlib import Path

import lens_release_readiness as readiness


SCHEMA_BOOLS = frozenset((
    "schemaInventoryChecked", "schemaOnlyKnownAdditions", "runtimePnpmCompatible",
    "runtimeNpmPresent", "runtimeArchiveToolPresent", "runtimeDumpToolPresent",
))
SCHEMA_COUNTS = frozenset((
    "schemaMissingTableCount", "schemaMissingColumnCount",
    "schemaIncompatibleColumnCount", "schemaUnexpectedAdditionCount",
))


def extended_runtime(service_root):
    """Build an isolated variant; do not change the existing probe's globals."""
    helper = Path(__file__).with_name("lens_schema_inventory.cjs")
    request = {"mode": "extend", "serviceRoot": str(service_root),
               "program": readiness.NODE_PROGRAM}
    completed = subprocess.run(
        ["node", str(helper)], input=json.dumps(request), text=True,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=45,
    )
    if completed.returncode or len(completed.stdout) > 2_000_000:
        raise ValueError("schema_inventory_unavailable")
    payload = json.loads(completed.stdout)
    if set(payload) != {"program", "tableCount", "columnCount"}:
        raise ValueError("schema_inventory_unavailable")
    if not isinstance(payload["program"], str) or not payload["program"]:
        raise ValueError("schema_inventory_unavailable")
    namespace = dict(readiness.__dict__)
    namespace["NODE_PROGRAM"] = payload["program"]
    namespace["BOOL_FIELDS"] = readiness.BOOL_FIELDS | SCHEMA_BOOLS
    namespace["COUNT_FIELDS"] = readiness.COUNT_FIELDS | SCHEMA_COUNTS
    for name in ("parse_readiness", "remote_program", "run_release_readiness"):
        original = getattr(readiness, name)
        clone = types.FunctionType(original.__code__, namespace, name,
                                   original.__defaults__, original.__closure__)
        clone.__kwdefaults__ = original.__kwdefaults__
        namespace[name] = clone
    return namespace


def run_schema_readiness(secrets, service_root, *, host_key_reviewed=False):
    runtime = extended_runtime(service_root)
    return runtime["run_release_readiness"](
        secrets, host_key_reviewed=host_key_reviewed,
    )
