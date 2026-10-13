import { buildAcademicAttachmentContext } from './academicAttachmentContext';

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => Promise<void> | void): void;
interface Assertion {
  toContain(value: unknown): void;
  toHaveLength(value: number): void;
  toBeLessThanOrEqual(value: number): void;
  not: Assertion;
}
declare function expect(value: unknown): Assertion;

describe('academic attachment context', () => {
  it('keeps readable source text within the bounded context', async () => {
    const marker = 'LENS-SYNTHETIC-ATTACHMENT-MARKER';
    const context = await buildAcademicAttachmentContext(
      [{ name: 'paper.txt' }],
      async () => ({
        fileName: 'paper.txt',
        extension: 'txt',
        buffer: Buffer.from(`title\u0000\n${marker}`),
      }),
      async source => source.buffer.toString('utf8'),
    );

    expect(context).toContain(`文档：paper.txt`);
    expect(context).toContain(marker);
    expect(context).not.toContain('\u0000');
  });

  it('limits the number of files and skips unreadable sources', async () => {
    const calls: unknown[] = [];
    const context = await buildAcademicAttachmentContext(
      [{ name: 'one.txt' }, { name: 'two.txt' }, { name: 'three.txt' }, { name: 'four.txt' }],
      async file => {
        calls.push(file);
        if (calls.length === 2) return null;
        return {
          fileName: String((file as { name?: string }).name || 'unknown.txt'),
          extension: 'txt',
          buffer: Buffer.from('content'),
        };
      },
      async source => source.buffer.toString('utf8'),
    );

    expect(calls).toHaveLength(3);
    expect(context).toContain('文档：one.txt');
    expect(context).toContain('文档：three.txt');
    expect(context).not.toContain('four.txt');
  });

  it('caps the combined context instead of forwarding unbounded document text', async () => {
    const context = await buildAcademicAttachmentContext(
      [{ name: 'large.txt' }],
      async () => ({
        fileName: 'large.txt',
        extension: 'txt',
        buffer: Buffer.from('x'.repeat(30000)),
      }),
      async source => source.buffer.toString('utf8'),
    );

    expect(context.length).toBeLessThanOrEqual(24000 + '文档：large.txt\n'.length);
  });
});
