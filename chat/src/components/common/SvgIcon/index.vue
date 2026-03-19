<script setup lang="ts">
import { bundledIconNames, fallbackBundledIcon } from '@/constants/iconCollections'
import { computed, useAttrs } from 'vue'
import { Icon, type IconifyIcon } from '@iconify/vue'

interface Props {
  icon?: string | IconifyIcon
}

const missingIconWarnings = new Set<string>()

const props = withDefaults(defineProps<Props>(), {
  icon: '',
})

const attrs = useAttrs()

const bindAttrs = computed<Record<string, unknown>>(() => ({
  ...attrs,
  class: (attrs.class as string) || '',
  style: (attrs.style as string) || 'width: 1em; height: 1em;',
}))

const resolvedIcon = computed<string | IconifyIcon>(() => {
  if (typeof props.icon !== 'string') return props.icon

  const iconName = String(props.icon || '').trim()
  if (!iconName || !iconName.includes(':')) return iconName
  if (bundledIconNames.has(iconName)) return iconName

  if (import.meta.env.DEV && !missingIconWarnings.has(iconName)) {
    missingIconWarnings.add(iconName)
    console.warn(`[SvgIcon] 未找到本地图标，已回退为 ${fallbackBundledIcon}: ${iconName}`)
  }

  return fallbackBundledIcon
})
</script>

<template>
  <Icon :icon="resolvedIcon" v-bind="bindAttrs" />
</template>
