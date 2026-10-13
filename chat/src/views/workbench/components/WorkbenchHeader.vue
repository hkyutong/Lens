<script lang="ts" setup>
import { t } from '@/locales'
import { useAuthStore, useGlobalStoreWithOut } from '@/store'
import { DIALOG_TABS } from '@/store/modules/global'
import { computed, inject } from 'vue'
import yutoGptLogo from '@/assets/yutogpt-logo.svg'
import LanguageSelector from './LanguageSelector.vue'
import ThemeToggle from './ThemeToggle.vue'
import ResearchModelSelector from './ResearchModelSelector.vue'
import { useBasicLayout } from '@/hooks/useBasicLayout'

const useGlobalStore = useGlobalStoreWithOut()
const authStore = useAuthStore()
const { isMobile } = useBasicLayout()
const openResearchControls = inject('openResearchControls', () => {})
const openResearchProjects = inject('openResearchProjects', () => {})

const props = withDefaults(defineProps<{ part?: 'mobile' | 'brand' | 'preferences'; collapsible?: boolean; collapsed?: boolean }>(), {
  part: 'mobile',
})
const emit = defineEmits<{ 'toggle-sidebar': [] }>()
const isMobileNavigation = computed(() => props.part === 'mobile')

const isPreviewerVisible = computed(
  () =>
    useGlobalStore.showHtmlPreviewer ||
    useGlobalStore.showTextEditor ||
    useGlobalStore.showImagePreviewer
)

const showWorkspaceActions = computed(() => !isPreviewerVisible.value)
const showResearchControlsButton = computed(() => showWorkspaceActions.value && isMobileNavigation.value && !isMobile.value)
const accountLabel = computed(() =>
  authStore.isLogin ? t('lens.sidebar.account') : t('lens.sidebar.login')
)
function openAccount() {
  if (!authStore.isLogin) {
    authStore.setLoginDialog(true)
    return
  }
  useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.ACCOUNT)
}
</script>

<template>
  <component :is="isMobileNavigation ? 'header' : 'nav'"
    class="workspace-navigation relative z-30 select-none"
    :class="[`workspace-navigation--${props.part}`, { 'workspace-navigation--collapsed': props.collapsed }]"
    :aria-label="t('lens.header.researchWorkspace')">
    <div v-if="props.part !== 'preferences'" class="workspace-navigation__context">
      <div class="workspace-brand" :aria-label="`Lens · ${t('lens.header.researchWorkspace')}`">
        <img class="workspace-brand__mark" :src="yutoGptLogo" alt="" aria-hidden="true" />
        <span class="workspace-brand__name">Lens</span>
      </div>
      <button v-if="props.part === 'brand' && props.collapsible" type="button"
        class="workspace-sidebar-toggle" :aria-expanded="!props.collapsed"
        aria-controls="research-sidebar-content"
        :aria-label="t(props.collapsed ? 'lens.sidebar.expand' : 'lens.sidebar.collapse')"
        :title="t(props.collapsed ? 'lens.sidebar.expand' : 'lens.sidebar.collapse')"
        @click="emit('toggle-sidebar')">
        <svg class="workspace-button-icon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3.5" y="4" width="17" height="16" rx="2" />
          <path d="M15 4v16" />
        </svg>
      </button>
      <div v-if="isMobileNavigation && showWorkspaceActions" class="workspace-navigation__model">
        <ResearchModelSelector position="bottom-left" navigation />
      </div>
      <div v-if="showWorkspaceActions && props.part === 'brand'" class="workspace-navigation__preferences">
        <ThemeToggle />
        <LanguageSelector position="bottom-right" />
      </div>
    </div>
      <button v-if="showWorkspaceActions && props.part !== 'brand'" type="button" class="workspace-projects-button"
        :aria-label="t('lens.header.projects')" :title="t('lens.header.projects')"
        @click="openResearchProjects">
        <svg class="workspace-button-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path :d="isMobileNavigation ? 'M4 4h16v16H4zM9 4v16M13 9h3M13 13h3' : 'M3.5 6.75h6l1.8 2h9.2v8.75a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2V6.75Z'" />
        </svg>
        <span>{{ t('lens.header.projects') }}</span>
      </button>
    <div v-if="showWorkspaceActions && props.part !== 'brand'" class="workspace-navigation__actions">
      <button v-if="showResearchControlsButton" type="button" class="research-tools-button"
        :aria-label="t('lens.header.workspaceSettings')" :title="t('lens.header.workspaceSettings')"
        @click="openResearchControls">
        <svg class="workspace-button-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7h10M18 7h2M4 17h2M10 17h10M14 4v6M7 14v6" />
        </svg>
      </button>
      <div v-if="isMobileNavigation" class="workspace-navigation__preferences">
        <ThemeToggle />
        <LanguageSelector position="bottom-right" />
      </div>
      <button type="button" class="workspace-account-button"
        :class="{ 'workspace-account-button--compact': authStore.isLogin,
          'workspace-account-button--login': !authStore.isLogin }"
        :aria-label="accountLabel" :title="accountLabel" @click="openAccount">
        <svg class="workspace-button-icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="8" r="3.25" />
          <path d="M5.5 19c.7-3.4 3.1-5.1 6.5-5.1s5.8 1.7 6.5 5.1" />
        </svg>
        <span v-if="!authStore.isLogin">{{ accountLabel }}</span>
      </button>
    </div>
  </component>
</template>

<style scoped>
.workspace-navigation {
  flex: none;
  min-width: 0;
  color: var(--text-main);
}

.workspace-navigation__context,
.workspace-navigation__actions,
.workspace-navigation__preferences,
.workspace-brand {
  display: flex;
  min-width: 0;
  align-items: center;
}

.workspace-navigation__context { justify-content: space-between; gap: 8px; }
.workspace-navigation__actions { gap: 4px; }
.workspace-navigation__preferences { gap: 4px; }
.workspace-brand { gap: 8px; }

.workspace-navigation--brand .workspace-navigation__context { width: 100%; }

.workspace-navigation--preferences {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
}
.workspace-navigation--preferences .workspace-navigation__actions { display: contents; }
.workspace-navigation--preferences .workspace-projects-button {
  grid-column: 1;
  grid-row: 1;
  min-width: 0;
  width: fit-content;
  max-width: 100%;
  justify-content: flex-start;
}
.workspace-navigation--preferences .workspace-projects-button span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.workspace-navigation--preferences .workspace-account-button { grid-column: 2; grid-row: 1; }

.workspace-brand__mark {
  display: block;
  width: 24px;
  height: 24px;
  object-fit: contain;
  filter: var(--brand-logo-filter);
}

.workspace-brand__name {
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.035em;
  line-height: 1;
}

.workspace-sidebar-toggle,
.workspace-projects-button,
.workspace-account-button,
.research-tools-button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-main);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  white-space: nowrap;
}

.workspace-account-button { margin-inline-start: auto; }
.workspace-account-button--compact { width: 44px; padding: 0; }
.workspace-account-button--login {
  background: var(--btn-bg-primary);
  color: var(--btn-text-primary);
}
.workspace-account-button--login:hover {
  background: var(--btn-bg-primary-hover);
  color: var(--btn-text-primary);
}

@media (hover: hover) and (pointer: fine) {
  .workspace-sidebar-toggle:hover,
  .workspace-projects-button:hover,
  .research-tools-button:hover,
  .workspace-account-button--compact:hover { background: var(--academic-surface); }
}

.workspace-navigation button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
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

:deep(.research-theme-button),
:deep(.language-selector-trigger) { color: var(--text-main); }

:deep(.research-chip-button) {
  min-width: 44px;
  min-height: 44px;
  border: 1px solid transparent;
  background: transparent;
  box-shadow: none;
}

.workspace-navigation--mobile {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) auto;
  min-height: calc(56px + env(safe-area-inset-top, 0px));
  align-items: center;
  gap: 8px;
  padding: calc(6px + env(safe-area-inset-top, 0px)) 12px 6px;
  background: var(--surface-panel);
}

.workspace-navigation--mobile .workspace-navigation__context { grid-column: 2; grid-row: 1; }
.workspace-navigation--mobile .workspace-brand { flex: none; }
.workspace-navigation__model { flex: 1; min-width: 0; }
.workspace-navigation__model :deep(.menu) { width: 100%; }
.workspace-navigation__model :deep(.research-chip-button) { width: 100%; max-width: 100%; padding-inline: 4px; }
.workspace-navigation__model :deep(.research-chip-button__label) { flex: 1; min-width: 0; max-width: 100%; text-align: left; }
.workspace-navigation--mobile .workspace-projects-button { grid-column: 1; grid-row: 1; }
.workspace-navigation--mobile .workspace-navigation__actions { grid-column: 3; grid-row: 1; justify-self: end; }
.workspace-navigation--mobile .workspace-brand__name,
.workspace-navigation--mobile .workspace-projects-button span,
.workspace-navigation--mobile .workspace-account-button span { display: none; }

.workspace-navigation--mobile .workspace-account-button,
.workspace-navigation--mobile .workspace-projects-button,
.workspace-navigation--mobile .research-tools-button {
  width: 44px;
  padding: 0;
}

.workspace-navigation--mobile .workspace-account-button {
  width: 40px;
  min-height: 40px;
}

.workspace-navigation--mobile .workspace-account-button .workspace-button-icon {
  width: 16px;
  height: 16px;
}

.workspace-navigation--mobile :deep(.language-selector-trigger) {
  width: 44px;
  justify-content: center;
  padding: 0;
}
.workspace-navigation--mobile :deep(.research-chip-button__arrow) { display: none; }

@media (max-width: 359px) {
  .workspace-navigation--mobile { padding-inline: 8px; gap: 4px; }
  .workspace-navigation--mobile .workspace-navigation__context { gap: 4px; }
}
.workspace-sidebar-toggle { width: 44px; flex: none; padding: 0; }
.workspace-sidebar-toggle .workspace-button-icon { width: 16px; height: 16px; }

.workspace-navigation--collapsed .workspace-navigation__context,
.workspace-navigation--collapsed .workspace-navigation__preferences {
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.workspace-navigation--collapsed .workspace-brand__name,
.workspace-navigation--collapsed .workspace-projects-button span,
.workspace-navigation--collapsed .workspace-account-button span { display: none; }
.workspace-navigation--collapsed .workspace-brand { justify-content: center; }
.workspace-navigation--preferences.workspace-navigation--collapsed {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-top: auto;
}
.workspace-navigation--collapsed .workspace-projects-button,
.workspace-navigation--collapsed .workspace-account-button {
  justify-content: center;
  width: 44px;
  padding: 0;
  margin-inline: 0;
}
.workspace-navigation--collapsed :deep(.language-selector-trigger) {
  width: 44px;
  justify-content: center;
  padding: 0;
}
.workspace-navigation--collapsed :deep(.research-chip-button__arrow) { display: none; }
</style>
