<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { parseResearchFiles } from '@/domain/research/files'
import { t } from '@/locales'
import { useChatStore } from '@/store'
import { computed } from 'vue'
import ResearchCapabilities from './ResearchCapabilities.vue'
import ResearchShortcuts from './ResearchShortcuts.vue'

const chatStore = useChatStore()
const props = withDefaults(defineProps<{ showCapabilities?: boolean }>(), {
  showCapabilities: true,
})
const emit = defineEmits<{ import: [] }>()
const researchFiles = computed(() => parseResearchFiles(chatStore.activeGroupFileUrl))
</script>

<template>
  <section class="academic-home" aria-labelledby="research-start-title">
    <div class="academic-home__heading">
      <div class="academic-home__intro">
        <h1 id="research-start-title">{{ t('lens.workspace.capabilityTitle') }}</h1>
      </div>
      <button type="button" class="academic-home__import" @click="emit('import')">
        <SvgIcon icon="ri:inbox-line" />
        {{ t('lens.workspace.importData') }}
      </button>
    </div>

    <div id="research-home-input" class="academic-home__composer"></div>

    <section v-if="researchFiles.length" class="academic-home__files">
      <strong>{{ t('lens.workspace.importedFilesLabel') }}</strong>
      <span v-for="file in researchFiles" :key="file.url">
        <SvgIcon icon="ri:file-text-line" />{{ file.name }}
      </span>
    </section>

    <ResearchShortcuts class="academic-home__shortcuts" />
    <ResearchCapabilities v-if="props.showCapabilities" class="academic-home__capabilities" />

  </section>
</template>

<style scoped>
.academic-home {
  position: relative;
  isolation: isolate;
  display: flex;
  max-width: 680px;
  margin: 0 auto;
  flex-direction: column;
  padding: 24px 0;
  color: var(--text-main);
}

.academic-home__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin: 0 0 24px;
}

.academic-home__import {
  display: inline-flex;
  flex: none;
  align-items: center;
  gap: 6px;
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--academic-accent);
  font-size: 13px;
  font-weight: 500;
}
.academic-home__import:hover { background: var(--accent-soft); }

.academic-home__intro {
  min-width: 0;
}

.academic-home__intro h1 {
  margin: 0;
  max-width: 560px;
  color: var(--academic-ink);
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', system-ui, sans-serif;
  font-size: clamp(28px, 2.4vw, 32px);
  font-weight: 650;
  letter-spacing: -0.03em;
  line-height: 1.2;
  text-wrap: balance;
}

.academic-home__capabilities {
  width: 100%;
  margin-top: 32px;
}

.academic-home__shortcuts {
  width: 100%;
  margin-top: 24px;
}

.academic-home__composer {
  width: 100%;
  min-width: 0;
}

.academic-home__files {
  display: flex;
  max-width: 100%;
  margin-top: 12px;
  max-height: 96px;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-start;
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
  border-radius: 8px;
  background: var(--surface-muted);
  color: var(--text-sub);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (min-width: 1024px) {
  .academic-home {
    min-height: 100%;
    justify-content: center;
  }
}

@media (min-width: 1024px) and (max-height: 760px) {
  .academic-home__capabilities {
    margin-top: 16px;
  }

}

@media (min-width: 1024px) and (max-height: 700px) {
  .academic-home {
    padding-block: 16px;
  }
  .academic-home__heading { margin-bottom: 16px; }
  .academic-home__shortcuts { margin-top: 12px; }
}

@media (max-width: 1023px) {
  .academic-home {
    min-height: auto;
    padding: 20px 12px 24px;
  }

  .academic-home__intro h1 {
    font-size: 30px;
  }

}

</style>
