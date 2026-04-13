<script setup lang="ts">
import { t } from '@/locales'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAuthStore, useGlobalStoreWithOut, useChatStore } from '@/store'
import { DIALOG_TABS } from '@/store/modules/global'
import { computed, ref, watch } from 'vue'
import {
  getAcademicEntityDisplayDescription,
  getAcademicEntityDisplayLabel,
  getAcademicEntityRawLabel,
  getAcademicEntitySelectorValue,
} from '@/utils/academicI18n'
import { getAcademicWorkflowChainLabel } from '@/utils/academicWorkflow'

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
const authStore = useAuthStore()
const useGlobalStore = useGlobalStoreWithOut()
const { isMobile } = useBasicLayout()

const coreFunctions = computed(() => chatStore.academicCoreFunctions || [])
const activePlugin = computed(() => chatStore.currentAcademicPlugin)
const activeCore = computed(() => chatStore.currentAcademicCore)
const activeModelLabel = computed(() =>
  String(chatStore.preferredModel?.label || chatStore.activeModelName || '').trim()
)
const workflowEnabled = computed(() => Boolean(chatStore.academicWorkflowEnabled))
const workflowSteps = computed(() => chatStore.academicWorkflowSteps || [])
const workflowRunning = computed(() => Boolean(chatStore.academicWorkflowRunning))
const workflowMemberAvailable = computed(() => {
  const balance: any = authStore.userBalance || {}
  return (
    Number(balance.packageId || 0) > 0 ||
    (balance.expirationTime && new Date(balance.expirationTime) > new Date())
  )
})
const openMemberDialog = () => {
  if (isMobile.value) {
    useGlobalStore.updateMobileSettingsDialog(true, DIALOG_TABS.MEMBER)
  } else {
    useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.MEMBER)
  }
}

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
  if (workflowEnabled.value && workflowSteps.value.length) {
    return getAcademicWorkflowChainLabel(workflowSteps.value) || t('lens.workflow.empty')
  }
  return getAcademicEntityDisplayLabel(activePlugin.value || activeCore.value) ||
    t('lens.academicPanel.workflowFallbackLabel')
})

const workflowDescription = computed(() => {
  if (workflowEnabled.value && workflowSteps.value.length) {
    return t('lens.workflow.currentChainDesc')
  }
  return (
    getAcademicEntityDisplayDescription(activePlugin.value || activeCore.value) ||
    t('lens.academicPanel.workflowFallbackDesc')
  )
})

const selectedKind = computed(() => {
  if (workflowEnabled.value && workflowSteps.value.length) {
    return t('lens.workflow.currentChain')
  }
  if (activePlugin.value) return t('lens.academicPanel.selectedKindTool')
  if (activeCore.value) return t('lens.academicPanel.selectedKindCore')
  return t('lens.academicPanel.selectedKindPending')
})

const workflowOverviewChips = computed(() => {
  const chips: string[] = []
  chips.push(workflowEnabled.value ? t('lens.workflow.workflowMode') : t('lens.workflow.singleMode'))

  if (workflowEnabled.value) {
    chips.push(`${workflowSteps.value.length}/3 ${t('lens.workflow.stepsShort')}`)
    if (workflowRunning.value) {
      chips.push(t('lens.message.workflowStatusRunning'))
    } else if (workflowSteps.value.length) {
      chips.push(t('lens.message.workflowStatusPending'))
    } else {
      chips.push(t('lens.workflow.empty'))
    }
  } else if (activePlugin.value || activeCore.value) {
    chips.push(t('lens.message.workflowStatusDone'))
  } else {
    chips.push(t('lens.message.workflowStatusPending'))
  }

  return chips
})

const quickPluginCandidates = computed(() => pluginList.value.slice(0, 4))
const quickCoreCandidates = computed(() => coreFunctions.value.slice(0, 4))
const panelGuidance = computed(() => {
  if (workflowEnabled.value) {
    if (!workflowMemberAvailable.value) return t('lens.workflow.memberOnly')
    if (workflowSteps.value.length) return t('lens.workflow.currentChainDesc')
    return t('lens.workflow.empty')
  }
  if (activePlugin.value || activeCore.value) {
    return t('lens.academicPanel.selectedReadyHint')
  }
  return t('lens.academicPanel.workflowFallbackDesc')
})

const isPluginArgsEnabled = computed(() => Boolean(activePlugin.value))
const pluginArgsPlaceholder = computed(() => {
  if (!activePlugin.value) return t('lens.academicPanel.customInstructionPlaceholderInactive')
  return props.pluginArgsPlaceholder || t('lens.academicPanel.customInstructionPlaceholder')
})

const selectQuickCore = (core: any) => {
  if (workflowEnabled.value) {
    const nextIndex = workflowSteps.value.length
    if (nextIndex >= 3) return
    chatStore.addAcademicWorkflowStep({
      kind: 'core',
      name: String(core?.name || '').trim(),
      displayName: getAcademicEntityDisplayLabel(core),
    })
    return
  }
  chatStore.setAcademicCore(core)
}

const selectQuickPlugin = (plugin: any) => {
  if (workflowEnabled.value) {
    const nextIndex = workflowSteps.value.length
    if (nextIndex >= 3) return
    chatStore.addAcademicWorkflowStep({
      kind: 'plugin',
      name: String(plugin?.name || '').trim(),
      displayName: getAcademicEntityDisplayLabel(plugin),
    })
    return
  }
  chatStore.setAcademicPlugin(plugin)
}

const toggleWorkflowMode = (enabled: boolean) => {
  if (enabled && !workflowMemberAvailable.value) {
    openMemberDialog()
    return
  }
  if (enabled) {
    chatStore.setAcademicPlugin(undefined)
    chatStore.setAcademicCore(undefined)
    chatStore.setAcademicWorkflowEnabled(true)
    if (!workflowSteps.value.length) {
      chatStore.addAcademicWorkflowStep({ kind: 'plugin' })
    }
    return
  }
  chatStore.clearAcademicWorkflow()
}

const updateWorkflowStepKind = (index: number, kind: 'core' | 'plugin') => {
  chatStore.updateAcademicWorkflowStep(index, {
    kind,
    name: '',
    displayName: '',
    args: workflowSteps.value[index]?.args || '',
  })
}

const updateWorkflowStepSelection = (index: number, value: string) => {
  const step = workflowSteps.value[index]
  if (!step) return
  const list = step.kind === 'plugin' ? pluginList.value : coreFunctions.value
  const selected = list.find(
    item => getAcademicEntitySelectorValue(item) === value || item?.name === value
  )
  if (!selected) return
  chatStore.updateAcademicWorkflowStep(index, {
    name: String(selected?.name || '').trim(),
    displayName: getAcademicEntityDisplayLabel(selected),
  })
}

const updateWorkflowStepArgs = (index: number, value: string) => {
  chatStore.updateAcademicWorkflowStep(index, {
    args: value.trim().slice(0, 300),
  })
}

const addWorkflowStep = () => {
  if (!workflowMemberAvailable.value) {
    openMemberDialog()
    return
  }
  if (workflowSteps.value.length >= 3) return
  chatStore.addAcademicWorkflowStep({ kind: 'plugin' })
}

const workflowSourceOptions = (kind: 'core' | 'plugin') =>
  kind === 'plugin' ? filteredPlugins.value : coreFunctions.value
</script>

<template>
  <div class="w-full">
    <section class="research-controls">
      <div class="research-controls__header">
        <div>
          <template v-if="!props.embedded">
            <h3 class="research-controls__title">{{ t('lens.academicPanel.title') }}</h3>
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
          <strong>
            {{
              workflowEnabled
                ? t('lens.workflow.modeWorkflow')
                : t('lens.academicPanel.researchMode')
            }}
          </strong>
        </div>
        <div v-if="activeModelLabel" class="research-controls__overview-row">
          <span>{{ t('lens.academicPanel.modelLabel') }}</span>
          <strong>{{ activeModelLabel }}</strong>
        </div>
        <div class="research-controls__overview-row">
          <span>{{ selectedKind }}</span>
          <strong>{{ workflowLabel }}</strong>
        </div>
        <div v-if="showAdvanced || pluginArgs" class="research-controls__overview-row">
          <span>{{ t('lens.academicPanel.advancedInstruction') }}</span>
          <strong>{{ pluginArgs ? t('lens.academicPanel.filled') : t('lens.academicPanel.empty') }}</strong>
        </div>
        <div class="research-controls__overview-chips">
          <span v-for="chip in workflowOverviewChips" :key="chip" class="research-controls__overview-chip">
            {{ chip }}
          </span>
        </div>
        <p class="research-controls__overview-note">{{ panelGuidance }}</p>
      </div>

      <div class="research-controls__mode-switch">
        <button
          type="button"
          class="research-controls__toggle"
          :class="{ 'research-controls__toggle--active': !workflowEnabled }"
          @click="toggleWorkflowMode(false)"
        >
          {{ t('lens.workflow.singleMode') }}
        </button>
        <button
          type="button"
          class="research-controls__toggle"
          :class="{ 'research-controls__toggle--active': workflowEnabled }"
          @click="toggleWorkflowMode(true)"
        >
          {{ t('lens.workflow.workflowMode') }}
        </button>
      </div>

      <div v-if="!workflowEnabled" class="research-controls__grid">
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

      <div v-else class="research-controls__workflow-builder">
        <div class="research-controls__workflow-head">
          <div class="research-controls__workflow-head-copy">
            <span>{{ t('lens.workflow.builderTitle') }}</span>
            <small>{{ workflowSteps.length }}/3 {{ t('lens.workflow.stepsShort') }}</small>
          </div>
          <button
            v-if="workflowSteps.length < 3"
            type="button"
            class="research-controls__advanced"
            @click="addWorkflowStep"
          >
            {{ t('lens.workflow.addStep') }}
          </button>
        </div>

        <div v-if="!workflowMemberAvailable" class="research-controls__workflow-locked">
          <div>{{ t('lens.workflow.memberOnly') }}</div>
          <button type="button" class="research-controls__advanced" @click="openMemberDialog">
            {{ t('lens.workflow.upgradeNow') }}
          </button>
        </div>

        <div v-for="(step, index) in workflowSteps" :key="`${step.kind}-${index}`" class="research-controls__workflow-card">
          <div class="research-controls__workflow-row">
            <div class="research-controls__workflow-index">{{ index + 1 }}</div>
            <div class="research-controls__workflow-grid">
              <select
                :value="step.kind"
                class="research-controls__select"
                @change="updateWorkflowStepKind(index, ($event.target as HTMLSelectElement).value as 'core' | 'plugin')"
              >
                <option value="core">{{ t('lens.workflow.stepKindCore') }}</option>
                <option value="plugin">{{ t('lens.workflow.stepKindTool') }}</option>
              </select>
              <select
                :value="step.name"
                class="research-controls__select"
                @change="updateWorkflowStepSelection(index, ($event.target as HTMLSelectElement).value)"
              >
                <option value="">{{ t('lens.workflow.stepSelectPlaceholder') }}</option>
                <option
                  v-for="item in workflowSourceOptions(step.kind)"
                  :key="`${step.kind}-${getAcademicEntitySelectorValue(item)}`"
                  :value="getAcademicEntitySelectorValue(item)"
                >
                  {{
                    step.kind === 'plugin'
                      ? getPluginDisplayLabel(item)
                      : getCoreDisplayLabel(item)
                  }}
                </option>
              </select>
            </div>
          </div>
          <div v-if="step.displayName || step.name" class="research-controls__workflow-selection">
            {{ step.displayName || step.name }}
          </div>
          <textarea
            :value="step.args || ''"
            rows="2"
            class="research-controls__textarea"
            :placeholder="t('lens.workflow.stepArgsPlaceholder')"
            @input="updateWorkflowStepArgs(index, ($event.target as HTMLTextAreaElement).value)"
          />
          <div class="research-controls__workflow-actions">
            <button
              type="button"
              class="research-controls__advanced"
              :disabled="index === 0 || workflowRunning"
              @click="chatStore.moveAcademicWorkflowStep(index, -1)"
            >
              {{ t('lens.workflow.moveUp') }}
            </button>
            <button
              type="button"
              class="research-controls__advanced"
              :disabled="index === workflowSteps.length - 1 || workflowRunning"
              @click="chatStore.moveAcademicWorkflowStep(index, 1)"
            >
              {{ t('lens.workflow.moveDown') }}
            </button>
            <button
              type="button"
              class="research-controls__advanced"
              :disabled="workflowRunning"
              @click="chatStore.removeAcademicWorkflowStep(index)"
            >
              {{ t('lens.workflow.removeStep') }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="!workflowEnabled" class="research-controls__advanced-trigger">
        <button
          type="button"
          class="research-controls__advanced"
          @click="showAdvanced = !showAdvanced"
        >
          {{ showAdvanced ? t('lens.academicPanel.advancedCollapse') : t('lens.academicPanel.advancedExpand') }}
        </button>
      </div>

      <div v-if="!workflowEnabled" class="research-controls__presets">
        <div class="research-controls__preset-block">
          <div class="research-controls__preset-title">{{ t('lens.academicPanel.quickCoreTitle') }}</div>
          <div v-if="quickCoreCandidates.length" class="research-controls__chips">
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
          <div v-else class="research-controls__preset-empty">
            {{ t('lens.academicPanel.quickCoreEmpty') }}
          </div>
        </div>
        <div class="research-controls__preset-block">
          <div class="research-controls__preset-title">{{ t('lens.academicPanel.quickToolTitle') }}</div>
          <div v-if="quickPluginCandidates.length" class="research-controls__chips">
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
          <div v-else class="research-controls__preset-empty">
            {{ t('lens.academicPanel.quickToolEmpty') }}
          </div>
        </div>
      </div>

      <div v-if="showAdvanced && !workflowEnabled" class="research-controls__advanced-panel">
        <div class="research-controls__field">
          <label>{{ props.groupLabel || t('lens.academicPanel.groupLabel') }}</label>
          <select v-model="groupFilter" class="research-controls__select">
            <option v-for="group in groupOptions" :key="group.value" :value="group.value">
              {{ group.label }}
            </option>
          </select>
        </div>
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
  gap: 14px;
  padding: 0;
  border-radius: 0;
  border: none;
  background: transparent;
  box-shadow: none;
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

.research-controls__mode-switch,
.research-controls__workflow-head,
.research-controls__workflow-row,
.research-controls__workflow-actions {
  display: flex;
  align-items: center;
}

.research-controls__mode-switch {
  gap: 8px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
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
  letter-spacing: 0;
  text-transform: none;
  color: var(--ink-faint);
}

.research-controls__title {
  margin: 4px 0 0;
  font-size: 14px;
  line-height: 1.2;
  color: var(--text-main);
}

.research-controls__subtitle,
.research-controls__workflow-desc,
.research-controls__hint,
.research-controls__idle {
  margin: 8px 0 0;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-sub);
}

.research-controls__toggle,
.research-controls__close,
.research-controls__advanced,
.research-controls__chip-btn {
  border: 1px solid transparent;
  background: var(--surface-muted);
  color: var(--text-main);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    background 0.2s ease;
}

.research-controls__toggle,
.research-controls__advanced {
  display: inline-flex;
  align-items: center;
  justify-content: center;
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
  gap: 6px;
  padding: 14px;
  border-radius: 18px;
  border: 1px solid var(--paper-border);
  background: linear-gradient(180deg, var(--surface-card) 0%, var(--surface-panel) 100%);
}

.research-controls__overview-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 6px;
}

.research-controls__overview-chip {
  display: inline-flex;
  align-items: center;
  min-height: 26px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid var(--paper-border);
  background: var(--surface-muted);
  color: var(--text-sub);
  font-size: 11px;
  font-weight: 600;
}

.research-controls__overview-note {
  margin: 2px 0 0;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-sub);
}

.research-controls__workflow-builder {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.research-controls__workflow-head {
  justify-content: space-between;
  gap: 10px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
}

.research-controls__workflow-head-copy {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.research-controls__workflow-head-copy small {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-faint);
}

.research-controls__workflow-locked,
.research-controls__workflow-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  border: 1px solid var(--paper-border);
  border-radius: 18px;
  background: linear-gradient(180deg, var(--surface-card) 0%, var(--surface-panel) 100%);
  padding: 12px;
}

.research-controls__workflow-locked {
  color: var(--text-sub);
}

.research-controls__workflow-row {
  align-items: flex-start;
  gap: 10px;
}

.research-controls__workflow-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--btn-bg-primary);
  color: var(--btn-text-primary);
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.research-controls__workflow-grid {
  display: grid;
  flex: 1;
  grid-template-columns: 110px minmax(0, 1fr);
  gap: 8px;
}

.research-controls__workflow-actions {
  flex-wrap: wrap;
  gap: 8px;
}

.research-controls__workflow-selection {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-main);
  font-weight: 600;
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
  gap: 8px;
}

.research-controls__field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.research-controls__field label {
  font-size: 12px;
  color: var(--ink-faint);
}

.research-controls__select,
.research-controls__textarea {
  width: 100%;
  border-radius: 999px;
  border: 1px solid rgba(53, 55, 64, 0.08);
  background: var(--surface-card);
  color: var(--text-main);
  padding: 10px 12px;
  font-size: 12px;
  outline: none;
}

.research-controls__textarea {
  min-height: 88px;
  border-radius: 16px;
  resize: vertical;
}

.research-controls__select:focus,
.research-controls__textarea:focus {
  border-color: rgba(53, 55, 64, 0.16);
}

.research-controls__advanced-trigger {
  display: flex;
  justify-content: flex-start;
}

.research-controls__select {
  min-height: 42px;
  line-height: 1.2;
  appearance: none;
  -webkit-appearance: none;
  -moz-appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14' fill='none'%3E%3Cpath d='M3.5 5.25L7 8.75L10.5 5.25' stroke='%23676767' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 12px center;
  background-size: 14px;
  padding-right: 36px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.56);
}

.research-controls__presets {
  display: grid;
  gap: 8px;
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

.research-controls__preset-empty {
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px dashed var(--paper-border);
  background: var(--surface-muted);
  color: var(--text-sub);
  font-size: 11px;
  line-height: 1.5;
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
  background: var(--surface-muted);
}

.research-controls__workflow,
.research-controls__advanced-panel,
.research-controls__idle {
  padding: 14px;
  border-radius: 18px;
  border: 1px solid var(--paper-border);
  background: linear-gradient(180deg, var(--surface-card) 0%, var(--surface-panel) 100%);
}

.research-controls__workflow-title {
  margin-top: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

html.dark .research-controls__select {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 14 14' fill='none'%3E%3Cpath d='M3.5 5.25L7 8.75L10.5 5.25' stroke='%2399A4B8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  box-shadow: none;
}

html.dark .research-controls__overview,
html.dark .research-controls__workflow-locked,
html.dark .research-controls__workflow-card,
html.dark .research-controls__workflow,
html.dark .research-controls__advanced-panel,
html.dark .research-controls__idle {
  border-color: rgba(255, 255, 255, 0.08) !important;
  background: linear-gradient(180deg, rgba(18, 24, 34, 0.94) 0%, rgba(14, 19, 28, 0.98) 100%) !important;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.015) !important;
}

html.dark .research-controls__overview-chip {
  border-color: rgba(255, 255, 255, 0.08) !important;
  background: rgba(255, 255, 255, 0.05) !important;
  color: rgba(238, 242, 248, 0.82) !important;
}

html.dark .research-controls__overview-note,
html.dark .research-controls__preset-empty {
  color: rgba(223, 229, 240, 0.74) !important;
}

html.dark .research-controls__preset-empty {
  border-color: rgba(255, 255, 255, 0.08) !important;
  background: rgba(255, 255, 255, 0.04) !important;
}

html.dark .research-controls__toggle--active {
  background: rgba(255, 255, 255, 0.1) !important;
}

html.dark .research-controls__workflow-selection {
  color: rgba(238, 242, 248, 0.92) !important;
}

@media (max-width: 768px) {
  .research-controls {
    gap: 12px;
    padding: 0;
    border-radius: 0;
    box-shadow: none;
  }

  .research-controls__header {
    align-items: center;
  }

  .research-controls__header-actions,
  .research-controls__grid {
    width: 100%;
  }

  .research-controls__header-actions {
    justify-content: flex-end;
  }

  .research-controls__grid {
    grid-template-columns: 1fr;
  }

  .research-controls__advanced,
  .research-controls__toggle {
    min-height: 40px;
    width: 100%;
    justify-content: center;
  }
}
</style>
