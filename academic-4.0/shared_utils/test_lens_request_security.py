import asyncio
import ast
import io
import json
import os
import tempfile
import subprocess
import sys
import time
import types
import unittest
import uuid
import zipfile
from pathlib import Path
from unittest.mock import patch

from shared_utils import lens_request_security as security


class PrivateConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="synthetic-academic-config-")
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.code = self.base / "code"
        self.code.mkdir()
        self.config = self.code / security.PRIVATE_CONFIGURATION_NAME
        roots = {}
        for key in ("workspace_root", "log_root", "upload_root"):
            root = self.base / key
            root.mkdir()
            roots[key] = str(root)
        self.value = {"version": 1, "secret": "synthetic-secret-for-fixed-load-only-012345", **roots}

    def write_configuration(self, mode=0o600):
        self.config.write_text(json.dumps(self.value))
        self.config.chmod(mode)

    def test_missing_file_preserves_existing_explicit_environment(self):
        environment = {"LENS_ACADEMIC_INTERNAL_SECRET": self.value["secret"]}
        before = dict(environment)
        self.assertFalse(security.load_private_configuration(self.code, environment))
        self.assertEqual(environment, before)

    def test_original_entrypoint_restart_loads_same_private_configuration(self):
        self.write_configuration()
        first, restarted = {}, {}
        self.assertTrue(security.load_private_configuration(self.code, first))
        self.assertTrue(security.load_private_configuration(self.code, restarted))
        self.assertEqual(first, restarted)
        self.assertEqual(first["LENS_ACADEMIC_WORKSPACE_ROOT"], self.value["workspace_root"])

    def test_bad_permissions_fail_before_any_environment_mutation(self):
        self.write_configuration(0o644)
        environment = {}
        with self.assertRaisesRegex(RuntimeError, "^Private academic configuration unavailable$"):
            security.load_private_configuration(self.code, environment)
        self.assertEqual(environment, {})

    def test_symlink_and_linked_configuration_fail_closed(self):
        self.write_configuration()
        original = self.base / "original"
        self.config.rename(original)
        self.config.symlink_to(original)
        with self.assertRaises(RuntimeError):
            security.load_private_configuration(self.code, {})
        self.config.unlink()
        os.link(original, self.config)
        with self.assertRaises(RuntimeError):
            security.load_private_configuration(self.code, {})

    def test_conflicting_environment_is_rejected_atomically(self):
        self.write_configuration()
        environment = {"PATH_PRIVATE_UPLOAD": str(self.base / "different")}
        before = dict(environment)
        with self.assertRaises(RuntimeError):
            security.load_private_configuration(self.code, environment)
        self.assertEqual(environment, before)

    def test_schema_secret_and_code_storage_are_rejected(self):
        for change in [{"extra": True}, {"version": True}, {"secret": "short"},
                       {"secret": " " * 40}, {"workspace_root": str(self.code)}]:
            original = dict(self.value)
            self.value.update(change)
            self.write_configuration()
            with self.assertRaises(RuntimeError):
                security.load_private_configuration(self.code, {})
            self.value = original

    def test_matching_environment_is_preserved_and_completed(self):
        self.write_configuration()
        environment = {"LENS_ACADEMIC_INTERNAL_SECRET": self.value["secret"], "UNRELATED": "synthetic"}
        self.assertTrue(security.load_private_configuration(self.code, environment))
        self.assertEqual(environment["UNRELATED"], "synthetic")
        self.assertEqual(environment["PATH_LOGGING"], self.value["log_root"])

    def test_direct_script_bootstraps_package_before_private_loader(self):
        entry = Path(security.__file__).with_name("fastapi_stream_server.py")
        tree = ast.parse(entry.read_text())
        bootstrap = []
        for node in tree.body:
            if isinstance(node, ast.ImportFrom) and node.module == "toolbox":
                break
            if isinstance(node, ast.Import) and all(alias.name in {"os", "sys"} for alias in node.names):
                bootstrap.append(node)
            elif isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id == "PROJECT_ROOT" for target in node.targets):
                bootstrap.append(node)
            elif isinstance(node, ast.If) and "PROJECT_ROOT" in ast.unparse(node):
                bootstrap.append(node)
            elif isinstance(node, ast.ImportFrom) and node.module == "shared_utils.lens_request_security":
                bootstrap.append(node)
            elif isinstance(node, ast.Expr) and isinstance(node.value, ast.Call) and isinstance(node.value.func, ast.Name) and node.value.func.id == "load_private_configuration":
                bootstrap.append(node)
        package = self.base / "shared_utils"
        package.mkdir()
        (package / "__init__.py").write_text("")
        (package / "lens_request_security.py").write_bytes(Path(security.__file__).read_bytes())
        script = package / "fastapi_stream_server.py"
        script.write_text(ast.unparse(ast.Module(body=bootstrap, type_ignores=[])))
        result = subprocess.run([sys.executable, "-I", "-B", str(script)], cwd=package, capture_output=True, timeout=10)
        self.assertEqual(result.returncode, 0, "Direct isolated entrypoint bootstrap failed")


SYNTHETIC_SECRET = "synthetic-internal-test-key-only-" * 3
SYNTHETIC_REQUEST = "00000000-0000-4000-8000-000000000031"


class PrivateBridgeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {"LENS_ACADEMIC_INTERNAL_SECRET": SYNTHETIC_SECRET})
        self.environment.start()

    def tearDown(self):
        self.environment.stop()

    async def invoke(self, headers=None, body=b"synthetic request", query=b"", path="/academic/chat-process", method="POST"):
        response = []
        observed = []
        events = [{"type": "http.request", "body": body, "more_body": False}]

        async def app(scope, receive, send):
            observed.append(security.current_identity())
            observed.append((await receive())["body"])
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"synthetic response"})

        async def receive():
            return events.pop(0) if events else {"type": "http.disconnect"}

        async def send(event):
            response.append(event)

        await security.LensPrivateBridgeMiddleware(app)(
            {"type": "http", "method": method, "path": path, "query_string": query, "headers": headers or []},
            receive, send,
        )
        return response[0]["status"], observed

    def signed_headers(self, body=b"synthetic request", resource="/academic/chat-process", timestamp=None, nonce=None):
        timestamp = str(int(time.time()) if timestamp is None else timestamp)
        nonce = nonce or str(uuid.uuid4())
        signature = security.sign_request(SYNTHETIC_SECRET, "POST", resource, body, timestamp, nonce, "31", SYNTHETIC_REQUEST)
        return [(key.encode(), value.encode()) for key, value in {
            "x-lens-academic-timestamp": timestamp,
            "x-lens-academic-nonce": nonce,
            "x-lens-academic-owner": "31",
            "x-lens-academic-request": SYNTHETIC_REQUEST,
            "x-lens-academic-signature": signature,
        }.items()]

    async def test_unsigned_private_request_is_rejected(self):
        status, observed = await self.invoke()
        self.assertEqual(status, 401)
        self.assertEqual(observed, [])

    async def test_actual_health_route_remains_public_and_private_files_do_not(self):
        with patch.dict(os.environ, {"LENS_ACADEMIC_INTERNAL_SECRET": ""}):
            healthy, observed = await self.invoke(path="/health", method="GET")
            private, _ = await self.invoke(path="/academic/file", method="GET")
        self.assertEqual(healthy, 200)
        self.assertIsNone(observed[0])
        self.assertEqual(private, 503)
        source = Path(security.__file__).with_name("fastapi_stream_server.py")
        tree = ast.parse(source.read_text())
        paths = {
            node.value for function in ast.walk(tree) if isinstance(function, (ast.FunctionDef, ast.AsyncFunctionDef))
            for decorator in function.decorator_list for node in ast.walk(decorator)
            if isinstance(node, ast.Constant) and isinstance(node.value, str)
        }
        self.assertIn("/health", paths)
        self.assertIn(("GET", "/health"), security._METADATA)
        self.assertNotIn(("GET", "/academic/health"), security._METADATA)

    async def test_unknown_report_endpoint_returns_not_found(self):
        source = Path(security.__file__).with_name("fastapi_stream_server.py")
        tree = ast.parse(source.read_text())
        imports = [node for node in tree.body
                   if isinstance(node, ast.ImportFrom) and node.module == "fastapi"]
        endpoint = next(node for node in ast.walk(tree)
                        if isinstance(node, ast.AsyncFunctionDef) and node.name == "academic_file")
        endpoint.decorator_list = []

        class EndpointHTTPException(Exception):
            def __init__(self, status_code, detail):
                self.status_code = status_code
                self.detail = detail

        # Isolate unrelated model runtimes while executing the real endpoint and imports.
        dependency = types.ModuleType("fastapi")
        for node in imports:
            for imported in node.names:
                setattr(dependency, imported.name, object())
        dependency.HTTPException = EndpointHTTPException
        namespace = {"open_report_reference": security.open_report_reference}
        module = ast.Module(body=[*imports, endpoint], type_ignores=[])
        with patch.dict(sys.modules, {"fastapi": dependency}):
            exec(compile(module, "synthetic-academic-endpoint", "exec"), namespace)
        failure = None
        try:
            await namespace["academic_file"]("synthetic-unknown-report")
        except Exception as error:
            failure = error
        self.assertIsInstance(failure, EndpointHTTPException)
        self.assertEqual(failure.status_code, 404)

    async def test_missing_shared_key_fails_closed(self):
        with patch.dict(os.environ, {"LENS_ACADEMIC_INTERNAL_SECRET": ""}):
            status, observed = await self.invoke()
        self.assertEqual(status, 503)
        self.assertEqual(observed, [])

    async def test_authenticated_request_preserves_body_and_clears_context(self):
        status, observed = await self.invoke(self.signed_headers())
        self.assertEqual(status, 200)
        self.assertEqual(observed[0], security.RequestIdentity(31, SYNTHETIC_REQUEST))
        self.assertEqual(observed[1], b"synthetic request")
        self.assertIsNone(security.current_identity())

    async def test_modified_body_is_rejected(self):
        status, observed = await self.invoke(self.signed_headers(), body=b"synthetic modification")
        self.assertEqual(status, 401)
        self.assertEqual(observed, [])

    async def test_modified_query_is_rejected(self):
        status, observed = await self.invoke(self.signed_headers(), query=b"path=synthetic")
        self.assertEqual(status, 401)
        self.assertEqual(observed, [])

    async def test_expired_signature_is_rejected(self):
        status, observed = await self.invoke(self.signed_headers(timestamp=int(time.time()) - 60))
        self.assertEqual(status, 401)
        self.assertEqual(observed, [])

    async def test_replayed_signature_is_rejected(self):
        headers = self.signed_headers()
        self.assertEqual((await self.invoke(headers))[0], 200)
        self.assertEqual((await self.invoke(headers))[0], 401)


class ScopedFilesystemTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="lens-synthetic-contract-")
        self.root = Path(self.temporary.name)
        self.environment = patch.dict(os.environ, {"LENS_ACADEMIC_WORKSPACE_ROOT": str(self.root / "workspace")})
        self.environment.start()
        self.logging = patch.object(security, "_logging_root", return_value=self.root / "logging")
        self.logging.start()
        self.token = security._CONTEXT.set(security.RequestIdentity(31, SYNTHETIC_REQUEST))
        security.request_input_root().mkdir(parents=True)
        security.request_logging_root().mkdir(parents=True)

    def tearDown(self):
        security._CONTEXT.reset(self.token)
        self.logging.stop()
        self.environment.stop()
        self.temporary.cleanup()

    def test_two_requests_have_distinct_input_and_report_roots(self):
        first = security.request_input_root()
        token = security._CONTEXT.set(security.RequestIdentity(31, str(uuid.uuid4())))
        try:
            self.assertNotEqual(first, security.request_input_root())
        finally:
            security._CONTEXT.reset(token)

    def test_txt_tex_pdf_and_word_bytes_are_preserved(self):
        root = security.request_input_root()
        for extension in ["txt", "tex", "pdf", "docx"]:
            target = root / ("synthetic." + extension)
            target.write_bytes(b"synthetic attachment bytes")
        security.prepare_request_inputs()
        for extension in ["txt", "tex", "pdf", "docx"]:
            self.assertEqual((root / ("synthetic." + extension)).read_bytes(), b"synthetic attachment bytes")

    def test_input_symlink_escape_is_rejected(self):
        outside = self.root / "synthetic-outside.txt"
        outside.write_bytes(b"synthetic private bytes")
        (security.request_input_root() / "synthetic.txt").symlink_to(outside)
        with self.assertRaises(ValueError):
            security.prepare_request_inputs()

    def test_same_owner_foreign_request_report_is_rejected(self):
        report = security.request_logging_root() / "synthetic-report.txt"
        report.write_bytes(b"synthetic report")
        reference = security.report_reference(report)
        token = security._CONTEXT.set(security.RequestIdentity(31, str(uuid.uuid4())))
        try:
            with self.assertRaises(ValueError):
                security.open_report_reference(reference["path"])
        finally:
            security._CONTEXT.reset(token)

    def test_other_owner_report_is_rejected(self):
        report = security.request_logging_root() / "synthetic-report.txt"
        report.write_bytes(b"synthetic report")
        reference = security.report_reference(report)
        token = security._CONTEXT.set(security.RequestIdentity(32, SYNTHETIC_REQUEST))
        try:
            with self.assertRaises(ValueError):
                security.open_report_reference(reference["path"])
        finally:
            security._CONTEXT.reset(token)

    def test_report_bytes_are_read_from_an_owner_descriptor(self):
        report = security.request_logging_root() / "synthetic-report.txt"
        report.write_bytes(b"synthetic report")
        reference = security.report_reference(report)
        descriptor, filename = security.open_report_reference(reference["path"])
        self.assertEqual(filename, "synthetic-report.txt")
        self.assertEqual(b"".join(security.iter_report_bytes(descriptor)), b"synthetic report")
        with self.assertRaises(OSError):
            os.fstat(descriptor)

    def test_replaced_report_symlink_is_rejected(self):
        report = security.request_logging_root() / "synthetic-report.txt"
        report.write_bytes(b"synthetic report")
        reference = security.report_reference(report)
        report.unlink()
        outside = self.root / "synthetic-outside.txt"
        outside.write_bytes(b"synthetic private bytes")
        report.symlink_to(outside)
        with self.assertRaises(ValueError):
            security.open_report_reference(reference["path"])

    def test_legacy_report_path_is_rejected(self):
        with self.assertRaises(ValueError):
            security.open_report_reference("gpt_log/31/synthetic-report.txt")

    def test_foreign_output_cannot_be_registered(self):
        outside = self.root / "synthetic-outside.txt"
        outside.write_bytes(b"synthetic bytes")
        with self.assertRaises(ValueError):
            security.report_reference(outside)

    def make_zip(self, filename, members):
        target = security.request_input_root() / filename
        with zipfile.ZipFile(target, "w") as archive:
            for name, value in members:
                archive.writestr(name, value)
        return target

    def test_safe_zip_is_unpacked_inside_the_current_request(self):
        source = self.make_zip("synthetic.zip", [("folder/synthetic.txt", b"synthetic archive bytes")])
        security.prepare_request_inputs()
        self.assertFalse(source.exists())
        matches = list(security.request_input_root().glob("archive-*/folder/synthetic.txt"))
        self.assertEqual(len(matches), 1)
        self.assertEqual(matches[0].read_bytes(), b"synthetic archive bytes")

    def test_zip_traversal_failure_removes_only_the_partial_extraction(self):
        source = self.make_zip("synthetic.zip", [("safe.txt", b"synthetic"), ("../outside.txt", b"synthetic")])
        with self.assertRaises(ValueError):
            security.prepare_request_inputs()
        self.assertTrue(source.exists())
        self.assertEqual(list(security.request_input_root().glob("archive-*")), [])
        self.assertFalse((security.request_input_root() / "outside.txt").exists())

    def test_unsupported_archives_fail_closed(self):
        for extension in ["rar", "7z", "tar", "gz"]:
            target = security.request_input_root() / ("synthetic." + extension)
            target.write_bytes(b"synthetic")
            with self.assertRaises(ValueError):
                security.prepare_request_inputs()
            target.unlink()

    def test_safe_zip_preparation_is_idempotent_for_workflow_steps(self):
        self.make_zip("synthetic-paper.zip", [("paper/main.tex", "synthetic tex")])
        security.prepare_request_inputs()
        root = security.request_input_root()
        before = {p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob("*") if p.is_file()}
        security.prepare_request_inputs()
        after = {p.relative_to(root).as_posix(): p.read_bytes() for p in root.rglob("*") if p.is_file()}
        self.assertEqual(before, after)
        self.assertEqual(list(after.values()), [b"synthetic tex"])

    def test_existing_extraction_directory_rejects_symlink(self):
        root = security.request_input_root()
        root.mkdir(parents=True, exist_ok=True)
        child = root / "synthetic-extraction"
        child.mkdir()
        target = self.root / "synthetic-outside.txt"
        target.write_bytes(b"private synthetic")
        (child / "escaped.txt").symlink_to(target)
        with self.assertRaises(ValueError):
            security.prepare_request_inputs()

    def test_request_identity_propagates_to_bound_native_thread(self):
        import threading
        seen = []
        worker = threading.Thread(target=security.bind_request_context(lambda: seen.append(security.current_identity())))
        worker.start()
        worker.join(timeout=2)
        self.assertFalse(worker.is_alive())
        self.assertEqual(seen, [security.current_identity()])

    def test_signed_shared_upload_directory_is_inside_request_input(self):
        folder = security.request_upload_directory("synthetic-tag")
        self.assertTrue(security.path_within(folder, security.request_input_root()))
        self.assertTrue(folder.is_dir())
        with self.assertRaises(ValueError):
            security.request_upload_directory("../foreign")

    def test_report_staging_pins_source_descriptor_during_path_replacement(self):
        source = security.request_input_root() / "synthetic-source.txt"
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(b"owned synthetic report")
        outside = self.root / "synthetic-outside.txt"
        outside.write_bytes(b"foreign synthetic")
        def transform(data):
            source.unlink()
            source.symlink_to(outside)
            return data
        destination = security.stage_request_report(source, "synthetic-report.txt", transform)
        self.assertEqual(destination.read_bytes(), b"owned synthetic report")
        self.assertEqual(outside.read_bytes(), b"foreign synthetic")
        self.assertTrue(security.path_within(destination, security.request_logging_root()))

    def test_report_staging_failure_closes_source_and_removes_partial_output(self):
        from unittest.mock import patch
        source = security.request_input_root() / "synthetic-source.txt"
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(b"owned synthetic report")
        descriptor, name = security.open_request_file(source)
        def fail_transform(data):
            raise ValueError("synthetic failure")
        with patch.object(security, "open_request_file", return_value=(descriptor, name)):
            with self.assertRaises(ValueError):
                security.stage_request_report(source, "synthetic-report.txt", fail_transform)
        with self.assertRaises(OSError):
            os.fstat(descriptor)
        output = security.request_logging_root() / "downloadzone"
        self.assertEqual(list(output.iterdir()) if output.exists() else [], [])

    def test_report_registry_loss_and_expiry_fail_closed(self):
        from unittest.mock import patch
        output = security.request_logging_root() / "synthetic-report.txt"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_bytes(b"owned synthetic report")
        with patch.object(security.time, "time", return_value=100):
            reference = security.report_reference(output)
        with patch.object(security.time, "time", return_value=4000):
            with self.assertRaises(ValueError):
                security.open_report_reference(reference)
        reference = security.report_reference(output)
        security._REPORTS.clear()
        security._REPORT_PATHS.clear()
        with self.assertRaises(ValueError):
            security.open_report_reference(reference)


if __name__ == "__main__":
    unittest.main()
