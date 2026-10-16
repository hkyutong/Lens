declare const describe: any;
declare const expect: any;
declare const it: any;
import {
  isPackageModelAllowed,
  isMissingPackageEntitlementsColumn,
  normalizePackageEntitlementsInput,
  parsePackageEntitlements,
  resolvePackageUploadEntitlement,
} from './packageEntitlements';

describe('package entitlements contract', () => {
  it('preserves missing legacy entitlements and denies an explicit empty model list', () => {
    expect(parsePackageEntitlements(undefined)).toBeNull();
    expect(parsePackageEntitlements(null)).toBeNull();
    expect(isPackageModelAllowed(undefined, { model: 'synthetic-basic' })).toBe(true);
    expect(isPackageModelAllowed({ version: 1 }, { model: 'synthetic-basic' })).toBe(true);
    expect(isPackageModelAllowed({ version: 1, allowedModels: [] }, { model: 'synthetic-basic' })).toBe(false);
  });

  it('matches only the configured canonical model field', () => {
    const policy = { version: 1, allowedModels: ['synthetic-basic'] };
    expect(isPackageModelAllowed(policy, { model: 'synthetic-basic', id: 1, modelName: 'synthetic-display' })).toBe(true);
    expect(isPackageModelAllowed(policy, { model: 'synthetic-other', modelName: 'synthetic-basic' })).toBe(false);
    expect(isPackageModelAllowed(policy, { id: 1, key: 'synthetic-basic' })).toBe(false);
    expect(isPackageModelAllowed(policy, 'synthetic-basic')).toBe(true);
  });

  it('round trips a valid fixed schema and exposes the upload resolver', () => {
    const policy = {
      version: 1,
      allowedModels: ['synthetic-basic', 'synthetic/vendor-pro'],
      upload: { mode: 'limited', dailyLimit: 5, maxFileSizeMb: 20 },
    };
    const serialized = normalizePackageEntitlementsInput(policy);
    expect(parsePackageEntitlements(serialized)).toEqual(policy);
    expect(resolvePackageUploadEntitlement(serialized)).toEqual(policy.upload);
    expect(resolvePackageUploadEntitlement({ version: 1 })).toBeNull();
    expect(normalizePackageEntitlementsInput(null)).toBeNull();
  });

  it.each([
    { version: 2 },
    { version: 1, unknown: true },
    { version: 1, allowedModels: null },
    { version: 1, allowedModels: ['synthetic-basic', 'synthetic-basic'] },
    { version: 1, allowedModels: [' synthetic-basic'] },
    { version: 1, allowedModels: ['a'.repeat(129)] },
    { version: 1, allowedModels: Array.from({ length: 129 }, (_, i) => `synthetic-${i}`) },
    { version: 1, upload: { mode: 'limited' } },
    { version: 1, upload: { mode: 'limited', dailyLimit: 0 } },
    { version: 1, upload: { mode: 'limited', dailyLimit: 1.5 } },
    { version: 1, upload: { mode: 'limited', dailyLimit: Number.MAX_SAFE_INTEGER } },
    { version: 1, upload: { mode: 'unlimited', dailyLimit: 2 } },
    { version: 1, upload: { mode: 'disabled', dailyLimit: 2 } },
    { version: 1, upload: { mode: 'disabled', maxFileSizeMb: 2 } },
    { version: 1, upload: { mode: 'unlimited', maxFileSizeMb: 0 } },
    { version: 1, upload: { mode: 'unlimited', maxFileSizeMb: 1.5 } },
    { version: 1, upload: { mode: 'unlimited', unknown: true } },
    'invalid-json',
    `{"version":1,"allowedModels":["${'a'.repeat(17000)}"]}`,
  ])('rejects invalid new configuration without returning its original value', value => {
    expect(() => normalizePackageEntitlementsInput(value)).toThrow('PACKAGE_ENTITLEMENTS_INVALID');
    expect(parsePackageEntitlements(value)).toBeNull();
  });

  it('accepts explicit unlimited and disabled upload modes', () => {
    expect(resolvePackageUploadEntitlement({ version: 1, upload: { mode: 'unlimited', maxFileSizeMb: 30 } }))
      .toEqual({ mode: 'unlimited', maxFileSizeMb: 30 });
    expect(resolvePackageUploadEntitlement({ version: 1, upload: { mode: 'disabled' } }))
      .toEqual({ mode: 'disabled' });
  });

  it('classifies only the missing entitlement column as an optional legacy read', () => {
    expect(isMissingPackageEntitlementsColumn(new Error('Unknown column synthetic_package.entitlements'))).toBe(true);
    expect(isMissingPackageEntitlementsColumn({ driverError: { message: 'no such column: entitlements' } })).toBe(true);
    expect(isMissingPackageEntitlementsColumn(new Error('Unknown column synthetic_package.usdPrice'))).toBe(false);
    expect(isMissingPackageEntitlementsColumn(new Error('synthetic-unavailable'))).toBe(false);
  });
});
