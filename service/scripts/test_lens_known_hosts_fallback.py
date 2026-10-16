"""Synthetic-only contracts for using an existing host trust store."""

import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import paramiko

import lens_safe_ops as ops
import test_lens_safe_ops as fixtures


class ExistingKnownHostsContract(unittest.TestCase):
    def setUp(self):
        fixtures.FakeClient.instances = []
        fixtures.FakeClient.fail_connect = None

    @contextlib.contextmanager
    def trusted_store(self, *, hashed=False, wrong_target=False, duplicate=False, marker=False):
        entry = fixtures.fixture()
        target = entry['host'] if entry['port'] == 22 else f"[{entry['host']}]:{entry['port']}"
        if wrong_target:
            target = 'unrelated.invalid'
        if hashed:
            target = paramiko.HostKeys.hash_host(target)
        key = paramiko.RSAKey.generate(1024)
        if marker:
            target = '@cert-authority ' + target
        rows = [f"{target} {key.get_name()} {key.get_base64()}\n"]
        if duplicate:
            other = paramiko.RSAKey.generate(1024)
            rows.append(f"{target} {other.get_name()} {other.get_base64()}\n")
        with tempfile.TemporaryDirectory(prefix='lens-known-hosts-contract-') as directory:
            path = Path(directory) / 'known_hosts'
            path.write_text(''.join(rows))
            path.chmod(0o600)
            with mock.patch.object(ops, '_known_hosts_path', return_value=path), \
                    mock.patch.object(paramiko, 'SSHClient', fixtures.FakeClient), \
                    mock.patch.object(fixtures.FakeKey, 'asbytes', return_value=key.asbytes()):
                yield entry, key

    def preflight(self, entry, *, reviewed=True):
        secrets = ops.parse_entry(json.dumps(entry))
        try:
            return ops.run_preflight(secrets, host_key_reviewed=reviewed)
        finally:
            secrets.close()

    def test_existing_exact_target_without_entry_pin_authenticates(self):
        output = io.StringIO()
        with self.trusted_store() as (entry, _), contextlib.redirect_stdout(output):
            result = self.preflight(entry)
        self.assertTrue(result['ok'])
        self.assertTrue(result['hostKeyTrusted'])
        self.assertFalse(result['writeEnabled'])
        self.assertEqual(output.getvalue(), '')
        self.assertEqual(set(result), {'ok', 'entryValid', 'hostKeyTrusted', 'sshConnected',
                                       'readOnlyProbePassed', 'writeEnabled', 'errorClass'})

    def test_existing_hashed_target_without_entry_pin_authenticates(self):
        with self.trusted_store(hashed=True) as (entry, _):
            result = self.preflight(entry)
        self.assertTrue(result['ok'])

    def test_other_target_without_entry_pin_never_opens_connection(self):
        with self.trusted_store(wrong_target=True) as (entry, _):
            result = self.preflight(entry)
        self.assertEqual(result['errorClass'], 'host_key_trust_missing')
        self.assertFalse(result['sshConnected'])
        self.assertFalse(fixtures.FakeClient.instances)

    def test_ambiguous_existing_keys_without_entry_pin_are_rejected(self):
        with self.trusted_store(duplicate=True) as (entry, _):
            result = self.preflight(entry)
        self.assertEqual(result['errorClass'], 'host_key_trust_missing')
        self.assertFalse(fixtures.FakeClient.instances)

    def test_explicit_mismatched_pin_never_downgrades_to_existing_store(self):
        with self.trusted_store() as (_, _):
            result = self.preflight(fixtures.trusted_fixture())
        self.assertEqual(result['errorClass'], 'host_key_mismatch')
        self.assertFalse(fixtures.FakeClient.instances)

    def test_non_boolean_review_cannot_open_connection(self):
        with self.trusted_store() as (entry, _):
            result = self.preflight(entry, reviewed='true')
        self.assertEqual(result['errorClass'], 'host_key_review_required')
        self.assertFalse(fixtures.FakeClient.instances)

    def test_marker_record_without_entry_pin_is_not_a_raw_key_trust_record(self):
        with self.trusted_store(marker=True) as (entry, _):
            result = self.preflight(entry)
        self.assertEqual(result['errorClass'], 'host_key_trust_missing')
        self.assertFalse(fixtures.FakeClient.instances)

    def test_handshake_raw_key_mismatch_without_entry_pin_is_rejected(self):
        with self.trusted_store() as (entry, _), \
                mock.patch.object(fixtures.FakeKey, 'asbytes', return_value=b'synthetic-other-key'):
            result = self.preflight(entry)
        self.assertEqual(result['errorClass'], 'host_key_mismatch')
        self.assertFalse(result['sshConnected'])
        self.assertTrue(fixtures.FakeClient.instances[0].closed)


if __name__ == '__main__':
    unittest.main()
