import { onScopeDispose, watch, type Ref } from 'vue'

// Native dialogs provide focus containment, Escape and focus restoration,
// including nested dialogs, without a second keyboard-state implementation.
export function useNativeDialog(
  element: Ref<HTMLDialogElement | null>,
  visible: () => boolean
) {
  // Close while the element is still connected, before v-if removes it.
  // This lets the browser restore focus to the dialog's original trigger.
  const stopClosing = watch(visible, open => {
    if (!open && element.value?.open) element.value.close()
  }, { flush: 'sync' })
  const stopOpening = watch(
    [element, visible],
    ([dialog, open], previous, onCleanup) => {
      if (previous?.[0] && previous[0] !== dialog) previous[0].close()
      if (!dialog) return
      if (open && !dialog.open) dialog.showModal()
      if (!open && dialog.open) dialog.close()
      onCleanup(() => { if (dialog.open) dialog.close() })
    },
    { flush: 'post', immediate: true }
  )
  onScopeDispose(() => {
    stopClosing()
    stopOpening()
  })
}
