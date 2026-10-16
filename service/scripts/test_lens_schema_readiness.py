import json
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

import lens_release_readiness as readiness
from lens_schema_readiness import extended_runtime, SCHEMA_BOOLS, SCHEMA_COUNTS


class SchemaReadinessTests(unittest.TestCase):
    def helper(self, payload=None, returncode=0):
        if payload is None:
            payload = {"program": "synthetic_program", "tableCount": 2, "columnCount": 3}
        return subprocess.CompletedProcess([], returncode, json.dumps(payload), "")

    def test_original_probe_globals_are_not_changed(self):
        original = (readiness.NODE_PROGRAM, readiness.BOOL_FIELDS, readiness.COUNT_FIELDS)
        with patch("lens_schema_readiness.subprocess.run", return_value=self.helper()):
            variant = extended_runtime(Path("/synthetic/source"))
        self.assertEqual(original, (readiness.NODE_PROGRAM, readiness.BOOL_FIELDS,
                                    readiness.COUNT_FIELDS))
        self.assertEqual(variant["BOOL_FIELDS"], readiness.BOOL_FIELDS | SCHEMA_BOOLS)
        self.assertEqual(variant["COUNT_FIELDS"], readiness.COUNT_FIELDS | SCHEMA_COUNTS)

    def test_helper_input_uses_stdin_without_server_material(self):
        with patch("lens_schema_readiness.subprocess.run", return_value=self.helper()) as run:
            extended_runtime(Path("/synthetic/source"))
        args, kwargs = run.call_args
        self.assertNotIn("synthetic_program", args[0])
        request = json.loads(kwargs["input"])
        self.assertEqual(set(request), {"mode", "serviceRoot", "program"})
        self.assertTrue(kwargs["timeout"] <= 45)
        self.assertEqual(kwargs["stdout"], subprocess.PIPE)
        self.assertEqual(kwargs["stderr"], subprocess.PIPE)

    def test_rejects_failed_helper_without_returning_diagnostics(self):
        completed = self.helper(returncode=1)
        completed.stderr = "synthetic-sensitive-value"
        with patch("lens_schema_readiness.subprocess.run", return_value=completed):
            with self.assertRaisesRegex(ValueError, "^schema_inventory_unavailable$"):
                extended_runtime(Path("/synthetic/source"))

    def test_rejects_unknown_helper_fields(self):
        payload = {"program": "synthetic_program", "tableCount": 2, "columnCount": 3,
                   "unexpected": "synthetic-sensitive-value"}
        with patch("lens_schema_readiness.subprocess.run", return_value=self.helper(payload)):
            with self.assertRaisesRegex(ValueError, "^schema_inventory_unavailable$"):
                extended_runtime(Path("/synthetic/source"))

    def test_rejects_empty_or_non_string_program(self):
        for value in ("", None, True, 7, []):
            with self.subTest(value=value):
                completed = self.helper({"program": value, "tableCount": 2, "columnCount": 3})
                with patch("lens_schema_readiness.subprocess.run", return_value=completed):
                    with self.assertRaisesRegex(ValueError, "^schema_inventory_unavailable$"):
                        extended_runtime(Path("/synthetic/source"))

    def test_extended_remote_python_compiles(self):
        with patch("lens_schema_readiness.subprocess.run", return_value=self.helper()):
            variant = extended_runtime(Path("/synthetic/source"))
        remote = variant["remote_program"]()
        compile(remote, "synthetic_probe", "exec")
        self.assertTrue(all(field in remote for field in SCHEMA_BOOLS | SCHEMA_COUNTS))


if __name__ == "__main__":
    unittest.main()
