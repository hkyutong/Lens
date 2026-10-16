"""Synthetic fixtures only. No credentials, runtime configuration or network IO."""

import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import tempfile
import unittest
from unittest import mock

import lens_release_transaction as tx


class TransactionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="lens-transaction-test-",
                                                 dir=Path(tempfile.gettempdir()).resolve())
        self.root = Path(self.temp.name)
        self.source, self.target, self.bundle = (self.root / n for n in ("source", "target", "bundle"))
        for directory in (self.source, self.target, self.bundle):
            directory.mkdir()
        self.backup = self.bundle / "files"
        self.roots = ("service", "web/dist")
        self.protected = ("service/member-content",)
        self.old = {
            "service/main.py": b"synthetic old program\x00\xff\n",
            "web/dist/index.html": b"<main>synthetic old page</main>\n",
            "web/dist/assets/old.js": b"synthetic old asset\n",
        }
        self.new = {
            "service/main.py": b"synthetic new program\x00\x80\n",
            "service/newpkg/worker.py": b"synthetic added module\n",
            "web/dist/index.html": b"<main>synthetic new page</main>\n",
            "web/dist/assets/new.js": b"synthetic new asset\n",
        }
        self.persistent = {
            "service/uploads/member.bin": b"synthetic member bytes\x00\xff",
            "service/config.ini": b"synthetic configuration only",
            "service/logs/activity.log": b"synthetic log only",
            "service/member-content/retained.txt": b"synthetic retained content",
            ".other-release/evidence.bin": b"synthetic unrelated evidence",
        }
        for name, data in {**self.old, **self.persistent}.items():
            self.write(self.target, name, data)
        for name, data in self.new.items():
            self.write(self.source, name, data)
        os.chmod(self.target / "service/main.py", 0o751)
        os.chmod(self.source / "service/main.py", 0o750)
        self.manifest = tuple(tx.ManifestEntry(p if p in self.new else None, p)
                              for p in sorted(set(self.old) | set(self.new)))
        self.initial = self.snapshot(self.target)

    def tearDown(self):
        self.temp.cleanup()

    @staticmethod
    def write(root, relative, contents):
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(contents)

    @staticmethod
    def snapshot(root):
        return {str(p.relative_to(root)): (p.read_bytes(), stat.S_IMODE(p.stat().st_mode))
                for p in root.rglob("*") if p.is_file() and not p.is_symlink()}

    def plan(self, **overrides):
        params = dict(release_id="a1" * 16,
                      baseline=tx.capture_baseline(self.target, [e.target for e in self.manifest],
                                                   artifact_roots=self.roots, protected_roots=self.protected),
                      backup_root=self.backup, artifact_roots=self.roots,
                      protected_roots=self.protected)
        params.update(overrides)
        return tx.prepare_release_plan(self.source, self.target, self.manifest, **params)

    @staticmethod
    def fail(event, index=None):
        def injector(actual, current):
            if actual == event and (index is None or current == index):
                raise OSError("synthetic private exception detail")
        return injector

    def assert_original(self):
        self.assertEqual(self.snapshot(self.target), self.initial)
        self.assertFalse((self.target / "service/newpkg").exists())
        self.assertFalse(any(self.target.glob(".lens-txn-*")))

    def assert_new(self):
        for name, data in self.new.items():
            self.assertEqual((self.target / name).read_bytes(), data)
        self.assertFalse((self.target / "web/dist/assets/old.js").exists())
        for name, data in self.persistent.items():
            self.assertEqual((self.target / name).read_bytes(), data)
        self.assertEqual(stat.S_IMODE((self.target / "service/main.py").stat().st_mode), 0o750)

    def commit(self):
        result = tx.execute_release(self.plan())
        self.assertTrue(result.ok, result.error)
        self.assert_new()
        return result

    def test_success_bytes_modes_persistence_and_backup(self):
        source_before = self.snapshot(self.source)
        result = self.commit()
        self.assertEqual(result.changed_files, len(self.manifest))
        self.assertTrue(result.backup_verified)
        self.assertTrue(tx.verify_backup(self.backup).ok)
        self.assertEqual(self.snapshot(self.source), source_before)
        self.assertFalse(any(self.target.glob(".lens-txn-*")))
        self.assertTrue((self.target / ".other-release/evidence.bin").exists())

    def test_root_and_nested_static_entrypoints_are_replaced_last(self):
        self.write(self.source, "index.html", b"synthetic root entry point")
        self.roots = (*self.roots, "index.html")
        self.manifest = (*self.manifest, tx.ManifestEntry("index.html", "index.html"))
        plan = self.plan()
        replaced = []
        def observe(event, index):
            if event == "after_swap":
                replaced.append(plan.entries[index].target)
                self.assertTrue(tx.verify_backup(self.backup).ok)
        result = tx.execute_release(plan, fault_injector=observe)
        self.assertTrue(result.ok)
        first_index = next(i for i, path in enumerate(replaced) if Path(path).name == "index.html")
        self.assertTrue(all(Path(path).name != "index.html" for path in replaced[:first_index]))
        self.assertTrue(all(Path(path).name == "index.html" for path in replaced[first_index:]))
        self.assertEqual(replaced[first_index:], ["index.html", "web/dist/index.html"])

    def test_restore_from_bundle_without_source(self):
        self.commit()
        shutil.rmtree(self.source)
        expected = tx.capture_baseline(self.target, [e.target for e in self.manifest], artifact_roots=self.roots)
        result = tx.restore_backup(self.backup, self.target, expected_current=expected)
        self.assertTrue(result.ok, result.error)
        self.assertEqual(self.snapshot(self.target), self.initial)
        self.assertTrue(tx.verify_backup(self.backup).ok)

    def test_explicit_restore_is_idempotent(self):
        self.commit()
        self.assertTrue(tx.restore_backup(self.backup, self.target).ok)
        result = tx.restore_backup(self.backup, self.target)
        self.assertTrue(result.ok)
        self.assertEqual(result.restored_files, 0)
        self.assertEqual(self.snapshot(self.target), self.initial)

    def test_noop_release(self):
        self.manifest = (tx.ManifestEntry("service/main.py", "service/main.py"),)
        self.write(self.source, "service/main.py", self.old["service/main.py"])
        os.chmod(self.source / "service/main.py", 0o751)
        result = tx.execute_release(self.plan())
        self.assertTrue(result.ok)
        self.assertEqual(result.changed_files, 0)
        self.assert_original()

    def test_missing_explicit_deletion_is_noop(self):
        self.manifest = (tx.ManifestEntry(None, "service/missing.py"),)
        result = tx.execute_release(self.plan())
        self.assertTrue(result.ok)
        self.assertEqual(result.changed_files, 0)
        self.assertTrue(tx.restore_backup(self.backup, self.target).ok)
        self.assert_original()

    def test_baseline_changed_before_prepare(self):
        baseline = tx.capture_baseline(self.target, [e.target for e in self.manifest], artifact_roots=self.roots)
        self.write(self.target, "service/main.py", b"synthetic concurrent bytes")
        with self.assertRaises(tx.TransactionError) as error:
            self.plan(baseline=baseline)
        self.assertEqual(str(error.exception), "baseline_changed")
        self.assertFalse(self.backup.exists())

    def test_baseline_changed_after_prepare(self):
        plan = self.plan()
        self.write(self.target, "service/main.py", b"synthetic concurrent bytes")
        changed = self.snapshot(self.target)
        result = tx.execute_release(plan)
        self.assertEqual(result.error, "baseline_changed")
        self.assertFalse(result.rollback_attempted)
        self.assertEqual(self.snapshot(self.target), changed)
        self.assertFalse(self.backup.exists())

    def test_source_changed_after_prepare(self):
        plan = self.plan()
        self.write(self.source, "service/main.py", b"synthetic changed source")
        result = tx.execute_release(plan)
        self.assertEqual(result.error, "source_changed")
        self.assertTrue(result.backup_verified)
        self.assert_original()

    def test_backup_copy_failure(self):
        result = tx.execute_release(self.plan(), fault_injector=self.fail("backup_copy", 0))
        self.assertEqual(result.error, "backup_failed")
        self.assertFalse(result.backup_verified)
        self.assertFalse(result.rollback_attempted)
        self.assertTrue(result.evidence_retained)
        self.assert_original()

    def test_partial_backup_write_failure_keeps_original_files(self):
        actual_write = os.write
        armed, writes = False, 0
        def arm(event, index):
            nonlocal armed
            if event == "backup_copy" and index == 0:
                armed = True
        def partial(fd, data):
            nonlocal writes
            if armed:
                writes += 1
                if writes > 1:
                    raise OSError("synthetic partial backup write")
                return actual_write(fd, data[:3])
            return actual_write(fd, data)
        with mock.patch.object(tx.os, "write", side_effect=partial):
            result = tx.execute_release(self.plan(), fault_injector=arm)
        self.assertFalse(result.ok)
        self.assertEqual(result.error, "backup_failed")
        self.assertFalse(tx.verify_backup(self.backup).ok)
        self.assert_original()

    def test_backup_verification_failure(self):
        result = tx.execute_release(self.plan(), fault_injector=self.fail("backup_verify"))
        self.assertFalse(result.ok)
        self.assertFalse(result.backup_verified)
        self.assert_original()

    def test_stage_copy_failure(self):
        result = tx.execute_release(self.plan(), fault_injector=self.fail("stage_copy", 1))
        self.assertEqual(result.error, "copy_failed")
        self.assertTrue(result.backup_verified)
        self.assertFalse(result.rollback_attempted)
        self.assert_original()

    def test_partial_stage_write_failure_cleans_only_own_stage(self):
        actual_write = os.write
        armed, writes = False, 0
        def arm(event, index):
            nonlocal armed
            if event == "stage_copy" and index == 0:
                armed = True
        def partial(fd, data):
            nonlocal writes
            if armed:
                writes += 1
                if writes > 1:
                    raise OSError("synthetic partial stage write")
                return actual_write(fd, data[:3])
            return actual_write(fd, data)
        with mock.patch.object(tx.os, "write", side_effect=partial):
            result = tx.execute_release(self.plan(), fault_injector=arm)
        self.assertEqual(result.error, "copy_failed")
        self.assertTrue(result.backup_verified)
        self.assert_original()

    def test_stage_verification_failure(self):
        result = tx.execute_release(self.plan(), fault_injector=self.fail("stage_verify"))
        self.assertEqual(result.error, "verification_failed")
        self.assert_original()

    def test_stage_byte_corruption_detected(self):
        def corrupt(event, index):
            if event == "stage_verify":
                staged = next(self.target.glob(".lens-txn-*/entry-00000000"))
                staged.write_bytes(b"synthetic corrupt stage")
        result = tx.execute_release(self.plan(), fault_injector=corrupt)
        self.assertEqual(result.error, "verification_failed")
        self.assert_original()

    def test_swap_failure_restores_real_bytes(self):
        result = tx.execute_release(self.plan(), fault_injector=self.fail("swap", 1))
        self.assertEqual(result.error, "swap_failed")
        self.assertTrue(result.rollback_attempted)
        self.assertTrue(result.rollback_succeeded)
        self.assertGreater(result.restored_files, 0)
        self.assert_original()
        self.assertTrue(tx.verify_backup(self.backup).ok)

    def test_interrupted_replace_with_completed_mutation_is_recovered(self):
        actual_replace = os.replace
        injected = False
        def interrupted(source, destination, *args, **kwargs):
            nonlocal injected
            actual_replace(source, destination, *args, **kwargs)
            if isinstance(source, str) and source.startswith("entry-") and not injected:
                injected = True
                raise InterruptedError("synthetic ambiguous syscall")
        with mock.patch.object(tx.os, "replace", side_effect=interrupted):
            result = tx.execute_release(self.plan())
        self.assertTrue(result.rollback_attempted)
        self.assertTrue(result.rollback_succeeded)
        self.assertEqual(result.changed_files, 0)
        self.assertEqual(result.restored_files, 1)
        self.assert_original()

    def test_staged_symlink_cannot_be_installed(self):
        def tamper(event, index):
            if event == "swap" and index == 0:
                staged = next(self.target.glob(".lens-txn-*/entry-00000000"))
                staged.unlink()
                staged.symlink_to(self.source / "service/main.py")
        result = tx.execute_release(self.plan(), fault_injector=tamper)
        self.assertFalse(result.ok)
        self.assertEqual(result.changed_files, 0)
        self.assert_original()

    def test_final_verification_failure_restores_deleted_and_added_files(self):
        result = tx.execute_release(self.plan(), fault_injector=self.fail("target_verify"))
        self.assertEqual(result.error, "verification_failed")
        self.assertTrue(result.rollback_succeeded)
        self.assertEqual(result.restored_files, len(self.manifest))
        self.assert_original()

    def test_restore_copy_failure_preserves_evidence(self):
        self.commit()
        current = self.snapshot(self.target)
        result = tx.restore_backup(self.backup, self.target, fault_injector=self.fail("restore_copy", 0))
        self.assertEqual(result.error, "rollback_failed")
        self.assertTrue(result.manual_intervention)
        self.assertTrue(result.evidence_retained)
        self.assertEqual(self.snapshot(self.target), current)
        self.assertTrue(tx.verify_backup(self.backup).ok)

    def test_payload_changed_after_validation_never_reaches_target(self):
        self.commit()
        before = self.snapshot(self.target)
        def corrupt(event, index):
            if event == "restore_copy" and index == 0:
                next(self.backup.glob("payload-*.bin")).write_bytes(b"synthetic changed payload")
        result = tx.restore_backup(self.backup, self.target, fault_injector=corrupt)
        self.assertFalse(result.ok)
        self.assertTrue(result.manual_intervention)
        self.assertEqual(self.snapshot(self.target), before)

    def test_restore_swap_failure_can_be_retried(self):
        self.commit()
        result = tx.restore_backup(self.backup, self.target, fault_injector=self.fail("restore_swap", 1))
        self.assertEqual(result.error, "rollback_failed")
        self.assertTrue(result.manual_intervention)
        self.assertTrue(tx.verify_backup(self.backup).ok)
        self.assertTrue(tx.restore_backup(self.backup, self.target).ok)
        self.assertEqual(self.snapshot(self.target), self.initial)

    def test_restore_verify_failure_can_be_retried(self):
        self.commit()
        result = tx.restore_backup(self.backup, self.target, fault_injector=self.fail("restore_verify"))
        self.assertTrue(result.manual_intervention)
        self.assertEqual(self.snapshot(self.target), self.initial)
        self.assertTrue(tx.restore_backup(self.backup, self.target).ok)

    def test_automatic_rollback_failure_is_not_hidden(self):
        def fault(event, index):
            if event == "target_verify" or event == "restore_copy":
                raise OSError("synthetic private detail")
        result = tx.execute_release(self.plan(), fault_injector=fault)
        self.assertEqual(result.error, "rollback_failed")
        self.assertTrue(result.rollback_attempted)
        self.assertFalse(result.rollback_succeeded)
        self.assertTrue(result.manual_intervention)
        self.assertTrue(tx.verify_backup(self.backup).ok)
        self.assertTrue(tx.restore_backup(self.backup, self.target).ok)
        self.assertEqual(self.snapshot(self.target), self.initial)

    def test_concurrent_change_before_swaps_is_preserved(self):
        def concurrent(event, index):
            if event == "before_swap":
                self.write(self.target, "service/main.py", b"synthetic concurrent writer")
        result = tx.execute_release(self.plan(), fault_injector=concurrent)
        self.assertEqual(result.error, "baseline_changed")
        self.assertEqual(result.changed_files, 0)
        self.assertEqual((self.target / "service/main.py").read_bytes(), b"synthetic concurrent writer")

    def test_concurrent_change_at_swap_boundary_is_preserved(self):
        def concurrent(event, index):
            if event == "swap" and index == 0:
                self.write(self.target, "service/main.py", b"synthetic concurrent boundary")
        result = tx.execute_release(self.plan(), fault_injector=concurrent)
        self.assertEqual(result.error, "baseline_changed")
        self.assertEqual(result.changed_files, 0)
        self.assertEqual((self.target / "service/main.py").read_bytes(), b"synthetic concurrent boundary")

    def test_concurrent_change_prevents_destructive_rollback(self):
        def concurrent(event, index):
            if event == "after_swap" and index == 0:
                self.write(self.target, "service/main.py", b"synthetic foreign bytes")
                raise OSError("synthetic failure")
        result = tx.execute_release(self.plan(), fault_injector=concurrent)
        self.assertEqual(result.error, "rollback_conflict")
        self.assertTrue(result.manual_intervention)
        self.assertFalse(result.rollback_succeeded)
        self.assertEqual((self.target / "service/main.py").read_bytes(), b"synthetic foreign bytes")
        self.assertTrue(tx.verify_backup(self.backup).ok)

    def test_concurrent_change_during_restore_is_preserved(self):
        self.commit()
        def concurrent(event, index):
            if event == "restore_swap" and index == 0:
                self.write(self.target, "service/main.py", b"synthetic foreign restore bytes")
        result = tx.restore_backup(self.backup, self.target, fault_injector=concurrent)
        self.assertEqual(result.error, "rollback_conflict")
        self.assertEqual((self.target / "service/main.py").read_bytes(), b"synthetic foreign restore bytes")

    def test_unexpected_stage_file_is_retained_and_reported(self):
        def concurrent(event, index):
            if event == "stage_verify":
                self.write(next(self.target.glob(".lens-txn-*")), "unowned-evidence", b"synthetic evidence")
        result = tx.execute_release(self.plan(), fault_injector=concurrent)
        self.assertEqual(result.error, "cleanup_failed")
        self.assertTrue(result.manual_intervention)
        self.assertFalse(result.cleanup_succeeded)
        self.assertTrue(any(self.target.glob(".lens-txn-*/unowned-evidence")))
        self.assert_new()

    def test_backup_payload_corruption_blocks_restore(self):
        self.commit()
        next(self.backup.glob("payload-*.bin")).write_bytes(b"synthetic corrupted backup")
        before = self.snapshot(self.target)
        self.assertFalse(tx.verify_backup(self.backup).ok)
        self.assertFalse(tx.restore_backup(self.backup, self.target).ok)
        self.assertEqual(self.snapshot(self.target), before)

    def test_backup_metadata_corruption_blocks_restore(self):
        self.commit()
        (self.backup / "manifest.json").write_bytes(b"synthetic invalid metadata")
        before = self.snapshot(self.target)
        self.assertFalse(tx.verify_backup(self.backup).ok)
        self.assertFalse(tx.restore_backup(self.backup, self.target).ok)
        self.assertEqual(self.snapshot(self.target), before)

    def test_rehashed_traversal_metadata_is_rejected(self):
        self.commit()
        record = json.loads((self.backup / "manifest.json").read_bytes())
        record["entries"][0]["target"] = "../synthetic-escape"
        raw = json.dumps(record, sort_keys=True, separators=(",", ":")).encode()
        (self.backup / "manifest.json").write_bytes(raw)
        (self.backup / "complete.json").write_text(json.dumps({"manifest_sha256": hashlib.sha256(raw).hexdigest()}))
        self.assertFalse(tx.verify_backup(self.backup).ok)
        self.assertFalse((self.root / "synthetic-escape").exists())

    def test_backup_extra_file_is_rejected(self):
        self.commit()
        (self.backup / "unapproved.bin").write_bytes(b"synthetic unapproved")
        self.assertFalse(tx.verify_backup(self.backup).ok)

    def test_uncommitted_record_after_process_loss_is_retained(self):
        self.commit()
        abandoned = self.backup / (".record-" + "ab" * 8)
        abandoned.write_bytes(b"synthetic interrupted record")
        os.chmod(abandoned, 0o600)
        self.assertTrue(tx.verify_backup(self.backup).ok)
        self.assertTrue(tx.restore_backup(self.backup, self.target).ok)
        self.assertTrue(abandoned.exists())
        self.assertEqual(self.snapshot(self.target), self.initial)

    def test_target_symlink_is_rejected(self):
        leaf = self.target / "service/main.py"
        leaf.unlink()
        leaf.symlink_to(self.source / "service/main.py")
        with self.assertRaises(tx.TransactionError):
            self.plan()
        self.assertTrue(leaf.is_symlink())

    def test_source_symlink_is_rejected(self):
        leaf = self.source / "service/main.py"
        leaf.unlink()
        leaf.symlink_to(self.target / "service/main.py")
        with self.assertRaises(tx.TransactionError):
            self.plan()

    def test_ancestor_symlink_is_rejected(self):
        alias = self.root / "alias"
        alias.symlink_to(self.source, target_is_directory=True)
        baseline = tx.capture_baseline(self.target, [e.target for e in self.manifest], artifact_roots=self.roots)
        with self.assertRaises(tx.TransactionError):
            tx.prepare_release_plan(alias, self.target, self.manifest, release_id="a1" * 16,
                                    baseline=baseline, backup_root=self.backup, artifact_roots=self.roots)

    def test_separate_source_build_allowlist(self):
        self.write(self.source, "build/main.py", b"synthetic mapped build output")
        self.manifest = (tx.ManifestEntry("build/main.py", "service/main.py"),)
        result = tx.execute_release(self.plan(source_artifact_roots=("build",)))
        self.assertTrue(result.ok)
        self.assertEqual((self.target / "service/main.py").read_bytes(), b"synthetic mapped build output")
        self.assertTrue(tx.restore_backup(self.backup, self.target).ok)
        self.assert_original()

    def test_hardlink_is_rejected(self):
        os.link(self.source / "service/main.py", self.source / "service/alias.py")
        with self.assertRaises(tx.TransactionError):
            self.plan()

    def test_fifo_is_rejected_without_opening(self):
        leaf = self.source / "service/main.py"
        leaf.unlink()
        os.mkfifo(leaf)
        with self.assertRaises(tx.TransactionError):
            self.plan()

    def test_manifest_traversal_and_noncanonical_paths_rejected(self):
        for name in ("../escape", "service/../escape", "/escape", "service//main.py", "service/./main.py", "service\\main.py"):
            with self.subTest(case=name):
                self.manifest = (tx.ManifestEntry(name, "service/main.py"),)
                with self.assertRaises(tx.TransactionError):
                    self.plan()

    def test_protected_source_and_targets_are_rejected(self):
        for name in ("service/uploads/user.bin", "service/config.ini", "service/logs/activity.log",
                     "service/member-content/retained.txt", "service/database.sqlite3", "service/.env", "unapproved/app.py"):
            with self.subTest(case=name):
                with self.assertRaises(tx.TransactionError):
                    tx.capture_baseline(self.target, [name], artifact_roots=self.roots,
                                        protected_roots=self.protected)
                self.manifest = (tx.ManifestEntry(name, "service/main.py"),)
                with self.assertRaises(tx.TransactionError):
                    self.plan()

    def test_manifest_duplicate_targets_rejected(self):
        self.manifest = (tx.ManifestEntry("service/main.py", "service/main.py"),
                         tx.ManifestEntry("web/dist/index.html", "service/main.py"))
        with self.assertRaises(tx.TransactionError):
            self.plan(baseline={"service/main.py": hashlib.sha256(self.old["service/main.py"]).hexdigest()})

    def test_existing_bundle_is_never_overwritten(self):
        self.backup.mkdir()
        (self.backup / "retained.bin").write_bytes(b"synthetic retained backup")
        with self.assertRaises(tx.TransactionError):
            self.plan()
        self.assertEqual((self.backup / "retained.bin").read_bytes(), b"synthetic retained backup")

    def test_parent_old_bundle_is_not_enumerated_or_deleted(self):
        older = self.bundle / "older"
        older.mkdir()
        (older / "retained.bin").write_bytes(b"synthetic older backup")
        self.commit()
        self.assertEqual((older / "retained.bin").read_bytes(), b"synthetic older backup")

    def test_restore_target_overlap_rejected(self):
        self.commit()
        before = self.snapshot(self.backup)
        self.assertFalse(tx.restore_backup(self.backup, self.backup).ok)
        self.assertEqual(self.snapshot(self.backup), before)

    def test_restore_expected_current_mismatch_rejected(self):
        self.commit()
        before = self.snapshot(self.target)
        expected = {e.target: None for e in self.manifest}
        result = tx.restore_backup(self.backup, self.target, expected_current=expected)
        self.assertEqual(result.error, "rollback_conflict")
        self.assertEqual(self.snapshot(self.target), before)

    def test_restore_target_symlink_does_not_follow(self):
        self.commit()
        leaf = self.target / "service/main.py"
        leaf.unlink()
        leaf.symlink_to(self.source / "service/main.py")
        source_before = self.snapshot(self.source)
        result = tx.restore_backup(self.backup, self.target)
        self.assertFalse(result.ok)
        self.assertTrue(leaf.is_symlink())
        self.assertEqual(self.snapshot(self.source), source_before)

    def test_closed_result_schema_and_safe_error(self):
        result = tx.execute_release(self.plan(), fault_injector=self.fail("stage_copy"))
        values = result.to_dict()
        self.assertEqual(set(values), {"ok", "phase", "error", "planned_files", "changed_files",
                                      "restored_files", "backup_verified", "rollback_attempted",
                                      "rollback_succeeded", "manual_intervention", "evidence_retained",
                                      "cleanup_succeeded"})
        self.assertNotIn("synthetic private exception detail", json.dumps(values))
        self.assertNotIn(str(self.root), json.dumps(values))
        self.assertEqual(repr(self.plan(backup_root=self.bundle / "second")), "<ReleasePlan>")

    def test_invalid_plan_and_release_identifier(self):
        self.assertEqual(tx.execute_release(object()).error, "invalid_input")
        for value in ("human-label", "../escape", "a" * 15, "G" * 32):
            with self.assertRaises(tx.TransactionError):
                self.plan(release_id=value)


if __name__ == "__main__":
    unittest.main()
