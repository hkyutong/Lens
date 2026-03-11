<script setup lang="ts">
import { computed, useAttrs } from 'vue'
import { Icon, type IconifyIcon } from '@iconify/vue'

interface Props {
  icon?: string | IconifyIcon
}

const props = withDefaults(defineProps<Props>(), {
  icon: '',
})

const attrs = useAttrs()

const bindAttrs = computed<Record<string, unknown>>(() => ({
  ...attrs,
  class: (attrs.class as string) || '',
  style: (attrs.style as string) || 'width: 1em; height: 1em;',
}))
</script>

<template>
  <Icon :icon="props.icon" v-bind="bindAttrs" />
</template>
