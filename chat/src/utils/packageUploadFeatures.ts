import { resolvePackageUploadEntitlement } from '../../../service/src/common/utils/packageEntitlements';

type Translate = (key: string, values?: Record<string, number>) => string;

export function getPackageUploadFeatures(packageInfo: unknown, translate: Translate): string[] {
  if (!packageInfo || typeof packageInfo !== 'object' || Array.isArray(packageInfo)) return [];
  if (!('entitlements' in packageInfo)) return [];

  try {
    const raw = packageInfo.entitlements;
    const upload = resolvePackageUploadEntitlement(typeof raw === 'string' ? raw : JSON.stringify(raw));
    if (!upload) return [];

    const features: string[] = [];
    const add = (key: string, values?: Record<string, number>) => {
      const text = translate(key, values);
      if (typeof text === 'string' && text.trim() && text !== key) features.push(text);
    };

    if (upload.mode === 'disabled') {
      add('packageUploadFeatures.disabled');
      return features;
    }

    if (upload.mode === 'limited') {
      add('packageUploadFeatures.dailyLimit', { count: upload.dailyLimit! });
    } else {
      add('packageUploadFeatures.unlimited');
    }

    if (upload.maxFileSizeMb !== undefined) {
      add('packageUploadFeatures.fileAllowance', { size: Math.min(upload.maxFileSizeMb, 30) });
    }

    return features;
  } catch {
    return [];
  }
}
