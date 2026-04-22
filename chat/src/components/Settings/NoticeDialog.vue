<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAppStore, useAuthStore } from '@/store'
import { LENS_USAGE_NOTICE } from '@/constants/usageNotice'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const authStore = useAuthStore()
const appStore = useAppStore()
const darkMode = computed(() => appStore.theme === 'dark')
const { isMobile } = useBasicLayout()
const { t } = useI18n()

interface Props {
  visible: boolean
}

const props = defineProps<Props>()
const globalConfig = computed(() => authStore.globalConfig)
const noticeContent = computed(() => globalConfig.value.noticeInfo || LENS_USAGE_NOTICE)
const isLensPlanNotice = computed(() => {
  const content = noticeContent.value || ''
  return content.includes('套餐使用规则') && content.includes('Plus') && content.includes('Pro') && content.includes('Max')
})

const usagePlans = [
  {
    name: 'Plus',
    summaryKey: 'lens.usageNotice.plusSummary',
    workflowKey: 'lens.usageNotice.plusWorkflow',
    availableKeys: [
      'lens.usageNotice.plusAvailable1',
      'lens.usageNotice.plusAvailable2',
      'lens.usageNotice.plusAvailable3',
    ],
    noteKey: 'lens.usageNotice.plusNote',
  },
  {
    name: 'Pro',
    summaryKey: 'lens.usageNotice.proSummary',
    workflowKey: 'lens.usageNotice.proWorkflow',
    availableKeys: [
      'lens.usageNotice.proAvailable1',
      'lens.usageNotice.proAvailable2',
      'lens.usageNotice.proAvailable3',
    ],
    noteKey: 'lens.usageNotice.proNote',
  },
  {
    name: 'Max',
    summaryKey: 'lens.usageNotice.maxSummary',
    workflowKey: 'lens.usageNotice.maxWorkflow',
    availableKeys: [
      'lens.usageNotice.maxAvailable1',
      'lens.usageNotice.maxAvailable2',
      'lens.usageNotice.maxAvailable3',
    ],
    noteKey: 'lens.usageNotice.maxNote',
  },
]

const billingRules = [
  'lens.usageNotice.billingRule1',
  'lens.usageNotice.billingRule2',
  'lens.usageNotice.billingRule3',
  'lens.usageNotice.billingRule4',
]

const taskRules = [
  'lens.usageNotice.taskRule1',
  'lens.usageNotice.taskRule2',
  'lens.usageNotice.taskRule3',
  'lens.usageNotice.taskRule4',
]

function openDrawerAfter() {
  // 刷新全局配置数据，确保获取最新的公告信息
  authStore.getGlobalConfig().catch(error => {
    console.error('获取最新公告信息失败:', error)
  })
}

watch(
  () => props.visible,
  isVisible => {
    if (isVisible) {
      // 当组件变为可见时刷新数据
      openDrawerAfter()
    }
  }
)

onMounted(() => {
  if (props.visible) {
    openDrawerAfter()
  }
})
</script>

<template>
  <div class="overflow-y-auto custom-scrollbar p-1" :class="{ 'max-h-[70vh]': !isMobile }">
    <!-- 公告信息卡片 -->
    <div
      class="mb-4 flex flex-col space-y-4 rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4"
    >
      <!-- 卡片标题 -->
      <div
        class="border-b border-[var(--border-color)] pb-2 text-base font-semibold text-[var(--text-main)]"
      >
        {{ isLensPlanNotice ? t('lens.usageNotice.title') : globalConfig.noticeTitle || t('lens.settings.notice') }}
      </div>

      <div class="overflow-y-auto" :class="{ 'max-h-[calc(70vh-120px)]': !isMobile }">
        <div v-if="isLensPlanNotice" class="usage-notice">
          <section class="usage-notice__intro">
            <span class="usage-notice__eyebrow">{{ t('lens.usageNotice.eyebrow') }}</span>
            <h2>{{ t('lens.usageNotice.heroTitle') }}</h2>
            <p>
              {{ t('lens.usageNotice.heroDesc') }}
            </p>
          </section>

          <section class="usage-notice__plans" aria-label="套餐能力对比">
            <article v-for="plan in usagePlans" :key="plan.name" class="usage-notice__plan">
              <div class="usage-notice__plan-head">
                <div>
                  <span class="usage-notice__plan-name">{{ plan.name }}</span>
                  <p>{{ t(plan.summaryKey) }}</p>
                </div>
                <strong>{{ t(plan.workflowKey) }}</strong>
              </div>
              <ul>
                <li v-for="item in plan.availableKeys" :key="item">{{ t(item) }}</li>
              </ul>
              <p class="usage-notice__plan-note">{{ t(plan.noteKey) }}</p>
            </article>
          </section>

          <section class="usage-notice__rule-grid">
            <div class="usage-notice__rule-block">
              <h3>{{ t('lens.usageNotice.billingTitle') }}</h3>
              <ol>
                <li v-for="item in billingRules" :key="item">{{ t(item) }}</li>
              </ol>
            </div>
            <div class="usage-notice__rule-block">
              <h3>{{ t('lens.usageNotice.taskTitle') }}</h3>
              <ol>
                <li v-for="item in taskRules" :key="item">{{ t(item) }}</li>
              </ol>
            </div>
          </section>
        </div>

        <MdPreview
          v-else
          editorId="preview-only"
          :modelValue="noticeContent"
          :theme="darkMode ? 'dark' : 'light'"
          class="w-full"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar {
  scrollbar-width: thin;
  scrollbar-color: rgba(155, 155, 155, 0.5) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(155, 155, 155, 0.5);
  border-radius: 20px;
  border: transparent;
}

/* 暗黑模式下滚动条样式 */
.dark .custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: rgba(100, 100, 100, 0.5);
}

.dark .custom-scrollbar {
  scrollbar-color: rgba(100, 100, 100, 0.5) transparent;
}

.usage-notice {
  display: flex;
  flex-direction: column;
  gap: 20px;
  color: var(--text-main);
}

.usage-notice__intro {
  max-width: 840px;
  padding: 6px 2px 2px;
}

.usage-notice__eyebrow {
  display: inline-flex;
  margin-bottom: 12px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.16em;
  color: var(--text-sub);
}

.usage-notice__intro h2 {
  margin: 0;
  font-size: clamp(28px, 4vw, 44px);
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: -0.04em;
}

.usage-notice__intro p {
  margin: 16px 0 0;
  max-width: 780px;
  font-size: 15px;
  line-height: 1.9;
  color: var(--text-sub);
}

.usage-notice__plans {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.usage-notice__plan {
  display: flex;
  min-height: 280px;
  flex-direction: column;
  gap: 18px;
  border: 1px solid var(--border-color);
  border-radius: 24px;
  padding: 22px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.68), rgba(255, 255, 255, 0)),
    var(--surface-card);
}

.usage-notice__plan-head {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.usage-notice__plan-name {
  display: block;
  font-size: 26px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.04em;
}

.usage-notice__plan-head p {
  margin: 8px 0 0;
  font-size: 13px;
  color: var(--text-sub);
}

.usage-notice__plan-head strong {
  width: fit-content;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  padding: 6px 10px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-main);
}

.usage-notice__plan ul,
.usage-notice__rule-block ol {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.usage-notice__plan li,
.usage-notice__rule-block li {
  position: relative;
  padding-left: 16px;
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-main);
}

.usage-notice__plan li::before,
.usage-notice__rule-block li::before {
  position: absolute;
  top: 0.75em;
  left: 0;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: currentColor;
  content: '';
  opacity: 0.45;
}

.usage-notice__plan-note {
  margin: auto 0 0;
  border-top: 1px solid var(--border-color);
  padding-top: 14px;
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-sub);
}

.usage-notice__rule-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.usage-notice__rule-block {
  border-radius: 22px;
  border: 1px solid var(--border-color);
  padding: 20px 22px;
  background: var(--surface-card);
}

.usage-notice__rule-block h3 {
  margin: 0 0 14px;
  font-size: 16px;
  font-weight: 800;
  letter-spacing: -0.02em;
}

@media (max-width: 960px) {
  .usage-notice__plans,
  .usage-notice__rule-grid {
    grid-template-columns: 1fr;
  }

  .usage-notice__plan {
    min-height: 0;
  }
}
</style>
