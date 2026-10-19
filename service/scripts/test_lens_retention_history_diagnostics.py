"""Independent archive decoding and closed failure diagnostics use synthetic data."""

import base64
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import unittest


DIAGNOSTIC_DECODER = Path(__file__).with_name("lens_retention_history_recovery.py")
DIAGNOSTIC_SPEC = importlib.util.spec_from_file_location("history_decoder", DIAGNOSTIC_DECODER)
diagnostic_decoder = importlib.util.module_from_spec(DIAGNOSTIC_SPEC)
DIAGNOSTIC_SPEC.loader.exec_module(diagnostic_decoder)


def diagnostic_archive_payload(version=1):
    value = {
        "version": version,
        "baseManifestHash": "a" * 64,
        "databaseFingerprint": "b" * 64,
        "sourceBindings": ["c" * 64],
        "contentHash": "d" * 64,
        "tables": [{
            "name": "synthetic_table", "create": "synthetic schema",
            "structure": "synthetic structure",
            "columns": [{"name": "value", "type": "text", "charset": None}],
            "rows": [{"data": json.dumps([["string", "synthetic value"]]), "count": 2}],
        }],
    }
    if version == 2:
        data = b"synthetic artifact"
        value["artifacts"] = [{"name": "synthetic/file.txt", "kind": "file", "mode": 0o600,
                               "data": base64.b64encode(data).decode("ascii"),
                               "sha256": hashlib.sha256(data).hexdigest()}]
    return value


def diagnostic_envelope(value):
    raw = json.dumps(value).encode()
    return {"archive": base64.b64encode(raw).decode("ascii"),
            "sha256": hashlib.sha256(raw).hexdigest()}


class HistoryDecoderDiagnosticTests(unittest.TestCase):
    def test_old_and_artifact_archives_preserve_success_contract(self):
        expected = dict(ok=True, schema_count=1, row_version_count=1, row_count=2, source_count=1)
        for version in (1, 2):
            with self.subTest(version=version):
                self.assertEqual(diagnostic_decoder.inspect_payload(diagnostic_envelope(diagnostic_archive_payload(version))), expected)
                self.assertEqual(diagnostic_decoder.inspect_payload(diagnostic_envelope(diagnostic_archive_payload(version)), diagnostic=True), expected)

    def test_default_failure_contract_remains_unchanged(self):
        self.assertEqual(diagnostic_decoder.inspect_payload({}), diagnostic_decoder._closed())

    def test_cli_recovers_archive_above_previous_limit(self):
        value = diagnostic_archive_payload()
        value["tables"][0]["rows"][0]["data"] = json.dumps([["string", "s" * (16 * 1024 * 1024)]])
        child = subprocess.run([sys.executable, str(DIAGNOSTIC_DECODER)], input=json.dumps(diagnostic_envelope(value)).encode(),
                               capture_output=True, check=True, timeout=15)
        self.assertEqual(json.loads(child.stdout),
                         dict(ok=True, schema_count=1, row_version_count=1, row_count=2, source_count=1))
        self.assertEqual(child.stderr, b"")

    def test_failure_diagnostics_are_fixed_and_contain_no_input(self):
        cases = []
        for stage in ("source_bindings", "table_schema", "column_schema", "row_schema", "row_data", "cells", "artifacts"):
            value = diagnostic_archive_payload(2)
            if stage == "source_bindings":
                value["sourceBindings"] = ["synthetic-private-marker"]
            elif stage == "table_schema":
                value["tables"][0]["create"] = None
            elif stage == "column_schema":
                value["tables"][0]["columns"][0]["charset"] = {}
            elif stage == "row_schema":
                value["tables"][0]["rows"][0]["count"] = -1
            elif stage == "row_data":
                value["tables"][0]["rows"][0]["data"] = "synthetic-private-marker"
            elif stage == "cells":
                value["tables"][0]["rows"][0]["data"] = json.dumps([["unknown", "synthetic-private-marker"]])
            else:
                value["artifacts"][0]["sha256"] = "synthetic-private-marker"
            cases.append((stage, diagnostic_envelope(value)))
        for stage, payload in cases:
            with self.subTest(stage=stage):
                result = diagnostic_decoder.inspect_payload(payload, diagnostic=True)
                self.assertEqual(result, {**diagnostic_decoder._closed(), "failure_stage": stage})
                self.assertNotIn("synthetic-private-marker", json.dumps(result))

    def test_cli_only_returns_closed_failure_fields(self):
        child = subprocess.run([sys.executable, str(DIAGNOSTIC_DECODER)], input=b"{}", capture_output=True, check=True)
        self.assertEqual(json.loads(child.stdout), {**diagnostic_decoder._closed(), "failure_stage": "input"})
        self.assertEqual(child.stderr, b"")


if __name__ == "__main__":
    unittest.main()
