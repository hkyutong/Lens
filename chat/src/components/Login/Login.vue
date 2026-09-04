<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore } from '@/store'
import { Close } from '@icon-park/vue-next'
import { defineAsyncComponent, ref } from 'vue'

const Email = defineAsyncComponent(() => import('./Email.vue'))

defineProps<Props>()
const authStore = useAuthStore()
const { isMobile } = useBasicLayout()
// 当前登录类型：wechat(微信登录), password(密码登录), captcha(验证码登录)
const loginType = ref('password')

// 自动选择合适的登录方式

interface Props {
  visible: boolean
}

/* 切换登录类型 */
function changeLoginType(type: string) {
  loginType.value = type
}
</script>

<template>
  <div v-if="visible" class="academic-login fixed inset-0 z-50 flex items-center justify-center">
    <div
      class="academic-login-card w-full flex flex-col relative"
      :class="{
        'w-[90vw] max-w-[360px] px-5 py-8': isMobile,
        'max-w-[420px] px-10 py-10': !isMobile,
      }"
    >
      <button
        @click="authStore.setLoginDialog(false)"
        class="btn-icon btn-sm absolute top-5 right-5 z-30 text-gray-300 hover:text-white"
        :aria-label="t('lens.header.close')"
      >
        <Close theme="outline" size="18" />
      </button>

      <div class="flex-1 flex flex-col items-center justify-center">
        <div class="mb-8 text-center">
          <div class="flex items-center justify-center mb-4">
            <div class="academic-login-mark" aria-hidden="true">L</div>
          </div>
          <div class="text-xl font-semibold tracking-wide">{{ t('lens.login.title') }}</div>
          <div class="text-sm text-gray-500 mt-2">{{ t('lens.login.subtitle') }}</div>
        </div>
        <!-- 登录组件区域 -->
        <div class="w-full flex-1 flex flex-col overflow-hidden">
          <Email
            :login-mode="loginType === 'password' ? 'password' : 'captcha'"
            @changeLoginType="changeLoginType"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.academic-login {
  background: var(--modal-overlay);
  backdrop-filter: blur(10px);
}

.academic-login-card {
  background: var(--surface-panel);
  color: var(--text-main);
  border-radius: 18px;
  border: 1px solid var(--paper-border);
  box-shadow: var(--dialog-shadow);
  min-height: auto;
  max-height: 90vh;
}

.academic-login-mark {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border: 1px solid var(--academic-border);
  border-radius: 8px;
  background: var(--academic-blue);
  color: #fff;
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 22px;
  font-weight: 700;
}

.academic-tab-group {
  display: grid;
  grid-auto-flow: column;
  gap: 8px;
  padding: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.academic-tab {
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.6);
  transition: all 0.2s ease;
}

.academic-tab.is-active {
  background: #ffffff;
  color: #080808;
  font-weight: 600;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.academic-login-card :deep(.input) {
  background: var(--surface-card);
  color: var(--text-main);
  border: 1px solid var(--paper-border);
  border-radius: 9px;
  padding: 0.7rem 1rem;
  font-size: 0.9rem;
}

.academic-login-card :deep(.input::placeholder) {
  color: var(--ink-faint);
}

.academic-login-card :deep(.btn-primary) {
  background: var(--academic-blue);
  border: none;
  color: #ffffff;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.academic-login-card :deep(.btn-primary:hover) {
  background: var(--academic-blue-deep);
}

.academic-login-card :deep(.btn-captcha) {
  background: var(--academic-blue-soft);
  color: var(--academic-blue);
  border-radius: 9px;
}

.academic-login-card :deep(label) {
  color: var(--text-sub);
}
</style>
