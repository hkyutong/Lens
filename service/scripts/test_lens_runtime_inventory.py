"""Synthetic transport tests for the fixed read-only runtime probe."""

import contextlib
import io
import json
import unittest
from unittest import mock

import paramiko

import lens_safe_ops as ops
import test_lens_safe_ops as fixtures


class InventoryChannel:
    def __init__(self, data, exit_code=0):
        self.data = data
        self.exit_code = exit_code

    def recv_ready(self):
        return bool(self.data)

    def recv(self, size):
        chunk, self.data = self.data[:size], self.data[size:]
        return chunk

    def recv_stderr_ready(self):
        return False

    def exit_status_ready(self):
        return not self.data

    def recv_exit_status(self):
        return self.exit_code


class InventoryStream:
    def __init__(self, channel):
        self.channel = channel
        self.writes = []
        self.closed = False

    def write(self, value):
        self.writes.append(value)

    def flush(self):
        pass

    def close(self):
        self.closed = True


class InventoryClient(fixtures.FakeClient):
    payload = b''
    exit_code = 0

    def exec_command(self, command, **options):
        self.commands.append((command, options))
        channel = InventoryChannel(type(self).payload, type(self).exit_code)
        self.probe_streams = tuple(InventoryStream(channel) for _ in range(3))
        return self.probe_streams


class RuntimeInventoryContract(unittest.TestCase):
    def setUp(self):
        self.ops = ops
        self.paramiko = paramiko
        fixtures.FakeClient.instances = []
        fixtures.FakeClient.fail_connect = None
        InventoryClient.exit_code = 0
        InventoryClient.payload = json.dumps({
            'lensPm2CandidateCount': 1,
            'lensDockerCandidateCount': 2,
            'lensPm2WatchEnabled': True,
            'runtimeUndetermined': False,
        }).encode('ascii')

    @contextlib.contextmanager
    def trusted(self):
        with fixtures.SshBoundaryContract.trusted_known_hosts(self) as key, \
                mock.patch.object(paramiko, 'SSHClient', InventoryClient), \
                mock.patch.object(fixtures.FakeKey, 'asbytes', return_value=key.asbytes()):
            secrets = ops.parse_entry(json.dumps(fixtures.reviewed_fixture(key)))
            try:
                yield secrets
            finally:
                secrets.close()

    def test_fixed_stdin_program_returns_only_inventory_and_existing_status_schema(self):
        with self.trusted() as secrets:
            result = ops.run_runtime_inventory(secrets, host_key_reviewed=True)
        self.assertTrue(result['ok'])
        self.assertEqual(result['lensPm2CandidateCount'], 1)
        self.assertEqual(result['lensDockerCandidateCount'], 2)
        self.assertTrue(result['lensPm2WatchEnabled'])
        self.assertFalse(result['runtimeUndetermined'])
        self.assertFalse(result['writeEnabled'])
        self.assertEqual(set(result), {
            'ok', 'entryValid', 'hostKeyTrusted', 'sshConnected', 'readOnlyProbePassed',
            'writeEnabled', 'errorClass', 'lensPm2CandidateCount', 'lensDockerCandidateCount',
            'lensPm2WatchEnabled', 'runtimeUndetermined',
        })
        client = fixtures.FakeClient.instances[0]
        self.assertTrue(client.commands[0][0] == 'python3 -I -')
        self.assertTrue(bool(client.probe_streams[0].writes))
        self.assertTrue(all(stream.closed for stream in client.probe_streams))
        self.assertTrue(client.closed)

    def test_unreviewed_connection_never_starts_inventory(self):
        with self.trusted() as secrets:
            result = ops.run_runtime_inventory(secrets, host_key_reviewed=False)
        self.assertEqual(result['errorClass'], 'host_key_review_required')
        self.assertTrue(result['runtimeUndetermined'])
        self.assertFalse(fixtures.FakeClient.instances)

    def test_handshake_mismatch_never_starts_inventory(self):
        with self.trusted() as secrets, \
                mock.patch.object(fixtures.FakeKey, 'asbytes', return_value=b'synthetic-untrusted-key'):
            result = ops.run_runtime_inventory(secrets, host_key_reviewed=True)
        self.assertEqual(result['errorClass'], 'host_key_mismatch')
        self.assertFalse(fixtures.FakeClient.instances[0].commands)

    def test_unknown_keys_raw_metadata_and_exception_text_are_never_returned(self):
        marker = 'synthetic-private-payload-marker'
        InventoryClient.payload = json.dumps({'unexpected_metadata': marker}).encode('ascii')
        output = io.StringIO()
        with self.trusted() as secrets, contextlib.redirect_stdout(output), contextlib.redirect_stderr(output):
            result = ops.run_runtime_inventory(secrets, host_key_reviewed=True)
        self.assertFalse(result['ok'])
        self.assertTrue(result['runtimeUndetermined'])
        self.assertFalse(marker in json.dumps(result))
        self.assertTrue(output.getvalue() == '')

    def test_invalid_counts_booleans_and_excessive_payload_fail_closed(self):
        baseline = json.loads(InventoryClient.payload)
        candidates = [
            {**baseline, 'lensPm2CandidateCount': True},
            {**baseline, 'lensDockerCandidateCount': -1},
            {**baseline, 'lensDockerCandidateCount': 4097},
            {**baseline, 'lensPm2WatchEnabled': 'true'},
        ]
        for value in candidates:
            with self.subTest(value_class='synthetic-invalid-field'):
                InventoryClient.payload = json.dumps(value).encode('ascii')
                with self.trusted() as secrets:
                    result = ops.run_runtime_inventory(secrets, host_key_reviewed=True)
                self.assertFalse(result['ok'])
                self.assertTrue(result['runtimeUndetermined'])
        InventoryClient.payload = b' ' * 8193
        with self.trusted() as secrets:
            result = ops.run_runtime_inventory(secrets, host_key_reviewed=True)
        self.assertFalse(result['ok'])

    def test_remote_nonzero_status_never_reports_success(self):
        InventoryClient.exit_code = 1
        with self.trusted() as secrets:
            result = ops.run_runtime_inventory(secrets, host_key_reviewed=True)
        self.assertFalse(result['ok'])
        self.assertTrue(result['runtimeUndetermined'])


if __name__ == '__main__':
    unittest.main()
