<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAppStore, useChatStore } from '@/store'
import { message } from '@/utils/message'
import { computed, inject, nextTick, ref, watch } from 'vue'
import ListItem from './ListItem.vue'

const { isMobile } = useBasicLayout()
const appStore = useAppStore()
const chatStore = useChatStore()
const ms = message()
const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>
const searchInputRef = ref<HTMLInputElement | null>(null)
const showSearchInput = ref(false)

const customKeyId = ref(100)
const dataSources = computed(() => chatStore.groupList || [])
const groupKeyWord = computed(() => chatStore.groupKeyWord || '')
const groupKeyWordModel = computed({
  get: () => chatStore.groupKeyWord || '',
  set: value => chatStore.setGroupKeyWord(String(value || '')),
})

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

async function handleCreate() {
  await createNewChatGroup()
}

async function toggleSearch() {
  showSearchInput.value = !showSearchInput.value
  if (!showSearchInput.value) {
    closeSearch()
    return
  }
  await nextTick()
  searchInputRef.value?.focus()
}

function closeSearch() {
  showSearchInput.value = false
  groupKeyWordModel.value = ''
}
</script>

<template>
  <div class="custom-scrollbar px-5 overflow-y-auto h-full">
    <div class="flex flex-col gap-3 text-sm">
      <div class="flex items-center">
        <button
          type="button"
          class="flex flex-1 items-center rounded-[14px] bg-transparent px-0 py-2.5 text-left text-[var(--accent)] transition hover:bg-[var(--surface-muted)]"
          @click="handleCreate"
        >
          <div class="flex items-center gap-2.5">
            <span class="flex h-[26px] w-[26px] shrink-0 items-center justify-center">
              <SvgIcon icon="ri:edit-line" class="text-[16px]" />
            </span>
            <span class="text-[14px] font-normal">{{ t('lens.sidebar.newProject') }}</span>
          </div>
        </button>
      </div>

      <input
        v-if="showSearchInput"
        ref="searchInputRef"
        v-model="groupKeyWordModel"
        type="text"
        :placeholder="t('lens.sidebar.searchProject')"
        class="h-[42px] w-full rounded-[14px] border border-[var(--paper-border)] bg-[var(--surface-muted)] px-3 text-sm text-[var(--text-main)] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--border-color)]"
        @keydown.esc="closeSearch"
      />

      <template v-if="!dataSources.length">
        <div
          class="flex items-center rounded-[12px] bg-[var(--surface-muted)] px-3 py-3 text-[var(--ink-soft)] transition-colors hover:bg-[var(--surface-panel)]"
        >
          <SvgIcon icon="ri:inbox-line" class="mr-3 text-xl" />
          <div class="min-w-0">
            <div class="text-sm font-normal">{{ t('lens.sidebar.researchProject') }}</div>
          </div>
        </div>
      </template>
      <template v-else>
        <div class="space-y-3">
          <ListItem
            v-if="stickyList.length"
            :key="'sticky-' + customKeyId"
            :title="t('lens.sidebar.pinned')"
            :data-sources="stickyList"
            @select="handleSelect"
            @delete="handleDelete"
          />
          <ListItem
            :key="'history-' + customKeyId"
            :title="t('lens.sidebar.researchProject')"
            :data-sources="historyList"
            :show-search-action="true"
            @select="handleSelect"
            @delete="handleDelete"
            @search="toggleSearch"
          />
        </div>
      </template>
    </div>
  </div>
</template>
