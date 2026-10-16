import contextlib
import io
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import lens_safe_ops as ops
from test_lens_safe_ops import synthetic_pem


class EntryNormalizationContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.pem = synthetic_pem()

    def entry(self, label="Synthetic login label", separator=":", newline="\n"):
        return ("host: example.invalid\nport: 2222\n" + label + separator
                + "synthetic_user\n" + self.pem).replace("\n", newline)

    def test_changes_only_confirmed_label_and_preserves_key(self):
        source = self.entry()
        normalized = ops.normalize_confirmed_username_label_text(source, confirmed_label="Synthetic login label")
        self.assertEqual(normalized, source.replace("Synthetic login label", "username", 1))
        self.assertTrue(normalized.endswith(self.pem))
        secrets = ops.parse_entry(normalized)
        self.assertEqual(secrets.field("username"), "synthetic_user")
        secrets.close()


    def test_crlf_tabs_whitespace_and_separators_are_preserved(self):
        for separator in [":", "=", "："]:
            with self.subTest(separator=separator):
                source = self.entry("\tSynthetic login label \t", separator, "\r\n")
                expected = source.replace("Synthetic login label", "username", 1)
                self.assertEqual(ops.normalize_confirmed_username_label_text(source, confirmed_label="Synthetic login label"), expected)

    def test_more_than_one_unknown_field_is_rejected(self):
        with self.assertRaises(ops.SafeFailure):
            ops.normalize_confirmed_username_label_text("unknown: synthetic\n" + self.entry())

    def test_existing_username_is_not_overwritten(self):
        with self.assertRaises(ops.SafeFailure):
            ops.normalize_confirmed_username_label_text("username: synthetic_other\n" + self.entry())

    def test_missing_host_invalid_username_and_malformed_key_are_rejected(self):
        sources = [self.entry().replace("host: example.invalid\n", ""),
                   self.entry().replace("synthetic_user", "bad;command"),
                   self.entry().replace("-----END", "-----BROKEN")]
        for source in sources:
            with self.assertRaises(ops.SafeFailure):
                ops.normalize_confirmed_username_label_text(source, confirmed_label="Synthetic login label")

    def test_json_and_ssh_command_are_not_reinterpreted(self):
        for source in ['{"host":"example.invalid","mystery":"synthetic_user"}',
                       "ssh synthetic_user@example.invalid\n" + self.entry()]:
            with self.assertRaises(ops.SafeFailure):
                ops.normalize_confirmed_username_label_text(source, confirmed_label="Synthetic login label")

    def test_atomic_write_is_private_and_leaves_no_extra_file(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic-entry"
            source = self.entry(newline="\r\n")
            candidate = ops.normalize_confirmed_username_label_text(source, confirmed_label="Synthetic login label")
            path.write_bytes(source.encode())
            path.chmod(0o600)
            self.assertTrue(ops._replace_entry_text(path, source, candidate))
            self.assertEqual(path.read_bytes(), candidate.encode())
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertEqual(len(list(Path(directory).iterdir())), 1)

    def test_failed_replace_preserves_original_and_cleans_temp(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic-entry"
            source = self.entry()
            candidate = ops.normalize_confirmed_username_label_text(source, confirmed_label="Synthetic login label")
            path.write_bytes(source.encode())
            path.chmod(0o600)
            with patch.object(ops.os, "replace", side_effect=OSError("synthetic failure")):
                with self.assertRaises(ops.SafeFailure):
                    ops._replace_entry_text(path, source, candidate)
            self.assertEqual(path.read_bytes(), source.encode())
            self.assertEqual(len(list(Path(directory).iterdir())), 1)

    def test_changed_wide_permission_and_symlink_entries_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic-entry"
            link = Path(directory) / "synthetic-link"
            source = self.entry()
            candidate = ops.normalize_confirmed_username_label_text(source, confirmed_label="Synthetic login label")
            path.write_bytes(source.encode())
            path.chmod(0o600)
            with self.assertRaises(ops.SafeFailure):
                ops._replace_entry_text(path, source + "\n", candidate)
            path.chmod(0o644)
            with self.assertRaises(ops.SafeFailure):
                ops._replace_entry_text(path, source, candidate)
            path.chmod(0o600)
            link.symlink_to(path)
            with self.assertRaises(ops.SafeFailure):
                ops._replace_entry_text(link, source, candidate)

    def test_project_operation_is_closed_and_never_connects(self):
        source = self.entry()
        with patch.object(ops, "_load_project_text", return_value=source), \
             patch.object(ops, "_replace_entry_text", return_value=True) as replace, \
             patch.object(ops, "run_preflight", side_effect=AssertionError("must not connect")):
            result = ops.normalize_project_username_label(human_confirmed_unknown_username=True)
        self.assertTrue(result["ok"])
        self.assertFalse(result["networkAttempted"])
        self.assertEqual(set(result), {"ok", "entryLabelNormalized", "valuesPreserved",
                                      "privateKeyPreserved", "directorySyncVerified", "networkAttempted", "errorClass"})
        self.assertEqual(replace.call_count, 1)

    def test_project_failure_suppresses_raw_exception(self):
        for error in [ops.SafeFailure("normalization_precondition_failed"),
                      RuntimeError("synthetic secret that must be suppressed")]:
            with patch.object(ops, "_load_project_text", side_effect=error):
                result = ops.normalize_project_username_label(human_confirmed_unknown_username=True)
            self.assertFalse(result["ok"])
            self.assertFalse(result["networkAttempted"])
            self.assertNotIn("synthetic secret", str(result))

    def test_unconfirmed_note_labels_are_never_reinterpreted(self):
        for label in ["备注", "deployment-note", "billing-contact"]:
            with self.assertRaises(ops.SafeFailure):
                ops.normalize_confirmed_username_label_text(self.entry(label))

    def test_confirmation_must_match_exact_label(self):
        with self.assertRaises(ops.SafeFailure):
            ops.normalize_confirmed_username_label_text(
                self.entry(), confirmed_label="Different synthetic label")

    def test_project_defaults_to_no_read_no_mutation(self):
        with patch.object(ops, "_load_project_text") as read, \
             patch.object(ops, "_replace_entry_text") as write:
            result = ops.normalize_project_username_label()
        self.assertFalse(result["ok"])
        read.assert_not_called()
        write.assert_not_called()

    def test_concurrent_locked_update_is_rejected_and_clean(self):
        import fcntl
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic-entry"
            source = self.entry()
            candidate = ops.normalize_confirmed_username_label_text(
                source, confirmed_label="Synthetic login label")
            path.write_bytes(source.encode())
            path.chmod(0o600)
            with path.open("rb") as handle:
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                with self.assertRaises(ops.SafeFailure):
                    ops._replace_entry_text(path, source, candidate)
            self.assertEqual(path.read_bytes(), source.encode())
            self.assertEqual(len(list(Path(directory).iterdir())), 1)

    def test_content_change_during_staging_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic-entry"
            source = self.entry()
            changed = source.replace("synthetic_user", "synthetic_other")
            candidate = ops.normalize_confirmed_username_label_text(
                source, confirmed_label="Synthetic login label")
            path.write_bytes(source.encode())
            path.chmod(0o600)
            original_fchmod = ops.os.fchmod
            def change_during_staging(descriptor, mode):
                original_fchmod(descriptor, mode)
                path.write_bytes(changed.encode())
            with patch.object(ops.os, "fchmod", side_effect=change_during_staging):
                with self.assertRaises(ops.SafeFailure):
                    ops._replace_entry_text(path, source, candidate)
            self.assertEqual(path.read_bytes(), changed.encode())
            self.assertEqual(len(list(Path(directory).iterdir())), 1)

    def test_last_stage_writer_observes_exclusive_entry_lock(self):
        import fcntl
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic-entry"
            source = self.entry()
            candidate = ops.normalize_confirmed_username_label_text(
                source, confirmed_label="Synthetic login label")
            path.write_bytes(source.encode())
            path.chmod(0o600)
            original_replace = ops.os.replace
            blocked = []
            def cooperating_writer_then_replace(*args, **kwargs):
                with path.open("r+b") as handle:
                    try:
                        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except BlockingIOError:
                        blocked.append(True)
                    else:
                        self.fail("exclusive entry lock must reject the other writer")
                return original_replace(*args, **kwargs)
            with patch.object(ops.os, "replace", side_effect=cooperating_writer_then_replace):
                self.assertTrue(ops._replace_entry_text(path, source, candidate))
            self.assertEqual(blocked, [True])
            self.assertEqual(path.read_bytes(), candidate.encode())

    def test_writable_or_symlink_parent_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            parent = root / "synthetic-parent"
            parent.mkdir(mode=0o700)
            path = parent / "synthetic-entry"
            source = self.entry()
            candidate = ops.normalize_confirmed_username_label_text(
                source, confirmed_label="Synthetic login label")
            path.write_bytes(source.encode())
            path.chmod(0o600)
            parent.chmod(0o777)
            with self.assertRaises(ops.SafeFailure):
                ops._replace_entry_text(path, source, candidate)
            parent.chmod(0o700)
            link = root / "synthetic-parent-link"
            link.symlink_to(parent, target_is_directory=True)
            with self.assertRaises(ops.SafeFailure):
                ops._replace_entry_text(link / path.name, source, candidate)

    def test_post_commit_sync_failure_reports_verified_partial_state(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "synthetic-entry"
            source = self.entry()
            candidate = ops.normalize_confirmed_username_label_text(
                source, confirmed_label="Synthetic login label")
            path.write_bytes(source.encode())
            path.chmod(0o600)
            original_sync = ops.os.fsync
            calls = []
            def fail_directory_sync(descriptor):
                calls.append(True)
                if len(calls) == 2:
                    raise OSError("synthetic sync failure")
                return original_sync(descriptor)
            with patch.object(ops, "_entry_path", return_value=path), \
                 patch.object(ops, "_load_project_text", return_value=source), \
                 patch.object(ops.os, "fsync", side_effect=fail_directory_sync):
                result = ops.normalize_project_username_label(human_confirmed_unknown_username=True)
            self.assertFalse(result["ok"])
            self.assertTrue(result["entryLabelNormalized"])
            self.assertTrue(result["valuesPreserved"])
            self.assertTrue(result["privateKeyPreserved"])
            self.assertFalse(result["directorySyncVerified"])
            self.assertEqual(result["errorClass"], "normalization_durability_unconfirmed")
            self.assertEqual(path.read_bytes(), candidate.encode())
            self.assertEqual(len(list(Path(directory).iterdir())), 1)


if __name__ == "__main__":
    unittest.main()
