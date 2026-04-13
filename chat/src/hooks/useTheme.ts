import { useAppStoreWithOut } from '@/store'
import type { Theme } from '@/store/modules/app/helper'

const MEDIA_QUERY = '(prefers-color-scheme: dark)'

function getResolvedTheme(theme: Theme): 'light' | 'dark' {
  if (theme === 'auto') {
    return window.matchMedia(MEDIA_QUERY).matches ? 'dark' : 'light'
  }
  return theme === 'dark' ? 'dark' : 'light'
}

function applyTheme(theme: Theme) {
  const html = document.documentElement
  const resolvedTheme = getResolvedTheme(theme)
  html.dataset.theme = resolvedTheme
  html.classList.toggle('dark', resolvedTheme === 'dark')
  html.style.colorScheme = resolvedTheme
  localStorage.setItem('theme', theme)
  window.theme = resolvedTheme
}

export function useTheme() {
  const appStore = useAppStoreWithOut()

  const init = () => {
    applyTheme(appStore.theme)
  }

  const toggle = () => {
    const nextTheme: Theme = appStore.theme === 'dark' ? 'light' : 'dark'
    appStore.setTheme(nextTheme)
  }

  return { init, toggle, applyTheme }
}
