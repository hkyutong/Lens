"""Cross-module orchestration tests using synthetic local files and adapters."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import unittest

import lens_production_release as release
import test_lens_production_release as fixtures


class ProductionLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.ProductionReleaseTests()
        self.fixture.setUp()

    def tearDown(self):
        self.fixture.tearDown()

    def exercise(self, fault):
        context, tools = self.fixture.synthetic_context()
        config_path = Path(context["serviceCwd"]) / "pm2.conf.json"
        original_config = json.loads(config_path.read_text())
        managed_environment = {"INIT_DB_ON_BOOT": "true", "LENS_ACADEMIC_INTERNAL_SECRET": "synthetic-old-secret", "LENS_ACADEMIC_WORKSPACE_ROOT": "synthetic-old-root", "PATH_LOGGING": "synthetic-old-log", "PATH_PRIVATE_UPLOAD": "synthetic-old-upload", "ACADEMIC_TEMP_ROOT": "synthetic-old-temp"}
        original_config["apps"][0]["env"] = managed_environment.copy()
        config_path.write_text(json.dumps(original_config))
        context["runtime"]["environment"] = managed_environment.copy()

        service = Path(context['serviceCwd'])
        if fault == 'private_parent_missing':
            Path(context['privateStorage']).parent.rmdir()
        for relative, content in {
            'dist/main.js': b'old-service',
            'package.json': b'{"dependencies":{}}',
            'pnpm-lock.yaml': b'lockfileVersion: 9\n',
            'pnpm-workspace.yaml': b'packages: []\n',
            'node_modules/synthetic/index.js': b'old-dependency',
            'public/chat/index.html': b'old-chat',
            'public/admin/index.html': b'old-admin',
        }.items():
            target = service / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
            target.chmod(0o644)
        worker = Path(release.__file__).with_name('lens_production_release_worker.cjs')
        request = {'mode': 'stage', 'deploy': True, 'release_id': 'a' * 32}
        program = "globalThis.__lensDownloadBoundary=require(" + json.dumps(str(worker.with_name("lens_download_boundary.cjs"))) + ");" + ('const __lensRequest=' + json.dumps(request) + ';\n')
        program += worker.read_text()
        program += '\nglobalThis.__lensCapture=()=>(' + json.dumps(context) + '); __lensControl();'
        environment = dict(os.environ)
        environment['PATH'] = str(tools) + os.pathsep + environment.get('PATH', '')
        created = subprocess.run(['node', '-e', program], capture_output=True, text=True,
                                 timeout=5, env=environment)
        self.assertEqual(created.returncode, 0, 'synthetic stage process failed')
        staged = json.loads(created.stdout)
        self.assertTrue(staged['public']['ok'], 'synthetic stage gate failed')
        stage = staged['private']['stage']
        bundle = release.prepare_artifact_bundle(self.fixture.artifacts, self.fixture.manifest)

        class LocalSftp:
            def __enter__(self):
                return self

            def __exit__(self, *args):
                return False

            def open(self, destination, mode):
                if mode != 'wx':
                    raise AssertionError('SFTP must request exclusive write access')
                return open(destination, 'xb')

            def chmod(self, destination, mode):
                Path(destination).chmod(mode)

            def lstat(self, destination):
                return Path(destination).lstat()

            def close(self):
                pass

        class LocalClient:
            def open_sftp(self):
                return LocalSftp()

        release._upload(LocalClient(), stage, bundle)
        request.update(mode='deploy', stage=stage, entries=self.fixture.manifest['entries'],
                       archive_sha256=hashlib.sha256(bundle.archive).hexdigest(), source_attested=True)
        data = {'context': context, 'stage': stage, 'request': request, 'fault': fault,
                'allowed_errors': sorted(release._ERRORS),
                'worker': str(worker), 'python': sys.executable}
        harness = worker.with_name('test_lens_production_lifecycle.cjs')
        completed = subprocess.run(['node', str(harness)], input=json.dumps(data),
                                   capture_output=True, text=True, timeout=15, env=environment)
        self.assertEqual(completed.returncode, 0, 'synthetic lifecycle process failed')
        result = json.loads(completed.stdout)
        self.assertTrue(result.get('captured'), 'synthetic lifecycle did not emit a result')
        self.assertTrue(result['direct_status_schema'], 'worker status must not be wrapped twice')
        if result.get('rollback_completed'):
            self.assertTrue(result['academic_online'], 'rollback must restore both services')
            self.assertTrue(result['academic_original_restored'])
        if result.get('success') and fault != 'cleanup_owned':
            self.assertTrue(result['academic_online'], 'committed Academic must stay online')
            self.assertFalse(result['academic_original_restored'])
        return result

    def assert_recovered(self, result):
        self.assertTrue(result['rollback_attempted'])
        self.assertTrue(result['rollback_completed'])
        self.assertTrue(result['old_application_restored'])
        self.assertTrue(result['app_online'])
        self.assertTrue(result['academic_online'])
        self.assertTrue(result['academic_original_restored'])
        self.assertTrue(result['new_data_retained'])
        self.assertTrue(result['all_startup_flags_disabled'])
        self.assertTrue(result['database_restore_before_migration'])
        self.assertEqual(result['backup_count'], 1)

        self.assertTrue(result['persistent_flag_disabled'])
        self.assertTrue(result['new_environment_cleared'])
        self.assertTrue(result['rollback_environment_preserved'])

    def test_history_inventory_rejection_restores_old_application(self):
        self.assert_recovered(self.exercise("historyInventory"))

    def test_dependency_swap_failure_restores_old_application(self):
        result = self.exercise('dependency_swap')
        self.assertTrue(result['fault_injected'])
        self.assert_recovered(result)

    def test_missing_private_parent_is_created_without_changing_existing_data(self):
        result = self.exercise('private_parent_missing')
        self.assertTrue(result['success'])
        self.assertTrue(result['app_online'])
        self.assertTrue(result['academic_online'])
        self.assertTrue(result['new_data_retained'])

    def test_start_failure_restores_old_application(self):
        self.assert_recovered(self.exercise('start'))

    def test_health_failure_restores_old_application(self):
        self.assert_recovered(self.exercise('health'))

    def test_download_failure_retains_only_reviewed_private_evidence(self):
        result = self.exercise('download_boundary')
        self.assert_recovered(result)
        self.assertTrue(result['download_evidence_present'])
        self.assertTrue(result['download_evidence_closed'])
        self.assertEqual(result['download_evidence_error'], 'boundary_request_failed')

    def test_unknown_download_failure_detail_is_not_retained(self):
        result = self.exercise('download_boundary_unknown')
        self.assert_recovered(result)
        self.assertTrue(result['download_evidence_present'])
        self.assertTrue(result['download_evidence_closed'])
        self.assertEqual(result['download_evidence_error'], 'download_boundary_failed')


    def test_academic_stop_rolls_back(self):
        outcome = self.exercise('academic_stop')
        self.assertTrue(outcome['captured'])
        self.assertTrue(outcome['rollback_attempted'])
        self.assertTrue(outcome['rollback_completed'])
        self.assertTrue(outcome['app_online'])
        self.assertTrue(outcome['old_application_restored'])
        self.assertTrue(outcome['all_startup_flags_disabled'])
        self.assertTrue(outcome['persistent_flag_disabled'])
        self.assertTrue(outcome['rollback_environment_preserved'])
        self.assertTrue(outcome['fault_injected'])
        self.assertFalse(outcome['success'])
        self.assertFalse(outcome['needs_manual_review'])
        self.assertFalse(outcome['stage_retained'])
        self.assertEqual(outcome['error_category'], 'academic_transaction_failed')
        self.assertEqual(outcome['backup_count'], 1)
        self.assertEqual(outcome['starts'], 1)

    def test_academic_apply_rolls_back(self):
        outcome = self.exercise('academic_apply')
        self.assertTrue(outcome['captured'])
        self.assertTrue(outcome['rollback_attempted'])
        self.assertTrue(outcome['rollback_completed'])
        self.assertTrue(outcome['app_online'])
        self.assertTrue(outcome['old_application_restored'])
        self.assertTrue(outcome['all_startup_flags_disabled'])
        self.assertTrue(outcome['persistent_flag_disabled'])
        self.assertTrue(outcome['rollback_environment_preserved'])
        self.assertTrue(outcome['fault_injected'])
        self.assertTrue(outcome['new_data_retained'])
        self.assertTrue(outcome['database_restore_before_migration'])
        self.assertFalse(outcome['success'])
        self.assertFalse(outcome['needs_manual_review'])
        self.assertFalse(outcome['stage_retained'])
        self.assertEqual(outcome['error_category'], 'academic_transaction_failed')
        self.assertEqual(outcome['backup_count'], 1)
        self.assertEqual(outcome['starts'], 1)

    def test_academic_startNew_rolls_back(self):
        outcome = self.exercise('academic_startNew')
        self.assertTrue(outcome['captured'])
        self.assertTrue(outcome['rollback_attempted'])
        self.assertTrue(outcome['rollback_completed'])
        self.assertTrue(outcome['app_online'])
        self.assertTrue(outcome['old_application_restored'])
        self.assertTrue(outcome['all_startup_flags_disabled'])
        self.assertTrue(outcome['persistent_flag_disabled'])
        self.assertTrue(outcome['rollback_environment_preserved'])
        self.assertTrue(outcome['fault_injected'])
        self.assertTrue(outcome['new_data_retained'])
        self.assertTrue(outcome['database_restore_before_migration'])
        self.assertFalse(outcome['success'])
        self.assertFalse(outcome['needs_manual_review'])
        self.assertFalse(outcome['stage_retained'])
        self.assertEqual(outcome['error_category'], 'academic_transaction_failed')
        self.assertEqual(outcome['backup_count'], 1)
        self.assertEqual(outcome['starts'], 1)

    def test_academic_nodeEnvironment_rolls_back(self):
        outcome = self.exercise('academic_nodeEnvironment')
        self.assertTrue(outcome['captured'])
        self.assertTrue(outcome['rollback_attempted'])
        self.assertTrue(outcome['rollback_completed'])
        self.assertTrue(outcome['app_online'])
        self.assertTrue(outcome['old_application_restored'])
        self.assertTrue(outcome['all_startup_flags_disabled'])
        self.assertTrue(outcome['persistent_flag_disabled'])
        self.assertTrue(outcome['rollback_environment_preserved'])
        self.assertTrue(outcome['fault_injected'])
        self.assertTrue(outcome['new_data_retained'])
        self.assertTrue(outcome['database_restore_before_migration'])
        self.assertFalse(outcome['success'])
        self.assertFalse(outcome['needs_manual_review'])
        self.assertFalse(outcome['stage_retained'])
        self.assertEqual(outcome['error_category'], 'academic_transaction_failed')
        self.assertEqual(outcome['backup_count'], 1)
        self.assertEqual(outcome['starts'], 1)

    def test_academic_ready_rolls_back(self):
        outcome = self.exercise('academic_ready')
        self.assertTrue(outcome['captured'])
        self.assertTrue(outcome['rollback_attempted'])
        self.assertTrue(outcome['rollback_completed'])
        self.assertTrue(outcome['app_online'])
        self.assertTrue(outcome['old_application_restored'])
        self.assertTrue(outcome['all_startup_flags_disabled'])
        self.assertTrue(outcome['persistent_flag_disabled'])
        self.assertTrue(outcome['rollback_environment_preserved'])
        self.assertTrue(outcome['fault_injected'])
        self.assertTrue(outcome['new_data_retained'])
        self.assertTrue(outcome['database_restore_before_migration'])
        self.assertTrue(outcome['new_environment_cleared'])
        self.assertFalse(outcome['success'])
        self.assertFalse(outcome['needs_manual_review'])
        self.assertFalse(outcome['stage_retained'])
        self.assertEqual(outcome['error_category'], 'academic_route_invalid')
        self.assertEqual(outcome['backup_count'], 1)
        self.assertEqual(outcome['starts'], 2)


    def test_partial_node_stop_callback_failure_recovers_application(self):
        outcome = self.exercise('node_stop_partial')
        self.assertTrue(outcome['captured'])
        self.assertTrue(outcome['fault_injected'])
        self.assertTrue(outcome['rollback_attempted'])
        self.assertTrue(outcome['rollback_completed'])
        self.assertTrue(outcome['app_online'])
        self.assertTrue(outcome['old_application_restored'])
        self.assertTrue(outcome['all_startup_flags_disabled'])
        self.assertTrue(outcome['persistent_flag_disabled'])
        self.assertTrue(outcome['rollback_environment_preserved'])
        self.assertTrue(outcome['production_changed'])
        self.assertFalse(outcome['success'])
        self.assertFalse(outcome['needs_manual_review'])
        self.assertFalse(outcome['stage_retained'])
        self.assertEqual(outcome['starts'], 1)
        self.assertEqual(outcome['backup_count'], 1)


    def test_academic_restore_failure_retains_recovery_evidence(self):
        outcome = self.exercise('academic_restore')
        self.assertTrue(outcome['captured'])
        self.assertTrue(outcome['fault_injected'])
        self.assertTrue(outcome['stage_retained'])
        self.assertTrue(outcome['all_startup_flags_disabled'])
        self.assertTrue(outcome['persistent_flag_disabled'])
        self.assertTrue(outcome['production_changed'])
        self.assertTrue(outcome['rollback_attempted'])
        self.assertTrue(outcome['needs_manual_review'])
        self.assertTrue(outcome['new_data_retained'])
        self.assertTrue(outcome['database_restore_before_migration'])
        self.assertFalse(outcome['success'])
        self.assertFalse(outcome['rollback_completed'])
        self.assertFalse(outcome['cleanup_failed'])
        self.assertFalse(outcome['app_online'])
        self.assertEqual(outcome['error_category'], 'rollback_incomplete')
        self.assertEqual(outcome['backup_count'], 1)

    def test_academic_startOld_failure_retains_recovery_evidence(self):
        outcome = self.exercise('academic_startOld')
        self.assertTrue(outcome['captured'])
        self.assertTrue(outcome['fault_injected'])
        self.assertTrue(outcome['stage_retained'])
        self.assertTrue(outcome['all_startup_flags_disabled'])
        self.assertTrue(outcome['persistent_flag_disabled'])
        self.assertTrue(outcome['production_changed'])
        self.assertTrue(outcome['rollback_attempted'])
        self.assertTrue(outcome['needs_manual_review'])
        self.assertTrue(outcome['new_data_retained'])
        self.assertTrue(outcome['database_restore_before_migration'])
        self.assertFalse(outcome['success'])
        self.assertFalse(outcome['rollback_completed'])
        self.assertFalse(outcome['cleanup_failed'])
        self.assertFalse(outcome['app_online'])
        self.assertEqual(outcome['error_category'], 'rollback_incomplete')
        self.assertEqual(outcome['backup_count'], 1)

    def test_academic_close_keeps_committed_application(self):
        outcome = self.exercise('academic_close')
        self.assertTrue(outcome['captured'])
        self.assertTrue(outcome['fault_injected'])
        self.assertTrue(outcome['stage_retained'])
        self.assertTrue(outcome['all_startup_flags_disabled'])
        self.assertTrue(outcome['persistent_flag_disabled'])
        self.assertTrue(outcome['production_changed'])
        self.assertTrue(outcome['cleanup_failed'])
        self.assertTrue(outcome['app_online'])
        self.assertTrue(outcome['new_environment_cleared'])
        self.assertTrue(outcome['success'])
        self.assertFalse(outcome['rollback_completed'])
        self.assertFalse(outcome['rollback_attempted'])
        self.assertFalse(outcome['needs_manual_review'])
        self.assertEqual(outcome['error_category'], 'cleanup_failed')
        self.assertEqual(outcome['backup_count'], 1)
        self.assertEqual(outcome['stops'], 1)
        self.assertEqual(outcome['starts'], 1)
        self.assertFalse(outcome['old_application_restored'])

    def test_rollback_start_failure_retains_recovery_material(self):
        result = self.exercise('rollback')
        self.assertTrue(result['rollback_attempted'])
        self.assertFalse(result['rollback_completed'])
        self.assertTrue(result['needs_manual_review'])
        self.assertTrue(result['stage_retained'])
        self.assertEqual(result['backup_count'], 1)
        self.assertTrue(result['new_data_retained'])
        self.assertTrue(result['all_startup_flags_disabled'])

    def test_partial_stage_cleanup_keeps_healthy_new_application(self):
        result = self.exercise('cleanup')
        self.assertTrue(result['fault_injected'])
        self.assertTrue(result['success'])
        self.assertTrue(result['cleanup_failed'])
        self.assertTrue(result['app_online'])
        self.assertFalse(result['rollback_attempted'])
        self.assertFalse(result['old_application_restored'])
        self.assertTrue(result['new_data_retained'])
        self.assertTrue(result['all_startup_flags_disabled'])
        self.assertEqual(result['stops'], 1)
        self.assertEqual(result['starts'], 1)
        self.assertEqual(result['backup_count'], 1)

        self.assertTrue(result['persistent_flag_disabled'])
        self.assertTrue(result['new_environment_cleared'])
        self.assertTrue(result['rollback_environment_preserved'])

        self.assertTrue(result["partial_stage_cleanup_observed"])


    def test_owned_stage_cleanup_never_changes_application(self):
        result = self.exercise("cleanup_owned")
        self.assertTrue(result["success"])
        self.assertFalse(result["stage_retained"])
        self.assertFalse(result["production_changed"])
        self.assertTrue(result["app_online"])
        self.assertEqual((result["stops"], result["starts"], result["backup_count"]), (0, 0, 0))

    def test_wrong_owner_stage_cleanup_preserves_evidence(self):
        result = self.exercise("cleanup_wrong_owner")
        self.assertFalse(result["success"])
        self.assertTrue(result["stage_retained"])
        self.assertFalse(result["production_changed"])
        self.assertTrue(result["app_online"])
        self.assertEqual((result["stops"], result["starts"], result["backup_count"]), (0, 0, 0))

    def test_file_plan_rejection_keeps_both_services_running(self):
        result = self.exercise("file_preflight")
        self.assertFalse(result["production_changed"])
        self.assertFalse(result["rollback_attempted"])
        self.assertTrue(result["app_online"])
        self.assertTrue(result["academic_online"])

    def test_maintenance_open_failure_restores_entry_before_old_application(self):
        result = self.exercise("maintenance_open")
        self.assert_recovered(result)
        self.assertTrue(result["maintenance_open_after_origin_denial"])
        self.assertTrue(result["maintenance_restored_before_old_application"])

    def test_origin_download_failure_does_not_open_entry(self):
        result = self.exercise("origin_download_boundary")
        self.assert_recovered(result)
        self.assertFalse(result["maintenance_opened"])

    def test_success_opens_entry_only_after_origin_denial(self):
        result = self.exercise("none")
        self.assertTrue(result["success"])
        self.assertTrue(result["maintenance_open_after_origin_denial"])
        self.assertFalse(result["rollback_attempted"])


if __name__ == '__main__':
    unittest.main()
