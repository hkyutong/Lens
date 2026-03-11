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
const getCoreLabel = (core: any) => String(core?.displayName || core?.name || '').trim()

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
const normalizePluginName = (name: string) =>
  String(name || '')
    .replace(/\s+/g, '')
    .replace(/latex/gi, 'latex')
    .toLowerCase()
const getPluginLabel = (plugin: any) => String(plugin?.displayName || plugin?.name || '').trim()
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
    [normalizePluginName('Arxiv摘要')]: 'Arxiv摘要',
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
      '手动指定源代码文件类型。自定义指令用,隔开, *代表通配符, 加^代表不匹配; 空代表全部匹配。例如: "*.c, ^*.cpp, .toml"',
    [normalizePluginName('Arxiv摘要')]: '读取并摘要Arxiv论文，可供下载（先输入编号，如1812.10695）',
    [normalizePluginName('Arxiv论文下载')]:
      '读取并摘要Arxiv论文，可供下载（先输入编号，如1812.10695）',
    [normalizePluginName('读取并摘要Arxiv论文，可供下载（先输入编号，如1812.10695）')]:
      '读取并摘要Arxiv论文，可供下载（先输入编号，如1812.10695）',
    [normalizePluginName('Arxiv精准翻译')]:
      "可自定义翻译要求, 解决部分词汇翻译不准确的问题。 例如当单词'Chair'翻译不准确时, 打开高级设置 - 自定义指令：请把单词'Chair'翻译为'系主任'",
    [normalizePluginName('Arxiv英文摘要')]:
      "可自定义翻译要求, 解决部分词汇翻译不准确的问题。 例如当单词'Chair'翻译不准确时, 打开高级设置 - 自定义指令：请把单词'Chair'翻译为'系主任'",
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
      const label = getPluginLabel(cloned)
      const normalized = normalizePluginName(label)
      if (renameMap[normalized]) {
        cloned.displayName = renameMap[normalized]
      } else if (normalized.includes('注释python项目')) {
        cloned.displayName = '注释整个Python项目'
      } else if (
        normalized.includes('解析项目源代码') &&
        (normalized.includes('手动指定') || normalized.includes('筛选'))
      ) {
        cloned.displayName = '解析项目源代码（自定义文件类型）'
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
const activePlugin = computed(() => chatStore.currentAcademicPlugin)
const activeCore = computed(() => chatStore.currentAcademicCore)

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
      plugins.some(plugin => {
        const pluginName = normalizePluginName(getPluginLabel(plugin) || plugin?.name)
        const activeName = normalizePluginName(
          getPluginLabel(activePlugin.value) || activePlugin.value?.name
        )
        return pluginName && activeName && pluginName === activeName
      })
    if (!hasPlugin) {
      chatStore.setAcademicPlugin(undefined)
    }

    const hasCore =
      !activeCore.value ||
      cores.some(core => {
        const coreName = String(core?.displayName || core?.name || '')
          .trim()
          .toLowerCase()
        const activeName = String(activeCore.value?.displayName || activeCore.value?.name || '')
          .trim()
          .toLowerCase()
        return coreName && activeName && coreName === activeName
      })
    if (!hasCore) {
      chatStore.setAcademicCore(undefined)
    }
  },
  { immediate: true }
)

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

const isPluginArgsEnabled = computed(() => Boolean(activePlugin.value))
const pluginArgsPlaceholder = computed(() => {
  if (!activePlugin.value) return '选择插件后填写'
  return "可选：补充要求，例如：请把单词'Chair'翻译为'系主任'"
})

const getPluginDisplayName = (plugin: any) => getPluginLabel(plugin)
const formatPluginOption = (plugin: any) => {
  const name = String(getPluginDisplayName(plugin))
  if (name.length > 20) return name.slice(0, 20) + '…'
  return name
}
</script>

<template>
  <div v-if="academicMode" class="w-full px-1 pt-3">
    <div
      class="rounded-[22px] border border-black/5 bg-white px-4 py-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.6)] dark:bg-[#080808] dark:border-white/10 dark:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.35)] max-h-[520px] overflow-y-auto"
    >
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <div class="text-sm font-semibold text-[#080808] dark:text-white">学术插件</div>
        </div>
        <div class="flex items-center gap-2">
          <span
            class="px-3 py-1 rounded-full text-[10px] font-medium whitespace-nowrap"
            :class="
              activePlugin || activeCore
                ? 'bg-[#f2f2f2] text-[#080808]'
                : 'bg-[#f2f2f2] text-[#080808]'
            "
          >
            {{ activePlugin || activeCore ? '已启用' : '未启用' }}
          </span>
          <button
            v-if="props.showClose"
            type="button"
            class="flex h-7 w-7 items-center justify-center rounded-full border border-[#d9d9de] bg-white/95 text-[15px] leading-none text-[#8f8f98] shadow-sm transition hover:text-[#080808] dark:border-white/10 dark:bg-[#121212]/95 dark:text-white/55 dark:hover:text-white"
            aria-label="关闭学术插件面板"
            @click="emit('close')"
          >
            ×
          </button>
        </div>
      </div>

      <div class="mt-6 grid gap-3 md:grid-cols-2">
        <div class="flex flex-col gap-2">
          <label class="text-xs text-gray-500 dark:text-gray-400">
            {{ props.coreLabel || '核心能力' }}
          </label>
          <select
            v-model="selectedCore"
            class="w-full rounded-2xl border border-[#f2f2f2] bg-white px-3 py-2 text-sm text-[#080808] shadow-sm transition focus:border-[#080808] focus:outline-none dark:border-white/10 dark:bg-[#080808] dark:text-white truncate"
          >
            <option value="">{{ props.corePlaceholder || '不启用' }}</option>
            <option v-for="core in coreFunctions" :key="core.name" :value="getCoreLabel(core)">
              {{ getCoreLabel(core) }}
            </option>
          </select>
        </div>

        <div class="flex flex-col gap-2">
          <label class="text-xs text-gray-500 dark:text-gray-400">
            {{ props.pluginLabel || '高级插件' }}
          </label>
          <select
            v-model="selectedPlugin"
            class="w-full rounded-2xl border border-[#f2f2f2] bg-white px-3 py-2 text-sm text-[#080808] shadow-sm transition focus:border-[#080808] focus:outline-none dark:border-white/10 dark:bg-[#080808] dark:text-white truncate"
          >
            <option value="">{{ props.pluginPlaceholder || '不启用' }}</option>
            <option
              v-for="plugin in filteredPlugins"
              :key="plugin.name"
              :value="getPluginDisplayName(plugin)"
              :title="getPluginDisplayName(plugin)"
            >
              {{ formatPluginOption(plugin) }}
            </option>
          </select>
        </div>
      </div>

      <div class="mt-3 grid gap-3 md:grid-cols-2">
        <div class="flex flex-col gap-2">
          <label class="text-xs text-gray-500 dark:text-gray-400">
            {{ props.groupLabel || '插件分组' }}
          </label>
          <select
            v-model="groupFilter"
            class="w-full rounded-2xl border border-[#f2f2f2] bg-white px-3 py-2 text-sm text-[#080808] shadow-sm transition focus:border-[#080808] focus:outline-none dark:border-white/10 dark:bg-[#080808] dark:text-white truncate"
          >
            <option v-for="group in pluginGroups" :key="group" :value="group">
              {{ group }}
            </option>
          </select>
        </div>
        <div class="flex items-end justify-end">
          <button type="button" class="btn-pill btn-sm" @click="showAdvanced = !showAdvanced">
            {{ showAdvanced ? '收起高级设置' : '高级设置' }}
          </button>
        </div>
      </div>

      <div v-if="showAdvanced" class="mt-3 space-y-3 pr-1">
        <div>
          <label class="text-xs text-gray-500 dark:text-gray-400"> 自定义指令 </label>
          <textarea
            v-model="pluginArgs"
            :disabled="!isPluginArgsEnabled"
            :class="[
              'mt-2 w-full min-h-[88px] resize-none rounded-2xl border border-[#f2f2f2] bg-white px-3 py-2 text-sm text-[#080808] shadow-sm transition focus:border-[#080808] focus:outline-none dark:border-white/10 dark:bg-[#080808] dark:text-white',
              !isPluginArgsEnabled && 'opacity-60 cursor-not-allowed',
            ]"
            :placeholder="pluginArgsPlaceholder"
            rows="3"
            maxlength="300"
          ></textarea>
        </div>
        <p class="mt-2 text-[11px] text-gray-400 dark:text-gray-500">仅在需要补充要求时填写。</p>
      </div>

      <div v-if="activePlugin || activeCore" class="mt-4 flex flex-wrap gap-2 text-xs">
        <span
          class="rounded-full bg-[#f2f2f2] px-3 py-1 text-[#080808] dark:bg-white/10 dark:text-white"
        >
          {{ activePlugin ? '插件' : '核心能力' }}
        </span>
        <span
          class="rounded-full bg-[#f2f2f2] px-3 py-1 text-[#080808] dark:bg-white/10 dark:text-white"
        >
          {{
            activePlugin?.displayName ||
            activePlugin?.name ||
            activeCore?.displayName ||
            activeCore?.name ||
            '未命名'
          }}
        </span>
        <span
          v-if="activePlugin?.group"
          class="rounded-full bg-[#f2f2f2] px-3 py-1 text-[#080808] dark:bg-white/10 dark:text-white"
        >
          {{ activePlugin.group }}
        </span>
        <span
          v-if="activePlugin?.advancedArgs"
          class="rounded-full bg-[#f2f2f2] px-3 py-1 text-[#080808] dark:bg-white/10 dark:text-white"
        >
          高级参数
        </span>
      </div>

      <div
        v-if="
          activePlugin?.info || activePlugin?.description || activeCore?.name || activePlugin?.name
        "
        class="mt-3 text-xs text-gray-500"
      >
        {{ props.infoLabel || '说明' }}:
        {{
          activePlugin?.info ||
          activePlugin?.description ||
          activeCore?.displayName ||
          activeCore?.name ||
          ''
        }}
      </div>
      <div v-if="activePlugin?.argsReminder" class="mt-2 text-xs text-gray-500">
        {{ activePlugin.argsReminder }}
      </div>
    </div>
  </div>
</template>
