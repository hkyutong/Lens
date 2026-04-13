<script setup lang="ts">
import { t } from '@/locales'
import { useAppStore } from '@/store'
import { Moon, SunOne } from '@icon-park/vue-next'
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
    class="btn-pill btn-sm research-theme-button"
    :class="{ 'research-theme-button--active': isDark }"
    :aria-label="buttonLabel"
    :title="buttonLabel"
    @click="toggleTheme"
  >
    <SunOne v-if="isDark" size="15" aria-hidden="true" />
    <Moon v-else size="15" aria-hidden="true" />
  </button>
</template>

<style scoped>
.research-theme-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  min-width: 2.2rem;
  padding: 0;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease,
    color 0.16s ease;
}

.research-theme-button:hover {
  border-color: var(--input-border-hover);
  background: var(--surface-panel);
}

.research-theme-button--active {
  border-color: var(--border-color);
  background: var(--surface-card);
  color: var(--text-main);
}
</style>
