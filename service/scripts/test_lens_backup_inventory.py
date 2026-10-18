import copy
import ast
from contextlib import contextmanager
from dataclasses import asdict
import unittest
from unittest.mock import Mock, patch

import lens_backup_inventory as inventory


def verified_result():
    return dict(ok=True, namespace_owned=True, scan_complete=True,
                backup_directory_count=1, declared_verified_count=1,
                owned_unverified_count=0, unknown_entry_count=0,
                unsafe_entry_count=0, sole_verified_backup=True, error='none')


class BackupInventoryTests(unittest.TestCase):
    def test_closed_projection_accepts_consistent_counts(self):
        self.assertEqual(asdict(inventory.project_inventory(verified_result())), verified_result())

    def test_unknown_and_private_fields_are_rejected(self):
        value = verified_result()
        value['synthetic_private_field'] = 'synthetic-private-value'
        result = inventory.project_inventory(value)
        self.assertEqual(result.error, 'response_rejected')
        self.assertNotIn('synthetic-private-value', str(asdict(result)))

    def test_type_bounds_and_consistency_are_enforced(self):
        for key, replacement in [('backup_directory_count', True),
                                 ('backup_directory_count', 4097),
                                 ('declared_verified_count', 2),
                                 ('scan_complete', False), ('error', 'synthetic-secret')]:
            value = copy.deepcopy(verified_result())
            value[key] = replacement
            self.assertEqual(inventory.project_inventory(value).error, 'response_rejected')

    def test_unverified_owned_backup_never_claims_unique_verified_backup(self):
        value = verified_result()
        value.update(backup_directory_count=2, owned_unverified_count=1, sole_verified_backup=False)
        self.assertFalse(inventory.project_inventory(value).sole_verified_backup)

    def test_connection_dispatch_is_single_readonly_request_and_closes_secrets(self):
        secrets = Mock()
        client = object()

        @contextmanager
        def connection(actual, *, host_key_reviewed):
            self.assertIs(actual, secrets)
            self.assertTrue(host_key_reviewed)
            yield client

        with patch.object(inventory.safe_ops, 'load_project_entry', return_value=secrets), \
                patch.object(inventory.safe_ops, '_trusted_connection', connection), \
                patch.object(inventory.release, '_execute', return_value={'public': verified_result()}) as execute:
            self.assertTrue(inventory.run_backup_inventory(host_key_reviewed=True).ok)
        execute.assert_called_once_with(client, {'mode': 'backup_inventory'}, 120)
        secrets.close.assert_called_once_with()

    def test_connection_failure_is_redacted_and_closes_secrets(self):
        secrets = Mock()
        with patch.object(inventory.safe_ops, 'load_project_entry', return_value=secrets), \
                patch.object(inventory.safe_ops, '_trusted_connection', side_effect=RuntimeError('synthetic-secret')):
            result = inventory.run_backup_inventory(host_key_reviewed=True)
        self.assertEqual(result.error, 'ssh_read_failed')
        self.assertNotIn('synthetic-secret', str(asdict(result)))
        secrets.close.assert_called_once_with()

    def test_generated_readonly_bootstrap_is_valid_python(self):
        program = inventory.release.build_remote_program({'mode': 'backup_inventory'})
        compile(program, '<synthetic-readonly-bootstrap>', 'exec')
        workers = [node.value for node in ast.walk(ast.parse(program))
                   if isinstance(node, ast.Constant) and type(node.value) is str
                   and 'const __lensBackupInventory' in node.value]
        self.assertEqual(len(workers), 1)
        self.assertIn("__lensRequest.mode === 'backup_inventory'", workers[0])


if __name__ == '__main__':
    unittest.main()
