<script setup lang="ts">
import { useNativeDialog } from '@/hooks/useNativeDialog'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore } from '@/store'
import { Close } from '@icon-park/vue-next'
import { defineAsyncComponent, ref } from 'vue'
import yutoGptLogo from '@/assets/yutogpt-logo.svg'

const Email = defineAsyncComponent(() => import('./Email.vue'))

const props = defineProps<Props>()
const dialogRef = ref<HTMLDialogElement | null>(null)
useNativeDialog(dialogRef, () => props.visible)
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
  <dialog v-if="visible" ref="dialogRef" class="lens-dialog academic-login flex items-center justify-center"
    :aria-label="t('lens.login.title')" @cancel.prevent="authStore.setLoginDialog(false)">
    <div
      class="academic-login-card flex flex-col relative"
      :class="{
        'w-[90vw] max-w-[360px] px-5 py-8': isMobile,
        'w-full max-w-[420px] px-10 py-10': !isMobile,
      }"
    >
      <button
        @click="authStore.setLoginDialog(false)"
        type="button"
        class="academic-login-close absolute top-5 right-5 z-30"
        :aria-label="t('lens.header.close')"
      >
        <Close theme="outline" size="16" />
      </button>

      <div class="flex-1 flex flex-col items-center justify-center">
        <div class="mb-8 text-center">
          <div class="flex items-center justify-center mb-4">
            <div class="academic-login-brand">
              <img :src="yutoGptLogo" alt="Lens" />
            </div>
          </div>
          <div class="academic-login-title">{{ t('lens.login.title') }}</div>
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
  </dialog>
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
  max-height: 90dvh;
  overflow-y: auto;
}

.academic-login-brand {
  display: inline-flex;
  align-items: center;
}

.academic-login-brand img {
  width: 28px;
  height: 28px;
  object-fit: contain;
  filter: var(--brand-logo-filter);
}

.academic-login-title {
  color: var(--text-main);
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -0.025em;
  line-height: 1.25;
}

.academic-login-close {
  display: grid;
  place-items: center;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  width: 44px;
  height: 44px;
  color: var(--text-sub);
}

.academic-login-close:hover {
  color: var(--text-main);
}

.academic-login-close:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.academic-login-card :deep(.input) {
  background: var(--surface-card);
  color: var(--text-main);
  border-radius: var(--radius-control);
  padding: 0.7rem 1rem;
  font-size: 0.9rem;
}

.academic-login-card :deep(.input:focus),
.academic-login-card :deep(.input:focus-visible) {
  border-color: var(--input-border-focus);
  outline: none;
  box-shadow: none;
}

@media (max-width: 1023px) {
  .academic-login-card :deep(.input) { font-size: 16px; }
}

.academic-login-card :deep(.input::placeholder) {
  color: var(--text-sub);
}

.academic-login-card :deep(.btn-primary) {
  min-height: 44px;
  background: var(--academic-blue);
  border: none;
  color: var(--btn-text-primary);
  border-radius: var(--radius-button);
  font-weight: 600;
  letter-spacing: 0.02em;
}

.academic-login-card :deep(.btn-primary:hover) {
  background: var(--academic-blue-strong);
}

.academic-login-card :deep(.btn-captcha) {
  background: var(--academic-blue-soft);
  color: var(--academic-blue);
  border-radius: var(--radius-button);
}

.academic-login-card :deep(label) {
  color: var(--text-sub);
}
</style>
