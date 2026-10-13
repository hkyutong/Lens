<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { t } from '@/locales'

const props = withDefaults(defineProps<{ enabled?: boolean; fillContainer?: boolean; inset?: boolean }>(), {
  enabled: true,
  fillContainer: false,
  inset: false,
})
const viewport = ref<HTMLElement>()
const content = ref<HTMLElement>()
const canScrollDown = ref(false)
let observer: ResizeObserver | undefined

function updateOverflow() {
  const element = viewport.value
  canScrollDown.value = Boolean(
    props.enabled &&
      element &&
      element.scrollHeight - element.clientHeight - element.scrollTop >
        (Number.parseFloat(getComputedStyle(element).paddingBottom) || 0) + 2
  )
}

function revealMore() {
  const element = viewport.value
  if (!element) return
  element.scrollBy({ top: Math.max(88, element.clientHeight * 0.75), behavior: 'auto' })
}

watch(
  () => props.enabled,
  async () => {
    await nextTick()
    updateOverflow()
  }
)
onMounted(() => {
  observer = new ResizeObserver(updateOverflow)
  if (viewport.value) observer.observe(viewport.value)
  if (content.value) observer.observe(content.value)
  updateOverflow()
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div
    class="capability-scroll"
    :class="{
      'capability-scroll--enabled': props.enabled,
      'capability-scroll--fill': props.fillContainer,
      'capability-scroll--inset': props.inset,
    }"
  >
    <div ref="viewport" class="capability-scroll__viewport" @scroll.passive="updateOverflow">
      <div ref="content"><slot /></div>
    </div>
    <div v-if="canScrollDown && !props.fillContainer" class="capability-scroll__hint">
      <button type="button" :aria-label="t('lens.academicPanel.scrollMore')" @click="revealMore">
        <span>{{ t('lens.academicPanel.scrollMore') }}</span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.capability-scroll {
  position: relative;
  min-height: 0;
  min-width: 0;
}
.capability-scroll--inset .capability-scroll__viewport {
  padding-inline: 8px;
}
.capability-scroll--enabled .capability-scroll__viewport {
  max-height: var(--capability-list-max-height, clamp(132px, 24dvh, 220px));
  overflow-y: auto;
  overflow-x: hidden;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  scrollbar-width: thin;
  scrollbar-color: var(--paper-border) transparent;
  padding: 0 8px 12px;
}
.capability-scroll--fill {
  display: flex;
  flex: 1;
}
.capability-scroll--fill .capability-scroll__viewport {
  flex: 1;
  max-height: none;
  padding-bottom: 4px;
}
.capability-scroll__viewport,
.capability-scroll__viewport > div {
  min-width: 0;
  max-width: 100%;
}
.capability-scroll__viewport::-webkit-scrollbar {
  width: 5px;
  height: 0;
  display: block;
}
.capability-scroll__viewport::-webkit-scrollbar-track {
  background: transparent;
  border-radius: 8px;
}
.capability-scroll__viewport::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--academic-ink-soft, #647873) 42%, transparent);
  border-radius: 8px;
}
.capability-scroll__hint {
  position: absolute;
  inset: auto 8px 0 0;
  height: 44px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  pointer-events: none;
  background: linear-gradient(transparent, var(--surface-panel) 30%);
}
.capability-scroll__hint button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-width: 44px;
  max-width: calc(100% - 16px);
  height: 44px;
  padding: 0 10px;
  font-size: 12px;
  border: 0;
  border-radius: var(--radius-control, 8px);
  color: var(--academic-ink-soft, #647873);
  background: transparent;
  cursor: pointer;
  pointer-events: auto;
}
.capability-scroll__hint button:hover {
  color: var(--academic-blue);
}
.capability-scroll__hint button:focus-visible {
  outline: 2px solid var(--academic-blue);
  outline-offset: 2px;
}
.capability-scroll__hint svg {
  width: 14px;
  height: 14px;
}
@supports not selector(::-webkit-scrollbar) {
  .capability-scroll--enabled .capability-scroll__viewport {
    scrollbar-width: thin;
    scrollbar-color: color-mix(in srgb, var(--academic-ink-soft, #647873) 42%, transparent)
      transparent;
  }
}
</style>
