import { ss } from '@/utils/storage'

function detectEnvironment() {
  const globalObj = globalThis as typeof globalThis & {
    process?: { type?: string }
    wx?: unknown
  }

  if (globalObj.process?.type === 'renderer') return 'electron'
  if (typeof globalObj.wx !== 'undefined') return 'wechat'
  if (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches) {
    return 'web'
  }
  if (/(Android|webOS|iPhone|iPad|iPod|BlackBerry|Windows Phone)/i.test(navigator.userAgent))
    return 'mobile'
  return 'web'
}

const LOCAL_NAME = 'appSetting'

export type Theme = 'light' | 'dark' | 'auto'

export type Language = 'zh-CN' | 'zh-TW' | 'en-US' | 'ja-JP' | 'ko-KR'

export type Env = 'electron' | 'wechat' | 'web' | 'mobile'

export interface AppState {
  siderCollapsed: boolean
  theme: Theme
  language: Language
  env: Env
}

export function normalizeLanguage(raw?: string | null): Language {
  const value = String(raw || '').trim().toLowerCase()

  if (!value) return 'zh-CN'
  if (
    value.startsWith('zh-tw') ||
    value.startsWith('zh-hk') ||
    value.startsWith('zh-mo') ||
    value.includes('hant')
  ) {
    return 'zh-TW'
  }
  if (value.startsWith('zh')) return 'zh-CN'
  if (value.startsWith('en')) return 'en-US'
  if (value.startsWith('ja')) return 'ja-JP'
  if (value.startsWith('ko')) return 'ko-KR'
  return 'zh-CN'
}

export function resolvePreferredLanguage(): Language {
  if (typeof window === 'undefined') return 'zh-CN'

  const saved = localStorage.getItem('appLanguage')
  if (saved) return normalizeLanguage(saved)

  const browserLanguages = navigator.languages?.length
    ? navigator.languages
    : [navigator.language, (navigator as any).userLanguage].filter(Boolean)

  return normalizeLanguage(browserLanguages[0] || 'zh-CN')
}

export function defaultSetting(): AppState {
  return {
    siderCollapsed: false,
    theme: 'light',
    language: resolvePreferredLanguage(),
    env: detectEnvironment(),
  }
}

export function getLocalSetting(): AppState {
  const localSetting: AppState | undefined = ss.get(LOCAL_NAME)
  return { ...defaultSetting(), ...localSetting }
}

export function setLocalSetting(setting: AppState): void {
  ss.set(LOCAL_NAME, setting)
}
