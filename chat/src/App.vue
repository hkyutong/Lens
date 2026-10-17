<script setup lang="ts">
import { initWechatLogin } from '@/services/wechatLogin' // 导入微信登录相关功能
import { getShare } from '@/api/share'
import { t } from '@/locales'
import { parseShareCode } from '@/domain/research/share'
import { useAuthStore, useGlobalStoreWithOut } from '@/store'
import { DIALOG_TABS } from '@/store/modules/global'
import { ClientJS } from 'clientjs'
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { ss } from './utils/storage'

const Watermark = defineAsyncComponent(() => import('@/components/common/Watermark/index.vue'))
const HtmlDialog = defineAsyncComponent(() => import('@/components/HtmlDialog.vue'))
const SharedHtmlView = defineAsyncComponent(() => import('@/components/SharedHtmlView.vue'))

const client = new ClientJS()
const authStore = useAuthStore()
const useGlobalStore = useGlobalStoreWithOut()
const sharedHtml = ref('')
const shareCode = ref('')
const shareRequested = ref(false)
const shareLoading = ref(false)
const shareError = ref('')
try {
  const rawShareCode = new URL(window.location.href).searchParams.get('shareCode')
  if (rawShareCode !== null) {
    shareRequested.value = true
    const normalizedShareCode = parseShareCode(rawShareCode)
    if (normalizedShareCode) {
      shareCode.value = normalizedShareCode
    } else {
      shareError.value = t('lens.share.invalidLink')
    }
  }
} catch (error) {
  shareRequested.value = true
  shareError.value = t('lens.share.invalidLink')
}

const isShareView = computed(() => shareRequested.value)

async function loadSharedHtml() {
  if (!shareCode.value) return
  shareLoading.value = true
  shareError.value = ''
  try {
    const response = await getShare(shareCode.value)
    const htmlContent = response?.data?.htmlContent
    if (typeof htmlContent !== 'string' || !htmlContent.trim()) {
      throw new Error('empty-share')
    }
    sharedHtml.value = htmlContent
  } catch (error) {
    shareError.value = t('lens.share.loadFailed')
  } finally {
    shareLoading.value = false
  }
}

// 获取客户端指纹
useGlobalStore.updateFingerprint(client.getFingerprint())

// 获取配置
const defaultFavicon = '/logo.svg'
const faviconPath = computed(() => authStore.globalConfig?.clientFaviconPath || defaultFavicon)
const isAutoOpenNotice = computed(() => Number(authStore.globalConfig?.isAutoOpenNotice) === 1)
const wechatSilentLoginStatus = computed(
  () => Number(authStore.globalConfig?.wechatSilentLoginStatus) === 1
)
const showWatermark = computed(() => Number(authStore.globalConfig?.showWatermark) === 1)
const siteUrl = computed(() => authStore.globalConfig?.siteUrl || '')
const productName = 'Lens 学术GPT'
const publisherName = 'YutoAI'
const brandSeoTitle = productName
const siteDescription =
  'Lens 学术GPT 是 YutoAI 旗下的 AI 学术工作台，支持论文阅读、研究方案、文献整理、LaTeX 翻译和学术写作辅助。AI 结果需人工核验。'
const siteKeywords =
  'Lens 学术GPT, Lens Academic GPT, 学术AI, 论文阅读, 研究方案, 文献整理, LaTeX翻译, 学术写作, YutoAI'

function toAbsoluteUrl(url: string) {
  const normalized = String(url || '').trim()
  if (!normalized) return ''
  try {
    return new URL(normalized, window.location.origin).toString()
  } catch (error) {
    return ''
  }
}

function setOrCreateMeta(selector: string, attrs: Record<string, string>, content: string) {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    Object.entries(attrs).forEach(([key, value]) => el?.setAttribute(key, value))
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

function setOrCreateLink(selector: string, attrs: Record<string, string>, href: string) {
  let el = document.head.querySelector(selector) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    Object.entries(attrs).forEach(([key, value]) => el?.setAttribute(key, value))
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

function updateStructuredData(description: string, canonicalUrl: string, imageUrl: string) {
  const structuredData = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: productName,
      alternateName: ['Lens Academic GPT', 'Lens'],
      url: canonicalUrl,
      description,
      inLanguage: 'zh-CN',
    },
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: productName,
      publisher: {
        '@type': 'Organization',
        name: publisherName,
      },
      applicationCategory: 'ResearchApplication',
      operatingSystem: 'Web',
      url: canonicalUrl,
      image: imageUrl || undefined,
      description,
      featureList: [
        '论文速读与 PDF 深度理解',
        'Arxiv 摘要与学术翻译',
        'LaTeX 摘要、润色与纠错',
        '中英文论文润色',
        '参考文献转 BibTeX',
        '研究会话与文件工作流',
      ],
    },
  ]

  const script = document.getElementById('app-ld-json') as HTMLScriptElement | null
  if (script) {
    script.textContent = JSON.stringify(structuredData)
  }
}


async function loadBaiduCode() {
  const baiduCode = authStore.globalConfig?.baiduCode
  if (!baiduCode) return
  const scriptElem = document.createElement('script')
  scriptElem.innerHTML = baiduCode.replace(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi, '$1')
  document.head.appendChild(scriptElem)
}

function setDocumentTitle() {
  document.title = brandSeoTitle
}

function syncDocumentSeo() {
  const description = siteDescription
  const baseUrl = toAbsoluteUrl(siteUrl.value) || window.location.origin
  const canonicalUrl = (() => {
    try {
      return new URL(window.location.pathname || '/', baseUrl).toString()
    } catch (error) {
      return window.location.href
    }
  })()
  const imageUrl = toAbsoluteUrl(faviconPath.value || '/favicon.svg')

  setDocumentTitle()
  setOrCreateMeta('meta[name="description"]', { name: 'description' }, description)
  setOrCreateMeta('meta[name="keywords"]', { name: 'keywords' }, siteKeywords)
  setOrCreateMeta(
    'meta[name="robots"]',
    { name: 'robots' },
    'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
  )
  setOrCreateMeta(
    'meta[name="googlebot"]',
    { name: 'googlebot' },
    'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1'
  )
  setOrCreateMeta('meta[property="og:type"]', { property: 'og:type' }, 'website')
  setOrCreateMeta('meta[property="og:locale"]', { property: 'og:locale' }, 'zh_CN')
  setOrCreateMeta('meta[property="og:site_name"]', { property: 'og:site_name' }, productName)
  setOrCreateMeta('meta[property="og:title"]', { property: 'og:title' }, brandSeoTitle)
  setOrCreateMeta('meta[property="og:description"]', { property: 'og:description' }, description)
  setOrCreateMeta('meta[property="og:url"]', { property: 'og:url' }, canonicalUrl)
  setOrCreateMeta('meta[property="og:image"]', { property: 'og:image' }, imageUrl)
  setOrCreateMeta('meta[name="twitter:card"]', { name: 'twitter:card' }, 'summary_large_image')
  setOrCreateMeta('meta[name="twitter:title"]', { name: 'twitter:title' }, brandSeoTitle)
  setOrCreateMeta('meta[name="twitter:description"]', { name: 'twitter:description' }, description)
  setOrCreateMeta('meta[name="twitter:image"]', { name: 'twitter:image' }, imageUrl)
  setOrCreateMeta('meta[name="application-name"]', { name: 'application-name' }, productName)
  setOrCreateLink('link[rel="canonical"]', { rel: 'canonical' }, canonicalUrl)
  updateStructuredData(description, canonicalUrl, imageUrl)
}

watch(
  () => [
    authStore.globalConfig?.siteUrl,
    authStore.globalConfig?.clientLogoPath,
    authStore.globalConfig?.clientFaviconPath,
  ],
  () => syncDocumentSeo(),
  { immediate: true }
)

function noticeInit() {
  const showNotice = ss.get('showNotice')
  if ((!showNotice || Date.now() > Number(showNotice)) && isAutoOpenNotice.value) {
    useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.NOTICE)
  }
}

/**
 * 检测当前浏览器是否是微信内置浏览器
 * 区分微信和企业微信，只有微信浏览器返回true
 * @returns {boolean} 如果是微信浏览器返回 true，否则返回 false
 */
function isWechatBrowser(): boolean {
  const ua = navigator.userAgent.toLowerCase()

  // 检查是否是企业微信
  const isWXWork = ua.indexOf('wxwork') !== -1

  // 检查是否是微信，排除企业微信的情况
  const isWeixin = !isWXWork && ua.indexOf('micromessenger') !== -1

  return isWeixin
}

onMounted(async () => {
  // 设置网站标题
  syncDocumentSeo()

  // 分享链接只进入独立只读视图，不初始化登录、缓存清理或聊天壳。
  if (isShareView.value) {
    await loadSharedHtml()
    return
  }

  // 加载百度统计代码（如果有）
  loadBaiduCode()

  // 如果开启微信静默登录，并且是微信浏览器，执行微信登录逻辑
  if (wechatSilentLoginStatus.value && isWechatBrowser()) {
    await initWechatLogin() // 初始化微信登录
  }

  /* 动态设置网站ico svg格式 */
  const link = document.createElement('link')
  link.rel = 'icon'
  link.href = faviconPath.value
  link.type = faviconPath.value.endsWith('.svg') ? 'image/svg+xml' : 'image/png'

  // 移除已存在的favicon链接，防止冲突
  const existingFavicons = document.querySelectorAll('link[rel="shortcut icon"], link[rel="icon"]')
  existingFavicons.forEach(node => node.parentNode?.removeChild(node))

  // 添加新的favicon链接
  document.head.appendChild(link)
  // 初始化通知提示
  await noticeInit()
})
</script>

<template>
  <!-- 水印组件（如果启用） -->
  <Watermark v-if="showWatermark && !isShareView"></Watermark>

  <!-- 分享链接使用独立的只读展示，不挂载聊天页面 -->
  <SharedHtmlView
    v-if="isShareView"
    :html="sharedHtml"
    :loading="shareLoading"
    :error="shareError"
  />

  <!-- 主要内容使用router-view -->
  <router-view v-else />

  <!-- 共享内容对话框 -->
  <HtmlDialog v-if="!isShareView" :visible="useGlobalStore.htmlDialog" :html="sharedHtml" />

  <!-- 全局图片预览器 -->
  <GlobalImageViewer v-if="!isShareView" />
</template>
