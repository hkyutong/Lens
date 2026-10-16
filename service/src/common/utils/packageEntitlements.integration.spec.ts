declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

import { CramiService } from '../../modules/crami/crami.service';
import { UserBalanceService } from '../../modules/userBalance/userBalance.service';
import { AcademicService } from '../../modules/academic/academic.service';
import { ModelsService } from '../../modules/models/models.service';
import { ChatService as TextChatService } from '../../modules/chat/chat.service';

const restricted = { version: 1, allowedModels: ['synthetic-basic'] };
const body = () => ({
  name: 'synthetic-package', weight: 1, usdPrice: 1, price: 1,
  status: 1, days: 30, model3Count: 10, model4Count: 0,
});

function packageService() {
  const service: any = Object.create(CramiService.prototype);
  service.cramiPackageEntity = {
    findOne: jest.fn().mockResolvedValue(null),
    find: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    save: jest.fn().mockImplementation(async value => value),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  service.packageModelsRepository = { find: jest.fn().mockResolvedValue([{ model: 'synthetic-basic' }]) };
  return service;
}

describe('package entitlements service boundaries', () => {
  it('validates and persists canonical model choices without reading connection fields', async () => {
    const service = packageService();
    await service.createPackage({ ...body(), entitlements: restricted });
    expect(service.cramiPackageEntity.save.mock.calls[0][0].entitlements).toBe(JSON.stringify(restricted));
    expect(service.packageModelsRepository.find.mock.calls[0][0].select).toEqual(['model']);
  });

  it('rejects malformed or unconfigured new model choices before saving', async () => {
    const service = packageService();
    await expect(service.createPackage({ ...body(), entitlements: { version: 1, allowedModels: ['synthetic-unknown'] } }))
      .rejects.toThrow('PACKAGE_MODEL_NOT_CONFIGURED');
    await expect(service.createPackage({ ...body(), entitlements: { version: 2 } }))
      .rejects.toThrow('PACKAGE_ENTITLEMENTS_INVALID');
    expect(service.cramiPackageEntity.save).not.toHaveBeenCalled();
  });

  it('preserves stored entitlements when an update does not submit that field', async () => {
    const service = packageService();
    service.cramiPackageEntity.findOne.mockResolvedValueOnce({ id: 1 }).mockResolvedValueOnce(null);
    await service.updatePackage({ ...body(), id: 1 });
    expect(Object.prototype.hasOwnProperty.call(service.cramiPackageEntity.update.mock.calls[0][1], 'entitlements')).toBe(false);
  });

  it('allows an existing historical model choice to remain but rejects a newly introduced unknown choice', async () => {
    const service = packageService();
    service.cramiPackageEntity.findOne.mockResolvedValue({ id: 1 });
    service.cramiPackageEntity.find.mockResolvedValue([{ id: 1, entitlements: JSON.stringify({ version: 1, allowedModels: ['synthetic-retired'] }) }]);
    await expect(service.validatePackageEntitlements({ version: 1, allowedModels: ['synthetic-retired'] }, JSON.stringify({ version: 1, allowedModels: ['synthetic-retired'] })))
      .resolves.toBe(JSON.stringify({ version: 1, allowedModels: ['synthetic-retired'] }));
    await expect(service.validatePackageEntitlements({ version: 1, allowedModels: ['synthetic-new'] }, JSON.stringify({ version: 1, allowedModels: ['synthetic-retired'] })))
      .rejects.toThrow('PACKAGE_MODEL_NOT_CONFIGURED');
  });

  it('degrades only missing-column reads and rejects writes without pretending they succeeded', async () => {
    const service = packageService();
    const missing = Object.assign(new Error('Unknown column synthetic_package.entitlements'), { code: 'ER_BAD_FIELD_ERROR' });
    service.cramiPackageEntity.find.mockRejectedValue(missing);
    await expect(service.queryPackageEntitlements([1])).resolves.toEqual(new Map());
    service.cramiPackageEntity.save.mockRejectedValue(missing);
    await expect(service.createPackage({ ...body(), entitlements: { version: 1 } }))
      .rejects.toThrow('PACKAGE_ENTITLEMENTS_SCHEMA_REQUIRED');
  });

  it('does not mask unrelated entitlement read failures', async () => {
    const service = packageService();
    service.cramiPackageEntity.find.mockRejectedValue(new Error('synthetic-read-failure'));
    await expect(service.queryPackageEntitlements([1])).rejects.toThrow('PACKAGE_ENTITLEMENTS_UNAVAILABLE');
  });

  it('returns only canonical public package model option fields', async () => {
    const service: any = Object.create(ModelsService.prototype);
    service.modelsEntity = { find: jest.fn().mockResolvedValue([{ model: 'synthetic-basic', modelName: 'synthetic-display', status: true, deductType: 1, key: 'synthetic-private' }]) };
    await expect(service.queryPackageModelOptions()).resolves.toEqual([{ model: 'synthetic-basic', modelName: 'synthetic-display', status: true, deductType: 1 }]);
    expect(service.modelsEntity.find.mock.calls[0][0].select).toEqual(['model', 'modelName', 'status', 'deductType']);
  });
});

function balanceService(expiration: Date | null, packageRow: unknown) {
  const service: any = Object.create(UserBalanceService.prototype);
  service.userBalanceEntity = { findOne: jest.fn().mockResolvedValue({
    packageId: 1, expirationTime: expiration, model3Count: 10, memberModel3Count: 10,
    model4Count: 0, memberModel4Count: 0, drawMjCount: 0, memberDrawMjCount: 0,
  }) };
  service.cramiPackageEntity = { findOne: jest.fn().mockResolvedValue(packageRow) };
  return service;
}

describe('active package entitlement snapshot', () => {
  it('activates only an existing enabled unexpired package', async () => {
    const row = { id: 1, name: 'synthetic-package', weight: 1, status: 1, entitlements: JSON.stringify(restricted) };
    const service = balanceService(new Date(Date.now() + 60_000), row);
    expect((await service.queryUserBalance(1)).packageEntitlements).toEqual(restricted);
    expect((await balanceService(new Date(Date.now() - 60_000), row).queryUserBalance(1)).packageEntitlements).toBeNull();
    expect((await balanceService(new Date(Date.now() + 60_000), null).queryUserBalance(1)).packageEntitlements).toBeNull();
    expect((await balanceService(new Date(Date.now() + 60_000), { ...row, status: 0 }).queryUserBalance(1)).packageEntitlements).toBeNull();
  });

  it('reads an unmigrated package without enabling new entitlements', async () => {
    const service = balanceService(new Date(Date.now() + 60_000), { id: 1, name: 'synthetic-package', weight: 1, status: 1 });
    service.cramiPackageEntity.findOne.mockRejectedValueOnce(Object.assign(new Error('Unknown column synthetic_package.entitlements'), { code: 'ER_BAD_FIELD_ERROR' }));
    expect((await service.queryUserBalance(1)).packageEntitlements).toBeNull();
  });
});

describe('model request access', () => {
  it('combines existing bucket access with the strict canonical model list', async () => {
    const service: any = Object.create(AcademicService.prototype);
    const active = { packageId: 1, packageWeight: 1, isMember: true, packageName: 'synthetic-package', packageEntitlements: restricted };
    service.userBalanceService = { queryUserBalance: jest.fn().mockResolvedValue(active) };
    await expect(service.assertAcademicModelAccess(1, { model: 'synthetic-other', status: true, deductType: 1 }, active)).rejects.toThrow();
    await expect(service.assertAcademicModelAccess(1, { model: 'synthetic-basic', status: true, deductType: 1 }, active)).resolves.toEqual(active);
    await expect(service.assertAcademicModelAccess(1, { model: 'synthetic-basic', status: true, deductType: 2 }, { ...active, packageWeight: 0, packageName: 'free' })).rejects.toThrow();
  });

  it('rejects a configured speech model excluded by the active package before its upstream request', async () => {
    const service: any = Object.create(TextChatService.prototype);
    service.modelsService = { getCurrentModelKeyInfo: jest.fn().mockResolvedValue({ model: 'synthetic-other', deductType: 1, status: true }) };
    service.userBalanceService = {
      queryUserBalance: jest.fn().mockResolvedValue({ packageEntitlements: restricted }),
      validateBalance: jest.fn().mockRejectedValue(new Error('SYNTHETIC_UPSTREAM_STOP')),
    };
    service.chatLogService = { findOneChatLog: jest.fn().mockResolvedValue({ userId: 1 }) };
    await expect(service.ttsProcess({ chatId: 1, model: 'synthetic-other', prompt: 'synthetic-prompt' }, { user: { id: 1 } }, {}))
      .rejects.toThrow('当前套餐不支持所选模型');
    expect(service.userBalanceService.validateBalance).not.toHaveBeenCalled();
  });
});
