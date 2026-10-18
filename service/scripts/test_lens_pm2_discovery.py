"""Synthetic filesystem tests for selecting an already running Lens PM2 daemon."""

import json
from pathlib import Path
import socket
import tempfile
import unittest

from lens_pm2_discovery import discover_rpc


class RuntimeDaemonDiscoveryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix="lens-pm2-", dir="/private/tmp")
        self.root = Path(self.directory.name)
        self.proc = self.root / "proc"
        self.proc.mkdir()
        self.default = self.root / "default"
        self.sockets = []
        self.bind_socket(self.default)

    def tearDown(self):
        for bound in self.sockets:
            bound.close()
        self.directory.cleanup()

    def bind_socket(self, home):
        home.mkdir(parents=True, exist_ok=True)
        bound = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        bound.bind(str(home / "rpc.sock"))
        self.sockets.append(bound)
        return home / "rpc.sock"

    def process(self, number, home, project="Lens", dependencies=None):
        service = self.root / project / ("service-" + str(number))
        (service / "dist").mkdir(parents=True)
        script = service / "dist/main.js"
        script.write_text("// synthetic application\n")
        (service / "package.json").write_text(json.dumps({
            "dependencies": dependencies if dependencies is not None else {"@nestjs/core": "synthetic"}
        }))
        process = self.proc / str(number)
        process.mkdir()
        (process / "cmdline").write_bytes(("node " + str(script) + "\0").encode())
        (process / "environ").write_bytes(("PM2_HOME=" + str(home) + "\0").encode())
        return service, process

    def test_selects_existing_backend_daemon_instead_of_default(self):
        home = self.root / "backend"
        expected = self.bind_socket(home)
        self.process(101, home)
        self.assertEqual(discover_rpc(self.default, self.proc), expected)

    def test_default_is_preserved_when_no_verified_business_process_exists(self):
        self.assertEqual(discover_rpc(self.default, self.proc), self.default / "rpc.sock")

    def test_multiple_processes_in_same_daemon_are_unambiguous(self):
        home = self.root / "backend"
        expected = self.bind_socket(home)
        self.process(101, home)
        self.process(102, home)
        self.assertEqual(discover_rpc(self.default, self.proc), expected)

    def test_distinct_verified_daemons_are_rejected(self):
        for number in (101, 102):
            home = self.root / ("backend-" + str(number))
            self.bind_socket(home)
            self.process(number, home)
        with self.assertRaisesRegex(ValueError, "runtime_discovery_ambiguous"):
            discover_rpc(self.default, self.proc)

    def test_unrelated_application_cannot_redirect_daemon(self):
        home = self.root / "other"
        self.bind_socket(home)
        self.process(101, home, project="Unrelated")
        self.assertEqual(discover_rpc(self.default, self.proc), self.default / "rpc.sock")

    def test_non_nest_application_cannot_redirect_daemon(self):
        home = self.root / "other"
        self.bind_socket(home)
        self.process(101, home, dependencies={})
        self.assertEqual(discover_rpc(self.default, self.proc), self.default / "rpc.sock")

    def test_missing_package_is_not_an_identity_fallback(self):
        home = self.root / "other"
        self.bind_socket(home)
        service, _ = self.process(101, home)
        (service / "package.json").unlink()
        self.assertEqual(discover_rpc(self.default, self.proc), self.default / "rpc.sock")

    def test_non_socket_target_is_rejected(self):
        home = self.root / "other"
        home.mkdir()
        (home / "rpc.sock").write_text("synthetic")
        self.process(101, home)
        with self.assertRaisesRegex(ValueError, "runtime_socket_invalid"):
            discover_rpc(self.default, self.proc)

    def test_symlinked_socket_is_rejected(self):
        home = self.root / "other"
        home.mkdir()
        (home / "rpc.sock").symlink_to(self.default / "rpc.sock")
        self.process(101, home)
        with self.assertRaisesRegex(ValueError, "runtime_socket_invalid"):
            discover_rpc(self.default, self.proc)

    def test_unrelated_environment_is_never_required(self):
        home = self.root / "other"
        _, process = self.process(101, home, project="Unrelated")
        (process / "environ").unlink()
        self.assertEqual(discover_rpc(self.default, self.proc), self.default / "rpc.sock")


if __name__ == "__main__":
    unittest.main()
