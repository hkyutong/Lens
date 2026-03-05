<script setup lang="ts">
import { computed } from 'vue'
import { useGlobalStoreWithOut } from '@/store'

const globalStore = useGlobalStoreWithOut()

const externalUrl = computed(() => {
  const raw = globalStore.currentExternalLink
  if (!raw) return ''
  if (typeof raw === 'string') return raw
  return String((raw as any)?.url || '')
})
</script>

<template>
  <div class="w-full h-full bg-white dark:bg-[#080808]">
    <iframe
      v-if="externalUrl"
      :src="externalUrl"
      class="w-full h-full border-0"
      referrerpolicy="no-referrer"
    ></iframe>
    <div v-else class="w-full h-full flex items-center justify-center text-sm text-gray-500">
      暂无外部链接
    </div>
  </div>
</template>
