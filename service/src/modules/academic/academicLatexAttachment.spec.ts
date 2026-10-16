import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { AcademicService } from './academic.service';

declare const describe: any;
declare const beforeEach: any;
declare const it: any;
declare const expect: any;
declare const jest: any;

const syntheticTex = String.raw`\documentclass{article}
\usepackage{syntheticpackage}
\begin{document}
\title{Synthetic Prism Reading Study}
\maketitle
\section{Methods}
\textbf{24 simulated participants} followed for \emph{21 days}.
Verification marker: SYNTHETIC\_TEX\_PRISM\_683.
Success rate: 50\% compared with 40\%.
% A synthetic comment that is not document content.
\end{document}`;

describe('academic TeX text extraction', () => {
  let service: any;

  beforeEach(() => {
    service = Object.create(AcademicService.prototype);
    service.logger = { warn: jest.fn(), error: jest.fn() };
    service.academicTextContextExtensions = new Set(['txt']);
  });

  it('retains titles, headings and formatted facts without preamble metadata', () => {
    const text = service.extractLatexPlainText(syntheticTex);
    expect(text).toContain('Synthetic Prism Reading Study');
    expect(text).toContain('Methods');
    expect(text).toContain('24 simulated participants');
    expect(text).toContain('21 days');
    expect(text).not.toContain('syntheticpackage');
    expect(text).not.toContain('documentclass');
    expect(text).not.toContain('synthetic comment');
  });

  it('retains nested formatting and starred headings in one pass', () => {
    const text = service.extractLatexPlainText(
      String.raw`\title{Synthetic \textbf{Prism} Study}
\section*{Synthetic \emph{Methods}}`,
    );
    expect(text).toContain('Synthetic Prism Study');
    expect(text).toContain('Synthetic Methods');
    expect(text).not.toContain('\\');
    expect(text).not.toContain('*');
  });

  it('preserves escaped measurements and markers while removing real comments', () => {
    const text = service.extractLatexPlainText(syntheticTex);
    expect(text).toContain('50% compared with 40%.');
    expect(text).toContain('SYNTHETIC_TEX_PRISM_683');
    expect(text).not.toContain('synthetic comment');
  });

  it('handles empty and plain historical inputs', () => {
    expect(service.extractLatexPlainText('')).toBe('');
    expect(service.extractLatexPlainText('Synthetic plain study.\r\n24 participants.'))
      .toBe('Synthetic plain study.\n24 participants.');
  });

  it('preserves TeX facts in the production attachment context', async () => {
    service.readAcademicAttachment = jest.fn(async () => ({
      buffer: Buffer.from(syntheticTex),
      fileName: 'synthetic.tex',
    }));
    const context = await service.buildAcademicAttachmentContext(
      JSON.stringify([{ name: 'synthetic.tex', url: '/uploads/synthetic.tex' }]),
    );
    expect(context).toContain('Synthetic Prism Reading Study');
    expect(context).toContain('24 simulated participants');
    expect(context).toContain('SYNTHETIC_TEX_PRISM_683');
  });

  it('keeps TXT content unmodified by TeX command extraction', async () => {
    const text = String.raw`Synthetic TXT: \title{literal text} and 50\%.`;
    service.readAcademicAttachment = jest.fn(async () => ({
      buffer: Buffer.from(text),
      fileName: 'synthetic.txt',
    }));
    const context = await service.buildAcademicAttachmentContext(
      JSON.stringify([{ name: 'synthetic.txt', url: '/uploads/synthetic.txt' }]),
    );
    expect(context).toContain(text);
  });

  it('preserves the title in the other production caller, the local fallback summary', async () => {
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'lens-synthetic-tex-'));
    const file = path.join(directory, 'synthetic.tex');
    try {
      await fs.writeFile(file, syntheticTex);
      service.attachmentService = { readOwnedAttachment: jest.fn(async (_ref: string, ownerId: number) => {
        if (ownerId !== 31) throw new Error('synthetic owner mismatch');
        return { buffer: await fs.readFile(file), filename: path.basename(file), contentType: 'application/x-tex' };
      }) };
      const summary = await service.buildLatexFallbackSummary(JSON.stringify([{ url: 'attachment:00000000-0000-4000-8000-000000000001' }]), { user: { id: 31 } }
      );
      expect(summary).toContain('Synthetic Prism Reading Study');
      expect(summary).toContain('24 simulated participants');
    } finally {
      await fs.rm(directory, { recursive: true, force: true });
    }
  });
});
