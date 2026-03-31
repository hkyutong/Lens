import { useTheme } from '@/hooks/useTheme'
import { useAuthStoreWithout } from '@/store/modules/auth'
import { materialSymbolsIconCollection, riIconCollection } from '@/constants/iconCollections'
import '@/styles/github-markdown.less'
import '@/styles/global.less'
// import '@/styles/highlight.less' // 移除旧的highlight样式
import '@/styles/index.css'
import { printLensInfo, printAppInfo } from '@/utils/logger'
import { message } from '@/utils/message'
import router from '@/utils/router'
import { addCollection } from '@iconify/vue'
import 'katex/dist/katex.min.css'
import { createApp } from 'vue'
import VueViewer from 'v-viewer'
import { MotionPlugin } from '@vueuse/motion'
import App from './App.vue'
import { setupI18n } from './locales'
import { setupImageViewer } from './plugins/imageViewer'
import { setupStore } from './store'

// 可选禁用控制台输出（生产排查时建议关闭此开关）
const disableConsole = import.meta.env.VITE_DISABLE_CONSOLE === '1'
const enableDebugErrorBanner = import.meta.env.DEV || import.meta.env.MODE === 'test'
if (disableConsole) {
  console.log = () => {}
  console.warn = () => {}
  console.error = () => {}
}

function detectSystemTheme() {
  const theme = 'light'
  localStorage.setItem('theme', theme)
  document.documentElement.classList.remove('dark')
  document.documentElement.style.colorScheme = theme
  document.documentElement.dataset.theme = theme
  window.theme = theme
}

const authStore = useAuthStoreWithout()

async function bootstrap() {
  // 预注册运行期会用到的图标集，避免生产环境回源请求 icon API。
  addCollection(riIconCollection as any)
  addCollection(materialSymbolsIconCollection as any)

  const app = createApp(App)

  // 设置样式和资源
  setupStore(app)
  setupI18n(app)
  setupImageViewer(app)

  // 安装Vue Router
  app.use(router)

  // 检测系统主题并设置应用主题
  detectSystemTheme()

  // 初始化主题
  const { init } = useTheme()
  init()

  // 初始化消息组件
  const msgInstance = message()

  // 在开发环境下打印控制台信息
  printLensInfo()
  printAppInfo('Lens', '5.0.1')

  authStore.getGlobalConfig().catch(() => {})

  // 安装插件
  app.use(VueViewer)
  app.use(MotionPlugin)

  app.config.errorHandler = err => {
    if (!enableDebugErrorBanner) {
      console.error('[app error]', err)
      return
    }
    try {
      const el = document.getElementById('app-error-banner') || document.createElement('div')
      if (!el.id) {
        el.id = 'app-error-banner'
        el.style.position = 'fixed'
        el.style.bottom = '12px'
        el.style.left = '12px'
        el.style.right = '12px'
        el.style.zIndex = '999999'
        el.style.background = '#fee2e2'
        el.style.color = '#991b1b'
        el.style.padding = '10px 12px'
        el.style.borderRadius = '8px'
        el.style.fontSize = '12px'
        el.style.fontFamily = 'monospace'
        document.body.appendChild(el)
      }
      el.textContent = String(err)
    } catch (_e) {}
  }

  // 在卸载应用前清理资源
  app.config.globalProperties.$onAppUnmount = () => {
    if (msgInstance && typeof msgInstance.destroy === 'function') {
      msgInstance.destroy()
    }
  }

  app.mount('#app')
  document.documentElement.setAttribute('data-app-mounted', '1')
}

bootstrap()
