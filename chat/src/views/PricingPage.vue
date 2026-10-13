<script setup lang="ts">
import { useRouter } from 'vue-router'
import { t } from '@/locales'
import { useAuthStore } from '@/store'
import MemberCenter from '@/components/Settings/MemberCenter.vue'
import LanguageSelector from '@/views/workbench/components/LanguageSelector.vue'
import ThemeToggle from '@/views/workbench/components/ThemeToggle.vue'
import logoUrl from '@/assets/yutogpt-logo.svg'
import { computed, defineAsyncComponent } from 'vue'

const router = useRouter()
const authStore = useAuthStore()
const Login = defineAsyncComponent(() => import('@/components/Login/Login.vue'))
const loginDialog = computed(() => authStore.loginDialog)

function backToWorkspace() {
  void router.push('/')
}

function openLogin() {
  authStore.setLoginDialog(true)
}
</script>

<template>
  <div class="lens-pricing-page">
    <header class="lens-pricing-page__header">
      <button
        type="button"
        class="lens-pricing-page__brand"
        :aria-label="t('lens.share.backToWorkspace')"
        @click="backToWorkspace"
      >
        <img :src="logoUrl" alt="" aria-hidden="true" />
        <span>Lens</span>
      </button>

      <nav class="lens-pricing-page__actions" :aria-label="t('lens.settings.setting')">
        <ThemeToggle />
        <LanguageSelector position="bottom-right" />
        <button
          v-if="!authStore.isLogin"
          type="button"
          class="lens-pricing-page__login"
          @click="openLogin"
        >
          {{ t('lens.sidebar.login') }}
        </button>
        <button type="button" class="lens-pricing-page__back" @click="backToWorkspace">
          {{ t('lens.share.backToWorkspace') }}
        </button>
      </nav>
    </header>

    <main class="lens-pricing-page__main">
      <section class="lens-pricing-page__intro" aria-labelledby="lens-pricing-title">
        <h1 id="lens-pricing-title">{{ t('lens.settings.upgradePlan') }}</h1>
        <p>{{ t('lens.member.planSubtitle') }}</p>
      </section>

      <MemberCenter :visible="true" mode="pricing" />
    </main>

    <Login :visible="loginDialog" />
  </div>
</template>

<style scoped>
.lens-pricing-page {
  height: 100%;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  background: var(--bg-body);
  color: var(--text-main);
}

.lens-pricing-page__header {
  position: sticky;
  z-index: 20;
  top: 0;
  display: flex;
  min-height: 68px;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 clamp(18px, 4vw, 56px);
  border-bottom: 1px solid color-mix(in srgb, var(--paper-border) 72%, transparent);
  background: color-mix(in srgb, var(--bg-body) 92%, transparent);
  backdrop-filter: blur(18px);
}

.lens-pricing-page__brand,
.lens-pricing-page__back,
.lens-pricing-page__login {
  display: inline-flex;
  min-height: 44px;
  align-items: center;
  border: 0;
  background: transparent;
  color: var(--text-main);
  font: inherit;
}

.lens-pricing-page__brand {
  gap: 10px;
  font-size: 17px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.lens-pricing-page__brand img {
  width: 22px;
  height: 22px;
  object-fit: contain;
  filter: var(--brand-logo-filter, none);
}

.lens-pricing-page__actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.lens-pricing-page__back,
.lens-pricing-page__login {
  padding: 0 15px;
  border: 1px solid var(--paper-border);
  border-radius: var(--radius-button);
  font-size: 13px;
  font-weight: 550;
}

.lens-pricing-page__brand:focus-visible,
.lens-pricing-page__back:focus-visible,
.lens-pricing-page__login:focus-visible {
  outline: 2px solid var(--academic-accent);
  outline-offset: 3px;
}

.lens-pricing-page__back:hover {
  background: var(--btn-bg-ghost-hover);
}

.lens-pricing-page__login {
  border-color: var(--academic-blue);
  background: var(--academic-blue);
  color: var(--btn-text-primary);
}

.lens-pricing-page__main {
  width: min(1180px, calc(100% - 40px));
  margin: 0 auto;
  padding: clamp(36px, 6vw, 76px) 0 72px;
}

.lens-pricing-page__intro {
  max-width: 620px;
  margin: 0 auto 34px;
  text-align: center;
}

.lens-pricing-page__intro h1 {
  margin: 0;
  color: var(--text-main);
  font-size: clamp(30px, 4vw, 44px);
  font-weight: 700;
  letter-spacing: -0.035em;
  line-height: 1.1;
}

.lens-pricing-page__intro p:last-child {
  margin: 14px auto 0;
  color: var(--text-sub);
  font-size: 15px;
  line-height: 1.6;
}

.lens-pricing-page :deep(.research-member) {
  width: 100%;
}

.lens-pricing-page :deep(.research-payment) {
  width: min(100%, 720px);
  margin-inline: auto;
}

@media (max-width: 640px) {
  .lens-pricing-page__header {
    min-height: 60px;
    padding-inline: 14px;
  }

  .lens-pricing-page__back {
    padding-inline: 11px;
  }

  .lens-pricing-page__login {
    display: none;
  }

  .lens-pricing-page__main {
    width: min(100% - 24px, 560px);
    padding-top: 36px;
  }

  .lens-pricing-page__intro {
    margin-bottom: 26px;
  }

}
</style>
