import * as fs from 'fs';
import * as path from 'path';
import { AcademicService } from './academic.service';

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => Promise<void> | void): void;
declare function expect(value: unknown): {
  toContain(expected: string): void;
  toBe(expected: unknown): void;
};

describe('academic PDF attachment parsing', () => {
  const fixture = path.resolve(__dirname, '../../..', 'test-fixtures/academic-synthetic-study.pdf');

  function reader(buffer: Buffer, extension = 'pdf') {
    const service = Reflect.construct(AcademicService, []) as any;
    service.readAcademicAttachment = async () => ({
      buffer,
      fileName: `synthetic-study.${extension}`,
      extension,
    });
    return service;
  }

  for (const extension of ['docx', 'txt', 'tex']) {
    it(`extracts the same source facts from a synthetic ${extension} attachment`, async () => {
      const file = path.resolve(__dirname, '../../..', 'test-fixtures', `academic-synthetic-study.${extension}`);
      const buffer = fs.readFileSync(file);
      const original = Buffer.from(buffer);

      const context = await reader(buffer, extension).buildAcademicAttachmentContext('synthetic-source', {});

      expect(context).toContain('CEDAR-STUDY');
      expect(context).toContain('24 plants');
      expect(context).toContain('has not started');
      expect(buffer.equals(original)).toBe(true);
    });
  }

  it('extracts the actual PDF evidence through the production attachment path', async () => {
    const buffer = fs.readFileSync(fixture);
    const original = Buffer.from(buffer);
    const context = await reader(buffer).buildAcademicAttachmentContext('file/synthetic-study.pdf', {});
    expect(context).toContain('CEDAR-STUDY');
    expect(context).toContain('24 plants');
    expect(context).toContain('has not started');
    expect(buffer.equals(original)).toBe(true);
  });

  it('skips an unreadable PDF without forwarding document bytes or parse errors', async () => {
    const context = await reader(Buffer.from('synthetic invalid PDF')).buildAcademicAttachmentContext(
      'file/synthetic-study.pdf',
      {},
    );
    expect(context).toBe('');
  });
});
