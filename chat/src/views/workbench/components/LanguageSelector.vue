<script setup lang="ts">
import { DropdownMenu } from '@/components/common/DropdownMenu'
import { t, setLocale } from '@/locales'
import { useAppStore } from '@/store'
import type { Language } from '@/store/modules/app/helper'
import { CheckOne, Down } from '@icon-park/vue-next'
import { computed, ref } from 'vue'

const props = withDefaults(defineProps<{ position?: 'top-right' | 'bottom-right' }>(), {
  position: 'top-right',
})
const appStore = useAppStore()
const isMenuOpen = ref(false)

const languages = computed(() => {
  const items: Array<{ value: Language; short: string }> = [
    { value: 'zh-CN', short: '简' },
    { value: 'zh-TW', short: '繁' },
    { value: 'en-US', short: 'EN' },
    { value: 'ja-JP', short: '日' },
    { value: 'ko-KR', short: '한' },
  ]

  return items.map(item => ({
    ...item,
    label: t(`lens.language.${item.value}`),
  }))
})

const currentLanguage = computed(() => appStore.language)
const currentShort = computed(
  () => languages.value.find(item => item.value === currentLanguage.value)?.short || '简'
)

function changeLanguage(language: Language) {
  appStore.setLanguage(language)
  setLocale(language)
}
</script>

<template>
  <DropdownMenu v-model="isMenuOpen" :position="props.position" min-width="10rem" menu-class="menu-items-academic">
    <template #trigger>
      <button
        type="button"
        class="btn-pill btn-sm research-chip-button language-selector-trigger"
        :aria-label="t('lens.header.language')"
        :title="t('lens.header.language')"
        :aria-expanded="isMenuOpen"
        aria-haspopup="menu"
      >
        <span class="research-chip-button__label">{{ currentShort }}</span>
        <Down
          size="14"
          class="research-chip-button__arrow"
          :class="{ 'research-chip-button__arrow--open': isMenuOpen }"
          aria-hidden="true"
        />
      </button>
    </template>
    <template #menu="{ close }">
      <div class="research-language-menu min-w-[10rem]">
        <button
          v-for="item in languages"
          type="button"
          :key="item.value"
          class="menu-item menu-item-md text-left"
          role="menuitemradio"
          :aria-checked="currentLanguage === item.value"
          :class="{ 'menu-item-active': currentLanguage === item.value }"
          @click="
            () => {
              changeLanguage(item.value)
              close()
            }
          "
        >
          <div class="menu-item-content">
            <div class="menu-item-title">{{ item.label }}</div>
          </div>
          <div v-if="currentLanguage === item.value" class="flex-shrink-0">
            <CheckOne theme="filled" size="16" class="text-[var(--accent-strong)]" aria-hidden="true" />
          </div>
        </button>
      </div>
    </template>
  </DropdownMenu>
</template>

<style scoped>
.research-chip-button {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  cursor: pointer;
  min-height: var(--control-height);
  padding: 0 13px;
  border: 1px solid transparent;
  border-radius: var(--radius-button);
  background: transparent;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.research-chip-button:hover {
  border-color: transparent;
  background: var(--btn-bg-ghost-hover);
}

.research-chip-button__label {
  display: inline-block;
  min-width: 1.35rem;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
}

.research-chip-button__arrow {
  flex-shrink: 0;
  transition: transform 0.16s ease;
}

.research-chip-button__arrow--open {
  transform: rotate(180deg);
}
</style>
