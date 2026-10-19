"""Review and remove only redundant, owned backup bundles."""

from dataclasses import dataclass, asdict

import lens_safe_ops as safe_ops
import lens_production_release as release


@dataclass(frozen=True)
class BackupRetentionResult:
    coverage_latest_valid: bool = False
    coverage_unknown_file_count: int = 0
    coverage_unknown_symlink_count: int = 0
    coverage_unknown_regular_file_count: int = 0
    coverage_unknown_empty_file_count: int = 0
    coverage_unknown_empty_directory_count: int = 0
    coverage_unknown_directory_file_count: int = 0
    coverage_unknown_directory_count: int = 0
    coverage_binding_failure_count: int = 0
    coverage_extra_database_file_count: int = 0
    coverage_manifest_read: bool = False
    coverage_manifest_valid: bool = False
    coverage_tables_valid: bool = False
    coverage_bundle_valid: bool = False
    coverage_database_valid_count: int = 0
    coverage_database_unique_count: int = 0
    coverage_database_invalid_count: int = 0
    coverage_unknown_layout_count: int = 0
    coverage_metadata_rejected_count: int = 0
    history_memory_recovery_verified: bool = False
    history_archived_schema_count: int = 0
    history_archived_version_count: int = 0
    history_archived_row_count: int = 0
    history_source_snapshot_count: int = 0
    history_committed: bool = False
    history_cleanup_complete: bool = False
    ok: bool = False
    scan_complete: bool = False
    namespace_owned: bool = False
    backup_count_before: int = 0
    verified_count: int = 0
    unverified_count: int = 0
    eligible_count: int = 0
    retained_unverified_count: int = 0
    unique_content_candidate_count: int = 0
    metadata_rejected_count: int = 0
    referenced_candidate_count: int = 0
    unsafe_candidate_count: int = 0
    removed_count: int = 0
    backup_count_after: int = 0
    verified_backup_preserved: bool = False
    sole_verified_backup: bool = False
    cleanup_requested: bool = False
    error: str = 'scan_incomplete'
    failure_stage: str = 'none'
    failure_reason: str = 'none'


def project_retention(value):
    schema = asdict(BackupRetentionResult())
    if type(value) is not dict or set(value) != set(schema):
        return BackupRetentionResult(error='response_rejected')
    for key, default in schema.items():
        if type(value[key]) is not type(default):
            return BackupRetentionResult(error='response_rejected')
        if type(default) is int and not 0 <= value[key] <= (1000000 if key in {"history_archived_version_count", "history_archived_row_count"} else 4096):
            return BackupRetentionResult(error='response_rejected')
    errors = {"history_commit_failed", "history_recovery_failed", 'none', 'scan_incomplete', 'unsafe_entry', 'metadata_rejected',
              'changed_during_review', 'limits_exceeded', 'inventory_mismatch',
              'unique_verified_backup_required', 'operation_failed'}
    if value['error'] not in errors:
        return BackupRetentionResult(error='response_rejected')
    if value['failure_stage'] not in {'none', 'inventory', 'namespace_security', 'bundle_security',
                                      'bundle_metadata', 'retained_tree', 'candidate_tree', 'content_hash',
                                      'retained_recheck', 'pre_delete_check', 'delete', 'final_check'}:
        return BackupRetentionResult(error='response_rejected')
    if value['failure_reason'] not in {'none', 'symbolic_link', 'wrong_type', 'multiple_links',
                                       'writable_by_others', 'different_owner'}:
        return BackupRetentionResult(error='response_rejected')
    if (value['removed_count'] > value['eligible_count']
            or value['eligible_count'] > value['unverified_count']
            or value['removed_count'] and not value['cleanup_requested']):
        return BackupRetentionResult(error='response_rejected')
    if value['ok'] and not (value['scan_complete'] and value['namespace_owned']
                            and value['verified_backup_preserved'] and value['error'] == 'none'):
        return BackupRetentionResult(error='response_rejected')
    if value['sole_verified_backup'] and not (value['backup_count_after'] == 1
                                             and value['verified_count'] == 1
                                             and value['retained_unverified_count'] == 0
                                             and value['verified_backup_preserved']):
        return BackupRetentionResult(error='response_rejected')
    if value["history_committed"] and (not value["history_cleanup_complete"] or value["cleanup_requested"]):
        return BackupRetentionResult(error='response_rejected')
    return BackupRetentionResult(**value)


def run_backup_retention(*, cleanup=False, restore_verified=False,
                         expected_backups=12, expected_unverified=11,
                         host_key_reviewed=False, archive_history=False, recover_history=False):
    if any(type(value) is not bool for value in (archive_history, recover_history, cleanup)) or sum((archive_history, recover_history, cleanup)) > 1:
        return BackupRetentionResult(error='request_rejected')
    if (type(cleanup) is not bool or type(restore_verified) is not bool
            or type(expected_backups) is not int or type(expected_unverified) is not int
            or not 1 <= expected_backups <= 4096
            or expected_unverified != expected_backups - 1):
        return BackupRetentionResult(error='request_rejected')
    if cleanup and not restore_verified:
        return BackupRetentionResult(error='restore_evidence_required')
    secrets = None
    try:
        secrets = safe_ops.load_project_entry()
        with safe_ops._trusted_connection(secrets, host_key_reviewed=host_key_reviewed) as client:
            request = {'mode': 'backup_history_recovery' if recover_history else 'backup_history_commit' if archive_history else 'backup_retention_cleanup' if cleanup else 'backup_retention_audit',
                       'expected_backups': expected_backups, 'expected_unverified': expected_unverified}
            response = release._execute(client, request, 180)
        return project_retention(response.get('public'))
    except Exception:
        return BackupRetentionResult(error='ssh_read_failed')
    finally:
        if secrets is not None:
            secrets.close()
