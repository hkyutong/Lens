<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAppStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import { message } from '@/utils/message'
import { ApplicationTwo, EditTwo } from '@icon-park/vue-next'
import { computed, inject, ref, watch } from 'vue'
import ListItem from './ListItem.vue'

const { isMobile } = useBasicLayout()
const appStore = useAppStore()
const chatStore = useChatStore()
const useGlobalStore = useGlobalStoreWithOut()
const ms = message()

const customKeyId = ref(100)
const dataSources = computed(() => chatStore.groupList || [])
const groupKeyWord = computed(() => chatStore.groupKeyWord || '')

watch(dataSources, () => (customKeyId.value += 1))
watch(groupKeyWord, () => (customKeyId.value += 1))

const isStreamIn = computed(() => {
  return chatStore.isStreamIn !== undefined ? chatStore.isStreamIn : false
})

const stickyList = computed(() =>
  dataSources.value.filter(item =>
    groupKeyWord.value ? item.title.includes(groupKeyWord.value) && item.isSticky : item.isSticky
  )
)

const historyList = computed(() =>
  dataSources.value.filter((item: any) => {
    if (groupKeyWord.value) return item.title.includes(groupKeyWord.value) && !item.isSticky
    return !item.isSticky
  })
)

const mergedList = computed(() => [...stickyList.value, ...historyList.value])
const createNewChatGroup = inject('createNewChatGroup', async () => {})

async function handleNewChat() {
  await createNewChatGroup()
  if (isMobile.value) appStore.setSiderCollapsed(true)
}

function handleOpenAppCenter() {
  useGlobalStore.updateShowAppListComponent(true)
  if (isMobile.value) appStore.setSiderCollapsed(true)
}

async function handleSelect(group: Chat.History) {
  if (isStreamIn.value) {
    ms.info('AI回复中，请稍后再试')
    return
  }
  const { uuid } = group
  if (chatStore.active === uuid) return
  await chatStore.setActiveGroup(uuid)
  if (isMobile.value) appStore.setSiderCollapsed(true)
}

async function handleDelete(params: Chat.History) {
  event?.stopPropagation()
  await chatStore.deleteGroup(params)
  await chatStore.queryMyGroup()
  if (isMobile.value) appStore.setSiderCollapsed(true)
}
</script>

<template>
  <div class="custom-scrollbar px-4 overflow-y-auto h-full">
    <div class="flex flex-col gap-3 text-sm">
      <div class="mb-3 space-y-2">
        <button
          type="button"
          class="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-transparent text-gray-800 hover:bg-black/5 dark:text-gray-100 dark:hover:bg-white/5"
          @click="handleNewChat"
        >
          <EditTwo size="18" />
          <span class="text-sm font-medium">新聊天</span>
        </button>
        <button
          type="button"
          class="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-transparent text-gray-800 hover:bg-black/5 dark:text-gray-100 dark:hover:bg-white/5"
          @click="handleOpenAppCenter"
        >
          <ApplicationTwo size="18" />
          <span class="text-sm font-medium">应用</span>
        </button>
      </div>

      <template v-if="!dataSources.length">
        <div class="flex flex-col items-center mt-4 text-center text-gray-400">
          <SvgIcon icon="ri:inbox-line" class="mb-2 text-3xl" />
          <span>{{ t('common.noData') }}</span>
        </div>
      </template>
      <template v-else>
        <div class="space-y-1">
          <ListItem
            :key="'all-' + customKeyId"
            title="全部项目"
            :data-sources="mergedList"
            @select="handleSelect"
            @delete="handleDelete"
          />
        </div>
      </template>
    </div>
  </div>
</template>
