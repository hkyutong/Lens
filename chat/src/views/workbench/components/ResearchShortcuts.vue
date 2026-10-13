<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { t } from '@/locales'
import { useAuthStore, useChatStore } from '@/store'
import {
  ACADEMIC_RESEARCH_SHORTCUTS,
  ACADEMIC_FEATURED_SHORTCUTS,
  normalizeAcademicCapabilityName,
} from '@/utils/academicCapabilityCatalog'
import { computed, nextTick } from 'vue'
import CapabilityScrollRegion from './CapabilityScrollRegion.vue'

const props = defineProps<{
  compact?: boolean
  featured?: boolean
  includeResearch?: boolean
  hideTitle?: boolean
  scrollable?: boolean
  fillContainer?: boolean
}>()
const chatStore = useChatStore()
const authStore = useAuthStore()
type ResearchShortcut =
  | (typeof ACADEMIC_RESEARCH_SHORTCUTS)[number]
  | (typeof ACADEMIC_FEATURED_SHORTCUTS)[number]
const shortcuts = computed(() => {
  if (!props.featured) return ACADEMIC_RESEARCH_SHORTCUTS
  return props.includeResearch
    ? [...ACADEMIC_FEATURED_SHORTCUTS, ...ACADEMIC_RESEARCH_SHORTCUTS]
    : ACADEMIC_FEATURED_SHORTCUTS
})

function resolvePlugin(pluginName: string) {
  const target = normalizeAcademicCapabilityName(pluginName)
  return (chatStore.academicPluginList || []).find((item: any) =>
    [item?.name, item?.displayName, item?.originName]
      .map(normalizeAcademicCapabilityName)
      .filter(Boolean)
      .includes(target),
  )
}

function isUnavailable(pluginName: string) {
  return (
    authStore.isLogin &&
    (chatStore.academicPluginList?.length || 0) > 0 &&
    !resolvePlugin(pluginName)
  )
}

async function startResearchShortcut(shortcut: ResearchShortcut) {
  if (!authStore.isLogin) {
    authStore.setLoginDialog(true)
    return
  }
  let plugin = resolvePlugin(shortcut.pluginName)
  if (!plugin && !(chatStore.academicPluginList?.length || 0)) {
    await chatStore.queryAcademicPluginList()
    plugin = resolvePlugin(shortcut.pluginName)
  }
  if (!plugin) return
  chatStore.setAcademicMode(true)
  chatStore.setAcademicCore(undefined)
  chatStore.setAcademicPlugin(plugin)
  chatStore.setAcademicWorkflowEnabled(false)
  chatStore.setMobileAcademicPanelVisible(false)
  await nextTick()
  const composer = document.getElementById('workspace-composer') as HTMLTextAreaElement | null
  composer?.focus()
}
</script>

<template>
  <section
    class="research-shortcuts"
    :class="{
      'research-shortcuts--compact': props.compact,
      'research-shortcuts--fill': props.fillContainer,
    }"
    :aria-label="t('lens.workspace.starterTitle')"
  >
    <h3 v-if="props.compact && !props.hideTitle" class="research-shortcuts__title">
      {{ t('lens.workspace.starterTitle') }}
    </h3>
    <CapabilityScrollRegion
      :enabled="props.scrollable !== false && props.compact && props.featured"
      :fill-container="props.fillContainer"
      :inset="props.compact"
    >
      <div class="research-shortcuts__list">
        <button
          v-for="shortcut in shortcuts"
          :key="shortcut.pluginName"
          type="button"
          class="research-shortcuts__button"
          :disabled="isUnavailable(shortcut.pluginName)"
          :title="isUnavailable(shortcut.pluginName) ? t('lens.workspace.featureUnavailable') : t(shortcut.descriptionKey)"
          @click="startResearchShortcut(shortcut)"
        >
          <span
            v-if="!props.compact && 'icon' in shortcut"
            class="research-shortcuts__icon"
            aria-hidden="true"
          >
            <SvgIcon :icon="shortcut.icon" />
          </span>
          <span class="research-shortcuts__copy">
            <strong>{{ t(shortcut.labelKey) }}</strong>
            <small v-if="!props.compact">{{ t(shortcut.descriptionKey) }}</small>
          </span>
          <SvgIcon class="research-entry-arrow" icon="ri:arrow-right-line" aria-hidden="true" />
        </button>
      </div>
    </CapabilityScrollRegion>
  </section>
</template>

<style scoped>
.research-shortcuts {
  min-width: 0;
  flex: none;
  width: 100%;
}

.research-shortcuts__list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.research-shortcuts__button {
  position: relative;
  isolation: isolate;
  display: flex;
  min-width: 0;
  min-height: 68px;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-main);
  text-align: left;
  transition: color 160ms ease;
}

.research-shortcuts__button::before {
  position: absolute;
  z-index: -1;
  inset: 0 -8px;
  border-radius: inherit;
  background: color-mix(in srgb, var(--academic-surface) 72%, var(--surface-card));
  content: '';
  opacity: 0;
  pointer-events: none;
  transition: opacity 160ms ease;
}

@media (hover: hover) and (pointer: fine) {
  .research-shortcuts__button:hover::before {
    opacity: 1;
  }
}

.research-shortcuts__button:focus-visible::before,
.research-shortcuts__button:active::before {
  opacity: 1;
}

.research-shortcuts__icon {
  display: inline-grid;
  width: 24px;
  height: 24px;
  flex: none;
  place-items: center start;
  border-radius: var(--radius-small);
  background: transparent;
  color: var(--academic-blue);
}

.research-shortcuts__icon :deep(svg) {
  width: 16px;
  height: 16px;
}

.research-shortcuts__copy {
  display: grid;
  min-width: 0;
  gap: 4px;
  overflow-wrap: anywhere;
}

.research-shortcuts__copy strong {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
}

.research-shortcuts__copy small {
  color: var(--text-sub);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.5;
}

.research-shortcuts__button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 6px;
}

.research-shortcuts__button:disabled {
  cursor: not-allowed;
  opacity: 0.52;
}

@media (min-width: 1024px) and (max-height: 700px) {
  .research-shortcuts__button {
    min-height: 56px;
    padding-block: 4px;
  }
}

@media (max-width: 559px) {
  .research-shortcuts__list {
    grid-template-columns: minmax(0, 1fr);
  }
}

.research-shortcuts__title {
  margin: 0 8px 12px;
  color: var(--text-main);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 20px;
}

.research-shortcuts--compact .research-shortcuts__list {
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
}

.research-shortcuts--compact .research-shortcuts__button {
  min-height: 44px;
  margin-inline: 0;
  padding: 8px 0;
}

.research-shortcuts--compact .research-shortcuts__button::before {
  inset: 0 -8px;
}
.research-shortcuts--compact .research-shortcuts__title {
  margin-inline: 8px;
}

.research-shortcuts--compact .research-shortcuts__copy strong {
  font-size: 13px;
  font-weight: 400;
}
.research-shortcuts--fill {
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
}
</style>
