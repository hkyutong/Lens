<script lang="ts" setup>
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore, useGlobalStoreWithOut } from '@/store'
import { DIALOG_TABS } from '@/store/modules/global'
import { computed, inject } from 'vue'
import LanguageSelector from './LanguageSelector.vue'
import ThemeToggle from './ThemeToggle.vue'

const useGlobalStore = useGlobalStoreWithOut()
const authStore = useAuthStore()
const openResearchControls = inject('openResearchControls', () => {})
const openResearchProjects = inject('openResearchProjects', () => {})

const { isMobile } = useBasicLayout()

const isPreviewerVisible = computed(
  () =>
    useGlobalStore.showHtmlPreviewer ||
    useGlobalStore.showTextEditor ||
    useGlobalStore.showImagePreviewer
)

const showWorkspaceActions = computed(() => !isPreviewerVisible.value)
const showResearchControlsButton = computed(() => showWorkspaceActions.value)
const accountLabel = computed(() => {
  if (!authStore.isLogin) return t('lens.sidebar.login')
  return (
    String(authStore.userInfo.email || authStore.userInfo.username || '').trim() ||
    t('lens.sidebar.account')
  )
})
function openAccount() {
  if (!authStore.isLogin) {
    authStore.setLoginDialog(true)
    return
  }
  useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.ACCOUNT)
}
</script>

<template>
  <header class="workspace-header sticky top-0 left-0 right-0 z-30 h-16 select-none">
    <div class="relative flex min-w-0 h-full items-center justify-center">
      <div class="flex h-full w-full items-center" :class="{ 'px-4': !isMobile, 'px-2': isMobile }">
        <div class="flex h-full w-full items-center justify-between">
          <div class="flex h-full flex-1 items-center ele-drag">
            <div class="workspace-brand" aria-label="Lens by YutoAI">
              <div class="workspace-brand__name">Lens <small>by YutoAI</small></div>
              <div class="workspace-brand__subtitle">{{ t('lens.header.researchWorkspace') }}</div>
            </div>
          </div>

          <div class="flex items-center gap-2">
            <template v-if="showWorkspaceActions">
              <button
                type="button"
                class="workspace-projects-button"
                :aria-label="t('lens.header.projects')"
                @click="openResearchProjects"
              >
                <svg class="workspace-button-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M3.5 6.75h6l1.8 2h9.2v8.75a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6.75Z" />
                </svg>
                <span>{{ t('lens.header.projects') }}</span>
              </button>
              <button
                type="button"
                class="workspace-account-button"
                :aria-label="accountLabel"
                @click="openAccount"
              >
                <svg class="workspace-button-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="8" r="3.25" />
                  <path d="M5.5 19c.7-3.4 3.1-5.1 6.5-5.1s5.8 1.7 6.5 5.1" />
                </svg>
                <span>{{ accountLabel }}</span>
              </button>
              <div class="workspace-desktop-preference"><ThemeToggle /></div>
              <div class="workspace-desktop-preference"><LanguageSelector /></div>
            </template>
            <template v-if="showResearchControlsButton && isMobile">
              <button
                type="button"
                class="research-tools-button"
                :aria-label="t('lens.header.workspaceSettings')"
                @click="openResearchControls"
              >
                <svg class="workspace-button-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6" />
                </svg>
                <span>{{ t('lens.header.workspaceSettings') }}</span>
              </button>
            </template>
          </div>
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
.workspace-brand {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.workspace-brand__name {
  color: var(--text-main);
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.025em;
  line-height: 1.1;
}

.workspace-brand__name > small {
  margin-left: 6px;
  color: var(--ink-faint);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.workspace-brand__subtitle {
  max-width: min(42vw, 520px);
  overflow: hidden;
  color: var(--ink-faint);
  font-size: 11px;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.research-tools-button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  padding: 0 16px;
  border: 1px solid transparent;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  transition:
    background-color 160ms ease,
    border-color 160ms ease;
}

.workspace-account-button,
.workspace-projects-button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 44px;
  padding: 0 12px;
  border-radius: 999px;
  max-width: 160px;
  overflow: hidden;
  color: var(--ink-soft);
  font-size: 13px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-button-icon {
  width: 18px;
  height: 18px;
  flex: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.7;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.workspace-account-button:hover,
.workspace-projects-button:hover {
  background: var(--btn-bg-ghost-hover);
  color: var(--text-main);
}

.research-tools-button:hover {
  background: var(--btn-bg-primary-hover);
}

.workspace-header {
  border-bottom: 1px solid var(--research-divider);
  background: var(--material-regular);
  -webkit-backdrop-filter: saturate(180%) blur(24px);
  backdrop-filter: saturate(180%) blur(24px);
}

@media (max-width: 640px) {
  .workspace-brand__subtitle {
    display: none;
  }

  .workspace-account-button,
  .workspace-projects-button {
    width: 44px;
    max-width: 44px;
    justify-content: center;
    padding: 0;
  }

  .workspace-account-button span,
  .workspace-projects-button span,
  .research-tools-button span,
  .workspace-desktop-preference {
    display: none;
  }

  .research-tools-button {
    width: 44px;
    justify-content: center;
    padding: 0;
  }
}
</style>
