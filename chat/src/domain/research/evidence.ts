import { createLocalStorage } from '@/utils/storage/local'
import { normalizeExternalSourceUrl } from '@/domain/research/sources'

export type EvidenceCardKind = 'source' | 'file'

export interface SavedEvidenceCard {
  id: string
  kind: EvidenceCardKind
  title: string
  link?: string
  media?: string
  createdAt: string
}

const evidenceStorage = createLocalStorage({ expire: null, crypto: true })
const STORAGE_PREFIX = 'lens.evidence.v1'

const normalizeId = (value: unknown) => {
  const normalized = Number(value)
  return Number.isFinite(normalized) && normalized > 0 ? Math.trunc(normalized) : 0
}

const storageKey = (ownerId: unknown, groupId: unknown) => {
  const owner = normalizeId(ownerId)
  const group = normalizeId(groupId)
  return owner && group ? `${STORAGE_PREFIX}.${owner}.${group}` : ''
}

const readStorage = (key: string) => {
  if (!key) return null
  try {
    return evidenceStorage.get(key)
  } catch {
    return null
  }
}

const writeStorage = (key: string, value: SavedEvidenceCard[]) => {
  if (!key) return false
  try {
    evidenceStorage.set(key, value)
    return true
  } catch {
    return false
  }
}

export const makeEvidenceCardId = (kind: EvidenceCardKind, value: string) => {
  let hash = 2166136261
  const input = `${kind}:${value}`
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `${kind}-${(hash >>> 0).toString(36)}`
}

const normalizeCard = (value: unknown): SavedEvidenceCard | null => {
  if (!value || typeof value !== 'object') return null
  const source = value as Record<string, unknown>
  const kind = source.kind === 'file' ? 'file' : source.kind === 'source' ? 'source' : null
  const title = String(source.title || '').trim().slice(0, 240)
  const id = String(source.id || '').trim()
  if (!kind || !id || !title) return null

  let safeLink = ''
  if (kind === 'source') {
    const normalizedLink = normalizeExternalSourceUrl(source.link)
    if (normalizedLink) {
      try {
        const url = new URL(normalizedLink)
        url.search = ''
        url.hash = ''
        safeLink = url.toString()
      } catch (_error) {
        safeLink = ''
      }
    }
  }

  return {
    id,
    kind,
    title,
    link: kind === 'source' ? safeLink || undefined : undefined,
    media: kind === 'source' ? String(source.media || '').trim().slice(0, 80) : undefined,
    createdAt: String(source.createdAt || '').trim() || new Date(0).toISOString(),
  }
}

export function readSavedEvidenceCards(ownerId: unknown, groupId: unknown) {
  const key = storageKey(ownerId, groupId)
  if (!key) return []
  const stored = readStorage(key)
  if (!Array.isArray(stored)) return []
  return stored.map(normalizeCard).filter((card): card is SavedEvidenceCard => Boolean(card))
}

export function saveEvidenceCard(
  ownerId: unknown,
  groupId: unknown,
  card: Omit<SavedEvidenceCard, 'createdAt'> & { createdAt?: string },
) {
  const key = storageKey(ownerId, groupId)
  const normalized = normalizeCard({ ...card, createdAt: card.createdAt || new Date().toISOString() })
  if (!key || !normalized) return false

  const next = [normalized, ...readSavedEvidenceCards(ownerId, groupId).filter(item => item.id !== normalized.id)].slice(0, 200)
  return writeStorage(key, next)
}

export function removeSavedEvidenceCard(ownerId: unknown, groupId: unknown, cardId: string) {
  const key = storageKey(ownerId, groupId)
  if (!key) return false
  const current = readSavedEvidenceCards(ownerId, groupId)
  const next = current.filter(card => card.id !== cardId)
  if (next.length === current.length) return false
  return writeStorage(key, next)
}
