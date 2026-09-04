<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { parseResearchFiles } from '@/domain/research/files'
import {
  HOME_FEATURED_RESEARCH_TASK_IDS,
  RESEARCH_STARTER_TASKS,
  type ResearchStarterTaskDefinition,
} from '@/domain/research/starter'
import { t } from '@/locales'
import { useAuthStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import { DIALOG_TABS } from '@/store/modules/global'
import {
  canUseAcademicCore,
  canUseAcademicPlugin,
  getAcademicWorkflowStepLimit,
} from '@/utils/academicPlanAccess'
import {
  buildAcademicWorkflowTemplates,
  findAcademicWorkflowSelector,
} from '@/utils/academicWorkflow'
import { computed, nextTick } from 'vue'

type StarterTask = {
  id: string
  title: string
  desc: string
  prompt: string
  mode: 'core' | 'plugin' | 'chat'
  selectorGroups: string[][]
}
const chatStore = useChatStore()
const authStore = useAuthStore()
const globalStore = useGlobalStoreWithOut()
const emit = defineEmits<{ import: [] }>()
const userBalance = computed(() => authStore.userBalance || {})
const researchFiles = computed(() => parseResearchFiles(chatStore.activeGroupFileUrl))
const normalizeText = (value: any) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
const starterTasks = computed<StarterTask[]>(() =>
  RESEARCH_STARTER_TASKS.map((task: ResearchStarterTaskDefinition) => ({
    ...task,
    title: t(task.titleKey),
    desc: t(task.descriptionKey),
    prompt: t(task.promptKey),
  }))
)
const starterTaskMap = computed(() => new Map(starterTasks.value.map(task => [task.id, task])))
const featuredStarterTasks = computed(() =>
  HOME_FEATURED_RESEARCH_TASK_IDS.map(taskId => starterTaskMap.value.get(taskId)).filter(
    (task): task is StarterTask => Boolean(task)
  )
)
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
const workflowStepLimit = computed(() => getAcademicWorkflowStepLimit(userBalance.value))
const isWorkflowMemberAvailable = computed(() => workflowStepLimit.value > 0)
const featuredWorkflowTemplates = computed(() => workflowTemplates.value.slice(0, 1))
const canUseWorkflowTemplate = (template: Chat.AcademicWorkflowTemplate) =>
  isWorkflowMemberAvailable.value && template.steps.length <= workflowStepLimit.value
const getWorkflowStepLabels = (template: Chat.AcademicWorkflowTemplate) =>
  template.steps.map(step => String(step.displayName || step.name || '').trim()).filter(Boolean)
async function ensureAcademicData() {
  if (!chatStore.academicCoreFunctions?.length) await chatStore.queryAcademicCoreFunctions()
  if (!chatStore.academicPluginList?.length) await chatStore.queryAcademicPluginList()
}

async function focusComposer() {
  await nextTick()
  const composer = document.getElementById('workspace-composer') as HTMLTextAreaElement | null
  composer?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  composer?.focus()
}

function openMemberDialog() {
  globalStore.updateSettingsDialog(true, DIALOG_TABS.MEMBER)
}

async function startBlankResearch() {
  chatStore.setAcademicMode(true)
  await chatStore.setPrompt('')
  await focusComposer()
}

function isStarterActive(task: StarterTask) {
  const label = normalizeText(activeWorkflowLabel.value)
  return Boolean(
    label &&
      task.selectorGroups.some(selectors =>
        selectors.every(selector => label.includes(normalizeText(selector)))
      )
  )
}

async function applyStarterTask(task: StarterTask) {
  chatStore.clearAcademicWorkflow()
  chatStore.setAcademicMode(true)
  if (task.mode === 'chat') {
    chatStore.setAcademicPlugin(undefined)
    chatStore.setAcademicCore(undefined)
    chatStore.setPrompt(task.prompt)
    await focusComposer()
    return
  }
  await ensureAcademicData()
  const source =
    task.mode === 'core'
      ? chatStore.academicCoreFunctions || []
      : chatStore.academicPluginList || []
  const matched = findAcademicWorkflowSelector(source, task.selectorGroups)
  const allowed =
    task.mode === 'core'
      ? canUseAcademicCore(matched, userBalance.value)
      : canUseAcademicPlugin(matched, userBalance.value)
  if (!matched || !allowed) {
    openMemberDialog()
    return
  }
  chatStore.setAcademicCore(task.mode === 'core' ? matched : undefined)
  chatStore.setAcademicPlugin(task.mode === 'plugin' ? matched : undefined)
  chatStore.setPrompt(task.prompt)
  await focusComposer()
}

async function applyWorkflowTemplate(template: Chat.AcademicWorkflowTemplate) {
  if (!canUseWorkflowTemplate(template)) {
    openMemberDialog()
    return
  }
  await ensureAcademicData()
  const steps = template.steps.reduce<Chat.AcademicWorkflowStep[]>((result, step) => {
    const source =
      step.kind === 'plugin'
        ? chatStore.academicPluginList || []
        : chatStore.academicCoreFunctions || []
    const matched = findAcademicWorkflowSelector(source, [[step.name]])
    const allowed =
      step.kind === 'plugin'
        ? canUseAcademicPlugin(matched || step, userBalance.value)
        : canUseAcademicCore(matched || step, userBalance.value)
    if (!allowed) return result
    const name = String(matched?.name || step.name || '').trim()
    if (name)
      result.push({
        kind: step.kind,
        name,
        displayName: String(
          matched?.displayName || matched?.name || step.displayName || step.name || ''
        ).trim(),
        args: String(step.args || '').trim(),
      })
    return result
  }, [])
  if (!steps.length) return
  chatStore.setAcademicCore(undefined)
  chatStore.setAcademicPlugin(undefined)
  chatStore.setAcademicWorkflowSteps(steps)
  chatStore.setAcademicWorkflowEnabled(true)
  chatStore.setPrompt(template.prompt)
  await focusComposer()
}

async function startCustomWorkflow() {
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
  <section class="academic-home">
    <div class="academic-home__intro">
      <h1>{{ t('lens.workspace.startAcademicWork') }}</h1>
      <p>{{ t('lens.workspace.startAcademicWorkDesc') }}</p>
    </div>

    <section class="academic-home__tasks" :aria-label="t('lens.workspace.basicFunctions')">
      <header>
        <strong>{{ t('lens.workspace.basicFunctions') }}</strong>
        <span>{{ t('lens.workspace.basicFunctionsDesc') }}</span>
      </header>
      <div class="academic-home__task-grid">
        <button
          v-for="item in featuredStarterTasks"
          :key="item.id"
          type="button"
          :aria-pressed="isStarterActive(item)"
          :class="{ active: isStarterActive(item) }"
          @click="applyStarterTask(item)"
        >
          <SvgIcon icon="ri:speed-line" />
          <strong>{{ item.title }}</strong>
          <span>{{ item.desc }}</span>
        </button>
      </div>
    </section>

    <section v-if="researchFiles.length" class="academic-home__files">
      <strong>{{ t('lens.workspace.importedFilesLabel') }}</strong>
      <span v-for="file in researchFiles" :key="file.url">
        <SvgIcon icon="ri:file-text-line" />{{ file.name }}
      </span>
    </section>

    <div class="academic-home__actions">
      <button type="button" class="academic-home__import" @click="emit('import')">
        <SvgIcon icon="ri:inbox-line" />{{ t('lens.workspace.importData') }}
      </button>
      <button type="button" class="academic-home__direct" @click="startBlankResearch">
        {{ t('lens.workspace.heroPrimaryAction') }}
      </button>
      <button
        v-for="template in featuredWorkflowTemplates"
        :key="template.id"
        type="button"
        class="academic-home__workflow"
        :class="{ locked: !canUseWorkflowTemplate(template) }"
        @click="applyWorkflowTemplate(template)"
      >
        {{ template.title }}: {{ getWorkflowStepLabels(template).join(' · ') }}
      </button>
      <button type="button" class="academic-home__workflow" @click="startCustomWorkflow">
        {{ t('lens.workspace.customWorkflow') }}
      </button>
    </div>
  </section>
</template>

<style scoped>
.academic-home {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 32px;
  min-height: min(620px, calc(100vh - 230px));
  max-width: 820px;
  margin: 0 auto;
  padding: clamp(48px, 8vh, 96px) 0 64px;
  color: var(--text-main);
}
.academic-home__intro h1 {
  max-width: 620px;
  margin: 0;
  color: var(--text-main);
  font-size: clamp(32px, 4vw, 46px);
  font-weight: 650;
  letter-spacing: -0.035em;
  line-height: 1.08;
}
.academic-home__intro > p:last-child {
  max-width: 580px;
  margin: 16px 0 0;
  color: var(--text-sub);
  font-size: 17px;
  line-height: 1.55;
}
.academic-home__tasks > header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}
.academic-home__tasks > header strong {
  font-size: 15px;
  font-weight: 600;
}
.academic-home__tasks > header span {
  color: var(--ink-faint);
  font-size: 13px;
}
.academic-home__task-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--paper-border);
  border-radius: 20px;
  background: var(--paper-border);
  box-shadow: var(--shadow-card);
}
.academic-home__task-grid button {
  position: relative;
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  min-height: 104px;
  padding: 18px;
  border: 0;
  border-radius: 0;
  background: var(--surface-card);
  color: var(--text-main);
  text-align: left;
  transition:
    background-color 180ms ease,
    color 180ms ease;
}
.academic-home__task-grid button:hover,
.academic-home__task-grid button.active {
  background: var(--academic-surface);
}
.academic-home__task-grid button > svg {
  grid-column: 2;
  grid-row: 1;
  color: var(--academic-blue);
}
.academic-home__task-grid button strong {
  grid-column: 1;
  grid-row: 1;
  font-size: 15px;
  font-weight: 600;
}
.academic-home__task-grid button span {
  grid-column: 1 / -1;
  color: var(--text-sub);
  font-size: 13px;
  line-height: 1.5;
}
.academic-home__files {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 7px;
  padding: 14px 0;
  border-top: 1px solid var(--paper-border);
  border-bottom: 1px solid var(--paper-border);
}
.academic-home__files > strong {
  margin-right: 4px;
  color: var(--text-sub);
  font-size: 13px;
  font-weight: 600;
}
.academic-home__files span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 220px;
  min-height: 32px;
  padding: 6px 10px;
  border: 1px solid var(--paper-border);
  border-radius: 999px;
  background: var(--surface-muted);
  color: var(--text-sub);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.academic-home__actions {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}
.academic-home__import,
.academic-home__direct,
.academic-home__workflow {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 16px;
  border: 1px solid var(--paper-border);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 500;
}
.academic-home__import {
  border: 1px solid var(--academic-blue);
  background: var(--academic-blue);
  color: #fff;
}
.academic-home__direct {
  background: var(--material-regular);
  color: var(--text-main);
  -webkit-backdrop-filter: saturate(180%) blur(18px);
  backdrop-filter: saturate(180%) blur(18px);
}
.academic-home__workflow {
  background: var(--surface-muted);
  color: var(--text-sub);
}
.academic-home__workflow.locked {
  opacity: 0.55;
}
.academic-home button:focus-visible {
  outline: 2px solid var(--academic-blue);
  outline-offset: 2px;
}
@media (max-width: 800px) {
  .academic-home {
    min-height: 0;
    padding: 20px 0 28px;
    gap: 18px;
  }
  .academic-home__intro h1 {
    font-size: 28px;
    line-height: 1.12;
  }
  .academic-home__intro > p:last-child {
    display: none;
  }
  .academic-home__task-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    border-radius: 16px;
  }
  .academic-home__tasks > header {
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
  }
  .academic-home__tasks > header span,
  .academic-home__task-grid button span {
    display: none;
  }
  .academic-home__task-grid button {
    min-height: 72px;
    padding: 12px;
    gap: 4px 6px;
  }
  .academic-home__task-grid button strong {
    font-size: 13px;
    line-height: 1.35;
  }
  .academic-home__task-grid button > svg {
    width: 16px;
    height: 16px;
  }
  .academic-home__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    width: 100%;
  }
  .academic-home__import,
  .academic-home__direct,
  .academic-home__workflow {
    width: 100%;
    padding: 0 10px;
    font-size: 12px;
    text-align: center;
  }
}
</style>
