import tempfile
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import lens_safe_ops as ops
from test_lens_safe_ops import synthetic_pem


class MultilineEntryContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pem = synthetic_pem()

    def entry(self, heading="SSH 私钥（PEM）", newline="\n"):
        return ("host:\nexample.invalid\nport:\n2222\n" + heading + ":\n" + self.pem).replace("\n", newline)

    def normalize(self, source):
        return ops.normalize_confirmed_multiline_entry_text(source, confirmed_username="synthetic_user")

    def test_labels_next_line_values_and_key_heading_are_normalized(self):
        source = self.entry()
        candidate = self.normalize(source)
        secrets = ops.parse_entry(candidate)
        self.assertEqual(secrets.field("host"), "example.invalid")
        self.assertEqual(secrets.field("port"), 2222)
        self.assertEqual(secrets.field("username"), "synthetic_user")
        secrets.close()
        self.assertTrue(candidate.endswith(self.pem))

    def test_crlf_private_key_bytes_are_preserved(self):
        source = self.entry(newline="\r\n")
        self.assertTrue(self.normalize(source).endswith(self.pem.replace("\n", "\r\n")))

    def test_no_confirmation_is_rejected(self):
        with self.assertRaises(ops.SafeFailure):
            ops.normalize_confirmed_multiline_entry_text(self.entry())
        with patch.object(ops, "_load_project_text") as read:
            self.assertFalse(ops.normalize_project_confirmed_superuser_entry()["ok"])
        read.assert_not_called()

    def test_unfamiliar_empty_key_heading_uses_only_validated_pem_structure(self):
        candidate = self.normalize(self.entry('Connection material'))
        self.assertTrue(candidate.endswith(self.pem))
        secrets = ops.parse_entry(candidate)
        self.assertEqual(secrets.field('host'), 'example.invalid')
        self.assertEqual(secrets.field('port'), 2222)
        self.assertEqual(secrets.field('username'), 'synthetic_user')
        secrets.close()

    def test_unknown_notes_duplicate_fields_and_missing_values_are_rejected(self):
        sources = [
            'host:\nexample.invalid\n' + self.entry(),
            self.entry().replace('port:\n2222\n', 'port:\n'),
            self.entry() + '\nunknown: value\n',
            self.entry().replace('SSH 私钥（PEM）:', 'unknown: inline-value'),
            self.entry('password'),
            self.entry().replace('SSH 私钥（PEM）:', 'unknown:\nnon-key-value\nother:'),
        ]
        for source in sources:
            with self.assertRaises(ops.SafeFailure):
                self.normalize(source)

    def test_key_heading_requires_complete_actual_pem(self):
        for source in [self.entry().replace("-----END", "-----BROKEN"),
                       self.entry().replace(self.pem, "synthetic_user\n")]:
            with self.assertRaises(ops.SafeFailure):
                self.normalize(source)

    def test_existing_different_identity_and_username_injection_are_rejected(self):
        source = "username:\nsynthetic_other\n" + self.entry()
        with self.assertRaises(ops.SafeFailure):
            self.normalize(source)
        with self.assertRaises(ops.SafeFailure):
            ops.normalize_confirmed_multiline_entry_text(self.entry(), confirmed_username="bad;command")

    def test_project_wrapper_only_uses_explicitly_confirmed_superuser(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic-entry"
            source = self.entry()
            path.write_bytes(source.encode())
            path.chmod(0o600)
            with patch.object(ops, "_load_project_text", return_value=source), \
                 patch.object(ops, "_entry_path", return_value=path), \
                 patch.object(ops.pwd, "getpwuid", return_value=SimpleNamespace(pw_name="synthetic_user")), \
                 patch.object(ops, "run_preflight", side_effect=AssertionError("must not connect")):
                result = ops.normalize_project_confirmed_superuser_entry(human_confirmed_superuser=True)
            self.assertTrue(result["ok"])
            self.assertTrue(result["usernameAdded"])
            self.assertFalse(result["networkAttempted"])
            self.assertTrue(path.read_bytes().endswith(self.pem.encode()))
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(len(list(Path(directory).iterdir())), 1)

    def test_raw_local_identity_exception_is_suppressed(self):
        with patch.object(ops, "_load_project_text", return_value=self.entry()), \
             patch.object(ops.pwd, "getpwuid", side_effect=RuntimeError("synthetic secret")):
            result = ops.normalize_project_confirmed_superuser_entry(human_confirmed_superuser=True)
        self.assertFalse(result["ok"])
        self.assertNotIn("synthetic secret", str(result))


if __name__ == "__main__":
    unittest.main()
