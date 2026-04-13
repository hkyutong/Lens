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

type StarterLane = {
  id: string
  title: string
  desc: string
  taskIds: string[]
}

interface Emit {
  (ev: 'import'): void
}

const chatStore = useChatStore()
const authStore = useAuthStore()
const useGlobalStore = useGlobalStoreWithOut()
const emit = defineEmits<Emit>()
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

const starterTaskMap = computed(() => new Map(starterTasks.value.map(task => [task.id, task])))
const starterLanes = computed<StarterLane[]>(() => [
  {
    id: 'reading',
    title: t('lens.workspace.readingTitle'),
    desc: t('lens.workspace.readingDesc'),
    taskIds: ['paper-summary', 'pdf-deep-read'],
  },
  {
    id: 'writing',
    title: t('lens.workspace.writingTitle'),
    desc: t('lens.workspace.writingDesc'),
    taskIds: ['english-polish', 'latex-translation'],
  },
])
const resolvedStarterLanes = computed(() =>
  starterLanes.value.map(lane => ({
    ...lane,
    tasks: lane.taskIds
      .map(taskId => starterTaskMap.value.get(taskId))
      .filter((task): task is StarterTask => Boolean(task)),
  }))
)
const workflowTemplates = computed(() => buildAcademicWorkflowTemplates())
const featuredWorkflowTemplates = computed(() => workflowTemplates.value.slice(0, 2))
const getWorkflowTemplateStepLabel = (step: Chat.AcademicWorkflowStep) =>
  String(step.displayName || step.name || '').trim()
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

const focusComposer = async () => {
  await nextTick()
  const composer = document.getElementById('workspace-composer') as HTMLTextAreaElement | null
  composer?.scrollIntoView({
    behavior: 'smooth',
    block: 'center',
  })
  composer?.focus()
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
  await focusComposer()
}

const triggerImport = () => {
  emit('import')
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
  await focusComposer()
}

const startCustomWorkflow = async () => {
  if (!isWorkflowMemberAvailable.value) {
    openMemberDialog()
    return
  }
  await ensureAcademicData()
  chatStore.clearAcademicWorkflow()
  chatStore.setAcademicCore(undefined)
  chatStore.setAcademicPlugin(undefined)
  chatStore.setAcademicPluginArgs('')
  chatStore.setAcademicWorkflowEnabled(true)
  chatStore.setAcademicWorkflowSteps([])
  chatStore.setPrompt('')
  await focusComposer()
}
</script>

<template>
  <section class="workspace-home">
    <div class="workspace-home__shell">
      <div class="workspace-home__hero">
        <div class="workspace-home__hero-main">
          <h2 class="workspace-home__headline">{{ t('lens.workspace.heroTitle') }}</h2>
          <div class="workspace-home__hero-actions">
            <button
              type="button"
              class="workspace-home__hero-action workspace-home__hero-action--primary"
              @click="focusComposer"
            >
              {{ t('lens.workspace.heroPrimaryAction') }}
            </button>
            <button
              type="button"
              class="workspace-home__hero-action workspace-home__hero-action--secondary"
              @click="triggerImport"
            >
              {{ t('lens.workspace.importData') }}
            </button>
          </div>
        </div>
      </div>

      <div class="workspace-home__board">
        <div class="workspace-home__main-column">
          <div class="workspace-home__section">
            <div class="workspace-home__section-head workspace-home__section-head--stacked">
              <div class="workspace-home__section-title">{{ t('lens.workspace.starterTitle') }}</div>
              <div class="workspace-home__section-note">{{ t('lens.workspace.starterDesc') }}</div>
            </div>
            <div class="workspace-home__lane-list">
              <section
                v-for="lane in resolvedStarterLanes"
                :key="lane.id"
                class="workspace-home__lane"
              >
                <div class="workspace-home__lane-head">
                  <strong class="workspace-home__lane-title">{{ lane.title }}</strong>
                  <span class="workspace-home__lane-desc">{{ lane.desc }}</span>
                </div>
                <div class="workspace-home__starter-list">
                  <button
                    v-for="item in lane.tasks"
                    :key="item.id"
                    type="button"
                    class="workspace-home__starter-row"
                    :class="{ 'workspace-home__starter-row--active': isStarterActive(item) }"
                    @click="applyStarterTask(item)"
                  >
                    <span class="workspace-home__starter-copy">
                      <strong class="workspace-home__starter-name">{{ item.title }}</strong>
                      <span class="workspace-home__starter-meta">
                        {{
                          item.mode === 'plugin'
                            ? t('lens.academicPanel.pluginLabel')
                            : t('lens.academicPanel.coreLabel')
                        }}
                      </span>
                    </span>
                    <span class="workspace-home__starter-arrow">{{ t('lens.workspace.starterAction') }}</span>
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>

        <aside class="workspace-home__side-column">
          <div class="workspace-home__section workspace-home__section--workflow">
            <div class="workspace-home__section-head workspace-home__section-head--stacked">
              <div class="workspace-home__section-title">{{ t('lens.workflow.templateTitle') }}</div>
              <div class="workspace-home__section-note">{{ t('lens.workspace.workflowSectionDesc') }}</div>
            </div>
            <button
              type="button"
              class="workspace-home__workflow-row workspace-home__workflow-row--builder"
              :class="{ 'workspace-home__workflow-row--locked': !isWorkflowMemberAvailable }"
              @click="startCustomWorkflow"
            >
              <span class="workspace-home__workflow-row-index">+</span>
              <span class="workspace-home__workflow-row-copy">
                <strong class="workspace-home__workflow-row-title">{{ t('lens.workflow.customBuilderTitle') }}</strong>
                <span class="workspace-home__workflow-row-track">
                  <span class="workspace-home__workflow-row-step">{{ t('lens.workflow.customBuilderDesc') }}</span>
                </span>
              </span>
              <span class="workspace-home__workflow-row-side">
                <small v-if="!isWorkflowMemberAvailable">{{ t('lens.workflow.memberOnly') }}</small>
                <span v-else class="workspace-home__workflow-row-action">
                  {{ t('lens.workflow.customBuilderAction') }}
                </span>
              </span>
            </button>
            <div class="workspace-home__workflow-list">
              <button
                v-for="(item, index) in featuredWorkflowTemplates"
                :key="item.id"
                type="button"
                class="workspace-home__workflow-row"
                :class="{ 'workspace-home__workflow-row--locked': !isWorkflowMemberAvailable }"
                @click="applyWorkflowTemplate(item)"
              >
                <span class="workspace-home__workflow-row-index">{{ `0${index + 1}` }}</span>
                <span class="workspace-home__workflow-row-copy">
                  <strong class="workspace-home__workflow-row-title">{{ item.title }}</strong>
                  <span class="workspace-home__workflow-row-track">
                    <template v-for="(step, stepIndex) in item.steps" :key="`${item.id}-${stepIndex}`">
                      <span class="workspace-home__workflow-row-step">
                        {{ getWorkflowTemplateStepLabel(step) }}
                      </span>
                      <span
                        v-if="stepIndex < item.steps.length - 1"
                        class="workspace-home__workflow-row-separator"
                      >
                        →
                      </span>
                    </template>
                  </span>
                </span>
                <span class="workspace-home__workflow-row-side">
                  <small>{{ item.steps.length }}{{ t('lens.workflow.stepsShort') }}</small>
                  <small v-if="!isWorkflowMemberAvailable">{{ t('lens.workflow.memberOnly') }}</small>
                  <span v-else class="workspace-home__workflow-row-action">
                    {{ t('lens.workspace.workflowTemplateAction') }}
                  </span>
                </span>
              </button>
            </div>
          </div>
        </aside>
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
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding-top: 6px;
  animation: workspace-home-enter 320ms ease;
}

.workspace-home__hero {
  display: flex;
  padding: 2px 0 10px;
  border-bottom: 1px solid var(--grid-line);
}

.workspace-home__hero-main {
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
}

.workspace-home__headline {
  max-width: 12ch;
  margin: 0;
  font-size: clamp(22px, 3vw, 30px);
  line-height: 1.1;
  letter-spacing: -0.04em;
  color: var(--text-main);
}

.workspace-home__hero-actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 18px;
}

.workspace-home__hero-action {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 0;
  border: none;
  border-bottom: 1px solid transparent;
  background: transparent;
  font-size: 13px;
  font-weight: 600;
  transition:
    color 0.18s ease,
    border-color 0.18s ease,
    transform 0.18s ease;
}

.workspace-home__hero-action:hover {
  transform: translateX(2px);
}

.workspace-home__hero-action--primary {
  color: var(--text-main);
  border-color: var(--text-main);
}

.workspace-home__hero-action--secondary {
  color: var(--text-sub);
}

.workspace-home__hero-action--secondary:hover {
  color: var(--text-main);
  border-color: var(--paper-border);
}

.workspace-home__board {
  display: grid;
  grid-template-columns: minmax(0, 1.45fr) minmax(280px, 0.95fr);
  gap: 28px;
  align-items: start;
}

.workspace-home__main-column,
.workspace-home__side-column {
  min-width: 0;
}

.workspace-home__section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.workspace-home__section-head {
  display: flex;
  align-items: center;
}

.workspace-home__section-head--stacked {
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.workspace-home__section-title {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
  line-height: 1.35;
  color: var(--ink-faint);
}

.workspace-home__section-note {
  font-size: 12px;
  line-height: 1.5;
  color: var(--text-sub);
}

.workspace-home__lane-list {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.workspace-home__lane {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.workspace-home__lane-head {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.workspace-home__lane-title {
  font-size: 16px;
  line-height: 1.35;
  color: var(--text-main);
}

.workspace-home__lane-desc {
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-sub);
}

.workspace-home__starter-list {
  display: flex;
  flex-direction: column;
}

.workspace-home__workflow-list {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--grid-line);
}

.workspace-home__starter-row,
.workspace-home__workflow-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 12px 0;
  border-bottom: 1px solid var(--grid-line);
  background: transparent;
  color: var(--text-main);
  text-align: left;
  transition:
    color 0.16s ease,
    transform 0.16s ease,
    opacity 0.16s ease;
}

.workspace-home__starter-row:hover,
.workspace-home__workflow-row:hover {
  transform: translateX(2px);
}

.workspace-home__starter-row--active {
  color: var(--text-main);
}

.workspace-home__starter-row--active .workspace-home__starter-name {
  color: var(--text-main);
}

.workspace-home__starter-copy,
.workspace-home__workflow-row-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.workspace-home__starter-name,
.workspace-home__workflow-row-title {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--text-main);
}

.workspace-home__starter-meta,
.workspace-home__workflow-row-step,
.workspace-home__workflow-row-side small {
  font-size: 11px;
  line-height: 1.45;
  color: var(--text-sub);
}

.workspace-home__starter-arrow,
.workspace-home__workflow-row-action {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-faint);
}

.workspace-home__workflow-row {
  grid-template-columns: auto minmax(0, 1fr) auto;
}

.workspace-home__workflow-row--locked {
  opacity: 0.88;
}

.workspace-home__workflow-row--builder .workspace-home__workflow-row-index {
  font-size: 20px;
}

.workspace-home__workflow-row-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  color: var(--ink-faint);
  font-size: 12px;
  font-weight: 700;
}

.workspace-home__workflow-row-track {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.workspace-home__workflow-row-separator {
  font-size: 11px;
  color: var(--ink-faint);
}

.workspace-home__workflow-row-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  text-align: right;
}

@media (max-width: 640px) {
  .workspace-home__shell {
    gap: 16px;
    padding-top: 2px;
  }

  .workspace-home__board {
    grid-template-columns: 1fr;
    gap: 20px;
  }

  .workspace-home__side-column {
    border-top: 1px solid var(--grid-line);
    padding-top: 20px;
  }

  .workspace-home__headline {
    max-width: none;
    font-size: 30px;
  }

  .workspace-home__hero-main {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .workspace-home__hero-actions {
    gap: 10px 14px;
  }

  .workspace-home__starter-row,
  .workspace-home__workflow-row {
    grid-template-columns: 1fr;
    align-items: flex-start;
    gap: 10px;
    padding: 16px 0;
  }

  .workspace-home__workflow-row-side {
    align-items: flex-start;
    text-align: left;
  }
}

@keyframes workspace-home-enter {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}
</style>
