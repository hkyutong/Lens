<script setup lang="ts">
import { computed, inject, onMounted } from 'vue'
import { useAuthStore, useChatStore } from '@/store'

const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>

const authStore = useAuthStore()
const chatStore = useChatStore()

const emit = defineEmits<{
  (e: 'import'): void
}>()

const normalizeText = (value: any) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')

const requireLogin = () => {
  if (authStore.isLogin) return true
  authStore.setLoginDialog(true)
  return false
}

const siteName = computed(() => authStore.globalConfig?.siteName || 'Lens')
const recentResearch = computed(() => (chatStore.groupList || []).slice(0, 4))
const activePlugin = computed(() => chatStore.currentAcademicPlugin)
const activeCore = computed(() => chatStore.currentAcademicCore)
const selectedWorkflow = computed(() => {
  return (
    activePlugin.value?.displayName ||
    activePlugin.value?.name ||
    activeCore.value?.displayName ||
    activeCore.value?.name ||
    '未配置研究流程'
  )
})

const pluginCount = computed(() => (chatStore.academicPluginList || []).length)
const coreCount = computed(() => (chatStore.academicCoreFunctions || []).length)

const capabilityCards = computed(() => [
  {
    title: '文献速读与 PDF 理解',
    description: '围绕论文速读、PDF 批量总结和深度理解组织单次研究任务。',
    meta: '论文速读 · PDF 批量总结 · PDF 深度理解',
  },
  {
    title: 'Arxiv 与 LaTeX 工作流',
    description: '支持 Arxiv 摘要、LaTeX 摘要、精准翻译、英中润色和高亮纠错。',
    meta: 'Arxiv · LaTeX · 学术写作',
  },
  {
    title: '学术表达与参考文献',
    description: '处理中英文润色、BibTeX 转换、结构整理和代码解释。',
    meta: '润色 · BibTeX · 代码解释',
  },
])

const quickActions = computed(() => [
  {
    key: 'new',
    eyebrow: 'Start',
    title: '新建研究会话',
    description: '从空白工作台开始，组织你的问题、文件和推理路径。',
  },
  {
    key: 'import',
    eyebrow: 'Import',
    title: '导入 PDF / LaTeX / Word',
    description: '上传论文、草稿或补充材料，并直接进入研究模式。',
  },
  {
    key: 'paper',
    eyebrow: 'Read',
    title: '启动论文速读',
    description: '快速切到论文速读或 PDF 深度理解流程。',
  },
  {
    key: 'polish',
    eyebrow: 'Polish',
    title: '启动英文润色',
    description: '切到学术润色流程，适合摘要、审稿回复与正文修改。',
  },
])

const ensureAcademicData = async () => {
  if (!chatStore.academicCoreFunctions?.length) {
    await chatStore.queryAcademicCoreFunctions()
  }
  if (!chatStore.academicPluginList?.length) {
    await chatStore.queryAcademicPluginList()
  }
}

const setAcademicPreset = async (options: { coreName?: string; pluginKeywords?: string[] }) => {
  if (!requireLogin()) return
  await ensureAcademicData()
  chatStore.setAcademicMode(true)

  if (options.coreName) {
    const target = (chatStore.academicCoreFunctions || []).find((item: any) =>
      normalizeText(item?.displayName || item?.name).includes(normalizeText(options.coreName))
    )
    if (target) {
      chatStore.setAcademicCore(target)
      return
    }
  }

  if (options.pluginKeywords?.length) {
    const target = (chatStore.academicPluginList || []).find((item: any) => {
      const haystack = normalizeText(`${item?.displayName || ''} ${item?.name || ''}`)
      return options.pluginKeywords!.every(keyword => haystack.includes(normalizeText(keyword)))
    })
    if (target) {
      chatStore.setAcademicPlugin(target)
    }
  }
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

const handleQuickAction = async (key: string) => {
  if (key === 'new') {
    await handleCreate()
    return
  }

  if (key === 'import') {
    await handleImport()
    return
  }

  if (key === 'paper') {
    await setAcademicPreset({ pluginKeywords: ['论文速读'] })
    return
  }

  if (key === 'polish') {
    await setAcademicPreset({ coreName: '英文润色' })
  }
}

const handleOpenResearch = async (group: Chat.History) => {
  if (!requireLogin()) return
  await chatStore.setActiveGroup(group.uuid)
}

onMounted(async () => {
  await ensureAcademicData()
})
</script>

<template>
  <section class="research-home">
    <div class="research-hero">
      <div class="research-hero__copy">
        <span class="research-hero__eyebrow">Research Desk</span>
        <h1 class="research-hero__title">{{ siteName }} 学术工作台</h1>
        <p class="research-hero__subtitle">
          把研究问题、论文文件、学术润色、Arxiv
          处理和写作协作放到一个工作区里，而不是拆成零散的聊天步骤。
        </p>
        <div class="research-hero__chips">
          <span class="research-chip research-chip-active">
            {{ chatStore.academicMode ? '研究模式已启用' : '研究模式待启用' }}
          </span>
          <span class="research-chip">当前流程：{{ selectedWorkflow }}</span>
          <span class="research-chip">核心能力 {{ coreCount }}</span>
          <span class="research-chip">插件 {{ pluginCount }}</span>
        </div>
      </div>

      <div class="research-hero__panel">
        <div class="research-hero__panel-label">Recommended Workflow</div>
        <div class="research-hero__panel-title">
          {{
            selectedWorkflow === '未配置研究流程' ? '先设定研究流程，再开始对话' : selectedWorkflow
          }}
        </div>
        <div class="research-hero__panel-text">
          {{
            chatStore.academicMode
              ? '你可以直接在下方输入研究问题、论文段落、审稿意见或方法设计需求。'
              : '建议先选择论文速读、润色或 LaTeX 相关流程，再把文件或问题送入同一个会话。'
          }}
        </div>
        <div class="research-hero__stats">
          <div class="research-stat">
            <div class="research-stat__value">{{ recentResearch.length }}</div>
            <div class="research-stat__label">最近会话</div>
          </div>
          <div class="research-stat">
            <div class="research-stat__value">{{ coreCount }}</div>
            <div class="research-stat__label">核心能力</div>
          </div>
          <div class="research-stat">
            <div class="research-stat__value">{{ pluginCount }}</div>
            <div class="research-stat__label">高级插件</div>
          </div>
        </div>
      </div>
    </div>

    <div class="research-grid">
      <section class="research-card">
        <div class="research-section-head">
          <div>
            <div class="research-section-head__eyebrow">Quick Actions</div>
            <h2 class="research-section-head__title">常用研究入口</h2>
          </div>
        </div>
        <div class="quick-actions">
          <button
            v-for="action in quickActions"
            :key="action.key"
            type="button"
            class="quick-action"
            @click="handleQuickAction(action.key)"
          >
            <div class="quick-action__eyebrow">{{ action.eyebrow }}</div>
            <div class="quick-action__title">{{ action.title }}</div>
            <div class="quick-action__desc">{{ action.description }}</div>
          </button>
        </div>
      </section>

      <section class="research-card">
        <div class="research-section-head">
          <div>
            <div class="research-section-head__eyebrow">Capabilities</div>
            <h2 class="research-section-head__title">真实可用的学术能力</h2>
          </div>
        </div>
        <div class="capability-list">
          <article v-for="card in capabilityCards" :key="card.title" class="capability-item">
            <div class="capability-item__title">{{ card.title }}</div>
            <div class="capability-item__desc">{{ card.description }}</div>
            <div class="capability-item__meta">{{ card.meta }}</div>
          </article>
        </div>
      </section>
    </div>

    <section class="research-card">
      <div class="research-section-head">
        <div>
          <div class="research-section-head__eyebrow">Recent Research</div>
          <h2 class="research-section-head__title">最近研究会话</h2>
        </div>
      </div>

      <template v-if="recentResearch.length">
        <div class="recent-research">
          <button
            v-for="group in recentResearch"
            :key="group.uuid"
            type="button"
            class="recent-research__item"
            @click="handleOpenResearch(group)"
          >
            <div class="recent-research__title">{{ group.title || '未命名研究会话' }}</div>
            <div class="recent-research__meta">
              {{ group.isSticky ? '置顶研究' : '研究会话' }}
            </div>
          </button>
        </div>
      </template>
      <template v-else>
        <div class="research-empty">
          <div class="research-empty__title">还没有研究记录</div>
          <div class="research-empty__desc">
            从论文速读、英文润色或导入文档开始，让新工作区承接一次完整的学术任务。
          </div>
          <div class="research-empty__actions">
            <button type="button" class="btn btn-secondary btn-md" @click="handleImport">
              导入资料
            </button>
            <button type="button" class="btn btn-primary btn-md" @click="handleCreate">
              新建研究
            </button>
          </div>
        </div>
      </template>
    </section>
  </section>
</template>

<style scoped>
.research-home {
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-height: 100%;
}

.research-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(280px, 0.95fr);
  gap: 18px;
}

.research-hero__copy,
.research-hero__panel,
.research-card {
  border: 1px solid var(--paper-border);
  background: var(--paper-bg);
  border-radius: 28px;
  box-shadow: var(--shadow-panel);
  backdrop-filter: blur(14px);
}

.research-hero__copy {
  padding: 28px;
  position: relative;
  overflow: hidden;
}

.research-hero__copy::after {
  content: '';
  position: absolute;
  right: -56px;
  top: -56px;
  width: 180px;
  height: 180px;
  border-radius: 9999px;
  background: var(--accent-soft);
  filter: blur(8px);
}

.research-hero__eyebrow,
.research-section-head__eyebrow,
.research-hero__panel-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-faint);
}

.research-hero__title {
  margin: 10px 0 12px;
  font-size: clamp(28px, 4vw, 42px);
  line-height: 1.08;
  color: var(--text-main);
}

.research-hero__subtitle {
  max-width: 720px;
  margin: 0;
  font-size: 15px;
  line-height: 1.8;
  color: var(--ink-soft);
}

.research-hero__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 22px;
}

.research-hero__panel {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.research-hero__panel-title {
  font-size: 22px;
  line-height: 1.3;
  font-weight: 600;
  color: var(--text-main);
}

.research-hero__panel-text {
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink-soft);
}

.research-hero__stats {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.research-stat {
  padding: 14px;
  border-radius: 18px;
  border: 1px solid var(--border-color);
  background: var(--surface-muted);
}

.research-stat__value {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-main);
}

.research-stat__label {
  margin-top: 4px;
  font-size: 12px;
  color: var(--ink-faint);
}

.research-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 1fr);
  gap: 18px;
}

.research-card {
  padding: 22px;
}

.research-section-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.research-section-head__title {
  margin: 6px 0 0;
  font-size: 20px;
  font-weight: 600;
  color: var(--text-main);
}

.quick-actions,
.capability-list,
.recent-research {
  display: grid;
  gap: 12px;
}

.quick-actions {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.quick-action,
.capability-item,
.recent-research__item {
  text-align: left;
  padding: 18px;
  border-radius: 22px;
  border: 1px solid var(--border-color);
  background: var(--surface-muted);
  transition:
    transform 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.quick-action:hover,
.capability-item:hover,
.recent-research__item:hover {
  transform: translateY(-2px);
  border-color: rgba(29, 78, 216, 0.2);
  box-shadow: var(--shadow-soft);
}

.quick-action__eyebrow {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
}

.quick-action__title,
.capability-item__title,
.recent-research__title {
  margin-top: 10px;
  font-size: 16px;
  line-height: 1.4;
  font-weight: 600;
  color: var(--text-main);
}

.quick-action__desc,
.capability-item__desc,
.research-empty__desc {
  margin-top: 8px;
  font-size: 14px;
  line-height: 1.7;
  color: var(--ink-soft);
}

.capability-item__meta,
.recent-research__meta {
  margin-top: 10px;
  font-size: 12px;
  color: var(--ink-faint);
}

.recent-research {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.research-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 18px;
  border-radius: 22px;
  background: var(--surface-muted);
  border: 1px solid var(--border-color);
}

.research-empty__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-main);
}

.research-empty__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 4px;
}

@media (max-width: 1100px) {
  .research-hero,
  .research-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .research-home {
    gap: 16px;
  }

  .research-hero__copy,
  .research-hero__panel,
  .research-card {
    padding: 18px;
    border-radius: 24px;
  }

  .quick-actions,
  .recent-research,
  .research-hero__stats {
    grid-template-columns: 1fr;
  }
}
</style>
