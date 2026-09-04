import { LENS_USAGE_NOTICE } from '../constants/usageNotice.constant';

const credentialDisclosurePatterns = [
  /(?:初始|默认|預設).{0,16}(?:管理员|管理員|预览|預覽|账号|帳號|账户|帳戶|用户|用戶).{0,24}(?:密码|密碼|口令)/i,
  /(?:账号|帳號|账户|帳戶|用户名|用戶名)\s*[:：=]\s*\S+.{0,40}(?:密码|密碼|口令)\s*[:：=]\s*\S+/i,
  /\b(?:password|passwd|pwd)\s*[:：=]\s*\S+/i,
  /\b(?:admin|super|root)\s+[A-Za-z0-9!@#$%^&*._-]{4,}\b/i,
];

/**
 * Public notices are database-managed content, so they must cross a fail-closed
 * boundary before reaching unauthenticated clients.
 */
export function sanitizePublicNotice(value: unknown) {
  const normalized = String(value || '')
    .replace(/\bYutoLens\b/gi, 'Lens')
    .trim();

  if (!normalized) return LENS_USAGE_NOTICE;
  if (credentialDisclosurePatterns.some(pattern => pattern.test(normalized))) {
    return LENS_USAGE_NOTICE;
  }
  return normalized;
}
