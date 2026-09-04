import { ss } from '@/utils/storage'

const STORAGE_KEY = 'lens.research.v1'

export interface ResearchStorageState {
  version: 1
  active: number
  preferredModel: unknown
  hiddenReplyChatIdsByGroup: Record<number, number[]>
  hiddenReplyTailAnchorByGroup: Record<number, number>
}

const emptyState = (): ResearchStorageState => ({
  version: 1,
  active: 0,
  preferredModel: null,
  hiddenReplyChatIdsByGroup: {},
  hiddenReplyTailAnchorByGroup: {},
})

const normalizePositiveInteger = (value: unknown) => {
  const normalized = Number(value)
  return Number.isFinite(normalized) && normalized > 0 ? Math.trunc(normalized) : 0
}

const normalizeNumberListMap = (value: unknown): Record<number, number[]> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.entries(value as Record<string, unknown>).reduce<Record<number, number[]>>(
    (result, [groupId, rawIds]) => {
      const normalizedGroupId = normalizePositiveInteger(groupId)
      if (!normalizedGroupId || !Array.isArray(rawIds)) {
        return result
      }

      const ids = Array.from(
        new Set(
          rawIds
            .map(normalizePositiveInteger)
            .filter(Boolean),
        ),
      )
      if (ids.length) result[normalizedGroupId] = ids
      return result
    },
    {},
  )
}

const normalizeNumberMap = (value: unknown): Record<number, number> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}

  return Object.entries(value as Record<string, unknown>).reduce<Record<number, number>>(
    (result, [groupId, rawId]) => {
      const normalizedGroupId = normalizePositiveInteger(groupId)
      const normalizedId = normalizePositiveInteger(rawId)
      if (normalizedGroupId && normalizedId) result[normalizedGroupId] = normalizedId
      return result
    },
    {},
  )
}

const normalizeState = (value: Partial<ResearchStorageState> | null | undefined) => ({
  ...emptyState(),
  ...(value || {}),
  version: 1 as const,
  active: normalizePositiveInteger(value?.active),
  hiddenReplyChatIdsByGroup: normalizeNumberListMap(value?.hiddenReplyChatIdsByGroup),
  hiddenReplyTailAnchorByGroup: normalizeNumberMap(value?.hiddenReplyTailAnchorByGroup),
})

export function readResearchState(legacyState?: Partial<ResearchStorageState> | null) {
  const stored = ss.get(STORAGE_KEY) as Partial<ResearchStorageState> | null | undefined
  if (stored) return normalizeState(stored)

  const migrated = normalizeState(legacyState)
  ss.set(STORAGE_KEY, migrated)
  return migrated
}

export function writeResearchState(nextState: Partial<ResearchStorageState>) {
  const current = readResearchState()
  ss.set(STORAGE_KEY, normalizeState({ ...current, ...nextState }))
}
