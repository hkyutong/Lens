export interface ResearchFile {
  name: string
  url: string
  type?: 'document' | 'image' | string
}

const displayName = (value: unknown) => {
  const name = String(value || '').trim()
  if (!name) return ''
  return name.split(/[\\/]/).filter(Boolean).pop() || name
}

/** 将会话中的文件字段转成安全、稳定的展示结构。 */
export function parseResearchFiles(value: unknown): ResearchFile[] {
  if (!value) return []

  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch {
      return []
    }
  }

  if (!Array.isArray(parsed)) return []
  return parsed.reduce<ResearchFile[]>((files, item) => {
    if (!item || typeof item !== 'object') return files
    const source = item as Record<string, unknown>
    const name = displayName(source.name || source.fileName || source.filename)
    const url = String(source.url || source.fileUrl || '').trim()
    if (!name || !url) return files
    files.push({
      name,
      url,
      type: typeof source.type === 'string' ? source.type : 'document',
    })
    return files
  }, [])
}
