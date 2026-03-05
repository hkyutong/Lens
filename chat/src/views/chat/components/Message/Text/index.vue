<script lang="ts" setup>
import { fetchTtsAPIProcess } from '@/api'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import { copyText } from '@/utils/format'
import { message } from '@/utils/message'
import {
  ArrowRight,
  Close,
  Copy,
  Delete,
  Down,
  Edit,
  LoadingOne,
  PauseOne,
  Refresh,
  Rotation,
  Send,
  Sound,
  Sphere,
  TwoEllipses,
  Up,
  VoiceMessage,
} from '@icon-park/vue-next'
import mdKatex from '@traptitech/markdown-it-katex'
import hljs from 'highlight.js'
import 'highlight.js/styles/atom-one-dark.css' // 更现代的深色主题
import 'highlight.js/styles/atom-one-light.css' // 更现代的浅色主题
import MarkdownIt from 'markdown-it'
import mila from 'markdown-it-link-attributes'
import mermaid from 'mermaid'
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

// 注册样式覆盖，确保主题切换时正确应用对应样式
const injectThemeStyles = () => {
  // 检查是否已存在样式元素
  const existingStyle = document.getElementById('highlight-theme-overrides')
  if (existingStyle) return

  // 创建新的样式元素
  const style = document.createElement('style')
  style.id = 'highlight-theme-overrides'
  style.textContent = `
    /* 浅色模式覆盖 */
    html:not(.dark) .hljs {
      background: transparent !important;
      color: #383a42 !important;
    }
    
    /* 深色模式覆盖 */
    html.dark .hljs {
      background: transparent !important;
      color: #abb2bf !important;
    }
    
    /* 容器背景 */
    html:not(.dark) .code-block-wrapper {
      background-color: #fafafa;
    }
    
    html.dark .code-block-wrapper {
      background-color: #2f2f2f;
    }
  `
  document.head.appendChild(style)
}

interface Props {
  chatId?: number
  index: number
  isUserMessage?: boolean
  content?: string
  modelType?: number
  status?: number
  loading?: boolean
  imageUrl?: string
  fileUrl?: string
  ttsUrl?: string
  model?: string
  promptReference?: string
  networkSearchResult?: string
  fileVectorResult?: string
  tool_calls?: string
  isLast?: boolean
  usingNetwork?: boolean
  usingDeepThinking?: boolean
  usingMcpTool?: boolean
  reasoningText?: string
  fileAnalysisProgress?: number
  useFileSearch?: boolean
}

interface Emit {
  (ev: 'regenerate'): void
  (ev: 'delete'): void
  (ev: 'copy'): void
}

interface TtsResponse {
  ttsUrl: string
}

interface AcademicDownloadFile {
  path: string
  name: string
}
interface UserUploadedFile {
  url: string
  name: string
}

const authStore = useAuthStore()
const chatStore = useChatStore()
const { isMobile } = useBasicLayout()
const onConversation = inject<any>('onConversation')
const handleRegenerate = inject<any>('handleRegenerate')
const globalStore = useGlobalStoreWithOut()

const props = defineProps<Props>()
const emit = defineEmits<Emit>()

const showSearchResult = ref(false)
const textRef = ref<HTMLElement>()
const localTtsUrl = ref(props.ttsUrl)
const playbackState = ref('paused')
const browserTtsState = ref('paused')
const editableContent = ref(props.content)
const isEditable = ref(false)
const textarea = ref<HTMLTextAreaElement | null>(null)

let currentAudio: HTMLAudioElement | null = null
let speechSynthesisUtterance: SpeechSynthesisUtterance | null = null
let mermaidTimer: ReturnType<typeof setTimeout> | null = null
let mermaidTheme = ''

const cleanupLeakedMermaidArtifacts = () => {
  // mermaid 在语法异常时可能把临时渲染节点遗留在 body，造成“炸弹”错误图常驻页面
  document.querySelectorAll('body > div[id^="dmermaid-"], body > iframe[id^="imermaid-"]').forEach(
    node => node.remove()
  )
}

const getMermaidDownloadBaseName = () => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `Lens-mindmap-${stamp}`
}

const triggerBlobDownload = (blob: Blob, fileName: string) => {
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = sanitizeDownloadName(fileName)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(objectUrl)
}

const parseNumericSize = (value: string | null | undefined) => {
  if (!value) return 0
  const matched = String(value).trim().match(/^\s*([\d.]+)/)
  if (!matched) return 0
  const parsed = Number(matched[1])
  return Number.isFinite(parsed) ? parsed : 0
}

const resolveSvgSize = (svg: SVGSVGElement) => {
  const viewBox = svg.viewBox?.baseVal
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return {
      width: Math.max(1, Math.round(viewBox.width)),
      height: Math.max(1, Math.round(viewBox.height)),
    }
  }

  const rect = svg.getBoundingClientRect()
  if (rect.width > 0 && rect.height > 0) {
    return {
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
    }
  }

  const widthAttr = parseNumericSize(svg.getAttribute('width'))
  const heightAttr = parseNumericSize(svg.getAttribute('height'))
  if (widthAttr > 0 && heightAttr > 0) {
    return {
      width: Math.max(1, Math.round(widthAttr)),
      height: Math.max(1, Math.round(heightAttr)),
    }
  }

  return { width: 1200, height: 800 }
}

const serializeSvg = (svg: SVGSVGElement) => {
  const clone = svg.cloneNode(true) as SVGSVGElement
  if (!clone.getAttribute('xmlns')) {
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  }
  if (!clone.getAttribute('xmlns:xlink')) {
    clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  }
  const size = resolveSvgSize(svg)
  if (!clone.getAttribute('width')) {
    clone.setAttribute('width', String(size.width))
  }
  if (!clone.getAttribute('height')) {
    clone.setAttribute('height', String(size.height))
  }
  const content = new XMLSerializer().serializeToString(clone)
  return { content: `<?xml version="1.0" encoding="UTF-8"?>\n${content}`, size }
}

const exportMermaidAsImage = async (node: HTMLElement) => {
  const svg = node.querySelector<SVGSVGElement>('svg')
  if (!svg) return

  const { content, size } = serializeSvg(svg)
  const baseName = getMermaidDownloadBaseName()
  const svgBlob = new Blob([content], { type: 'image/svg+xml;charset=utf-8' })

  let svgObjectUrl = ''
  try {
    const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(size.width * ratio))
    canvas.height = Math.max(1, Math.round(size.height * ratio))
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas context unavailable')
    ctx.scale(ratio, ratio)

    svgObjectUrl = URL.createObjectURL(svgBlob)
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('image load failed'))
      img.src = svgObjectUrl
    })
    ctx.drawImage(image, 0, 0, size.width, size.height)

    const pngBlob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(blob => resolve(blob), 'image/png')
    })
    if (!pngBlob) throw new Error('png export failed')
    triggerBlobDownload(pngBlob, `${baseName}.png`)
  } catch (_error) {
    // 失败回退为 SVG，保证下载能力可用
    triggerBlobDownload(svgBlob, `${baseName}.svg`)
  } finally {
    if (svgObjectUrl) URL.revokeObjectURL(svgObjectUrl)
  }
}

const bindMermaidDownload = (node: HTMLElement) => {
  const wrapper = node.closest<HTMLElement>('.mermaid-wrapper')
  const svg = node.querySelector<SVGSVGElement>('svg')
  if (!wrapper || !svg) return

  if (!wrapper.querySelector('.mermaid-download-btn')) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'mermaid-download-btn'
    btn.textContent = '下载'
    btn.title = '下载脑图'
    btn.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      void exportMermaidAsImage(node)
    })
    wrapper.appendChild(btn)
  }

  if (svg.getAttribute('data-download-bound') === '1') return
  svg.setAttribute('data-download-bound', '1')
  svg.setAttribute('data-download-enabled', '1')
  svg.setAttribute('role', 'button')
  svg.setAttribute('tabindex', '0')
  svg.setAttribute('aria-label', '点击下载脑图')
  svg.setAttribute('title', '点击下载脑图')

  svg.addEventListener('click', event => {
    const target = event.target as HTMLElement | null
    if (target?.closest('a')) return
    event.preventDefault()
    event.stopPropagation()
    void exportMermaidAsImage(node)
  })

  svg.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    void exportMermaidAsImage(node)
  })
}

const renderMermaidBlocks = async () => {
  // 流式阶段只展示源码，结束后再渲染图，避免“源码/图”反复跳变。
  if (props.isUserMessage || props.loading) return
  const container = textRef.value
  if (!container) return
  cleanupLeakedMermaidArtifacts()
  const nodes = Array.from(
    container.querySelectorAll<HTMLElement>('.mermaid-source[data-mermaid-source="1"]')
  )
  if (!nodes.length) return

  const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'default'
  if (mermaidTheme !== currentTheme) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      suppressErrorRendering: true,
      theme: currentTheme as any,
      fontFamily: 'inherit',
    })
    mermaidTheme = currentTheme
  }

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i]
    const raw = (node.getAttribute('data-mermaid-raw') || node.textContent || '').trim()
    if (!raw) continue

    if (node.getAttribute('data-mermaid-raw') !== raw) {
      node.setAttribute('data-mermaid-raw', raw)
    }

    const renderId = `mermaid-${props.chatId || 'tmp'}-${props.index}-${i}-${Date.now()}`
    try {
      const result = await mermaid.render(renderId, raw, node)
      node.innerHTML = result.svg
      result.bindFunctions?.(node)
      bindMermaidDownload(node)
    } catch (_error) {
      // 语法不合法时退化为代码展示，避免出现空白。
      node.innerHTML = `<pre class="mermaid-fallback">${mdi.utils.escapeHtml(raw)}</pre>`
      cleanupLeakedMermaidArtifacts()
    }
  }
}

const scheduleRenderMermaidBlocks = () => {
  if (props.isUserMessage || props.loading) return
  if (mermaidTimer) {
    clearTimeout(mermaidTimer)
  }
  mermaidTimer = setTimeout(() => {
    nextTick(() => {
      void renderMermaidBlocks()
    })
  }, 60)
}

const onOpenImagePreviewer =
  inject<(imageUrls: string[], initialIndex: number, extraData?: any) => void>(
    'onOpenImagePreviewer'
  )

const isHideTts = computed(() => Number(authStore.globalConfig?.isHideTts) === 1)
const isStreamIn = computed(() => Boolean(chatStore.isStreamIn))

const searchResult = computed(() => {
  if (!props.networkSearchResult) return []
  try {
    const parsedData = JSON.parse(props.networkSearchResult)
    const rawList = Array.isArray(parsedData)
      ? parsedData
      : Array.isArray(parsedData?.searchResults)
        ? parsedData.searchResults
        : []
    return rawList.slice(0, 50).map((item: any) => ({
      ...item,
      title: String(item?.title || ''),
    }))
  } catch (e) {
    console.error('解析 networkSearchResult 时出错', e)
    return []
  }
})

const parseMaybeJson = (value: any) => {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[') && !trimmed.startsWith('"')) {
    return value
  }
  try {
    return JSON.parse(trimmed)
  } catch (_error) {
    return value
  }
}

const getSafeFileName = (value: string) => {
  const raw = String(value || '')
    .replace(/[?#].*$/, '')
    .split(/[\\/]/)
    .pop()
  if (!raw) return 'academic_file'
  try {
    return decodeURIComponent(raw)
  } catch (_error) {
    return raw
  }
}

const sanitizeDownloadName = (value: string) => {
  const name = String(value || '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim()
  return name || 'academic_file'
}

const isHttpUrl = (value: string) => /^https?:\/\//i.test(String(value || '').trim())

const getUserFileTypeLabel = (file: UserUploadedFile) => {
  const name = String(file?.name || '').trim()
  const ext = name.includes('.') ? name.split('.').pop()?.toUpperCase() || '' : ''
  if (!ext) return '文件'
  if (['PNG', 'JPG', 'JPEG', 'WEBP', 'GIF', 'BMP', 'SVG'].includes(ext)) return '图片'
  return `${ext} 文件`
}

const resolveAcademicDownloadPath = (value: any): string => {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    const raw = String(value || '').trim()
    if (!raw) return ''
    let decoded = raw
    try {
      decoded = decodeURIComponent(raw)
    } catch (_error) {}
    if (/^[\[{]/.test(decoded)) {
      try {
        return resolveAcademicDownloadPath(JSON.parse(decoded))
      } catch (_error) {
        return decoded
      }
    }
    return decoded
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = resolveAcademicDownloadPath(item)
      if (candidate) return candidate
    }
    return ''
  }
  if (typeof value === 'object') {
    const pathKeys = [
      'path',
      'file_path',
      'filePath',
      'file',
      'url',
      'download_path',
      'downloadPath',
    ]
    for (const key of pathKeys) {
      const candidate = resolveAcademicDownloadPath((value as Record<string, any>)[key])
      if (candidate) return candidate
    }
    const files = (value as Record<string, any>).files
    if (Array.isArray(files)) return resolveAcademicDownloadPath(files)
  }
  return ''
}

const isLikelyAcademicDownloadPath = (value: string) => {
  const source = String(value || '').trim()
  if (!source) return false
  if (isHttpUrl(source)) return true
  if (/^[\[{]/.test(source)) return false
  if (/[{}[\]]/.test(source)) return false
  if (/^[_-]*files[_-]*/i.test(source)) return false
  if (/^[a-zA-Z]:[\\/]/.test(source)) return true
  if (source.startsWith('/')) return true
  if (
    /^(?:private_upload|gpt_log|downloadzone|public\/file|file\/dev\/userFiles|academic-4\.0)\//i.test(
      source
    )
  ) {
    return true
  }
  return /[\\/]/.test(source)
}

const extractFilePath = (file: any) => {
  if (typeof file === 'string') return resolveAcademicDownloadPath(file)
  if (!file || typeof file !== 'object') return resolveAcademicDownloadPath(file)
  const direct = String(
    file.path ||
      file.file_path ||
      file.filePath ||
      file.file ||
      file.url ||
      file.download_path ||
      file.downloadPath ||
      ''
  ).trim()
  return resolveAcademicDownloadPath(direct || file)
}

const extractFileName = (file: any, pathValue: string) => {
  if (file && typeof file === 'object') {
    const customName = String(file.name || file.file_name || file.fileName || '').trim()
    if (customName) return customName
  }
  return getSafeFileName(pathValue)
}

const parsedFileVectorFiles = computed<AcademicDownloadFile[]>(() => {
  if (props.isUserMessage || !props.fileVectorResult) return []

  let parsed: any = parseMaybeJson(props.fileVectorResult)
  parsed = parseMaybeJson(parsed)

  const rawFiles = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.files)
      ? parsed.files
      : parsed
        ? [parsed]
        : []

  const seen = new Set<string>()
  const normalized = rawFiles
    .map((file: any) => {
      const pathValue = extractFilePath(file)
      if (!pathValue || !isLikelyAcademicDownloadPath(pathValue) || seen.has(pathValue)) return null
      seen.add(pathValue)
      return {
        path: pathValue,
        name: sanitizeDownloadName(extractFileName(file, pathValue)),
      }
    })
    .filter(Boolean) as AcademicDownloadFile[]

  return normalized
})

const parsedUserUploadedFiles = computed<UserUploadedFile[]>(() => {
  if (!props.isUserMessage || !props.fileUrl) return []
  let parsed: any = parseMaybeJson(props.fileUrl)
  parsed = parseMaybeJson(parsed)
  const rawFiles = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.files)
      ? parsed.files
      : parsed
        ? [parsed]
        : []
  const seen = new Set<string>()
  return rawFiles
    .map((item: any) => {
      if (!item) return null
      if (typeof item === 'string') {
        const urls = item
          .split(',')
          .map((part: string) => part.trim())
          .filter(Boolean)
        if (!urls.length) return null
        const first = urls.find((url: string) => !seen.has(url))
        if (!first) return null
        seen.add(first)
        return { url: first, name: sanitizeDownloadName(getSafeFileName(first)) }
      }
      const url = String(item.url || item.path || item.file || '').trim()
      if (!url || seen.has(url)) return null
      seen.add(url)
      const name = sanitizeDownloadName(
        String(item.name || item.file_name || item.fileName || getSafeFileName(url)).trim()
      )
      return { url, name }
    })
    .filter(Boolean) as UserUploadedFile[]
})

const downloadingFilePaths = ref<string[]>([])

const isDownloadingFile = (pathValue: string) => downloadingFilePaths.value.includes(pathValue)

const setDownloadingFile = (pathValue: string, loading: boolean) => {
  if (!pathValue) return
  if (loading) {
    if (!downloadingFilePaths.value.includes(pathValue)) {
      downloadingFilePaths.value = [...downloadingFilePaths.value, pathValue]
    }
    return
  }
  downloadingFilePaths.value = downloadingFilePaths.value.filter(item => item !== pathValue)
}

const downloadAcademicFile = async (file: AcademicDownloadFile) => {
  const pathValue = String(file?.path || '').trim()
  if (!pathValue || !isLikelyAcademicDownloadPath(pathValue)) {
    message()?.error('下载链接无效，请重新生成后再试')
    return
  }

  setDownloadingFile(pathValue, true)
  try {
    if (/^https?:\/\//i.test(pathValue)) {
      window.open(pathValue, '_blank', 'noopener,noreferrer')
      return
    }
    const apiBase = String(import.meta.env.VITE_GLOB_API_URL || '').replace(/\/$/, '')
    const url = `${apiBase}/academic/file?path=${encodeURIComponent(pathValue)}`
    const headers: Record<string, string> = {
      'X-Website-Domain': window.location.origin,
    }
    if (authStore.token) {
      headers.Authorization = `Bearer ${authStore.token}`
    }
    const response = await fetch(url, {
      method: 'GET',
      headers,
    })
    if (!response.ok) {
      let errMsg = '下载失败'
      try {
        const errPayload = await response.clone().json()
        if (errPayload?.message) errMsg = errPayload.message
      } catch (_error) {}
      throw new Error(errMsg)
    }
    const blob = await response.blob()
    const objectUrl = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = objectUrl
    link.download = sanitizeDownloadName(file.name || getSafeFileName(pathValue))
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(objectUrl)
  } catch (error: any) {
    message()?.error(error?.message || '下载失败')
  } finally {
    setDownloadingFile(pathValue, false)
  }
}

const parseDownloadErrorMessage = async (response: Response, fallback: string) => {
  try {
    const payload = await response.clone().json()
    const message = String(payload?.message || '').trim()
    if (message) return message
  } catch (_error) {}
  try {
    const text = String(await response.clone().text()).trim()
    if (text) return text.length > 120 ? `${text.slice(0, 120)}...` : text
  } catch (_error) {}
  return fallback
}

const downloadUserUploadedFile = async (file: UserUploadedFile) => {
  const source = String(file?.url || '').trim()
  if (!source) {
    message()?.error('文件地址无效，请重新上传后再试')
    return
  }
  if (isDownloadingFile(source)) return

  setDownloadingFile(source, true)
  try {
    const apiBase = String(import.meta.env.VITE_GLOB_API_URL || '').replace(/\/$/, '')
    const url = `${apiBase}/upload/file/download`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Website-Domain': window.location.origin,
    }
    if (authStore.token) {
      headers.Authorization = `Bearer ${authStore.token}`
    }
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        source,
        name: file.name,
      }),
    })
    if (!response.ok) {
      const errMsg = await parseDownloadErrorMessage(response, '文件下载失败，请稍后重试')
      throw new Error(errMsg)
    }
    const blob = await response.blob()
    triggerBlobDownload(blob, file.name || getSafeFileName(source))
  } catch (error: any) {
    message()?.error(error?.message || '文件下载失败，请稍后重试')
  } finally {
    setDownloadingFile(source, false)
  }
}

const buttonGroupClass = computed(() => {
  return playbackState.value !== 'paused' || isEditable.value
    ? 'opacity-100'
    : 'opacity-0 group-hover:opacity-100'
})

const handlePlay = async () => {
  if (playbackState.value === 'loading' || playbackState.value === 'playing') return
  if (localTtsUrl.value) {
    playAudio(localTtsUrl.value)
    return
  }

  playbackState.value = 'loading'
  try {
    if (!props.chatId || !props.content) return

    const res = (await fetchTtsAPIProcess({
      chatId: props.chatId,
      prompt: props.content,
    })) as TtsResponse

    const ttsUrl = res.ttsUrl
    if (ttsUrl) {
      localTtsUrl.value = ttsUrl
      playAudio(ttsUrl)
    } else {
      throw new Error('TTS URL is undefined')
    }
  } catch (error) {
    playbackState.value = 'paused'
  }
}

function playAudio(audioSrc: string | undefined) {
  if (currentAudio) {
    currentAudio.pause()
  }
  currentAudio = new Audio(audioSrc)
  currentAudio
    .play()
    .then(() => {
      playbackState.value = 'playing'
    })
    .catch(error => {
      playbackState.value = 'paused'
    })

  currentAudio.onended = () => {
    playbackState.value = 'paused'
    currentAudio = null
  }
}

function pauseAudio() {
  if (currentAudio) {
    currentAudio.pause()
    playbackState.value = 'paused'
  }
}

function playOrPause() {
  if (playbackState.value === 'playing') {
    pauseAudio()
  } else {
    handlePlay()
  }
}

function handleBrowserTts() {
  if (browserTtsState.value === 'playing') {
    stopBrowserTts()
  } else {
    playBrowserTts()
  }
}

function playBrowserTts() {
  if (!('speechSynthesis' in window)) {
    console.error('浏览器不支持语音合成API')
    return
  }

  stopBrowserTts()

  speechSynthesisUtterance = new SpeechSynthesisUtterance(props.content)

  speechSynthesisUtterance.lang = 'zh-CN'
  speechSynthesisUtterance.rate = 1.0
  speechSynthesisUtterance.pitch = 1.0

  speechSynthesisUtterance.onstart = () => {
    browserTtsState.value = 'playing'
  }

  speechSynthesisUtterance.onend = () => {
    browserTtsState.value = 'paused'
    speechSynthesisUtterance = null
  }

  speechSynthesisUtterance.onerror = () => {
    browserTtsState.value = 'paused'
    speechSynthesisUtterance = null
  }

  window.speechSynthesis.speak(speechSynthesisUtterance)
}

function stopBrowserTts() {
  if (window.speechSynthesis) {
    window.speechSynthesis.cancel()
    browserTtsState.value = 'paused'
    speechSynthesisUtterance = null
  }
}

const mdi = new MarkdownIt({
  linkify: true,
  html: true,
  breaks: true,
  highlight(code, language) {
    const validLang = !!(language && hljs.getLanguage(language))
    if (validLang) {
      const lang = language ?? ''
      return highlightBlock(hljs.highlight(code, { language: lang }).value, lang)
    }

    return highlightBlock(hljs.highlightAuto(code).value, '')
  },
})

const normalizeMermaidSource = (input: string) => {
  let source = String(input || '').trim()
  if (!source) return ''

  source = source
    .replace(/^```mermaid\s*/i, '')
    .replace(/```$/i, '')
    .replace(/^mermaid\s*/i, '')
    .trim()

  source = source
    .replace(/^(flowchart|graph)\s*(td|tb|bt|rl|lr)\b/i, (_, kind: string, dir: string) => {
      return `${kind} ${String(dir || '').toUpperCase()}`
    })
    .replace(/^sequencediagram\b/i, 'sequenceDiagram')
    .replace(/^classdiagram\b/i, 'classDiagram')
    .replace(/^statediagram-v2\b/i, 'stateDiagram-v2')
    .replace(/^statediagram\b/i, 'stateDiagram')

  // 兼容上游把换行压成 "|" 的情况，尽量还原为可读多行图定义。
  source = source.replace(/\|(?=[A-Za-z][A-Za-z0-9_]*\s*(?:-->|==>|-.->|---|--))/g, '\n')

  return source.trim()
}

const normalizeMermaidMarkdown = (input: string) => {
  const raw = String(input || '')
  if (!raw.trim()) return raw

  if (/```mermaid/i.test(raw)) {
    return raw.replace(/```mermaid([\s\S]*?)```/gi, (_, block: string) => {
      const normalizedBlock = normalizeMermaidSource(block)
      return `\`\`\`mermaid\n${normalizedBlock}\n\`\`\``
    })
  }

  const trimmed = raw.trim()
  if (
    !/^(?:mermaid\s*)?(?:flowchart|graph|mindmap|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|timeline|gitGraph|quadrantChart|requirementDiagram)\b/i.test(
      trimmed
    )
  ) {
    const lines = raw.split('\n')
    const mermaidStartPattern =
      /^(?:mermaid\s*)?(?:flowchart|graph|mindmap|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|timeline|gitGraph|quadrantChart|requirementDiagram)\b/i
    const isMermaidContinuation = (line: string) => {
      const text = String(line || '').trim()
      if (!text) return false
      if (/^(?:%%|style\b|classDef\b|class\b|click\b|linkStyle\b|subgraph\b|end\b|direction\b)/i.test(text))
        return true
      if (/^(?:[A-Za-z][A-Za-z0-9_]*\s*(?:-->|==>|-.->|---)|[A-Za-z][A-Za-z0-9_]*\s*[\[\(\{])/i.test(text))
        return true
      return /(?:-->|==>|-.->|---)/.test(text)
    }
    const start = lines.findIndex(line => mermaidStartPattern.test(String(line || '').trim()))
    if (start < 0) return raw
    let end = lines.length
    for (let i = start + 1; i < lines.length; i += 1) {
      const current = String(lines[i] || '')
      const trimmedLine = current.trim()
      if (!trimmedLine) continue
      if (isMermaidContinuation(trimmedLine)) continue
      end = i
      break
    }
    const before = lines.slice(0, start).join('\n').trimEnd()
    const block = lines.slice(start, end).join('\n')
    const after = lines.slice(end).join('\n').trimStart()
    const normalizedBlock = normalizeMermaidSource(block)
    if (!normalizedBlock) return raw
    const parts = []
    if (before) parts.push(before)
    parts.push(`\`\`\`mermaid\n${normalizedBlock}\n\`\`\``)
    if (after) parts.push(after)
    return parts.join('\n\n')
  }

  const normalized = normalizeMermaidSource(trimmed)
  if (!normalized) return raw
  return `\`\`\`mermaid\n${normalized}\n\`\`\``
}

const tableSeparatorPattern = /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*(?:\s*:?-{3,}:?\s*)?\|?\s*$/
const normalizeMarkdownTables = (input: string) => {
  // 学术插件常见异常：
  // 1) 表格前换行被吞，出现 “句子| 表头...”
  // 2) 分隔行被拆成多行（|----- \n |----- \n |----- \n |）
  // 这里做轻量修复，避免刷新后出现“丑表格”。
  const source = String(input || '')
  if (!source || !source.includes('|')) return source

  const toAsciiTableBars = (line: string) => {
    const current = String(line || '')
    const fullwidthCount = (current.match(/｜/g) || []).length
    const asciiCount = (current.match(/\|/g) || []).length
    if (fullwidthCount < 2 || asciiCount > 1) return current
    return current.replace(/｜/g, '|')
  }

  const sourceLines = source.split('\n').map(line => toAsciiTableBars(line))

  const splitTableCells = (line: string) => {
    const text = String(line || '').trim()
    if (!text.startsWith('|')) return [] as string[]
    let body = text.slice(1)
    if (body.endsWith('|')) body = body.slice(0, -1)
    const cells: string[] = []
    let current = ''
    let escaped = false
    for (const char of body) {
      if (escaped) {
        current += char
        escaped = false
        continue
      }
      if (char === '\\') {
        current += char
        escaped = true
        continue
      }
      if (char === '|') {
        cells.push(current.trim())
        current = ''
        continue
      }
      current += char
    }
    cells.push(current.trim())
    return cells
  }

  const normalizeTableRow = (cells: string[], expectedColumns: number) => {
    const normalizedCells = [...(cells || [])].map(item => String(item || '').trim())
    const size = Math.max(2, expectedColumns || 0)
    if (normalizedCells.length > size) {
      const head = normalizedCells.slice(0, size - 1)
      const tail = normalizedCells.slice(size - 1).join(' ')
      normalizedCells.splice(0, normalizedCells.length, ...head, tail)
    }
    while (normalizedCells.length < size) normalizedCells.push('')
    return `| ${normalizedCells.slice(0, size).join(' | ')} |`
  }
  const findNextNonEmptyIndexIn = (lines: string[], start: number) => {
    let index = start
    while (index < lines.length && !String(lines[index] || '').trim()) index += 1
    return index
  }
  const rawLines: string[] = []
  for (let i = 0; i < sourceLines.length; i += 1) {
    const current = String(sourceLines[i] || '')
    const firstPipe = current.indexOf('|')
    if (firstPipe > 0 && !/^\s*\|/.test(current)) {
      const prefix = current.slice(0, firstPipe).trimEnd()
      const maybeHeader = current.slice(firstPipe).trimStart()
      if (prefix && maybeHeader.startsWith('|') && !prefix.includes('|')) {
        const maybeHeaderCells = splitTableCells(maybeHeader)
        const nextIndex = findNextNonEmptyIndexIn(sourceLines, i + 1)
        const next = nextIndex < sourceLines.length ? String(sourceLines[nextIndex] || '') : ''
        const next2Index = findNextNonEmptyIndexIn(sourceLines, nextIndex + 1)
        const next2 = next2Index < sourceLines.length ? String(sourceLines[next2Index] || '') : ''
        const nextCells = splitTableCells(next)
        const canSplitNormalHeader = maybeHeaderCells.length >= 2 && tableSeparatorPattern.test(next)
        const canSplitSplitHeader =
          maybeHeaderCells.length === 1 &&
          nextCells.length === 1 &&
          tableSeparatorPattern.test(next2)
        if (canSplitNormalHeader || canSplitSplitHeader) {
          rawLines.push(prefix, maybeHeader)
          continue
        }
      }
    }
    rawLines.push(current)
  }

  const isHeaderCandidate = (line: string) => {
    const text = String(line || '').trim()
    if (!text.startsWith('|')) return false
    const cellCount = splitTableCells(text).length
    if (cellCount < 2) return false
    return !tableSeparatorPattern.test(text)
  }
  const isBrokenSeparatorPiece = (line: string) => /^\s*\|\s*:?-{3,}:?\s*$/.test(String(line || ''))
  const hasSeparatorAhead = (index: number) => {
    let brokenPieces = 0
    for (let i = index + 1; i < Math.min(rawLines.length, index + 7); i += 1) {
      const current = String(rawLines[i] || '')
      if (!current.trim()) continue
      if (tableSeparatorPattern.test(current)) return true
      if (isBrokenSeparatorPiece(current)) {
        brokenPieces += 1
        if (brokenPieces >= 2) return true
        continue
      }
      break
    }
    return false
  }

  const normalizedWithBoundary: string[] = []
  for (let i = 0; i < rawLines.length; i += 1) {
    const current = String(rawLines[i] || '')
    if (
      isHeaderCandidate(current) &&
      hasSeparatorAhead(i) &&
      normalizedWithBoundary.length > 0 &&
      String(normalizedWithBoundary[normalizedWithBoundary.length - 1] || '').trim() !== ''
    ) {
      normalizedWithBoundary.push('')
    }
    normalizedWithBoundary.push(current)
  }

  let normalized = normalizedWithBoundary.join('\n')

  // 补表格前换行：当表头直接黏在上一句末尾时，插入空行帮助 markdown-it 正确识别。
  normalized = normalized.replace(
    /([^\n])\s*(\|[^\n]*\|\s*\n\|(?:\s*:?-{3,}:?\s*\|){1,}\s*:?-{3,}:?\s*\|?)/g,
    '$1\n\n$2'
  )

  const lines = normalized.split('\n')
  const repaired: string[] = []
  for (let i = 0; i < lines.length; i += 1) {
    const current = String(lines[i] || '')
    const isBrokenSeparatorPiece = /^\s*\|\s*:?-{3,}:?\s*$/.test(current)
    if (!isBrokenSeparatorPiece) {
      repaired.push(current)
      continue
    }

    const pieces = [current.trim()]
    let cursor = i + 1
    while (cursor < lines.length && /^\s*\|\s*:?-{3,}:?\s*$/.test(String(lines[cursor] || ''))) {
      pieces.push(String(lines[cursor] || '').trim())
      cursor += 1
    }

    // 兼容末尾单独一行 "|" 的损坏形式。
    const hasTailPipe = cursor < lines.length && /^\s*\|\s*$/.test(String(lines[cursor] || ''))
    if (pieces.length >= 2 && hasTailPipe) {
      repaired.push(`${pieces.join('')}|`)
      i = cursor
      continue
    }

    repaired.push(current)
  }

  normalized = repaired.join('\n')

  // 修复“表头正常但数据行被拆成两行（路径一行、描述一行）”的损坏形态。
  const tableLines = normalized.split('\n')
  const mergedRows: string[] = []
  const isTableLike = (line: string) => /^\s*\|/.test(String(line || ''))
  const findNextNonEmptyIndex = (start: number) => {
    let index = start
    while (index < tableLines.length && !String(tableLines[index] || '').trim()) index += 1
    return index
  }
  let cursor = 0
  while (cursor < tableLines.length) {
    const current = String(tableLines[cursor] || '')
    if (!current.trim()) {
      mergedRows.push(current)
      cursor += 1
      continue
    }
    const nextIndex = findNextNonEmptyIndex(cursor + 1)
    const next = nextIndex < tableLines.length ? String(tableLines[nextIndex] || '') : ''
    const next2Index = findNextNonEmptyIndex(nextIndex + 1)
    const next2 = next2Index < tableLines.length ? String(tableLines[next2Index] || '') : ''
    const headerCells = splitTableCells(current)
    const nextCells = splitTableCells(next)
    const hasNormalHeader =
      isTableLike(current) && headerCells.length >= 2 && tableSeparatorPattern.test(next)
    const hasSplitHeader =
      isTableLike(current) &&
      isTableLike(next) &&
      headerCells.length === 1 &&
      nextCells.length === 1 &&
      Boolean(String(headerCells[0] || '').trim()) &&
      Boolean(String(nextCells[0] || '').trim()) &&
      tableSeparatorPattern.test(next2)
    if (hasNormalHeader || hasSplitHeader) {
      const normalizedHeader = hasSplitHeader ? [headerCells[0], nextCells[0]] : headerCells
      const expectedColumns = Math.max(2, normalizedHeader.length)
      mergedRows.push(normalizeTableRow(normalizedHeader, expectedColumns))
      mergedRows.push(`| ${new Array(expectedColumns).fill('---').join(' | ')} |`)
      cursor = hasSplitHeader ? next2Index + 1 : nextIndex + 1
      while (cursor < tableLines.length) {
        const row = String(tableLines[cursor] || '')
        if (!row.trim()) {
          const afterBlankIndex = findNextNonEmptyIndex(cursor + 1)
          if (afterBlankIndex < tableLines.length && isTableLike(tableLines[afterBlankIndex])) {
            cursor += 1
            continue
          }
          mergedRows.push(row)
          cursor += 1
          break
        }
        if (!isTableLike(row)) break
        if (tableSeparatorPattern.test(row)) {
          cursor += 1
          continue
        }
        const cells = splitTableCells(row)
        if (!cells.length) {
          mergedRows.push(row)
          cursor += 1
          continue
        }
        if (cells.length === 1 && cursor + 1 < tableLines.length) {
          const nextRowIndex = findNextNonEmptyIndex(cursor + 1)
          const nextRow = nextRowIndex < tableLines.length ? String(tableLines[nextRowIndex] || '') : ''
          if (isTableLike(nextRow) && !tableSeparatorPattern.test(nextRow)) {
            const nextCells = splitTableCells(nextRow)
            if (nextCells.length === 1) {
              mergedRows.push(normalizeTableRow([cells[0], nextCells[0]], expectedColumns))
              cursor = nextRowIndex + 1
              continue
            }
          }
        }
        mergedRows.push(normalizeTableRow(cells, expectedColumns))
        cursor += 1
      }
      continue
    }
    mergedRows.push(current)
    cursor += 1
  }

  const cleanupCell = (value: string) =>
    String(value || '')
      .replace(/^\s*\|\s*/, '')
      .replace(/\s*\|\s*$/, '')
      .trim()

  // 兜底修复：有些输出会变成“路径一行 + 描述一行 + 分隔线一行”循环，这里做行级重组。
  const collapseSplitRowPairs = (value: string) => {
    const sourceLines = String(value || '').split('\n')
    const result: string[] = []
    const findNextNonEmpty = (start: number) => {
      let idx = start
      while (idx < sourceLines.length && !String(sourceLines[idx] || '').trim()) idx += 1
      return idx
    }
    let idx = 0
    while (idx < sourceLines.length) {
      const current = String(sourceLines[idx] || '')
      const currentCells = splitTableCells(current)
      if (
        /^\s*\|/.test(current) &&
        !tableSeparatorPattern.test(current) &&
        currentCells.length === 1
      ) {
        const nextIdx = findNextNonEmpty(idx + 1)
        const nextLine = nextIdx < sourceLines.length ? String(sourceLines[nextIdx] || '') : ''
        const nextCells = splitTableCells(nextLine)
        if (
          /^\s*\|/.test(nextLine) &&
          !tableSeparatorPattern.test(nextLine) &&
          nextCells.length === 1
        ) {
          const left = cleanupCell(currentCells[0] || '')
          const right = cleanupCell(nextCells[0] || '')
          const isHeaderPair = /^(?:文件路径|filepath)$/i.test(left) && /^(?:功能描述|description)$/i.test(right)
          if (left && right && !isHeaderPair) {
            result.push(`| ${left} | ${right} |`)
            const maybeSeparatorIdx = findNextNonEmpty(nextIdx + 1)
            if (
              maybeSeparatorIdx < sourceLines.length &&
              tableSeparatorPattern.test(String(sourceLines[maybeSeparatorIdx] || ''))
            ) {
              idx = maybeSeparatorIdx + 1
            } else {
              idx = nextIdx + 1
            }
            continue
          }
        }
      }
      result.push(current)
      idx += 1
    }
    return result.join('\n')
  }

  const collapseTableBlankLines = (value: string) => {
    const sourceLines = String(value || '').split('\n')
    const output: string[] = []
    for (let i = 0; i < sourceLines.length; i += 1) {
      const current = String(sourceLines[i] || '')
      if (current.trim()) {
        output.push(current)
        continue
      }
      let prevIndex = output.length - 1
      while (prevIndex >= 0 && !String(output[prevIndex] || '').trim()) prevIndex -= 1
      let nextIndex = i + 1
      while (nextIndex < sourceLines.length && !String(sourceLines[nextIndex] || '').trim()) nextIndex += 1
      const prev = prevIndex >= 0 ? String(output[prevIndex] || '') : ''
      const next = nextIndex < sourceLines.length ? String(sourceLines[nextIndex] || '') : ''
      if (/^\s*\|/.test(prev) && /^\s*\|/.test(next)) continue
      output.push(current)
    }
    return output.join('\n')
  }

  normalized = mergedRows.join('\n')
  normalized = collapseSplitRowPairs(normalized)
  normalized = collapseTableBlankLines(normalized)
  return normalized
}

const defaultFenceRenderer = mdi.renderer.rules.fence?.bind(mdi.renderer.rules)
mdi.renderer.rules.fence = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  const lang = String(token.info || '')
    .trim()
    .toLowerCase()
  if (lang === 'mermaid') {
    if (props.loading) {
      // 生成中保持 markdown 代码块形态，防止图形反复重算导致页面抖动。
      if (defaultFenceRenderer) return defaultFenceRenderer(tokens, idx, options, env, self)
      return self.renderToken(tokens, idx, options)
    }
    const source = normalizeMermaidSource(token.content || '')
    const escaped = mdi.utils.escapeHtml(source)
    return `<div class="mermaid-wrapper"><div class="mermaid-source" data-mermaid-source="1">${escaped}</div></div>`
  }
  if (defaultFenceRenderer) return defaultFenceRenderer(tokens, idx, options, env, self)
  return self.renderToken(tokens, idx, options)
}

// 用于存储代码块复制按钮的定时器
const copyTimeoutsMap = new Map()

// 复制代码的处理函数
function handleCodeCopy(blockId: string, element: HTMLElement) {
  console.log('复制开始，blockId:', blockId)
  // 如果已经是"已复制"状态，则不重复处理
  const copiedText = element.querySelector('.copied-text')
  if (copiedText && getComputedStyle(copiedText).display !== 'none') return

  const codeBlock = document.getElementById(blockId)
  if (!codeBlock) {
    console.error('未找到代码块:', blockId)
    return
  }

  const codeElement = codeBlock.querySelector('code')
  if (!codeElement || !codeElement.textContent) {
    console.error('未找到代码内容')
    return
  }

  // 复制代码内容
  try {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(codeElement.textContent)
        .then(() => {
          console.log('使用navigator.clipboard成功复制')
          // 成功复制后更新UI
          updateCopyButtonState(element, blockId)
        })
        .catch(err => {
          console.error('navigator.clipboard复制失败:', err)
          // 尝试回退方法
          fallbackCopy(codeElement.textContent, element, blockId)
        })
    } else {
      // 回退到传统方法
      fallbackCopy(codeElement.textContent, element, blockId)
    }
  } catch (error) {
    console.error('复制过程出错:', error)
    message()?.error('复制失败!')
  }
}

// 回退复制方法
function fallbackCopy(text: string | null, element: HTMLElement, blockId: string) {
  if (!text) {
    console.error('复制内容为空')
    message()?.error('复制失败!')
    return
  }

  try {
    copyText({ text: text, origin: true })
    console.log('使用fallback方法复制成功')
    updateCopyButtonState(element, blockId)
  } catch (error) {
    console.error('fallback复制失败:', error)
    message()?.error('复制失败!')
  }
}

// 更新复制按钮状态
function updateCopyButtonState(element: HTMLElement, blockId: string) {
  // 防止重复处理
  if (element.getAttribute('data-copying') === 'true') return
  element.setAttribute('data-copying', 'true')

  // 查找按钮中的图标和文本元素
  const copyIcon = element.querySelector('.copy-icon')
  const checkIcon = element.querySelector('.check-icon')
  const copyText = element.querySelector('.copy-text')
  const copiedText = element.querySelector('.copied-text')

  if (copyIcon && checkIcon && copyText && copiedText) {
    // 隐藏复制图标和文本，显示勾图标和已复制文本
    copyIcon.classList.add('hidden')
    copyText.classList.add('hidden')
    checkIcon.classList.remove('hidden')
    copiedText.classList.remove('hidden')
  }

  // 成功提示
  message()?.success('复制成功!')

  // 清除之前的定时器
  if (copyTimeoutsMap.has(blockId)) {
    clearTimeout(copyTimeoutsMap.get(blockId))
  }

  // 设置新的定时器，3秒后恢复原始状态
  const timeoutId = setTimeout(() => {
    console.log('恢复原始按钮内容')
    if (element) {
      const copyIcon = element.querySelector('.copy-icon')
      const checkIcon = element.querySelector('.check-icon')
      const copyText = element.querySelector('.copy-text')
      const copiedText = element.querySelector('.copied-text')

      if (copyIcon && checkIcon && copyText && copiedText) {
        // 恢复原状
        copyIcon.classList.remove('hidden')
        copyText.classList.remove('hidden')
        checkIcon.classList.add('hidden')
        copiedText.classList.add('hidden')
      }

      // 清除处理标记
      element.removeAttribute('data-copying')
    }
  }, 3000)

  // 存储定时器ID以便后续清理
  copyTimeoutsMap.set(blockId, timeoutId)
}

mdi.renderer.rules.image = function (tokens, idx, options, env, self) {
  const token = tokens[idx]
  const src = token.attrGet('src')
  const title = token.attrGet('title')
  const alt = token.content

  if (!src) return ''

  return `<img src="${src}" alt="${alt || ''}" title="${title || alt || ''}" class="rounded-md max-h-[30vh] cursor-pointer hover:opacity-90 transition-opacity" 
    onclick="(function(event) { 
      event.stopPropagation();
      const customEvent = new CustomEvent('previewMdImage', { detail: { src: '${src}' } });
      document.dispatchEvent(customEvent);
    })(event)"
  />`
}

const imageUrlArray = computed(() => {
  const val = props.imageUrl
  if (!val) return []
  // 支持 JSON 字符串格式 {"imageUrls":[...]}
  if (typeof val === 'string' && val.trim().startsWith('{') && val.includes('imageUrls')) {
    try {
      const parsed = JSON.parse(val)
      if (parsed && Array.isArray(parsed.imageUrls)) {
        return parsed.imageUrls.map((item: any) => item.url).filter(Boolean)
      }
    } catch (e) {}
  }
  // 新增：支持 JSON 数组字符串格式
  if (typeof val === 'string' && val.trim().startsWith('[')) {
    try {
      const arr = JSON.parse(val)
      if (Array.isArray(arr)) {
        return arr.map((item: any) => item.url).filter(Boolean)
      }
    } catch (e) {}
  }
  if (typeof val === 'string') {
    // 兼容逗号分隔
    return val
      .split(',')
      .map(url => url.trim())
      .filter(Boolean)
  }
  if (Array.isArray(val)) return val
  return []
})

const isImageUrl = computed(() => {
  if (!props.imageUrl) return false

  // 如果已经成功提取了URLs，则认为是图片
  if (imageUrlArray.value.length > 0) {
    return true
  }

  // 如果没有提取出来，检查原始值
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(props.imageUrl)
})

mdi.use(mila, { attrs: { target: '_blank', rel: 'noopener' } })
mdi.use(mdKatex, {
  blockClass: 'katexmath-block p-0 flex h-full items-center justify-start',
  inlineClass: 'katexmath-inline',
  errorColor: ' #cc0000',
})

const text = computed(() => {
  // 显式依赖 loading，确保流式结束后重新走 markdown 渲染（由源码切到图容器）。
  const streamLoading = Boolean(props.loading)
  const sanitizeDisplayText = (input: string) => {
    const source = String(input || '')
      .replace(/[​⁠﻿]/g, '')
      .replace(
        /(^|[\s,(])(?:file\/dev\/userFiles|public\/file|private_upload|userFiles)\/[A-Za-z0-9_\-./]+/g,
        '$1'
      )
      .replace(/(?:academic-4\.0|gpt_log|downloadzone)\/[A-Za-z0-9_\-./]+/gi, '')
      .replace(
        /\/(?:www|root|home|Users|private_upload|userFiles|tmp|var)\/[A-Za-z0-9_\-./]+/g,
        ''
      )
      .replace(/[A-Za-z]:\\[^\s"']+/g, '')
      .replace(/【文件路径已隐藏】|\[路径已隐藏\]/g, '')
      .replace(/(找不到任何[^\n:：]*文件)\s*[:：]\s*(?=\n|$)/g, '$1。')
      .replace(/(找不到本地项目或(?:无权访问|无法处理))\s*[:：]\s*(?=\n|$)/g, '$1。')
      .replace(/(解析项目)\s*[:：]\s*(?=\n|$)/g, '$1')
      .replace(/\[\s*Local\s+Message\s*]\s*/gi, '')
      .replace(
        /(?:函数)?插件(?:作者|贡献者)\s*[:：]?\s*(?:[A-Za-z0-9_.-]+(?:\s*[,，、/&]\s*[A-Za-z0-9_.-]+)*)[，,;；。\s]*/gi,
        ''
      )
      .replace(/(?:函数)?插件(?:作者|贡献者)\s*\[[^\]]*][，,;；。\s]*/gi, '')
      .replace(/^\s*函数插件功能[？?]\s*$/gm, '')
      .replace(/\b(?:PDF_Summary|Word_Summary|PDF_QA)\s*[。.:：]\s*/gi, '')
      .replace(/^\s*分析结果[:：][^\n]*Latex主文件是[^\n]*$/gim, '')
      .replace(/^\s*主程序即将开始[^\n]*$/gim, '')
      .replace(/^\s*正在精细切分latex文件[^\n]*$/gim, '')
      .replace(/(?:任务处理中\s*[，,]?\s*请稍候\s*[（(][^）)\n]{0,240}[）)]\s*)+/gi, '')
      .replace(/\b任务处理中\s*[，,]?\s*请稍候\b/gi, '')
      .replace(/^\s*请开始多线程操作[。.]?\s*$/gm, '')
      .replace(/Lens Report\s*｜\s*昱镜报告/g, 'Lens Report｜昱镜报告')
      .replace(/\r\n/g, '\n')
      .replace(/\n{4,}/g, '\n\n\n')
    const lines = source.split('\n')
    const out: string[] = []
    const seenOverflow = new Set<string>()
    const warningPattern =
      /^\s*警告，文本过长将进行截断，Token溢出数[:：]\s*(\d+)(?:\s*[，,]\s*现继续运行)?\s*[。.]?\s*$/
    for (const line of lines) {
      const matched = warningPattern.exec(String(line || ''))
      if (!matched) {
        out.push(line)
        continue
      }
      const overflow = String(matched[1] || '').trim()
      if (!overflow || seenOverflow.has(overflow)) continue
      seenOverflow.add(overflow)
      out.push(`警告，文本过长将进行截断，Token溢出数：${overflow}，现继续运行。`)
    }
    return out.join('\n')
  }
  let value = sanitizeDisplayText(props.content || '')
  value = normalizeMarkdownTables(value)
  value = normalizeMermaidMarkdown(value)

  let modifiedValue = value
    .replace(/\\\(\s*/g, '$')
    .replace(/\s*\\\)/g, '$')
    .replace(/\\\[\s*/g, '$$')
    .replace(/\s*\\\]/g, '$$')
    .replace(
      /\[\[(\d+)\]\((https?:\/\/[^\)]+)\)\]/g,
      '<button class="bg-gray-500 text-white rounded-full w-4 h-4 mx-1 flex justify-center items-center text-sm hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-500 inline-flex" onclick="window.open(\'$2\', \'_blank\')">$1</button>'
    )

  if (!props.isUserMessage) {
    void streamLoading
    return mdi.render(modifiedValue)
  }

  return modifiedValue
})

watch(
  () => text.value,
  () => {
    if (props.isUserMessage || props.loading) return
    scheduleRenderMermaidBlocks()
  },
  { immediate: true }
)

watch(
  () => props.loading,
  loading => {
    if (props.isUserMessage || loading) return
    scheduleRenderMermaidBlocks()
  }
)

const reasoningTips = [
  '正在理解用户的想法',
  '正在寻找用户的关键点',
  '正在为用户找到最适合的解决路径',
  '正在为用户提供最适合的解决办法',
  '正在为用户提供学术支持',
]
const reasoningTipIndex = ref(0)
let reasoningTipTimer: ReturnType<typeof setInterval> | null = null

const reasoningPreview = computed(() => reasoningTips[reasoningTipIndex.value])
const hasReasoning = computed(() => Boolean(props.reasoningText))
const showThinkingPill = computed(
  () => !props.isUserMessage && (props.loading || hasReasoning.value)
)
const shouldAnimateThinking = computed(() => props.loading)

const startReasoningTips = () => {
  if (reasoningTipTimer || reasoningTips.length === 0) return
  reasoningTipIndex.value = reasoningTipIndex.value % reasoningTips.length
  reasoningTipTimer = setInterval(() => {
    reasoningTipIndex.value = (reasoningTipIndex.value + 1) % reasoningTips.length
  }, 5000)
}

const stopReasoningTips = () => {
  if (reasoningTipTimer) {
    clearInterval(reasoningTipTimer)
    reasoningTipTimer = null
  }
}

function highlightBlock(str: string, lang?: string) {
  const blockId = `code-block-${Date.now()}-${Math.floor(Math.random() * 1000)}`

  // 直接返回带样式的HTML
  return `<pre
    class="max-w-full border border-gray-200 bg-[#AFB8C133] dark:border-gray-700 dark:bg-gray-750 transition-colors"
    id="${blockId}"
    style="line-height: normal; margin: 0 !important; padding: 0 !important; border-radius: 0.75rem !important; width: 100% !important; overflow: hidden !important;"
  ><div class="code-block-header sticky w-full h-10 flex justify-between items-center px-3 border-b border-gray-100 dark:border-gray-700 z-10">
    <span class="text-gray-600 dark:text-gray-400 text-sm font-medium flex items-center">${lang || 'text'}</span>
    <div class="flex gap-2">
      <button class="h-7 gap-1 btn-pill btn-copy" data-block-id="${blockId}">
        <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="copy-icon text-current"><path d="M13 12.4316V7.8125C13 6.2592 14.2592 5 15.8125 5H40.1875C41.7408 5 43 6.2592 43 7.8125V32.1875C43 33.7408 41.7408 35 40.1875 35H35.5163" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M32.1875 13H7.8125C6.2592 13 5 14.2592 5 15.8125V40.1875C5 41.7408 6.2592 43 7.8125 43H32.1875C33.7408 43 35 41.7408 35 40.1875V15.8125C35 14.2592 33.7408 13 32.1875 13Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/></svg>
        <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="check-icon text-current hidden"><path d="M10 24L20 34L40 14" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span class="copy-text">${t('chat.copyCode')}</span>
        <span class="copied-text hidden">已复制</span>
      </button>
    </div>
  </div><code
    class="hljs code-content-scrollable custom-scrollbar px-4 py-3 text-base bg-white dark:bg-[#282c34] rounded-b-2xl leading-normal code-container"
    style="margin-top: 0; padding-right: 0.75rem !important; padding-left: 0.75rem !important; display: block !important; white-space: pre !important; max-width: 100% !important; width: 100% !important; overflow-x: auto !important;"
  >${str}</code></pre>`
}

async function handleEditMessage() {
  if (isStreamIn.value) return
  if (isEditable.value) {
    const tempEditableContent = editableContent.value
    const list = chatStore.chatList || []
    let targetReplyChatId = 0
    let targetReplyIndex = -1
    for (let idx = props.index + 1; idx < list.length; idx += 1) {
      const item = list[idx]
      if (item?.role === 'user') break
      if (item?.role === 'assistant') {
        targetReplyIndex = idx
        targetReplyChatId = Number(item?.chatId || targetReplyChatId || 0)
      }
    }
    // 提交编辑后立即退出编辑态，避免等待整段流式回复期间仍显示为编辑中。
    isEditable.value = false
    await onConversation({
      msg: tempEditableContent,
      imageUrl: props.imageUrl,
      fileUrl: props.fileUrl,
      chatId: props.chatId,
      overwriteReply: true,
      editIndex: props.index,
      replyIndex: targetReplyIndex >= 0 ? targetReplyIndex : undefined,
      replyChatId: targetReplyChatId || undefined,
    })
  } else {
    editableContent.value = props.content
    isEditable.value = true
    await nextTick()
    adjustTextareaHeight()
  }
}

const triggerRegenerate = () => {
  if (isStreamIn.value || props.loading) return
  if (typeof handleRegenerate === 'function') {
    handleRegenerate(props.index, props.chatId)
  }
}

async function handleMessage(item: string) {
  await onConversation({
    msg: item,
  })
}

function handleCopy() {
  emit('copy')
}

function handleDelete() {
  emit('delete')
}

const cancelEdit = () => {
  isEditable.value = false
  editableContent.value = props.content
}

const adjustTextareaHeight = () => {
  if (textarea.value) {
    textarea.value.style.height = 'auto'
    textarea.value.style.height = `${textarea.value.scrollHeight}px`
  }
}

// 新增：监听 loading 状态改变以控制代码块高度
watch(
  () => props.loading,
  isLoading => {
    // 仅处理非用户消息
    if (props.isUserMessage) return

    nextTick(() => {
      const container = textRef.value
      if (container) {
        const codeElements = container.querySelectorAll('code.code-content-scrollable')
        codeElements.forEach(element => {
          const codeEl = element as HTMLElement
          const parentDiv = codeEl.parentElement

          if (!isLoading) {
            // 加载完成: 设置最大高度和滚动
            codeEl.style.maxHeight = '50vh'
            codeEl.style.overflowY = 'auto'
            codeEl.style.display = 'block'
            codeEl.style.whiteSpace = 'pre'
            codeEl.style.minWidth = '0'
            codeEl.style.maxWidth = '100%'
            codeEl.style.overflowX = 'auto'

            if (parentDiv && parentDiv.classList.contains('custom-scrollbar')) {
              parentDiv.style.overflowX = 'auto'
              parentDiv.style.maxWidth = '100%'
            }

            // 确保滚动条可见
            setTimeout(() => {
              // 强制重新计算布局，确保滚动条显示
              codeEl.style.overflow = 'hidden'
              void codeEl.offsetHeight // 触发回流
              codeEl.style.overflowY = 'auto'

              if (parentDiv) {
                void parentDiv.offsetHeight
                parentDiv.style.overflowX = 'auto'
              }
            }, 100)
          } else {
            // 正在加载: 移除限制，允许内容扩展
            codeEl.style.maxHeight = 'none'
            codeEl.style.overflowY = 'visible' // 或者 hidden，取决于是否希望看到溢出
            // display: block 可以在 CSS 中设置或在这里保留
            codeEl.style.display = 'block'
            codeEl.style.whiteSpace = 'pre'
          }
        })
      }
    })
  },
  { immediate: true } // 初始渲染时也根据 loading 状态设置一次
)

// 在watch中监听editableContent的变化
watch(editableContent, () => {
  if (isEditable.value) {
    nextTick(() => {
      adjustTextareaHeight()
    })
  }
})

// 监听isEditable状态变化，确保切换到编辑模式时调整高度
watch(isEditable, newVal => {
  if (newVal) {
    nextTick(() => {
      adjustTextareaHeight()
    })
  }
})

watch(
  isStreamIn,
  active => {
    if (!active || !isEditable.value) return
    isEditable.value = false
    editableContent.value = props.content
  },
  { flush: 'post' }
)

watch(
  shouldAnimateThinking,
  active => {
    if (active) {
      startReasoningTips()
    } else {
      stopReasoningTips()
    }
  },
  { immediate: true }
)

// 监听深度思考状态，自动折叠完成的深度思考内容
// watch(
//   [
//     () => props.reasoningText,
//     () => props.content,
//     () => props.loading,
//     () => props.usingDeepThinking,
//   ],
//   (
//     [newReasoningText, newContent, newLoading, newUsingDeepThinking],
//     [oldReasoningText, oldContent, oldLoading, oldUsingDeepThinking]
//   ) => {
//     // 如果有深度思考内容且当前是展开状态
//     if (newReasoningText && showThinking.value && !props.isUserMessage) {
//       // 情况1：深度思考完成（loading从true变为false）
//       // 情况2：开始有正文内容（从无到有）
//       // 情况3：不再使用深度思考且有正文内容
//       if (
//         (oldLoading && !newLoading && newReasoningText) ||
//         (!oldContent && newContent && newReasoningText) ||
//         (oldUsingDeepThinking && !newUsingDeepThinking && newContent)
//       ) {
//         // 延迟2秒后自动折叠，给用户时间看到完成状态
//         setTimeout(() => {
//           showThinking.value = false
//         }, 1000)
//       }
//     }
//   },
//   { immediate: false }
// )

defineExpose({ textRef })

onMounted(() => {
  // 注入主题覆盖样式
  injectThemeStyles()
  scheduleRenderMermaidBlocks()

  // 添加复制功能
  const setupCodeCopy = () => {
    console.log('设置代码复制功能')
    // 选择包含btn-copy类的按钮
    const copyButtons = document.querySelectorAll('.btn-copy[data-block-id]')
    copyButtons.forEach(button => {
      const blockId = button.getAttribute('data-block-id')
      if (!blockId) return

      // 检查按钮是否已经绑定了事件（添加自定义属性标记）
      if (button.getAttribute('data-listener-attached') === 'true') {
        return
      }

      // 添加新的事件处理程序
      button.addEventListener('click', event => {
        event.stopPropagation()
        event.preventDefault()
        console.log('复制按钮被点击, blockId:', blockId)
        handleCodeCopy(blockId, button as HTMLElement)
      })

      // 标记按钮已绑定事件
      button.setAttribute('data-listener-attached', 'true')
    })
  }

  // 初始设置和DOM更新后重新设置
  setupCodeCopy()

  // 监听DOM变化，当新的代码块出现时设置复制功能
  const observer = new MutationObserver(mutations => {
    // 检查是否有新的代码块按钮被添加
    let hasNewButtons = false
    mutations.forEach(mutation => {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) {
            // 元素节点
            const element = node as HTMLElement
            // 检查是否包含未绑定事件的复制按钮
            const newButtons = element.querySelectorAll(
              '.btn-copy:not([data-listener-attached="true"])'
            )
            if (newButtons.length > 0) {
              hasNewButtons = true
            }
          }
        })
      }
    })

    // 只有在确实有新按钮时才执行设置
    if (hasNewButtons) {
      setupCodeCopy()
    }
  })
  observer.observe(document.body, { childList: true, subtree: true })

  // 卸载时清理
  onUnmounted(() => {
    observer.disconnect()
    // 清理所有定时器
    copyTimeoutsMap.forEach(timeoutId => clearTimeout(timeoutId))
    copyTimeoutsMap.clear()
  })

  const handlePreviewClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement
    // 查找包含btn-preview类的按钮或其父元素
    const previewButton = target.classList?.contains('btn-preview')
      ? target
      : target.closest('.btn-preview')

    if (previewButton && previewButton.getAttribute('data-block-id')) {
      event.stopPropagation()
      event.preventDefault()

      const blockId = previewButton.getAttribute('data-block-id')
      if (blockId) {
        const codeBlock = document.getElementById(blockId)
        if (codeBlock) {
          const codeElement = codeBlock.querySelector('code')
          if (codeElement && codeElement.textContent) {
            // 更新当前点击的内容到全局存储，标记类型
            globalStore.updateHtmlContent(codeElement.textContent || '', 'html')
            // 打开预览器，由预览器自动收集所有代码块
            globalStore.updateHtmlPreviewer(true)
          }
        }
      }
    }
  }

  document.addEventListener('click', handlePreviewClick)

  // 添加对markdown图片的预览监听
  const handleMdImagePreview = (event: CustomEvent) => {
    const { src } = event.detail
    openSingleImagePreview(src)
  }

  document.addEventListener('previewMdImage', handleMdImagePreview as EventListener)

  onUnmounted(() => {
    document.removeEventListener('click', handlePreviewClick)
    document.removeEventListener('previewMdImage', handleMdImagePreview as EventListener)
  })

  // 初始化代码块样式
  nextTick(() => {
    const container = textRef.value
    if (container) {
      const codeElements = container.querySelectorAll('code.code-content-scrollable')
      codeElements.forEach(element => {
        const codeEl = element as HTMLElement
        const parentDiv = codeEl.parentElement

        // 设置样式
        codeEl.style.maxHeight = '50vh'
        codeEl.style.overflowY = 'auto'
        codeEl.style.display = 'block'
        codeEl.style.whiteSpace = 'pre'
        codeEl.style.minWidth = '0'
        codeEl.style.maxWidth = '100%'
        codeEl.style.overflowX = 'auto'

        if (parentDiv && parentDiv.classList.contains('custom-scrollbar')) {
          parentDiv.style.overflowX = 'auto'
          parentDiv.style.maxWidth = '100%'
        }

        // 确保滚动条可见
        setTimeout(() => {
          // 强制重新计算布局，确保滚动条显示
          codeEl.style.overflow = 'hidden'
          void codeEl.offsetHeight // 触发回流
          codeEl.style.overflowY = 'auto'

          if (parentDiv) {
            void parentDiv.offsetHeight
            parentDiv.style.overflowX = 'auto'
          }
        }, 100)
      })
    }
  })

  // 停止音频播放并清理资源
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }

  if (speechSynthesisUtterance) {
    window.speechSynthesis.cancel()
  }

  // 监听 code button 点击事件
  setTimeout(() => {
    // 预览按钮
    const htmlPreviewBtns = document.querySelectorAll('.btn-preview:not(.preview-markmap)')
    const markmapPreviewBtns = document.querySelectorAll('.preview-markmap')
    const copyBtns = document.querySelectorAll('.btn-copy')

    // HTML预览按钮点击处理
    htmlPreviewBtns.forEach(btn => {
      btn.addEventListener('click', (e: Event) => {
        // 获取代码块ID
        const blockId = (e.currentTarget as HTMLElement).dataset.blockId || ''
        const codeBlock = document.getElementById(blockId)
        if (codeBlock && codeBlock.querySelector('code')) {
          const code = codeBlock.querySelector('code')?.textContent || ''
          globalStore.updateHtmlContent(code, 'html')
          globalStore.updateHtmlPreviewer(true)
        }
      })
    })

    // Markmap预览按钮点击处理
    markmapPreviewBtns.forEach(btn => {
      btn.addEventListener('click', (e: Event) => {
        // 获取代码块ID
        const blockId = (e.currentTarget as HTMLElement).dataset.blockId || ''
        const codeBlock = document.getElementById(blockId)
        if (codeBlock && codeBlock.querySelector('code')) {
          const code = codeBlock.querySelector('code')?.textContent || ''
          globalStore.updateHtmlContent(code, 'markmap')
          globalStore.updateHtmlPreviewer(true)
        }
      })
    })

    // Copy button click handlers
    copyBtns.forEach(btn => {
      btn.addEventListener('click', (e: Event) => {
        const blockId = (e.currentTarget as HTMLElement).dataset.blockId || ''
        const codeBlock = document.getElementById(blockId)
        if (codeBlock && codeBlock.querySelector('code')) {
          const code = codeBlock.querySelector('code')?.textContent || ''
          // 复制代码到剪贴板
          navigator.clipboard.writeText(code).then(() => {
            const copyBtn = e.currentTarget as HTMLElement
            // const copyIcon = copyBtn.querySelector('.copy-icon')
            const originalHTML = copyBtn.innerHTML

            // 显示成功状态
            copyBtn.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" class="text-green-500">
                  <path fill-rule="evenodd" clip-rule="evenodd" d="M4 24L9 19L19 29L39 9L44 14L19 39L4 24Z" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                已复制
              `

            // 2秒后恢复原样
            setTimeout(() => {
              copyBtn.innerHTML = originalHTML
            }, 2000)
          })
          // .catch(() => {
          //   // 复制失败处理
          //   alert('复制失败，请手动复制')
          // })
        }
      })
    })
  }, 100)
})

onUnmounted(() => {
  stopReasoningTips()
  if (mermaidTimer) {
    clearTimeout(mermaidTimer)
    mermaidTimer = null
  }
})

function openImagePreview(index: number) {
  // 通知父组件打开预览器
  if (onOpenImagePreviewer && imageUrlArray.value.length > 0) {
    onOpenImagePreviewer(imageUrlArray.value, index)
  }
}

// 打开单张图片预览
function openSingleImagePreview(src: string) {
  if (onOpenImagePreviewer) {
    onOpenImagePreviewer([src], 0)
  }
}
</script>

<template>
  <div class="text-wrap flex w-full flex-col px-1 group">
    <!-- 网页搜索结果 -->
    <div v-if="!isUserMessage && (searchResult.length || (loading && usingNetwork))" class="mb-2">
      <div
        @click="showSearchResult = !showSearchResult"
        class="text-gray-600 mb-1 cursor-pointer items-center btn-pill glow-container"
      >
        <Sphere theme="outline" size="18" class="mr-1 flex" />
        <span v-if="searchResult.length">已浏览 {{ searchResult.length }} 个网页</span>
        <span v-else-if="loading && usingNetwork">联网搜索中</span>
        <LoadingOne v-if="loading && usingNetwork" class="rotate-icon flex mx-1" />
        <Down v-if="!showSearchResult && searchResult.length" size="18" class="ml-1 flex" />
        <Up v-else-if="searchResult.length" size="18" class="ml-1 flex" />
        <div v-if="loading && usingNetwork && !searchResult.length" class="glow-band"></div>
      </div>

      <transition name="fold">
        <div
          v-if="showSearchResult && searchResult.length"
          class="text-gray-600 dark:text-gray-400 border-l-2 pl-5 mt-2"
        >
          <div class="flex flex-col gap-2 text-base">
            <a
              v-for="(item, index) in searchResult"
              :key="index"
              :href="item.link"
              target="_blank"
              class="hover:underline mr-2 text-gray-700 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-300"
            >
              {{ index + 1 }}. {{ item.title.slice(0, 80)
              }}{{ item.title.length > 80 ? '...' : '' }}
              <span v-if="item.media">[{{ item.media }}]</span>
            </a>
          </div>
        </div>
      </transition>
    </div>

    <!-- 深度思考内容 -->
    <div v-if="showThinkingPill" class="mb-2">
      <div
        :class="[
          'reasoning-pill glow-container',
          { 'reasoning-pill--active': shouldAnimateThinking },
        ]"
      >
        <TwoEllipses theme="outline" size="18" class="flex icon" />
        <span class="label">{{ text || !loading ? '已深度思考' : '深度思考中' }}</span>
        <LoadingOne
          v-if="
            (loading && usingDeepThinking && !hasReasoning) || (!text && loading && hasReasoning)
          "
          class="rotate-icon flex mx-1 text-base"
        />
        <div class="reasoning-preview" v-text="reasoningPreview"></div>
      </div>
    </div>

    <!-- 主文本内容 -->
    <div ref="textRef" class="flex w-full">
      <!-- AI回复内容 -->
      <div v-if="!isUserMessage" class="w-full">
        <span
          v-if="loading && !text && !hasReasoning"
          class="inline-block w-3.5 h-3.5 ml-0.5 align-middle rounded-full animate-breathe dark:bg-gray-100 bg-gray-950"
        ></span>
        <div
          :class="[
            'markdown-body text-gray-950 dark:text-gray-100',
            { 'markdown-body-generate': loading || !text },
          ]"
          v-html="text"
        ></div>
      </div>

      <!-- 用户消息内容 -->
      <div
        v-else
        class="flex justify-end w-full"
        :class="[isMobile ? 'pl-20' : 'pl-28']"
        style="max-width: 100%"
      >
        <!-- 编辑模式 -->
        <div
          v-if="isEditable"
          class="p-3 rounded-2xl w-full bg-opacity dark:bg-gray-750 break-words"
          style="max-width: 100%"
        >
          <textarea
            v-model="editableContent"
            class="min-w-full text-base resize-none overflow-y-auto bg-transparent whitespace-pre-wrap text-gray-950 dark:text-gray-100"
            style="max-height: 60vh"
            @input="adjustTextareaHeight"
            ref="textarea"
          ></textarea>
          <div class="flex justify-end mt-3">
            <!-- 取消按钮 -->
            <div class="group relative">
              <button
                type="button"
                class="btn-floating btn-md mx-3"
                :class="{
                  'h-8 w-8': isMobile,
                  'bg-[#F4F4F4] border-[#F4F4F4] dark:bg-[#2f2f2f] dark:border-[#2f2f2f]': isMobile,
                }"
                @click="cancelEdit"
                aria-label="取消"
              >
                <Close size="16" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-top">取消</div>
            </div>
            <!-- 发送按钮 -->
            <div class="group relative">
              <button
                type="button"
                class="btn-send"
                :class="{ 'h-8 w-8': isMobile }"
                @click="handleEditMessage"
                aria-label="发送"
              >
                <Send size="16" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-top">发送</div>
            </div>
          </div>
        </div>
        <!-- 只读模式 -->
        <div
          v-else
          class="p-3 rounded-2xl text-base bg-opacity dark:bg-gray-750 break-words whitespace-pre-wrap text-gray-950 dark:text-gray-100"
          v-text="text"
          style="max-width: 100%"
        />
      </div>
    </div>

    <div
      v-if="isUserMessage && parsedUserUploadedFiles.length"
      class="mt-2 w-full flex justify-end"
      :class="[isMobile ? 'pl-20' : 'pl-28']"
    >
      <div class="flex w-full max-w-[560px] flex-col items-end gap-2">
        <button
          v-for="(file, index) in parsedUserUploadedFiles"
          :key="`${file.url}-${index}`"
          type="button"
          class="group inline-flex w-full max-w-[360px] items-center gap-3 rounded-2xl border border-gray-300/80 bg-white/95 px-3 py-2 text-left shadow-sm transition-colors hover:border-gray-400 dark:border-gray-700 dark:bg-[#1f1f1f] dark:hover:border-gray-600"
          :class="{
            'cursor-wait opacity-80': isDownloadingFile(file.url),
          }"
          :title="file.name"
          :disabled="isDownloadingFile(file.url)"
          @click="downloadUserUploadedFile(file)"
        >
          <div
            class="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-xs font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-300"
          >
            {{ getUserFileTypeLabel(file).replace(' 文件', '') }}
          </div>
          <div class="min-w-0 flex-1">
            <div class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
              {{ file.name }}
            </div>
            <div class="truncate text-xs text-gray-500 dark:text-gray-400">
              {{ isDownloadingFile(file.url) ? '下载中...' : getUserFileTypeLabel(file) }}
            </div>
          </div>
        </button>
      </div>
    </div>

    <!-- 图片显示部分 -->
    <div
      v-if="imageUrlArray && imageUrlArray.length > 0 && isImageUrl"
      :class="['my-2 w-full flex', isUserMessage ? 'justify-end' : 'justify-start']"
    >
      <div
        class="gap-2"
        :style="{
          display: 'grid',
          gridTemplateColumns: `repeat(${Math.min(imageUrlArray.length, 4)}, 1fr)`,
          gridAutoRows: '1fr',
          maxWidth: isUserMessage ? (isMobile ? '60vw' : '40vw') : '80vw',
          width: 'auto',
        }"
      >
        <img
          v-for="(file, index) in imageUrlArray"
          :key="index"
          :src="file"
          alt="图片"
          @click="openImagePreview(index)"
          class="rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-90 transition-opacity w-auto h-auto max-h-[30vh] object-cover"
          :style="{
            aspectRatio: '1/1',
            width: '160px',
            height: '160px',
          }"
        />
      </div>
    </div>

    <div v-if="!isUserMessage && parsedFileVectorFiles.length" class="mt-3 flex w-full">
      <div
        class="w-full rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-[#111111] px-3 py-3"
      >
        <div class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">下载文件</div>
        <div class="flex flex-wrap gap-2">
          <button
            v-for="(file, index) in parsedFileVectorFiles"
            :key="`${file.path}-${index}`"
            type="button"
            class="btn-pill inline-flex items-center"
            :class="{ 'opacity-70 cursor-not-allowed': isDownloadingFile(file.path) }"
            :disabled="isDownloadingFile(file.path)"
            @click="downloadAcademicFile(file)"
            :title="file.name"
          >
            <span class="truncate max-w-[260px]">{{ file.name }}</span>
            <LoadingOne v-if="isDownloadingFile(file.path)" class="ml-1 rotate-icon flex" />
          </button>
        </div>
      </div>
    </div>

    <!-- 后续提问建议 -->
    <div
      v-if="promptReference && !isUserMessage && isLast"
      class="flex-row transition-opacity duration-500"
    >
      <button
        v-for="(item, index) in promptReference
          ? promptReference
              .match(/{(.*?)}/g)
              ?.map((str: string | any[]) => str.slice(1, -1))
              .slice(0, 3)
          : []"
        :key="index"
        @click="handleMessage(item as string)"
        class="flex items-center overflow-hidden btn-pill py-4 px-4 mt-3"
      >
        {{ item }}
        <ArrowRight class="ml-1" />
      </button>
    </div>

    <!-- 操作按钮区域 -->
    <div
      :class="[
        'flex transition-opacity duration-300 text-gray-700',
        buttonGroupClass,
        { 'justify-end': isUserMessage },
      ]"
    >
      <div class="mt-2 flex group">
        <!-- 复制按钮 -->
        <div v-if="!isEditable" class="relative group-btn">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="handleCopy"
            aria-label="复制"
          >
            <Copy />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">{{ t('chat.copy') }}</div>
        </div>

        <!-- 删除按钮 -->
        <div v-if="!isEditable" class="relative group-btn">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="handleDelete"
            aria-label="删除"
          >
            <Delete />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">{{ t('chat.delete') }}</div>
        </div>

        <!-- 编辑按钮 -->
        <div v-if="isUserMessage && !isEditable" class="relative group-btn">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="handleEditMessage"
            aria-label="编辑"
          >
            <Edit />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">编辑</div>
        </div>

        <!-- 重新生成按钮 -->
        <div v-if="!isUserMessage" class="relative group-btn">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            :class="{ 'opacity-60 cursor-not-allowed': isStreamIn || loading }"
            :disabled="isStreamIn || loading"
            @click="triggerRegenerate"
            aria-label="重新生成"
          >
            <Refresh />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">重新生成</div>
        </div>

        <!-- 朗读按钮 -->
        <div v-if="!isUserMessage && !isHideTts" class="relative group-btn">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="playOrPause"
            aria-label="朗读"
          >
            <VoiceMessage v-if="playbackState === 'paused'" />
            <Rotation v-if="playbackState === 'loading'" class="rotate-icon" />
            <PauseOne v-else-if="playbackState === 'playing'" />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">
            {{
              playbackState === 'playing'
                ? t('chat.pause')
                : playbackState === 'loading'
                  ? t('chat.loading')
                  : t('chat.readAloud')
            }}
          </div>
        </div>

        <!-- 浏览器朗读按钮 -->
        <div v-if="!isUserMessage && isHideTts" class="relative group-btn">
          <button
            class="btn-icon btn-sm btn-icon-action mx-1"
            @click="handleBrowserTts"
            aria-label="浏览器朗读"
          >
            <Sound v-if="browserTtsState === 'paused'" />
            <PauseOne v-else-if="browserTtsState === 'playing'" />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">
            {{ browserTtsState === 'playing' ? '停止' : '朗读' }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="less">
/* 
  注意：主要的highlight.js主题覆盖已移至 injectThemeStyles 函数
  此处只保留动画和其他非主题相关样式
*/

@keyframes rotateAnimation {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.rotate-icon {
  animation: rotateAnimation 3s linear infinite;
  transform-origin: center;
}

.hidden {
  display: none !important;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.new-text-fade-in {
  animation: fadeIn 0.5s ease-in;
  animation-fill-mode: forwards;
  display: inline;
}

@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
    /* 原始尺寸 */
    opacity: 1;
    /* 完全不透明 */
  }

  50% {
    transform: scale(0.5);
    /* 缩小到50%的尺寸 */
    opacity: 0.5;
    /* 半透明 */
  }
}

.animate-breathe {
  animation: breathe 2s infinite ease-in-out;
}

/* 折叠/展开动画 */
.fold-enter-active,
.fold-leave-active {
  transition: all 0.3s ease;
  max-height: 1000px;
  opacity: 1;
  overflow: hidden;
}

.fold-enter-from,
.fold-leave-to {
  max-height: 0;
  opacity: 0;
  overflow: hidden;
}

/* 为响应结果折叠添加特殊处理 */
pre.fold-enter-active,
pre.fold-leave-active {
  transition: all 0.25s ease;
  max-height: 500px;
  opacity: 1;
  margin-top: 0.5rem;
}

pre.fold-enter-from,
pre.fold-leave-to {
  max-height: 0;
  opacity: 0;
  margin-top: 0;
}

/* 使用全局样式配置，在global.less中定义 */

/* Markdown样式 */
.markdown-body {
  background-color: transparent;
  // font-size: 1rem;
  max-width: 100%;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;

  // p {
  //   white-space: pre-wrap;
  // }

  // ol {
  //   list-style-type: decimal;
  // }

  // ul {
  //   list-style-type: disc;
  // }

  pre code,
  pre tt {
    line-height: 1.65;
  }
}

.markdown-body table {
  width: 100%;
  max-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  border: 1px solid #d6d9e0;
  border-radius: 12px;
  overflow: hidden;
  font-size: 0.97rem;
  background: #ffffff;
}

.markdown-body th,
.markdown-body td {
  border-right: 1px solid #e6e8ee;
  border-bottom: 1px solid #e6e8ee;
  padding: 10px 12px;
  vertical-align: top;
}

.markdown-body th:last-child,
.markdown-body td:last-child {
  border-right: none;
}

.markdown-body tr:last-child td {
  border-bottom: none;
}

.markdown-body thead th {
  background: #f5f7fb;
  font-weight: 700;
}

.dark .markdown-body table {
  border-color: #374151;
  background: #111827;
}

.dark .markdown-body th,
.dark .markdown-body td {
  border-right-color: #374151;
  border-bottom-color: #374151;
}

.dark .markdown-body thead th {
  background: #1f2937;
}

.markdown-body table {
  display: block;
  overflow-x: auto;
}

.markdown-body img,
.markdown-body pre,
.markdown-body code {
  max-width: 100%;
}

.markdown-body .mermaid-wrapper {
  position: relative;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  padding: 0.5rem 0;
}

.markdown-body .mermaid-wrapper svg {
  max-width: 100%;
  height: auto;
}

.markdown-body .mermaid-wrapper svg[data-download-enabled='1'] {
  cursor: pointer;
}

.markdown-body .mermaid-download-btn {
  position: absolute;
  top: 0.15rem;
  right: 0.15rem;
  border: 1px solid #d1d5db;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.95);
  color: #111827;
  font-size: 0.75rem;
  line-height: 1.1;
  padding: 0.28rem 0.6rem;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
  transform: translateY(-2px);
  z-index: 3;
}

.markdown-body .mermaid-wrapper:hover .mermaid-download-btn,
.markdown-body .mermaid-wrapper:focus-within .mermaid-download-btn {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0);
}

.markdown-body .mermaid-download-btn:hover {
  background: #f9fafb;
}

.markdown-body .mermaid-download-btn:focus-visible {
  outline: 2px solid #111827;
  outline-offset: 1px;
}

.dark .markdown-body .mermaid-download-btn {
  border-color: #4b5563;
  background: rgba(17, 24, 39, 0.95);
  color: #f3f4f6;
}

.dark .markdown-body .mermaid-download-btn:hover {
  background: #1f2937;
}

.markdown-body .mermaid-fallback {
  margin: 0;
  border-radius: 0.75rem;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  padding: 0.75rem;
  white-space: pre-wrap;
}

.dark .markdown-body .mermaid-fallback {
  border-color: #374151;
  background: #111827;
}

/* 深色模式滚动条 */
.dark .custom-scrollbar:hover::-webkit-scrollbar-thumb {
  background-color: rgba(107, 114, 128, 0.9);
}

/* 代码容器高度控制 */
.code-container {
  transition:
    max-height 0.3s ease,
    overflow 0.3s ease;
  overflow: auto;
  max-width: 100% !important;
  overflow-x: auto !important;
  width: 100% !important;
}

/* 生成完成状态下的代码容器限制高度 */
.markdown-body:not(.markdown-body-generate) .code-container {
  max-height: 50vh;
  overflow-y: auto;
}

/* 生成中状态下的代码容器不限制高度 */
.markdown-body-generate .code-container {
  max-height: none;
  overflow-y: visible;
}

/* 加载动画样式 */

/* 深度思考胶囊样式 */
.reasoning-pill {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.75rem;
  padding: 10px 14px;
  min-height: 44px;
  max-width: min(620px, 80vw);
  overflow: hidden;
  border-radius: 999px;
  border: 1px solid #f2f2f2;
  background: #ffffff;
  box-shadow: 0 8px 18px rgba(8, 8, 8, 0.06);
  color: #080808;
}

.dark .reasoning-pill {
  border-color: rgba(255, 255, 255, 0.12);
  background: #080808;
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28);
  color: #ffffff;
}

.reasoning-pill--active {
  border-color: #080808;
  background: #ffffff;
  animation: reasoningPulse 1.9s ease-in-out infinite;
}

.reasoning-pill--active::after {
  content: '';
  position: absolute;
  inset: -30% 0;
  background: linear-gradient(120deg, transparent, rgba(255, 255, 255, 0.6), transparent);
  transform: translateX(-120%);
  animation: reasoningSweep 3.2s linear infinite;
  opacity: 0.6;
  pointer-events: none;
}

.dark .reasoning-pill--active {
  border-color: #ffffff;
  background: #080808;
}

.dark .reasoning-pill--active::after {
  background: linear-gradient(120deg, transparent, rgba(255, 255, 255, 0.15), transparent);
}

.reasoning-pill .icon {
  color: inherit;
}

.reasoning-pill .label {
  font-weight: 600;
  color: inherit;
}

.reasoning-preview {
  flex: 1;
  min-width: 0;
  font-size: 0.95rem;
  line-height: 1.4;
  color: rgba(8, 8, 8, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dark .reasoning-preview {
  color: rgba(255, 255, 255, 0.7);
}

@keyframes reasoningPulse {
  0%,
  100% {
    box-shadow:
      0 8px 18px rgba(8, 8, 8, 0.04),
      0 0 0 0 rgba(8, 8, 8, 0);
  }
  50% {
    box-shadow:
      0 12px 26px rgba(8, 8, 8, 0.18),
      0 0 18px 4px rgba(8, 8, 8, 0.25);
  }
}

@keyframes reasoningSweep {
  0% {
    transform: translateX(-120%);
  }
  100% {
    transform: translateX(120%);
  }
}

@keyframes reasoningGradient {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}
</style>
