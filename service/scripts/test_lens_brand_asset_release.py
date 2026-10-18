"""Synthetic coverage for replacing fixed-name brand assets safely."""

import hashlib
from pathlib import Path
import tempfile
import unittest

import lens_production_file_worker as worker
import lens_release_transaction as transaction
import test_lens_compiled_module_release as baseline


class BrandAssetReleaseTests(unittest.TestCase):
    def fixture(self, base, names, scope='chat'):
        base = base.resolve()
        request, current, candidate = baseline.FilePreflightReleaseTests().fixture(base)
        artifacts = Path(request['stage']) / 'artifacts'
        previous = {}
        for name in names:
            old = b'synthetic old brand'
            new = b'synthetic new brand'
            target = Path(request['target']) / 'public' / scope / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(old)
            previous[target] = old
            source = scope + '/dist/' + name
            artifact = artifacts / source
            artifact.parent.mkdir(parents=True, exist_ok=True)
            artifact.write_bytes(new)
            request['entries'].append({
                'role': scope + '_static', 'source': source,
                'sha256': hashlib.sha256(new).hexdigest(),
                'size': len(new), 'mode': 0o644,
            })
        previous[current] = current.read_bytes()
        return request, previous

    def test_brand_update_is_preflighted_installed_and_independently_restored(self):
        names = [
            'logo.svg', 'logo.png', 'favicon.svg', 'apple-touch-icon.png',
            'mstile-150x150.png', 'safari-pinned-tab.svg',
            'icon/favicon.svg', 'icon/favicon-16x16.png',
            'icon/favicon-32x32.png', 'icon/apple-touch-icon.png',
            'icon/android-chrome-192x192.png', 'icon/android-chrome-512x512.png',
        ]
        with tempfile.TemporaryDirectory() as temporary:
            request, previous = self.fixture(Path(temporary), names)
            self.assertTrue(worker._files_preflight(request)['ok'])
            for target, data in previous.items():
                self.assertEqual(target.read_bytes(), data)
            plan = worker._prepare_file_plan(request)
            installed = transaction.execute_release(plan)
            self.assertTrue(installed.ok)
            self.assertTrue(installed.backup_verified)
            for name in names:
                self.assertEqual(
                    (Path(request['target']) / 'public/chat' / name).read_bytes(),
                    b'synthetic new brand',
                )
            restored = transaction.restore_backup(plan.backup_root, plan.target_root)
            self.assertTrue(restored.ok)
            for target, data in previous.items():
                self.assertEqual(target.read_bytes(), data)

    def test_failure_after_swap_restores_previous_brand_assets(self):
        with tempfile.TemporaryDirectory() as temporary:
            request, previous = self.fixture(Path(temporary), ['logo.svg'])
            plan = worker._prepare_file_plan(request)

            def fail_after_swap(event, index):
                if event == 'after_swap' and index == len(plan.entries) - 1:
                    raise OSError('synthetic swap failure')

            result = transaction.execute_release(plan, fault_injector=fail_after_swap)
            self.assertFalse(result.ok)
            self.assertTrue(result.rollback_attempted)
            self.assertTrue(result.rollback_succeeded)
            for target, data in previous.items():
                self.assertEqual(target.read_bytes(), data)

    def test_fingerprinted_assets_remain_immutable(self):
        with tempfile.TemporaryDirectory() as temporary:
            request, previous = self.fixture(Path(temporary), ['assets/index-abc123.js'])
            with self.assertRaises(worker._PreflightValueError):
                worker._prepare_file_plan(request)
            for target, data in previous.items():
                self.assertEqual(target.read_bytes(), data)

    def test_unreviewed_fixed_name_asset_is_not_overwritable(self):
        with tempfile.TemporaryDirectory() as temporary:
            request, previous = self.fixture(Path(temporary), ['custom-static.svg'])
            with self.assertRaises(worker._PreflightValueError):
                worker._prepare_file_plan(request)
            for target, data in previous.items():
                self.assertEqual(target.read_bytes(), data)

    def test_admin_favicon_is_installed_and_independently_restored(self):
        with tempfile.TemporaryDirectory() as temporary:
            request, previous = self.fixture(Path(temporary), ['favicon.svg'], scope='admin')
            self.assertTrue(worker._files_preflight(request)['ok'])
            for target, data in previous.items():
                self.assertEqual(target.read_bytes(), data)
            plan = worker._prepare_file_plan(request)
            installed = transaction.execute_release(plan)
            self.assertTrue(installed.ok)
            self.assertTrue(installed.backup_verified)
            self.assertEqual((Path(request['target']) / 'public/admin/favicon.svg').read_bytes(), b'synthetic new brand')
            self.assertTrue(transaction.restore_backup(plan.backup_root, plan.target_root).ok)
            for target, data in previous.items():
                self.assertEqual(target.read_bytes(), data)

    def test_admin_favicon_failure_restores_previous_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            request, previous = self.fixture(Path(temporary), ['favicon.svg'], scope='admin')
            plan = worker._prepare_file_plan(request)

            def fail_after_swap(event, index):
                if event == 'after_swap' and index == len(plan.entries) - 1:
                    raise OSError('synthetic swap failure')

            result = transaction.execute_release(plan, fault_injector=fail_after_swap)
            self.assertFalse(result.ok)
            self.assertTrue(result.rollback_succeeded)
            for target, data in previous.items():
                self.assertEqual(target.read_bytes(), data)

    def test_admin_fingerprinted_assets_remain_immutable(self):
        with tempfile.TemporaryDirectory() as temporary:
            request, previous = self.fixture(Path(temporary), ['assets/index-abc12345.js'], scope='admin')
            with self.assertRaises(worker._PreflightValueError):
                worker._prepare_file_plan(request)
            for target, data in previous.items():
                self.assertEqual(target.read_bytes(), data)

    def test_admin_unreviewed_fixed_assets_remain_immutable(self):
        with tempfile.TemporaryDirectory() as temporary:
            request, previous = self.fixture(Path(temporary), ['loading.css'], scope='admin')
            with self.assertRaises(worker._PreflightValueError):
                worker._prepare_file_plan(request)
            for target, data in previous.items():
                self.assertEqual(target.read_bytes(), data)


if __name__ == '__main__':
    unittest.main()
