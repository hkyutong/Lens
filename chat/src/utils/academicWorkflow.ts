import { t } from '@/locales'
import { getAcademicEntityDisplayLabel } from '@/utils/academicI18n'

export const normalizeAcademicWorkflowText = (value: any) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')

const getSelectorText = (item: any) =>
  `${item?.displayName || ''} ${item?.name || ''} ${item?.originName || ''}`

export const findAcademicWorkflowSelector = (list: any[], selectorGroups: string[][]) => {
  for (const selectors of selectorGroups) {
    const matched = list.find(item => {
      const haystack = normalizeAcademicWorkflowText(getSelectorText(item))
      return selectors.every(selector =>
        haystack.includes(normalizeAcademicWorkflowText(selector))
      )
    })
    if (matched) return matched
  }
  return undefined
}

export const buildAcademicWorkflowTemplates = (): Chat.AcademicWorkflowTemplate[] => [
  {
    id: 'paper-polish-mindmap',
    title: t('lens.workflow.templates.paperPolishMindMap'),
    prompt: t('lens.workflow.templates.paperPolishMindMapPrompt'),
    steps: [
      { kind: 'plugin', name: '论文速读', displayName: t('lens.academicEntities.tool.paperSummary.label') },
      { kind: 'core', name: '中文润色', displayName: t('lens.academicEntities.core.chinesePolish.label') },
      { kind: 'core', name: '绘制脑图', displayName: t('lens.academicEntities.core.mindMap.label') },
    ],
  },
  {
    id: 'pdf-english-polish',
    title: t('lens.workflow.templates.pdfEnglishPolish'),
    prompt: t('lens.workflow.templates.pdfEnglishPolishPrompt'),
    steps: [
      { kind: 'plugin', name: 'PDF 深度理解', displayName: t('lens.academicEntities.tool.pdfDeepRead.label') },
      { kind: 'core', name: '英文润色', displayName: t('lens.academicEntities.core.englishPolish.label') },
    ],
  },
  {
    id: 'arxiv-chinese-polish',
    title: t('lens.workflow.templates.arxivChinesePolish'),
    prompt: t('lens.workflow.templates.arxivChinesePolishPrompt'),
    steps: [
      { kind: 'plugin', name: 'Arxiv摘要', displayName: t('lens.academicEntities.tool.arxivSummary.label') },
      { kind: 'core', name: '中文润色', displayName: t('lens.academicEntities.core.chinesePolish.label') },
    ],
  },
  {
    id: 'code-polish',
    title: t('lens.workflow.templates.codePolish'),
    prompt: t('lens.workflow.templates.codePolishPrompt'),
    steps: [
      { kind: 'core', name: '学术型代码解释', displayName: t('lens.academicEntities.core.codeExplain.label') },
      { kind: 'core', name: '中文润色', displayName: t('lens.academicEntities.core.chinesePolish.label') },
    ],
  },
]

export const getAcademicWorkflowChainLabel = (steps: Chat.AcademicWorkflowStep[]) => {
  const labels = (Array.isArray(steps) ? steps : [])
    .map(step => getAcademicEntityDisplayLabel(step as any) || step?.displayName || step?.name || '')
    .filter(Boolean)
  return labels.join(' → ')
}
