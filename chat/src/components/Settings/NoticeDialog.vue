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

      <!-- 公告内容 -->
      <div class="overflow-y-auto" :class="{ 'max-h-[calc(70vh-120px)]': !isMobile }">
        <MdPreview
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
</style>
