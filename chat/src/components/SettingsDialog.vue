<template>
  <transition name="modal-fade">
    <div
      v-if="props.visible"
      class="fixed inset-0 z-[9000] flex items-center justify-center bg-gray-900 bg-opacity-50"
    >
      <div
        class="bg-white/95 dark:bg-gray-800 rounded-2xl shadow-2xl border border-black/5 dark:border-white/10 flex flex-col backdrop-blur"
        :class="isMobile ? 'w-full h-full rounded-none' : 'h-[82vh] w-full max-w-5xl p-5 mx-2'"
      >
        <!-- 标题部分 -->
        <div
          class="flex justify-between items-center mb-4 pb-3 border-b border-gray-100 dark:border-white/10"
        >
          <span class="text-xl font-semibold text-gray-900 dark:text-white">设置</span>
          <button @click="handleClose" class="btn-icon btn-md">
            <Close size="20" />
          </button>
        </div>
        <!-- 主体部分 -->
        <div class="flex flex-grow min-h-0">
          <!-- 左边标签栏 -->
          <div
            class="w-1/4 bg-gray-50/80 dark:bg-gray-900/40 rounded-2xl p-2 border border-gray-100 dark:border-white/10 flex flex-col min-h-0 overflow-y-auto"
          >
            <div
              v-for="(tab, index) in tabs"
              :key="index"
              @click="switchTab(index)"
              class="relative flex items-center gap-3 px-4 py-3 my-1 break-all rounded-xl cursor-pointer group font-medium text-sm transition-colors"
              :class="{
                'bg-white text-[#0f1e36] shadow-sm dark:bg-gray-800 dark:text-white':
                  activeTab === index,
                'text-gray-600 hover:text-gray-900 hover:bg-white/60 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-800/60':
                  activeTab !== index,
              }"
            >
              {{ tab.name }}
            </div>

            <!-- 添加退出登录按钮，位于标签栏最下方 -->
            <div class="mt-auto">
              <div
                @click="showLogoutConfirmation"
                class="relative flex items-center gap-3 px-4 py-3 my-2 break-all rounded-xl cursor-pointer group font-medium text-sm text-red-500 dark:text-red-400 hover:bg-white/70 dark:hover:bg-gray-800/60 transition-colors"
              >
                退出登录
              </div>
            </div>
          </div>
          <!-- 右边内容区域 -->
          <div
            class="w-3/4 bg-white dark:bg-gray-800 rounded-2xl ml-4 border border-gray-100 dark:border-white/10 p-3 min-h-0 overflow-hidden"
          >
            <transition name="fade" mode="out-in">
              <div v-if="!isTabSwitching" key="loaded-content" class="h-full">
                <keep-alive>
                  <component
                    v-if="tabs[activeTab]"
                    :is="tabs[activeTab].component"
                    :key="activeKey"
                    class="h-full"
                    :visible="props.visible && !isTabSwitching"
                  ></component>
                </keep-alive>
              </div>
              <div v-else key="loading-placeholder" class="flex justify-center items-center h-full">
                <div class="animate-pulse flex space-x-4">
                  <div class="flex-1 space-y-4 py-1">
                    <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                    <div class="space-y-2">
                      <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded"></div>
                      <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6"></div>
                    </div>
                  </div>
                </div>
              </div>
            </transition>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { useAuthStore, useGlobalStoreWithOut } from '@/store'
import { dialog } from '@/utils/dialog'
import { Close } from '@icon-park/vue-next' // Only Close icon needed now
import { computed, markRaw, nextTick, onMounted, ref, watch } from 'vue'
import AccountManagement from './Settings/AccountManagement.vue'
import MemberCenter from './Settings/MemberCenter.vue'
import NoticeDialog from './Settings/NoticeDialog.vue'
import UserAgreement from './Settings/UserAgreement.vue'

const useGlobalStore = useGlobalStoreWithOut()
interface Props {
  visible: boolean
}
const { isMobile } = useBasicLayout() // Still needed for :class binding
const props = defineProps<Props>()

const authStore = useAuthStore()
const globalConfig = computed(() => authStore.globalConfig)

// Use markRaw to prevent components from becoming reactive
const tabs = computed(() => {
  const baseTabs = [
    { name: '账户安全', component: markRaw(AccountManagement) },
    { name: '升级套餐', component: markRaw(MemberCenter) },
    // { name: '数据管理', component: markRaw(DataManagement) },
    { name: '使用必读', component: markRaw(NoticeDialog) },
  ]

  // 只有当 globalConfig.isAutoOpenAgreement === '1' 时才添加用户协议选项
  if (globalConfig.value.isAutoOpenAgreement === '1') {
    baseTabs.push({ name: '用户协议', component: markRaw(UserAgreement) })
  }

  return baseTabs
})

// Desktop-specific state
const activeTab = ref(
  useGlobalStore.settingsActiveTab >= 0 && useGlobalStore.settingsActiveTab < tabs.value.length
    ? useGlobalStore.settingsActiveTab
    : 0
)
const activeKey = ref(Date.now())
const isTabSwitching = ref(false)

// Tab switching function (Desktop only)
function switchTab(index: number) {
  if (index >= 0 && index < tabs.value.length && index !== activeTab.value) {
    isTabSwitching.value = true
    activeTab.value = index
    useGlobalStore.settingsActiveTab = index
    nextTick(() => {
      activeKey.value = Date.now()
      setTimeout(() => {
        isTabSwitching.value = false
      }, 50) // Reduced delay
    })
  }
}

// Watch for global changes (for desktop sync)
watch(
  () => useGlobalStore.settingsActiveTab,
  newVal => {
    // Check if the dialog is visible and it's not mobile view
    if (
      props.visible &&
      !isMobile.value &&
      newVal >= 0 &&
      newVal < tabs.value.length &&
      newVal !== activeTab.value
    ) {
      switchTab(newVal)
    }
  }
)

// Watch for visibility changes (for desktop refresh)
watch(
  () => props.visible,
  isVisible => {
    if (isVisible && !isMobile.value) {
      // Sync with global store on open for desktop
      const targetTab =
        useGlobalStore.settingsActiveTab >= 0 &&
        useGlobalStore.settingsActiveTab < tabs.value.length
          ? useGlobalStore.settingsActiveTab
          : 0
      if (activeTab.value !== targetTab) {
        activeTab.value = targetTab
      }
      activeKey.value = Date.now() // Refresh key on open
      isTabSwitching.value = false // Ensure not stuck loading
    } else if (!isVisible) {
      // Optionally reset tab when closed, or keep last state?
      // activeTab.value = 0;
      isTabSwitching.value = false
    }
  },
  { immediate: true } // Run immediately to set initial state
)

// Close Handler
function handleClose() {
  useGlobalStore.updateSettingsDialog(false)
}

// Logout Handler
function showLogoutConfirmation() {
  const dialogInstance = dialog()
  dialogInstance.warning({
    title: '退出登录',
    content: '确定要退出登录吗？',
    positiveText: '确认',
    negativeText: '取消',
    onPositiveClick: () => {
      authStore.logOut()
      handleClose() // Close settings after logout
    },
  })
}

// onMounted: Initial state sync handled by immediate watchers
onMounted(() => {
  // console.log('Desktop SettingsDialog mounted');
})
</script>

<style scoped>
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.5s;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
