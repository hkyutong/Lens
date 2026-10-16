import { useAuthStore } from '@/store'
import { computed, onUnmounted, ref, watch } from 'vue'

const ATTACHMENT_REFERENCE = /^attachment:[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isPrivateAttachmentReference(source: unknown): boolean {
  return typeof source === 'string' && ATTACHMENT_REFERENCE.test(source.trim())
}

export async function fetchAttachmentBlob(
  source: string,
  name = '',
  signal?: AbortSignal
): Promise<Blob> {
  const authStore = useAuthStore()
  const baseUrl = String(import.meta.env.VITE_GLOB_API_URL || '').replace(/\/+$/, '')
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authStore.token) headers.Authorization = `Bearer ${authStore.token}`
  const response = await fetch(`${baseUrl}/upload/file/download`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ source, name }),
    signal,
  })
  if (!response.ok) throw new Error('Attachment unavailable')
  return response.blob()
}

/** Keeps authenticated media URLs scoped to the component that displays them. */
export function usePrivateMediaSources(sources: () => readonly string[]) {
  const resolvedSources = ref<Record<string, string>>({})
  let generation = 0
  let controller: AbortController | undefined

  const release = (source: string) => {
    const url = resolvedSources.value[source]
    if (url?.startsWith('blob:')) URL.revokeObjectURL(url)
    delete resolvedSources.value[source]
  }

  const stop = watch(
    () => JSON.stringify([...new Set(sources().filter(isPrivateAttachmentReference))]),
    async referenceKey => {
      const currentGeneration = ++generation
      controller?.abort()
      controller = new AbortController()
      const signal = controller.signal
      const references = JSON.parse(referenceKey) as string[]
      for (const source of Object.keys(resolvedSources.value)) {
        if (!references.includes(source)) release(source)
      }
      await Promise.all(references.map(async source => {
        if (resolvedSources.value[source]) return
        try {
          const blob = await fetchAttachmentBlob(source, '', signal)
          if (signal.aborted || currentGeneration !== generation) return
          resolvedSources.value[source] = URL.createObjectURL(blob)
        } catch {
          // Permission and network failures leave a safe empty media source.
        }
      }))
    },
    { immediate: true }
  )

  const resolveSource = (source: string) =>
    isPrivateAttachmentReference(source)
      ? resolvedSources.value[source] || ''
      : /^attachment:/i.test(source.trim()) ? '' : source

  onUnmounted(() => {
    stop()
    generation += 1
    controller?.abort()
    Object.keys(resolvedSources.value).forEach(release)
  })

  return { resolveSource, resolvedSources: computed(() => resolvedSources.value) }
}
