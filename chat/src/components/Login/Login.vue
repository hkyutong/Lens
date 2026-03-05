<script setup lang="ts">
import logo from '@/assets/logo.png'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAuthStore } from '@/store'
import { Close } from '@icon-park/vue-next'
import { computed, ref } from 'vue'
import Email from './Email.vue'

defineProps<Props>()
const authStore = useAuthStore()
const { isMobile } = useBasicLayout()
const logoPath = computed(() => authStore.globalConfig.clientLogoPath || logo)

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
  <div v-if="visible" class="prism-login fixed inset-0 z-50 flex items-center justify-center">
    <div
      class="prism-login-card w-full flex flex-col relative"
      :class="{
        'w-[90vw] max-w-[360px] px-5 py-8': isMobile,
        'max-w-[420px] px-10 py-10': !isMobile,
      }"
    >
      <button
        @click="authStore.setLoginDialog(false)"
        class="btn-icon btn-sm absolute top-5 right-5 z-30 text-gray-300 hover:text-white"
      >
        <Close theme="outline" size="18" />
      </button>

      <div class="flex-1 flex flex-col items-center justify-center">
        <div class="mb-8 text-center">
          <div class="flex items-center justify-center mb-4">
            <img :src="logoPath" alt="YutoLens" class="h-10 w-10 rounded-2xl" />
          </div>
          <div class="text-xl font-semibold tracking-wide">欢迎使用 YutoLens</div>
          <div class="text-sm text-gray-300 mt-2">登录以继续进入科研工作区</div>
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
.prism-login {
  background: rgba(8, 8, 8, 0.7);
  backdrop-filter: blur(10px);
}

.prism-login-card {
  background: #080808;
  color: #ffffff;
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 40px 80px rgba(0, 0, 0, 0.5);
  min-height: auto;
  max-height: 90vh;
}

.prism-tab-group {
  display: grid;
  grid-auto-flow: column;
  gap: 8px;
  padding: 6px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
}

.prism-tab {
  border-radius: 999px;
  padding: 10px 16px;
  font-size: 0.95rem;
  color: rgba(255, 255, 255, 0.6);
  transition: all 0.2s ease;
}

.prism-tab.is-active {
  background: #ffffff;
  color: #080808;
  font-weight: 600;
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
}

.prism-login-card :deep(.input) {
  background: #ffffff;
  color: #080808;
  border: 1px solid #ffffff;
  border-radius: 999px;
  padding: 0.7rem 1rem;
  font-size: 0.9rem;
}

.prism-login-card :deep(.input::placeholder) {
  color: rgba(8, 8, 8, 0.5);
}

.prism-login-card :deep(.btn-primary) {
  background: #ffffff;
  border: none;
  color: #080808;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.prism-login-card :deep(.btn-primary:hover) {
  background: #ffffff;
}

.prism-login-card :deep(.btn-captcha) {
  background: #ffffff;
  color: #080808;
  border-radius: 999px;
}

.prism-login-card :deep(label) {
  color: rgba(255, 255, 255, 0.7);
}
</style>
