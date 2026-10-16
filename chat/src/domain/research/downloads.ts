export interface AcademicDownloadFile {
  path: string
  name: string
}

export interface UserUploadedFile {
  url: string
  name: string
}

const parseMaybeJson = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed || !/^[\[{\"]/.test(trimmed)) return value
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

const unwrapSerializedValue = (value: unknown) => {
  let current = value
  for (let depth = 0; depth < 2; depth += 1) {
    const next = parseMaybeJson(current)
    if (next === current) break
    current = next
  }
  return current
}

export const getSafeFileName = (value: unknown) => {
  const raw = String(value || '')
    .replace(/[?#].*$/, '')
    .split(/[\\/]/)
    .pop()
  if (!raw) return 'academic_file'
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export const sanitizeDownloadName = (value: unknown) => {
  const normalized = String(value || '')
    .replace(/[\u0000-\u001f\u007f\\/:*?\"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized && normalized !== '.' && normalized !== '..' ? normalized : 'academic_file'
}

export const resolveAcademicDownloadPath = (value: unknown): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    const raw = value.trim()
    if (!raw) return ''
    let decoded = raw
    try {
      decoded = decodeURIComponent(raw)
    } catch {
      // 旧消息可能保存无法解码的原始路径；继续交给服务端安全边界校验。
    }
    if (/^[\[{]/.test(decoded)) {
      try {
        return resolveAcademicDownloadPath(JSON.parse(decoded))
      } catch {
        return decoded
      }
    }
    return decoded
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = resolveAcademicDownloadPath(item)
      if (candidate) return candidate
    }
    return ''
  }
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>
    for (const key of [
      'path',
      'file_path',
      'filePath',
      'file',
      'url',
      'download_path',
      'downloadPath',
    ]) {
      const candidate = resolveAcademicDownloadPath(source[key])
      if (candidate) return candidate
    }
    if (Array.isArray(source.files)) return resolveAcademicDownloadPath(source.files)
  }
  return ''
}

export const isLikelyAcademicDownloadPath = (value: unknown) => {
  const source = String(value || '').trim()
  if (/^attachment:/i.test(source)) {
    return /^attachment:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(source)
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(source) && !/^https?:\/\//i.test(source)) return false

  if (!source || /^[\[{]/.test(source) || /[{}[\]]/.test(source)) return false
  if (/^https?:\/\//i.test(source)) return true
  if (/^[_-]*files[_-]*/i.test(source)) return false
  if (/^[a-zA-Z]:[\\/]/.test(source) || source.startsWith('/')) return true
  if (
    /^(?:private_upload|gpt_log|downloadzone|public\/file|file\/dev\/userFiles|academic-4\.0)[\\/]/i.test(
      source
    )
  ) {
    return true
  }
  return /[\\/]/.test(source)
}

const isPrivateHostname = (hostname: string) =>
  hostname === 'localhost' ||
  hostname === '::1' ||
  hostname.endsWith('.local') ||
  /^127\./.test(hostname) ||
  /^10\./.test(hostname) ||
  /^192\.168\./.test(hostname) ||
  /^169\.254\./.test(hostname) ||
  /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)

/** 外部直链只允许公开 HTTP(S) 地址，避免结果内容诱导访问本机或内网资源。 */
export const normalizeExternalDownloadUrl = (value: unknown) => {
  const raw = String(value || '').trim()
  if (!/^https?:\/\//i.test(raw)) return ''
  try {
    const url = new URL(raw)
    if (url.username || url.password || isPrivateHostname(url.hostname.toLowerCase())) return ''
    return url.toString()
  } catch {
    return ''
  }
}

const getDownloadName = (value: unknown, pathValue: string) => {
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>
    const customName = String(source.name || source.file_name || source.fileName || '').trim()
    if (customName) return sanitizeDownloadName(customName)
  }
  return sanitizeDownloadName(getSafeFileName(pathValue))
}

const asFileList = (value: unknown) => {
  const parsed = unwrapSerializedValue(value)
  if (Array.isArray(parsed)) return parsed
  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).files)) {
    return (parsed as any).files as unknown[]
  }
  return parsed ? [parsed] : []
}

export const parseAcademicDownloadFiles = (value: unknown): AcademicDownloadFile[] => {
  const seen = new Set<string>()
  return asFileList(value).reduce<AcademicDownloadFile[]>((files, item) => {
    const pathValue = resolveAcademicDownloadPath(item)
    if (!pathValue || !isLikelyAcademicDownloadPath(pathValue) || seen.has(pathValue)) return files
    seen.add(pathValue)
    files.push({ path: pathValue, name: getDownloadName(item, pathValue) })
    return files
  }, [])
}

const expandUploadedFile = (value: unknown): UserUploadedFile[] => {
  if (!value) return []
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(url => url.trim())
      .filter(Boolean)
      .map(url => ({ url, name: sanitizeDownloadName(getSafeFileName(url)) }))
  }
  if (typeof value !== 'object') return []
  const source = value as Record<string, unknown>
  const url = String(source.url || source.path || source.file || '').trim()
  if (!url) return []
  return [
    {
      url,
      name: sanitizeDownloadName(
        source.name || source.file_name || source.fileName || getSafeFileName(url)
      ),
    },
  ]
}

export const parseUserUploadedFiles = (value: unknown): UserUploadedFile[] => {
  const seen = new Set<string>()
  return asFileList(value)
    .flatMap(expandUploadedFile)
    .filter(file => {
      if (seen.has(file.url)) return false
      seen.add(file.url)
      return true
    })
}
