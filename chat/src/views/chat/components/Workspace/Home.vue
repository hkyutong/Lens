<script setup lang="ts">
import { t } from '@/locales'
import { useAuthStore, useChatStore } from '@/store'
import { computed, inject, nextTick } from 'vue'

type StarterTask = {
  id: string
  title: string
  prompt: string
  mode: 'core' | 'plugin'
  selectorGroups: string[][]
}

const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>

const authStore = useAuthStore()
const chatStore = useChatStore()

const starterTasks = computed<StarterTask[]>(() => [
  {
    id: 'paper-summary',
    title: t('lens.workspace.starterPaperSummary'),
    prompt: t('lens.workspace.starterPaperSummaryPrompt'),
    mode: 'plugin',
    selectorGroups: [
      ['论文速读'],
      ['pdf', '深度理解'],
      ['pdf', '批量总结'],
    ],
  },
  {
    id: 'english-polish',
    title: t('lens.workspace.starterEnglishPolish'),
    prompt: t('lens.workspace.starterEnglishPolishPrompt'),
    mode: 'core',
    selectorGroups: [['英文润色']],
  },
  {
    id: 'latex-translation',
    title: t('lens.workspace.starterLatexTranslation'),
    prompt: t('lens.workspace.starterLatexTranslationPrompt'),
    mode: 'plugin',
    selectorGroups: [
      ['latex', '精准翻译'],
      ['latex', '翻译'],
    ],
  },
  {
    id: 'code-explain',
    title: t('lens.workspace.starterCodeExplain'),
    prompt: t('lens.workspace.starterCodeExplainPrompt'),
    mode: 'core',
    selectorGroups: [
      ['学术型代码解释'],
      ['代码解释'],
    ],
  },
])

const emit = defineEmits<{
  (e: 'import'): void
}>()

const hasProjects = computed(() => (chatStore.groupList || []).length > 0)
const activeWorkflowLabel = computed(() =>
  String(
    chatStore.currentAcademicPlugin?.displayName ||
      chatStore.currentAcademicPlugin?.name ||
      chatStore.currentAcademicCore?.displayName ||
      chatStore.currentAcademicCore?.name ||
      ''
  )
)

const requireLogin = () => {
  if (authStore.isLogin) return true
  authStore.setLoginDialog(true)
  return false
}

const handleCreate = async () => {
  if (!requireLogin()) return
  await createNewChatGroup()
}

const handleImport = async () => {
  if (!requireLogin()) return
  chatStore.setAcademicMode(true)
  emit('import')
}

const normalizeText = (value: any) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')

const getSelectorText = (item: any) =>
  `${item?.displayName || ''} ${item?.name || ''} ${item?.originName || ''}`

const findMatchingSelector = (list: any[], selectorGroups: string[][]) => {
  for (const selectors of selectorGroups) {
    const matched = list.find(item => {
      const haystack = normalizeText(getSelectorText(item))
      return selectors.every(selector => haystack.includes(normalizeText(selector)))
    })
    if (matched) return matched
  }
  return undefined
}

const ensureAcademicData = async () => {
  if (!chatStore.academicCoreFunctions?.length) {
    await chatStore.queryAcademicCoreFunctions()
  }
  if (!chatStore.academicPluginList?.length) {
    await chatStore.queryAcademicPluginList()
  }
}

const isStarterActive = (task: StarterTask) => {
  const workflowLabel = normalizeText(activeWorkflowLabel.value)
  if (!workflowLabel) return false
  return task.selectorGroups.some(selectors =>
    selectors.every(selector => workflowLabel.includes(normalizeText(selector)))
  )
}

const applyStarterTask = async (task: StarterTask) => {
  await ensureAcademicData()
  chatStore.setAcademicMode(true)

  if (task.mode === 'core') {
    chatStore.setAcademicPlugin(undefined)
    chatStore.setAcademicCore(undefined)
    const matchedCore = findMatchingSelector(
      chatStore.academicCoreFunctions || [],
      task.selectorGroups
    )
    if (matchedCore) {
      chatStore.setAcademicCore(matchedCore)
    }
  } else {
    chatStore.setAcademicCore(undefined)
    chatStore.setAcademicPlugin(undefined)
    const matchedPlugin = findMatchingSelector(
      chatStore.academicPluginList || [],
      task.selectorGroups
    )
    if (matchedPlugin) {
      chatStore.setAcademicPlugin(matchedPlugin)
    }
  }

  chatStore.setPrompt(task.prompt)
  await nextTick()
  const composer = document.getElementById('workspace-composer') as HTMLTextAreaElement | null
  composer?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  })
  composer?.focus()
}
</script>

<template>
  <section class="workspace-home">
    <div class="workspace-home__shell">
      <div class="workspace-home__intro">
        <div class="workspace-home__intro-title">
          {{ hasProjects ? t('lens.workspace.introWithProjects') : t('lens.workspace.introFirstUse') }}
        </div>
        <div class="workspace-home__intro-desc">
          {{ t('lens.workspace.introDesc') }}
        </div>
      </div>

      <div v-if="!hasProjects" class="workspace-home__empty-actions">
        <button type="button" class="btn btn-secondary btn-md rounded-full" @click="handleImport">
          {{ t('lens.workspace.importData') }}
        </button>
        <button type="button" class="btn btn-primary btn-md rounded-full" @click="handleCreate">
          {{ t('lens.sidebar.newProject') }}
        </button>
      </div>

      <div class="workspace-home__guide">
        <div class="workspace-home__starter-title">{{ t('lens.workspace.starterTitle') }}</div>
        <div class="workspace-home__starter-grid">
          <button
            v-for="item in starterTasks"
            :key="item.id"
            type="button"
            class="workspace-home__starter-btn"
            :class="{ 'workspace-home__starter-btn--active': isStarterActive(item) }"
            @click="applyStarterTask(item)"
          >
            {{ item.title }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.workspace-home {
  padding: 0;
}

.workspace-home__shell {
  min-height: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  overflow: visible;
  padding-top: 12px;
}

.workspace-home__intro {
  max-width: 640px;
  padding: 0 0 20px;
}

.workspace-home__intro-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-main);
}

.workspace-home__intro-desc {
  margin-top: 6px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-sub);
}

.workspace-home__empty-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 0 0 20px;
}

.workspace-home__guide {
  padding: 2px 0 22px;
}

.workspace-home__guide-title,
.workspace-home__starter-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.workspace-home__guide-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 12px;
}

.workspace-home__guide-pill {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 0 14px;
  border-radius: 999px;
  border: 1px solid var(--paper-border);
  background: #f8f9fb;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-main);
}

.workspace-home__guide-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--accent);
  color: #ffffff;
  font-size: 11px;
  font-weight: 700;
  flex-shrink: 0;
}

.workspace-home__starter-title {
  margin-top: 18px;
}

.workspace-home__starter-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.workspace-home__starter-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 46px;
  padding: 0 14px;
  border-radius: 18px;
  border: 1px solid var(--paper-border);
  background: #ffffff;
  color: var(--text-main);
  font-size: 13px;
  font-weight: 500;
  transition:
    background-color 0.16s ease,
    border-color 0.16s ease,
    transform 0.16s ease;
}

.workspace-home__starter-btn:hover {
  background: var(--surface-muted);
  border-color: #cdcdcd;
  transform: translateY(-1px);
}

.workspace-home__starter-btn--active {
  border-color: #cdcdcd;
  background: var(--surface-muted);
}

@media (max-width: 960px) {
  .workspace-home__empty-actions {
    padding-bottom: 16px;
  }

  .workspace-home__starter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
