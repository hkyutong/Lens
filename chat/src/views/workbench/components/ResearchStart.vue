<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { parseResearchFiles } from '@/domain/research/files'
import { t } from '@/locales'
import { useChatStore } from '@/store'
import { computed, nextTick } from 'vue'

const chatStore = useChatStore()
const emit = defineEmits<{ import: [] }>()
const researchFiles = computed(() => parseResearchFiles(chatStore.activeGroupFileUrl))

async function focusComposer() {
  await nextTick()
  const composer = document.getElementById('workspace-composer') as HTMLTextAreaElement | null
  composer?.focus()
}

async function startBlankResearch() {
  chatStore.setAcademicMode(true)
  await chatStore.setPrompt('')
  await focusComposer()
}
</script>

<template>
  <section class="academic-home">
    <div class="academic-home__intro">
      <span class="academic-home__symbol" aria-hidden="true">
        <SvgIcon icon="ri:book-open-line" />
      </span>
      <h1>{{ t('lens.workspace.heroTitle') }}</h1>
      <p>{{ t('lens.workspace.introDesc') }}</p>
    </div>

    <div class="academic-home__actions">
      <button type="button" class="academic-home__import" @click="emit('import')">
        <SvgIcon icon="ri:inbox-line" />
        {{ t('lens.workspace.importData') }}
      </button>
      <button type="button" class="academic-home__direct" @click="startBlankResearch">
        <SvgIcon icon="ri:chat-quote-line" />
        {{ t('lens.workspace.heroPrimaryAction') }}
      </button>
    </div>

    <section v-if="researchFiles.length" class="academic-home__files">
      <strong>{{ t('lens.workspace.importedFilesLabel') }}</strong>
      <span v-for="file in researchFiles" :key="file.url">
        <SvgIcon icon="ri:file-text-line" />{{ file.name }}
      </span>
    </section>
  </section>
</template>

<style scoped>
.academic-home {
  display: flex;
  height: 100%;
  min-height: 0;
  max-width: 680px;
  margin: 0 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-main);
  text-align: center;
}

.academic-home__intro {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.academic-home__symbol {
  display: inline-flex;
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  margin-bottom: 20px;
  border: 1px solid var(--paper-border);
  border-radius: 14px;
  background: var(--surface-card);
  color: var(--academic-blue);
  box-shadow: var(--shadow-card);
}

.academic-home__symbol > svg {
  width: 22px;
  height: 22px;
}

.academic-home__intro h1 {
  margin: 0;
  font-size: clamp(32px, 4vw, 44px);
  font-weight: 650;
  letter-spacing: -0.035em;
  line-height: 1.08;
}

.academic-home__intro p {
  max-width: 580px;
  margin: 14px 0 0;
  color: var(--text-sub);
  font-size: 16px;
  line-height: 1.55;
}

.academic-home__actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 28px;
}

.academic-home__actions button {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 18px;
  border: 1px solid var(--paper-border);
  border-radius: 999px;
  font-size: 13px;
  font-weight: 550;
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    transform 180ms ease;
}

.academic-home__import {
  border-color: var(--academic-blue) !important;
  background: var(--academic-blue);
  color: #fff;
}

.academic-home__direct {
  background: var(--surface-card);
  color: var(--text-main);
}

.academic-home__actions button:hover {
  transform: translateY(-1px);
}

.academic-home__actions button:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}

.academic-home__files {
  display: flex;
  max-width: 640px;
  max-height: 96px;
  margin-top: 22px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 7px;
  overflow-y: auto;
}

.academic-home__files > strong {
  margin-right: 4px;
  color: var(--text-sub);
  font-size: 12px;
  font-weight: 600;
}

.academic-home__files span {
  display: inline-flex;
  max-width: 200px;
  min-height: 30px;
  align-items: center;
  gap: 4px;
  padding: 5px 9px;
  overflow: hidden;
  border: 1px solid var(--paper-border);
  border-radius: 999px;
  background: var(--surface-muted);
  color: var(--text-sub);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 800px) {
  .academic-home {
    height: auto;
    min-height: 100%;
    padding: 32px 8px;
  }

  .academic-home__symbol {
    width: 44px;
    height: 44px;
    margin-bottom: 16px;
    border-radius: 13px;
  }

  .academic-home__intro h1 {
    font-size: 30px;
  }

  .academic-home__intro p {
    margin-top: 10px;
    font-size: 14px;
  }

  .academic-home__actions {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
    margin-top: 22px;
  }

  .academic-home__actions button {
    width: 100%;
    padding: 0 12px;
  }
}
</style>
