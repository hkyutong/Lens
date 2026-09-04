export type ResearchStarterTaskDefinition = {
  id: string
  titleKey: string
  descriptionKey: string
  promptKey: string
  mode: 'core' | 'plugin' | 'chat'
  selectorGroups: string[][]
}

export type ResearchStarterLaneDefinition = {
  id: 'reading' | 'writing' | 'analysis'
  titleKey: string
  descriptionKey: string
  taskIds: string[]
}

export const RESEARCH_STARTER_TASKS: ResearchStarterTaskDefinition[] = [
  {
    id: 'paper-summary',
    titleKey: 'lens.workspace.starterPaperSummary',
    descriptionKey: 'lens.workspace.starterPaperSummaryDesc',
    promptKey: 'lens.workspace.starterPaperSummaryPrompt',
    mode: 'plugin',
    selectorGroups: [['论文速读'], ['pdf', '批量总结']],
  },
  {
    id: 'pdf-deep-read',
    titleKey: 'lens.workspace.starterPdfDeepRead',
    descriptionKey: 'lens.workspace.starterPdfDeepReadDesc',
    promptKey: 'lens.workspace.starterPdfDeepReadPrompt',
    mode: 'plugin',
    selectorGroups: [['pdf', '深度理解']],
  },
  {
    id: 'english-polish',
    titleKey: 'lens.workspace.starterEnglishPolish',
    descriptionKey: 'lens.workspace.starterEnglishPolishDesc',
    promptKey: 'lens.workspace.starterEnglishPolishPrompt',
    mode: 'core',
    selectorGroups: [['英文润色']],
  },
  {
    id: 'latex-translation',
    titleKey: 'lens.workspace.starterLatexTranslation',
    descriptionKey: 'lens.workspace.starterLatexTranslationDesc',
    promptKey: 'lens.workspace.starterLatexTranslationPrompt',
    mode: 'plugin',
    selectorGroups: [['latex', '精准翻译'], ['latex', '翻译']],
  },
  {
    id: 'code-explain',
    titleKey: 'lens.workspace.starterCodeExplain',
    descriptionKey: 'lens.workspace.starterCodeExplainDesc',
    promptKey: 'lens.workspace.starterCodeExplainPrompt',
    mode: 'core',
    selectorGroups: [['学术型代码解释'], ['代码解释']],
  },
  {
    id: 'arxiv-summary',
    titleKey: 'lens.workspace.starterArxivSummary',
    descriptionKey: 'lens.workspace.starterArxivSummaryDesc',
    promptKey: 'lens.workspace.starterArxivSummaryPrompt',
    mode: 'plugin',
    selectorGroups: [['arxiv', '摘要'], ['arxiv', '英文摘要']],
  },
  {
    id: 'literature-review',
    titleKey: 'lens.workspace.starterLiteratureReview',
    descriptionKey: 'lens.workspace.starterLiteratureReviewDesc',
    promptKey: 'lens.workspace.starterLiteratureReviewPrompt',
    mode: 'chat',
    selectorGroups: [],
  },
  {
    id: 'multi-paper-compare',
    titleKey: 'lens.workspace.starterMultiPaperCompare',
    descriptionKey: 'lens.workspace.starterMultiPaperCompareDesc',
    promptKey: 'lens.workspace.starterMultiPaperComparePrompt',
    mode: 'chat',
    selectorGroups: [],
  },
  {
    id: 'research-notes',
    titleKey: 'lens.workspace.starterResearchNotes',
    descriptionKey: 'lens.workspace.starterResearchNotesDesc',
    promptKey: 'lens.workspace.starterResearchNotesPrompt',
    mode: 'chat',
    selectorGroups: [],
  },
  {
    id: 'teaching-material',
    titleKey: 'lens.workspace.starterTeachingMaterial',
    descriptionKey: 'lens.workspace.starterTeachingMaterialDesc',
    promptKey: 'lens.workspace.starterTeachingMaterialPrompt',
    mode: 'chat',
    selectorGroups: [],
  },
]

export const HOME_FEATURED_RESEARCH_TASK_IDS = [
  'paper-summary',
  'pdf-deep-read',
  'arxiv-summary',
  'multi-paper-compare',
  'literature-review',
  'english-polish',
  'latex-translation',
  'code-explain',
  'research-notes',
  'teaching-material',
] as const

export const RESEARCH_STARTER_LANES: ResearchStarterLaneDefinition[] = [
  {
    id: 'reading',
    titleKey: 'lens.workspace.readingTitle',
    descriptionKey: 'lens.workspace.readingDesc',
    taskIds: [
      'paper-summary',
      'pdf-deep-read',
      'multi-paper-compare',
      'arxiv-summary',
      'literature-review',
    ],
  },
  {
    id: 'writing',
    titleKey: 'lens.workspace.writingTitle',
    descriptionKey: 'lens.workspace.writingDesc',
    taskIds: ['english-polish', 'latex-translation', 'teaching-material'],
  },
  {
    id: 'analysis',
    titleKey: 'lens.workspace.analysisTitle',
    descriptionKey: 'lens.workspace.analysisDesc',
    taskIds: ['code-explain', 'research-notes'],
  },
]
