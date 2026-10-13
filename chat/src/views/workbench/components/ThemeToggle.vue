<script setup lang="ts">
import { t } from '@/locales'
import { useAppStore } from '@/store'
import { computed } from 'vue'

const appStore = useAppStore()

const isDark = computed(() => appStore.theme === 'dark')
const buttonLabel = computed(() =>
  isDark.value ? t('lens.header.switchToLight') : t('lens.header.switchToDark')
)

function toggleTheme() {
  appStore.setTheme(isDark.value ? 'light' : 'dark')
}
</script>

<template>
  <button
    type="button"
    class="research-theme-button"
    :class="{ 'research-theme-button--active': isDark }"
    :aria-label="buttonLabel"
    :aria-pressed="isDark"
    :title="buttonLabel"
    @click="toggleTheme"
  >
    <svg
      v-if="isDark"
      class="research-theme-button__icon research-theme-button__icon--sun"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3.25" />
      <path
        d="M12 2.5v1.75m0 15.5v1.75M4.58 4.58l1.24 1.24m12.36 12.36 1.24 1.24M2.5 12h1.75m15.5 0h1.75M4.58 19.42l1.24-1.24M18.18 5.82l1.24-1.24"
      />
    </svg>
    <svg
      v-else
      class="research-theme-button__icon research-theme-button__icon--moon"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path d="M20.5 14.1A8.5 8.5 0 0 1 9.9 3.5 8.5 8.5 0 1 0 20.5 14.1Z" />
    </svg>
  </button>
</template>

<style scoped>
.research-theme-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--control-height);
  min-width: var(--control-height);
  min-height: var(--control-height);
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--radius-button);
  color: var(--ink-soft);
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;
}

.research-theme-button__icon {
  width: 18px;
  height: 18px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
  shape-rendering: geometricPrecision;
  transform: translateX(0.5px);
}

.research-theme-button__icon--moon {
  fill: none;
}

.research-theme-button:hover {
  border-color: transparent;
  background: var(--btn-bg-ghost-hover);
}

.research-theme-button--active {
  border-color: transparent;
  background: var(--surface-muted);
  color: var(--text-main);
}

.research-theme-button:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}
</style>
