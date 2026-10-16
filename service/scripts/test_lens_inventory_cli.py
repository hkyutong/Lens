"""The CLI must preserve the reviewed connection gate for inventory."""
import contextlib
import io
import json
import unittest
from unittest import mock

import lens_safe_ops as ops


class InventoryCliContract(unittest.TestCase):
    def test_inventory_cli_dispatches_only_through_the_reviewed_boundary(self):
        entry = mock.Mock()
        output = io.StringIO()
        result = ops._result(entryValid=True)
        with mock.patch.object(ops, 'load_project_entry', return_value=entry), \
                mock.patch.object(ops, 'run_runtime_inventory', return_value=result) as inventory, \
                contextlib.redirect_stdout(output):
            ops.main(['inventory', '--host-key-reviewed'])
        self.assertTrue(json.loads(output.getvalue())['ok'])
        inventory.assert_called_once_with(entry, host_key_reviewed=True)
        entry.close.assert_called_once_with()

    def test_inventory_without_review_never_loads_the_entry(self):
        output = io.StringIO()
        with mock.patch.object(ops, 'load_project_entry') as load, contextlib.redirect_stdout(output):
            ops.main(['inventory'])
        self.assertFalse(json.loads(output.getvalue())['ok'])
        load.assert_not_called()
