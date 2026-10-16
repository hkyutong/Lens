export type AcademicPlanTier = 'free' | 'plus' | 'pro' | 'max';

function normalizeAcademicPlanLabel(name: string) {
    return String(name || '')
      .replace(/\s+/g, '')
      .replace(/[\-_/\\]+/g, '')
      .replace(/[（）()【】\[\]<>《》:：,.，。'"`]/g, '')
      .replace(/latex/gi, 'latex')
      .toLowerCase();
  }

export function resolveAcademicPlanTier(balance: any): AcademicPlanTier {
    const packageId = Number(balance?.packageId || 0);
    const expirationTime = String(balance?.expirationTime || '').trim();
    const expiration = expirationTime ? new Date(`${expirationTime}T23:59:59`) : null;
    const activeMember =
      packageId > 0 && (!expirationTime || (expiration instanceof Date && expiration.getTime() > Date.now()));
    if (!activeMember) return 'free';

    const weight = Number(balance?.packageWeight || 0);
    if (weight >= 30) return 'max';
    if (weight >= 20) return 'pro';
    if (weight >= 10) return 'plus';

    const packageName = normalizeAcademicPlanLabel(String(balance?.packageName || ''));
    if (packageName.includes('max') || packageName.includes('至尊版')) return 'max';
    if (packageName.includes('pro') || packageName.includes('教授版')) return 'pro';
    if (packageName.includes('plus') || packageName.includes('学生版') || packageName.includes('學生版')) return 'plus';
    return 'plus';
  }

export function canUseAcademicModel(tier: AcademicPlanTier, deductionType: unknown): boolean {
  const maxModelTier = tier === 'max' ? 3 : tier === 'pro' ? 2 : tier === 'plus' || tier === 'free' ? 1 : 0;
  const modelTier = typeof deductionType === 'number'
    ? deductionType
    : typeof deductionType === 'string' && /^[123]$/.test(deductionType.trim())
      ? Number(deductionType)
      : NaN;
  return Number.isInteger(modelTier) && modelTier >= 1 && modelTier <= maxModelTier;
}

export function isAcademicModelEnabled(modelInfo: any): boolean {
    if (!modelInfo) return false;
    if (modelInfo.status === undefined || modelInfo.status === null) return true;
    return Number(modelInfo.status) !== 0;
  }
