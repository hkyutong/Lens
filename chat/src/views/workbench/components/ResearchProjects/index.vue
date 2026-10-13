<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { t } from '@/locales'
import { useChatStore } from '@/store'
import { message } from '@/utils/message'
import { computed, inject, nextTick, ref, watch } from 'vue'
import ProjectListItem from './ProjectListItem.vue'
import ResearchSearchField from '../ResearchSearchField.vue'

const emit = defineEmits<{ close: [] }>()
const props = withDefaults(defineProps<{ embedded?: boolean }>(), { embedded: false })
const chatStore = useChatStore()
const ms = message()
const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>
const searchInputRef = ref<InstanceType<typeof ResearchSearchField>>()
const searchButtonRef = ref<HTMLButtonElement>()
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
    await nextTick()
    searchButtonRef.value?.focus()
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
      </div>
      <div class="research-projects__actions">
        <button v-if="projects.length" ref="searchButtonRef" type="button"
          :aria-label="t('lens.sidebar.searchProject')" :aria-expanded="searchVisible"
          @click="toggleSearch">
          <SvgIcon icon="ri:search-line" aria-hidden="true" />
        </button>
        <button v-if="!props.embedded" type="button" :aria-label="t('lens.header.close')"
          @click="emit('close')">
          <SvgIcon icon="ri:close-line" aria-hidden="true" />
        </button>
      </div>
    </header>

    <button type="button" class="research-projects__new" @click="createProject">
      <SvgIcon icon="ri:add-line" />{{ t('lens.sidebar.newProject') }}
    </button>

    <ResearchSearchField v-if="searchVisible" ref="searchInputRef" v-model="keyword"
      class="research-projects__search" :label="t('lens.sidebar.searchProject')"
      @keydown.esc.stop.prevent="toggleSearch" />

    <div class="research-projects__body custom-scrollbar">
      <div v-if="!projects.length" class="research-projects__empty">
        <SvgIcon icon="ri:folder-open-line" />
        <span>{{ t('lens.sidebar.noRecords') }}</span>
      </div>
      <template v-else>
        <p v-if="keyword && !pinnedProjects.length && !recentProjects.length" class="research-projects__empty">
          {{ t('lens.sidebar.noSearchResults') }}
        </p>
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
          @select="selectProject"
          @delete="deleteProject"
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
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
}
.research-projects__header strong {
  color: var(--text-main);
  font-size: 15px;
  font-weight: 700;
}
.research-projects__header button {
  display: grid;
  width: 44px;
  height: 44px;
  place-items: center;
  border-radius: var(--radius-control);
  color: var(--text-sub);
}
.research-projects__header button:hover {
  background: var(--surface-muted);
}
.research-projects__new {
  display: flex;
  min-height: 44px;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 0 12px;
  margin-top: 8px;
  border: 0;
  border-radius: var(--radius-control);
  background: var(--academic-accent-soft);
  color: var(--accent-strong);
  font-size: 13px;
  font-weight: 500;
}
.research-projects__new:hover { background: var(--academic-surface); }
.research-projects__actions { display: flex; align-items: center; gap: 4px; }
.research-projects__actions svg { width: 16px; height: 16px; }
.research-projects :deep(.research-search-field) { margin-top: 10px; }
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
  color: var(--text-sub);
  font-size: 13px;
}
.research-projects__empty svg {
  width: 24px;
  height: 24px;
}
</style>
