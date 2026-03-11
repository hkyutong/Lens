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

export type Language = 'zh-CN' | 'zh-TW' | 'en-US'

export type Env = 'electron' | 'wechat' | 'web' | 'mobile'

export interface AppState {
  siderCollapsed: boolean
  theme: Theme
  language: Language
  env: Env
}

export function defaultSetting(): AppState {
  return {
    siderCollapsed: false,
    theme: 'light',
    language: 'zh-CN',
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
