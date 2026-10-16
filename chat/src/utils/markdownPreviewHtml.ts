import DOMPurify from 'dompurify'

export function sanitizeMarkdownPreviewHtml(html: string): string {
  return DOMPurify.sanitize(html)
}
