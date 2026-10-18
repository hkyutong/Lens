"""Read-only backup inventory through the existing reviewed connection boundary."""

from dataclasses import dataclass, asdict
import argparse
import json

import lens_safe_ops as safe_ops
import lens_production_release as release


@dataclass(frozen=True)
class BackupInventoryResult:
    ok: bool = False
    namespace_owned: bool = False
    scan_complete: bool = False
    backup_directory_count: int = 0
    declared_verified_count: int = 0
    owned_unverified_count: int = 0
    unknown_entry_count: int = 0
    unsafe_entry_count: int = 0
    sole_verified_backup: bool = False
    error: str = 'scan_incomplete'


def project_inventory(value):
    expected = asdict(BackupInventoryResult())
    if type(value) is not dict or set(value) != set(expected):
        return BackupInventoryResult(error='response_rejected')
    for key, default in expected.items():
        if type(value[key]) is not type(default):
            return BackupInventoryResult(error='response_rejected')
        if type(default) is int and not 0 <= value[key] <= 4096:
            return BackupInventoryResult(error='response_rejected')
    if value['error'] not in {'none', 'namespace_unverified', 'scan_incomplete'}:
        return BackupInventoryResult(error='response_rejected')
    sole = (value['ok'] and value['namespace_owned'] and value['scan_complete']
            and value['backup_directory_count'] == 1
            and value['declared_verified_count'] == 1
            and not value['owned_unverified_count']
            and not value['unknown_entry_count'] and not value['unsafe_entry_count'])
    if value['sole_verified_backup'] != sole:
        return BackupInventoryResult(error='response_rejected')
    if value['declared_verified_count'] + value['owned_unverified_count'] > value['backup_directory_count']:
        return BackupInventoryResult(error='response_rejected')
    return BackupInventoryResult(**value)


def run_backup_inventory(*, host_key_reviewed=False):
    secrets = None
    try:
        secrets = safe_ops.load_project_entry()
        with safe_ops._trusted_connection(secrets, host_key_reviewed=host_key_reviewed) as client:
            response = release._execute(client, {'mode': 'backup_inventory'}, 120)
        return project_inventory(response.get('public'))
    except Exception:
        return BackupInventoryResult(error='ssh_read_failed')
    finally:
        if secrets is not None:
            secrets.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--host-key-reviewed', action='store_true')
    args = parser.parse_args()
    result = run_backup_inventory(host_key_reviewed=args.host_key_reviewed)
    print(json.dumps(asdict(result), separators=(',', ':')))
    return 0 if result.ok else 1


if __name__ == '__main__':
    raise SystemExit(main())
