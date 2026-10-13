export interface AcademicAttachmentContextItem {
  fileName: string;
  text: string;
}

export interface AcademicAttachmentContextSource {
  fileName: string;
  extension: string;
  buffer: Buffer;
}

const MAX_CONTEXT_CHARS = 24000;
const MAX_FILES = 3;

export async function buildAcademicAttachmentContext(
  files: readonly unknown[],
  readSource: (file: unknown) => Promise<AcademicAttachmentContextSource | null>,
  extractText: (source: AcademicAttachmentContextSource) => Promise<string>,
) {
  const blocks: AcademicAttachmentContextItem[] = [];
  let remainingChars = MAX_CONTEXT_CHARS;

  for (const file of files.slice(0, MAX_FILES)) {
    if (remainingChars <= 0) break;
    try {
      const source = await readSource(file);
      if (!source) continue;
      const text = String(await extractText(source) || '')
        .replace(/\u0000/g, '')
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim();
      if (!text) continue;

      const excerpt = text.slice(0, remainingChars);
      blocks.push({ fileName: source.fileName, text: excerpt });
      remainingChars -= excerpt.length;
    } catch (_error) {
      continue;
    }
  }

  return blocks.map(item => `文档：${item.fileName}\n${item.text}`).join('\n\n');
}
