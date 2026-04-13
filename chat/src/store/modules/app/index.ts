import { store } from '@/store/pinia'
import { defineStore } from 'pinia'
import type { AppState, Language, Theme } from './helper'
import { getLocalSetting, setLocalSetting } from './helper'

export const useAppStore = defineStore('app-store', {
  state: (): AppState => getLocalSetting(),
  actions: {
    setSiderCollapsed(collapsed: boolean) {
      this.siderCollapsed = collapsed
      this.recordState()
    },

    setTheme(theme: Theme) {
      const normalizedTheme: Theme = theme === 'dark' || theme === 'auto' ? theme : 'light'
      const resolvedTheme =
        normalizedTheme === 'auto'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light'
          : normalizedTheme
      localStorage.theme = normalizedTheme
      this.theme = normalizedTheme
      window.theme = resolvedTheme
      this.recordState()
      document.documentElement.dataset.theme = resolvedTheme
      document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
      document.documentElement.style.colorScheme = resolvedTheme
    },

    setLanguage(language: Language) {
      if (this.language !== language) {
        this.language = language
        this.recordState()
      }
    },

    recordState() {
      setLocalSetting(this.$state)
    },

    setEnv() {
      const isWeChat = /micromessenger/i.test(navigator.userAgent)

      const isElectron = navigator.userAgent.includes('Electron')

      const isMobile = /(iPhone|iPad|iPod|Android|webOS|BlackBerry|Windows Phone)/i.test(
        navigator.userAgent
      )

      const isWeb = !isWeChat && !isElectron

      if (isWeChat) this.env = 'wechat'
      else if (isElectron) this.env = 'electron'
      else if (isMobile) this.env = 'mobile'
      else if (isWeb) this.env = 'web'
    },
  },
})

export function useAppStoreWithOut() {
  return useAppStore(store)
}
