export type AcademicPlanTier = 'free' | 'plus' | 'pro' | 'max'

export const normalizeAcademicAccessName = (value: any) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toLowerCase()

const extractAcademicLabel = (item: any) =>
  String(item?.displayName || item?.name || item?.label || item || '').trim()

export const resolveAcademicPlanTier = (balance: any): AcademicPlanTier => {
  const expirationTime = String(balance?.expirationTime || '').trim()
  const expiration = expirationTime ? new Date(`${expirationTime}T23:59:59`) : null
  const hasActiveMember =
    Number(balance?.packageId || 0) > 0 &&
    (!expirationTime || (expiration instanceof Date && expiration.getTime() > Date.now()))

  if (!hasActiveMember) return 'free'

  const weight = Number(balance?.packageWeight || 0)
  if (weight >= 30) return 'max'
  if (weight >= 20) return 'pro'
  if (weight >= 10) return 'plus'

  const packageName = normalizeAcademicAccessName(balance?.packageName)
  if (packageName.includes('max')) return 'max'
  if (packageName.includes('pro')) return 'pro'
  if (packageName.includes('plus')) return 'plus'

  return 'plus'
}

export const getAcademicWorkflowStepLimit = (balance: any) => {
  const tier = resolveAcademicPlanTier(balance)
  if (tier === 'max') return 3
  if (tier === 'pro') return 2
  return 0
}

export const canUseAcademicCore = (core: any, balance: any) => {
  const tier = resolveAcademicPlanTier(balance)
  const label = normalizeAcademicAccessName(extractAcademicLabel(core))
  if (!label) return false
  if (tier === 'max' || tier === 'pro') return true

  return [
    '中文润色',
    '英文润色',
    '绘制脑图',
    '中英互译',
    '参考文献转bib',
    '学术型代码解释',
    '代码解释',
  ].some(name => label.includes(normalizeAcademicAccessName(name)))
}

export const canUseAcademicPlugin = (plugin: any, balance: any) => {
  const tier = resolveAcademicPlanTier(balance)
  const label = normalizeAcademicAccessName(extractAcademicLabel(plugin))
  if (!label) return false
  if (tier === 'max') return true

  const plusAllowed =
    label.includes(normalizeAcademicAccessName('论文速读')) ||
    (label.includes('arxiv') &&
      (label.includes(normalizeAcademicAccessName('摘要')) ||
        label.includes(normalizeAcademicAccessName('下载')) ||
        label.includes(normalizeAcademicAccessName('翻译'))))

  if (plusAllowed) return true
  if (tier !== 'pro') return false

  return [
    'pdf批量总结',
    'pdf深度理解',
    'word批量总结',
    'latex摘要',
    'latex精准翻译',
    'latex英文润色',
    'latex中文润色',
    'latex高亮纠错',
  ].some(name => label.includes(normalizeAcademicAccessName(name)))
}
