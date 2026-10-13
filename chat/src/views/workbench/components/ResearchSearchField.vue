<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { t } from '@/locales'
import { ref } from 'vue'

// Input attributes/listeners stay on the native field, including caller-owned Escape behavior.
defineOptions({ inheritAttrs: false })
defineProps<{ modelValue: string; label: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const input = ref<HTMLInputElement>()

function focus() {
  input.value?.focus()
}

function clear() {
  emit('update:modelValue', '')
  focus()
}

defineExpose({ focus })
</script>

<template>
  <div class="research-search-field">
    <SvgIcon class="research-search-field__icon" icon="ri:search-line" aria-hidden="true" />
    <input
      ref="input"
      v-bind="$attrs"
      type="search"
      class="research-search-field__input"
      :value="modelValue"
      :placeholder="label"
      :aria-label="label"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <button
      type="button"
      class="research-search-field__clear"
      :class="{ 'research-search-field__clear--empty': !modelValue }"
      :disabled="!modelValue"
      :aria-label="t('lens.search.clear')"
      @click="clear"
    >
      <SvgIcon icon="ri:close-line" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.research-search-field {
  --search-secondary: color-mix(in srgb, var(--text-sub) 90%, var(--text-main));
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 44px;
  align-items: center;
  gap: 8px;
  padding-inline-start: 12px;
  border: 1px solid color-mix(in srgb, var(--paper-border) 70%, transparent);
  border-radius: var(--radius-control);
  background: color-mix(in srgb, var(--surface-panel) 84%, var(--surface-card));
  color: var(--search-secondary);
  transition: border-color 160ms ease;
}

.research-search-field:hover {
  border-color: var(--input-border-hover);
}

.research-search-field:focus-within {
  border-color: var(--input-border-focus);
}

.research-search-field__icon {
  flex: none;
  width: 16px;
  height: 16px;
}

.research-search-field__input {
  width: 100%;
  min-width: 0;
  flex: 1;
  padding: 0;
  border: 0;
  outline: none;
  border-radius: 0;
  background: transparent;
  color: var(--text-main);
  caret-color: var(--academic-accent);
  box-shadow: none;
  font-size: 13px;
  line-height: 1.5;
  appearance: none;
}

.research-search-field__input::placeholder {
  color: var(--search-secondary);
  opacity: 1;
}

.research-search-field__input::-webkit-search-cancel-button,
.research-search-field__input::-webkit-search-decoration {
  appearance: none;
}

.research-search-field__clear {
  display: grid;
  width: 44px;
  height: 44px;
  flex: none;
  place-items: center;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--search-secondary);
}

.research-search-field__clear svg {
  width: 16px;
  height: 16px;
}

.research-search-field__clear:hover {
  color: var(--text-main);
}

.research-search-field__clear:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -4px;
}

.research-search-field__clear--empty {
  visibility: hidden;
}

@media (max-width: 1023px) {
  .research-search-field__input { font-size: 16px; }
}

@media (prefers-reduced-motion: reduce) {
  .research-search-field { transition: none; }
}
</style>
