<script setup lang="ts">
import { t } from '@/locales'
import { computed } from 'vue'

interface Props {
  html: string
  loading?: boolean
  error?: string
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  error: '',
})

const hasContent = computed(() => Boolean(props.html.trim()))

function openWorkspace() {
  window.location.assign('/')
}
</script>

<template>
  <main class="shared-view min-h-screen bg-[var(--bg-body)] px-4 py-6 sm:px-8">
    <div class="mx-auto flex min-h-[calc(100vh-3rem)] max-w-6xl flex-col">
      <header
        class="flex items-center justify-between gap-4 border-b border-[var(--border-light)] pb-4"
      >
        <div class="min-w-0">
          <p class="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-primary)]">
            {{ t('lens.share.eyebrow') }}
          </p>
          <h1 class="mt-1 truncate text-lg font-semibold text-[var(--text-main)]">
            {{ t('lens.share.title') }}
          </h1>
        </div>
        <button
          type="button"
          class="shrink-0 rounded-lg border border-[var(--border-light)] px-3 py-2 text-sm text-[var(--text-main)] transition-colors hover:bg-[var(--surface-muted)]"
          @click="openWorkspace"
        >
          {{ t('lens.share.openWorkspace') }}
        </button>
      </header>

      <section class="flex flex-1 items-center justify-center py-6">
        <div
          v-if="props.loading"
          class="rounded-xl border border-[var(--border-light)] bg-[var(--surface-panel)] px-6 py-5 text-sm text-[var(--ink-muted)]"
          role="status"
        >
          {{ t('lens.share.loading') }}
        </div>
        <div
          v-else-if="props.error || !hasContent"
          class="max-w-md rounded-xl border border-[var(--border-light)] bg-[var(--surface-panel)] px-6 py-5 text-center"
          role="alert"
        >
          <p class="text-sm text-[var(--text-main)]">
            {{ props.error || t('lens.share.notFound') }}
          </p>
          <button
            type="button"
            class="mt-4 rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white"
            @click="openWorkspace"
          >
            {{ t('lens.share.backToWorkspace') }}
          </button>
        </div>
        <iframe
          v-else
          :srcdoc="props.html"
          class="h-[calc(100vh-9rem)] min-h-[520px] w-full rounded-xl border border-[var(--border-light)] bg-white shadow-sm"
          :title="t('lens.share.frameTitle')"
          frameborder="0"
          loading="eager"
          referrerpolicy="no-referrer"
          sandbox="allow-same-origin"
        />
      </section>

      <p class="pb-1 text-center text-xs text-[var(--ink-faint)]">
        {{ t('lens.share.readOnlyNotice') }}
      </p>
    </div>
  </main>
</template>
