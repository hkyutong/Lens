<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAppStore, useAuthStore } from '@/store'
import { LENS_USAGE_NOTICE } from '@/constants/usageNotice'
import { MdPreview } from 'md-editor-v3'
import 'md-editor-v3/lib/preview.css'
import { computed, onMounted, watch } from 'vue'

const authStore = useAuthStore()
const appStore = useAppStore()
const darkMode = computed(() => appStore.theme === 'dark')
const { isMobile } = useBasicLayout()

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
    summary: '轻量学术读写',
    workflow: '不支持能力编排',
    available: [
      '总结论文、Arxiv 摘要、Arxiv 英文摘要',
      '中文润色、英文润色、中英互译',
      '绘制脑图、代码解释、参考文献转 BibTeX',
    ],
    limited: '不含 PDF 深读、PDF 批量总结、Word 批量总结和 LaTeX 进阶工具。',
  },
  {
    name: 'Pro',
    summary: '高频论文阅读与文稿处理',
    workflow: '最多 2 步编排',
    available: [
      '包含 Plus 全部能力',
      'PDF 深读、PDF 批量总结、Word 批量总结',
      'LaTeX 摘要、精准翻译、英文润色、中文润色、高亮纠错',
    ],
    limited: '适合“PDF 深读 → 英文润色”这类常规研究流程。',
  },
  {
    name: 'Max',
    summary: '重度科研与完整研究链路',
    workflow: '最多 3 步编排',
    available: [
      '包含 Pro 全部能力',
      '可使用 Lens 当前开放的全部学术能力',
      '支持“论文速读 → 中文润色 → 绘制脑图”等完整链路',
    ],
    limited: '适合长论文、多文件和复杂研究任务。',
  },
]

const billingRules = [
  '月付套餐和月卡密按 30 天有效期发放对应额度。',
  '年付套餐和年卡密按 365 天有效期发放 12 个月额度。',
  '普通积分、高级积分、顶级积分会按任务选择的模型和系统显示扣除。',
  '会员到期后会员权益停止生效，需要续费或兑换新的会员卡密。',
]

const taskRules = [
  '多能力编排是串行执行，前一步完成后才会进入下一步。',
  'PDF、Word、LaTeX、长论文和上游模型较慢时，整体耗时会更长。',
  '请不要上传密钥、证件、合同、客户资料、账号密码或其他敏感内容。',
  'AI 输出可能存在错误，重要结论、引用和实验信息请自行核验。',
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
        {{ globalConfig.noticeTitle || '使用必读' }}
      </div>

      <div class="overflow-y-auto" :class="{ 'max-h-[calc(70vh-120px)]': !isMobile }">
        <div v-if="isLensPlanNotice" class="usage-notice">
          <section class="usage-notice__intro">
            <span class="usage-notice__eyebrow">套餐规则</span>
            <h2>先确认你的套餐能做什么</h2>
            <p>
              Lens 按 Plus、Pro、Max 三档开放学术能力。会员有效期内可使用对应能力，
              每次任务仍会按所选模型和任务类型消耗积分。
            </p>
          </section>

          <section class="usage-notice__plans" aria-label="套餐能力对比">
            <article v-for="plan in usagePlans" :key="plan.name" class="usage-notice__plan">
              <div class="usage-notice__plan-head">
                <div>
                  <span class="usage-notice__plan-name">{{ plan.name }}</span>
                  <p>{{ plan.summary }}</p>
                </div>
                <strong>{{ plan.workflow }}</strong>
              </div>
              <ul>
                <li v-for="item in plan.available" :key="item">{{ item }}</li>
              </ul>
              <p class="usage-notice__plan-note">{{ plan.limited }}</p>
            </article>
          </section>

          <section class="usage-notice__rule-grid">
            <div class="usage-notice__rule-block">
              <h3>计费与有效期</h3>
              <ol>
                <li v-for="item in billingRules" :key="item">{{ item }}</li>
              </ol>
            </div>
            <div class="usage-notice__rule-block">
              <h3>任务执行说明</h3>
              <ol>
                <li v-for="item in taskRules" :key="item">{{ item }}</li>
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
