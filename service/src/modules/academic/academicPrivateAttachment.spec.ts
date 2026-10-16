import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Request, Response } from 'express';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { AcademicService } from './academic.service';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const jest: any;

jest.mock('pdf-parse', () => jest.fn(async () => ({ text: 'Synthetic PDF research text' })));
jest.mock('mammoth', () => ({
  extractRawText: jest.fn(async () => ({ value: 'Synthetic Word research text' })),
}));

const reference = 'attachment:00000000-0000-4000-8000-000000000001';
const foreignReference = 'attachment:00000000-0000-4000-8000-000000000002';
const syntheticIdentity = { ownerId: 31, requestId: '00000000-0000-4000-8000-000000000031' };
const syntheticReport = 'academic-report:00000000-0000-4000-8000-000000000031:00000000-0000-4000-8000-000000000041';
const request = (id: unknown = 31) => ({ user: { id } } as Request);

function createService(filename = 'synthetic.txt', text = 'Synthetic research text') {
  const service = Object.create(AcademicService.prototype) as any;
  service.attachmentService = {
    readOwnedAttachment: jest.fn(async (ref: string, ownerId: number) => {
      if (ref !== reference || ownerId !== 31) throw new NotFoundException();
      return { buffer: Buffer.from(text), filename, contentType: 'application/octet-stream' };
    }),
    storePrivateAttachment: jest.fn(async () => reference),
  };
  service.academicTextContextExtensions = new Set(['txt', 'tex']);
  service.academicDirectReadExtensions = new Set(['txt', 'tex', 'pdf', 'doc', 'docx']);
  service.academicArchiveExtensions = new Set(['zip']);
  service.logger = { warn: jest.fn(), error: jest.fn(), log: jest.fn() };
  service.getAcademic = jest.fn();
  service.getAcademicRequestIdentity = (req: Request) => ({ ...syntheticIdentity, ownerId: service.getAcademicOwnerId(req) });
  return service;
}

describe('Academic private attachment boundary', () => {
  it('uses owner-authorized bytes and trusted filename', async () => {
    const service = createService();
    const result = await service.readAcademicAttachment(
      { url: reference, name: '../../spoof.pdf' },
      request(),
    );
    expect(result.fileName).toBe('synthetic.txt');
    expect(result.extension).toBe('txt');
    expect(result.buffer.toString()).toBe('Synthetic research text');
    expect(service.attachmentService.readOwnedAttachment).toHaveBeenCalledWith(reference, 31);
  });

  it.each([undefined, null, 0, -1, NaN, Number.MAX_SAFE_INTEGER + 1, '31'])(
    'rejects missing or invalid identity before reading bytes',
    async id => {
      const service = createService();
      const req = id === undefined ? ({} as Request) : request(id);
      await expect(service.readAcademicAttachment({ url: reference }, req)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(service.attachmentService.readOwnedAttachment).not.toHaveBeenCalled();
    },
  );

  it.each([
    'https://example.invalid/synthetic.txt',
    '/uploads/synthetic.txt',
    '../synthetic.txt',
    '',
  ])('rejects legacy URL and path input without making network requests', async url => {
    const service = createService();
    await expect(service.readAcademicAttachment({ url }, request())).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(service.attachmentService.readOwnedAttachment).not.toHaveBeenCalled();
    expect(service.getAcademic).not.toHaveBeenCalled();
  });

  it('rejects cross-owner references', async () => {
    const service = createService();
    await expect(
      service.readAcademicAttachment({ url: foreignReference }, request()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['synthetic.txt', 'Synthetic text context', 'Synthetic text context'],
    ['synthetic.tex', '\\section{Synthetic topic} Synthetic TeX context', 'Synthetic TeX context'],
    ['synthetic.pdf', 'Synthetic PDF bytes', 'Synthetic PDF research text'],
    ['synthetic.docx', 'Synthetic Word bytes', 'Synthetic Word research text'],
  ])('builds authenticated context for %s', async (filename, text, expected) => {
    const service = createService(filename, text);
    const output = await service.buildAcademicAttachmentContext(reference, request());
    expect(output).toContain(expected);
    expect(service.attachmentService.readOwnedAttachment).toHaveBeenCalledWith(reference, 31);
  });

  it.each([
    ['synthetic.pdf', 'buildPdfFallbackSummary', 'Synthetic PDF research text'],
    ['synthetic.docx', 'buildWordFallbackSummary', 'Synthetic Word research text'],
    ['synthetic.tex', 'buildLatexFallbackSummary', 'Synthetic TeX fallback'],
  ])('uses the authenticated reader for the %s fallback', async (filename, method, expected) => {
    const service = createService(filename, '\\section{Synthetic topic} Synthetic TeX fallback');
    expect(await service[method](reference, request())).toContain(expected);
    expect(service.attachmentService.readOwnedAttachment).toHaveBeenCalledWith(reference, 31);
  });

  it('downloads owner attachments without an upstream path proxy', async () => {
    const service = createService();
    const res = { setHeader: jest.fn(), end: jest.fn() } as unknown as Response;
    await service.proxyFile(reference, request(), res);
    expect(res.end).toHaveBeenCalledWith(Buffer.from('Synthetic research text'));
    expect(service.getAcademic).not.toHaveBeenCalled();
  });

  it('refuses arbitrary report paths before contacting the upstream', async () => {
    const service = createService();
    const res = { setHeader: jest.fn(), end: jest.fn() } as unknown as Response;
    await expect(
      service.proxyFile('../synthetic-report.txt', request(), res),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(service.getAcademic).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });

  it('materializes private input bytes in an isolated workspace', async () => {
    const service = createService();
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lens-synthetic-academic-'));
    service.getAcademicTempRoot = () => root;
    try {
      const workspace = await service.pullFilesToAcademic(reference, '31', request());
      const entry = await fs.readFile(path.join(workspace, 'synthetic.txt'));
      expect(entry.toString()).toBe('Synthetic research text');
      expect((await fs.lstat(path.join(workspace, 'synthetic.txt'))).isSymbolicLink()).toBe(false);
      expect((await fs.stat(workspace)).mode & 0o777).toBe(0o700);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('removes a partially materialized workspace after a write failure', async () => {
    const service = createService();
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lens-synthetic-academic-'));
    service.getAcademicTempRoot = () => root;
    const write = jest.spyOn(fs, 'writeFile').mockRejectedValueOnce(new Error('synthetic failure'));
    try {
      await expect(service.pullFilesToAcademic(reference, '31', request())).rejects.toThrow();
      expect(await fs.readdir(root)).toEqual([]);
    } finally {
      write.mockRestore();
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('does not materialize a foreign input or mismatched workspace owner', async () => {
    const service = createService();
    service.createAcademicLinkedWorkspace = jest.fn();
    await expect(service.pullFilesToAcademic(reference, '32', request())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      service.pullFilesToAcademic(foreignReference, '31', request()),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(service.createAcademicLinkedWorkspace).not.toHaveBeenCalled();
  });

  it('cleans a private workspace when the response closes', async () => {
    const service = createService();
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lens-synthetic-academic-'));
    service.getAcademicTempRoot = () => root;
    const handlers = new Map<string, () => Promise<void>>();
    const req = request();
    req.res = {
      once: (event: string, handler: () => Promise<void>) => handlers.set(event, handler),
    } as any;
    try {
      const workspace = await service.pullFilesToAcademic(reference, '31', req);
      await handlers.get('close')?.();
      await expect(fs.stat(workspace)).rejects.toThrow();
      expect(await fs.readdir(root)).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('registers generated report bytes under the current owner', async () => {
    const service = createService();
    service.getAcademic.mockResolvedValue({
      response: {
        status: 200,
        data: Buffer.from('Synthetic generated report'),
        headers: { 'content-type': 'text/plain', 'x-lens-report-name': encodeURIComponent('synthetic-report.txt') },
      },
    });
    const result = await service.registerAcademicReportPath(syntheticReport, 31, syntheticIdentity);
    expect(result).toEqual({ path: reference, name: 'synthetic-report.txt' });
    expect(service.attachmentService.storePrivateAttachment).toHaveBeenCalledWith(
      Buffer.from('Synthetic generated report'),
      { filename: 'synthetic-report.txt', contentType: 'text/plain' },
      31,
    );
  });

  it.each([
    '../synthetic-report.txt',
    '/gpt_log/31/synthetic-report.txt',
    'gpt_log/32/synthetic-report.txt',
    'gpt_log/31/../32/synthetic-report.txt',
    'https://example.invalid/synthetic-report.txt',
    'gpt_log/31/synthetic-report.pem',
  ])('refuses untrusted or foreign generated report paths', async reportPath => {
    const service = createService();
    await expect(service.registerAcademicReportPath(reportPath, 31, syntheticIdentity)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(service.getAcademic).not.toHaveBeenCalled();
    expect(service.attachmentService.storePrivateAttachment).not.toHaveBeenCalled();
  });

  it('does not expose generated report paths when registration fails', async () => {
    const service = createService();
    service.getAcademic.mockRejectedValue(new Error('synthetic upstream failure'));
    const state: any = {};
    service.captureAcademicReportFiles(
      JSON.stringify({
        fileVectorResult: [{ path: syntheticReport }],
      }),
      state,
      request(),
    );
    expect(await service.resolveAcademicReportFiles(state, request())).toBeNull();
    expect(service.attachmentService.storePrivateAttachment).not.toHaveBeenCalled();
  });

  it('deduplicates report registration and emits opaque owner references', async () => {
    const service = createService();
    service.getAcademic.mockResolvedValue({
      response: {
        status: 200,
        data: Buffer.from('Synthetic generated report'),
        headers: { 'x-lens-report-name': encodeURIComponent('synthetic-report.txt') },
      },
    });
    const state: any = {};
    const line = JSON.stringify({
      fileVectorResult: [{ path: syntheticReport }],
    });
    service.captureAcademicReportFiles(line, state, request());
    service.captureAcademicReportFiles(line, state, request());
    const output = JSON.parse(await service.resolveAcademicReportFiles(state, request()));
    expect(output).toEqual([{ path: reference, name: 'synthetic-report.txt' }]);
    expect(service.getAcademic).toHaveBeenCalledTimes(1);
    expect(service.attachmentService.storePrivateAttachment).toHaveBeenCalledTimes(1);
  });

  it('refuses a configured workspace symlink into a public root', async () => {
    const service = createService();
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'lens-synthetic-academic-'));
    const publicRoot = path.join(root, 'synthetic-public');
    const linkedRoot = path.join(root, 'synthetic-link');
    await fs.mkdir(publicRoot);
    await fs.symlink(publicRoot, linkedRoot);
    service.getAcademicTempRoot = () => linkedRoot;
    service.getAcademicSharedUploadRoot = () => publicRoot;
    try {
      await expect(service.pullFilesToAcademic(reference, '31', request())).rejects.toThrow();
      expect(await fs.readdir(publicRoot)).toEqual([]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it('does not publish a report whose owner metadata failed to persist', async () => {
    const service = createService();
    service.getAcademic.mockResolvedValue({
      response: {
        status: 200,
        data: Buffer.from('Synthetic generated report'),
        headers: { 'x-lens-report-name': encodeURIComponent('synthetic-report.txt') },
      },
    });
    service.attachmentService.storePrivateAttachment.mockRejectedValue(
      new Error('synthetic persistence failure'),
    );
    const state: any = {};
    const res = { write: jest.fn() } as unknown as Response;
    service.captureAcademicReportFiles(
      JSON.stringify({
        fileVectorResult: [{ path: syntheticReport }],
      }),
      state,
      request(),
    );
    await service.publishAcademicReportFiles(state, request(), res);
    expect(state.fileVectorResult).toBeNull();
    expect(res.write).not.toHaveBeenCalled();
  });
});
