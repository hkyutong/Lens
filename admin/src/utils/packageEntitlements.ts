import {
  parsePackageEntitlements,
  type PackageEntitlements,
} from '../../../service/src/common/utils/packageEntitlements';

export interface PackageEntitlementDraft {
  modelWhitelistEnabled: boolean;
  allowedModels: string[];
  uploadMode: 'legacy' | 'disabled' | 'limited' | 'unlimited';
  dailyLimit: number;
  maxFileSizeMb: number | undefined;
}

export function createPackageEntitlementDraft(value?: unknown): PackageEntitlementDraft {
  const policy = parsePackageEntitlements(value);
  return {
    modelWhitelistEnabled: Array.isArray(policy?.allowedModels),
    allowedModels: policy?.allowedModels ? [...policy.allowedModels] : [],
    uploadMode: policy?.upload?.mode ?? 'legacy',
    dailyLimit: policy?.upload?.dailyLimit ?? 10,
    maxFileSizeMb: policy?.upload?.maxFileSizeMb ?? undefined,
  };
}

export function serializePackageEntitlementDraft(draft: PackageEntitlementDraft): string | null {
  if (!draft.modelWhitelistEnabled && draft.uploadMode === 'legacy') return null;
  const policy: PackageEntitlements = { version: 1 };
  if (draft.modelWhitelistEnabled) policy.allowedModels = [...draft.allowedModels];
  if (draft.uploadMode !== 'legacy') {
    policy.upload = { mode: draft.uploadMode };
    if (draft.uploadMode === 'limited') policy.upload.dailyLimit = draft.dailyLimit;
    if (draft.uploadMode !== 'disabled' && draft.maxFileSizeMb != null) {
      policy.upload.maxFileSizeMb = draft.maxFileSizeMb;
    }
  }
  return JSON.stringify(policy);
}
