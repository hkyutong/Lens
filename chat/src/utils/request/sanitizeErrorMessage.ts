const TIMEOUT_PATTERNS = [
  /read timed out/i,
  /request timeout/i,
  /connect timeout/i,
  /timeout of \d+ms exceeded/i,
  /timed out/i,
];

const INTERNAL_DETAIL_PATTERNS = [
  /network error/i,
  /http(?:s)?connectionpool/i,
  /max retries exceeded/i,
  /proxy(?:error| settings?)?/i,
  /unable to connect to proxy/i,
  /socket hang up/i,
  /connection aborted/i,
  /remote end closed connection without response/i,
  /econn(?:refused|reset)/i,
  /enotfound/i,
  /getaddrinfo/i,
  /traceback/i,
  /stack trace/i,
  /internal server error/i,
  /exception:/i,
  /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0)\b/i,
  /\b\d{1,3}(?:\.\d{1,3}){3}(?::\d{2,5})?\b/,
  /https?:\/\//i,
  /\/v\d+\/(?:chat|responses|completions)/i,
  /\bapi[_ -]?key\b/i,
  /\bauthorization\b/i,
  /\bbearer\s+[a-z0-9._-]+\b/i,
];

const fallbackByStatus = (statusCode: number, fallback: string) => {
  if (statusCode === 401) return '登录状态已失效，请重新登录后重试'
  if (statusCode === 403) return '当前请求无权限访问'
  if (statusCode === 404) return '请求的资源不存在或已失效'
  if (statusCode === 429) return '请求过于频繁，请稍后重试'
  if (statusCode >= 500) return '服务暂时不可用，请稍后重试'
  return fallback || '请求失败，请稍后重试'
}

const containsSensitiveDetail = (message: string) =>
  INTERNAL_DETAIL_PATTERNS.some(pattern => pattern.test(message))

const isTimeoutMessage = (message: string) => TIMEOUT_PATTERNS.some(pattern => pattern.test(message))

export function sanitizeUserFacingErrorMessage(
  rawMessage: string,
  statusCode = 0,
  fallback = '请求失败，请稍后重试'
) {
  const message = String(rawMessage || '').trim()
  if (!message) return fallbackByStatus(statusCode, fallback)

  if (/积分不足|选购套餐|升级套餐/i.test(message)) return message
  if (/历史(?:用户消息|回复).*(不存在|已失效)/.test(message)) {
    return '当前会话状态已更新，请刷新页面后重试'
  }

  if (statusCode === 401) return '登录状态已失效，请重新登录后重试'

  if (isTimeoutMessage(message)) {
    return '服务响应超时，请稍后重试'
  }

  if (statusCode >= 500 || containsSensitiveDetail(message)) {
    return fallbackByStatus(statusCode || 502, fallback)
  }

  return message
}
