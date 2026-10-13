<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import type { UserUploadedFile } from '@/domain/research/downloads'
import type { AcademicSource } from '@/domain/research/sources'
import {
  makeEvidenceCardId,
  readSavedEvidenceCards,
  removeSavedEvidenceCard,
  saveEvidenceCard,
} from '@/domain/research/evidence'
import { t } from '@/locales'
import { computed, onMounted, ref, watch } from 'vue'

interface Props {
  sources?: AcademicSource[]
  files?: UserUploadedFile[]
  ownerId?: number | string
  groupId?: number | string
}

const props = defineProps<Props>()

const sourceCards = computed(() => {
  const seen = new Set<string>()
  return (props.sources || [])
    .filter(source => {
      const identity = source.link || source.title
      if (!identity || seen.has(identity)) return false
      seen.add(identity)
      return true
    })
    .slice(0, 6)
    .map(source => ({
      id: makeEvidenceCardId('source', source.link || source.title),
      kind: 'source' as const,
      title: source.title,
      link: source.link,
      media: source.media,
    }))
})

const fileCards = computed(() => {
  const seen = new Set<string>()
  return (props.files || [])
    .filter(file => {
      const identity = file.name
      if (!identity || seen.has(identity)) return false
      seen.add(identity)
      return true
    })
    .slice(0, 6)
    .map(file => ({
      id: makeEvidenceCardId('file', file.name),
      kind: 'file' as const,
      title: file.name,
      link: '',
      media: '',
    }))
})

const cards = computed(() => [...sourceCards.value, ...fileCards.value])
const savedIds = ref<Set<string>>(new Set())
const canSave = computed(() => Number(props.ownerId) > 0 && Number(props.groupId) > 0)

const syncSavedIds = () => {
  if (!canSave.value) {
    savedIds.value = new Set()
    return
  }
  savedIds.value = new Set(
    readSavedEvidenceCards(props.ownerId, props.groupId).map(card => card.id),
  )
}

const isSaved = (card: (typeof cards.value)[number]) => savedIds.value.has(card.id)

const toggleSave = (card: (typeof cards.value)[number]) => {
  if (!canSave.value) return
  if (isSaved(card)) {
    removeSavedEvidenceCard(props.ownerId, props.groupId, card.id)
  } else {
    saveEvidenceCard(props.ownerId, props.groupId, {
      id: card.id,
      kind: card.kind,
      title: card.title,
      link: card.link,
      media: card.media,
    })
  }
  syncSavedIds()
}

watch([() => props.ownerId, () => props.groupId, cards], syncSavedIds)
onMounted(syncSavedIds)
</script>

<template>
  <section
    v-if="cards.length"
    class="evidence-cards"
    :aria-label="t('lens.message.evidenceCardsTitle')"
  >
    <div class="evidence-cards__header">
      <div>
        <div class="evidence-cards__title">
          {{ t('lens.message.evidenceCardsTitle') }}
        </div>
        <div class="evidence-cards__hint">{{ t('lens.message.evidenceCardsHint') }}</div>
      </div>
      <span class="evidence-cards__count">{{ cards.length }}</span>
    </div>

    <ul class="evidence-cards__list">
      <li v-for="card in cards" :key="card.id" class="evidence-cards__item">
        <span class="evidence-cards__icon" aria-hidden="true">
          <SvgIcon :icon="card.kind === 'source' ? 'ri:links-line' : 'ri:file-text-line'" />
        </span>
        <div class="evidence-cards__copy">
          <strong>{{ card.title }}</strong>
          <small v-if="card.kind === 'source'">
            {{ card.media || t('lens.message.evidenceCardSource') }} ·
            {{ t('lens.message.evidenceCardTraceable') }}
          </small>
          <small v-else>
            {{ t('lens.message.evidenceCardAttachment') }} ·
            {{ t('lens.message.evidenceCardPending') }}
          </small>
        </div>
        <button
          v-if="canSave"
          type="button"
          class="evidence-cards__save"
          :aria-pressed="isSaved(card)"
          @click="toggleSave(card)"
        >
          {{
            isSaved(card)
              ? t('lens.message.evidenceCardSaved')
              : t('lens.message.evidenceCardSave')
          }}
        </button>
        <a
          v-if="card.link"
          :href="card.link"
          target="_blank"
          rel="noopener noreferrer"
          class="evidence-cards__open"
        >
          {{ t('lens.message.evidenceCardOpen') }}
        </a>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.evidence-cards {
  margin-top: 0.85rem;
  padding: 0.85rem 0.9rem;
  border: 1px solid var(--paper-border);
  border-radius: 14px;
  background: var(--surface-card);
}

.evidence-cards__header,
.evidence-cards__item {
  display: flex;
  align-items: center;
}

.evidence-cards__header {
  justify-content: space-between;
  gap: 0.75rem;
  padding-bottom: 0.65rem;
}

.evidence-cards__title {
  color: var(--text-main);
  font-size: 0.8rem;
  font-weight: 650;
}

.evidence-cards__hint {
  margin-top: 0.2rem;
  color: var(--text-sub);
  font-size: 13px;
  line-height: 1.4;
}

.evidence-cards__count {
  display: inline-grid;
  min-width: 1.5rem;
  height: 1.5rem;
  place-items: center;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 700;
}

.evidence-cards__list {
  display: grid;
  gap: 0.4rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.evidence-cards__item {
  min-width: 0;
  gap: 0.55rem;
  padding: 0.5rem 0;
  border-top: 1px solid color-mix(in srgb, var(--paper-border) 72%, transparent);
}

.evidence-cards__icon {
  display: inline-grid;
  width: 1.7rem;
  height: 1.7rem;
  flex: none;
  place-items: center;
  border-radius: 8px;
  background: var(--accent-soft);
  color: var(--accent);
}

.evidence-cards__icon :deep(svg) {
  width: 0.9rem;
  height: 0.9rem;
}

.evidence-cards__copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 0.15rem;
}

.evidence-cards__copy strong,
.evidence-cards__copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.evidence-cards__copy strong {
  color: var(--text-main);
  font-size: 13px;
  font-weight: 600;
}

.evidence-cards__copy small {
  color: var(--text-sub);
  font-size: 12px;
}

.evidence-cards__open {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 0 8px;
  flex: none;
  color: var(--accent);
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}

.evidence-cards__save {
  min-height: 44px;
  min-width: 44px;
  flex: none;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-sub);
  font-size: 13px;
  font-weight: 600;
}

.evidence-cards__save:hover,
.evidence-cards__save:focus-visible,
.evidence-cards__save[aria-pressed='true'] {
  color: var(--accent);
}

.evidence-cards__save:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}

.evidence-cards__open:hover,
.evidence-cards__open:focus-visible {
  text-decoration: underline;
  text-underline-offset: 0.15em;
}

.evidence-cards__open:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}
</style>
