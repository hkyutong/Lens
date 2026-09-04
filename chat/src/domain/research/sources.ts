export type AcademicSource = {
  title: string
  link: string
  media?: string
  [key: string]: unknown
}

const isPrivateHost = (hostname: string) =>
  hostname === 'localhost' ||
  hostname === '::1' ||
  hostname.endsWith('.local') ||
  /^127\./.test(hostname) ||
  /^10\./.test(hostname) ||
  /^192\.168\./.test(hostname) ||
  /^169\.254\./.test(hostname) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)

export const normalizeExternalSourceUrl = (value: unknown) => {
  const raw = String(value || '').trim()
  if (!/^https?:\/\//i.test(raw)) return ''
  try {
    const url = new URL(raw)
    if (url.username || url.password || isPrivateHost(url.hostname.toLowerCase())) return ''
    return url.toString()
  } catch (_error) {
    return ''
  }
}

export const parseAcademicSources = (value: unknown): AcademicSource[] => {
  if (!value) return []
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch (_error) {
      return []
    }
  }

  const rawList = Array.isArray(parsed)
    ? parsed
    : parsed && typeof parsed === 'object' && Array.isArray((parsed as any).searchResults)
      ? (parsed as any).searchResults
      : []

  return rawList
    .slice(0, 50)
    .map((item: any) => ({
      ...item,
      title: String(item?.title || '').trim(),
      link: normalizeExternalSourceUrl(item?.link),
    }))
    .filter((item: AcademicSource) => Boolean(item.title && item.link))
}
