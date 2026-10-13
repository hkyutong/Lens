<script setup lang="ts">
import { useNativeDialog } from '@/hooks/useNativeDialog'
import { t } from '@/locales'
import type { DialogOptions } from '@/utils/dialog'
import { ref } from 'vue'

const visible = ref(false)
const dialogRef = ref<HTMLDialogElement | null>(null)
useNativeDialog(dialogRef, () => visible.value)
const resolvePromise = ref<((confirmed: boolean) => void) | null>(null)
const options = ref<DialogOptions>({ title: '', content: '' })

function showDialog(dialogOptions: DialogOptions) {
  options.value = dialogOptions
  visible.value = true
  return new Promise<boolean>(resolve => { resolvePromise.value = resolve })
}
async function handleConfirm() {
  try {
    await options.value.onPositiveClick?.()
    visible.value = false
    resolvePromise.value?.(true)
  } catch {
    resolvePromise.value?.(false)
  }
}
function handleCancel() {
  visible.value = false
  resolvePromise.value?.(false)
}

defineExpose({ showDialog })
</script>

<template>
  <Teleport to="body">
    <dialog v-if="visible" ref="dialogRef" class="lens-dialog research-confirm"
      :aria-label="options.title" @cancel.prevent="handleCancel" @click.self="handleCancel">
      <section class="research-confirm__surface">
        <h2>{{ options.title }}</h2>
        <p>{{ options.content }}</p>
        <div class="research-confirm__actions">
          <button type="button" class="btn btn-secondary btn-md" @click="handleCancel">
            {{ options.negativeText || t('lens.settings.cancel') }}
          </button>
          <button type="button" class="btn btn-primary btn-md" @click="handleConfirm">
            {{ options.positiveText || t('lens.settings.confirm') }}
          </button>
        </div>
      </section>
    </dialog>
  </Teleport>
</template>

<style scoped>
.research-confirm {
  display: grid;
  place-items: center;
  padding: 20px;
  background: var(--modal-overlay);
}
.research-confirm__surface {
  width: min(400px, 100%);
  padding: 24px;
  border: 1px solid var(--paper-border);
  border-radius: var(--radius-panel);
  background: var(--surface-card);
  box-shadow: var(--dialog-shadow);
}
.research-confirm h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.research-confirm p {
  margin: 12px 0 24px;
  color: var(--text-sub);
  font-size: 14px;
  line-height: 1.6;
}
.research-confirm__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.research-confirm__actions button { min-height: 44px; }
</style>
