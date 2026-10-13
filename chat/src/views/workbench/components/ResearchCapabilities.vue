<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { t } from '@/locales'
import { useAuthStore, useChatStore } from '@/store'
import { computed, nextTick } from 'vue'
import CapabilityScrollRegion from './CapabilityScrollRegion.vue'
import {
  getAcademicEntityDisplayDescription,
  getAcademicEntityDisplayLabel,
  getAcademicEntitySelectorValue,
} from '@/utils/academicI18n'
import type { AcademicEntity } from '@/utils/academicI18n'
import { canUseAcademicCore, canUseAcademicPlugin } from '@/utils/academicPlanAccess'
import {
  ACADEMIC_HOME_CORE_ORDER,
  ACADEMIC_HOME_PLUGIN_ORDER,
  getAcademicCapabilityName,
  normalizeAcademicCapabilityName,
  sortByAcademicCapabilityOrder,
} from '@/utils/academicCapabilityCatalog'

const props = defineProps<{ sidebar?: boolean; fillContainer?: boolean }>()
const title = computed(() =>
  t(props.sidebar ? 'lens.academicPanel.settingsTitle' : 'lens.workspace.generalCapabilitiesTitle')
)
const chatStore = useChatStore()
const authStore = useAuthStore()

const fallbackCapabilities: AcademicEntity[] = [
  { name: '论文速读', description: '快速提取论文的研究问题、方法与结论' },
  { name: 'PDF 深度理解', description: '围绕上传的论文追问并保留证据上下文' },
  { name: '英文润色', description: '改善学术表达、语法与段落衔接' },
  { name: '参考文献转 BibTeX', description: '把参考文献整理为可复用的 BibTeX' },
  { name: '学术型代码解释', description: '解释研究代码的逻辑、输入与输出' },
  { name: '中英互译', description: '在学术语境中保持术语和语气一致' },
]
const visibleCapabilities = computed(() => {
  const balance = authStore.userBalance || {}
  const availableCore = (chatStore.academicCoreFunctions || []).filter((item: AcademicEntity) =>
    canUseAcademicCore(item, balance)
  )
  const availablePlugins = (chatStore.academicPluginList || []).filter((item: AcademicEntity) =>
    canUseAcademicPlugin(item, balance)
  )

  const matchesOrder = (entity: AcademicEntity, order: readonly string[]) => {
    const name = normalizeAcademicCapabilityName(getAcademicCapabilityName(entity))
    return order.some(candidate => normalizeAcademicCapabilityName(candidate) === name)
  }
  const preferredCore = availableCore.filter(item => matchesOrder(item, ACADEMIC_HOME_CORE_ORDER))
  const preferredPlugins = availablePlugins.filter(item =>
    matchesOrder(item, ACADEMIC_HOME_PLUGIN_ORDER)
  )

  const core = sortByAcademicCapabilityOrder(
    preferredCore.length ? preferredCore : availableCore,
    ACADEMIC_HOME_CORE_ORDER
  )
    .slice(0, 3)
    .map(entity => ({ entity, kind: 'core' as const }))
  const curatedPlugins = sortByAcademicCapabilityOrder(preferredPlugins, ACADEMIC_HOME_PLUGIN_ORDER)
  const plugins = (curatedPlugins.length ? curatedPlugins : availablePlugins)
    .slice(0, 3)
    .map(entity => ({ entity, kind: 'plugin' as const }))
  if (!authStore.isLogin || (!core.length && !plugins.length)) {
    return fallbackCapabilities.map(entity => ({
      entity,
      kind: 'core' as const,
      locked: !authStore.isLogin,
    }))
  }
  return [...core, ...plugins].map(item => ({ ...item, locked: false }))
})

async function focusComposer() {
  await nextTick()
  const composer = document.getElementById('workspace-composer') as HTMLTextAreaElement | null
  composer?.focus()
}

async function chooseCapability(item: {
  entity: AcademicEntity
  kind: 'core' | 'plugin'
  locked?: boolean
}) {
  if (item.locked) {
    authStore.setLoginDialog(true)
    return
  }
  if (item.kind === 'core') chatStore.setAcademicCore(item.entity)
  else chatStore.setAcademicPlugin(item.entity)
  chatStore.setMobileAcademicPanelVisible(false)
  await focusComposer()
}

function isCapabilitySelected(item: { entity: AcademicEntity; kind: 'core' | 'plugin' }) {
  const selected =
    item.kind === 'core' ? chatStore.currentAcademicCore : chatStore.currentAcademicPlugin
  return Boolean(
    selected &&
      getAcademicEntitySelectorValue(selected) === getAcademicEntitySelectorValue(item.entity)
  )
}
</script>

<template>
  <section
    class="research-capabilities"
    :class="{
      'research-capabilities--sidebar': props.sidebar,
      'research-capabilities--fill': props.fillContainer,
    }"
    :aria-label="title"
  >
    <h2>{{ title }}</h2>
    <CapabilityScrollRegion :enabled="props.sidebar" :fill-container="props.fillContainer" :inset="props.sidebar">
      <div class="academic-home__capability-grid">
        <button
          v-for="item in visibleCapabilities"
          :key="`${item.kind}-${getAcademicEntitySelectorValue(item.entity)}`"
          type="button"
          class="academic-home__capability"
          :class="{
            'is-active': isCapabilitySelected(item),
            'is-locked': item.locked,
          }"
          :aria-pressed="isCapabilitySelected(item)"
          :title="getAcademicEntityDisplayDescription(item.entity)"
          @click="chooseCapability(item)"
        >
          <span class="academic-home__capability-copy">
            <strong>{{ getAcademicEntityDisplayLabel(item.entity) }}</strong>
          </span>
          <SvgIcon class="research-entry-arrow" icon="ri:arrow-right-line" aria-hidden="true" />
        </button>
      </div>
    </CapabilityScrollRegion>
  </section>
</template>

<style scoped>
.research-capabilities--sidebar {
  --capability-list-max-height: clamp(176px, 34dvh, 320px);
}

.research-capabilities {
  min-width: 0;
  width: 100%;
}
.research-capabilities h2 {
  margin: 0 0 12px;
  color: var(--text-main);
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}
.academic-home__capability-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.academic-home__capability {
  position: relative;
  isolation: isolate;
  display: flex;
  min-width: 0;
  min-height: var(--control-height);
  align-items: center;
  justify-content: flex-start;
  gap: 12px;
  padding: 8px 0;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-main);
  font-size: 12.5px;
  font-weight: 600;
  text-align: left;
  transition: color 160ms ease;
}

.academic-home__capability::before {
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

@media (hover: hover) and (pointer: fine) {
  .academic-home__capability:hover::before {
    opacity: 1;
  }
}

.academic-home__capability:focus-visible::before,
.academic-home__capability:active::before {
  opacity: 1;
}

.academic-home__capability.is-active {
  color: var(--academic-blue);
}

.academic-home__capability.is-active::before {
  background: var(--academic-surface);
  opacity: 1;
}

.academic-home__capability-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
  overflow-wrap: anywhere;
}

.academic-home__capability-copy strong {
  color: inherit;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
}

.academic-home__capability:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 6px;
}

@media (min-width: 1024px) {
  .academic-home__capability-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (min-width: 1024px) and (max-height: 700px) {
  .academic-home__capability-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 359px) {
  .academic-home__capability-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.research-capabilities--sidebar h2 {
  display: block;
  min-height: 20px;
  line-height: 20px;
  letter-spacing: -0.02em;
  margin-inline: 8px;
}

.research-capabilities--sidebar .academic-home__capability-grid {
  grid-template-columns: minmax(0, 1fr);
  gap: 0;
  padding: 2px 0;
  margin: 0;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.research-capabilities--sidebar .academic-home__capability {
  padding: 10px 0;
  border: 0;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.4;
}

.research-capabilities--sidebar .academic-home__capability-copy strong {
  font-weight: inherit;
}
.research-capabilities--fill {
  display: flex;
  min-height: 0;
  height: 100%;
  flex-direction: column;
}
</style>
