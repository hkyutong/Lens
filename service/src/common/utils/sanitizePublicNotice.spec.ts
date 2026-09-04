declare const describe: (name: string, testSuite: () => void) => void;
declare const expect: (value: unknown) => { toBe: (expected: unknown) => void };
declare const it: {
  (name: string, testCase: () => void): void;
  each: <T>(values: T[]) => (name: string, testCase: (value: T) => void) => void;
};

import { LENS_USAGE_NOTICE } from '../constants/usageNotice.constant';
import { sanitizePublicNotice } from './sanitizePublicNotice';

describe('sanitizePublicNotice', () => {
  it('uses the Lens notice when public content is empty', () => {
    expect(sanitizePublicNotice('')).toBe(LENS_USAGE_NOTICE);
  });

  it.each([
    '初始管理员账号密码 super 123456',
    '預設管理員帳號密碼 root passw0rd',
    'username: teacher\npassword: secret123',
    'super 123456',
  ])('fails closed when a notice resembles credential disclosure', notice => {
    expect(sanitizePublicNotice(notice)).toBe(LENS_USAGE_NOTICE);
  });

  it('preserves safe custom content and normalizes the retired product alias', () => {
    expect(sanitizePublicNotice('# YutoLens 维护公告\n周六暂停服务。')).toBe(
      '# Lens 维护公告\n周六暂停服务。',
    );
  });

  it('keeps a safety reminder that mentions account passwords without exposing one', () => {
    const reminder = '请勿上传密钥、证件、账号密码或其他敏感内容。';
    expect(sanitizePublicNotice(reminder)).toBe(reminder);
  });
});
