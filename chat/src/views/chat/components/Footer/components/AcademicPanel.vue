<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useChatStore } from '@/store'

interface Props {
  coreLabel?: string
  pluginLabel?: string
  corePlaceholder?: string
  pluginPlaceholder?: string
  pluginSearchPlaceholder?: string
  pluginArgsLabel?: string
  pluginArgsPlaceholder?: string
  groupLabel?: string
  groupPlaceholder?: string
  infoLabel?: string
  showClose?: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
  close: []
}>()
const chatStore = useChatStore()

const academicMode = computed(() => chatStore.academicMode)
const coreFunctions = computed(() => chatStore.academicCoreFunctions || [])
const activePlugin = computed(() => chatStore.currentAcademicPlugin)
const activeCore = computed(() => chatStore.currentAcademicCore)

const getCoreLabel = (core: any) => String(core?.displayName || core?.name || '').trim()
const getPluginLabel = (plugin: any) => String(plugin?.displayName || plugin?.name || '').trim()
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
const preferredGroups = ['学术', '对话', '智能体', '编程']

const pluginGroups = computed(() => {
  const groups = new Set<string>()
  pluginList.value.forEach(plugin => {
    const raw = String(plugin.group || '')
    raw.split('|').forEach(part => {
      const trimmed = part.trim()
      if (trimmed) groups.add(trimmed)
    })
  })
  const filtered = preferredGroups.filter(group => groups.has(group))
  return filtered.length ? filtered : preferredGroups
})

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
    .includes(group)
}

const filteredPlugins = computed(() => {
  const group = groupFilter.value.trim()
  let candidates = pluginList.value.filter(plugin => matchesGroup(plugin, group))
  if (!candidates.length && pluginList.value.length) {
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
  get: () => getCoreLabel(activeCore.value) || '',
  set: (value: string) => {
    if (!value) {
      chatStore.setAcademicCore(undefined)
      return
    }
    const selected = coreFunctions.value.find(
      core => getCoreLabel(core) === value || core.name === value
    )
    chatStore.setAcademicCore(selected)
  },
})

const selectedPlugin = computed({
  get: () => getPluginLabel(activePlugin.value) || '',
  set: (value: string) => {
    if (!value) {
      chatStore.setAcademicPlugin(undefined)
      return
    }
    const selected = pluginList.value.find(
      plugin => getPluginLabel(plugin) === value || plugin.name === value
    )
    chatStore.setAcademicPlugin(selected)
  },
})

const pluginArgs = computed({
  get: () => chatStore.academicPluginArgs || '',
  set: (value: string) => chatStore.setAcademicPluginArgs(sanitizePluginArgs(value)),
})

const workflowLabel = computed(() => {
  return (
    activePlugin.value?.displayName ||
    activePlugin.value?.name ||
    activeCore.value?.displayName ||
    activeCore.value?.name ||
    '未配置研究流程'
  )
})

const workflowDescription = computed(() => {
  return (
    activePlugin.value?.info ||
    activePlugin.value?.description ||
    activeCore.value?.description ||
    '先启用研究模式，再选择一个核心能力或高级插件。'
  )
})

const selectedKind = computed(() => {
  if (activePlugin.value) return '高级插件'
  if (activeCore.value) return '核心能力'
  return '待配置'
})

const quickPluginCandidates = computed(() => pluginList.value.slice(0, 4))
const quickCoreCandidates = computed(() => coreFunctions.value.slice(0, 4))

const isPluginArgsEnabled = computed(() => Boolean(activePlugin.value))
const pluginArgsPlaceholder = computed(() => {
  if (!activePlugin.value) return '选择插件后填写'
  return props.pluginArgsPlaceholder || '例如：不要翻译 Agent、基线模型等专业术语'
})

const toggleResearchMode = () => {
  chatStore.setAcademicMode(!academicMode.value)
}

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
          <div class="research-controls__eyebrow">Research Controls</div>
          <h3 class="research-controls__title">研究控制栏</h3>
          <p class="research-controls__subtitle">
            把研究模式、核心能力、高级插件和自定义要求统一放在一个持续可见的工作区。
          </p>
        </div>
        <div class="research-controls__header-actions">
          <button
            type="button"
            class="research-controls__toggle"
            :class="{ 'research-controls__toggle--active': academicMode }"
            @click="toggleResearchMode"
          >
            {{ academicMode ? '研究模式已启用' : '启用研究模式' }}
          </button>
          <button
            v-if="props.showClose"
            type="button"
            class="research-controls__close"
            aria-label="关闭研究控制栏"
            @click="emit('close')"
          >
            ×
          </button>
        </div>
      </div>

      <div class="research-controls__summary">
        <span class="research-chip" :class="{ 'research-chip-active': academicMode }">
          {{ academicMode ? 'Research Mode' : 'Idle' }}
        </span>
        <span class="research-chip">{{ selectedKind }}：{{ workflowLabel }}</span>
        <span class="research-chip">分组：{{ groupFilter }}</span>
        <span class="research-chip">高级指令：{{ pluginArgs ? '已填写' : '未填写' }}</span>
      </div>

      <div class="research-controls__grid">
        <div class="research-controls__field">
          <label>{{ props.coreLabel || '核心能力' }}</label>
          <select v-model="selectedCore" class="research-controls__select">
            <option value="">{{ props.corePlaceholder || '不启用' }}</option>
            <option v-for="core in coreFunctions" :key="core.name" :value="getCoreLabel(core)">
              {{ getCoreLabel(core) }}
            </option>
          </select>
        </div>

        <div class="research-controls__field">
          <label>{{ props.pluginLabel || '高级插件' }}</label>
          <select v-model="selectedPlugin" class="research-controls__select">
            <option value="">{{ props.pluginPlaceholder || '不启用' }}</option>
            <option
              v-for="plugin in filteredPlugins"
              :key="plugin.name"
              :value="getPluginLabel(plugin)"
              :title="getPluginLabel(plugin)"
            >
              {{ getPluginLabel(plugin) }}
            </option>
          </select>
        </div>
      </div>

      <div class="research-controls__field">
        <label>{{ props.groupLabel || '插件分组' }}</label>
        <div class="research-controls__group-row">
          <select v-model="groupFilter" class="research-controls__select">
            <option v-for="group in pluginGroups" :key="group" :value="group">
              {{ group }}
            </option>
          </select>
          <button
            type="button"
            class="research-controls__advanced"
            @click="showAdvanced = !showAdvanced"
          >
            {{ showAdvanced ? '收起高级设置' : '高级设置' }}
          </button>
        </div>
      </div>

      <div class="research-controls__presets">
        <div class="research-controls__preset-block">
          <div class="research-controls__preset-title">高频核心能力</div>
          <div class="research-controls__chips">
            <button
              v-for="core in quickCoreCandidates"
              :key="core.name"
              type="button"
              class="research-controls__chip-btn"
              @click="selectQuickCore(core)"
            >
              {{ getCoreLabel(core) }}
            </button>
          </div>
        </div>
        <div class="research-controls__preset-block">
          <div class="research-controls__preset-title">高频研究插件</div>
          <div class="research-controls__chips">
            <button
              v-for="plugin in quickPluginCandidates"
              :key="plugin.name"
              type="button"
              class="research-controls__chip-btn"
              @click="selectQuickPlugin(plugin)"
            >
              {{ getPluginLabel(plugin) }}
            </button>
          </div>
        </div>
      </div>

      <div v-if="showAdvanced" class="research-controls__advanced-panel">
        <label>{{ props.pluginArgsLabel || '自定义指令' }}</label>
        <textarea
          v-model="pluginArgs"
          :disabled="!isPluginArgsEnabled"
          :placeholder="pluginArgsPlaceholder"
          class="research-controls__textarea"
          rows="4"
          maxlength="300"
        ></textarea>
        <p class="research-controls__hint">仅在需要约束术语、输出格式或翻译策略时填写。</p>
      </div>

      <div class="research-controls__workflow">
        <div class="research-controls__workflow-label">当前工作流</div>
        <div class="research-controls__workflow-title">{{ workflowLabel }}</div>
        <div class="research-controls__workflow-desc">
          {{ workflowDescription }}
        </div>
      </div>

      <div v-if="!academicMode" class="research-controls__idle">
        研究模式关闭时，你仍然可以先配置流程；一旦选择核心能力或高级插件，会自动进入研究模式。
      </div>
    </section>
  </div>
</template>

<style scoped>
.research-controls {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  border-radius: 28px;
  border: 1px solid var(--paper-border);
  background: var(--paper-bg);
  box-shadow: var(--shadow-panel);
  backdrop-filter: blur(16px);
}

.research-controls__header,
.research-controls__header-actions,
.research-controls__group-row,
.research-controls__summary,
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
  font-size: 22px;
  line-height: 1.2;
  color: var(--text-main);
}

.research-controls__subtitle,
.research-controls__workflow-desc,
.research-controls__hint,
.research-controls__idle {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ink-soft);
}

.research-controls__toggle,
.research-controls__close,
.research-controls__advanced,
.research-controls__chip-btn {
  border: 1px solid var(--border-color);
  background: var(--surface-muted);
  color: var(--text-main);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    background 0.2s ease;
}

.research-controls__toggle,
.research-controls__advanced {
  border-radius: 9999px;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 600;
}

.research-controls__toggle--active {
  background: var(--accent-soft);
  border-color: rgba(29, 78, 216, 0.18);
  color: var(--accent);
}

.research-controls__close {
  width: 34px;
  height: 34px;
  border-radius: 9999px;
  font-size: 18px;
}

.research-controls__summary,
.research-controls__chips {
  gap: 8px;
  flex-wrap: wrap;
}

.research-controls__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
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
  border-radius: 18px;
  border: 1px solid var(--border-color);
  background: var(--surface-muted);
  color: var(--text-main);
  padding: 12px 14px;
  font-size: 14px;
  outline: none;
}

.research-controls__select:focus,
.research-controls__textarea:focus {
  border-color: var(--accent);
}

.research-controls__group-row {
  gap: 10px;
}

.research-controls__group-row .research-controls__select {
  flex: 1;
}

.research-controls__presets {
  display: grid;
  gap: 12px;
}

.research-controls__preset-block {
  padding: 14px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background: var(--surface-muted);
}

.research-controls__preset-title {
  margin-bottom: 10px;
}

.research-controls__chip-btn {
  border-radius: 9999px;
  padding: 8px 12px;
  font-size: 12px;
}

.research-controls__chip-btn:hover,
.research-controls__toggle:hover,
.research-controls__advanced:hover,
.research-controls__close:hover {
  transform: translateY(-1px);
  border-color: rgba(29, 78, 216, 0.24);
}

.research-controls__workflow,
.research-controls__advanced-panel,
.research-controls__idle {
  padding: 14px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background: var(--surface-muted);
}

.research-controls__workflow-title {
  margin-top: 8px;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-main);
}

@media (max-width: 768px) {
  .research-controls {
    padding: 18px;
    border-radius: 24px;
  }

  .research-controls__header {
    flex-direction: column;
    align-items: flex-start;
  }

  .research-controls__header-actions,
  .research-controls__group-row,
  .research-controls__grid {
    width: 100%;
  }

  .research-controls__grid {
    grid-template-columns: 1fr;
  }

  .research-controls__group-row {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
