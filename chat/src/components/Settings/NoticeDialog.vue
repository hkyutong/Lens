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
const credentialDisclosurePatterns = [
  /(?:初始|默认|預設).{0,16}(?:管理员|管理員|预览|預覽|账号|帳號|账户|帳戶|用户|用戶).{0,24}(?:密码|密碼|口令)/i,
  /(?:账号|帳號|账户|帳戶|用户名|用戶名)\s*[:：=]\s*\S+.{0,40}(?:密码|密碼|口令)\s*[:：=]\s*\S+/i,
  /\b(?:password|passwd|pwd)\s*[:：=]\s*\S+/i,
  /\b(?:admin|super|root)\s+[A-Za-z0-9!@#$%^&*._-]{4,}\b/i,
]

function sanitizeNotice(value: unknown) {
  const normalized = String(value || '')
    .replace(/\bYutoLens\b/gi, 'Lens')
    .trim()
  if (!normalized) return LENS_USAGE_NOTICE
  return credentialDisclosurePatterns.some(pattern => pattern.test(normalized))
    ? LENS_USAGE_NOTICE
    : normalized
}

const noticeContent = computed(() => sanitizeNotice(globalConfig.value.noticeInfo))
const isLensPlanNotice = computed(() => {
  const content = noticeContent.value || ''
  const hasPlanNames =
    (content.includes('Plus') && content.includes('Pro') && content.includes('Max')) ||
    (content.includes('学生版') && content.includes('教授版') && content.includes('至尊版'))
  return content.includes('套餐使用规则') && hasPlanNames
})

const usagePlans = [
  {
    key: 'plus',
    nameKey: 'lens.member.plus',
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
    key: 'pro',
    nameKey: 'lens.member.pro',
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
    key: 'max',
    nameKey: 'lens.member.max',
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
  authStore.getGlobalConfig().catch(() => { /* Retain the already loaded public notice. */ })
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
  <div class="research-guide" :class="{ 'max-h-[70vh]': !isMobile }">
    <!-- 公告信息卡片 -->
    <div
      class="research-guide__article"
    >
      <!-- 卡片标题 -->


      <div class="research-guide__body" :class="{ 'max-h-[calc(70vh-120px)]': !isMobile }">
        <div v-if="isLensPlanNotice" class="research-guide__content">
          <section class="research-guide__intro">

            <h2>{{ t('lens.usageNotice.heroTitle') }}</h2>
            <p>
              {{ t('lens.usageNotice.heroDesc') }}
            </p>
          </section>

          <section class="research-guide__tiers" aria-label="套餐能力对比">
            <details v-for="plan in usagePlans" :key="plan.key" class="research-guide__tier">
              <summary class="research-guide__tier-heading">
                <div class="research-guide__tier-name">
                  <span class="research-guide__tier-badge">{{ t(plan.nameKey) }}</span>
                  <p>{{ t(plan.summaryKey) }}</p>
                </div>
                <strong>{{ t(plan.workflowKey) }}</strong>
              </summary>
              <ul>
                <li v-for="item in plan.availableKeys" :key="item">{{ t(item) }}</li>
              </ul>
              <p class="research-guide__tier-note">{{ t(plan.noteKey) }}</p>
            </details>
          </section>

          <section class="research-guide__notes">
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
.research-guide {
  color: inherit;
}

.research-guide .research-guide__article, .research-guide .research-guide__body, .research-guide .research-guide__content {
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
}

.research-guide .research-guide__intro {
  margin: 0 0 22px;
}

.research-guide .research-guide__intro h2 {
  margin: 0 0 10px;
  font-size: 20px;
  line-height: 1.4;
  letter-spacing: -.3px;
  font-weight: 600;
}

.research-guide .research-guide__intro p {
  margin: 0;
  color: color-mix(in srgb, currentColor 65%, transparent);
  font-size: 14px;
  line-height: 1.8;
}

.research-guide .research-guide__tiers {
  display: grid;
  grid-template-columns: minmax(0,1fr);
  gap: 6px;
  margin: 0 0 26px;
}

.research-guide .research-guide__tier {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
}

.research-guide .research-guide__tier-heading {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin: 0;
  padding: 12px 26px 12px 0;
  border: 0;
  list-style: none;
  cursor: pointer;
  border-radius: var(--radius-control);
}

.research-guide .research-guide__tier-heading::-webkit-details-marker {
  display: none;
}

.research-guide .research-guide__tier-heading::after {
  content: '';
  position: absolute;
  right: 4px;
  top: calc(50% - 5px);
  width: 7px;
  height: 7px;
  border-right: 1.5px solid color-mix(in srgb, currentColor 65%, transparent);
  border-bottom: 1.5px solid color-mix(in srgb, currentColor 65%, transparent);
  transform: rotate(45deg);
}

.research-guide .research-guide__tier[open] > .research-guide__tier-heading::after {
  transform: rotate(225deg);
  top: calc(50% - 1px);
}

.research-guide .research-guide__tier-heading:hover .research-guide__tier-badge {
  color: var(--academic-blue);
}

.research-guide .research-guide__tier-heading:focus-visible {
  outline: 2px solid var(--academic-blue);
  outline-offset: 3px;
}

.research-guide .research-guide__tier-name {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.research-guide .research-guide__tier-name p {
  margin: 0;
  font-size: 13px;
  font-weight: 400;
  line-height: 1.6;
  color: color-mix(in srgb, currentColor 65%, transparent);
}

.research-guide .research-guide__tier-badge {
  display: block;
  margin: 0;
  padding: 0;
  background: transparent;
  color: var(--academic-blue);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.5;
}

.research-guide .research-guide__tier-heading > :last-child:not(.research-guide__tier-name) {
  flex-shrink: 0;
  margin: 0;
  padding: 0;
  background: transparent;
  color: color-mix(in srgb, currentColor 65%, transparent);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.6;
}

.research-guide .research-guide__tier ul {
  margin: 4px 0 12px;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.85;
}

.research-guide .research-guide__tier li {
  margin: 4px 0;
  padding: 0;
}

.research-guide .research-guide__tier li::marker {
  color: var(--academic-blue);
}

.research-guide .research-guide__tier-note {
  margin: 0 0 18px;
  font-size: 13px;
  line-height: 1.75;
  color: color-mix(in srgb, currentColor 65%, transparent);
}

.research-guide .research-guide__notes {
  display: grid;
  grid-template-columns: repeat(2,minmax(0,1fr));
  gap: 24px;
  margin: 0;
  padding: 0;
  border: 0;
}

.research-guide .research-guide__notes > * {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
}

.research-guide .research-guide__notes :is(h2,h3,h4) {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.5;
}

.research-guide .research-guide__notes p {
  margin: 6px 0;
  font-size: 13px;
  line-height: 1.8;
}

@media (max-width: 720px) {
  .research-guide .research-guide__intro {
    margin-bottom: 18px;
  }

  .research-guide .research-guide__intro h2 {
    font-size: 18px;
  }

  .research-guide .research-guide__tiers {
    gap: 4px;
    margin-bottom: 24px;
  }

  .research-guide .research-guide__tier-heading {
    gap: 10px;
    padding-top: 14px;
    padding-bottom: 14px;
  }

  .research-guide .research-guide__tier-heading > :last-child:not(.research-guide__tier-name) {
    max-width: 78px;
    text-align: right;
  }

  .research-guide .research-guide__notes {
    grid-template-columns: minmax(0,1fr);
    gap: 24px;
  }
}

.research-guide .research-guide__notes :is(ul,ol) {
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 13px;
  line-height: 1.8;
}

.research-guide .research-guide__notes li {
  margin: 6px 0;
  font-size: 13px;
  line-height: 1.8;
}
</style>
