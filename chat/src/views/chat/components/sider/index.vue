<script setup lang="ts">
import logo from '@/assets/logo.png'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAppStore, useAuthStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import { ExpandRight } from '@icon-park/vue-next'
import type { CSSProperties } from 'vue'
import { computed, onMounted, ref, watch } from 'vue'
import List from './List.vue'

const useGlobalStore = useGlobalStoreWithOut()

const appStore = useAppStore()
const chatStore = useChatStore()
const authStore = useAuthStore()

const { isMobile } = useBasicLayout()
const isLogin = computed(() => authStore.isLogin)
const logoPath = computed(() => authStore.globalConfig.clientLogoPath || logo)
const siteName = 'Lens'

const userEmail = computed(() => authStore.userInfo.email || '')
const avatarText = computed(() => {
  const base = (userEmail.value.split('@')[0] || authStore.userInfo.username || 'user').trim()
  return base.slice(0, 2).toUpperCase()
})
const displayEmailPrefix = computed(() => {
  const base = (userEmail.value.split('@')[0] || authStore.userInfo.username || 'user').trim()
  return base.slice(0, 3)
})

const collapsed = computed(() => appStore.siderCollapsed)

function handleUpdateCollapsed() {
  appStore.setSiderCollapsed(!collapsed.value)
}

function toggleLogin() {
  if (isLogin.value) authStore.logOut()
  else authStore.setLoginDialog(true)
}

const getMobileClass = computed<CSSProperties>(() => {
  if (isMobile.value) {
    return {
      position: 'fixed',
      zIndex: 50,
    }
  }
  return {}
})

const mobileSafeArea = computed(() => {
  if (isMobile.value) {
    return {
      paddingBottom: 'env(safe-area-inset-bottom)',
    }
  }
  return {}
})

watch(
  isMobile,
  val => {
    appStore.setSiderCollapsed(val)
  },
  {
    immediate: true,
    flush: 'post',
  }
)

onMounted(() => {
  chatStore.queryPlugins()
  if (isLogin.value) {
    chatStore.queryMyGroup()
  }
})

function openSettings(tab?: number) {
  if (isMobile.value) {
    useGlobalStore.updateMobileSettingsDialog(true, tab)
    appStore.setSiderCollapsed(true)
  } else {
    useGlobalStore.updateSettingsDialog(true, tab)
  }
}
</script>

<template>
  <div>
    <div
      class="fixed top-0 left-0 z-40 h-full transition-all duration-500 ease-in-out side-panel"
      :class="[
        isMobile ? 'w-[260px]' : 'w-[260px]',
        collapsed ? '-translate-x-full' : 'translate-x-0',
      ]"
      :style="getMobileClass"
    >
      <div
        class="flex flex-col h-full bg-opacity dark:bg-gray-900 select-none side-surface"
        :style="mobileSafeArea"
      >
        <main class="flex flex-col h-full flex-1">
          <div class="flex items-center justify-between px-5 pt-4 pb-3">
            <div class="flex items-center gap-2">
              <img :src="logoPath" alt="Logo" class="h-7 w-7 rounded-lg" />
              <span class="text-base font-semibold text-gray-900 dark:text-gray-100">
                {{ siteName }}
              </span>
            </div>
            <button
              type="button"
              class="btn-icon btn-icon-collapse btn-md"
              @click="handleUpdateCollapsed"
              aria-label="折叠侧边栏"
            >
              <ExpandRight size="20" />
            </button>
          </div>

          <div class="flex-1 min-h-0 overflow-hidden">
            <List />
          </div>

          <div class="px-5 py-4 border-t border-gray-200/70 dark:border-gray-800/70">
            <div v-if="isLogin" class="flex items-center justify-between gap-3">
              <button
                type="button"
                class="group flex items-center gap-3 min-w-0 w-full rounded-full px-2 py-1 transition-colors hover:bg-gray-100 dark:hover:bg-white/10"
                @click="openSettings(undefined)"
                aria-label="打开设置"
              >
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-full bg-[#22c55e] text-white text-xs font-semibold"
                >
                  {{ avatarText }}
                </div>
                <div class="flex flex-col min-w-0 text-left">
                  <span class="text-sm text-gray-800 dark:text-gray-200 truncate">
                    {{ displayEmailPrefix || '已登录' }}
                  </span>
                  <span class="text-[11px] text-gray-500 dark:text-gray-400">设置与账户</span>
                </div>
              </button>
            </div>
            <div v-else class="text-sm text-gray-600 leading-6">
              不要失去访问权限<br />
              登录后可同步项目和记录
              <div class="mt-3">
                <button
                  type="button"
                  class="btn btn-primary btn-md w-full rounded-full"
                  @click="toggleLogin"
                >
                  登录或注册
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>

    <!-- 移动端遮罩 -->
    <template v-if="isMobile">
      <div
        v-show="!collapsed"
        class="fixed inset-0 z-40 bg-black/40 transition-opacity duration-200 ease-in-out"
        @click="handleUpdateCollapsed"
      />
    </template>
  </div>
</template>
