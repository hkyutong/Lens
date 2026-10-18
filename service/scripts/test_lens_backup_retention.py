import ast
from contextlib import contextmanager
from dataclasses import asdict
import subprocess
import unittest
from unittest.mock import Mock, patch

import lens_backup_retention as retention


def audit_result():
    value = asdict(retention.BackupRetentionResult())
    value.update(ok=True, scan_complete=True, namespace_owned=True,
                 backup_count_before=12, verified_count=1, unverified_count=11,
                 eligible_count=11, retained_unverified_count=11,
                 backup_count_after=12, verified_backup_preserved=True, error='none')
    return value


class BackupRetentionTests(unittest.TestCase):
    def test_projection_is_closed_and_consistent(self):
        value = audit_result()
        self.assertTrue(retention.project_retention(value).ok)
        for key, replacement in [('synthetic_private', 'synthetic-secret'),
                                 ('eligible_count', 12), ('removed_count', 1),
                                 ('ok', 1), ('error', 'synthetic-secret')]:
            changed = dict(value)
            changed[key] = replacement
            result = retention.project_retention(changed)
            self.assertEqual(result.error, 'response_rejected')
            self.assertNotIn('synthetic-secret', str(asdict(result)))

    def test_cleanup_without_restore_evidence_never_connects(self):
        with patch.object(retention.safe_ops, 'load_project_entry') as load:
            self.assertEqual(retention.run_backup_retention(cleanup=True).error, 'restore_evidence_required')
        load.assert_not_called()

    def test_invalid_scope_never_connects(self):
        with patch.object(retention.safe_ops, 'load_project_entry') as load:
            self.assertEqual(retention.run_backup_retention(expected_backups=13).error, 'request_rejected')
        load.assert_not_called()

    def test_audit_and_cleanup_modes_are_explicit_and_secrets_close(self):
        for cleanup in [False, True]:
            secrets, client = Mock(), object()

            @contextmanager
            def connect(actual, *, host_key_reviewed):
                self.assertIs(actual, secrets)
                self.assertTrue(host_key_reviewed)
                yield client

            with patch.object(retention.safe_ops, 'load_project_entry', return_value=secrets), \
                    patch.object(retention.safe_ops, '_trusted_connection', connect), \
                    patch.object(retention.release, '_execute', return_value={'public': audit_result()}) as execute:
                retention.run_backup_retention(cleanup=cleanup, restore_verified=True, host_key_reviewed=True)
            request = {'mode': 'backup_retention_cleanup' if cleanup else 'backup_retention_audit',
                       'expected_backups': 12, 'expected_unverified': 11}
            execute.assert_called_once_with(client, request, 180)
            secrets.close.assert_called_once_with()

    def test_connection_errors_do_not_expose_values(self):
        secrets = Mock()
        with patch.object(retention.safe_ops, 'load_project_entry', return_value=secrets), \
                patch.object(retention.safe_ops, '_trusted_connection', side_effect=RuntimeError('synthetic-secret')):
            result = retention.run_backup_retention(host_key_reviewed=True)
        self.assertEqual(result.error, 'ssh_read_failed')
        self.assertNotIn('synthetic-secret', str(asdict(result)))
        secrets.close.assert_called_once_with()

    def test_generated_modes_compile_without_dumping_program(self):
        for mode in ['backup_retention_audit', 'backup_retention_cleanup']:
            program = retention.release.build_remote_program({'mode': mode, 'expected_backups': 12, 'expected_unverified': 11})
            compile(program, '<synthetic-retention-bootstrap>', 'exec')
            blocks = [node.value for node in ast.walk(ast.parse(program))
                      if isinstance(node, ast.Constant) and type(node.value) is str
                      and 'const __lensBackupRetention' in node.value]
            self.assertEqual(len(blocks), 1)
            checked = subprocess.run(['node', '--check'], input=blocks[0], capture_output=True, text=True)
            self.assertEqual(checked.returncode, 0)


if __name__ == '__main__':
    unittest.main()
