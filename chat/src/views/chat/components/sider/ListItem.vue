<script setup lang="ts">
import { DropdownMenu } from '@/components/common/DropdownMenu'
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { t } from '@/locales'
import { useChatStore } from '@/store'
import { debounce } from '@/utils/functions/debounce'
import { CheckSmall, More } from '@icon-park/vue-next'
import { nextTick, ref } from 'vue'

// 注册focus指令
const vFocus = {
  mounted: (el: HTMLElement) => {
    nextTick(() => {
      el.focus()
    })
  },
}

// 菜单状态管理
const menuStates = ref<Record<string | number, boolean>>({})

interface Props {
  dataSources?: Chat.ChatState['groupList']
  title?: string
  showSearchAction?: boolean
}
interface Emit {
  (ev: 'update', group: Chat.History, isEdit: boolean): void
  (ev: 'delete', group: Chat.History): void
  (ev: 'sticky', group: Chat.History): void
  (ev: 'select', group: Chat.History): void
  (ev: 'search'): void
}
const props = defineProps<Props>()
const emit = defineEmits<Emit>()

const dataSources = props.dataSources

const chatStore = useChatStore()

async function handleSelect(group: Chat.History) {
  emit('select', group)
}

function handleEdit(group: Chat.History, isEdit: boolean, event?: MouseEvent) {
  event?.stopPropagation()
  group.isEdit = isEdit
}

async function handleSticky(group: Chat.History, event?: MouseEvent) {
  event?.stopPropagation()
  await chatStore.updateGroupInfo({
    isSticky: !group.isSticky,
    groupId: group.uuid,
  })
}

/* 删除对话组 */
async function handleDelete(params: Chat.History, event?: MouseEvent | TouchEvent) {
  event?.stopPropagation()
  emit('delete', params)
}

const handleDeleteDebounce = debounce(handleDelete, 600)

/* 修改对话组title */
async function updateGroupTitle(params: Chat.History) {
  const { uuid, title } = params
  params.isEdit = false
  await chatStore.updateGroupInfo({ groupId: uuid, title })
}

/* 修改对话组信息 */
async function handleEnter(params: Chat.History, event: KeyboardEvent) {
  event?.stopPropagation()

  if (event.key === 'Enter') updateGroupTitle(params)
}

/* 判断是不是当前选中 */
function isActive(uuid: number) {
  return chatStore.active === uuid
}

function handleSearch(event?: MouseEvent) {
  event?.stopPropagation()
  emit('search')
}
</script>

<template>
  <div v-if="dataSources?.length" class="space-y-1">
    <div
      v-if="props.title"
      class="flex items-center justify-between px-0 text-[12px] font-medium text-[var(--ink-faint)]"
    >
      <div>
        {{ props.title }} <span class="ml-1">({{ dataSources?.length }})</span>
      </div>
      <button
        v-if="showSearchAction"
        type="button"
        class="flex h-5 w-5 items-center justify-center rounded-full text-[var(--ink-faint)] transition hover:text-[var(--text-main)]"
        :aria-label="t('lens.sidebar.searchProject')"
        @click="handleSearch"
      >
        <SvgIcon icon="ri:search-line" class="text-[12px]" />
      </button>
    </div>
  </div>
  <div v-for="item of dataSources" :key="`${item.uuid}`" class="mt-1">
    <div
      class="relative flex items-center gap-3 px-3 py-2.5 break-all rounded-[12px] cursor-pointer group text-[13px] border transition-all duration-150"
      :class="
        isActive(item.uuid)
          ? [
              'bg-[var(--surface-muted)]',
              'text-[var(--text-main)]',
              'border-transparent',
              'dark:bg-white/10',
              'dark:text-white',
            ]
          : [
              'text-[var(--text-main)]',
              'border-transparent',
              'bg-transparent',
              'hover:bg-[var(--surface-muted)]',
              'dark:text-white/80',
              'dark:hover:bg-white/6',
            ]
      "
      @click="handleSelect(item)"
    >
      <div class="flex min-w-0 flex-1 items-center">
        <input
          v-if="item.isEdit"
          v-model="item.title"
          v-focus
          type="text"
          class="bg-transparent border border-gray-200 dark:border-gray-400 px-1 shadow-none flex-1 truncate"
          @keypress="handleEnter(item, $event)"
        />
        <div v-else class="min-w-0 flex-1">
          <div class="flex items-center gap-2">
            <span v-if="item.isSticky" class="h-2 w-2 rounded-full bg-[var(--accent)]"></span>
            <span class="flex-1 truncate max-w-48 font-normal">{{ item.title || '未命名项目' }}</span>
          </div>
        </div>
        <CheckSmall
          v-if="item.isEdit"
          class="ml-2"
          theme="outline"
          size="20"
          aria-hidden="true"
          @click="updateGroupTitle(item)"
        />
      </div>
      <div
        v-if="!item.isEdit"
        class="absolute z-10 right-2 top-1/2 -translate-y-1/2 flex items-center transition-opacity duration-150"
        :class="
          isActive(item.uuid) || menuStates[item.uuid]
            ? 'opacity-100 pointer-events-auto'
            : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
        "
        @click.stop
      >
        <!-- 下拉菜单 -->
        <DropdownMenu v-model="menuStates[item.uuid]" position="auto" min-width="128px">
          <template #trigger>
            <div class="flex items-center justify-center w-6 h-6 transition-colors">
              <More size="20" aria-hidden="true" />
            </div>
          </template>
          <template #menu="{ close }">
            <div>
              <div
                class="menu-item menu-item-md"
                @click="
                  () => {
                    handleEdit(item, true)
                    close()
                  }
                "
                role="menuitem"
                tabindex="0"
              >
                {{ t('chat.rename') }}
              </div>
              <div
                class="menu-item menu-item-md"
                @click="
                  () => {
                    handleSticky(item)
                    close()
                  }
                "
                role="menuitem"
                tabindex="0"
              >
                {{ item.isSticky ? t('chat.unfavorite') : t('chat.favoriteConversations') }}
              </div>
              <div
                class="menu-item menu-item-md"
                @click="
                  () => {
                    handleDeleteDebounce(item)
                    close()
                  }
                "
                role="menuitem"
                tabindex="0"
              >
                {{ t('chat.deleteConversation') }}
              </div>
            </div>
          </template>
        </DropdownMenu>
      </div>
    </div>
  </div>
</template>
