"""Synthetic host key algorithm sets; never reads a real trust store."""

import contextlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import paramiko
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ed25519

import lens_safe_ops as ops
import test_lens_safe_ops as fixtures


class MultipleAlgorithmsContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        encoded = ed25519.Ed25519PrivateKey.generate().private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.OpenSSH,
            serialization.NoEncryption(),
        )
        cls.keys = (
            paramiko.RSAKey.generate(1024),
            paramiko.ECDSAKey.generate(),
            paramiko.Ed25519Key.from_private_key(io.StringIO(encoded.decode('ascii'))),
        )

    def setUp(self):
        fixtures.FakeClient.instances = []
        fixtures.FakeClient.fail_connect = None

    @contextlib.contextmanager
    def store(self, keys=None, *, selected=None, pinned=None, hashed=False, marker=False):
        keys = self.keys if keys is None else keys
        selected = keys[0] if selected is None else selected
        entry = fixtures.fixture() if pinned is None else fixtures.reviewed_fixture(pinned)
        target = entry['host'] if entry['port'] == 22 else f"[{entry['host']}]:{entry['port']}"
        if hashed:
            target = paramiko.HostKeys.hash_host(target)
        rows = [f"{target} {key.get_name()} {key.get_base64()}\n" for key in keys]
        if marker:
            rows[0] = '@cert-authority ' + rows[0]
        with tempfile.TemporaryDirectory(prefix='lens-multiple-key-contract-') as directory:
            path = Path(directory) / 'known_hosts'
            path.write_text(''.join(rows))
            path.chmod(0o600)
            with mock.patch.object(ops, '_known_hosts_path', return_value=path), \
                    mock.patch.object(paramiko, 'SSHClient', fixtures.FakeClient), \
                    mock.patch.object(fixtures.FakeKey, 'asbytes', return_value=selected.asbytes()), \
                    mock.patch.object(fixtures.FakeKey, 'get_name', return_value=selected.get_name(), create=True):
                yield entry

    def preflight(self, entry):
        secrets = ops.parse_entry(json.dumps(entry))
        try:
            return ops.run_preflight(secrets, host_key_reviewed=True)
        finally:
            secrets.close()

    def test_each_of_three_distinct_algorithms_is_trusted_without_entry_pin(self):
        for selected in self.keys:
            with self.subTest(algorithm=selected.get_name()), self.store(selected=selected) as entry:
                result = self.preflight(entry)
                self.assertTrue(result['ok'])
                self.assertTrue(result['hostKeyTrusted'])
                self.assertFalse(result['writeEnabled'])

    def test_hashed_target_preserves_all_three_algorithms(self):
        for selected in self.keys:
            with self.subTest(algorithm=selected.get_name()), self.store(selected=selected, hashed=True) as entry:
                self.assertTrue(self.preflight(entry)['ok'])

    def test_explicit_pin_selects_only_its_matching_key(self):
        with self.store(selected=self.keys[2], pinned=self.keys[2]) as entry:
            self.assertTrue(self.preflight(entry)['ok'])

    def test_explicit_pin_never_accepts_another_otherwise_trusted_algorithm(self):
        with self.store(selected=self.keys[0], pinned=self.keys[2]) as entry:
            result = self.preflight(entry)
        self.assertEqual(result['errorClass'], 'host_key_mismatch')
        self.assertFalse(result['sshConnected'])

    def test_same_algorithm_different_key_is_rejected_before_connect(self):
        other = paramiko.RSAKey.generate(1024)
        with self.store((self.keys[0], other, self.keys[1])) as entry:
            result = self.preflight(entry)
        self.assertEqual(result['errorClass'], 'host_key_trust_missing')
        self.assertFalse(fixtures.FakeClient.instances)

    def test_duplicate_identical_key_is_rejected_before_connect(self):
        with self.store((self.keys[0], self.keys[0], self.keys[1])) as entry:
            result = self.preflight(entry)
        self.assertEqual(result['errorClass'], 'host_key_trust_missing')
        self.assertFalse(fixtures.FakeClient.instances)

    def test_matching_raw_bytes_with_wrong_algorithm_is_not_trusted(self):
        with self.store() as entry, \
                mock.patch.object(fixtures.FakeKey, 'get_name', return_value=self.keys[1].get_name(), create=True):
            result = self.preflight(entry)
        self.assertEqual(result['errorClass'], 'host_key_mismatch')
        self.assertFalse(result['sshConnected'])

    def test_post_connect_key_identity_is_checked_again(self):
        with self.store() as entry, mock.patch.object(
            fixtures.FakeKey, 'get_name',
            side_effect=[self.keys[0].get_name(), self.keys[1].get_name()], create=True,
        ):
            result = self.preflight(entry)
        self.assertEqual(result['errorClass'], 'host_key_mismatch')
        self.assertTrue(fixtures.FakeClient.instances[0].closed)

    def test_marker_on_target_cannot_be_ignored_because_other_algorithms_exist(self):
        with self.store(marker=True) as entry:
            result = self.preflight(entry)
        self.assertEqual(result['errorClass'], 'host_key_trust_missing')
        self.assertFalse(fixtures.FakeClient.instances)


if __name__ == '__main__':
    unittest.main()
