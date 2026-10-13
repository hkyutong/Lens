<script setup lang="ts">
import { DropdownMenu } from '@/components/common/DropdownMenu'
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
}

const props = defineProps<Props>()
const dataSources = props.dataSources
const emit = defineEmits<{
  delete: [group: Chat.History]
  select: [group: Chat.History]
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

function closeProjectMenu(group: Chat.History, event: KeyboardEvent) {
  if (!menuStates.value[group.uuid]) return
  event.preventDefault()
  event.stopPropagation()
  menuStates.value[group.uuid] = false
}
</script>

<template>
  <section v-if="dataSources?.length" class="project-list">
    <header v-if="title" class="project-list__header">
      <span>{{ title }} <small>({{ dataSources.length }})</small></span>

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
        :aria-label="t('chat.rename')"
        @click.stop
        @keydown="handleTitleKey(item, $event)"
      />
      <span v-else class="project-list__title">
        <i v-if="item.isSticky" aria-hidden="true"></i>
        {{ item.title || t('lens.sidebar.unnamedProject') }}
      </span>

      <button v-if="item.isEdit" type="button" class="project-list__more"
        :aria-label="t('lens.settings.confirm')" @click.stop="saveProjectTitle(item)" @keydown.stop>
        <CheckSmall size="18" aria-hidden="true" />
      </button>
      <DropdownMenu v-else v-model="menuStates[item.uuid]" position="auto" min-width="128px">
        <template #trigger="{ isOpen }">
          <button type="button" class="project-list__more" :aria-label="t('chat.more')"
            :aria-expanded="isOpen" aria-haspopup="true"
            @click.stop="menuStates[item.uuid] = !isOpen"
            @keydown.enter.stop @keydown.space.stop @keydown.esc="closeProjectMenu(item, $event)">
            <More size="18" aria-hidden="true" />
          </button>
        </template>
        <template #menu="{ close }">
          <div @click.stop @keydown.enter.stop @keydown.space.stop @keydown.esc.stop.prevent="close">
            <button
              type="button"
              class="menu-item menu-item-md"
              @click="editProject(item, true); close()"
            >
              {{ t('chat.rename') }}
            </button>
            <button
              type="button"
              class="menu-item menu-item-md"
              @click="togglePinned(item); close()"
            >
              {{ item.isSticky ? t('chat.unfavorite') : t('chat.favoriteConversations') }}
            </button>
            <button
              type="button"
              class="menu-item menu-item-md"
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
  color: var(--text-sub);
  font-size: 11px;
  font-weight: 650;
}
.project-list__header small {
  font-size: 11px;
  font-weight: 500;
}
.project-list__more {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: var(--radius-control);
  color: var(--text-sub);
}
.project-list__more:hover {
  background: var(--surface-muted);
  color: var(--text-main);
}
.project-list__item {
  display: flex;
  min-height: 48px;
  align-items: center;
  gap: 8px;
  padding: 2px 4px 2px 12px;
  border: 0;
  border-radius: var(--radius-control);
  color: var(--text-main);
  cursor: pointer;
}
.project-list__item:hover,
.project-list__item.active {
  background: var(--academic-surface);
}
.project-list__item > input {
  min-width: 0;
  flex: 1;
  border-bottom: 1px solid var(--academic-border);
  background: transparent;
}
.project-list__title {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  gap: 7px;
  overflow: hidden;
  font-size: 13px;
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
