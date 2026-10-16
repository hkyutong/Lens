import { UploadController as UploadController } from './upload.controller';
declare const describe: any;
declare const it: any;
declare const expect: any;
declare const jest: any;

import { UploadService as UploadService } from './upload.service';

describe('upload entitlement execution', () => {
  function create(balance: any = { packageEntitlements: null }, legacyMember = false) {
    const service: any = Object.create(UploadService.prototype);
    service.uploadUserBalanceService = { queryUserBalance: jest.fn(async () => balance) };
    service.isAdvancedUser = jest.fn(async () => legacyMember);
    return service;
  }
  const signedUser = { id: 7, role: 'user' };

  it('uses legacy rules when a package has no upload fields', async () => {
    const service = create(
      { packageEntitlements: { version: 1, allowedModels: ['synthetic-model'] } },
      true,
    );
    const policy = await service.resolveUploadUserPolicy(signedUser);
    expect(policy.upload).toBeNull();
    expect(policy.legacyMember).toBe(true);
    expect(policy.exempt).toBe(false);
  });
  it('uses legacy rules for nonmembers and expired members', async () => {
    const service = create({ packageEntitlements: null });
    const policy = await service.resolveUploadUserPolicy(signedUser);
    expect(policy.upload).toBeNull();
    expect(policy.legacyMember).toBe(false);
  });
  it('rejects a package with explicitly disabled uploads before reservation', async () => {
    const service = create({ packageEntitlements: { version: 1, upload: { mode: 'disabled' } } });
    service.checkUploadFrequency = jest.fn();
    await expect(service.resolveUploadUserPolicy(signedUser)).rejects.toThrow();
    expect(service.checkUploadFrequency).not.toHaveBeenCalled();
  });
  it('uses configured daily quota for an active member', async () => {
    const service = create(
      {
        packageEntitlements: {
          version: 1,
          upload: { mode: 'limited', dailyLimit: 9, maxFileSizeMb: 2 },
        },
      },
      true,
    );
    const policy = await service.resolveUploadUserPolicy(signedUser);
    expect(policy.upload).toEqual({ mode: 'limited', dailyLimit: 9, maxFileSizeMb: 2 });
  });
  it('allows internal artifacts without a user quota', async () => {
    const service = create();
    const policy = await service.resolveUploadUserPolicy(undefined);
    expect(policy.exempt).toBe(true);
    expect(service.uploadUserBalanceService.queryUserBalance).not.toHaveBeenCalled();
  });
  it('preserves trusted admin and super upload permissions', async () => {
    for (const role of ['admin', 'super']) {
      const service = create({ packageEntitlements: { version: 1, upload: { mode: 'disabled' } } });
      expect((await service.resolveUploadUserPolicy({ id: 8, role })).exempt).toBe(true);
      expect(service.uploadUserBalanceService.queryUserBalance).not.toHaveBeenCalled();
    }
  });
  it('does not accept a missing or invalid authenticated identity as an internal artifact', async () => {
    for (const identity of [{}, { id: -1 }, { id: 'invalid', role: 'admin' }]) {
      await expect(create().resolveUploadUserPolicy(identity)).rejects.toThrow();
    }
  });
  it('commits exactly once after an independent successful upload', async () => {
    const service = create();
    const reservation = {
      commit: jest.fn(async () => undefined),
      release: jest.fn(async () => undefined),
    };
    service.checkUploadFrequency = jest.fn(async () => reservation);
    const result = await service.runUploadWithQuota(
      { id: 7, legacyMember: false, upload: null, exempt: false },
      async () => 'synthetic-result',
    );
    expect(result).toBe('synthetic-result');
    expect(reservation.commit).toHaveBeenCalledTimes(1);
    expect(reservation.release).not.toHaveBeenCalled();
  });
  it('releases a synchronous or asynchronous storage failure', async () => {
    for (const operation of [
      () => {
        throw new Error('SYNTHETIC_FAILURE');
      },
      async () => {
        throw new Error('SYNTHETIC_FAILURE');
      },
    ]) {
      const service = create();
      const reservation = {
        commit: jest.fn(async () => undefined),
        release: jest.fn(async () => undefined),
      };
      service.checkUploadFrequency = jest.fn(async () => reservation);
      await expect(
        service.runUploadWithQuota(
          { id: 7, legacyMember: false, upload: null, exempt: false },
          operation,
        ),
      ).rejects.toThrow();
      expect(reservation.release).toHaveBeenCalledTimes(1);
      expect(reservation.commit).not.toHaveBeenCalled();
    }
  });
  it('does not run storage or increase a count after quota rejection', async () => {
    const service = create();
    service.checkUploadFrequency = jest.fn(async () => {
      throw new Error('SYNTHETIC_QUOTA_REJECTED');
    });
    const operation = jest.fn(async () => 'synthetic-result');
    await expect(
      service.runUploadWithQuota(
        { id: 7, legacyMember: false, upload: null, exempt: false },
        operation,
      ),
    ).rejects.toThrow();
    expect(operation).not.toHaveBeenCalled();
  });
  it('releases a storage operation that produces no saved upload', async () => {
    const service = create();
    const reservation = {
      commit: jest.fn(async () => undefined),
      release: jest.fn(async () => undefined),
    };
    service.checkUploadFrequency = jest.fn(async () => reservation);
    await expect(
      service.runUploadWithQuota(
        { id: 7, legacyMember: false, upload: null, exempt: false },
        async () => undefined,
      ),
    ).rejects.toThrow();
    expect(reservation.release).toHaveBeenCalledTimes(1);
  });

  function sizeFixture(policy: any) {
    const service = create();
    service.resolveUploadUserPolicy = jest.fn(async () => policy);
    service.globalConfigService = { getConfigs: jest.fn(async () => ({})) };
    service.runUploadWithQuota = jest.fn(async () => 'synthetic-result');
    return service;
  }
  function syntheticFile(size: number, image = false) {
    return {
      size,
      originalname: image ? 'synthetic.png' : 'synthetic.pdf',
      filename: 'synthetic',
      mimetype: image ? 'image/png' : 'application/pdf',
      buffer: Buffer.from('synthetic'),
    };
  }
  it('rejects the physical size limit before any counter is acquired', async () => {
    const service = sizeFixture({ exempt: true, legacyMember: false, upload: null });
    await expect(service.uploadFile(syntheticFile(30 * 1024 * 1024 + 1), undefined, { id: 101, role: 'user' })).rejects.toThrow(/超过/);
    expect(service.runUploadWithQuota).not.toHaveBeenCalled();
  });
  it('rejects a configured package size limit before reservation', async () => {
    const service = sizeFixture({
      id: 7,
      exempt: false,
      legacyMember: true,
      upload: { mode: 'limited', dailyLimit: 9, maxFileSizeMb: 1 },
    });
    await expect(
      service.uploadFile(syntheticFile(1024 * 1024 + 1), undefined, signedUser),
    ).rejects.toThrow(/超过/);
    expect(service.runUploadWithQuota).not.toHaveBeenCalled();
  });
  it('does not let unlimited or a larger package size exceed the physical cap', async () => {
    const service = sizeFixture({
      id: 7,
      exempt: false,
      legacyMember: true,
      upload: { mode: 'unlimited', maxFileSizeMb: 1024 },
    });
    await expect(
      service.uploadFile(syntheticFile(30 * 1024 * 1024 + 1), undefined, signedUser),
    ).rejects.toThrow(/超过/);
    expect(service.runUploadWithQuota).not.toHaveBeenCalled();
  });
  it('preserves legacy nonmember five MiB image and document limits', async () => {
    for (const image of [false, true]) {
      const service = sizeFixture({ id: 7, exempt: false, legacyMember: false, upload: null });
      await expect(
        service.uploadFile(syntheticFile(6 * 1024 * 1024, image), undefined, signedUser),
      ).rejects.toThrow(/超过/);
      expect(service.runUploadWithQuota).not.toHaveBeenCalled();
    }
  });
  it('preserves the ten MiB paid image limit even with a larger package limit', async () => {
    const service = sizeFixture({
      id: 7,
      exempt: false,
      legacyMember: true,
      upload: { mode: 'unlimited', maxFileSizeMb: 30 },
    });
    await expect(
      service.uploadFile(syntheticFile(11 * 1024 * 1024, true), undefined, signedUser),
    ).rejects.toThrow(/超过/);
    expect(service.runUploadWithQuota).not.toHaveBeenCalled();
  });

  it('takes upload identity from the verified request rather than request body role', async () => {
    const controller: any = Object.create(UploadController.prototype);
    const upload = jest.fn(async () => 'synthetic-result');
    controller.uploadService = { uploadFile: upload };
    const identity = { id: 7, role: 'user' };
    const request = { user: identity, body: { role: 'admin', user: { id: 8, role: 'super' } } };
    await controller.uploadFile(syntheticFile(10), request, 'synthetic');
    expect(upload.mock.calls[0][2]).toBe(identity);
  });

  it('keeps a saved upload counted if the commit response fails', async () => {
    const service = create();
    const reservation = {
      commit: jest.fn(async () => {
        throw new Error('SYNTHETIC_ACK_FAILURE');
      }),
      release: jest.fn(async () => undefined),
    };
    service.checkUploadFrequency = jest.fn(async () => reservation);
    await expect(
      service.runUploadWithQuota(
        { id: 7, legacyMember: false, upload: null, exempt: false },
        async () => 'synthetic-saved',
      ),
    ).rejects.toThrow();
    expect(reservation.release).not.toHaveBeenCalled();
  });
});
