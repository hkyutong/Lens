import base64
import hashlib
import json
import unittest
import lens_retention_history_recovery as recovery


def payload(cells=None, count=1):
    cells = cells if cells is not None else [["string", "synthetic"]]
    value = {"version": 1, "baseManifestHash": "a" * 64, "databaseFingerprint": "b" * 64,
             "sourceBindings": ["c" * 64], "tables": [{"name": "synthetic",
             "columns": [{"name": "synthetic", "type": "synthetic", "charset": None} for _ in cells],
             "create": "synthetic schema", "structure": "d" * 64,
             "rows": [{"data": json.dumps(cells), "count": count}]}], "contentHash": "e" * 64}
    raw = json.dumps(value).encode()
    return {"archive": base64.b64encode(raw).decode(), "sha256": hashlib.sha256(raw).hexdigest()}


class MemoryRecoveryTests(unittest.TestCase):
    def test_typed_cells_recover_independently(self):
        cells = [["null"], ["boolean", True], ["string", "synthetic"], ["buffer", "00ff"],
                 ["bigint", "12345678901234567890"], ["number", "-0"],
                 ["date", "2000-01-01T00:00:00.000Z"]]
        result = recovery.inspect_payload(payload(cells, 2))
        self.assertEqual(result, dict(ok=True, schema_count=1, row_version_count=1, row_count=2, source_count=1))
        self.assertFalse("synthetic" in json.dumps(result))

    def test_unknown_cell_type_is_closed(self):
        self.assertEqual(recovery.inspect_payload(payload([["unknown", "synthetic-private"]])), recovery._closed())

    def test_transfer_hash_mismatch_is_closed(self):
        value = payload()
        value["sha256"] = "f" * 64
        self.assertEqual(recovery.inspect_payload(value), recovery._closed())

    def test_unknown_input_field_cannot_be_returned(self):
        value = payload()
        value["synthetic-private"] = "synthetic-private"
        self.assertEqual(recovery.inspect_payload(value), recovery._closed())

    def test_invalid_and_excessive_counts_are_closed(self):
        for count in [True, 0, 1000001]:
            self.assertEqual(recovery.inspect_payload(payload(count=count)), recovery._closed())

    def test_invalid_binary_and_nonfinite_number_are_closed(self):
        for cell in [["buffer", "zz"], ["number", "1e9999"]]:
            self.assertEqual(recovery.inspect_payload(payload([cell])), recovery._closed())
