import type { Mermaid, RenderResult } from 'mermaid'

/** Group a rejected mindmap forest without changing its labels or relative hierarchy. */
export function groupMindmapRoots(source: string): string | null {
  const lines = source.trim().replace(/\r\n?/g, '\n').split('\n')
  if (lines[0]?.trim() !== 'mindmap')
    return null

  const nodes = lines.slice(1).filter(line => {
    const text = line.trim()
    return text && !text.startsWith('%%') && !text.startsWith(':::') && !text.startsWith('::icon')
  })
  if (nodes.length < 2)
    return null

  const expanded = lines.slice(1).map(line => line.replace(/\t/g, '    '))
  const indentation = nodes.map(line => line.replace(/\t/g, '    ').match(/^ */)![0].length)
  const minimum = Math.min(...indentation)
  if (indentation.filter(value => value === minimum).length < 2)
    return null

  const children = expanded.map(line => {
    if (!line.trim())
      return line
    const leading = line.match(/^ */)![0].length
    return `    ${line.slice(Math.min(minimum, leading))}`
  })
  return ['mindmap', '  root((Mind map))', ...children].join('\n')
}

export async function renderMermaidWithRecovery(
  renderer: Pick<Mermaid, 'render'>,
  ...args: Parameters<Mermaid['render']>
): Promise<RenderResult> {
  try {
    return await renderer.render(...args)
  }
  catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (!/only one root|multiple roots|no parent/i.test(message))
      throw error
    const repaired = groupMindmapRoots(args[1])
    if (!repaired)
      throw error
    return renderer.render(`${args[0]}-single-root`, repaired, args[2])
  }
}
