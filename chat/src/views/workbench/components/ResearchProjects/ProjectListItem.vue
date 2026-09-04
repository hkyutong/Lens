<script setup lang="ts">
import { DropdownMenu } from '@/components/common/DropdownMenu'
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { t } from '@/locales'
import { useChatStore } from '@/store'
import { debounce } from '@/utils/functions/debounce'
import { CheckSmall, More } from '@icon-park/vue-next'
import { nextTick, ref } from 'vue'

const vFocus = {
  mounted: (element: HTMLElement) => nextTick(() => element.focus()),
}

interface Props {
  dataSources?: Chat.ChatState['groupList']
  title?: string
  showSearchAction?: boolean
}

const props = defineProps<Props>()
const dataSources = props.dataSources
const emit = defineEmits<{
  delete: [group: Chat.History]
  select: [group: Chat.History]
  search: []
}>()
const chatStore = useChatStore()
const menuStates = ref<Record<string | number, boolean>>({})

const selectProject = (group: Chat.History) => emit('select', group)

function editProject(group: Chat.History, editing: boolean, event?: MouseEvent) {
  event?.stopPropagation()
  group.isEdit = editing
}

async function togglePinned(group: Chat.History, event?: MouseEvent) {
  event?.stopPropagation()
  await chatStore.updateGroupInfo({ isSticky: !group.isSticky, groupId: group.uuid })
}

const deleteProject = debounce((group: Chat.History, event?: MouseEvent | TouchEvent) => {
  event?.stopPropagation()
  emit('delete', group)
}, 600)

async function saveProjectTitle(group: Chat.History) {
  group.isEdit = false
  await chatStore.updateGroupInfo({ groupId: group.uuid, title: group.title })
}

function handleTitleKey(group: Chat.History, event: KeyboardEvent) {
  event.stopPropagation()
  if (event.key === 'Enter') saveProjectTitle(group)
}
</script>

<template>
  <section v-if="dataSources?.length" class="project-list">
    <header v-if="title" class="project-list__header">
      <span>{{ title }} <small>({{ dataSources.length }})</small></span>
      <button
        v-if="showSearchAction"
        type="button"
        :aria-label="t('lens.sidebar.searchProject')"
        @click="emit('search')"
      >
        <SvgIcon icon="ri:search-line" />
      </button>
    </header>

    <div
      v-for="item in dataSources"
      :key="item.uuid"
      class="project-list__item"
      :class="{ active: chatStore.active === item.uuid }"
      role="button"
      tabindex="0"
      @click="selectProject(item)"
      @keydown.enter.prevent="selectProject(item)"
      @keydown.space.prevent="selectProject(item)"
    >
      <input
        v-if="item.isEdit"
        v-model="item.title"
        v-focus
        type="text"
        @click.stop
        @keydown="handleTitleKey(item, $event)"
      />
      <span v-else class="project-list__title">
        <i v-if="item.isSticky" aria-hidden="true"></i>
        {{ item.title || t('lens.sidebar.unnamedProject') }}
      </span>

      <CheckSmall
        v-if="item.isEdit"
        size="18"
        aria-hidden="true"
        @click.stop="saveProjectTitle(item)"
      />
      <DropdownMenu v-else v-model="menuStates[item.uuid]" position="auto" min-width="128px">
        <template #trigger>
          <button type="button" class="project-list__more" @click.stop>
            <More size="18" aria-hidden="true" />
          </button>
        </template>
        <template #menu="{ close }">
          <div>
            <button
              type="button"
              class="menu-item menu-item-md w-full"
              @click="editProject(item, true); close()"
            >
              {{ t('chat.rename') }}
            </button>
            <button
              type="button"
              class="menu-item menu-item-md w-full"
              @click="togglePinned(item); close()"
            >
              {{ item.isSticky ? t('chat.unfavorite') : t('chat.favoriteConversations') }}
            </button>
            <button
              type="button"
              class="menu-item menu-item-md w-full"
              @click="deleteProject(item); close()"
            >
              {{ t('chat.deleteConversation') }}
            </button>
          </div>
        </template>
      </DropdownMenu>
    </div>
  </section>
</template>

<style scoped>
.project-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.project-list__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 4px 5px;
  color: var(--ink-faint);
  font-size: 11px;
  font-weight: 650;
}
.project-list__header small {
  font-size: 9px;
  font-weight: 500;
}
.project-list__header button,
.project-list__more {
  display: grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border-radius: 7px;
  color: var(--ink-faint);
}
.project-list__header button:hover,
.project-list__more:hover {
  background: var(--surface-muted);
  color: var(--text-main);
}
.project-list__item {
  display: flex;
  min-height: 40px;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 11px;
  border: 1px solid transparent;
  border-radius: 9px;
  color: var(--text-main);
  cursor: pointer;
}
.project-list__item:hover,
.project-list__item.active {
  border-color: var(--paper-border);
  background: var(--surface-muted);
}
.project-list__item > input {
  min-width: 0;
  flex: 1;
  border-bottom: 1px solid var(--academic-border);
  background: transparent;
  outline: none;
}
.project-list__title {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 7px;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.project-list__title i {
  width: 6px;
  height: 6px;
  flex: none;
  border-radius: 50%;
  background: var(--academic-blue);
}
</style>
