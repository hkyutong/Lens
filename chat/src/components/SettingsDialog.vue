<script setup lang="ts">
import SvgIcon from '@/components/common/SvgIcon/index.vue'
import { t } from '@/locales'
import { useAuthStore, useGlobalStoreWithOut } from '@/store'
import { dialog } from '@/utils/dialog'
import { computed, defineAsyncComponent, markRaw, watch } from 'vue'

const AccountManagement = defineAsyncComponent(() => import('./Settings/AccountManagement.vue'))
const MemberCenter = defineAsyncComponent(() => import('./Settings/MemberCenter.vue'))
const NoticeDialog = defineAsyncComponent(() => import('./Settings/NoticeDialog.vue'))
const UserAgreement = defineAsyncComponent(() => import('./Settings/UserAgreement.vue'))

const props = defineProps<{ visible: boolean }>()
const authStore = useAuthStore()
const globalStore = useGlobalStoreWithOut()

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

function requestLogout() {
  dialog().warning({
    title: t('lens.settings.logoutTitle'),
    content: t('lens.settings.logoutConfirm'),
    positiveText: t('lens.settings.confirm'),
    negativeText: t('lens.settings.cancel'),
    onPositiveClick: () => {
      authStore.logOut()
      close()
    },
  })
}
</script>

<template>
  <Transition name="lens-settings">
    <div v-if="props.visible" class="lens-settings" role="dialog" aria-modal="true">
      <button
        type="button"
        class="lens-settings__backdrop"
        :aria-label="t('lens.header.close')"
        @click="close"
      />

      <section class="lens-settings__shell">
        <header class="lens-settings__mobile-header">
          <div>
            <span>Lens</span>
            <strong>{{ activeItem?.name || t('lens.settings.setting') }}</strong>
          </div>
          <button type="button" :aria-label="t('lens.header.close')" @click="close">
            <SvgIcon icon="ri:close-line" />
          </button>
        </header>

        <aside class="lens-settings__nav">
          <div class="lens-settings__brand">
            <span>Lens</span>
            <small>by YutoAI</small>
            <p>{{ t('lens.header.researchWorkspace') }}</p>
          </div>

          <nav :aria-label="t('lens.settings.setting')">
            <button
              v-for="(item, index) in tabs"
              :key="item.id"
              type="button"
              :class="{ active: activeTab === index }"
              :aria-current="activeTab === index ? 'page' : undefined"
              @click="activeTab = index"
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
          <header class="lens-settings__desktop-header">
            <div>
              <span>{{ t('lens.settings.setting') }}</span>
              <h2>{{ activeItem?.name }}</h2>
            </div>
            <button type="button" :aria-label="t('lens.header.close')" @click="close">
              <SvgIcon icon="ri:close-line" />
            </button>
          </header>

          <div class="lens-settings__content custom-scrollbar">
            <component
              :is="activeItem?.component"
              v-if="activeItem?.component"
              :visible="props.visible"
            />
          </div>
        </main>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.lens-settings {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: grid;
  place-items: center;
  padding: 28px;
}

.lens-settings__backdrop {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border: 0;
  background: color-mix(in srgb, var(--text-main) 28%, transparent);
  backdrop-filter: blur(8px);
}

.lens-settings__shell {
  position: relative;
  display: grid;
  width: min(1080px, 100%);
  height: min(760px, calc(100vh - 56px));
  grid-template-columns: 230px minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--paper-border);
  border-radius: 18px;
  background: var(--paper-surface);
  box-shadow: 0 24px 80px rgba(20, 31, 50, 0.22);
}

.lens-settings__nav {
  display: flex;
  min-height: 0;
  flex-direction: column;
  padding: 26px 18px 18px;
  border-right: 1px solid var(--paper-border);
  background: var(--surface-muted);
}

.lens-settings__brand > span {
  color: var(--text-main);
  font-size: 20px;
  font-weight: 760;
  letter-spacing: -0.04em;
}

.lens-settings__brand > small {
  margin-left: 7px;
  color: var(--ink-faint);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.lens-settings__brand > p {
  margin: 5px 0 24px;
  color: var(--ink-faint);
  font-size: 10px;
}

.lens-settings__nav nav {
  display: grid;
  gap: 5px;
}

.lens-settings__nav nav button,
.lens-settings__logout {
  display: flex;
  min-height: 42px;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border: 1px solid transparent;
  border-radius: 9px;
  color: var(--text-sub);
  font-size: 12px;
  font-weight: 620;
  text-align: left;
  transition: 150ms ease;
}

.lens-settings__nav nav button:hover,
.lens-settings__nav nav button.active {
  border-color: var(--academic-border);
  background: var(--paper-surface);
  color: var(--academic-blue);
}

.lens-settings__nav svg,
.lens-settings__logout svg {
  width: 17px;
  height: 17px;
  flex: none;
}

.lens-settings__logout {
  margin-top: auto;
  color: #b43f45;
}

.lens-settings__logout:hover {
  background: color-mix(in srgb, #b43f45 8%, transparent);
}

.lens-settings__main {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
}

.lens-settings__desktop-header {
  display: flex;
  min-height: 88px;
  align-items: center;
  justify-content: space-between;
  padding: 20px 28px;
  border-bottom: 1px solid var(--paper-border);
}

.lens-settings__desktop-header span {
  color: var(--ink-faint);
  font-size: 10px;
  font-weight: 650;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lens-settings__desktop-header h2 {
  margin: 3px 0 0;
  color: var(--text-main);
  font-size: 20px;
  font-weight: 720;
}

.lens-settings__desktop-header button,
.lens-settings__mobile-header button {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border: 1px solid var(--paper-border);
  border-radius: 9px;
  color: var(--text-sub);
}

.lens-settings__content {
  min-height: 0;
  flex: 1;
  overflow: auto;
  padding: 22px 26px 30px;
}

.lens-settings__mobile-header {
  display: none;
}

.lens-settings-enter-active,
.lens-settings-leave-active {
  transition: opacity 160ms ease;
}

.lens-settings-enter-from,
.lens-settings-leave-to {
  opacity: 0;
}

@media (max-width: 720px) {
  .lens-settings {
    padding: 0;
  }

  .lens-settings__shell {
    width: 100%;
    height: 100%;
    grid-template-rows: 60px minmax(0, 1fr) 64px;
    grid-template-columns: 1fr;
    border: 0;
    border-radius: 0;
  }

  .lens-settings__mobile-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    border-bottom: 1px solid var(--paper-border);
  }

  .lens-settings__mobile-header > div {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }

  .lens-settings__mobile-header span {
    color: var(--academic-blue);
    font-size: 15px;
    font-weight: 760;
  }

  .lens-settings__mobile-header strong {
    color: var(--text-main);
    font-size: 13px;
  }

  .lens-settings__main {
    grid-row: 2;
  }

  .lens-settings__desktop-header {
    display: none;
  }

  .lens-settings__content {
    padding: 14px 12px 24px;
  }

  .lens-settings__nav {
    grid-row: 3;
    padding: 7px 8px max(7px, env(safe-area-inset-bottom));
    border-top: 1px solid var(--paper-border);
    border-right: 0;
    background: var(--paper-surface);
  }

  .lens-settings__brand,
  .lens-settings__logout {
    display: none;
  }

  .lens-settings__nav nav {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 3px;
  }

  .lens-settings__nav nav button {
    min-height: 48px;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    padding: 3px;
    border: 0;
    font-size: 9px;
    text-align: center;
  }

  .lens-settings__nav nav button:hover,
  .lens-settings__nav nav button.active {
    background: var(--academic-blue-soft);
  }
}
</style>
