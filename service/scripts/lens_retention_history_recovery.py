"""Independent, memory-only decoding of a private retention archive.

The caller authenticates the archive and its snapshot binding. This process
recovers typed historical cells without reading original historical snapshots,
writing files, opening databases, or returning recovered business content.
"""
import base64
import datetime
import hashlib
import json
import math
import re
import sys

_MAX_BYTES = 16 * 1024 * 1024
_MAX_ROWS = 1000000


def _closed(ok=False, schema=0, versions=0, rows=0, sources=0):
    return dict(ok=ok, schema_count=schema, row_version_count=versions,
                row_count=rows, source_count=sources)


def _keys(value, expected):
    if type(value) is not dict or set(value) != set(expected):
        raise ValueError()


def _decode_cell(cell):
    if type(cell) is not list or not cell or type(cell[0]) is not str:
        raise ValueError()
    kind = cell[0]
    if kind == "null" and len(cell) == 1:
        return (kind, None)
    if len(cell) != 2:
        raise ValueError()
    value = cell[1]
    if kind == "boolean" and type(value) is bool:
        return (kind, value)
    if type(value) is not str:
        raise ValueError()
    if kind == "string":
        return (kind, value)
    if kind == "buffer" and re.fullmatch(r"(?:[a-f0-9]{2})*", value):
        return (kind, bytes.fromhex(value))
    if kind == "bigint" and re.fullmatch(r"-?(?:0|[1-9]\d*)", value):
        return (kind, int(value))
    if kind == "number" and re.fullmatch(r"-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?", value):
        number = float(value)
        if math.isfinite(number):
            return (kind, number)
    if kind == "date" and re.fullmatch(r"\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z", value):
        return (kind, datetime.datetime.fromisoformat(value[:-1] + "+00:00"))
    raise ValueError()


def inspect_payload(payload):
    """Only this closed summary may leave the controlled process."""
    try:
        _keys(payload, {"archive", "sha256"})
        if type(payload["archive"]) is not str or len(payload["archive"]) > (_MAX_BYTES * 4 // 3 + 8):
            raise ValueError()
        raw = base64.b64decode(payload["archive"], validate=True)
        if len(raw) > _MAX_BYTES or hashlib.sha256(raw).hexdigest() != payload["sha256"]:
            raise ValueError()
        value = json.loads(raw)
        _keys(value, {"version", "baseManifestHash", "databaseFingerprint", "sourceBindings", "tables", "contentHash"})
        if type(value["version"]) is not int or value["version"] != 1:
            raise ValueError()
        sources = value["sourceBindings"]
        if type(sources) is not list or len(sources) > 1024 or any(type(s) is not str or not re.fullmatch(r"[a-f0-9]{64}", s) for s in sources):
            raise ValueError()
        if len(set(sources)) != len(sources) or type(value["tables"]) is not list or len(value["tables"]) > 1024:
            raise ValueError()
        restored = []
        versions = rows = 0
        for table in value["tables"]:
            _keys(table, {"name", "columns", "create", "structure", "rows"})
            if any(type(table[k]) is not str or not table[k] for k in ("name", "create", "structure")):
                raise ValueError()
            if type(table["columns"]) is not list or len(table["columns"]) > 1024 or type(table["rows"]) is not list:
                raise ValueError()
            for column in table["columns"]:
                _keys(column, {"name", "type", "charset"})
                if type(column["name"]) is not str or type(column["type"]) is not str or (column["charset"] is not None and type(column["charset"]) is not str):
                    raise ValueError()
            restored_rows = []
            for row in table["rows"]:
                _keys(row, {"data", "count"})
                if type(row["data"]) is not str or type(row["count"]) is not int or not 1 <= row["count"] <= _MAX_ROWS:
                    raise ValueError()
                encoded = json.loads(row["data"])
                if type(encoded) is not list or len(encoded) != len(table["columns"]):
                    raise ValueError()
                restored_rows.append((row["count"], tuple(_decode_cell(cell) for cell in encoded)))
                versions += 1
                rows += row["count"]
                if versions > _MAX_ROWS or rows > _MAX_ROWS:
                    raise ValueError()
            restored.append((table["name"], table["create"], table["columns"], restored_rows))
        result = _closed(True, len(restored), versions, rows, len(sources))
        restored.clear()
        return result
    except BaseException:
        return _closed()


def main():
    result = _closed()
    try:
        raw = sys.stdin.buffer.read(_MAX_BYTES * 2 + 1)
        if len(raw) <= _MAX_BYTES * 2:
            result = inspect_payload(json.loads(raw))
    except BaseException:
        pass
    sys.stdout.write(json.dumps(result, separators=(",", ":")))


if __name__ == "__main__":
    main()
