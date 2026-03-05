<script setup lang="ts">
import { inject } from 'vue'
import { useAuthStore } from '@/store'

const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>

const authStore = useAuthStore()

const emit = defineEmits<{
  (e: 'import'): void
}>()

const requireLogin = () => {
  if (authStore.isLogin) return true
  authStore.setLoginDialog(true)
  return false
}

const handleCreate = async () => {
  if (!requireLogin()) return
  await createNewChatGroup()
}

const handleImport = () => {
  if (!requireLogin()) return
  emit('import')
}

const handleToggleView = () => {
  requireLogin()
}
</script>

<template>
  <section class="workspace-home">
    <div class="workspace-toolbar">
      <div class="workspace-title">你的项目</div>
      <div class="workspace-actions">
        <label class="workspace-search">
          <span class="workspace-search-icon" aria-hidden="true">⌕</span>
          <input type="search" placeholder="搜索" aria-label="搜索项目" />
        </label>
        <div class="workspace-toggle" role="group" aria-label="视图切换">
          <button type="button" class="toggle-btn" aria-label="列表视图" @click="handleToggleView">
            <span class="toggle-bars"></span>
          </button>
          <button type="button" class="toggle-btn" aria-label="网格视图" @click="handleToggleView">
            <span class="toggle-dots"></span>
          </button>
        </div>
        <button type="button" class="btn btn-secondary btn-md" @click="handleImport">导入</button>
        <button type="button" class="btn btn-primary btn-md" @click="handleCreate">+ 新建</button>
      </div>
    </div>

    <div class="workspace-empty">
      <div class="workspace-empty-card">
        <div class="empty-title">你还没有任何项目</div>
        <div class="empty-sub">在 YutoLens 上从托管项目开始</div>
        <button type="button" class="btn btn-primary btn-md" @click="handleCreate">从零开始</button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.workspace-home {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 28px 28px 24px;
  gap: 28px;
}

.workspace-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.workspace-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-main);
}

.workspace-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.workspace-search {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  min-width: 240px;
}

.workspace-search input {
  border: none;
  outline: none;
  width: 100%;
  font-size: 14px;
  background: transparent;
  color: var(--text-main);
}

.workspace-search-icon {
  font-size: 16px;
  color: var(--text-sub);
}

.workspace-toggle {
  display: inline-flex;
  gap: 6px;
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--surface-card);
}

.toggle-btn {
  border: none;
  background: transparent;
  width: 34px;
  height: 34px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text-sub);
}

.toggle-btn:hover {
  background: rgba(17, 24, 39, 0.06);
  color: var(--text-main);
}

.toggle-bars {
  width: 16px;
  height: 10px;
  display: block;
  background: linear-gradient(
    to bottom,
    currentColor 0,
    currentColor 2px,
    transparent 2px,
    transparent 4px,
    currentColor 4px,
    currentColor 6px,
    transparent 6px,
    transparent 8px,
    currentColor 8px,
    currentColor 10px
  );
}

.toggle-dots {
  width: 12px;
  height: 12px;
  display: block;
  background: radial-gradient(currentColor 2px, transparent 2px);
  background-size: 6px 6px;
}

.workspace-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.workspace-empty-card {
  background: var(--surface-card);
  border-radius: 24px;
  padding: 32px 40px;
  min-width: 320px;
  text-align: center;
  box-shadow: var(--shadow-soft);
  border: 1px solid var(--border-color);
}

.empty-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 8px;
}

.empty-sub {
  font-size: 14px;
  color: var(--text-sub);
  margin-bottom: 18px;
}

@media (max-width: 960px) {
  .workspace-home {
    padding: 20px 16px;
  }

  .workspace-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .workspace-actions {
    width: 100%;
    justify-content: space-between;
  }

  .workspace-search {
    width: 100%;
  }
}
</style>
