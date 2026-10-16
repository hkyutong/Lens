import { ModelsService } from './models.service';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const jest: any;

describe('ModelsService model key boundary', () => {
  const secret = 'synthetic-secret-that-must-never-leave-the-service';

  function createService() {
    const modelsEntity = {
      find: jest.fn().mockResolvedValue([]),
      findAndCount: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findOne: jest.fn(),
      save: jest.fn(),
    };
    const service = new ModelsService(modelsEntity as any);
    return { service, modelsEntity };
  }

  it('never returns a model key, including for super administrators', async () => {
    const { service, modelsEntity } = createService();
    modelsEntity.findAndCount.mockResolvedValue([
      [{ id: 7, key: secret, modelName: 'Synthetic model' }],
      1,
    ]);

    const result = await service.queryModels({ user: { role: 'super' } }, {} as any);

    expect(result.rows[0]).toMatchObject({ key: '[已配置]', keyConfigured: true });
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('keeps the existing key when an edited model submits a blank key', async () => {
    const { service, modelsEntity } = createService();

    await service.setModel({ id: 7, modelName: 'Synthetic model', key: '' } as any);

    expect(modelsEntity.update).toHaveBeenCalledWith(
      { id: 7 },
      expect.not.objectContaining({ key: expect.anything() }),
    );
  });
});
