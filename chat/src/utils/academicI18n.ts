import { t } from '@/locales'

type AcademicEntity = {
  name?: string
  displayName?: string
  originName?: string
  description?: string
  info?: string
}

const normalizeAcademicEntityName = (value: unknown) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/latex/gi, 'latex')
    .toLowerCase()

const academicEntityKeyMap: Record<string, string> = {
  [normalizeAcademicEntityName('中文润色')]: 'lens.academicEntities.core.chinesePolish',
  [normalizeAcademicEntityName('英文润色')]: 'lens.academicEntities.core.englishPolish',
  [normalizeAcademicEntityName('绘制脑图')]: 'lens.academicEntities.core.mindMap',
  [normalizeAcademicEntityName('中英互译')]: 'lens.academicEntities.core.translation',
  [normalizeAcademicEntityName('参考文献转Bib')]: 'lens.academicEntities.core.bibtex',
  [normalizeAcademicEntityName('参考文献转BibTeX')]: 'lens.academicEntities.core.bibtex',
  [normalizeAcademicEntityName('学术型代码解释')]: 'lens.academicEntities.core.codeExplain',

  [normalizeAcademicEntityName('论文速读')]: 'lens.academicEntities.tool.paperSummary',
  [normalizeAcademicEntityName('PDF 批量总结')]: 'lens.academicEntities.tool.pdfBatchSummary',
  [normalizeAcademicEntityName('PDF批量总结')]: 'lens.academicEntities.tool.pdfBatchSummary',
  [normalizeAcademicEntityName('PDF 深度理解')]: 'lens.academicEntities.tool.pdfDeepRead',
  [normalizeAcademicEntityName('PDF深度理解')]: 'lens.academicEntities.tool.pdfDeepRead',
  [normalizeAcademicEntityName('Word 批量总结')]: 'lens.academicEntities.tool.wordBatchSummary',
  [normalizeAcademicEntityName('Word批量总结')]: 'lens.academicEntities.tool.wordBatchSummary',
  [normalizeAcademicEntityName('Arxiv摘要')]: 'lens.academicEntities.tool.arxivSummary',
  [normalizeAcademicEntityName('Arxiv论文下载')]: 'lens.academicEntities.tool.arxivSummary',
  [normalizeAcademicEntityName('一键下载arxiv论文并翻译摘要（先在input输入编号，如1812.10695）')]:
    'lens.academicEntities.tool.arxivSummary',
  [normalizeAcademicEntityName('Arxiv 英文摘要')]:
    'lens.academicEntities.tool.arxivEnglishSummary',
  [normalizeAcademicEntityName('Arxiv英文摘要')]:
    'lens.academicEntities.tool.arxivEnglishSummary',
  [normalizeAcademicEntityName('Arxiv精准翻译')]:
    'lens.academicEntities.tool.arxivEnglishSummary',
  [normalizeAcademicEntityName('Arxiv精准翻译（输入arxivID）')]:
    'lens.academicEntities.tool.arxivEnglishSummary',
  [normalizeAcademicEntityName('LaTeX 摘要')]: 'lens.academicEntities.tool.latexSummary',
  [normalizeAcademicEntityName('LaTeX摘要')]: 'lens.academicEntities.tool.latexSummary',
  [normalizeAcademicEntityName('LaTeX 精准翻译')]:
    'lens.academicEntities.tool.latexPreciseTranslation',
  [normalizeAcademicEntityName('LaTeX精准翻译')]:
    'lens.academicEntities.tool.latexPreciseTranslation',
  [normalizeAcademicEntityName('LaTeX 英文润色')]:
    'lens.academicEntities.tool.latexEnglishPolish',
  [normalizeAcademicEntityName('LaTeX英文润色')]:
    'lens.academicEntities.tool.latexEnglishPolish',
  [normalizeAcademicEntityName('LaTeX 中文润色')]:
    'lens.academicEntities.tool.latexChinesePolish',
  [normalizeAcademicEntityName('LaTeX中文润色')]:
    'lens.academicEntities.tool.latexChinesePolish',
  [normalizeAcademicEntityName('LaTeX 高亮纠错')]:
    'lens.academicEntities.tool.latexProofreading',
  [normalizeAcademicEntityName('LaTeX高亮纠错')]:
    'lens.academicEntities.tool.latexProofreading',
}

const resolveAcademicEntityKey = (entity: AcademicEntity | null | undefined) => {
  const candidates = [entity?.displayName, entity?.name, entity?.originName]
    .map(normalizeAcademicEntityName)
    .filter(Boolean)

  for (const candidate of candidates) {
    const matchedKey = academicEntityKeyMap[candidate]
    if (matchedKey) return matchedKey
  }

  return ''
}

const translateAcademicField = (
  key: string,
  field: 'label' | 'description',
  fallback: string
) => {
  if (!key) return fallback
  const translationKey = `${key}.${field}`
  const translated = t(translationKey)
  return translated === translationKey ? fallback : translated
}

export const getAcademicEntityRawLabel = (entity: AcademicEntity | null | undefined) =>
  String(entity?.displayName || entity?.name || entity?.originName || '').trim()

export const getAcademicEntitySelectorValue = (entity: AcademicEntity | null | undefined) =>
  String(entity?.name || entity?.originName || entity?.displayName || '').trim()

export const getAcademicEntityDisplayLabel = (entity: AcademicEntity | null | undefined) => {
  const fallback = getAcademicEntityRawLabel(entity)
  const key = resolveAcademicEntityKey(entity)
  return translateAcademicField(key, 'label', fallback)
}

export const getAcademicEntityDisplayDescription = (
  entity: AcademicEntity | null | undefined
) => {
  const fallback = String(entity?.info || entity?.description || '').trim()
  const key = resolveAcademicEntityKey(entity)
  return translateAcademicField(key, 'description', fallback)
}
