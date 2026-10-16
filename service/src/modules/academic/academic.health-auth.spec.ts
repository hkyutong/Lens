import type { Request } from 'express';
declare const describe: any;
declare const it: any;
declare const jest: any;
declare const expect: any;
import { AcademicController } from './academic.controller';
import { AcademicService } from './academic.service';

describe('academic health request identity', () => {
  it('passes the authenticated request through the controller', async () => {
    const service = { health: jest.fn(async () => ({ status: 'ready' })) };
    const controller = new AcademicController(service as unknown as AcademicService);
    const request = { user: { id: 42 } } as unknown as Request;
    await controller.academicHealth(request, 'fixture-model', 'Fixture');
    expect(service.health).toHaveBeenCalledWith('fixture-model', 'Fixture', request);
  });

  it('signs the health request with the existing owner and request scope', async () => {
    const service = Object.create(AcademicService.prototype);
    const request = { user: { id: 42 } } as unknown as Request;
    service.getAcademic = jest.fn(async () => ({ data: { status: 'ready' } }));
    service.resolveAcademicModelInfo = jest.fn(async () => ({
      modelInfo: { key: 'synthetic-key' },
    }));
    service.logger = { warn: jest.fn(), error: jest.fn() };
    await service.health('fixture-model', 'Fixture', request);
    expect(service.getAcademic).toHaveBeenCalledWith('/health', expect.any(Object), {
      ownerId: 42,
      requestId: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });
});
