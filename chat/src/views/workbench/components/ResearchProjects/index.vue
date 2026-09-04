<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { t } from '@/locales'
import { useChatStore } from '@/store'
import { message } from '@/utils/message'
import { computed, inject, nextTick, ref, watch } from 'vue'
import ProjectListItem from './ProjectListItem.vue'

const emit = defineEmits<{ close: [] }>()
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const chatStore = useChatStore()
const ms = message()
const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>
const searchInputRef = ref<HTMLInputElement | null>(null)
const searchVisible = ref(false)
const renderKey = ref(0)

const projects = computed(() => chatStore.groupList || [])
const keyword = computed({
  get: () => chatStore.groupKeyWord || '',
  set: value => chatStore.setGroupKeyWord(String(value || '')),
})
const pinnedProjects = computed(() =>
  projects.value.filter(project => project.isSticky && matchesKeyword(project))
)
const recentProjects = computed(() =>
  projects.value.filter(project => !project.isSticky && matchesKeyword(project))
)
const isBusy = computed(() => Boolean(chatStore.isStreamIn))

watch([projects, keyword], () => (renderKey.value += 1))

function matchesKeyword(project: Chat.History) {
  const query = keyword.value.trim().toLowerCase()
  return !query || String(project.title || '').toLowerCase().includes(query)
}

async function selectProject(project: Chat.History) {
  if (isBusy.value) {
    ms.info(t('lens.footer.busyRetry'))
    return
  }
  if (chatStore.active !== project.uuid) await chatStore.setActiveGroup(project.uuid)
  emit('close')
}

async function deleteProject(project: Chat.History) {
  await chatStore.deleteGroup(project)
  await chatStore.queryMyGroup()
}

async function createProject() {
  await createNewChatGroup()
  emit('close')
}

async function toggleSearch() {
  searchVisible.value = !searchVisible.value
  if (!searchVisible.value) {
    keyword.value = ''
    return
  }
  await nextTick()
  searchInputRef.value?.focus()
}
</script>

<template>
  <div class="research-projects" :class="{ 'research-projects--embedded': props.embedded }">
    <header class="research-projects__header">
      <div>
        <strong>{{ t('lens.header.projects') }}</strong>
        <p>{{ t('lens.sidebar.researchProject') }}</p>
      </div>
      <button
        v-if="!props.embedded"
        type="button"
        :aria-label="t('lens.header.close')"
        @click="emit('close')"
      >
        <SvgIcon icon="ri:close-line" />
      </button>
    </header>

    <button type="button" class="research-projects__new" @click="createProject">
      <SvgIcon icon="ri:add-line" />{{ t('lens.sidebar.newProject') }}
    </button>

    <input
      v-if="searchVisible"
      ref="searchInputRef"
      v-model="keyword"
      type="search"
      class="research-projects__search"
      :placeholder="t('lens.sidebar.searchProject')"
      @keydown.esc="toggleSearch"
    />

    <div class="research-projects__body custom-scrollbar">
      <div v-if="!projects.length" class="research-projects__empty">
        <SvgIcon icon="ri:folder-open-line" />
        <span>{{ t('lens.sidebar.researchProject') }}</span>
      </div>
      <template v-else>
        <ProjectListItem
          v-if="pinnedProjects.length"
          :key="`pinned-${renderKey}`"
          :title="t('lens.sidebar.pinned')"
          :data-sources="pinnedProjects"
          @select="selectProject"
          @delete="deleteProject"
        />
        <ProjectListItem
          :key="`recent-${renderKey}`"
          :title="t('lens.sidebar.researchProject')"
          :data-sources="recentProjects"
          :show-search-action="true"
          @select="selectProject"
          @delete="deleteProject"
          @search="toggleSearch"
        />
      </template>
    </div>
  </div>
</template>

<style scoped>
.research-projects {
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
  padding: 20px;
}
.research-projects--embedded {
  padding: 18px 14px;
}
.research-projects__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--paper-border);
}
.research-projects__header strong {
  color: var(--text-main);
  font-size: 15px;
  font-weight: 700;
}
.research-projects__header p {
  margin: 4px 0 0;
  color: var(--ink-faint);
  font-size: 10px;
}
.research-projects__header button {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 8px;
  color: var(--text-sub);
}
.research-projects__header button:hover {
  background: var(--surface-muted);
}
.research-projects__new {
  display: flex;
  min-height: 38px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 16px;
  border: 1px solid var(--academic-blue);
  border-radius: 8px;
  background: var(--academic-blue);
  color: #fff;
  font-size: 11px;
  font-weight: 650;
}
.research-projects__search {
  min-height: 38px;
  margin-top: 10px;
  padding: 0 11px;
  border: 1px solid var(--paper-border);
  border-radius: 8px;
  background: var(--surface-muted);
  color: var(--text-main);
  font-size: 11px;
  outline: none;
}
.research-projects__search:focus {
  border-color: var(--academic-border);
}
.research-projects__body {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  padding-top: 12px;
}
.research-projects__empty {
  display: flex;
  min-height: 140px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--ink-faint);
  font-size: 11px;
}
.research-projects__empty svg {
  width: 24px;
  height: 24px;
}
</style>
