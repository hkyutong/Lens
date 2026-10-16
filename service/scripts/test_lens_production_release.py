"""Synthetic release inputs and fake transports only; never calls SSH."""

import contextlib
import copy
import hashlib
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock

import lens_production_release as release


class ProductionReleaseTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="lens-control-test-", dir=Path(tempfile.gettempdir()).resolve())
        self.root = Path(self.temp.name)
        self.artifacts = self.root / "artifacts"
        self.artifacts.mkdir()
        values = [("service_build", "service/dist/main.js", b"synthetic service"),
                  ("service_package", "service/package.json", b'{"name":"synthetic","dependencies":{}}'),
                  ("service_lock", "service/pnpm-lock.yaml", b"synthetic lock"),
                  ("chat_static", "chat/dist/index.html", b"synthetic chat index"),
                  ("chat_static", "chat/dist/assets/main-abcdefgh.js", b"synthetic chat asset"),
                  ("admin_static", "admin/dist/index.html", b"synthetic admin index")]
        entries = []
        for role, relative, data in values:
            p = self.artifacts / relative
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
            entries.append({"role": role, "source": relative, "sha256": hashlib.sha256(data).hexdigest(), "size": len(data)})
        self.manifest = {"version": 1, "clean_source_verified": True, "entries": entries}
        workspace = self.artifacts / "service/pnpm-workspace.yaml"
        workspace.write_bytes(b"packages: []\n")
        self.manifest["entries"].append({"role": "service_workspace", "source": "service/pnpm-workspace.yaml", "sha256": hashlib.sha256(workspace.read_bytes()).hexdigest(), "size": workspace.stat().st_size})
        # The atomic release includes exactly the seven reviewed Academic runtime files.
        academic_files = (
            "crazy_functions/Lens_Featured_Tasks.py",
            "crazy_functions/lens_research_tasks.py",
            "crazy_functions/lens_research_proposal.py",
            "shared_utils/fastapi_stream_server.py",
            "shared_utils/lens_storage.py",
            "shared_utils/lens_request_security.py",
            "toolbox.py",
        )
        for relative in academic_files:
            source = "academic-4.0/" + relative
            path = self.artifacts / source
            path.parent.mkdir(parents=True, exist_ok=True)
            content = b"# synthetic Academic runtime fixture\n"
            path.write_bytes(content)
            self.manifest["entries"].append({
                "role": "academic_runtime", "source": source,
                "size": len(content), "sha256": hashlib.sha256(content).hexdigest(),
            })

    def tearDown(self):
        self.temp.cleanup()

    def test_closed_manifest_accepts_only_build_roles(self):
        bundle = release.prepare_artifact_bundle(self.artifacts, self.manifest)
        self.assertEqual(len(bundle.entries), 14)
        self.assertEqual(repr(bundle), "<ArtifactBundle>")
        self.assertEqual(hashlib.sha256(bundle.archive).hexdigest(), bundle.archive_digest)

    def test_sensitive_and_persistent_roles_rejected(self):
        forbidden = ["service/private/member.js", "service/uploads/member.js", "service/public/user.js",
                     "service/.env", "service/server.txt", "service/database.sqlite", "service/logs/event.log",
                     "service/secret.pem", "service/node_modules/pkg/index.js", "service/AGENTS.md",
                     "service/dist/private/member.js", "service/dist/uploads/member.js", "service/dist/memory.md",
                     "service/dist/config/runtime.json", "service/dist/file.js.map", "../service/dist/escape.js"]
        for name in forbidden:
            with self.subTest(case=name):
                manifest = copy.deepcopy(self.manifest)
                manifest["entries"][0]["source"] = name
                with self.assertRaises(release.ReleaseError) as error:
                    release.prepare_artifact_bundle(self.artifacts, manifest)
                self.assertEqual(str(error.exception), "artifact_invalid")
                self.assertNotIn(str(self.root), str(error.exception))

    def test_unlisted_private_files_are_never_opened(self):
        folder = self.artifacts / "service/private"
        folder.mkdir()
        (folder / "member.bin").write_bytes(b"synthetic private fixture")
        bundle = release.prepare_artifact_bundle(self.artifacts, self.manifest)
        self.assertNotIn(b"synthetic private fixture", bundle.archive)

    def test_hash_and_size_mismatch_rejected(self):
        for key, value in [("size", 1), ("sha256", "0" * 64)]:
            manifest = copy.deepcopy(self.manifest)
            manifest["entries"][0][key] = value
            with self.assertRaises(release.ReleaseError):
                release.prepare_artifact_bundle(self.artifacts, manifest)

    def test_source_attestation_required_and_not_claimed_as_git_check(self):
        self.manifest["clean_source_verified"] = False
        with self.assertRaises(release.ReleaseError) as error:
            release.prepare_artifact_bundle(self.artifacts, self.manifest)
        self.assertEqual(error.exception.code, "source_attestation_missing")

    def test_source_symlink_and_hardlink_rejected(self):
        file = self.artifacts / "service/dist/main.js"
        original = self.root / "retained.js"
        file.rename(original)
        file.symlink_to(original)
        with self.assertRaises(release.ReleaseError):
            release.prepare_artifact_bundle(self.artifacts, self.manifest)
        file.unlink()
        os.link(original, file)
        with self.assertRaises(release.ReleaseError):
            release.prepare_artifact_bundle(self.artifacts, self.manifest)

    def test_manifest_unknown_keys_and_duplicate_entries_rejected(self):
        for variant in (dict(self.manifest, unexpected=True),
                        dict(self.manifest, entries=[*self.manifest["entries"], self.manifest["entries"][0]])):
            with self.assertRaises(release.ReleaseError):
                release.prepare_artifact_bundle(self.artifacts, variant)

    def test_closed_remote_projection_rejects_values_and_unknown_fields(self):
        for value in ({"unknown": "synthetic internal value"}, {"error": "synthetic raw exception"},
                      {"production_changed": 1}, {"artifact_file_count": "synthetic path"}):
            with self.assertRaises(release.ReleaseError) as error:
                release._project(value)
            self.assertEqual(str(error.exception), "remote_output_invalid")

    def test_no_deploy_artifact_means_no_connection(self):
        with mock.patch.object(release.safe_ops, "_trusted_connection") as connect:
            result = release.run_release(deploy=True)
        connect.assert_not_called()
        self.assertFalse(result.ok)
        self.assertEqual(result.error, "artifact_invalid")

    def test_connection_exception_never_returned(self):
        with mock.patch.object(release.safe_ops, "load_project_entry", side_effect=RuntimeError("synthetic confidential failure")):
            result = release.run_release()
        self.assertEqual(result.error, "connection_blocked")
        self.assertNotIn("confidential", json.dumps(result.to_dict()))

    def test_permission_exception_has_closed_classification(self):
        with mock.patch.object(release.safe_ops, "_trusted_connection", side_effect=PermissionError(1, "denied")):
            result = release.run_release()
        self.assertEqual(result.error, "connection_permission_denied")
        self.assertNotIn("PermissionError", json.dumps(result.to_dict()))

    def test_default_preflight_has_no_deploy_gate(self):
        fake = contextlib.nullcontext(object())
        response = {"public": {"ok": True}}
        with mock.patch.object(release.safe_ops, "load_project_entry", return_value=object()), \
             mock.patch.object(release.safe_ops, "_trusted_connection", return_value=fake), \
             mock.patch.object(release, "_execute", return_value=response) as execute:
            result = release.run_release()
        self.assertTrue(result.ok)
        execute.assert_called_once()
        self.assertEqual(execute.call_args.args[1]["mode"], "preflight")
        self.assertFalse(execute.call_args.args[1]["deploy"])

    def test_readiness_bootstrap_generation_is_valid_python(self):
        program = release.build_remote_program({"mode": "preflight", "deploy": False, "release_id": "a1" * 16})
        compile(program, "<synthetic-bootstrap>", "exec")
        self.assertIn("__lensCapture", program)

    def synthetic_context(self):
        service = self.root / "service"
        for relative in ("dist", "public/chat", "public/admin", "private", "pm2-module"):
            (service / relative).mkdir(parents=True, exist_ok=True)
        script = service / "dist/main.js"
        script.write_text("synthetic program")
        config = {"apps": [{"name": "synthetic-lens", "script": "dist/main.js", "watch": False, "instances": 1, "exec_mode": "fork"}]}
        (service / "pm2.conf.json").write_text(json.dumps(config))
        tools = self.root / "tools"
        tools.mkdir()
        for name in ("node", "pnpm", "python3", "tar", "mysql", "mysqldump"):
            path = tools / name
            path.write_text("synthetic tool fixture")
            path.chmod(0o700)
        return {"nginxTokens": ["server", "{", "listen", "443", "ssl", ";", "server_name", "example.org", ";", "location", "/", "{", "proxy_pass", "http://127.0.0.1:12345", ";", "}", "}"],"serviceCwd": str(service), "privateStorage": str(service / "private/storage"),
                "pm2ModuleRoot": str(service / "pm2-module"), "processId": 7,
                "runtime": {"name": "synthetic-lens", "cwd": str(service), "script": str(script),
                            "watch": False, "instances": 1, "execMode": "fork_mode", "environment": {}},
                "database": {"host": "database.example.test", "port": 3306, "user": "synthetic-user",
                             "password": "synthetic-password", "database": "synthetic_database"},
                "smokePort": 12345}, tools

    def node_preflight(self, context, tools):
        node = shutil.which("node")
        if not node:
            self.skipTest("existing Node runtime unavailable")
        worker = Path(release.__file__).with_name("lens_production_release_worker.cjs")
        script = "globalThis.__lensDownloadBoundary=require(require('path').join(require('path').dirname(process.argv[1]),'lens_download_boundary.cjs'));const fs=require('fs');const w=require(process.argv[1]);const c=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(w.preflight(c).report));"
        result = subprocess.run([node, "-e", script, str(worker)], input=json.dumps(context).encode(),
                                capture_output=True, env={**os.environ, "PATH": str(tools)}, timeout=10)
        self.assertEqual(result.returncode, 0)
        return release._project(json.loads(result.stdout))

    def test_executable_synthetic_readonly_preflight(self):
        context, tools = self.synthetic_context()
        result = self.node_preflight(context, tools)
        self.assertTrue(result.ok, result.error)
        self.assertTrue(result.pm2_config_ok)
        self.assertFalse(result.production_changed)
        self.assertFalse((Path(context["privateStorage"])).exists())

    def test_pm2_watch_mismatch_blocks_preflight(self):
        context, tools = self.synthetic_context()
        context["runtime"]["watch"] = True
        result = self.node_preflight(context, tools)
        self.assertEqual(result.error, 'pm2_config_instances_invalid')

    def test_public_private_storage_blocks_preflight(self):
        context, tools = self.synthetic_context()
        context["privateStorage"] = str(Path(context["serviceCwd"]) / "public/private")
        result = self.node_preflight(context, tools)
        self.assertEqual(result.error, "private_storage_unsafe")

    def test_pm2_single_app_array_and_direct_shapes_keep_identity_checks(self):
        context, tools = self.synthetic_context()
        config = Path(context["serviceCwd"]) / "pm2.conf.json"
        original = json.loads(config.read_text())
        app = original["apps"][0]
        for variant in ([app], app):
            with self.subTest(shape="array" if isinstance(variant, list) else "direct"):
                config.write_text(json.dumps(variant))
                result = self.node_preflight(context, tools).to_dict()
                self.assertTrue(result.get("public", result)["ok"])
        config.write_text(json.dumps([app, app]))
        result = self.node_preflight(context, tools).to_dict()
        self.assertEqual(result.get("public", result)["error"], "pm2_config_shape_invalid")


    def test_pm2_object_app_without_cwd_uses_verified_runtime_directory(self):
        context, tools = self.synthetic_context()
        config = Path(context["serviceCwd"]) / "pm2.conf.json"
        original = json.loads(config.read_text())
        app = original["apps"][0]
        app.pop("cwd", None)
        config.write_text(json.dumps({"apps": app}))
        self.assertTrue(self.node_preflight(context, tools).ok)
        context["runtime"]["cwd"] = str(tools)
        self.assertFalse(self.node_preflight(context, tools).ok)

    def test_academic_runtime_requires_exact_seven_reviewed_files(self):
        incomplete = dict(self.manifest)
        incomplete["entries"] = [entry for entry in self.manifest["entries"]
                                 if entry["source"] != "academic-4.0/toolbox.py"]
        with self.assertRaises(release.ReleaseError):
            release.prepare_artifact_bundle(self.artifacts, incomplete)
        with self.assertRaises(release.ReleaseError):
            release._role_path("academic_runtime", "academic-4.0/config.py")
        with self.assertRaises(release.ReleaseError):
            release._role_path("academic_runtime", "academic-4.0/../service/package.json")

    def _upload_failure_fixture(self, *, cleanup_succeeds, deployment_fails=False):
        bundle = release.prepare_artifact_bundle(self.artifacts, self.manifest)
        preflight = {"public": release.ReleaseResult(ok=True, mode="preflight").to_dict()}
        staged = {"public": release.ReleaseResult(ok=True, mode="deploy").to_dict(),
                  "private": {"stage": "/synthetic/release-stage"}}
        cleanup = {"public": release.ReleaseResult(
            ok=cleanup_succeeds, mode="deploy", cleanup_succeeded=cleanup_succeeds,
            evidence_retained=not cleanup_succeeds).to_dict()}
        replies = [preflight, staged, RuntimeError("synthetic transport failure")
                   if deployment_fails else cleanup]
        with mock.patch.object(release.safe_ops, "load_project_entry", return_value=object()), \
             mock.patch.object(release.safe_ops, "_trusted_connection",
                               return_value=contextlib.nullcontext(object())), \
             mock.patch.object(release, "_execute", side_effect=replies) as execute, \
             mock.patch.object(release, "_upload", side_effect=None if deployment_fails
                               else release.ReleaseError("stage_invalid")):
            result = release.run_release(artifact_bundle=bundle, deploy=True,
                                         host_key_reviewed=True)
        return result, execute.call_args_list

    def test_upload_failure_cleans_only_the_owned_stage_before_dispatch(self):
        result, calls = self._upload_failure_fixture(cleanup_succeeds=True)
        self.assertFalse(result.ok)
        self.assertTrue(result.cleanup_succeeded)
        self.assertFalse(result.evidence_retained)
        self.assertFalse(result.needs_manual_review)
        self.assertFalse(result.production_changed)
        self.assertTrue(len(calls) == 3 and calls[2].args[1]["mode"] == "cleanup")

    def test_upload_cleanup_failure_retains_evidence_without_dispatch(self):
        result, calls = self._upload_failure_fixture(cleanup_succeeds=False)
        self.assertFalse(result.ok)
        self.assertFalse(result.cleanup_succeeded)
        self.assertTrue(result.evidence_retained)
        self.assertFalse(result.needs_manual_review)
        self.assertFalse(result.production_changed)
        self.assertTrue(len(calls) == 3 and calls[2].args[1]["mode"] == "cleanup")

    def test_unknown_deploy_state_never_cleans_rollback_evidence(self):
        result, calls = self._upload_failure_fixture(cleanup_succeeds=False,
                                                    deployment_fails=True)
        self.assertFalse(result.ok)
        self.assertTrue(result.evidence_retained)
        self.assertTrue(result.needs_manual_review)
        self.assertFalse(result.cleanup_succeeded)
        self.assertTrue(len(calls) == 3 and calls[2].args[1]["mode"] == "deploy")

    def test_bootstrap_failure_after_dispatch_retains_evidence_and_requires_review(self):
        for failure in ("bootstrap_child_failed", "remote_output_invalid"):
            with self.subTest(error=failure):
                bundle = release.prepare_artifact_bundle(self.artifacts, self.manifest)
                replies = [
                    {'public': release.ReleaseResult(ok=True, runtime_context_ok=True).to_dict()},
                    {'public': release.ReleaseResult(ok=True, mode='deploy').to_dict(), 'private': {'stage': '/synthetic/release-stage'}},
                    {'public': release.ReleaseResult(mode='deploy', error=failure, cleanup_succeeded=True, needs_manual_review=False, evidence_retained=False).to_dict()},
                ]
                with mock.patch.object(release.safe_ops, 'load_project_entry', return_value=object()), mock.patch.object(release.safe_ops, '_trusted_connection', return_value=contextlib.nullcontext(object())), mock.patch.object(release, '_execute', side_effect=replies) as execute, mock.patch.object(release, '_upload'):
                    result = release.run_release(artifact_bundle=bundle, deploy=True, host_key_reviewed=True)
                self.assertFalse(result.ok)
                self.assertTrue(result.runtime_context_ok)
                self.assertTrue(result.artifact_checked)
                self.assertTrue(result.needs_manual_review)
                self.assertTrue(result.evidence_retained)
                self.assertFalse(result.cleanup_succeeded)
                self.assertEqual(execute.call_count, 3)

    def test_reviewed_academic_failure_classes_survive_closed_projection(self):
        codes = ("academic_context_invalid", "academic_controller_failed", "academic_route_invalid", "academic_ready_failed", "academic_restore_failed", "academic_manager_failed", "academic_apply_failed", "academic_cleanup_failed")
        for code in codes:
            with self.subTest(code=code):
                try:
                    result = release._project({"error": code})
                except release.ReleaseError:
                    self.fail("reviewed_academic_failure_class_rejected")
                self.assertEqual(result.error, code)

    def test_academic_boundary_preserves_only_reviewed_failure_classes(self):
        worker = Path(__file__).with_name("lens_production_release_worker.cjs")
        script = r"""
const fs=require('fs'),vm=require('vm');
const source=fs.readFileSync(process.argv[1],'utf8');
const ts=require('typescript');
const parsed=ts.createSourceFile('worker.cjs',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
let target;function visit(node){if(ts.isFunctionDeclaration(node)&&node.name?.text==='__academicInvoke')target=node;ts.forEachChild(node,visit);}visit(parsed);
const invoke=vm.runInNewContext('('+target.getText(parsed)+')',{__fail:code=>{const error=new Error(code);error.lensCode=code;throw error;}});
const reviewed=['academic_context_invalid','academic_controller_failed','academic_route_invalid','academic_ready_failed','academic_restore_failed','academic_manager_failed','academic_apply_failed','academic_cleanup_failed'];
(async()=>{let passed=true;for(const code of [...reviewed,'unreviewed_synthetic_error']){const expected=reviewed.includes(code)?code:'academic_transaction_failed';try{await invoke({ready:async()=>{const error=new Error('synthetic private detail');error.lensCode=code;throw error;}},'ready');passed=false;}catch(error){passed=passed&&error.lensCode===expected;}}console.log(JSON.stringify({ok:passed}));})();
"""
        child = subprocess.run(["node", "-e", script, str(worker)], capture_output=True, text=True, check=False)
        self.assertEqual(child.returncode, 0, "academic_boundary_fixture_failed")
        self.assertTrue(json.loads(child.stdout)["ok"], "reviewed_academic_failure_class_lost")






class ControlBootstrapRegressionTests(unittest.TestCase):
    def test_control_bootstrap_preserves_new_response_schema(self):
        import ast
        import types
        tree = ast.parse(release.build_remote_program({"action": "preflight"}))
        attempt = next(node for node in tree.body if isinstance(node, ast.Try))
        child_assignment = next(node for node in ast.walk(attempt)
                                if isinstance(node, ast.Assign)
                                and isinstance(node.value, ast.Call)
                                and isinstance(node.value.func, ast.Attribute)
                                and node.value.func.attr == "run")
        child_name = child_assignment.targets[0].id
        parent = next(node for node in ast.walk(attempt)
                      if isinstance(node, ast.If) and child_assignment in node.body)
        response_statements = parent.body[parent.body.index(child_assignment) + 1:]
        initial = next(node for node in tree.body if isinstance(node, ast.Assign))
        expected = {"public": release.ReleaseResult(mode="preflight").to_dict()}
        namespace = {"json": json, child_name: types.SimpleNamespace(
            returncode=0, stderr="", stdout=json.dumps(expected))}
        unit = ast.Module(body=[initial, *response_statements], type_ignores=[])
        exec(compile(ast.fix_missing_locations(unit), "<synthetic-bootstrap>", "exec"), namespace)
        self.assertEqual(namespace["result"], expected)

    def test_finish_exits_after_flushing_once_despite_persistent_handle(self):
        import subprocess
        program = "let calls=0; async function __lensControl(){calls++; process.stdout.write(JSON.stringify({ok:true,calls}));} setInterval(()=>{},1000);\n"
        program += release._FINISH_CONTROL + "\nfinish(); finish();\n"
        completed = subprocess.run(["node", "-e", program], capture_output=True, timeout=3)
        self.assertEqual(completed.returncode, 0)
        self.assertEqual(json.loads(completed.stdout), {"ok": True, "calls": 1})
        self.assertFalse(completed.stderr)

    def test_capture_closes_over_block_scoped_settings(self):
        import subprocess
        program = "const root='.'; async function inspect(rows){const candidates=[{pm_id:1}]; const cwd=process.cwd(); const env={}; const storage=cwd; {const settings = {PORT:'3000',DB_HOST:'synthetic',DB_PORT:'3306',DB_USER:'synthetic',DB_PASS:'synthetic',DB_DATABASE:'synthetic'};}};"
        program = release._inject_context_capture(program)
        program += "inspect([]).then(()=>{const c=globalThis.__lensCapture();process.stdout.write(JSON.stringify({captured:!!c,database_present:!!c.database,port_present:!!c.smokePort}));});"
        program = "globalThis.__lensNginxTokens = [];\n" + program
        completed = subprocess.run(["node", "-e", program], capture_output=True, timeout=3)
        self.assertEqual(completed.returncode, 0)
        self.assertEqual(json.loads(completed.stdout), {"captured": True, "database_present": True, "port_present": True})

    def test_nginx_tokens_are_read_before_context_capture_and_reused(self):
        program = r"""
const fs = require('fs');
const ts = require(process.argv[1]);
const source = fs.readFileSync(0, 'utf8');
const ast = ts.createSourceFile('synthetic.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let expression;
function visit(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'nginxTokens')
    expression = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const state = {};
const cwd = '/synthetic/service';
let reads = 0;
function inspectNginx(value) {
  if (value !== cwd) throw new Error('synthetic unexpected root');
  reads += 1;
  state.__lensNginxTokens = ['synthetic-token'];
}
const capture = new Function('globalThis', 'cwd', 'inspectNginx', 'return (' + expression + ')');
const first = capture(state, cwd, inspectNginx);
const second = capture(state, cwd, inspectNginx);
process.stdout.write(JSON.stringify({
  readBeforeCapture: Array.isArray(first),
  singleRead: reads === 1,
  reused: first === second
}));
"""
        compiler = str(Path(release.__file__).resolve().parents[1] / 'node_modules/typescript')
        completed = subprocess.run(["node", "-e", program, compiler],
                                   input=release._CAPTURE, capture_output=True, text=True)
        self.assertTrue(completed.returncode == 0)
        result = json.loads(completed.stdout)
        self.assertTrue(result == {"readBeforeCapture": True, "singleRead": True, "reused": True})


    def test_capture_port_normalizes_only_canonical_valid_integers(self):
        program = r"""
const fs = require('fs');
const ts = require(process.argv[1]);
const source = fs.readFileSync(0, 'utf8');
const ast = ts.createSourceFile('synthetic.js', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
let expression;
function visit(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'smokePort') expression = node.initializer.getText(ast);
  ts.forEachChild(node, visit);
}
visit(ast);
const capture = new Function('settings', 'return (' + expression + ')');
const valid = [3100, '3100', 1, '1', 65535, '65535'];
const invalid = [null, undefined, true, {}, [], '', ' 3100', '3100 ', '3100\n', '03100', '3.1e3', '3100.0', '0xC1C', 0, '0', -1, '-1', 65536, '65536', 3.5, '3.5', NaN, Infinity];
process.stdout.write(JSON.stringify({valid:valid.every(v => capture({PORT:v}) === Number(v)),invalid:invalid.every(v => capture({PORT:v}) === null)}));
"""
        compiler = str(Path(release.__file__).resolve().parents[1] / 'node_modules/typescript')
        completed = subprocess.run(['node', '-e', program, compiler], input=release._CAPTURE, capture_output=True, text=True)
        self.assertEqual(completed.returncode, 0)
        self.assertEqual(json.loads(completed.stdout), {'valid': True, 'invalid': True})


    def test_static_asset_allowlist_preserves_public_pages_without_arbitrary_html(self):
        from unittest.mock import patch
        with patch.object(release, '_STATIC_HTML_FILES', frozenset({'chat/dist/synthetic-help.html'})):
            self.assertEqual(release._role_path('chat_static', 'chat/dist/synthetic-help.html'), 'chat/dist/synthetic-help.html')
            for name in ['chat/dist/unknown.html', 'admin/dist/synthetic-help.html', 'chat/dist/nested/index.html']:
                with self.assertRaises(release.ReleaseError):
                    release._role_path('admin_static' if name.startswith('admin/') else 'chat_static', name)
        for suffix in ['xml', 'webmanifest']:
            self.assertEqual(release._role_path('chat_static', 'chat/dist/synthetic.' + suffix), 'chat/dist/synthetic.' + suffix)
            with self.assertRaises(release.ReleaseError):
                release._role_path('service_build', 'service/dist/synthetic.' + suffix)


    def test_large_release_bootstrap_uses_stdin_and_deploy_timeout(self):
        import ast
        source = release.build_remote_program({'mode': 'deploy', 'deploy': True, 'synthetic': 'x' * 200000})
        tree = ast.parse(source)
        child = next(n for n in ast.walk(tree) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == 'run')
        captured = {}
        class Process:
            @staticmethod
            def run(argv, **kwargs):
                captured.update(argv=argv, **kwargs)
                if any(len(str(value).encode()) > 131071 for value in argv):
                    raise OSError('synthetic single-argument limit')
        expr = ast.Expression(body=child)
        ast.fix_missing_locations(expr)
        eval(compile(expr, '<synthetic>', 'eval'), {'subprocess': Process, 'node': 'node', 'module_root': 'synthetic-root', 'rpc': 'synthetic-rpc'})
        self.assertGreater(len(captured['input']), 200000)
        self.assertEqual(captured['timeout'], 1500)
        self.assertEqual(captured['argv'][3:], ['synthetic-root', 'synthetic-rpc'])
        self.assertLess(len(captured['argv'][2]), 256)
        import subprocess
        result = subprocess.run(captured['argv'], input=b"const a='" + b'x' * 200000 + b"';process.stdout.write(JSON.stringify({size:a.length,first:process.argv[1]==='synthetic-root',second:process.argv[2]==='synthetic-rpc'}));", capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(json.loads(result.stdout), {'size': 200000, 'first': True, 'second': True})





if __name__ == "__main__":
    unittest.main()
