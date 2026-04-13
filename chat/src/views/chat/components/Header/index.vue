<script lang="ts" setup>
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAppStore, useGlobalStoreWithOut } from '@/store'
import { Close, ExpandLeft } from '@icon-park/vue-next'
import { computed, inject } from 'vue'
import LanguageSelector from '../LanguageSelector.vue'
import ThemeToggle from '../ThemeToggle.vue'

interface ExternalLink {
  icon?: string
  name?: string
  [key: string]: any
}

const useGlobalStore = useGlobalStoreWithOut()
const appStore = useAppStore()
const openResearchControls = inject('openResearchControls', () => {})

const { isMobile } = useBasicLayout()
const collapsed = computed(() => appStore.siderCollapsed)

const isPreviewerVisible = computed(
  () =>
    useGlobalStore.showHtmlPreviewer ||
    useGlobalStore.showTextEditor ||
    useGlobalStore.showImagePreviewer
)

const isAppListVisible = computed(() => useGlobalStore.showAppListComponent)
const externalLinkActive = computed(
  () => useGlobalStore.externalLinkDialog && useGlobalStore.currentExternalLink
)
const showWorkspaceActions = computed(
  () => !externalLinkActive.value && !isPreviewerVisible.value && !isAppListVisible.value
)
const showResearchControlsButton = computed(() => showWorkspaceActions.value && isMobile.value)
const currentExternalLink = computed(() => {
  const link = useGlobalStore.currentExternalLink
  return (typeof link === 'object' ? link : {}) as ExternalLink
})

function handleUpdateCollapsed() {
  appStore.setSiderCollapsed(!collapsed.value)
}

function closeAppList() {
  useGlobalStore.updateShowAppListComponent(false)
  if (!isMobile.value) {
    appStore.setSiderCollapsed(false)
  }
}
</script>

<template>
  <header class="sticky top-0 left-0 right-0 z-30 h-16 select-none">
    <div class="relative flex min-w-0 h-full items-center justify-center">
      <div class="flex h-full w-full items-center" :class="{ 'px-4': !isMobile, 'px-2': isMobile }">
        <div
          v-if="collapsed && !externalLinkActive && !isPreviewerVisible"
          class="relative group mx-1"
        >
          <button
            type="button"
            class="btn-icon btn-md"
            @click="handleUpdateCollapsed"
            aria-label="展开侧边栏"
          >
            <ExpandLeft size="22" />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-right">展开侧栏</div>
        </div>

        <div class="flex h-full w-full items-center justify-between">
          <div
            v-if="externalLinkActive"
            class="relative flex h-full flex-1 items-center justify-between ele-drag"
          >
            <div class="flex items-center space-x-2 py-1">
              <img
                v-if="currentExternalLink && currentExternalLink.icon"
                :src="currentExternalLink.icon"
                alt="网站图标"
                class="h-6 w-6 rounded-lg object-cover"
              />
              <div v-else class="flex h-6 w-6 items-center justify-center rounded-lg bg-gray-200">
                <span class="text-xs">{{ currentExternalLink?.name?.charAt(0) || '?' }}</span>
              </div>
              <span
                class="max-w-[30vw] truncate whitespace-nowrap overflow-hidden text-sm font-medium text-gray-800"
              >
                {{ currentExternalLink?.name || '外部链接' }}
              </span>
            </div>
          </div>
          <div v-else class="flex h-full flex-1 items-center ele-drag">
            <div class="min-w-0">
              <div
                class="truncate text-[14px] font-medium tracking-[-0.01em] text-[var(--text-main)]"
              >
                {{ t('lens.header.projects') }}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <template v-if="showWorkspaceActions">
              <ThemeToggle />
              <LanguageSelector />
            </template>
            <template v-if="showResearchControlsButton">
              <button
                type="button"
                class="btn btn-secondary rounded-full px-3 py-1.5 text-[14px] font-medium"
                @click="openResearchControls"
              >
                {{ t('lens.header.workspaceSettings') }}
              </button>
            </template>
            <div v-if="externalLinkActive" class="relative group mx-1">
              <button
                type="button"
                class="btn-icon btn-md"
                @click="
                  () => {
                    useGlobalStore.updateExternalLinkDialog(false)
                    if (!isMobile) {
                      appStore.setSiderCollapsed(false)
                    }
                  }
                "
                aria-label="关闭外部链接"
              >
                <Close size="20" aria-hidden="true" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">关闭</div>
            </div>
            <div v-else-if="isAppListVisible" class="relative group mx-1">
              <button
                type="button"
                class="btn-icon btn-md"
                @click="closeAppList"
                aria-label="关闭应用广场"
              >
                <Close size="20" aria-hidden="true" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">关闭</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>
