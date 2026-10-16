import ast
import asyncio
import os
import shutil
import types
import unittest
import uuid
from urllib.parse import quote
from pathlib import Path
from unittest.mock import patch

from shared_utils import lens_request_security as security
from shared_utils import test_lens_request_security as fixtures


def load_functions(filename, names, namespace):
    tree = ast.parse((Path(__file__).parents[1] / filename).read_text())
    nodes = []
    seen = set()
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names and node.name not in seen:
            node.decorator_list = []
            nodes.append(node)
            seen.add(node.name)
    module = ast.Module(
        body=[ast.ImportFrom(module="__future__", names=[ast.alias(name="annotations")], level=0)] + nodes,
        type_ignores=[],
    )
    exec(compile(ast.fix_missing_locations(module), "synthetic_bridge_contract", "exec"), namespace)
    return namespace


class SyntheticChatbot(list):
    def __init__(self, cookies):
        super().__init__()
        self._cookies = cookies

    def write_list(self, values):
        self.extend(values)


class SyntheticHttpException(Exception):
    def __init__(self, status_code, detail=None):
        self.status_code = status_code


class SyntheticStreamingResponse:
    def __init__(self, content, media_type=None, headers=None):
        self.content = content
        self.media_type = media_type
        self.headers = headers or {}


class BridgeContractTests(unittest.TestCase):
    def setUp(self):
        self.fixture = fixtures.ScopedFilesystemTests()
        self.fixture.setUp()
        self.local_root = self.fixture.root / "synthetic-local-logs"
        self.private_upload_root = self.fixture.root / "synthetic-local-uploads"
        storage = types.ModuleType("shared_utils.lens_storage")
        storage.get_private_upload_root = lambda: str(self.private_upload_root)
        storage.get_logging_root = lambda: str(self.local_root)
        exports = load_functions(
            "shared_utils/lens_storage.py", {"ensure_lens_export_dir", "get_lens_export_plugin_name"},
            {"os": os, "get_logging_root": lambda: str(security._logging_root()), "LENS_EXPORT_PLUGIN": "synthetic-lens-exports"},
        )
        storage.ensure_lens_export_dir = exports["ensure_lens_export_dir"]
        self.upload_patch = patch.dict("sys.modules", {"shared_utils.lens_storage": storage})
        self.upload_patch.start()
        self.toolbox = load_functions(
            "toolbox.py",
            {"get_user", "get_log_folder", "get_upload_folder", "promote_file_to_downloadzone", "file_already_in_downloadzone"},
            {
                "os": os,
                "pj": os.path.join,
                "default_user_name": "synthetic-default-user",
                "get_private_upload_root": lambda: str(self.private_upload_root),
                "get_conf": lambda key: str(self.local_root),
                "sanitize_report_file_if_text": lambda filename: None,
                "sanitize_report_text": lambda value: value.replace("synthetic old brand", "synthetic Lens"),
                "sanitize_download_filename": lambda name: os.path.basename(name),
                "gen_time_str": lambda: "synthetic-unique",
            },
        )

    def tearDown(self):
        self.upload_patch.stop()
        self.fixture.tearDown()

    def test_signed_shared_helpers_override_spoofed_user(self):
        chatbot = SyntheticChatbot({"user_name": "synthetic-foreign-user"})
        self.assertEqual(self.toolbox["get_user"](chatbot), security.current_user_name())
        logs = self.toolbox["get_log_folder"]("synthetic-foreign-user", "synthetic-plugin")
        upload = self.toolbox["get_upload_folder"]("synthetic-foreign-user", "synthetic-tag")
        self.assertTrue(security.path_within(logs, security.request_logging_root()))
        self.assertTrue(security.path_within(upload, security.request_input_root()))

    def test_unsigned_local_helpers_keep_legacy_user_and_storage(self):
        token = security._CONTEXT.set(None)
        try:
            chatbot = SyntheticChatbot({"user_name": "synthetic-local-user"})
            self.assertEqual(self.toolbox["get_user"](chatbot), "synthetic-local-user")
            self.assertEqual(
                self.toolbox["get_log_folder"]("synthetic-local-user", "synthetic-plugin"),
                str(self.local_root / "synthetic-local-user" / "synthetic-plugin"),
            )
            self.assertEqual(
                self.toolbox["get_upload_folder"]("synthetic-local-user", "synthetic-tag"),
                str(self.private_upload_root / "synthetic-local-user" / "synthetic-tag"),
            )
        finally:
            security._CONTEXT.reset(token)

    def test_signed_report_promotion_preserves_bytes_and_cookie_contract(self):
        source = security.request_input_root() / "synthetic-source.md"
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(b"synthetic old brand")
        chatbot = SyntheticChatbot({"user_name": "synthetic-foreign-user", "files_to_promote": ["synthetic-prior"]})
        result = self.toolbox["promote_file_to_downloadzone"](str(source), "synthetic-report.md", chatbot)
        self.assertEqual(Path(result).read_bytes(), b"synthetic Lens")
        self.assertEqual(source.read_bytes(), b"synthetic old brand")
        self.assertTrue(security.path_within(result, security.request_logging_root()))
        self.assertEqual(chatbot._cookies["files_to_promote"], ["synthetic-prior", result])

    def test_signed_report_promotion_rejects_other_request(self):
        source = security.request_input_root() / "synthetic-source.txt"
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(b"owned synthetic")
        current = security.current_identity()
        token = security._CONTEXT.set(security.RequestIdentity(current.owner_id, str(uuid.uuid4())))
        try:
            with self.assertRaises(ValueError):
                self.toolbox["promote_file_to_downloadzone"](str(source))
        finally:
            security._CONTEXT.reset(token)

    def test_unsigned_local_report_promotion_keeps_legacy_flow(self):
        source = self.fixture.root / "synthetic-local-report.txt"
        source.write_bytes(b"local synthetic report")
        chatbot = SyntheticChatbot({"user_name": "synthetic-local-user"})
        token = security._CONTEXT.set(None)
        try:
            result = self.toolbox["promote_file_to_downloadzone"](str(source), "synthetic-report.txt", chatbot)
            self.assertEqual(Path(result).read_bytes(), b"local synthetic report")
            self.assertEqual(chatbot._cookies["files_to_promote"], [result])
        finally:
            security._CONTEXT.reset(token)

    def test_bridge_context_uses_signed_identity_instead_of_payload(self):
        functions = load_functions(
            "shared_utils/fastapi_stream_server.py",
            {"_build_stream_context"},
            {
                "current_identity": security.current_identity,
                "get_plugin_default_kwargs": lambda: {"llm_kwargs": {}},
                "ChatBotWithCookies": SyntheticChatbot,
                "get_conf": lambda key: "synthetic-model",
                "default_user_name": "synthetic-default-user",
            },
        )
        request = types.SimpleNamespace(
            user_name="synthetic-foreign-user", llm_kwargs={}, plugin_kwargs={},
            chatbot=[], history=[], main_input="synthetic input", system_prompt="synthetic prompt",
        )
        toolbox = types.ModuleType("toolbox")
        toolbox.get_conf = lambda key: "synthetic-model"
        toolbox.get_plugin_default_kwargs = lambda: {"llm_kwargs": {}}
        toolbox.default_user_name = "synthetic-default-user"
        with patch.dict("sys.modules", {"toolbox": toolbox}):
            result = functions["_build_stream_context"](request)
        self.assertEqual(result["llm_kwargs"]["user_name"], security.current_user_name())
        self.assertEqual(result["chatbot"]._cookies["user_name"], security.current_user_name())

    def test_websocket_thread_target_binds_signed_context(self):
        tree = ast.parse((Path(__file__).parents[1] / "shared_utils/fastapi_stream_server.py").read_text())
        targets = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute) and node.func.attr == "Thread":
                targets.extend(keyword.value for keyword in node.keywords if keyword.arg == "target")
        self.assertEqual(len(targets), 1)
        self.assertTrue(isinstance(targets[0], ast.Call) and isinstance(targets[0].func, ast.Name))
        self.assertEqual(targets[0].func.id, "bind_request_context")

    def bridge_filesystem_functions(self):
        return load_functions(
            "shared_utils/fastapi_stream_server.py",
            {"_stage_lens_result_files", "academic_file"},
            {
                "os": os, "shutil": shutil, "uuid": uuid, "quote": quote,
                "current_identity": security.current_identity,
                "request_logging_root": security.request_logging_root,
                "path_within": security.path_within,
                "open_request_file": security.open_request_file,
                "open_report_reference": security.open_report_reference,
                "iter_report_bytes": security.iter_report_bytes,
                "StreamingResponse": SyntheticStreamingResponse,
                "HTTPException": SyntheticHttpException,
            },
        )

    def test_bridge_stages_bytes_and_downloads_only_opaque_reports(self):
        functions = self.bridge_filesystem_functions()
        source = security.request_input_root() / "synthetic-report.txt"
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(b"owned synthetic report")
        result = functions["_stage_lens_result_files"]([str(source)], "synthetic-spoofed-user")
        self.assertEqual(len(result), 1)
        self.assertTrue(security.path_within(result[0], security.request_logging_root()))
        self.assertEqual(Path(result[0]).read_bytes(), source.read_bytes())
        reference = security.report_reference(result[0])["path"]
        response = asyncio.run(functions["academic_file"](reference))
        self.assertEqual(b"".join(response.content), b"owned synthetic report")
        self.assertEqual(response.headers["Cache-Control"], "private, no-store")
        self.assertIn("X-Lens-Report-Name", response.headers)
        with self.assertRaises(SyntheticHttpException) as rejected:
            asyncio.run(functions["academic_file"](str(source)))
        self.assertEqual(rejected.exception.status_code, 404)

    def test_bridge_staging_other_request_fails_without_partial_exports(self):
        functions = self.bridge_filesystem_functions()
        source = security.request_input_root() / "synthetic-report.txt"
        source.parent.mkdir(parents=True, exist_ok=True)
        source.write_bytes(b"owned synthetic report")
        current = security.current_identity()
        token = security._CONTEXT.set(security.RequestIdentity(current.owner_id, str(uuid.uuid4())))
        try:
            with self.assertRaises(ValueError):
                functions["_stage_lens_result_files"]([str(source)], "synthetic-spoofed-user")
            output = security.request_logging_root()
            # Empty request-scoped containers are harmless; failed staging must
            # leave no report bytes or symlink that another attempt can reuse.
            leftovers = [
                path for path in output.rglob("*")
                if path.is_file() or path.is_symlink()
            ] if output.exists() else []
            self.assertEqual(leftovers, [])
        finally:
            security._CONTEXT.reset(token)


if __name__ == "__main__":
    unittest.main()
