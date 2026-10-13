export const ACADEMIC_HOME_CORE_ORDER = [
  '英文润色',
  '中文润色',
  '参考文献转Bib',
  '参考文献转BibTeX',
  '中英互译',
  '学术型代码解释',
  '绘制脑图',
]

export const ACADEMIC_HOME_PLUGIN_ORDER = [
  'PDF 深度理解',
  'PDF 批量总结',
  'Word 批量总结',
  '论文速读',
  'Arxiv摘要',
]

export const ACADEMIC_RESEARCH_SHORTCUTS = [
  {
    pluginName: 'Lens｜整理研究笔记',
    labelKey: 'lens.workspace.starterResearchNotes',
    descriptionKey: 'lens.workspace.starterResearchNotesDesc',
    icon: 'ri:sticky-note-line',
  },
  {
    pluginName: 'Lens｜比较多篇论文',
    labelKey: 'lens.workspace.starterMultiPaperCompare',
    descriptionKey: 'lens.workspace.starterMultiPaperCompareDesc',
    icon: 'ri:git-compare-line',
  },
  {
    pluginName: 'Lens｜生成教学材料',
    labelKey: 'lens.workspace.starterTeachingMaterial',
    descriptionKey: 'lens.workspace.starterTeachingMaterialDesc',
    icon: 'ri:presentation-line',
  },
  {
    pluginName: 'Lens｜研究问题拆解',
    labelKey: 'lens.workspace.starterQuestionBreakdown',
    descriptionKey: 'lens.workspace.starterQuestionBreakdownDesc',
    icon: 'ri:edit-line',
  },
  {
    pluginName: 'Lens｜文献综述工作台',
    labelKey: 'lens.workspace.starterLiteratureReview',
    descriptionKey: 'lens.workspace.starterLiteratureReviewDesc',
    icon: 'ri:book-open-line',
  },
  {
    pluginName: 'Lens｜研究方案设计',
    labelKey: 'lens.workspace.starterResearchPlan',
    descriptionKey: 'lens.workspace.starterResearchPlanDesc',
    icon: 'ri:presentation-line',
  },
] as const

export const ACADEMIC_FEATURED_SHORTCUTS = [
  { pluginName: 'Lens｜研究设计体检', labelKey: 'lens.workspace.featureDesignReview', descriptionKey: 'lens.workspace.featureDesignReviewDesc' },
  { pluginName: 'Lens｜审稿意见应答', labelKey: 'lens.workspace.featureReviewerReply', descriptionKey: 'lens.workspace.featureReviewerReplyDesc' },
  { pluginName: 'Lens｜文献检索策略', labelKey: 'lens.workspace.featureSearchStrategy', descriptionKey: 'lens.workspace.featureSearchStrategyDesc' },
] as const

export const ACADEMIC_FEATURED_PLUGIN_NAMES = [
  ...ACADEMIC_FEATURED_SHORTCUTS.map(item => item.pluginName),
  ...ACADEMIC_RESEARCH_SHORTCUTS.map(item => item.pluginName),
] as const

export const normalizeAcademicCapabilityName = (value: unknown) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .replace(/[｜|:：]/g, '')
    .replace(/latex/gi, 'latex')
    .toLowerCase()

export const isAcademicFeaturedPlugin = (value: unknown) => {
  const candidates =
    typeof value === 'object' && value !== null
      ? [
          (value as { name?: string }).name,
          (value as { displayName?: string }).displayName,
          (value as { originName?: string }).originName,
        ]
      : [value]
  const normalized = candidates
    .map(normalizeAcademicCapabilityName)
    .filter(Boolean)
  return ACADEMIC_FEATURED_PLUGIN_NAMES.some(name =>
    normalized.includes(normalizeAcademicCapabilityName(name)),
  )
}

export const getAcademicCapabilityName = (entity: {
  name?: string
  displayName?: string
  originName?: string
}) => String(entity.displayName || entity.name || entity.originName || '').trim()

export const sortByAcademicCapabilityOrder = <
  T extends { name?: string; displayName?: string; originName?: string },
>(
  items: T[],
  order: readonly string[],
) => {
  const orderMap = new Map(
    order.map((name, index) => [normalizeAcademicCapabilityName(name), index]),
  )
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const rankA =
        orderMap.get(normalizeAcademicCapabilityName(getAcademicCapabilityName(a.item))) ?? 9999
      const rankB =
        orderMap.get(normalizeAcademicCapabilityName(getAcademicCapabilityName(b.item))) ?? 9999
      return rankA - rankB || a.index - b.index
    })
    .map(({ item }) => item)
}
