<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { useNativeDialog } from '@/hooks/useNativeDialog'
import { t } from '@/locales'
import { useAuthStore, useGlobalStoreWithOut } from '@/store'
import { dialog } from '@/utils/dialog'
import { computed, defineAsyncComponent, markRaw, ref, watch } from 'vue'
import { useRouter } from 'vue-router'

const AccountManagement = defineAsyncComponent(() => import('./Settings/AccountManagement.vue'))
const MemberCenter = defineAsyncComponent(() => import('./Settings/MemberCenter.vue'))
const NoticeDialog = defineAsyncComponent(() => import('./Settings/NoticeDialog.vue'))
const UserAgreement = defineAsyncComponent(() => import('./Settings/UserAgreement.vue'))

const props = defineProps<{ visible: boolean }>()
const dialogRef = ref<HTMLDialogElement | null>(null)
useNativeDialog(dialogRef, () => props.visible)
const authStore = useAuthStore()
const globalStore = useGlobalStoreWithOut()
const router = useRouter()

const tabs = computed(() => {
  const items = [
    {
      id: 'account',
      name: t('lens.settings.accountSecurity'),
      icon: 'ri:user-settings-line',
      component: markRaw(AccountManagement),
    },
    {
      id: 'member',
      name: t('lens.settings.upgradePlan'),
      icon: 'ri:award-line',
      component: markRaw(MemberCenter),
    },
    {
      id: 'notice',
      name: t('lens.settings.notice'),
      icon: 'ri:file-list-3-line',
      component: markRaw(NoticeDialog),
    },
  ]

  if (String(authStore.globalConfig.isAutoOpenAgreement) === '1') {
    items.push({
      id: 'agreement',
      name: t('lens.settings.agreement'),
      icon: 'ri:shield-check-line',
      component: markRaw(UserAgreement),
    })
  }

  return items
})

const activeTab = computed({
  get: () => {
    const index = Number(globalStore.settingsActiveTab)
    return index >= 0 && index < tabs.value.length ? index : 0
  },
  set: value => globalStore.updateSettingsActiveTab(value),
})

const activeItem = computed(() => tabs.value[activeTab.value] || tabs.value[0])

watch(
  () => tabs.value.length,
  length => {
    if (activeTab.value >= length) activeTab.value = 0
  }
)

function close() {
  globalStore.updateSettingsDialog(false)
}

function selectTab(index: number, id: string) {
  if (id === 'member') {
    close()
    void router.push('/pricing')
    return
  }
  activeTab.value = index
}

function requestLogout() {
  void dialog().warning({
    title: t('lens.settings.logoutTitle'),
    content: t('lens.settings.logoutConfirm'),
    positiveText: t('lens.settings.confirm'),
    negativeText: t('lens.settings.cancel'),
    onPositiveClick: () => {
      authStore.logOut()
      close()
    },
  }).catch(() => { /* Cancelling the confirmation leaves the account unchanged. */ })
}
</script>

<template>
  <Transition name="lens-settings">
    <dialog v-if="props.visible" ref="dialogRef" class="lens-dialog lens-settings"
      :aria-label="t('lens.settings.setting')" @cancel.prevent="close">
      <button
        type="button"
        class="lens-settings__backdrop"
        :aria-label="t('lens.header.close')"
        @click="close"
      />

      <section class="lens-settings__shell">
        <header class="lens-settings__mobile-header">
          <div>
            <strong>{{ activeItem?.name || t('lens.settings.setting') }}</strong>
          </div>
          <button type="button" :aria-label="t('lens.header.close')" @click="close">
            <SvgIcon icon="ri:close-line" />
          </button>
        </header>

        <header class="lens-settings__desktop-header">
          <h2>{{ t('lens.settings.setting') }}</h2>
          <button type="button" :aria-label="t('lens.header.close')" @click="close">
            <SvgIcon icon="ri:close-line" />
          </button>
        </header>
        <aside class="lens-settings__nav">
          <nav :aria-label="t('lens.settings.setting')">
            <button
              v-for="(item, index) in tabs"
              :key="item.id"
              type="button"
              :class="{ active: activeTab === index }"
              :aria-current="activeTab === index ? 'page' : undefined"
              @click="selectTab(index, item.id)"
            >
              <SvgIcon :icon="item.icon" />
              <span>{{ item.name }}</span>
            </button>
          </nav>

          <button type="button" class="lens-settings__logout" @click="requestLogout">
            <SvgIcon icon="ri:logout-box-r-line" />
            {{ t('lens.settings.logout') }}
          </button>
        </aside>

        <main class="lens-settings__main">
          <div class="lens-settings__content custom-scrollbar">
            <h2 class="lens-settings__section-heading">{{ activeItem?.name }}</h2>
            <component
              :is="activeItem?.component"
              v-if="activeItem?.component"
              :visible="props.visible"
            />
          </div>
        </main>
      </section>
    </dialog>
  </Transition>
</template>

<style scoped>
.lens-settings { position: fixed; inset: 0; z-index: 9000; display: grid; place-items: center; padding: 24px; }
.lens-settings__backdrop { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: var(--modal-overlay); backdrop-filter: blur(8px); }
.lens-settings__shell {
  position: relative; display: grid; width: min(920px, 100%); height: min(680px, calc(100dvh - 48px));
  grid-template-columns: 176px minmax(0, 1fr); grid-template-rows: 64px minmax(0, 1fr);
  overflow: hidden; border-radius: var(--radius-panel); background: var(--surface-card); box-shadow: var(--dialog-shadow);
}
.lens-settings__desktop-header { grid-column: 1 / -1; display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; }
.lens-settings__desktop-header h2 { margin: 0; color: var(--text-main); font-size: 17px; font-weight: 600; }
.lens-settings__nav { display: flex; min-height: 0; flex-direction: column; padding: 8px 12px 16px; background: transparent; }
.lens-settings__nav nav { display: grid; gap: 4px; }
.lens-settings__nav nav button, .lens-settings__logout {
  display: flex; min-height: 44px; align-items: center; gap: 8px; padding: 0 10px; border: 0;
  border-radius: var(--radius-control); color: var(--text-sub); font-size: 13px; font-weight: 500; text-align: left;
  transition: background-color 160ms ease, color 160ms ease;
}
.lens-settings__nav nav button:hover { background: var(--academic-surface); color: var(--text-main); }
.lens-settings__nav nav button.active { background: var(--academic-accent-soft); color: var(--accent-strong); }
.lens-settings__nav svg, .lens-settings__logout svg { width: 18px; height: 18px; flex: none; }
.lens-settings__logout { margin-top: auto; color: var(--btn-bg-danger); }
.lens-settings__logout:hover { background: color-mix(in srgb, var(--btn-bg-danger) 8%, transparent); }
.lens-settings__main { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
.lens-settings__desktop-header button, .lens-settings__mobile-header button { display: grid; width: 44px; height: 44px; place-items: center; border: 0; border-radius: var(--radius-control); color: var(--text-sub); }
.lens-settings__desktop-header button:hover, .lens-settings__mobile-header button:hover { background: var(--academic-surface); }
.lens-settings__content { min-height: 0; flex: 1; overflow: auto; padding: 12px 28px 28px; }
.lens-settings__section-heading { margin: 0 0 24px; color: var(--text-main); font-size: 18px; font-weight: 600; }
.lens-settings__mobile-header { display: none; }
.lens-settings button:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
.lens-settings-enter-active, .lens-settings-leave-active { transition: opacity 160ms ease; }
.lens-settings-enter-from, .lens-settings-leave-to { opacity: 0; }
@media (max-width: 720px) {
  .lens-settings { padding: 0; }
  .lens-settings__shell { width: 100%; height: 100%; grid-template-rows: calc(56px + env(safe-area-inset-top)) auto minmax(0, 1fr); grid-template-columns: 1fr; border-radius: 0; }
  .lens-settings__mobile-header { display: flex; align-items: center; justify-content: space-between; padding: env(safe-area-inset-top) 16px 0; }
  .lens-settings__mobile-header strong { color: var(--text-main); font-size: 17px; font-weight: 600; }
  .lens-settings__desktop-header { display: none; }
  .lens-settings__nav { grid-row: 2; flex-direction: row; align-items: center; gap: 4px; padding: 4px 12px 12px; overflow-x: auto; }
  .lens-settings__nav nav { display: flex; flex: none; gap: 4px; }
  .lens-settings__nav nav button { flex: none; padding: 0 10px; font-size: 12px; white-space: nowrap; }
  .lens-settings__nav nav svg { display: none; }
  .lens-settings__logout { flex: none; margin-top: 0; font-size: 12px; white-space: nowrap; }
  .lens-settings__logout svg { display: none; }
  .lens-settings__main { grid-row: 3; }
  .lens-settings__section-heading { display: none; }
  .lens-settings__content { padding: 12px 20px max(24px, env(safe-area-inset-bottom)); }
}
</style>
