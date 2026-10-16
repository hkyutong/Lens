"""Synthetic-only transaction and failure/recovery contracts."""
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import lens_academic_inventory as inventory
import lens_academic_transaction as transaction


class AcademicTransactionTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="synthetic-academic-transaction-", dir="/private/tmp")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name).resolve()
        self.stage, self.bundle, self.node, self.academic = [self.base / name for name in ("stage", "bundle", "node", "academic")]
        for root in (self.stage, self.bundle, self.node, self.academic):
            root.mkdir(mode=0o700)
        self.private = self.base / ".lens-academic-storage"
        self.source = self.stage / "artifacts/academic-4.0"
        self.entries = []
        self.original = {}
        for index, role in enumerate(inventory.ARTIFACTS):
            target, source = self.academic / role, self.source / role
            target.parent.mkdir(parents=True, exist_ok=True)
            source.parent.mkdir(parents=True, exist_ok=True)
            original = ("# synthetic original " + str(index) + "\n").encode()
            updated = ("# synthetic updated " + str(index) + "\n").encode()
            target.write_bytes(original)
            source.write_bytes(updated)
            self.original[role] = original
            self.entries.append({"source": "academic-4.0/" + role, "role": "academic", "sha256": hashlib.sha256(updated).hexdigest(), "size": len(updated)})
        marker = self.node / "dist/modules/academic/academic.service.js"
        marker.parent.mkdir(parents=True)
        marker.write_text("// synthetic node source\n")
        self.proc = self.base / "proc"
        for identifier in (10, 11):
            process = self.proc / str(identifier)
            process.mkdir(parents=True)
            (process / "root").symlink_to("/")
            (process / "ns").mkdir()
            (process / "ns/net").symlink_to("synthetic-network")
        (self.proc / "self/ns").mkdir(parents=True)
        (self.proc / "self/ns/net").symlink_to("synthetic-network")
        self.environment = {"PM2_HOME": str(self.base / "manager"), "pm_id": "2"}
        self.python = {
            "identifier": 10, "directory": self.proc / "10", "cwd": str(self.academic),
            "arguments": ("/synthetic/python", "shared_utils/fastapi_stream_server.py"),
            "executable": "/synthetic/python", "parent": 2,
        }
        self.node_process = {"identifier": 11, "directory": self.proc / "11", "cwd": str(self.node), "parent": 2}
        view = inventory._filesystem_path(self.python, self.academic)
        self.runtime = inventory.OpaqueRuntime(self.python, self.academic, view, self.environment, "pm2", (self.environment["PM2_HOME"], "2"))
        self.request = {
            "action": "prepare", "stage": str(self.stage), "bundle": str(self.bundle),
            "release_id": "abc01234" * 4, "node_cwd": str(self.node),
            "private_storage": str(self.node / "private/attachments"), "entries": self.entries,
        }
        self.controller = transaction.AcademicController()
        self.patches = [
            patch.object(inventory, "discover", return_value=([self.runtime], [self.node_process])),
            patch.object(inventory, "_environment", return_value=dict(self.environment)),
            patch.object(inventory, "_manager", return_value=("pm2", (self.environment["PM2_HOME"], "3"))),
            patch.object(inventory, "_listeners", return_value={("127.0.0.1", 9029)}),
        ]
        for item in self.patches:
            item.start()
            self.addCleanup(item.stop)

    def prepare(self):
        result = self.controller.prepare(self.request, self.proc)
        self.assertTrue(result["ok"])
        self.assertEqual(set(result), transaction.FIELDS)
        return result

    def assert_original(self):
        for role, expected in self.original.items():
            self.assertEqual((self.academic / role).read_bytes(), expected)

    def test_prepare_accepts_missing_node_pm_id_with_verified_shared_parent(self):
        self.environment.pop('pm_id', None)
        self.node_process['parent'] = 901
        self.runtime._process['parent'] = 901
        with patch.object(inventory, '_environment', return_value=dict(self.environment)), patch.object(inventory, '_manager', return_value=('unknown', None)):
            self.prepare()
        self.assert_original()

    def test_prepare_rejects_unmanaged_node_with_different_parent(self):
        self.environment.pop('pm_id', None)
        self.node_process['parent'] = 902
        self.runtime._process['parent'] = 901
        with patch.object(inventory, '_environment', return_value=dict(self.environment)), patch.object(inventory, '_manager', return_value=('unknown', None)):
            with self.assertRaises(transaction.AcademicError):
                self.prepare()
        self.assert_original()

    def test_prepare_rejects_missing_node_pm_id_with_conflicting_manager_home(self):
        self.environment.pop('pm_id', None)
        self.environment['PM2_HOME'] = str(self.base / 'different-synthetic-manager')
        self.node_process['parent'] = 901
        self.runtime._process['parent'] = 901
        with patch.object(inventory, '_environment', return_value=dict(self.environment)), patch.object(inventory, '_manager', return_value=('unknown', None)):
            with self.assertRaises(transaction.AcademicError):
                self.prepare()
        self.assert_original()

    def test_prepare_rejects_duplicate_nodes_with_verified_shared_parent(self):
        self.environment.pop('pm_id', None)
        self.node_process['parent'] = 901
        self.runtime._process['parent'] = 901
        duplicate = dict(self.node_process, identifier=902)
        with patch.object(inventory, '_environment', return_value=dict(self.environment)), patch.object(inventory, '_manager', return_value=('unknown', None)), patch.object(
            inventory, 'discover', return_value=([self.runtime], [self.node_process, duplicate])
        ):
            with self.assertRaises(transaction.AcademicError):
                self.prepare()
        self.assert_original()

    def test_apply_verify_restore_preserves_new_business_data(self):
        self.prepare()
        self.assert_original()
        self.assertFalse(self.private.exists())
        self.assertTrue(self.controller.apply()["ok"])
        self.assertTrue(self.controller.verify()["backup_verified"])
        node_config = self.node / transaction.CONFIG_NAME
        academic_config = self.academic / transaction.CONFIG_NAME
        self.assertEqual(node_config.read_bytes(), academic_config.read_bytes())
        self.assertEqual(node_config.stat().st_mode & 0o777, 0o600)
        business = self.private / "academic-workspaces/synthetic-user-report"
        business.write_text("synthetic report body")
        self.assertTrue(self.controller.restore()["rollback_completed"])
        self.assert_original()
        self.assertTrue(business.exists())
        self.assertFalse(node_config.exists())
        self.assertFalse(academic_config.exists())
        self.assertTrue(self.controller.close()["ok"])
        self.assertFalse((self.stage / transaction.CONTROL_NAME).exists())

    def test_partial_file_swap_failure_restores_original_code(self):
        self.prepare()
        def failure(event, index):
            if event == "after_swap" and index == 2:
                raise OSError("synthetic injected failure")
        with self.assertRaises(transaction.AcademicError):
            self.controller.apply(failure)
        self.assert_original()
        self.assertFalse((self.node / transaction.CONFIG_NAME).exists())
        self.assertTrue(self.controller.restore()["rollback_completed"])

    def test_second_configuration_failure_restores_first_and_code(self):
        self.prepare()
        def failure(event, index):
            if event == "configuration_write" and index == 1:
                raise OSError("synthetic injected failure")
        with self.assertRaises(OSError):
            self.controller.apply(failure)
        self.assertTrue((self.node / transaction.CONFIG_NAME).exists())
        self.assertTrue(self.controller.restore()["ok"])
        self.assert_original()
        self.assertFalse((self.node / transaction.CONFIG_NAME).exists())

    def test_unexpected_concurrent_configuration_prevents_overwrite(self):
        self.prepare()
        changed = self.node / transaction.CONFIG_NAME
        changed.write_bytes(b'{"synthetic_concurrent_change":true}')
        changed.chmod(0o600)
        result = self.controller.dispatch({"action": "apply"})
        self.assertFalse(result["ok"])
        self.assertEqual(result["error"], "configuration_conflict")
        self.assert_original()

    def test_manifest_is_exact_and_does_not_include_user_files(self):
        self.request["entries"] = self.entries[:-1]
        with self.assertRaises(transaction.AcademicError):
            self.controller.prepare(self.request, self.proc)
        self.assert_original()
        self.assertFalse((self.bundle / transaction.BACKUP_NAME).exists())

    def test_first_configuration_migrates_old_managed_environment(self):
        for key in ("LENS_ACADEMIC_WORKSPACE_ROOT", "ACADEMIC_TEMP_ROOT"):
            self.environment[key] = "/synthetic/conflicting-root"
        self.prepare()
        control = json.loads((self.stage / transaction.CONTROL_NAME).read_bytes())
        self.assertIn("ACADEMIC_TEMP_ROOT", control["clear_environment"])
        self.assertIn("LENS_ACADEMIC_WORKSPACE_ROOT", control["clear_environment"])
        self.assert_original()

    def test_existing_private_configuration_conflict_is_rejected(self):
        self.prepare()
        self.controller.apply()
        self.controller.close()
        (self.bundle / transaction.BACKUP_NAME).unlink()
        self.environment["LENS_ACADEMIC_INTERNAL_SECRET"] = "synthetic-conflicting-secret-0123456789"
        another = transaction.AcademicController()
        with self.assertRaisesRegex(transaction.AcademicError, "^configuration_conflict$"):
            another.prepare(self.request, self.proc)

    def test_old_missing_files_remain_missing_after_rollback(self):
        missing = inventory.ARTIFACTS[0]
        (self.academic / missing).unlink()
        self.prepare()
        self.controller.apply()
        self.assertTrue((self.academic / missing).is_file())
        self.controller.restore()
        self.assertFalse((self.academic / missing).exists())

    def test_recovery_rejects_tampered_backup_and_retains_evidence(self):
        self.prepare()
        self.controller.apply()
        backup = self.bundle / transaction.BACKUP_NAME
        backup.write_bytes(b'{"synthetic_tamper":true}')
        result = self.controller.dispatch({"action": "restore"})
        self.assertFalse(result["ok"])
        self.assertTrue(result["manual_intervention"])
        self.assertEqual(result["error"], "rollback_incomplete")
        self.assertTrue(backup.exists())

    def test_independent_bundle_recovery_after_controller_and_stage_loss(self):
        self.prepare()
        self.controller.apply()
        business = self.private / "academic-workspaces/synthetic-report-after-start"
        business.write_text("synthetic generated content")
        self.controller.close()
        del self.controller
        shutil.rmtree(self.stage)
        result = transaction.recover_bundle({"action": "restore", "bundle": str(self.bundle)})
        self.assertTrue(result["ok"])
        self.assertTrue(result["rollback_completed"])
        self.assert_original()
        self.assertTrue(business.exists())
        self.assertFalse((self.node / transaction.CONFIG_NAME).exists())
        self.assertFalse((self.academic / transaction.CONFIG_NAME).exists())

    def test_persisted_recovery_subprocess_survives_deleted_stage(self):
        self.prepare()
        self.controller.apply()
        self.controller.close()
        shutil.rmtree(self.stage)
        helper = self.bundle / "academic-recovery/lens_academic_transaction.py"
        environment = {"PATH": os.environ.get("PATH", ""), "PYTHONDONTWRITEBYTECODE": "1"}
        operation = subprocess.run(
            [sys.executable, "-B", str(helper), "--recover"],
            input=json.dumps({"action": "restore", "bundle": str(self.bundle)}) + "\n",
            capture_output=True, text=True, cwd=self.base, env=environment, timeout=15,
        )
        self.assertEqual(operation.returncode, 0)
        self.assertEqual(operation.stderr, "")
        result = json.loads(operation.stdout)
        self.assertEqual(set(result), transaction.FIELDS)
        self.assertTrue(result["ok"])
        self.assertTrue(result["rollback_completed"])
        self.assert_original()
        self.assertFalse((self.node / transaction.CONFIG_NAME).exists())
        self.assertFalse((self.academic / transaction.CONFIG_NAME).exists())

    def test_independent_recovery_rejects_changed_root_identity(self):
        self.prepare()
        self.controller.apply()
        original_root = self.academic.with_name("academic-retained")
        self.academic.rename(original_root)
        self.academic.mkdir()
        result = transaction.recover_bundle({"action": "restore", "bundle": str(self.bundle)})
        self.assertFalse(result["ok"])
        self.assertTrue(result["manual_intervention"])
        self.assertTrue((original_root / transaction.CONFIG_NAME).exists())

    def test_closed_status_and_repr_do_not_expose_private_runtime(self):
        self.prepare()
        serialized = json.dumps(self.controller.status())
        self.assertNotIn(str(self.academic), serialized)
        self.assertNotIn(self.environment["PM2_HOME"], serialized)
        self.assertEqual(repr(self.controller), "<AcademicController redacted>")
        with self.assertRaises(TypeError):
            json.dumps(self.controller)
        self.assertFalse(hasattr(self.controller, "__dict__"))

    def test_ready_requires_complete_signed_inventory_and_same_source_root(self):
        self.prepare()
        self.controller.apply()
        with patch.object(inventory, "inventory", return_value={"ok": False}):
            self.assertFalse(self.controller.dispatch({"action": "ready"})["ok"])
        with patch.object(inventory, "inventory", return_value={"ok": True}):
            self.assertTrue(self.controller.dispatch({"action": "ready"})["ok"])
        foreign = inventory.OpaqueRuntime(self.python, self.node, self.node, {}, "pm2", ("synthetic", "4"))
        with patch.object(inventory, "inventory", return_value={"ok": True}), patch.object(inventory, "discover", return_value=([foreign], [])):
            self.assertFalse(self.controller.dispatch({"action": "ready"})["ok"])
        with patch.object(inventory, "inventory", side_effect=transaction._ReadyDeadline()):
            result = self.controller.dispatch({"action": "ready"})
            self.assertFalse(result["ok"])
            self.assertEqual(result["error"], "verification_failed")

    def test_ready_failure_retains_only_boolean_checks_after_restore(self):
        self.prepare()
        self.controller.apply()
        checks = {name: True for name in inventory.BOOLEAN_FIELDS}
        checks.update(ok=False, health_ok=False, unknown="synthetic-sensitive-value")
        with patch.object(inventory, "inventory", return_value=checks):
            self.assertFalse(self.controller.dispatch({"action": "ready"})["ok"])
        evidence_path = self.bundle / "academic-readiness-checks.json"
        self.assertTrue(evidence_path.is_file())
        evidence = json.loads(evidence_path.read_text())
        self.assertEqual(set(evidence), {"version", "checks"})
        self.assertEqual(evidence["version"], 1)
        self.assertEqual(set(evidence["checks"]), inventory.BOOLEAN_FIELDS)
        self.assertTrue(all(type(value) is bool for value in evidence["checks"].values()))
        self.assertFalse(evidence["checks"]["health_ok"])
        self.assertNotIn("synthetic-sensitive-value", evidence_path.read_text())
        self.assertEqual(evidence_path.stat().st_mode & 0o777, 0o600)
        self.assertTrue(self.controller.restore()["ok"])
        self.assertEqual(json.loads(evidence_path.read_text()), evidence)

    def test_ready_success_retains_complete_boolean_checks(self):
        self.prepare()
        self.controller.apply()
        checks = {name: True for name in inventory.BOOLEAN_FIELDS}
        with patch.object(inventory, "inventory", return_value=checks):
            self.assertTrue(self.controller.dispatch({"action": "ready"})["ok"])
        evidence_path = self.bundle / "academic-readiness-checks.json"
        self.assertTrue(evidence_path.is_file())
        evidence = json.loads(evidence_path.read_text())
        self.assertEqual(evidence, {"version": 1, "checks": checks})

    def test_ready_projects_only_new_node_route_after_unique_runtime_match(self):
        self.prepare()
        self.controller.apply()
        environment = dict(self.environment, ACADEMIC_API_URL="http://127.0.0.1:9029")
        with patch.object(inventory, "inventory", return_value={"ok": True}), patch.object(inventory, "_environment", return_value=environment):
            self.assertTrue(self.controller.dispatch({"action": "ready"})["ok"])
        ready = json.loads((self.stage / transaction.READY_NAME).read_text())
        self.assertEqual(set(ready), {"version", "listener_endpoints", "academic_url_environment"})
        self.assertEqual(ready["academic_url_environment"], environment["ACADEMIC_API_URL"])
        self.assertEqual((self.stage / transaction.READY_NAME).stat().st_mode & 0o777, 0o600)

    def test_ready_missing_node_pm_id_with_verified_shared_parent(self):
        self.prepare()
        self.controller.apply()
        environment = dict(self.environment, ACADEMIC_API_URL='http://127.0.0.1:9029')
        environment.pop('pm_id', None)
        self.node_process['parent'] = 901
        self.runtime._process['parent'] = 901
        with patch.object(inventory, 'inventory', return_value={'ok': True}), patch.object(inventory, '_environment', return_value=environment), patch.object(inventory, '_manager', return_value=('unknown', None)):
            self.assertTrue(self.controller.dispatch({'action': 'ready'})['ok'])
        ready = json.loads((self.stage / transaction.READY_NAME).read_text())
        self.assertEqual(set(ready), {'version', 'listener_endpoints', 'academic_url_environment'})
        self.assertEqual(ready['academic_url_environment'], environment['ACADEMIC_API_URL'])
        self.assertEqual((self.stage / transaction.READY_NAME).stat().st_mode & 511, 384)

    def test_ready_missing_node_pm_id_with_different_parent(self):
        self.prepare()
        self.controller.apply()
        environment = dict(self.environment, ACADEMIC_API_URL='http://127.0.0.1:9029')
        environment.pop('pm_id', None)
        self.node_process['parent'] = 901
        self.runtime._process['parent'] = 901
        self.node_process['parent'] = self.runtime._process['parent'] + 1
        with patch.object(inventory, 'inventory', return_value={'ok': True}), patch.object(inventory, '_environment', return_value=environment), patch.object(inventory, '_manager', return_value=('unknown', None)):
            self.assertFalse(self.controller.dispatch({'action': 'ready'})['ok'])

    def test_ready_missing_node_pm_id_with_conflicting_manager_home(self):
        self.prepare()
        self.controller.apply()
        environment = dict(self.environment, ACADEMIC_API_URL='http://127.0.0.1:9029')
        environment.pop('pm_id', None)
        self.node_process['parent'] = 901
        self.runtime._process['parent'] = 901
        environment['PM2_HOME'] = str(self.base / 'other-manager')
        with patch.object(inventory, 'inventory', return_value={'ok': True}), patch.object(inventory, '_environment', return_value=environment), patch.object(inventory, '_manager', return_value=('unknown', None)):
            self.assertFalse(self.controller.dispatch({'action': 'ready'})['ok'])


    def test_ready_rejects_missing_or_ambiguous_new_node_runtime(self):
        self.prepare()
        self.controller.apply()
        for nodes in ([], [self.node_process, dict(self.node_process)]):
            with patch.object(inventory, "inventory", return_value={"ok": True}), patch.object(inventory, "discover", return_value=([self.runtime], nodes)):
                result = self.controller.dispatch({"action": "ready"})
                self.assertFalse(result["ok"])
                self.assertEqual(result["error"], "verification_failed")

    def test_old_ready_attests_manager_source_and_listener_without_new_health_route(self):
        request = {"action": "old_ready", "source_root": str(self.academic), "cwd": str(self.academic),
                   "executable": "/synthetic/python", "manager_home": self.environment["PM2_HOME"],
                   "listener_endpoints": [["127.0.0.1", 9029]]}
        result = transaction.old_runtime_ready(request, self.proc, timeout=0)
        self.assertTrue(result["ok"])
        self.assertTrue(result["rollback_completed"])
        for field, value in (("manager_home", "/synthetic/foreign-manager"),
                             ("source_root", str(self.node)), ("executable", "/synthetic/foreign-python"),
                             ("listener_endpoints", [["127.0.0.1", 9030]])):
            changed = dict(request, **{field: value})
            rejected = transaction.old_runtime_ready(changed, self.proc, timeout=0)
            self.assertFalse(rejected["ok"])
            self.assertEqual(rejected["error"], "verification_failed")

    def test_stdio_controller_rejects_invalid_requests_without_tracebacks(self):
        source = io.StringIO('{"action":"apply"}\n{"action":"close"}\n')
        output = io.StringIO()
        transaction.control(source, output)
        rows = [json.loads(line) for line in output.getvalue().splitlines()]
        self.assertEqual(len(rows), 2)
        self.assertTrue(all(set(row) == transaction.FIELDS for row in rows))
        self.assertEqual(rows[0]["error"], "not_prepared")
        self.assertTrue(rows[1]["ok"])


if __name__ == "__main__":
    unittest.main()
