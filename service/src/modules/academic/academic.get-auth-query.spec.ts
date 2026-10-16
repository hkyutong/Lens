import axios, { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios';
import { AcademicService } from './academic.service';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const beforeEach: any;
declare const afterEach: any;
declare const jest: any;

describe('Authenticated academic GET transport', () => {
  let service: any;
  let previousSecret: string | undefined;
  let requests: InternalAxiosRequestConfig[];

  beforeEach(() => {
    previousSecret = process.env.LENS_ACADEMIC_INTERNAL_SECRET;
    process.env.LENS_ACADEMIC_INTERNAL_SECRET = 'synthetic-academic-get-test-secret-only';
    requests = [];
    service = Object.create(AcademicService.prototype);
    service.logger = { warn: jest.fn() };
    service.getAcademicBaseUrls = () => ['http://example.invalid'];
    service.getAcademicTimeout = () => 1000;
  });

  afterEach(() => {
    if (previousSecret === undefined) delete process.env.LENS_ACADEMIC_INTERNAL_SECRET;
    else process.env.LENS_ACADEMIC_INTERNAL_SECRET = previousSecret;
  });

  const identity = {
    ownerId: 7,
    requestId: '11111111-1111-4111-8111-111111111111',
  };
  const report = 'academic-report:11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222';

  function config(statuses = [200]): AxiosRequestConfig {
    return {
      params: { path: report },
      responseType: 'arraybuffer',
      maxContentLength: 16384,
      headers: { 'x-synthetic': 'preserved' },
      adapter: async request => {
        requests.push(request);
        return {
          data: Buffer.from('synthetic complete report'),
          status: statuses[Math.min(requests.length - 1, statuses.length - 1)],
          statusText: 'synthetic',
          headers: {},
          config: request,
        };
      },
    };
  }

  it('sends an opaque report query exactly once, matching the signed resource', async () => {
    await service.getAcademic('/synthetic-file', config(), identity);
    const url = new URL(axios.getUri(requests[0]));
    expect(url.searchParams.getAll('path')).toEqual([report]);
    expect(url.pathname + url.search).toBe(
      '/synthetic-file?' + new URLSearchParams({ path: report }).toString(),
    );
  });

  it('preserves download constraints and does not mutate caller options', async () => {
    const options = config();
    const response = await service.getAcademic('/synthetic-file', options, identity);
    expect(requests[0].responseType).toBe('arraybuffer');
    expect(requests[0].maxContentLength).toBe(16384);
    expect(requests[0].headers['x-synthetic']).toBe('preserved');
    expect(options.params).toEqual({ path: report });
    expect(Buffer.isBuffer(response.response.data)).toBe(true);
  });

  it('keeps a query-free health request query-free', async () => {
    const options = config();
    delete options.params;
    await service.getAcademic('/health', options, identity);
    expect(new URL(axios.getUri(requests[0])).search).toBe('');
  });

  it('uses the identical canonical query after a failed runtime candidate', async () => {
    service.getAcademicBaseUrls = () => ['http://first.invalid', 'http://second.invalid'];
    await service.getAcademic('/synthetic-file', config([503, 200]), identity);
    expect(requests).toHaveLength(2);
    for (const request of requests) {
      const url = new URL(axios.getUri(request));
      expect(url.searchParams.getAll('path')).toEqual([report]);
      expect(url.search.slice(1)).toBe(new URLSearchParams({ path: report }).toString());
    }
  });
});
