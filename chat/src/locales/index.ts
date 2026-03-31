import type { Language } from '@/store/modules/app/helper'
import { normalizeLanguage, resolvePreferredLanguage } from '@/store/modules/app/helper'
import type { App } from 'vue'
import { createI18n } from 'vue-i18n'
import enUS from './en-US.json'
import jaJP from './ja-JP.json'
import koKR from './ko-KR.json'
import zhCN from './zh-CN.json'
import zhTW from './zh-TW.json'

const defaultLocale = resolvePreferredLanguage()

const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: defaultLocale,
  fallbackLocale: 'zh-CN',
  allowComposition: true,
  messages: {
    'en-US': enUS,
    'zh-CN': zhCN,
    'zh-TW': zhTW,
    'ja-JP': jaJP,
    'ko-KR': koKR,
  },
})

// 导出t函数以便在组件外部使用
export function t(key: string, params?: Record<string, unknown>) {
  return i18n.global.t(key, params || {})
}

export function setLocale(locale: Language) {
  const normalized = normalizeLanguage(locale)
  i18n.global.locale.value = normalized
  localStorage.setItem('appLanguage', normalized)
  document.documentElement.lang = normalized
}

// 使用加密和指定过期时间（或永久保存）保存语言设置
// export function setLocale(locale: Language) {
//   console.log(`正在切换语言至: ${locale}`);
//   i18n.global.locale = locale;
//   // 使用自定义 localStorage 工具保存语言设置
//   ls.set('appLanguage', locale);
//   console.log(`当前语言已切换至: ${i18n.global.locale}`);
// }

export function setupI18n(app: App) {
  document.documentElement.lang = defaultLocale
  app.use(i18n)
}

export default i18n
