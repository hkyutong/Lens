<script setup lang="ts">
import { t } from '@/locales'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAuthStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import { DIALOG_TABS } from '@/store/modules/global'
import { buildAcademicWorkflowTemplates, findAcademicWorkflowSelector } from '@/utils/academicWorkflow'
import { computed, nextTick } from 'vue'

type StarterTask = {
  id: string
  title: string
  prompt: string
  mode: 'core' | 'plugin'
  selectorGroups: string[][]
}

const chatStore = useChatStore()
const authStore = useAuthStore()
const useGlobalStore = useGlobalStoreWithOut()
const { isMobile } = useBasicLayout()
const normalizeText = (value: any) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')

const starterTasks = computed<StarterTask[]>(() => [
  {
    id: 'paper-summary',
    title: t('lens.workspace.starterPaperSummary'),
    prompt: t('lens.workspace.starterPaperSummaryPrompt'),
    mode: 'plugin',
    selectorGroups: [
      ['论文速读'],
      ['pdf', '批量总结'],
    ],
  },
  {
    id: 'pdf-deep-read',
    title: t('lens.workspace.starterPdfDeepRead'),
    prompt: t('lens.workspace.starterPdfDeepReadPrompt'),
    mode: 'plugin',
    selectorGroups: [['pdf', '深度理解']],
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
  {
    id: 'arxiv-summary',
    title: t('lens.workspace.starterArxivSummary'),
    prompt: t('lens.workspace.starterArxivSummaryPrompt'),
    mode: 'plugin',
    selectorGroups: [
      ['arxiv', '摘要'],
      ['arxiv', '英文摘要'],
    ],
  },
])

const activeWorkflowLabel = computed(() =>
  String(
    chatStore.currentAcademicPlugin?.displayName ||
      chatStore.currentAcademicPlugin?.name ||
      chatStore.currentAcademicCore?.displayName ||
      chatStore.currentAcademicCore?.name ||
      ''
  )
)

const workflowTemplates = computed(() => buildAcademicWorkflowTemplates())
const isWorkflowMemberAvailable = computed(() => {
  const balance: any = authStore.userBalance || {}
  return (
    Number(balance.packageId || 0) > 0 ||
    (balance.expirationTime && new Date(balance.expirationTime) > new Date())
  )
})

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
  chatStore.clearAcademicWorkflow()
  chatStore.setAcademicMode(true)

  if (task.mode === 'core') {
    chatStore.setAcademicPlugin(undefined)
    chatStore.setAcademicCore(undefined)
    const matchedCore = findAcademicWorkflowSelector(
      chatStore.academicCoreFunctions || [],
      task.selectorGroups
    )
    if (matchedCore) {
      chatStore.setAcademicCore(matchedCore)
    }
  } else {
    chatStore.setAcademicCore(undefined)
    chatStore.setAcademicPlugin(undefined)
    const matchedPlugin = findAcademicWorkflowSelector(
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

const openMemberDialog = () => {
  if (isMobile.value) {
    useGlobalStore.updateMobileSettingsDialog(true, DIALOG_TABS.MEMBER)
  } else {
    useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.MEMBER)
  }
}

const applyWorkflowTemplate = async (template: Chat.AcademicWorkflowTemplate) => {
  if (!isWorkflowMemberAvailable.value) {
    openMemberDialog()
    return
  }
  await ensureAcademicData()
  const nextSteps: Chat.AcademicWorkflowStep[] = template.steps
    .map(step => {
      const sourceList =
        step.kind === 'plugin' ? chatStore.academicPluginList || [] : chatStore.academicCoreFunctions || []
      const matched = findAcademicWorkflowSelector(sourceList, [[step.name]])
      return {
        kind: step.kind,
        name: String(matched?.name || step.name || '').trim(),
        displayName: String(matched?.displayName || matched?.name || step.displayName || step.name || '').trim(),
        args: String(step.args || '').trim(),
      }
    })
    .filter(step => Boolean(step.name))

  if (!nextSteps.length) return
  chatStore.setAcademicCore(undefined)
  chatStore.setAcademicPlugin(undefined)
  chatStore.setAcademicWorkflowSteps(nextSteps)
  chatStore.setAcademicWorkflowEnabled(true)
  chatStore.setPrompt(template.prompt)
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
        <div class="workspace-home__intro-desc">
          {{ t('lens.workspace.introDesc') }}
        </div>
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

      <div class="workspace-home__guide workspace-home__guide--workflow">
        <div class="workspace-home__starter-title">
          {{ t('lens.workflow.templateTitle') }}
        </div>
        <div class="workspace-home__starter-grid workspace-home__starter-grid--workflow">
          <button
            v-for="item in workflowTemplates"
            :key="item.id"
            type="button"
            class="workspace-home__starter-btn workspace-home__starter-btn--workflow"
            :class="{ 'workspace-home__starter-btn--locked': !isWorkflowMemberAvailable }"
            @click="applyWorkflowTemplate(item)"
          >
            <span>{{ item.title }}</span>
            <small v-if="!isWorkflowMemberAvailable">{{ t('lens.workflow.memberOnly') }}</small>
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
  padding-top: 6px;
}

.workspace-home__intro {
  max-width: 580px;
  padding: 0 0 16px;
}

.workspace-home__intro-desc {
  margin-top: 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--text-sub);
}

.workspace-home__guide {
  padding: 0 0 18px;
}

.workspace-home__starter-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
}

.workspace-home__starter-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.workspace-home__starter-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 14px;
  border-radius: 999px;
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
  border-color: #d7d7d7;
  transform: translateY(-1px);
}

.workspace-home__starter-btn--active {
  border-color: #d0d0d0;
  background: var(--surface-muted);
}

.workspace-home__guide--workflow {
  padding-top: 2px;
}

.workspace-home__starter-grid--workflow {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.workspace-home__starter-btn--workflow {
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  min-height: 56px;
  padding: 12px 14px;
  border-style: dashed;
}

.workspace-home__starter-btn--workflow small {
  margin-top: 4px;
  font-size: 11px;
  font-weight: 500;
  color: var(--text-sub);
}

.workspace-home__starter-btn--locked {
  opacity: 0.92;
}

@media (max-width: 960px) {
  .workspace-home__starter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .workspace-home__shell {
    padding-top: 2px;
  }

  .workspace-home__starter-grid {
    grid-template-columns: 1fr;
  }

  .workspace-home__starter-grid--workflow {
    grid-template-columns: 1fr;
  }
}
</style>
