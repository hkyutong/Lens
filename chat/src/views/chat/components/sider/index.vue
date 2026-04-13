<script setup lang="ts">
import logo from '@/assets/logo.png'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAppStore, useAuthStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import { ExpandRight } from '@icon-park/vue-next'
import type { CSSProperties } from 'vue'
import { computed, onMounted, watch } from 'vue'
import List from './List.vue'

const useGlobalStore = useGlobalStoreWithOut()

const appStore = useAppStore()
const chatStore = useChatStore()
const authStore = useAuthStore()

const { isMobile } = useBasicLayout()
const isLogin = computed(() => authStore.isLogin)
const logoPath = computed(() => authStore.globalConfig.clientLogoPath || logo)
const siteName = computed(() => authStore.globalConfig?.siteName || 'Lens')

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
      class="fixed top-0 left-0 z-40 h-full transition-transform duration-500 ease-in-out side-panel"
      :class="[
        isMobile ? 'w-[260px]' : 'w-[260px]',
        collapsed ? '-translate-x-full' : 'translate-x-0',
      ]"
      :style="getMobileClass"
    >
      <div
        class="flex flex-col h-full bg-[var(--bg-sidebar)] select-none side-surface"
        :style="mobileSafeArea"
      >
        <main class="flex flex-col h-full flex-1">
          <div class="flex items-center justify-between px-5 pt-5 pb-4">
            <div class="flex items-center gap-3">
              <img :src="logoPath" alt="Logo" class="h-[26px] w-[26px] rounded-md" />
              <div class="min-w-0">
                <div class="text-[16px] font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {{ siteName }}
                </div>
              </div>
            </div>
            <button
              type="button"
              class="btn-icon btn-icon-collapse btn-md text-gray-700 dark:text-gray-100"
              @click="handleUpdateCollapsed"
              aria-label="折叠侧边栏"
            >
              <ExpandRight size="20" />
            </button>
          </div>

          <div class="flex-1 min-h-0 overflow-hidden">
            <List />
          </div>

          <div v-if="isLogin" class="px-5 py-4">
            <div class="flex items-center justify-between gap-3">
              <button
                type="button"
                class="group flex items-center gap-3 min-w-0 w-full rounded-[12px] bg-[var(--surface-muted)] px-3 py-3 transition-colors hover:bg-[var(--surface-panel)]"
                @click="openSettings(undefined)"
                aria-label="打开设置"
              >
                <div
                  class="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--user-avatar-bg)] text-white text-xs font-semibold"
                >
                  {{ avatarText }}
                </div>
                <div class="flex flex-col min-w-0 text-left">
                  <span class="text-sm text-gray-800 dark:text-gray-200 truncate">
                    {{ displayEmailPrefix || t('lens.sidebar.signedIn') }}
                  </span>
                  <span class="text-[11px] text-[var(--ink-faint)]">{{ t('lens.sidebar.account') }}</span>
                </div>
              </button>
            </div>
          </div>
          <div v-else class="px-5 py-4">
            <button
              type="button"
              class="flex items-center justify-between gap-3 w-full rounded-[12px] bg-[var(--surface-muted)] px-3 py-3 text-left transition-colors hover:bg-[var(--surface-panel)]"
              @click="toggleLogin"
            >
              <div class="min-w-0">
                <div class="text-sm font-medium text-[var(--text-main)]">{{ t('lens.sidebar.login') }}</div>
                <div class="mt-1 text-[11px] text-[var(--ink-faint)]">
                  {{ t('lens.sidebar.loginDesc') }}
                </div>
              </div>
            </button>
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
