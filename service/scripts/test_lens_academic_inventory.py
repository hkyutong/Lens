import contextlib
import hashlib
import http.server
import threading
import hmac
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

import lens_academic_inventory as inventory


class InventoryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="synthetic-academic-inventory-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.proc = self.root / "proc"
        self.fs = self.root / "filesystem"
        self.proc.mkdir()
        self.fs.mkdir()
        self.secret = "synthetic-secret-for-inventory-only-" * 2
        self.environment = {
            "LENS_ACADEMIC_INTERNAL_SECRET": self.secret,
            "LENS_ACADEMIC_WORKSPACE_ROOT": "/synthetic/data/workspace",
            "PATH_LOGGING": "/synthetic/data/logs",
            "PATH_PRIVATE_UPLOAD": "/synthetic/data/uploads",
            "PM2_HOME": "/synthetic/manager", "pm_id": "2",
        }
        self.source = "/synthetic/academic"
        for role in inventory.ARTIFACTS:
            path = self.fs / self.source.lstrip("/") / role
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("# synthetic runtime source\n")
        for name in ["LENS_ACADEMIC_WORKSPACE_ROOT", "PATH_LOGGING", "PATH_PRIVATE_UPLOAD"]:
            (self.fs / self.environment[name].lstrip("/")).mkdir(parents=True)
        self.make_process(2, "/synthetic/node", "/synthetic/manager", ["node", "PM2 synthetic daemon"], {}, 1)
        self.make_process(10, "/synthetic/python", self.source, ["python", "shared_utils/fastapi_stream_server.py"], self.environment, 2)
        node_source = self.fs / "synthetic/service/src/modules/academic/academic.service.ts"
        node_source.parent.mkdir(parents=True)
        node_source.write_text("// synthetic node source\n")
        self.make_process(11, "/synthetic/node", "/synthetic/service", ["node", "dist/main.js"], self.environment, 2)
        (self.proc / "self/ns").mkdir(parents=True)
        (self.proc / "self/ns/net").symlink_to("net:[synthetic]")

    def make_process(self, identifier, executable, cwd, arguments, environment, parent):
        directory = self.proc / str(identifier)
        directory.mkdir()
        (directory / "exe").symlink_to(executable)
        (directory / "cwd").symlink_to(cwd)
        (directory / "root").symlink_to(self.fs)
        (directory / "cmdline").write_bytes(b"\0".join(value.encode() for value in arguments) + b"\0")
        self.write_environment(identifier, environment)
        (directory / "status").write_text("PPid:\t" + str(parent) + "\n")
        (directory / "cgroup").write_text("0::/synthetic.slice\n")
        (directory / "ns").mkdir()
        (directory / "ns/net").symlink_to("net:[synthetic]")
        (directory / "fd").mkdir()
        (directory / "fd/3").symlink_to("socket:[900]")
        (directory / "net").mkdir()
        (directory / "net/tcp").write_text(
            "header\n"
            "0: 0100007F:2345 00000000:0000 0A 0:0 0:0 0 0 0 900\n"
            "1: 0100007F:2346 00000000:0000 0A 0:0 0:0 0 0 0 901\n"
        )

    def write_environment(self, identifier, environment):
        (self.proc / str(identifier) / "environ").write_bytes(
            b"\0".join((key + "=" + value).encode() for key, value in environment.items()) + b"\0"
        )

    def healthy_flags(self):
        return {name: True for name in ["health_ok", "unsigned_file_rejected", "invalid_signature_rejected", "signed_unknown_report_rejected"]}

    def test_fixed_private_configuration_covers_post_exec_environment_loading(self):
        runtime = inventory.discover(self.proc)[0][0]
        configuration = {
            "version": 1, "secret": self.secret,
            "workspace_root": self.environment["LENS_ACADEMIC_WORKSPACE_ROOT"],
            "log_root": self.environment["PATH_LOGGING"],
            "upload_root": self.environment["PATH_PRIVATE_UPLOAD"],
        }
        path = runtime._view / ".lens-academic-private.json"
        path.write_text(json.dumps(configuration))
        path.chmod(0o600)
        initial = {key: value for key, value in self.environment.items() if key in {"PM2_HOME", "pm_id"}}
        effective = inventory.effective_environment(runtime._process, runtime._view, initial)
        self.assertEqual(effective["LENS_ACADEMIC_INTERNAL_SECRET"], self.secret)
        self.assertNotIn("LENS_ACADEMIC_INTERNAL_SECRET", initial)
        with self.assertRaises(ValueError):
            inventory.effective_environment(runtime._process, runtime._view, dict(initial, PATH_LOGGING="/synthetic/conflicting"))
        path.chmod(0o644)
        with self.assertRaises(ValueError):
            inventory.effective_environment(runtime._process, runtime._view, initial)

    def test_health_diagnostic_uses_fixed_categories_without_response_body(self):
        runtime = inventory.discover(self.proc)[0][0]
        cases = [
            (0, b"", "unreachable"), (302, b"", "unexpected_status"), (404, b"", "missing_route"), (401, b"", "unauthorized"),
            (503, b"", "server_error"), (200, b"synthetic invalid schema", "invalid_schema"),
        ]
        for code, body, expected in cases:
            with patch.object(inventory, "_request", return_value=(code, body)):
                result = inventory._readiness(runtime, {("127.0.0.1", 9029)})
            self.assertEqual(result["health_state"], expected)
            self.assertFalse(result["health_ok"])
            self.assertNotIn(body.decode() or "synthetic-body-placeholder", json.dumps(result))

    def test_http_probe_does_not_follow_redirect_to_another_listener(self):
        counts = {"source": 0, "target": 0}
        class Target(http.server.BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass
            def do_GET(self):
                counts["target"] += 1
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b'{"status":"ready","service":"academic-runtime","contract":"lens-academic-v1"}')
        target = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Target)
        class Source(http.server.BaseHTTPRequestHandler):
            def log_message(self, *_args):
                pass
            def do_GET(self):
                counts["source"] += 1
                self.send_response(302)
                self.send_header("Location", "http://127.0.0.1:" + str(target.server_port) + "/health")
                self.end_headers()
        source = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Source)
        threads = [threading.Thread(target=server.serve_forever, daemon=True) for server in (source, target)]
        for thread in threads:
            thread.start()
        try:
            code, body = inventory._request(("127.0.0.1", source.server_port), "/health")
            self.assertEqual(code, 302)
            self.assertEqual(body, b"")
            self.assertEqual(counts, {"source": 1, "target": 0})
        finally:
            for server in (source, target):
                server.shutdown()
                server.server_close()
            for thread in threads:
                thread.join(timeout=2)

    def test_complete_observed_process_contract_passes(self):
        with patch.object(inventory, "_readiness", return_value=self.healthy_flags()):
            result = inventory.inventory(self.proc)
        self.assertTrue(result["ok"])
        self.assertEqual(result["process_count"], 1)
        self.assertEqual(result["artifact_count"], 8)
        self.assertEqual(result["listener_count"], 1)
        self.assertEqual(result["manager"], "pm2")
        self.assertTrue(result["shared_workspace_match"])
        self.assertNotIn(self.secret, json.dumps(result))
        self.assertNotIn(self.source, json.dumps(result))

    def test_runtime_object_cannot_be_serialized_or_expanded(self):
        runtime = inventory.discover(self.proc)[0][0]
        self.assertEqual(repr(runtime), "<AcademicRuntime redacted>")
        self.assertFalse(hasattr(runtime, "__dict__"))
        with self.assertRaises(TypeError):
            json.dumps(runtime)

    def test_ambiguous_python_workers_fail_closed(self):
        self.make_process(12, "/synthetic/python", self.source, ["python", "shared_utils/fastapi_stream_server.py"], self.environment, 2)
        result = inventory.inventory(self.proc, probe=False)
        self.assertEqual(result["error"], "academic_process_ambiguous")
        self.assertFalse(result["ok"])

    def test_missing_process_is_not_replaced_with_guessed_path(self):
        with patch.object(inventory, "_source_root", return_value=None):
            result = inventory.inventory(self.proc, probe=False)
        self.assertEqual(result["error"], "academic_process_missing")
        self.assertEqual(result["process_count"], 0)

    def test_stopped_definition_is_read_only_from_observed_pm2_home(self):
        manager = self.fs / "synthetic/manager"
        manager.mkdir(parents=True)
        interpreter = self.fs / "synthetic/bin/python"
        interpreter.parent.mkdir(parents=True)
        interpreter.write_text("synthetic executable")
        interpreter.chmod(0o700)
        (manager / "dump.pm2").write_text(json.dumps([{
            "pm_exec_path": self.source + "/shared_utils/fastapi_stream_server.py",
            "pm_cwd": self.source, "exec_interpreter": "/synthetic/bin/python",
            "env": {"SYNTHETIC_PRIVATE": self.secret},
        }]))
        observed = inventory.discover(self.proc)
        with patch.object(inventory, "discover", return_value=([], observed[1])):
            result = inventory.inventory(self.proc, probe=False)
        self.assertEqual(result["error"], "academic_definition_found")
        self.assertEqual(result["saved_definition_count"], 1)
        self.assertTrue(result["definition_interpreter_available"])
        self.assertTrue(result["rollback_preserves_initial_state"])
        self.assertFalse(result["entrypoint_from_process"])
        self.assertFalse(result["ok"])
        self.assertNotIn(self.secret, json.dumps(result))

    def test_saved_config_does_not_guess_missing_interpreter(self):
        manager = self.fs / "synthetic/manager"
        manager.mkdir(parents=True)
        (manager / "dump.pm2").write_text(json.dumps([{
            "pm_exec_path": self.source + "/shared_utils/fastapi_stream_server.py",
            "pm_cwd": self.source, "exec_interpreter": "python-synthetic-missing",
        }]))
        nodes = inventory.discover(self.proc)[1]
        definitions = inventory.saved_pm2_definitions(self.proc, nodes)
        self.assertEqual(len(definitions), 1)
        self.assertIsNone(definitions[0]._interpreter)
        self.assertEqual(repr(definitions[0]), "<AcademicDefinition redacted>")
        with self.assertRaises(TypeError):
            json.dumps(definitions[0])

    def test_unreadable_processes_do_not_claim_complete_visibility(self):
        original = inventory._snapshot
        def snapshot(proc, identifier):
            if str(identifier) == "10":
                raise PermissionError("synthetic private diagnostic")
            return original(proc, identifier)
        with patch.object(inventory, "_snapshot", side_effect=snapshot):
            result = inventory.inventory(self.proc, probe=False)
        self.assertEqual(result["error"], "process_visibility_incomplete")
        self.assertFalse(result["discovery_complete"])
        self.assertEqual(result["unreadable_process_count"], 1)

    def test_symlink_private_root_into_code_is_rejected(self):
        root = self.fs / self.environment["PATH_LOGGING"].lstrip("/")
        root.rmdir()
        root.symlink_to(self.fs / self.source.lstrip("/"), target_is_directory=True)
        result = inventory.inventory(self.proc, probe=False)
        self.assertFalse(result["private_roots_outside_code"])

    def test_same_secret_does_not_mask_different_workspace(self):
        peer = dict(self.environment, LENS_ACADEMIC_WORKSPACE_ROOT="/synthetic/data/other-workspace")
        (self.fs / peer["LENS_ACADEMIC_WORKSPACE_ROOT"].lstrip("/")).mkdir()
        self.write_environment(11, peer)
        result = inventory.inventory(self.proc, probe=False)
        self.assertTrue(result["shared_secret_match"])
        self.assertFalse(result["shared_workspace_match"])

    def test_unmanaged_process_does_not_receive_restart_contract(self):
        self.write_environment(10, {key: value for key, value in self.environment.items() if key not in {"PM2_HOME", "pm_id"}})
        result = inventory.inventory(self.proc, probe=False)
        self.assertEqual(result["manager"], "unresolved")
        self.assertFalse(result["manager_actions_resolved"])

    def test_foreign_network_namespace_skips_health_probe(self):
        link = self.proc / "10/ns/net"
        link.unlink()
        link.symlink_to("net:[synthetic-other]")
        with patch.object(inventory, "_readiness") as probe:
            result = inventory.inventory(self.proc)
        self.assertFalse(result["same_network_namespace"])
        probe.assert_not_called()

    def test_hmac_probe_is_bound_to_kernel_endpoint_and_uses_distinct_nonces(self):
        runtime = inventory.discover(self.proc)[0][0]
        seen = []
        def respond(endpoint, path, headers=None):
            self.assertEqual(endpoint, ("127.0.0.1", 9029))
            if path == "/health":
                return 200, b'{"status":"ready","service":"academic-runtime","contract":"lens-academic-v1"}'
            if not headers:
                return 403, b""
            seen.append(headers["X-Lens-Academic-Nonce"])
            canonical = "\n".join([
                "GET", path, hashlib.sha256(b"").hexdigest(),
                headers["X-Lens-Academic-Timestamp"], headers["X-Lens-Academic-Nonce"],
                headers["X-Lens-Academic-Owner"], headers["X-Lens-Academic-Request"],
            ])
            expected = hmac.new(self.secret.encode(), canonical.encode(), hashlib.sha256).hexdigest()
            return (404 if hmac.compare_digest(expected, headers["X-Lens-Academic-Signature"]) else 403), b""
        with patch.object(inventory, "_request", side_effect=respond):
            result = inventory._readiness(runtime, {("127.0.0.1", 9029)})
        self.assertTrue(all(result.values()))
        self.assertEqual(len(set(seen)), 2)

    def test_closed_projection_rejects_sensitive_extra_fields_and_wrong_types(self):
        valid = inventory.empty_result()
        self.assertEqual(inventory.parse_inventory(json.dumps(valid)), valid)
        for invalid in [dict(valid, raw_secret=self.secret), dict(valid, process_count=True), dict(valid, manager=self.source)]:
            result = inventory.parse_inventory(json.dumps(invalid))
            self.assertEqual(result["error"], "inventory_invalid")
            self.assertNotIn(self.secret, json.dumps(result))

    def test_systemd_parent_cgroup_requires_matching_main_process(self):
        self.write_environment(10, {})
        (self.proc / "10/cgroup").write_text("0::/system.slice/synthetic.service\n")
        with patch.object(inventory.subprocess, "run", return_value=types.SimpleNamespace(returncode=0, stdout=b"2\n")):
            result = inventory.inventory(self.proc, probe=False)
        self.assertEqual(result["manager"], "unresolved")

    def test_remote_program_only_emits_closed_inventory_and_does_not_load_entry(self):
        program = inventory.remote_program()
        self.assertTrue(program.endswith("print(json.dumps(inventory(), sort_keys=True))\n"))
        self.assertNotIn(self.secret, program)
        self.assertNotIn("pm2 jlist", program)
        compile(program, "synthetic_remote_program", "exec")

    def test_trusted_adapter_uses_reviewed_policy_and_bounded_closed_result(self):
        payload = json.dumps(inventory.empty_result("academic_process_missing")).encode()
        class Channel:
            def __init__(self):
                self.pending = payload
            def shutdown_write(self):
                pass
            def recv_ready(self):
                return bool(self.pending)
            def recv(self, count):
                value, self.pending = self.pending[:count], self.pending[count:]
                return value
            def recv_stderr_ready(self):
                return False
            def exit_status_ready(self):
                return True
            def recv_exit_status(self):
                return 0
        channel = Channel()
        stdin = types.SimpleNamespace(channel=channel, write=lambda value: None, flush=lambda: None)
        stdout = types.SimpleNamespace(channel=channel)
        client = types.SimpleNamespace(exec_command=lambda command, **kwargs: (stdin, stdout, None))
        seen = []
        @contextlib.contextmanager
        def connection(secrets, *, host_key_reviewed):
            seen.append(host_key_reviewed)
            yield client
        adapter = types.ModuleType("lens_safe_ops")
        adapter._silent_boundary = contextlib.nullcontext
        adapter._trusted_connection = connection
        with patch.dict(sys.modules, {"lens_safe_ops": adapter}):
            result = inventory.run_academic_inventory(object(), host_key_reviewed=True)
        self.assertEqual(seen, [True])
        self.assertEqual(result["error"], "academic_process_missing")

    def test_node_source_verified_accepts_attested_legacy_lens_bundle(self):
        source = self.root / "legacy-node"
        (source / "dist").mkdir(parents=True)
        (source / "dist/main.js").write_text("NestFactory AcademicModule AcademicService")
        self.assertTrue(inventory.node_source_verified(source))
        (source / "dist/main.js").write_text("NestFactory AcademicModule")
        self.assertFalse(inventory.node_source_verified(source))


if __name__ == "__main__":
    unittest.main()
