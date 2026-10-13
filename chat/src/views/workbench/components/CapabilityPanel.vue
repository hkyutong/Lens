<script setup lang="ts">
import { t } from '@/locales'
import { useAuthStore, useChatStore } from '@/store'
import { computed, nextTick, ref, watch } from 'vue'
import ResearchShortcuts from './ResearchShortcuts.vue'
import CapabilityScrollRegion from './CapabilityScrollRegion.vue'
import ResearchSearchField from './ResearchSearchField.vue'
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { DropdownMenu } from '@/components/common/DropdownMenu'
import {
  getAcademicEntityDisplayLabel,
  getAcademicEntityRawLabel,
  getAcademicEntitySelectorValue,
} from '@/utils/academicI18n'
import type { AcademicEntity } from '@/utils/academicI18n'
import {
  ACADEMIC_HOME_PLUGIN_ORDER,
  isAcademicFeaturedPlugin,
  normalizeAcademicCapabilityName,
} from '@/utils/academicCapabilityCatalog'
import { canUseAcademicCore, canUseAcademicPlugin } from '@/utils/academicPlanAccess'
import { useRouter } from 'vue-router'

interface Props {
  titleLabel?: string
  embedded?: boolean
  serviceState?: 'unknown' | 'ready' | 'unavailable'
  showClose?: boolean
  scrollable?: boolean
  fillContainer?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()
const chatStore = useChatStore()
const authStore = useAuthStore()
const router = useRouter()

const userBalance = computed(() => authStore.userBalance || {})
const isLoggedIn = computed(() => Boolean(authStore.isLogin))
const hasLoadedCapabilityData = computed(
  () =>
    (chatStore.academicCoreFunctions?.length || 0) > 0 ||
    (chatStore.academicPluginList?.length || 0) > 0
)
const coreFunctions = computed(() =>
  (chatStore.academicCoreFunctions || []).filter((core: AcademicEntity) =>
    canUseAcademicCore(core, userBalance.value)
  )
)
const activePlugin = computed(() => chatStore.currentAcademicPlugin)
const activeCore = computed(() => chatStore.currentAcademicCore)
const canConfigureCapabilities = computed(
  () => isLoggedIn.value && props.serviceState !== 'unavailable'
)
const hasNoAvailableCapabilities = computed(
  () =>
    isLoggedIn.value &&
    props.serviceState === 'ready' &&
    hasLoadedCapabilityData.value &&
    !coreFunctions.value.length &&
    !pluginList.value.length
)
const openMemberDialog = () => {
  void router.push('/pricing')
}

const getCoreLabel = (core: AcademicEntity) => getAcademicEntityRawLabel(core)
const getCoreDisplayLabel = (core: AcademicEntity) => getAcademicEntityDisplayLabel(core)
const getPluginLabel = (plugin: AcademicEntity) => getAcademicEntityRawLabel(plugin)
const getPluginDisplayLabel = (plugin: AcademicEntity) => getAcademicEntityDisplayLabel(plugin)
const normalizePluginName = (name: string) => normalizeAcademicCapabilityName(name)

const academicPluginOrder = ACADEMIC_HOME_PLUGIN_ORDER

const getSortKey = (name: string) => {
  const normalized = normalizePluginName(name)
  if (
    normalized.includes('arxiv') &&
    (normalized.includes('摘要') || normalized.includes('下载'))
  ) {
    return normalizePluginName('Arxiv摘要')
  }
  return normalized
}

const blockedPlugins = [
  '虚空终端',
  '批量文件问答',
  '批量文件询问',
  '查互联网后回答',
  '历史上的今天',
  '动态代码解释器（CodeInterpreter）',
  '[多线程Demo]解析此项目本身（源码自译解）',
  '删除所有本地对话历史记录',
  '清除所有缓存文件',
  '数学动画生成（Manim）',
  '批量总结音视频',
  '实时语音对话',
  '交互功能模板Demo函数',
  '多媒体智能体',
]

const pluginList = computed(() => {
  const orderMap = new Map(
    academicPluginOrder.map((name, index) => [normalizePluginName(name), index])
  )
  const renameMap: Record<string, string> = {
    [normalizePluginName('注释Python项目')]: '注释整个Python项目',
    [normalizePluginName('解析项目源代码（手动指定和筛选源代码文件类型）')]:
      '解析项目源代码（自定义文件类型）',
    [normalizePluginName('一键下载arxiv论文并翻译摘要（先在input输入编号，如1812.10695）')]:
      'Arxiv摘要',
    [normalizePluginName('解析整个C++项目（.cpp/.hpp/.c/.h）')]: '解析整个C++项目（.cpp/.hpp等）',
    [normalizePluginName('上传一系列python源文件(或者压缩包), 为这些代码添加docstring')]:
      '上传python源文件(或压缩包), 为这些代码添加docstring',
    [normalizePluginName('解析一个C++项目的所有源文件（.cpp/.hpp/.c/.h）')]:
      '解析一个C++项目的所有源文件',
    [normalizePluginName('解析Jupyter Notebook文件若输入0，则不解析notebook中的Markdown块')]:
      '若输入0，则不解析notebook中的Markdown',
    [normalizePluginName('将Markdown或README翻译为中文')]: '翻译Markdown或README',
    [normalizePluginName('PDF批量总结')]: 'PDF 批量总结',
    [normalizePluginName('PDF深度理解')]: 'PDF 深度理解',
    [normalizePluginName('Word批量总结')]: 'Word 批量总结',
    [normalizePluginName('Arxiv论文下载')]: 'Arxiv摘要',
    [normalizePluginName('Arxiv精准翻译')]: 'Arxiv 英文摘要',
    [normalizePluginName('Arxiv英文摘要')]: 'Arxiv 英文摘要',
    [normalizePluginName('Arxiv精准翻译（输入arxivID）')]: 'Arxiv 英文摘要',
    [normalizePluginName('LaTeX摘要')]: 'LaTeX 摘要',
    [normalizePluginName('LaTeX精准翻译')]: 'LaTeX 精准翻译',
    [normalizePluginName('LaTeX英文润色')]: 'LaTeX 英文润色',
    [normalizePluginName('LaTeX中文润色')]: 'LaTeX 中文润色',
    [normalizePluginName('LaTeX高亮纠错')]: 'LaTeX 高亮纠错',
  }
  const descriptionMap: Record<string, string> = {
    [normalizePluginName('解析项目源代码（自定义文件类型）')]:
      '手动指定源代码文件类型。自定义指令用,隔开, *代表通配符, 加^代表不匹配; 空代表全部匹配。',
    [normalizePluginName('Arxiv摘要')]:
      '读取并摘要 Arxiv 论文，可供下载（先输入编号，如 1812.10695）',
    [normalizePluginName('Arxiv 英文摘要')]:
      '可自定义翻译要求，适合处理专业术语、实验设置和学科特定词汇。',
  }

  const candidates = (chatStore.academicPluginList || [])
    .filter((plugin: AcademicEntity) => {
      const label = getPluginLabel(plugin)
      const rawName = String(plugin?.name || '')
      const info = String(plugin?.info || '')
      const description = String(plugin?.description || '')
      const haystack = `${label} ${rawName} ${info} ${description}`
      if (!label) return false
      if (isAcademicFeaturedPlugin(plugin)) return false
      if (label.includes('中译英') || rawName.includes('中译英')) return false
      return !blockedPlugins.some(block => haystack.includes(block))
    })
    .map((plugin: AcademicEntity, index: number) => {
      const cloned = { ...plugin, originName: String(plugin?.name || '') }
      const normalized = normalizePluginName(getPluginLabel(cloned))
      if (renameMap[normalized]) {
        cloned.displayName = renameMap[normalized]
      }
      const normalizedAfterRename = normalizePluginName(getPluginLabel(cloned))
      if (descriptionMap[normalizedAfterRename]) {
        cloned.description = descriptionMap[normalizedAfterRename]
        cloned.info = descriptionMap[normalizedAfterRename]
      }
      return { item: cloned, index }
    })
    .filter(entry => canUseAcademicPlugin(entry.item, userBalance.value))

  return candidates
    .sort((a, b) => {
      const idxA = orderMap.has(getSortKey(getPluginLabel(a.item)))
        ? orderMap.get(getSortKey(getPluginLabel(a.item)))!
        : 9999
      const idxB = orderMap.has(getSortKey(getPluginLabel(b.item)))
        ? orderMap.get(getSortKey(getPluginLabel(b.item)))!
        : 9999
      if (idxA !== idxB) return idxA - idxB
      return a.index - b.index
    })
    .map(entry => entry.item)
})

const showGuestPreview = computed(() => !isLoggedIn.value)

watch(
  [pluginList, coreFunctions],
  ([plugins, cores]) => {
    const hasPlugin =
      !activePlugin.value ||
      plugins.some(
        plugin =>
          normalizePluginName(getPluginLabel(plugin)) ===
          normalizePluginName(getPluginLabel(activePlugin.value))
      )
    if (!hasPlugin) {
      chatStore.setAcademicPlugin(undefined)
    }

    const hasCore =
      !activeCore.value ||
      cores.some(
        core => getCoreLabel(core).toLowerCase() === getCoreLabel(activeCore.value).toLowerCase()
      )
    if (!hasCore) {
      chatStore.setAcademicCore(undefined)
    }
  },
  { immediate: true }
)

const selectedCore = computed({
  get: () => getAcademicEntitySelectorValue(activeCore.value) || '',
  set: (value: string) => {
    if (!value) {
      chatStore.setAcademicCore(undefined)
      return
    }
    const selected = coreFunctions.value.find(
      core => getAcademicEntitySelectorValue(core) === value || core.name === value
    )
    chatStore.setAcademicCore(selected)
  },
})

const selectedPlugin = computed({
  get: () => getAcademicEntitySelectorValue(activePlugin.value) || '',
  set: (value: string) => {
    if (!value) {
      chatStore.setAcademicPlugin(undefined)
      return
    }
    const selected = pluginList.value.find(
      plugin => getAcademicEntitySelectorValue(plugin) === value || plugin.name === value
    )
    chatStore.setAcademicPlugin(selected)
  },
})

// One UI selection adapts to the existing mutually exclusive Academic state.
const selectedCapability = computed({
  get: () =>
    activeCore.value
      ? `core:${selectedCore.value}`
      : activePlugin.value
      ? `plugin:${selectedPlugin.value}`
      : '',
  set: (value: string) => {
    if (value.startsWith('core:')) selectedCore.value = value.slice(5)
    else if (value.startsWith('plugin:')) selectedPlugin.value = value.slice(7)
    else {
      selectedCore.value = ''
      selectedPlugin.value = ''
    }
  },
})

const capabilityEntries = computed(() => [
  { value: '', label: t('lens.academicPanel.defaultCapability'), category: 'academic' },
  ...coreFunctions.value.map(core => ({
    value: `core:${getAcademicEntitySelectorValue(core)}`,
    label: getCoreDisplayLabel(core),
    category: capabilityCategoryFor(core),
  })),
  ...pluginList.value.map(plugin => ({
    value: `plugin:${getAcademicEntitySelectorValue(plugin)}`,
    label: getPluginDisplayLabel(plugin),
    category: capabilityCategoryFor(plugin),
  })),
])

// Filtering is presentation-only: permissions and the selection setters stay authoritative.
function capabilityCategoryFor(entity: AcademicEntity) {
  return String(entity.group || '')
    .split('|')
    .includes('编程') || /代码|编程|code|python|javascript/i.test(getAcademicEntityRawLabel(entity))
    ? 'programming'
    : 'academic'
}
const category = ref('all')
const categoryMenuOpen = ref(false)
const categoryOptions = computed(() => [
  { value: 'all', label: t('lens.academicPanel.categoryAll') },
  { value: 'academic', label: t('lens.academicPanel.groupAcademic') },
  { value: 'programming', label: t('lens.academicPanel.groupProgramming') },
])
const categoryLabel = computed(
  () => categoryOptions.value.find(item => item.value === category.value)?.label
)
const searchVisible = ref(false)
const searchQuery = ref('')
const searchInput = ref<InstanceType<typeof ResearchSearchField>>()
const searchButton = ref<HTMLButtonElement>()
const filteredCapabilityEntries = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase()
  return capabilityEntries.value.filter(
    entry =>
      (category.value === 'all' || entry.category === category.value) &&
      (!query || `${entry.label} ${entry.value}`.toLocaleLowerCase().includes(query))
  )
})
async function toggleSearch() {
  searchVisible.value = !searchVisible.value
  if (!searchVisible.value) searchQuery.value = ''
  await nextTick()
  if (searchVisible.value) searchInput.value?.focus()
  else searchButton.value?.focus()
}
</script>

<template>
  <div class="w-full" :class="{ 'research-controls-frame--fill': props.fillContainer }">
    <section class="research-controls">
      <div class="research-controls__header">
        <div class="research-controls__heading">
          <h3 v-if="!props.embedded" class="research-controls__title">
            {{ props.titleLabel || t('lens.academicPanel.settingsTitle') }}
          </h3>
          <DropdownMenu
            v-if="isLoggedIn"
            v-model="categoryMenuOpen"
            position="bottom-left"
            min-width="140px"
            menu-class="menu-items-academic"
          >
            <template #trigger>
              <button
                type="button"
                class="research-controls__category"
                :aria-label="t('lens.academicPanel.categoryLabel')"
                :aria-expanded="categoryMenuOpen"
                aria-haspopup="menu"
              >
                {{ categoryLabel }}
                <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path
                    d="m7 10 5 5 5-5"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            </template>
            <template #menu="{ close }">
              <button
                v-for="item in categoryOptions"
                :key="item.value"
                type="button"
                class="menu-item menu-item-md"
                role="menuitemradio"
                :aria-checked="category === item.value"
                :class="{ 'menu-item-active': category === item.value }"
                @click="() => {
                  category = item.value
                  close()
                }"
              >
                {{ item.label }}
              </button>
            </template>
          </DropdownMenu>
        </div>
        <div class="research-controls__header-actions">
          <button
            v-if="isLoggedIn"
            ref="searchButton"
            type="button"
            class="research-controls__search-toggle"
            :aria-label="t('lens.academicPanel.searchLabel')"
            :aria-expanded="searchVisible"
            @click="toggleSearch"
          >
            <SvgIcon icon="ri:search-line" aria-hidden="true" />
          </button>
          <button
            v-if="props.showClose"
            type="button"
            class="research-controls__close"
            :aria-label="t('lens.academicPanel.close')"
            @click="emit('close')"
          >
            ×
          </button>
        </div>
      </div>

      <ResearchSearchField
        v-if="isLoggedIn && searchVisible"
        ref="searchInput"
        v-model="searchQuery"
        class="research-controls__search"
        :label="t('lens.academicPanel.searchLabel')"
        @keydown.esc.stop.prevent="toggleSearch"
      />

      <div
        v-if="showGuestPreview"
        class="research-controls__preview"
        role="group"
        :aria-label="props.titleLabel || t('lens.workspace.starterTitle')"
      >
        <ResearchShortcuts compact featured hide-title :scrollable="props.scrollable" />
      </div>

      <div
        v-if="hasNoAvailableCapabilities"
        class="research-controls__access-notice research-controls__access-notice--accent"
        role="status"
      >
        <div class="research-controls__access-copy">
          <strong>{{ t('lens.academicPanel.noAvailableCapabilities') }}</strong>
          <span>{{ t('lens.academicPanel.coreLabel') }}</span>
        </div>
        <button
          v-if="hasNoAvailableCapabilities"
          type="button"
          class="research-controls__access-action"
          @click="openMemberDialog"
        >
          {{ t('lens.workflow.upgradeNow') }}
        </button>
      </div>

      <div v-if="isLoggedIn" class="research-controls__body">
        <CapabilityScrollRegion
          class="research-controls__scroll-region"
          :enabled="props.scrollable !== false"
          :fill-container="props.fillContainer"
          inset
        >
          <div
            class="research-controls__list"
            role="group"
            :aria-label="t('lens.academicPanel.settingsTitle')"
          >
            <button
              v-for="entry in filteredCapabilityEntries"
              :key="entry.value"
              type="button"
              class="research-controls__option"
              :data-capability="entry.value"
              :aria-pressed="selectedCapability === entry.value"
              :disabled="!canConfigureCapabilities"
              @click="selectedCapability = entry.value"
            >
              <span>{{ entry.label }}</span>
              <SvgIcon class="research-entry-arrow" icon="ri:arrow-right-line" aria-hidden="true" />
            </button>
            <p
              v-if="!filteredCapabilityEntries.length"
              class="research-controls__empty"
              role="status"
            >
              {{ t('lens.academicPanel.noSearchResults') }}
            </p>
          </div>
        </CapabilityScrollRegion>
      </div>
    </section>
  </div>
</template>

<style scoped>
.research-controls__scroll-region {
  /* Keep the full catalog discoverable while leaving the next section in view. */
  --capability-list-max-height: clamp(196px, 38dvh, 420px);
}

.research-controls {
  --controls-secondary: color-mix(in srgb, var(--text-main) 12%, var(--text-sub));
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0;
  border-radius: 0;
  border: none;
  background: transparent;
  box-shadow: none;
}

.research-controls__body {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: inherit;
}

.research-controls__header,
.research-controls__header-actions {
  display: flex;
  align-items: center;
}

.research-controls__header {
  justify-content: space-between;
  gap: 12px;
  margin-inline: 8px;
}

.research-controls__header-actions {
  gap: 10px;
  align-self: flex-start;
}

.research-controls__title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: -0.02em;
  line-height: 20px;
  color: var(--text-main);
}

.research-controls__access-notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 12px;
  border: 1px solid color-mix(in srgb, var(--academic-blue) 24%, var(--paper-border));
  border-radius: var(--radius-control);
  background: color-mix(in srgb, var(--academic-blue) 7%, var(--surface-card));
}

.research-controls__access-notice--accent {
  border-color: color-mix(in srgb, var(--academic-blue) 32%, var(--paper-border));
}

.research-controls__access-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.research-controls__access-copy strong {
  color: var(--text-main);
  font-size: 12px;
  font-weight: 650;
  line-height: 1.35;
}

.research-controls__access-copy span {
  color: var(--controls-secondary);
  font-size: 11px;
  line-height: 1.45;
}

.research-controls__access-action {
  flex: none;
  min-height: max(44px, var(--control-height));
  padding: 0 12px;
  border: 1px solid var(--academic-blue);
  border-radius: var(--radius-control);
  background: var(--academic-blue);
  color: var(--btn-text-primary);
  font-size: 12px;
  font-weight: 600;
}

.research-controls__close {
  border: 1px solid transparent;
  background: transparent;
  color: var(--controls-secondary);
  transition: background-color 160ms ease, color 160ms ease;
}

.research-controls__close {
  width: max(44px, var(--control-height));
  height: max(44px, var(--control-height));
  border-radius: var(--radius-control);
  font-size: 16px;
}

.research-controls button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
}

.research-controls__close:hover {
  border-color: transparent;
  background: var(--academic-surface);
  color: var(--academic-accent-strong);
}

@media (max-width: 768px) {
  .research-controls__scroll-region {
    --capability-list-max-height: clamp(176px, 34dvh, 320px);
  }

  .research-controls {
    gap: 12px;
    padding: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .research-controls__header {
    align-items: center;
  }

  .research-controls__header-actions {
    flex: none;
    align-self: center;
    justify-content: flex-end;
  }

  .research-controls__access-notice {
    align-items: stretch;
    flex-direction: column;
  }

  .research-controls__access-action {
    width: 100%;
  }
}

.research-controls__list {
  padding: 2px 0;
  margin: 0;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.research-controls__option {
  position: relative;
  isolation: isolate;
  display: flex;
  width: 100%;
  min-height: var(--control-height);
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-inline: 0;
  padding: 8px 0;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-main);
  font-size: 13px;
  line-height: 1.4;
  text-align: left;
}

.research-controls__option span {
  min-width: 0;
  overflow-wrap: anywhere;
}

.research-controls__option svg {
  flex: none;
}

.research-controls__preview {
  display: grid;
}
.research-controls__heading {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}
.research-controls__category,
.research-controls__search-toggle {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 0 4px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-sub);
  font-size: 12px;
}
.research-controls__search-toggle {
  min-width: 44px;
}
.research-controls__category svg,
.research-controls__search-toggle svg {
  width: 16px;
  height: 16px;
}
.research-controls__search-toggle:hover {
  background: var(--academic-surface);
}
.research-controls__empty {
  margin: 8px;
  color: var(--text-sub);
  font-size: 13px;
}

.research-controls__option::before {
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
.research-controls__option[aria-pressed='true'] {
  color: var(--academic-accent-strong);
}
.research-controls__option[aria-pressed='true']::before {
  background: var(--academic-surface);
  opacity: 1;
}
.research-controls__option:focus-visible::before {
  opacity: 1;
}

@media (hover: hover) and (pointer: fine) {
  .research-controls__option:hover:not(:disabled)::before {
    opacity: 1;
  }
}

.research-controls__option:disabled {
  opacity: 0.62;
  cursor: not-allowed;
}

.research-controls-frame--fill,
.research-controls-frame--fill .research-controls {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
}
.research-controls-frame--fill .research-controls {
  gap: 8px;
}
.research-controls-frame--fill .research-controls__body {
  flex: 1;
}

</style>
