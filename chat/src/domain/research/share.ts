const dangerousElementPattern =
  /<\s*(?:script|iframe|object|embed|form|base|meta|link|style|textarea|select|option)\b[^>]*>[\s\S]*?<\s*\/\s*(?:script|iframe|object|embed|form|base|meta|link|style|textarea|select|option)\s*>/gi
const dangerousSelfClosingElementPattern =
  /<\s*\/?\s*(?:script|iframe|object|embed|form|base|meta|link|style|textarea|select|option)\b[^>]*>/gi
const eventAttributePattern = /\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi
const unsafeUrlAttributePattern =
  /\s+(?:href|src|action|formaction|poster)\s*=\s*(['"])\s*(?:javascript|vbscript|data:text\/html):[\s\S]*?\1/gi
const styleAttributePattern = /\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi
const shareCodePattern = /^[A-Za-z0-9]{8}$/

export function parseShareCode(value: unknown) {
  const normalized = String(value || '').trim()
  return shareCodePattern.test(normalized) ? normalized : ''
}

export function normalizeShareResultUrl(value: unknown, baseUrl: string) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  try {
    const url = new URL(raw, baseUrl)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return ''
    const shareCodes = url.searchParams.getAll('shareCode')
    if (shareCodes.length !== 1 || !parseShareCode(shareCodes[0])) return ''
    if ([...url.searchParams.keys()].some(key => key !== 'shareCode')) return ''
    return url.toString()
  } catch {
    return ''
  }
}

export function isAllowedShareUrl(attribute: string, value: string) {
  const normalized = String(value || '').trim()
  if (!normalized) return false
  if (/^(?:https?:\/\/|\/|\.\.\/|\.\/|#|\?)/i.test(normalized)) return true
  if (attribute === 'href' && /^mailto:/i.test(normalized)) return true
  return attribute === 'src' && /^data:image\//i.test(normalized)
}

function sanitizeShareFragmentFallback(raw: string) {
  return raw
    .replace(dangerousElementPattern, '')
    .replace(dangerousSelfClosingElementPattern, '')
    .replace(eventAttributePattern, '')
    .replace(styleAttributePattern, '')
    .replace(unsafeUrlAttributePattern, '')
}

export function sanitizeShareFragment(content: string) {
  const raw = String(content || '')
  if (!raw.trim()) return ''
  if (typeof DOMParser === 'undefined') return sanitizeShareFragmentFallback(raw)

  const parsed = new DOMParser().parseFromString(
    `<div id="lens-share-fragment">${raw}</div>`,
    'text/html'
  )
  const root = parsed.getElementById('lens-share-fragment')
  if (!root) return ''

  root
    .querySelectorAll(
      'script, iframe, object, embed, form, base, meta, link, style, textarea, select, option'
    )
    .forEach(node => node.remove())
  root.querySelectorAll<HTMLElement>('*').forEach(element => {
    Array.from(element.attributes).forEach(attribute => {
      const name = attribute.name.toLowerCase()
      const value = attribute.value.trim()
      if (name.startsWith('on') || name === 'style') {
        element.removeAttribute(attribute.name)
        return
      }
      if (
        ['href', 'src', 'action', 'formaction', 'poster'].includes(name) &&
        !isAllowedShareUrl(name, value)
      ) {
        element.removeAttribute(attribute.name)
      }
    })
  })
  return root.innerHTML
}

export function createShareDocument(content: string) {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Lens Research Share · YutoAI</title>
    <style>
      :root { color-scheme: light dark; }
      body { margin: 0; padding: 2rem; color: #1f2937; background: #fff; font: 16px/1.75 system-ui, -apple-system, sans-serif; }
      article { max-width: 860px; margin: 0 auto; }
      @media (prefers-color-scheme: dark) { body { color: #e5e7eb; background: #111827; } }
    </style>
  </head>
  <body><article>${content}</article></body>
</html>`
}
