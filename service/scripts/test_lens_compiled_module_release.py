import sys
import tempfile
import json
import subprocess
import unittest
from pathlib import Path

sys.path.insert(0, str((Path(__file__).resolve().parent / '.').resolve()))
import lens_release_transaction as release
import lens_production_file_worker as file_worker


class CompiledConfigurationReleaseTests(unittest.TestCase):
    def test_compiled_configuration_module_can_install_and_restore(self):
        with tempfile.TemporaryDirectory() as temporary:
            base = Path(temporary).resolve()
            source, target = base / "source", base / "target"
            relative = "dist/modules/settings/config.entity.js"
            for root, content in [(source, b"export const revision = 2;\n"), (target, b"export const revision = 1;\n")]:
                artifact = root / relative
                artifact.parent.mkdir(parents=True)
                artifact.write_bytes(content)
            baseline = release.capture_baseline(target, [relative], artifact_roots=("dist",), protected_roots=())
            plan = release.prepare_release_plan(
                source, target, [release.ManifestEntry(relative, relative)],
                release_id="0123456789abcdef0123456789abcdef", baseline=baseline,
                backup_root=base / "backup", artifact_roots=("dist",), protected_roots=(),
                source_artifact_roots=("dist",),
            )
            result = release.execute_release(plan)
            self.assertTrue(result.to_dict()["ok"])
            self.assertEqual((target / relative).read_bytes(), b"export const revision = 2;\n")
            release.restore_backup(base / "backup", target)
            self.assertEqual((target / relative).read_bytes(), b"export const revision = 1;\n")

    def test_service_class_and_source_map_remain_releasable(self):
        for relative in ["dist/modules/settings/config.service.js", "dist/modules/settings/config.entity.js.map"]:
            with self.subTest(relative=relative):
                release._allowed(relative, ("dist",), ())

    def test_runtime_configuration_files_remain_protected(self):
        for relative in ["config.js", "dist/config.js", "dist/config.production.js", "dist/appsettings.json", "dist/modules/settings/config.yaml"]:
            with self.subTest(relative=relative), self.assertRaises(release.TransactionError):
                release._allowed(relative, ("dist", "config.js"), ())

    def test_environment_and_secret_material_remain_protected(self):
        for relative in ["dist/modules/.env/config.service.js", "dist/modules/secrets/config.service.js", "dist/modules/settings/key.pem", "dist/modules/settings/.env.production"]:
            with self.subTest(relative=relative), self.assertRaises(release.TransactionError):
                release._allowed(relative, ("dist",), ())

    def test_data_and_dependency_directories_remain_protected(self):
        for relative in ["dist/uploads/config.service.js", "dist/node_modules/config.service.js", "uploads/config.service.js", "dist/storage/config.service.js"]:
            with self.subTest(relative=relative), self.assertRaises(release.TransactionError):
                release._allowed(relative, ("dist", "uploads"), ())

    def test_public_configuration_does_not_gain_the_compiled_exception(self):
        with self.assertRaises(release.TransactionError):
            release._allowed("public/chat/config.service.js", ("public/chat",), ())


class FilePreflightReleaseTests(unittest.TestCase):
    def fixture(self, base):
        stage, target, bundle = base / "stage", base / "target", base / "bundle"
        for root in (stage, target, bundle):
            root.mkdir(mode=0o700)
        entry = {'role': 'service_build', 'source': 'service/dist/config.entity.js'}
        destination = 'dist/config.entity.js'
        candidate = stage / "artifacts" / entry["source"]
        candidate.parent.mkdir(parents=True)
        candidate.write_bytes(b"export const revision = 2;\n")
        current = target / destination
        current.parent.mkdir(parents=True)
        current.write_bytes(b"export const revision = 1;\n")
        entry.update({"sha256": file_worker._hash(candidate), "size": candidate.stat().st_size, "mode": 0o644})
        request = {"stage": str(stage), "target": str(target), "bundle": str(bundle), "entries": [entry], "release_id": "0123456789abcdef0123456789abcdef"}
        return request, current, candidate

    def test_preflight_keeps_target_unchanged_and_allows_following_apply(self):
        with tempfile.TemporaryDirectory() as temporary:
            request, current, candidate = self.fixture(Path(temporary).resolve())
            before = current.read_bytes()
            result = file_worker._files_preflight(request)
            self.assertTrue(result["ok"])
            self.assertEqual(current.read_bytes(), before)
            self.assertFalse((Path(request["bundle"]) / "files").exists())
            self.assertTrue(file_worker._files(request)["ok"])
            self.assertEqual(current.read_bytes(), candidate.read_bytes())

    def test_missing_candidate_fails_before_any_target_mutation(self):
        with tempfile.TemporaryDirectory() as temporary:
            request, current, candidate = self.fixture(Path(temporary).resolve())
            before = current.read_bytes()
            candidate.unlink()
            with self.assertRaises(Exception) as failure:
                file_worker._files_preflight(request)
            self.assertNotIsInstance(failure.exception, AttributeError)
            self.assertEqual(current.read_bytes(), before)
            self.assertFalse((Path(request["bundle"]) / "files").exists())

    def test_cli_preflight_dispatch_validates_without_applying(self):
        with tempfile.TemporaryDirectory() as temporary:
            request, current, _candidate = self.fixture(Path(temporary).resolve())
            before = current.read_bytes()
            request["action"] = "files_preflight"
            result = subprocess.run([sys.executable, file_worker.__file__], input=json.dumps(request), text=True, capture_output=True, check=False)
            self.assertEqual(result.returncode, 0)
            self.assertTrue(json.loads(result.stdout)["ok"])
            self.assertEqual(current.read_bytes(), before)
            self.assertFalse((Path(request["bundle"]) / "files").exists())


if __name__ == "__main__":
    unittest.main()
