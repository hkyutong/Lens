<script setup lang="ts">
import { t } from '@/locales'
import { computed, ref, watch } from 'vue'
import { useChatStore } from '@/store'
import {
  getAcademicEntityDisplayDescription,
  getAcademicEntityDisplayLabel,
  getAcademicEntityRawLabel,
  getAcademicEntitySelectorValue,
} from '@/utils/academicI18n'

interface Props {
  embedded?: boolean
  coreLabel?: string
  pluginLabel?: string
  corePlaceholder?: string
  pluginPlaceholder?: string
  pluginSearchPlaceholder?: string
  pluginArgsLabel?: string
  pluginArgsPlaceholder?: string
  groupLabel?: string
  infoLabel?: string
  showClose?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()
const chatStore = useChatStore()

const coreFunctions = computed(() => chatStore.academicCoreFunctions || [])
const activePlugin = computed(() => chatStore.currentAcademicPlugin)
const activeCore = computed(() => chatStore.currentAcademicCore)

const getCoreLabel = (core: any) => getAcademicEntityRawLabel(core)
const getCoreDisplayLabel = (core: any) => getAcademicEntityDisplayLabel(core)
const getPluginLabel = (plugin: any) => getAcademicEntityRawLabel(plugin)
const getPluginDisplayLabel = (plugin: any) => getAcademicEntityDisplayLabel(plugin)
const normalizePluginName = (name: string) =>
  String(name || '')
    .replace(/\s+/g, '')
    .replace(/latex/gi, 'latex')
    .toLowerCase()

const academicPluginOrder = [
  '论文速读',
  'PDF 批量总结',
  'PDF 深度理解',
  'Word 批量总结',
  'Arxiv摘要',
  'Arxiv 英文摘要',
  'LaTeX 摘要',
  'LaTeX 精准翻译',
  'LaTeX 英文润色',
  'LaTeX 中文润色',
  'LaTeX 高亮纠错',
]

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
    .filter((plugin: any) => {
      const label = getPluginLabel(plugin)
      const rawName = String(plugin?.name || '')
      const info = String(plugin?.info || '')
      const description = String(plugin?.description || '')
      const haystack = `${label} ${rawName} ${info} ${description}`
      if (!label) return false
      if (label.includes('中译英') || rawName.includes('中译英')) return false
      return !blockedPlugins.some(block => haystack.includes(block))
    })
    .map((plugin: any, index: number) => {
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

const showAdvanced = ref(false)
const groupFilter = ref('学术')
const hiddenPluginGroups = ['智能体']
const preferredGroups = ['学术', '对话', '编程']
const groupLabelMap: Record<string, string> = {
  学术: 'lens.academicPanel.groupAcademic',
  对话: 'lens.academicPanel.groupConversation',
  编程: 'lens.academicPanel.groupProgramming',
}

const pluginGroups = computed(() => {
  const groups = new Set<string>()
  pluginList.value.forEach(plugin => {
    const raw = String(plugin.group || '')
    raw.split('|').forEach(part => {
      const trimmed = part.trim()
      if (trimmed && !hiddenPluginGroups.includes(trimmed)) {
        groups.add(trimmed)
      }
    })
  })
  const filtered = preferredGroups.filter(group => groups.has(group))
  return filtered.length ? filtered : preferredGroups
})

const groupOptions = computed(() =>
  pluginGroups.value.map(group => ({
    value: group,
    label: groupLabelMap[group] ? t(groupLabelMap[group]) : group,
  }))
)

watch(
  pluginGroups,
  groups => {
    if (!groups.includes(groupFilter.value)) {
      groupFilter.value = groups[0] || '学术'
    }
  },
  { immediate: true }
)

watch(
  () => activePlugin.value,
  plugin => {
    if (plugin?.advancedArgs) {
      showAdvanced.value = true
    }
  },
  { immediate: true }
)

const matchesGroup = (plugin: any, group: string) => {
  if (!group) return true
  const raw = String(plugin.group || '')
  if (!raw) return false
  return raw
    .split('|')
    .map(part => part.trim())
    .filter(part => !hiddenPluginGroups.includes(part))
    .includes(group)
}

const filteredPlugins = computed(() => {
  const group = groupFilter.value.trim()
  let candidates = pluginList.value.filter(plugin => matchesGroup(plugin, group))
  if (!candidates.length) {
    candidates = pluginList.value
  }
  if (activePlugin.value && !candidates.some(plugin => plugin.name === activePlugin.value?.name)) {
    return [activePlugin.value, ...candidates]
  }
  return candidates
})

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

const MAX_PLUGIN_ARGS = 300
const DISALLOWED_PLUGIN_PATTERNS: RegExp[] = [
  /ignore\s+previous/i,
  /system\s+prompt/i,
  /developer\s+message/i,
  /jailbreak/i,
  /\bsudo\b/i,
  /rm\s+-rf/i,
  /\bcurl\b/i,
  /\bwget\b/i,
  /file:\/\//i,
  /https?:\/\//i,
  /\.\.[\/]/,
  /\/etc\//i,
  /\\\\\s*$/,
]

const sanitizePluginArgs = (value: string) => {
  if (!value) return ''
  let result = value
  DISALLOWED_PLUGIN_PATTERNS.forEach(pattern => {
    result = result.replace(pattern, '')
  })
  if (result.length > MAX_PLUGIN_ARGS) {
    result = result.slice(0, MAX_PLUGIN_ARGS)
  }
  return result.trim()
}

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

const pluginArgs = computed({
  get: () => chatStore.academicPluginArgs || '',
  set: (value: string) => chatStore.setAcademicPluginArgs(sanitizePluginArgs(value)),
})

const workflowLabel = computed(() => {
  return getAcademicEntityDisplayLabel(activePlugin.value || activeCore.value) ||
    t('lens.academicPanel.workflowFallbackLabel')
})

const workflowDescription = computed(() => {
  return (
    getAcademicEntityDisplayDescription(activePlugin.value || activeCore.value) ||
    t('lens.academicPanel.workflowFallbackDesc')
  )
})

const selectedKind = computed(() => {
  if (activePlugin.value) return t('lens.academicPanel.selectedKindTool')
  if (activeCore.value) return t('lens.academicPanel.selectedKindCore')
  return t('lens.academicPanel.selectedKindPending')
})

const quickPluginCandidates = computed(() => pluginList.value.slice(0, 4))
const quickCoreCandidates = computed(() => coreFunctions.value.slice(0, 4))

const isPluginArgsEnabled = computed(() => Boolean(activePlugin.value))
const pluginArgsPlaceholder = computed(() => {
  if (!activePlugin.value) return t('lens.academicPanel.customInstructionPlaceholderInactive')
  return props.pluginArgsPlaceholder || t('lens.academicPanel.customInstructionPlaceholder')
})

const selectQuickCore = (core: any) => {
  chatStore.setAcademicCore(core)
}

const selectQuickPlugin = (plugin: any) => {
  chatStore.setAcademicPlugin(plugin)
}
</script>

<template>
  <div class="w-full">
    <section class="research-controls">
      <div class="research-controls__header">
        <div>
          <template v-if="!props.embedded">
            <h3 class="research-controls__title">{{ t('lens.academicPanel.title') }}</h3>
            <p class="research-controls__subtitle">
              {{ t('lens.academicPanel.subtitle') }}
            </p>
          </template>
        </div>
        <div class="research-controls__header-actions">
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

      <div class="research-controls__overview">
        <div class="research-controls__overview-row">
          <span>{{ t('lens.academicPanel.modeLabel') }}</span>
          <strong>{{ t('lens.academicPanel.researchMode') }}</strong>
        </div>
        <div class="research-controls__overview-row">
          <span>{{ selectedKind }}</span>
          <strong>{{ workflowLabel }}</strong>
        </div>
        <div class="research-controls__overview-row">
          <span>{{ t('lens.academicPanel.advancedInstruction') }}</span>
          <strong>{{ pluginArgs ? t('lens.academicPanel.filled') : t('lens.academicPanel.empty') }}</strong>
        </div>
      </div>

      <div class="research-controls__grid">
        <div class="research-controls__field">
          <label>{{ props.coreLabel || t('lens.academicPanel.coreLabel') }}</label>
          <select v-model="selectedCore" class="research-controls__select">
            <option value="">{{ props.corePlaceholder || t('lens.academicPanel.corePlaceholder') }}</option>
            <option
              v-for="core in coreFunctions"
              :key="core.name"
              :value="getAcademicEntitySelectorValue(core)"
            >
              {{ getCoreDisplayLabel(core) }}
            </option>
          </select>
        </div>

        <div class="research-controls__field">
          <label>{{ props.pluginLabel || t('lens.academicPanel.pluginLabel') }}</label>
          <select v-model="selectedPlugin" class="research-controls__select">
            <option value="">{{ props.pluginPlaceholder || t('lens.academicPanel.pluginPlaceholder') }}</option>
            <option
              v-for="plugin in filteredPlugins"
              :key="plugin.name"
              :value="getAcademicEntitySelectorValue(plugin)"
              :title="getPluginDisplayLabel(plugin)"
            >
              {{ getPluginDisplayLabel(plugin) }}
            </option>
          </select>
        </div>
      </div>

      <div class="research-controls__field">
        <label>{{ props.groupLabel || t('lens.academicPanel.groupLabel') }}</label>
        <div class="research-controls__group-row">
          <select v-model="groupFilter" class="research-controls__select research-controls__select--compact">
            <option v-for="group in groupOptions" :key="group.value" :value="group.value">
              {{ group.label }}
            </option>
          </select>
          <button
            type="button"
            class="research-controls__advanced"
            @click="showAdvanced = !showAdvanced"
          >
            {{ showAdvanced ? t('lens.academicPanel.advancedCollapse') : t('lens.academicPanel.advancedExpand') }}
          </button>
        </div>
      </div>

      <div class="research-controls__presets">
        <div class="research-controls__preset-block">
          <div class="research-controls__preset-title">{{ t('lens.academicPanel.quickCoreTitle') }}</div>
          <div class="research-controls__chips">
            <button
              v-for="core in quickCoreCandidates"
              :key="core.name"
              type="button"
              class="research-controls__chip-btn"
              @click="selectQuickCore(core)"
            >
              {{ getCoreDisplayLabel(core) }}
            </button>
          </div>
        </div>
        <div class="research-controls__preset-block">
          <div class="research-controls__preset-title">{{ t('lens.academicPanel.quickToolTitle') }}</div>
          <div class="research-controls__chips">
            <button
              v-for="plugin in quickPluginCandidates"
              :key="plugin.name"
              type="button"
              class="research-controls__chip-btn"
              @click="selectQuickPlugin(plugin)"
            >
              {{ getPluginDisplayLabel(plugin) }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="showAdvanced" class="research-controls__advanced-panel">
        <label>{{ props.pluginArgsLabel || t('lens.academicPanel.customInstructionLabel') }}</label>
        <textarea
          v-model="pluginArgs"
          :disabled="!isPluginArgsEnabled"
          :placeholder="pluginArgsPlaceholder"
          class="research-controls__textarea"
          rows="4"
          maxlength="300"
        ></textarea>
        <p class="research-controls__hint">{{ t('lens.academicPanel.customInstructionHint') }}</p>
      </div>

      <div class="research-controls__workflow">
        <div class="research-controls__workflow-label">{{ t('lens.academicPanel.workflowLabel') }}</div>
        <div class="research-controls__workflow-title">{{ workflowLabel }}</div>
        <div class="research-controls__workflow-desc">
          {{ workflowDescription }}
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.research-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 0;
  border-radius: 0;
  border: none;
  background: transparent;
  box-shadow: var(--shadow-soft);
}

.research-controls__header,
.research-controls__header-actions,
.research-controls__group-row,
.research-controls__chips {
  display: flex;
  align-items: center;
}

.research-controls__header {
  justify-content: space-between;
  gap: 12px;
}

.research-controls__header-actions {
  gap: 10px;
  align-self: flex-start;
}

.research-controls__eyebrow,
.research-controls__workflow-label,
.research-controls__preset-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.research-controls__title {
  margin: 6px 0 0;
  font-size: 16px;
  line-height: 1.2;
  color: var(--text-main);
}

.research-controls__subtitle,
.research-controls__workflow-desc,
.research-controls__hint,
.research-controls__idle {
  margin: 8px 0 0;
  font-size: 11px;
  line-height: 1.55;
  color: var(--text-sub);
}

.research-controls__toggle,
.research-controls__close,
.research-controls__advanced,
.research-controls__chip-btn {
  border: 1px solid transparent;
  background: #eef2f6;
  color: var(--text-main);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    background 0.2s ease;
}

.research-controls__toggle,
.research-controls__advanced {
  border-radius: 9999px;
  min-height: 42px;
  padding: 0 14px;
  font-size: 11px;
  font-weight: 600;
}

.research-controls__toggle--active {
  background: rgba(53, 55, 64, 0.08);
  border-color: transparent;
  color: var(--text-main);
}

.research-controls__close {
  width: 30px;
  height: 30px;
  border-radius: 9999px;
  font-size: 16px;
}

.research-controls__chips {
  gap: 6px;
  flex-wrap: wrap;
}

.research-controls__overview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 2px 0 0;
  border-radius: 0;
  border: none;
  background: transparent;
}

.research-controls__overview-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: var(--ink-soft);
}

.research-controls__overview-row strong {
  color: var(--text-main);
  font-weight: 600;
  text-align: right;
}

.research-controls__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.research-controls__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.research-controls__field label {
  font-size: 11px;
  color: var(--ink-faint);
}

.research-controls__select,
.research-controls__textarea {
  width: 100%;
  border-radius: 14px;
  border: 1px solid rgba(53, 55, 64, 0.08);
  background: var(--surface-card);
  color: var(--text-main);
  padding: 10px 12px;
  font-size: 12px;
  outline: none;
}

.research-controls__select:focus,
.research-controls__textarea:focus {
  border-color: rgba(53, 55, 64, 0.16);
}

.research-controls__group-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: stretch;
  gap: 10px;
}

.research-controls__group-row .research-controls__select--compact {
  width: 100%;
  max-width: 164px;
  min-width: 0;
}

.research-controls__select {
  min-height: 42px;
  line-height: 1.2;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14' fill='none'%3E%3Cpath d='M3.5 5.25L7 8.75L10.5 5.25' stroke='%23353740' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 14px;
  padding-right: 36px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
}

.research-controls__presets {
  display: grid;
  gap: 10px;
}

.research-controls__preset-block {
  padding: 0;
  border-radius: 0;
  border: none;
  background: transparent;
}

.research-controls__preset-title {
  margin-bottom: 10px;
}

.research-controls__chip-btn {
  border-radius: 9999px;
  padding: 7px 10px;
  font-size: 11px;
}

.research-controls__chip-btn:hover,
.research-controls__toggle:hover,
.research-controls__advanced:hover,
.research-controls__close:hover {
  border-color: transparent;
  background: #e6ebf1;
}

.research-controls__workflow,
.research-controls__advanced-panel,
.research-controls__idle {
  padding: 4px 0 0;
  border-radius: 0;
  border: none;
  background: transparent;
}

.research-controls__workflow-title {
  margin-top: 8px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
}

@media (max-width: 768px) {
  .research-controls {
    gap: 14px;
    padding: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .research-controls__header {
    align-items: center;
  }

  .research-controls__header-actions,
  .research-controls__group-row,
  .research-controls__grid {
    width: 100%;
  }

  .research-controls__header-actions {
    justify-content: flex-end;
  }

  .research-controls__grid {
    grid-template-columns: 1fr;
  }

  .research-controls__group-row {
    grid-template-columns: 1fr;
  }

  .research-controls__group-row .research-controls__select--compact {
    max-width: none;
  }

  .research-controls__advanced,
  .research-controls__toggle {
    min-height: 40px;
    width: 100%;
    justify-content: center;
  }
}
</style>
