<script setup lang="ts">
import type { ResData } from '@/api/types'
import { fetchGetQRCodeAPI, fetchGetQRSceneStrAPI, fetchLoginBySceneStrAPI } from '@/api/user'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore } from '@/store'
import { message } from '@/utils/message'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const timer = ref<ReturnType<typeof setInterval> | null>(null)
const countdownTimer = ref<ReturnType<typeof setInterval> | null>(null)
const timerStartTime = ref(0)
const wxLoginUrl = ref('')
const sceneStr = ref('')
const activeCount = ref(false)
const loading = ref(false) // 控制加载状态
const ms = message()
const authStore = useAuthStore()
const { isMobile } = useBasicLayout()
const lastErrorToastAt = ref(0)
const pendingToken = ref<string | null>(null)

const agreedToPolicies = ref(false)
const showPolicyModal = ref(false)
const policyTitle = ref('')
const policyUrl = ref('')
const termsUrl = '/legal/terms.html'
const privacyUrl = '/legal/privacy.html'

function openPolicy(title: string, url: string) {
  policyTitle.value = title
  policyUrl.value = url
  showPolicyModal.value = true
}

function closePolicy() {
  showPolicyModal.value = false
}

function loadImage(src: string) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

function maybeToastError(message: string) {
  const now = Date.now()
  if (now - lastErrorToastAt.value > 3000) {
    ms.error(message)
    lastErrorToastAt.value = now
  }
}

function clearLoginTimer() {
  if (timer.value !== null) {
    clearInterval(timer.value)
    timer.value = null
  }
}

function clearCountdownTimer() {
  if (countdownTimer.value !== null) {
    clearInterval(countdownTimer.value)
    countdownTimer.value = null
  }
}

function resetQrState() {
  wxLoginUrl.value = ''
  sceneStr.value = ''
  activeCount.value = false
  loading.value = false
}

function finalizeLogin(token: string) {
  clearLoginTimer()
  clearCountdownTimer()
  pendingToken.value = null
  ms.success(t('login.loginSuccess'))
  authStore.setToken(token)
  authStore.getUserInfo()
  authStore.setLoginDialog(false)
}

async function getSeneStr() {
  try {
    const params = {}
    const res: ResData = await fetchGetQRSceneStrAPI(params)
    if (res.success) {
      sceneStr.value = res.data
      await getQrCodeUrl()
    }
  } catch (error) {
    loading.value = false
    maybeToastError('二维码获取失败，请稍后重试')
  }
}

async function loginBySnece() {
  if (!sceneStr.value) return
  try {
    const res: ResData = await fetchLoginBySceneStrAPI({
      sceneStr: sceneStr.value,
    })
    if (res.success && res.data) {
      if (!agreedToPolicies.value) {
        pendingToken.value = res.data
        clearLoginTimer()
        clearCountdownTimer()
        maybeToastError('请阅读并同意《服务协议》和《隐私政策》')
        return
      }
      finalizeLogin(res.data)
    }
  } catch (error) {
    maybeToastError('网络异常，请稍后重试')
  }
}

async function getQrCodeUrl() {
  clearLoginTimer()
  loading.value = true // 开始加载
  try {
    const res: ResData = await fetchGetQRCodeAPI({ sceneStr: sceneStr.value })
    if (res.success) {
      activeCount.value = true
      await loadImage(res.data)
      wxLoginUrl.value = res.data
      loading.value = false // 加载完成
      timerStartTime.value = Date.now()
      timer.value = setInterval(() => {
        if (Date.now() - timerStartTime.value > 60000) {
          clearLoginTimer()
          return
        }
        loginBySnece()
      }, 1000)
    } else {
      loading.value = false
    }
  } catch (error) {
    loading.value = false
    maybeToastError('二维码加载失败，请稍后重试')
  }
}

function handleTimeDown() {
  clearLoginTimer()
  getSeneStr()
  // 重新获取二维码无需依赖 countdownRef
}

watch(agreedToPolicies, agreed => {
  if (agreed && pendingToken.value) {
    finalizeLogin(pendingToken.value)
  }
})

onMounted(() => {
  handleTimeDown()
  clearCountdownTimer()
  countdownTimer.value = setInterval(handleTimeDown, 60000)
})

onBeforeUnmount(() => {
  // 清除用于检测的timer
  clearLoginTimer()
  // 组件卸载时，也清除handleTimeDown的countdownTimer
  clearCountdownTimer()
  resetQrState()
})
</script>

<template>
  <div class="w-full h-full flex flex-col justify-between" :class="isMobile ? 'px-5 ' : 'px-10 '">
    <div class="flex flex-col items-center flex-1">
      <div class="relative w-[200px] h-[200px] mb-6 mt-auto">
        <img
          v-if="wxLoginUrl"
          class="w-full h-full select-none shadow-sm rounded-lg object-cover border border-gray-100 dark:border-gray-700"
          :src="wxLoginUrl"
          alt="微信登录二维码"
        />

        <div
          v-else
          class="w-full h-full rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"
        ></div>

        <div
          v-if="loading"
          class="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2"
        >
          <div
            class="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600 dark:border-primary-400"
          ></div>
        </div>
      </div>

      <p class="text-sm text-gray-600 dark:text-gray-400 mb-2">请使用微信扫描二维码登录</p>

      <div class="flex items-start mt-8">
        <input
          v-model="agreedToPolicies"
          type="checkbox"
          class="mt-0.5 h-4 w-4 rounded border-white/40 bg-white text-[#080808] focus:ring-black/20"
        />
        <p class="ml-2 text-sm text-white/70">
          <button
            type="button"
            class="font-medium text-white opacity-80 hover:opacity-100"
            @click="openPolicy('服务协议', termsUrl)"
          >
            《服务协议》
          </button>
          和
          <button
            type="button"
            class="font-medium text-white opacity-80 hover:opacity-100"
            @click="openPolicy('隐私政策', privacyUrl)"
          >
            《隐私政策》
          </button>
        </p>
      </div>
    </div>

    <!-- 添加空白div保持与Email组件对齐 -->
    <div class="h-6"></div>

    <div
      v-if="showPolicyModal"
      class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
    >
      <div
        class="bg-white dark:bg-gray-900 rounded-xl shadow-lg w-[90vw] h-[80vh] max-w-3xl overflow-hidden flex flex-col"
      >
        <div
          class="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-800"
        >
          <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
            {{ policyTitle }}
          </span>
          <button
            type="button"
            class="btn-icon btn-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            @click="closePolicy"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>
        <iframe
          :src="policyUrl"
          class="w-full flex-1 border-0"
          referrerpolicy="no-referrer"
        ></iframe>
      </div>
    </div>
  </div>
</template>
