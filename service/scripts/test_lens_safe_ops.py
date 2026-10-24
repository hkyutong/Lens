"""Synthetic, offline security contracts for the Lens operations boundary."""

import base64
import contextlib
import hashlib
import importlib.util
import inspect
import io
import json
import os
from pathlib import Path
import pprint
import tempfile
import time
import unittest
from unittest.mock import patch


MODULE_PATH = Path(__file__).with_name("lens_safe_ops.py")
if MODULE_PATH.exists():
    spec = importlib.util.spec_from_file_location("lens_safe_ops", MODULE_PATH)
    OPS = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(OPS)
else:
    OPS = None

SYNTHETIC_PASSWORD = "fixture-password-not-a-real-account"
SYNTHETIC_HOST = "fixture.invalid"
PUBLIC_HOST_BYTES = b"synthetic-host-public-key-only"
PIN = "SHA256:" + base64.b64encode(hashlib.sha256(PUBLIC_HOST_BYTES).digest()).decode().rstrip("=")
_SYNTHETIC_PRIVATE_KEY = None


def synthetic_pem(passphrase=None):
    global _SYNTHETIC_PRIVATE_KEY
    import paramiko
    if _SYNTHETIC_PRIVATE_KEY is None:
        _SYNTHETIC_PRIVATE_KEY = paramiko.RSAKey.generate(2048)
    stream = io.StringIO()
    _SYNTHETIC_PRIVATE_KEY.write_private_key(stream, password=passphrase)
    return stream.getvalue()


def fixture(**overrides):
    value = {"host": SYNTHETIC_HOST, "port": 22000, "username": "fixture_user", "password": SYNTHETIC_PASSWORD}
    value.update(overrides)
    return value


def trusted_fixture(**overrides):
    values = {"host_key_fingerprint": PIN, "host_key_source": "user_verified", "host_key_verified": True}
    values.update(overrides)
    return fixture(**values)


def reviewed_fixture(key):
    return trusted_fixture(host_key_fingerprint=OPS._fingerprint(key))


class BaseContract(unittest.TestCase):
    def setUp(self):
        self.assertIsNotNone(OPS, "safe_operations_boundary_not_implemented")
        self.ops = OPS

    def parse(self, value):
        return self.ops.parse_entry(json.dumps(value))

    def assertSafeFailure(self, text, code=None):
        with self.assertRaises(self.ops.SafeFailure) as raised:
            self.ops.parse_entry(text)
        self.assertIn(str(raised.exception), self.ops.ERROR_CLASSES)
        if code:
            self.assertEqual(str(raised.exception), code)
        self.assertNotIn(SYNTHETIC_PASSWORD, repr(raised.exception))
        self.assertNotIn(SYNTHETIC_HOST, str(raised.exception))


class ParserContract(BaseContract):
    def test_json_credentials_are_explicitly_accessible_but_not_enumerable(self):
        secret = self.parse(fixture())
        self.assertEqual(secret.field("host"), SYNTHETIC_HOST)
        self.assertEqual(secret.field("port"), 22000)
        self.assertEqual(secret.field("username"), "fixture_user")
        self.assertEqual(secret.field("password"), SYNTHETIC_PASSWORD)
        self.assertEqual(list(secret), [])
        self.assertEqual(list(secret.items()), [])
        self.assertEqual(dict(secret), {})
        self.assertEqual(json.dumps(secret), "{}")
        self.assertEqual(str(secret), "{}")
        self.assertEqual(repr(secret), "{}")
        self.assertEqual(pprint.pformat(secret), "{}")
        self.assertEqual(inspect.getmembers(secret), [])
        with self.assertRaises(TypeError):
            vars(secret)

    def test_chinese_label_format_and_full_width_separator(self):
        secret = self.ops.parse_entry("服务器地址：fixture.invalid\nSSH端口：22000\n用户名：fixture_user\n密码：fixture-password-not-a-real-account\n")
        self.assertEqual(secret.field("password"), SYNTHETIC_PASSWORD)
        self.assertEqual(secret.field("port"), 22000)

    def test_approved_english_aliases(self):
        secret = self.ops.parse_entry("hostname=fixture.invalid\nssh_port=22000\nssh_user=fixture_user\nssh_password=fixture-password-not-a-real-account")
        self.assertEqual(secret.field("host"), SYNTHETIC_HOST)

    def test_json_duplicate_key_is_rejected(self):
        self.assertSafeFailure('{"host":"fixture.invalid","host":"other.invalid","port":22000,"username":"fixture_user","password":"fixture-password-not-a-real-account"}', "ambiguous_fields")

    def test_duplicate_alias_even_with_same_value_is_rejected(self):
        self.assertSafeFailure(json.dumps(fixture(hostname=SYNTHETIC_HOST)), "ambiguous_fields")

    def test_unknown_fields_are_rejected(self):
        self.assertSafeFailure(json.dumps(fixture(command="unsafe-fixture-command")), "unknown_fields")

    def test_missing_required_field_is_rejected(self):
        value = fixture()
        del value["port"]
        self.assertSafeFailure(json.dumps(value), "missing_fields")

    def test_dual_authentication_is_rejected(self):
        self.assertSafeFailure(json.dumps(fixture(private_key="synthetic-key")), "ambiguous_authentication")

    def test_missing_authentication_is_rejected(self):
        value = fixture()
        del value["password"]
        self.assertSafeFailure(json.dumps(value), "missing_authentication")

    def test_passphrase_without_private_key_is_rejected(self):
        self.assertSafeFailure(json.dumps(fixture(key_passphrase="synthetic-passphrase")), "invalid_authentication")

    def test_port_boolean_out_of_range_and_non_decimal_are_rejected(self):
        for port in [True, 0, 65536, "22;false", "22000.0"]:
            with self.subTest(category=type(port).__name__):
                self.assertSafeFailure(json.dumps(fixture(port=port)), "invalid_fields")

    def test_host_and_username_injection_are_rejected(self):
        for field, value in [("host", "fixture.invalid;false"), ("host", "fixture@invalid"), ("host", "https://fixture.invalid"), ("username", "fixture user"), ("username", "fixture\nuser")]:
            with self.subTest(field=field):
                self.assertSafeFailure(json.dumps(fixture(**{field: value})), "invalid_fields")

    def test_nested_and_non_object_json_are_rejected(self):
        self.assertSafeFailure(json.dumps([fixture()]), "invalid_format")
        self.assertSafeFailure(json.dumps(fixture(password={"fixture": "secret"})), "invalid_fields")

    def test_malformed_json_unknown_line_and_oversize_are_rejected(self):
        self.assertSafeFailure('{"host":', "invalid_format")
        self.assertSafeFailure("unknown fixture line", "invalid_format")
        self.assertSafeFailure("x" * (self.ops.MAX_ENTRY_BYTES + 1), "entry_too_large")

    def test_private_key_text_block_is_supported_without_disk_key_path(self):
        text = "host:fixture.invalid\nport:22000\nusername:fixture_user\nprivate_key:\n" + synthetic_pem()
        secret = self.ops.parse_entry(text)
        self.assertTrue(secret.field("private_key").startswith("-----BEGIN RSA PRIVATE KEY-----"))
        self.assertSafeFailure(json.dumps({"host": SYNTHETIC_HOST, "port": 22000, "username": "fixture_user", "key_path": "/synthetic/private/key"}), "unknown_fields")

    def test_unique_standalone_private_key_with_explicit_labels_is_validated_locally(self):
        text = "host:fixture.invalid\nport:22000\nusername:fixture_user\n" + synthetic_pem()
        with patch.object(self.ops, "run_preflight", side_effect=AssertionError("network_not_allowed")):
            secret = self.ops.parse_entry(text)
        self.assertEqual(secret.field("host"), SYNTHETIC_HOST)
        self.assertEqual(secret.field("username"), "fixture_user")
        self.assertTrue(secret.field("private_key").startswith("-----BEGIN RSA PRIVATE KEY-----"))
        self.assertEqual(json.dumps(secret), "{}")

    def test_standalone_private_key_never_supplies_missing_username_or_ignores_unknown_label(self):
        self.assertSafeFailure("host:fixture.invalid\nport:22000\n" + synthetic_pem(), "missing_fields")
        self.assertSafeFailure("host:fixture.invalid\nport:22000\nunknown-fixture-label:fixture_user\n" + synthetic_pem(), "unknown_fields")

    def test_duplicate_private_key_blocks_and_dual_authentication_are_rejected(self):
        prefix = "host:fixture.invalid\nport:22000\nusername:fixture_user\n"
        self.assertSafeFailure(prefix + synthetic_pem() * 2, "ambiguous_fields")
        self.assertSafeFailure(prefix + "password:fixture-password-not-a-real-account\n" + synthetic_pem(), "ambiguous_authentication")

    def test_private_key_crypto_syntax_failure_has_only_constant_error(self):
        prefix = "host:fixture.invalid\nport:22000\nusername:fixture_user\n"
        self.assertSafeFailure(prefix + "-----BEGIN PRIVATE KEY-----\nc3ludGhldGlj\n-----END PRIVATE KEY-----\n", "invalid_private_key")

    def test_encrypted_standalone_private_key_uses_only_explicit_memory_passphrase(self):
        prefix = "host:fixture.invalid\nport:22000\nusername:fixture_user\n"
        text = prefix + "key_passphrase:synthetic-only-passphrase\n" + synthetic_pem("synthetic-only-passphrase")
        secret = self.ops.parse_entry(text)
        self.assertEqual(secret.field("key_passphrase"), "synthetic-only-passphrase")
        self.assertSafeFailure(prefix + synthetic_pem("synthetic-only-passphrase"), "invalid_private_key")

    def test_partial_or_untrusted_host_key_configuration_is_rejected(self):
        self.assertSafeFailure(json.dumps(fixture(host_key_fingerprint=PIN)), "invalid_host_key_configuration")
        self.assertSafeFailure(json.dumps(trusted_fixture(host_key_source="network_discovery")), "invalid_host_key_configuration")

    def test_nested_host_key_source_and_surrogate_text_have_closed_errors(self):
        self.assertSafeFailure(json.dumps(trusted_fixture(host_key_source={"fixture": "unknown"})), "invalid_host_key_configuration")
        self.assertSafeFailure("\ud800", "invalid_format")

    def test_credentials_can_be_cleared_without_diagnostic_disclosure(self):
        secret = self.parse(fixture())
        secret.close()
        with self.assertRaises(self.ops.SafeFailure) as raised:
            secret.field("host")
        self.assertEqual(str(raised.exception), "credentials_closed")
        self.assertEqual(json.dumps(secret), "{}")

    def test_container_rejects_mutation(self):
        secret = self.parse(fixture())
        for mutation in [lambda: secret.update({"host": SYNTHETIC_HOST}), lambda: secret.__setitem__("host", SYNTHETIC_HOST), lambda: secret.setdefault("host", SYNTHETIC_HOST)]:
            with self.assertRaises(self.ops.SafeFailure):
                mutation()
        self.assertEqual(json.dumps(secret), "{}")


class EntryBoundaryContract(BaseContract):
    def test_entry_path_is_fixed_to_this_project(self):
        self.assertEqual(self.ops._entry_path(), MODULE_PATH.resolve().parents[2] / "服务器.txt")

    def test_regular_private_fixture_entry_can_be_read(self):
        with tempfile.TemporaryDirectory(prefix="lens-ops-synthetic-") as folder:
            path = Path(folder) / "fixture-entry.txt"
            path.write_text(json.dumps(fixture()))
            path.chmod(0o600)
            with patch.object(self.ops, "_entry_path", return_value=path):
                secret = self.ops.load_project_entry()
            self.assertEqual(secret.field("password"), SYNTHETIC_PASSWORD)
            secret.close()

    def test_symlink_wide_permissions_and_missing_entry_are_rejected(self):
        with tempfile.TemporaryDirectory(prefix="lens-ops-synthetic-") as folder:
            path = Path(folder) / "fixture-entry.txt"
            path.write_text(json.dumps(fixture()))
            path.chmod(0o644)
            link = Path(folder) / "fixture-link.txt"
            link.symlink_to(path)
            for target, code in [(path, "entry_permissions_unsafe"), (link, "entry_not_regular"), (Path(folder) / "missing.txt", "entry_unavailable")]:
                with patch.object(self.ops, "_entry_path", return_value=target):
                    with self.assertRaises(self.ops.SafeFailure) as raised:
                        self.ops.load_project_entry()
                self.assertEqual(str(raised.exception), code)

    def test_fifo_entry_is_rejected_before_open(self):
        with tempfile.TemporaryDirectory(prefix="lens-ops-synthetic-") as folder:
            path = Path(folder) / "fixture-pipe"
            os.mkfifo(path, 0o600)
            with patch.object(self.ops, "_entry_path", return_value=path):
                with self.assertRaises(self.ops.SafeFailure) as raised:
                    self.ops.load_project_entry()
            self.assertEqual(str(raised.exception), "entry_not_regular")

    def test_known_hosts_path_is_fixed_and_not_ssh_configuration(self):
        self.assertEqual(self.ops._known_hosts_path(), Path.home() / ".ssh" / "known_hosts")

    def test_private_reader_bounds_input_and_rejects_nonregular_or_unsafe_paths(self):
        with tempfile.TemporaryDirectory(prefix="lens-ops-synthetic-") as folder:
            path = Path(folder) / "fixture-entry.txt"
            path.write_text("x" * 32)
            path.chmod(0o600)
            with self.assertRaises(self.ops.SafeFailure) as raised:
                self.ops._read_private_text(path, maximum=16)
            self.assertEqual(str(raised.exception), "entry_too_large")
            fifo = Path(folder) / "fixture-pipe"
            os.mkfifo(fifo, 0o600)
            with self.assertRaises(self.ops.SafeFailure) as raised:
                self.ops._read_private_text(fifo, maximum=16)
            self.assertEqual(str(raised.exception), "entry_not_regular")

    def test_private_reader_uses_nofollow_nonblock_and_fstat_boundary(self):
        with tempfile.TemporaryDirectory(prefix="lens-ops-synthetic-") as folder:
            path = Path(folder) / "fixture-entry.txt"
            path.write_text("synthetic")
            path.chmod(0o600)
            original_open = os.open
            observed_flags = []

            def observe_open(target, flags):
                observed_flags.append(flags)
                return original_open(target, flags)

            with patch.object(self.ops.os, "open", side_effect=observe_open):
                self.assertEqual(self.ops._read_private_text(path, maximum=32), "synthetic")
            self.assertTrue(observed_flags[0] & os.O_NOFOLLOW)
            self.assertTrue(observed_flags[0] & os.O_NONBLOCK)


class FakeKey:
    def get_name(self):
        return 'ssh-rsa'

    def asbytes(self):
        return PUBLIC_HOST_BYTES


class FakeChannel:
    def exit_status_ready(self):
        return True

    def recv_ready(self):
        return False

    def recv_stderr_ready(self):
        return False

    def recv_exit_status(self):
        return 0


class FakeStream:
    def __init__(self):
        self.channel = FakeChannel()
        self.closed = False

    def close(self):
        self.closed = True

    def read(self):
        raise AssertionError("remote_raw_output_must_not_be_read")


class FakeClient:
    instances = []
    fail_connect = None

    def __init__(self):
        self.closed = False
        self.policy = None
        self.kwargs = None
        self.commands = []
        self.streams = []
        type(self).instances.append(self)

    def set_missing_host_key_policy(self, policy):
        self.policy = policy

    def connect(self, **kwargs):
        self.kwargs = kwargs
        print(SYNTHETIC_PASSWORD)
        if type(self).fail_connect:
            raise type(self).fail_connect
        self.policy.missing_host_key(self, kwargs["hostname"], FakeKey())

    def get_transport(self):
        return self

    def get_remote_server_key(self):
        return FakeKey()

    def exec_command(self, command, **kwargs):
        self.commands.append((command, kwargs))
        self.streams = [FakeStream(), FakeStream(), FakeStream()]
        return tuple(self.streams)

    def close(self):
        self.closed = True


class SshBoundaryContract(BaseContract):
    def setUp(self):
        super().setUp()
        import paramiko
        self.paramiko = paramiko
        FakeClient.instances = []
        FakeClient.fail_connect = None

    def test_unreviewed_or_absent_host_key_cannot_open_connection(self):
        for value, reviewed in [(fixture(), True), (trusted_fixture(), False), (trusted_fixture(host_key_verified=False), True)]:
            with patch.object(self.paramiko, "SSHClient", FakeClient), patch.object(self.ops, "_known_hosts_path", return_value=Path("/synthetic/missing-known-hosts")):
                result = self.ops.run_preflight(self.parse(value), host_key_reviewed=reviewed)
            self.assertFalse(result["sshConnected"])
            self.assertFalse(result["writeEnabled"])
        self.assertEqual(FakeClient.instances, [])

    @contextlib.contextmanager
    def trusted_known_hosts(self, key=None, hostname=None):
        key = key or self.paramiko.RSAKey.generate(1024)
        with tempfile.TemporaryDirectory(prefix="lens-ops-synthetic-") as folder:
            path = Path(folder) / "known_hosts"
            path.write_text((hostname or "[fixture.invalid]:22000") + " " + key.get_name() + " " + key.get_base64() + "\n")
            path.chmod(0o600)
            with patch.object(self.ops, "_known_hosts_path", return_value=path):
                yield key

    def test_verified_pin_uses_memory_credentials_and_only_fixed_read_probe(self):
        output = io.StringIO()
        with self.trusted_known_hosts() as key:
            with contextlib.redirect_stdout(output), patch.object(self.paramiko, "SSHClient", FakeClient), patch.object(FakeKey, "asbytes", return_value=key.asbytes()):
                result = self.ops.run_preflight(self.parse(reviewed_fixture(key)), host_key_reviewed=True)
        client = FakeClient.instances[0]
        self.assertTrue(result["ok"])
        self.assertTrue(result["hostKeyTrusted"])
        self.assertTrue(result["readOnlyProbePassed"])
        self.assertFalse(result["writeEnabled"])
        self.assertEqual(client.kwargs["password"], SYNTHETIC_PASSWORD)
        self.assertFalse(client.kwargs["allow_agent"])
        self.assertFalse(client.kwargs["look_for_keys"])
        self.assertEqual(client.commands[0][0], "true")
        self.assertFalse(client.commands[0][1]["get_pty"])
        self.assertTrue(client.closed)
        self.assertTrue(all(stream.closed for stream in client.streams))
        self.assertEqual(output.getvalue(), "")
        self.assertEqual(set(result), self.ops.RESULT_KEYS)
        self.assertNotIn(SYNTHETIC_PASSWORD, json.dumps(result))
        self.assertNotIn(SYNTHETIC_HOST, json.dumps(result))

    def test_pin_mismatch_closes_client_and_returns_constant_classification(self):
        with self.trusted_known_hosts():
            with patch.object(self.paramiko, "SSHClient", FakeClient):
                result = self.ops.run_preflight(self.parse(trusted_fixture()), host_key_reviewed=True)
        self.assertEqual(result["errorClass"], "host_key_mismatch")
        self.assertEqual(FakeClient.instances, [])
        self.assertFalse(result["sshConnected"])

    def test_raw_library_exception_and_prints_are_suppressed(self):
        FakeClient.fail_connect = self.paramiko.AuthenticationException(SYNTHETIC_PASSWORD + SYNTHETIC_HOST)
        output = io.StringIO()
        with self.trusted_known_hosts() as key:
            with contextlib.redirect_stdout(output), patch.object(self.paramiko, "SSHClient", FakeClient), patch.object(FakeKey, "asbytes", return_value=key.asbytes()):
                result = self.ops.run_preflight(self.parse(reviewed_fixture(key)), host_key_reviewed=True)
        self.assertEqual(result["errorClass"], "authentication_failed")
        self.assertEqual(output.getvalue(), "")
        self.assertNotIn(SYNTHETIC_PASSWORD, json.dumps(result))
        self.assertTrue(FakeClient.instances[0].closed)

    def test_known_host_for_other_target_or_port_does_not_open_connection(self):
        for hostname in ["other-fixture.invalid", "fixture.invalid", "[fixture.invalid]:22001"]:
            with self.trusted_known_hosts(hostname=hostname) as key, patch.object(self.paramiko, "SSHClient", FakeClient):
                result = self.ops.run_preflight(self.parse(reviewed_fixture(key)), host_key_reviewed=True)
            self.assertEqual(result["errorClass"], "host_key_trust_missing")
        self.assertEqual(FakeClient.instances, [])

    def test_handshake_key_mismatch_blocks_before_authentication_and_closes_client(self):
        with self.trusted_known_hosts() as key, patch.object(self.paramiko, "SSHClient", FakeClient):
            result = self.ops.run_preflight(self.parse(reviewed_fixture(key)), host_key_reviewed=True)
        self.assertEqual(result["errorClass"], "host_key_mismatch")
        self.assertTrue(FakeClient.instances[0].closed)
        self.assertFalse(result["sshConnected"])

    def test_duplicate_different_known_host_keys_are_not_silently_overwritten(self):
        key = self.paramiko.RSAKey.generate(1024)
        other_key = self.paramiko.RSAKey.generate(1024)
        with tempfile.TemporaryDirectory(prefix="lens-ops-synthetic-") as folder:
            path = Path(folder) / "known_hosts"
            path.write_text("\n".join("[fixture.invalid]:22000 " + candidate.get_name() + " " + candidate.get_base64() for candidate in [key, other_key]) + "\n")
            path.chmod(0o600)
            with patch.object(self.ops, "_known_hosts_path", return_value=path), patch.object(self.paramiko, "SSHClient", FakeClient):
                result = self.ops.run_preflight(self.parse(reviewed_fixture(key)), host_key_reviewed=True)
        self.assertEqual(result["errorClass"], "host_key_trust_missing")
        self.assertEqual(FakeClient.instances, [])

    def test_user_entry_trust_strings_do_not_replace_known_hosts(self):
        with patch.object(self.ops, "_known_hosts_path", return_value=Path("/synthetic/missing-known-hosts")), patch.object(self.paramiko, "SSHClient", FakeClient):
            result = self.ops.run_preflight(self.parse(trusted_fixture()), host_key_reviewed=True)
        self.assertFalse(result["sshConnected"])
        self.assertEqual(FakeClient.instances, [])

    def test_known_hosts_maximum_size_blocks_before_network(self):
        with tempfile.TemporaryDirectory(prefix="lens-ops-synthetic-") as folder:
            path = Path(folder) / "known_hosts"
            path.write_text("x" * (self.ops.MAX_KNOWN_HOSTS_BYTES + 1))
            path.chmod(0o600)
            with patch.object(self.ops, "_known_hosts_path", return_value=path), patch.object(self.paramiko, "SSHClient", FakeClient):
                result = self.ops.run_preflight(self.parse(trusted_fixture()), host_key_reviewed=True)
        self.assertEqual(result["errorClass"], "host_key_trust_missing")
        self.assertEqual(FakeClient.instances, [])

    def test_probe_timeout_is_bounded_without_raw_remote_output(self):
        class UnreadyChannel(FakeChannel):
            def exit_status_ready(self):
                return False

        with self.trusted_known_hosts() as key:
            with patch.object(self.paramiko, "SSHClient", FakeClient), patch.object(FakeKey, "asbytes", return_value=key.asbytes()), patch.object(FakeStream, "__init__", lambda stream: setattr(stream, "channel", UnreadyChannel())), patch.object(self.ops.time, "monotonic", side_effect=[0, 20]):
                result = self.ops.run_preflight(self.parse(reviewed_fixture(key)), host_key_reviewed=True)
        self.assertEqual(result["errorClass"], "probe_failed")
        self.assertTrue(FakeClient.instances[0].closed)


class CliContract(BaseContract):
    def test_unknown_write_and_arbitrary_arguments_do_not_read_entry(self):
        with patch.object(self.ops, "load_project_entry", side_effect=AssertionError("entry_read_not_allowed")):
            for argv in [[], ["deploy"], ["exec", SYNTHETIC_PASSWORD], ["validate", "--entry", SYNTHETIC_HOST], ["preflight"]]:
                output = io.StringIO()
                with contextlib.redirect_stdout(output):
                    exit_code = self.ops.main(argv)
                self.assertNotEqual(exit_code, 0)
                value = json.loads(output.getvalue())
                self.assertEqual(set(value), self.ops.RESULT_KEYS)
                self.assertFalse(value["writeEnabled"])
                self.assertNotIn(SYNTHETIC_PASSWORD, output.getvalue())
                self.assertNotIn(SYNTHETIC_HOST, output.getvalue())

    def test_validate_outputs_only_schema_and_clears_credentials(self):
        secret = self.parse(fixture())
        with patch.object(self.ops, "load_project_entry", return_value=secret):
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(self.ops.main(["validate"]), 0)
        value = json.loads(output.getvalue())
        self.assertTrue(value["entryValid"])
        self.assertFalse(value["sshConnected"])
        self.assertEqual(set(value), self.ops.RESULT_KEYS)
        with self.assertRaises(self.ops.SafeFailure):
            secret.field("password")


class FormatDiagnosticContract(BaseContract):
    def assertClosedDiagnostic(self, text, expected_class, expected_recognized=None):
        result = self.ops.diagnose_format(text)
        self.assertEqual(set(result), self.ops.FORMAT_RESULT_KEYS)
        self.assertEqual(result["formatClass"], expected_class)
        self.assertIn(result["parseErrorClass"], self.ops.ERROR_CLASSES)
        if expected_recognized is not None:
            self.assertEqual(result["recognizedAliasCount"], expected_recognized)
        self.assertFalse(result["networkAttempted"])
        self.assertFalse(result["entryRead"])
        output = json.dumps(result)
        self.assertNotIn(SYNTHETIC_PASSWORD, output)
        self.assertNotIn(SYNTHETIC_HOST, output)
        self.assertNotIn("unknown-fixture-label", output)
        return result

    def test_json_format_is_classified_without_values(self):
        result = self.assertClosedDiagnostic(json.dumps(fixture()), "json", 4)
        self.assertEqual(result["parseErrorClass"], "none")
        self.assertTrue(result["hasRequiredConnectionLabels"])
        self.assertTrue(result["hasAuthenticationLabel"])

    def test_colon_and_equal_formats_only_count_approved_aliases(self):
        colon = "服务器地址：fixture.invalid\nSSH端口：22000\n用户名：fixture_user\n密码：fixture-password-not-a-real-account"
        equal = "hostname=fixture.invalid\nssh_port=22000\nssh_user=fixture_user\nssh_password=fixture-password-not-a-real-account"
        self.assertClosedDiagnostic(colon, "keyvalue_colon", 4)
        self.assertClosedDiagnostic(equal, "keyvalue_equal", 4)

    def test_headings_and_fences_are_presence_flags_without_raw_text(self):
        heading = "# unknown-fixture-label\n服务器地址：fixture.invalid\nSSH端口：22000\n用户名：fixture_user\n密码：fixture-password-not-a-real-account"
        fenced = "```text\n" + heading + "\n```"
        result = self.assertClosedDiagnostic(heading, "mixed", 4)
        self.assertTrue(result["hasHeadings"])
        result = self.assertClosedDiagnostic(fenced, "mixed", 4)
        self.assertTrue(result["hasFences"])

    def test_unlabeled_empty_and_unknown_fields_are_closed(self):
        self.assertClosedDiagnostic("", "empty", 0)
        self.assertClosedDiagnostic(SYNTHETIC_PASSWORD, "unlabeled", 0)
        result = self.assertClosedDiagnostic("unknown-fixture-label: " + SYNTHETIC_PASSWORD, "keyvalue_colon", 0)
        self.assertTrue(result["hasUnknownLabels"])
        self.assertEqual(result["parseErrorClass"], "unknown_fields")

    def test_malformed_json_and_private_key_block_have_only_presence(self):
        self.assertClosedDiagnostic('{"host":', "json", 0)
        result = self.assertClosedDiagnostic("-----BEGIN PRIVATE KEY-----\nsynthetic-key\n-----END PRIVATE KEY-----", "unlabeled", 0)
        self.assertTrue(result["hasUnlabelledPrivateKeyBlock"])

    def test_project_diagnostic_cli_cannot_connect(self):
        with patch.object(self.ops, "_load_project_text", return_value=json.dumps(fixture())), patch.object(self.ops, "run_preflight", side_effect=AssertionError("network_not_allowed")):
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                self.assertEqual(self.ops.main(["diagnose-format"]), 0)
        result = json.loads(output.getvalue())
        self.assertEqual(set(result), self.ops.FORMAT_RESULT_KEYS)
        self.assertTrue(result["entryRead"])
        self.assertFalse(result["networkAttempted"])

    def test_entry_read_error_has_no_input_or_path_details(self):
        with patch.object(self.ops, "_load_project_text", side_effect=self.ops.SafeFailure("entry_permissions_unsafe")):
            result = self.ops.diagnose_project_format()
        self.assertFalse(result["ok"])
        self.assertEqual(result["parseErrorClass"], "entry_permissions_unsafe")
        self.assertEqual(set(result), self.ops.FORMAT_RESULT_KEYS)

    def test_standalone_ssh_and_private_key_have_only_closed_presence_flags(self):
        text = "ssh -p 22000 fixture_user@fixture.invalid\n-----BEGIN PRIVATE KEY-----\nc3ludGhldGlj\n-----END PRIVATE KEY-----\nunknown-fixture-label: synthetic-information\n"
        result = self.assertClosedDiagnostic(text, "mixed", 0)
        self.assertTrue(result["hasStandaloneSshCommand"])
        self.assertTrue(result["standaloneSshCommandSafe"])
        self.assertTrue(result["sshCommandHasHost"])
        self.assertTrue(result["sshCommandHasPort"])
        self.assertTrue(result["sshCommandHasUsername"])
        self.assertTrue(result["pemBlockWellFormed"])
        self.assertEqual(result["unknownLabelCount"], 1)
        self.assertFalse(result["hasHostAlias"])
        self.assertFalse(result["hasPortAlias"])
        self.assertFalse(result["hasUsernameAlias"])
        self.assertFalse(result["hasAuthenticationAlias"])

    def test_known_chinese_alias_presence_does_not_guess_unknown_meaning(self):
        text = "公网IP地址: fixture.invalid\nSSH登录端口: 22000\n登录用户名: fixture_user\nSSH登录密码: fixture-password-not-a-real-account\nunknown-fixture-label: synthetic-information"
        result = self.assertClosedDiagnostic(text, "keyvalue_colon", 4)
        self.assertTrue(result["hasHostAlias"])
        self.assertTrue(result["hasPortAlias"])
        self.assertTrue(result["hasUsernameAlias"])
        self.assertTrue(result["hasAuthenticationAlias"])
        self.assertEqual(result["unknownLabelCount"], 1)
        self.assertEqual(result["parseErrorClass"], "unknown_fields")

    def test_unsafe_standalone_ssh_never_becomes_safe_or_parsed(self):
        for command in ["ssh -p 22000 fixture_user@fixture.invalid; false", "ssh -oProxyCommand=synthetic fixture_user@fixture.invalid", "ssh -p 22000 fixture_user@$(synthetic)", "ssh -p 22000 fixture_user@fixture.invalid whoami", "ssh -i /synthetic/key fixture_user@fixture.invalid", "ssh -F /synthetic/config fixture_user@fixture.invalid", "ssh fixture_user@fixture.invalid | synthetic"]:
            with self.subTest(category="unsafe_syntax"):
                result = self.assertClosedDiagnostic(command, "unlabeled", 0)
                self.assertTrue(result["hasStandaloneSshCommand"])
                self.assertFalse(result["standaloneSshCommandSafe"])
                self.assertEqual(result["unknownLabelCount"], 0)

    def test_incomplete_or_multiple_pem_blocks_are_not_wellformed(self):
        for text in ["-----BEGIN PRIVATE KEY-----\nc3ludGhldGlj", "-----BEGIN PRIVATE KEY-----\nc3ludGhldGlj\n-----END RSA PRIVATE KEY-----", ("-----BEGIN PRIVATE KEY-----\nc3ludGhldGlj\n-----END PRIVATE KEY-----\n" * 2)]:
            result = self.assertClosedDiagnostic(text, "unlabeled", 0)
            self.assertFalse(result["pemBlockWellFormed"])

    def test_safe_ssh_grammar_is_exact_and_has_no_execution(self):
        for command in ["ssh -p 22000 fixture_user@fixture.invalid", "ssh fixture_user@fixture.invalid -p 22000", "ssh -p22000 fixture_user@fixture.invalid", "ssh fixture_user@fixture.invalid -p22000"]:
            fields = self.ops._standalone_ssh_fields(command)
            self.assertEqual(set(fields), {"host", "port", "username"})
            self.assertEqual(fields["host"], SYNTHETIC_HOST)
            self.assertEqual(fields["port"], 22000)
        self.assertEqual(set(self.ops._standalone_ssh_fields("ssh fixture_user@fixture.invalid")), {"host", "username"})

    def test_username_alias_candidates_use_only_exact_approved_dictionary(self):
        for label in ['SSH账号', 'SSH账户', 'ssh user name', 'user_name']:
            result = self.assertClosedDiagnostic(label + ': fixture_user', 'keyvalue_colon', 0)
            self.assertTrue(result['usernameAliasCandidateApproved'])
            self.assertEqual(result['unknownLabelCount'], 1)
            self.assertFalse(result['hasUsernameAlias'])
            self.assertEqual(result['parseErrorClass'], 'unknown_fields')

    def test_username_alias_candidate_does_not_use_substring_or_values(self):
        for label in ["unknown ssh user label", "ssh user fixture_user", "fixture_user", "账户 fixture_user", "unknown-fixture-label"]:
            result = self.assertClosedDiagnostic(label + ": fixture_user", "keyvalue_colon", 0)
            self.assertFalse(result["usernameAliasCandidateApproved"])
            self.assertEqual(result["unknownLabelCount"], 1)




class ExplicitUsernameAliasCompatibilityTests(unittest.TestCase):
    """Only named username labels gain compatibility; fixtures stay synthetic."""

    aliases = ('user name', 'ssh user', 'login user', 'ssh username', 'login username', '登录用户', '登陆用户名', '登陆用户', '用户', '用户名称', '登录账号', '登陆账号', '账户', '帐户')

    @classmethod
    def setUpClass(cls):
        import io
        import paramiko
        try:
            from . import lens_safe_ops
        except ImportError:
            import lens_safe_ops
        cls.ops = lens_safe_ops
        buffer = io.StringIO()
        try:
            paramiko.RSAKey.generate(2048).write_private_key(buffer)
            cls.synthetic_pem = buffer.getvalue()
        finally:
            buffer.close()

    @classmethod
    def tearDownClass(cls):
        cls.synthetic_pem = None

    @classmethod
    def entry(cls, label, extra=""):
        return (
            "host: fixture.invalid\nport: 2222\n"
            + label + ": fixture-user\n"
            + extra + cls.synthetic_pem
        )

    def test_explicit_username_aliases_parse(self):
        for label in self.aliases:
            with self.subTest(label=label):
                parsed = self.ops.parse_entry(self.entry(label))
                self.assertIsNotNone(parsed)
                self.assertNotIn("fixture-user", repr(parsed))
                self.assertNotIn("PRIVATE KEY", repr(parsed))

    def test_aliases_reject_duplicate_username_fields(self):
        for label in self.aliases:
            with self.subTest(label=label):
                with self.assertRaises(self.ops.SafeFailure):
                    self.ops.parse_entry(
                        self.entry("username", label + ": other-fixture-user\n")
                    )

    def test_username_label_substrings_stay_unknown(self):
        for label in (
            "user name extra", "my ssh user", "login username note",
            "用户备注", "账户说明", "登录用户详情",
        ):
            with self.subTest(label=label):
                with self.assertRaises(self.ops.SafeFailure):
                    self.ops.parse_entry(self.entry(label))

if __name__ == "__main__":
    suite = unittest.defaultTestLoader.loadTestsFromModule(__import__(__name__))
    result = unittest.TextTestRunner(stream=io.StringIO(), verbosity=0).run(suite)
    print(json.dumps({"ok": result.wasSuccessful(), "testsRun": result.testsRun, "failureCount": len(result.failures), "errorCount": len(result.errors), "failedTests": [test.id().split(".")[-1] for test, _ in result.failures + result.errors]}, sort_keys=True))
    raise SystemExit(0 if result.wasSuccessful() else 1)
