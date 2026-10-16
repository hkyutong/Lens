type UploadErrorKey =
  | 'uploadErrors.notIncluded'
  | 'uploadErrors.limitReached'
  | 'uploadErrors.fileTooLarge'
  | 'uploadErrors.sizeLimit'
  | 'uploadErrors.temporarilyUnavailable'

type UploadErrorTranslation = {
  key: UploadErrorKey
  values?: Record<string, string>
}

type TranslateUploadError = (key: string, values?: Record<string, string>) => string

// Only these existing public upload responses may change their display language.
const exactUploadErrors = new Map<string, UploadErrorTranslation>([
  ['已达到文件上传次数上限，请稍后再试', { key: 'uploadErrors.limitReached' }],
  ['文件超过允许的上传大小', { key: 'uploadErrors.fileTooLarge' }],
  ['当前套餐暂不支持上传文件', { key: 'uploadErrors.notIncluded' }],
  ['文件上传未完成，请稍后再试', { key: 'uploadErrors.temporarilyUnavailable' }],
])
const sizeLimitPattern = new RegExp('^文件大小超过限制\\(([0-9]+(?:\\.[0-9]+)?)\\)$')

function resolveUploadError(message: unknown): UploadErrorTranslation | null {
  if (typeof message !== 'string' || message.length > 512)
    return null

  const exact = exactUploadErrors.get(message)
  if (exact)
    return exact

  const sizeMatch = sizeLimitPattern.exec(message)
  if (!sizeMatch)
    return null

  const size = Number(sizeMatch[1])
  if (!Number.isFinite(size) || size <= 0)
    return null

  return { key: 'uploadErrors.sizeLimit', values: { size: sizeMatch[1] } }
}

export function localizeUploadErrorMessage<T>(
  message: T,
  translate: TranslateUploadError,
): T | string {
  const match = resolveUploadError(message)
  if (!match)
    return message

  try {
    const translated = translate(match.key, match.values)
    return typeof translated === 'string' && translated && translated !== match.key
      ? translated
      : message
  }
  catch {
    return message
  }
}
