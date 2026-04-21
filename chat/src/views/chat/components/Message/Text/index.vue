<script lang="ts" setup>
import { fetchTtsAPIProcess } from '@/api'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import { copyText } from '@/utils/format'
import { message } from '@/utils/message'
import { sanitizeUserFacingErrorMessage } from '@/utils/request/sanitizeErrorMessage'
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
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

let mermaidModulePromise: Promise<typeof import('mermaid')> | null = null
const MESSAGE_RENDER_CACHE_LIMIT = 400
const messageRenderCache = new Map<string, string>()

const getMermaidModule = async () => {
  mermaidModulePromise ||= import('mermaid')
  return (await mermaidModulePromise).default
}

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

const rememberRenderedMessage = (key: string, value: string) => {
  if (!key) return value
  if (messageRenderCache.has(key)) {
    messageRenderCache.delete(key)
  }
  messageRenderCache.set(key, value)
  if (messageRenderCache.size > MESSAGE_RENDER_CACHE_LIMIT) {
    const oldestKey = messageRenderCache.keys().next().value
    if (oldestKey) {
      messageRenderCache.delete(oldestKey)
    }
  }
  return value
}

const hashMessageContent = (input: string) => {
  let hash = 0
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0
  }
  return Math.abs(hash).toString(36)
}

interface Props {
  chatId?: number | string
  index: number
  isUserMessage?: boolean
  isWorkflowMessage?: boolean
  modelName?: string
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
  thinkingPreview?: string
  fileAnalysisProgress?: number
  useFileSearch?: boolean
  taskData?: any
  stepName?: string
  workflowProgress?: number
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
const handleEditConversation = inject<any>('handleEditConversation')
const getActiveConversationModelInfo = inject<
  () => {
    model?: string
    modelName?: string
    modelType?: number
    modelAvatar?: string
  }
>('getActiveConversationModelInfo', () => ({}))
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
const showWorkflowDetails = ref(false)

let currentAudio: HTMLAudioElement | null = null
let speechSynthesisUtterance: SpeechSynthesisUtterance | null = null
let mermaidTimer: ReturnType<typeof setTimeout> | null = null
let mermaidTheme = ''

const cleanupLeakedMermaidArtifacts = () => {
  // mermaid 在语法异常时可能把临时渲染节点遗留在 body，造成“炸弹”错误图常驻页面
  document
    .querySelectorAll('body > div[id^="dmermaid-"], body > iframe[id^="imermaid-"]')
    .forEach(node => node.remove())
}

const getMermaidDownloadBaseName = () => {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(
    now.getHours()
  )}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  return `YutoAI-mindmap-${stamp}`
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
  const matched = String(value)
    .trim()
    .match(/^\s*([\d.]+)/)
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
  const mermaid = await getMermaidModule()
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
        if (errPayload?.message) {
          errMsg = sanitizeUserFacingErrorMessage(errPayload.message, response.status, '下载失败')
        }
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
    message()?.error(sanitizeUserFacingErrorMessage(error?.message || '', 0, '下载失败'))
  } finally {
    setDownloadingFile(pathValue, false)
  }
}

const parseDownloadErrorMessage = async (response: Response, fallback: string) => {
  try {
    const payload = await response.clone().json()
    const message = String(payload?.message || '').trim()
    if (message) return sanitizeUserFacingErrorMessage(message, response.status, fallback)
  } catch (_error) {}
  try {
    const text = String(await response.clone().text()).trim()
    if (text) {
      return sanitizeUserFacingErrorMessage(
        text.length > 120 ? `${text.slice(0, 120)}...` : text,
        response.status,
        fallback
      )
    }
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
    message()?.error(
      sanitizeUserFacingErrorMessage(error?.message || '', 0, '文件下载失败，请稍后重试')
    )
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
      chatId: Number(props.chatId),
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
      if (
        /^(?:%%|style\b|classDef\b|class\b|click\b|linkStyle\b|subgraph\b|end\b|direction\b)/i.test(
          text
        )
      )
        return true
      if (
        /^(?:[A-Za-z][A-Za-z0-9_]*\s*(?:-->|==>|-.->|---)|[A-Za-z][A-Za-z0-9_]*\s*[\[\(\{])/i.test(
          text
        )
      )
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
const markdownTableLinePattern = /^\s*\|.*\|\s*$/
const leakedPolishControlCellPatterns = [
  /^(?:列名|表头)(?:必须)?(?:严格)?为$/i,
  /^表格列名(?:必须)?(?:严格)?为$/i,
  /^(?:确保|每一行只允许)每?一行只描述一个局部修改$/i,
  /^不要把多个句子或多处改动合并成一行$/i,
  /^每个单元格(?:内容)?(?:将)?尽量简短只摘录必要片段(?:不要整段照抄)?$/i,
  /^第三列只解释这一处修改说明要简洁准确$/i,
  /Markdown表格/i,
  /^请先用中文提供文本的更正版本然后输出一个Markdown表格$/i,
  /^我将首先用中文提供文本的更正版本然后输出一个Markdown表格$/i,
]
const normalizeLeakedPolishControlText = (value: string) =>
  String(value || '')
    .replace(/[‘’“”"'`*_]/g, '')
    .replace(/[：:；;，,。.!！?？]/g, '')
    .replace(/\s+/g, '')

const isLeakedPolishControlCell = (value: string) => {
  const normalized = normalizeLeakedPolishControlText(value)
  if (!normalized) return false
  return leakedPolishControlCellPatterns.some(pattern => pattern.test(normalized))
}

const splitLeakedPolishTableCells = (line: string) => {
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

const stripLeakedPolishTableInstructionRows = (input: string) => {
  const source = String(input || '')
  if (!source) return ''
  const lines = source.split('\n')
  const output: string[] = []
  const seenRows = new Set<string>()

  for (const line of lines) {
    const trimmed = String(line || '').trim()
    if (!trimmed) {
      output.push(line)
      continue
    }
    if (
      /Markdown\s*表格/i.test(trimmed) &&
      /(修改前原文片段|每一行只描述一个局部修改|每个单元格(?:内容)?(?:将)?尽量简短)/.test(trimmed)
    ) {
      continue
    }
    if (!trimmed.startsWith('|')) {
      if (isLeakedPolishControlCell(trimmed)) continue
      output.push(line)
      continue
    }

    const cells = splitLeakedPolishTableCells(trimmed)
    if (cells.length === 3) {
      if (isLeakedPolishControlCell(cells[0]) || isLeakedPolishControlCell(cells[1])) {
        continue
      }
      const normalizedRow = `| ${cells.join(' | ')} |`
      const isHeader =
        cells[0] === '修改前原文片段' && cells[1] === '修改后片段' && cells[2] === '修改原因与解释'
      if (!isHeader && !tableSeparatorPattern.test(trimmed)) {
        if (seenRows.has(normalizedRow)) continue
        seenRows.add(normalizedRow)
      }
      output.push(normalizedRow)
      continue
    }

    output.push(line)
  }

  return output.join('\n').replace(/\n{4,}/g, '\n\n\n')
}

const stripLeakedPolishTableInstructions = (input: string) =>
  (() => {
    const source = String(input || '')
    if (!source) return ''
    if (
      !/(修改前原文片段\s*\|.*修改原因与解释|Markdown\s*表格|第三列只解释这一处修改|每一行只允许描述一个局部修改|每个单元格(?:内容)?(?:将)?尽量简短|(?:列名|表头)(?:必须)?(?:严格)?为)/i.test(
        source
      )
    ) {
      return source
    }
    const normalized = source
      .replace(
        /^[^\S\r\n>]*\|?\s*(?:列名|表头)(?:必须)?(?:严格)?为[:：]\s*\|?\s*修改前原文片段\s*\|\s*修改后片段\s*\|\s*修改原因与解释\s*\|?\s*$/gim,
        ''
      )
      .replace(
        /(?:列名|表头)(?:必须)?(?:严格)?为[:：]\s*\|?\s*修改前原文片段\s*\|\s*修改后片段\s*\|\s*修改原因与解释\s*\|?/gi,
        ''
      )
      .replace(
        /^[^\n]*Markdown\s*表格[^\n]*(?:修改前原文片段|每一行只描述一个局部修改|每个单元格(?:内容)?(?:将)?尽量简短)[^\n]*$/gim,
        ''
      )
      .replace(
        /(?:然后)?输出一个\s*Markdown\s*表格(?:列名|表头)?(?:必须)?(?:严格)?为[:：]?\s*`?\s*修改前原文片段\s*\|\s*修改后片段\s*\|\s*修改原因与解释\s*`?/gi,
        ''
      )
      .replace(/表格(?:会)?按[“"'`]?小句\/短片段[”"'`]?的粒度拆分[，,、 ]*/gi, '')
      .replace(/(?:确保每一行只描述一个局部修改|每一行只允许描述一个局部修改)[，,、 ]*/gi, '')
      .replace(
        /每个单元格(?:内容)?(?:将)?尽量简短，只摘录必要片段(?:，?不要整段照抄)?[；;，,、 ]*/gi,
        ''
      )
      .replace(/第三列只解释这一处修改，说明要简洁准确[:：]?\s*/gi, '')
    return stripLeakedPolishTableInstructionRows(normalized)
  })()

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

  const normalizedSource = source
    .split('\n')
    .map(line => toAsciiTableBars(line))
    .join('\n')
  const polishReasonTablePattern =
    /\|\s*修改前原文片段\s*\|\s*修改后片段\s*\|\s*修改原因与解释\s*\|/m
  if (polishReasonTablePattern.test(normalizedSource)) {
    return normalizedSource.replace(/([^\n])\s*(\|[^\n]*修改前原文片段[^\n]*\|)/g, '$1\n\n$2')
  }

  const sourceLines = normalizedSource.split('\n')

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
        const canSplitNormalHeader =
          maybeHeaderCells.length >= 2 && tableSeparatorPattern.test(next)
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
          const nextRow =
            nextRowIndex < tableLines.length ? String(tableLines[nextRowIndex] || '') : ''
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
          const isHeaderPair =
            /^(?:文件路径|filepath)$/i.test(left) && /^(?:功能描述|description)$/i.test(right)
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
      while (nextIndex < sourceLines.length && !String(sourceLines[nextIndex] || '').trim())
        nextIndex += 1
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

const splitStablePolishTableCells = (line: string) => {
  const text = String(line || '').trim()
  if (!text.startsWith('|') || !text.endsWith('|')) return []
  const body = text.slice(1, -1)
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

type StablePolishRow = {
  before: string
  after: string
  reason: string
}

const getStablePolishRowKey = (before: string, after: string) =>
  `${normalizeLeakedPolishControlText(before)}\u0000${normalizeLeakedPolishControlText(after)}`

const stablePolishReasonCuePattern =
  /^(?:将|把|增加|删除|改为|省略|直接使用|体现|突出|避免|保留|添加|调整|补齐|更换|优化|用词|语气|强调|通过|采用|概括|引出|去除(?:冗余)?|简化(?:表达|表述)|删除冗余描述|合并和简化要求|此句表达已较清晰|未作修改|补充[“"]|用[“"]|为[“"]|使用(?:更|[“"'A-Za-z])|改为主动建议句式|“[^”]+”比“[^”]+”|“[^”]+”改为“[^”]+”|“)/

const isLikelyStablePolishReasonSegment = (value: string) =>
  stablePolishReasonCuePattern.test(String(value || '').trim())

const isLikelyStablePolishSnippetSegment = (value: string) => {
  const text = String(value || '').trim()
  if (!text) return false
  if (isLeakedPolishControlCell(text)) return false
  return !isLikelyStablePolishReasonSegment(text)
}

const explodeMergedStablePolishRows = (candidate: StablePolishRow) => {
  const reason = String(candidate.reason || '').trim()
  const segments = reason
    .split(/\s+/)
    .map(item => String(item || '').trim())
    .filter(Boolean)
  if (segments.length < 4) return [{ ...candidate, reason }]

  const rows: StablePolishRow[] = []
  const currentReasonParts = [segments[0]]
  let cursor = 1

  while (cursor < segments.length) {
    const before = String(segments[cursor] || '').trim()
    const after = String(segments[cursor + 1] || '').trim()
    const reasonStart = String(segments[cursor + 2] || '').trim()
    const hasEmbeddedRow =
      cursor + 2 < segments.length &&
      isLikelyStablePolishSnippetSegment(before) &&
      isLikelyStablePolishSnippetSegment(after) &&
      isLikelyStablePolishReasonSegment(reasonStart)

    if (!hasEmbeddedRow) {
      currentReasonParts.push(before)
      cursor += 1
      continue
    }

    const reasonParts = [reasonStart]
    cursor += 3
    while (cursor < segments.length) {
      const nextBefore = String(segments[cursor] || '').trim()
      const nextAfter = String(segments[cursor + 1] || '').trim()
      const nextReasonStart = String(segments[cursor + 2] || '').trim()
      const nextIsEmbeddedRow =
        cursor + 2 < segments.length &&
        isLikelyStablePolishSnippetSegment(nextBefore) &&
        isLikelyStablePolishSnippetSegment(nextAfter) &&
        isLikelyStablePolishReasonSegment(nextReasonStart)
      if (nextIsEmbeddedRow) break
      reasonParts.push(nextBefore)
      cursor += 1
    }

    rows.push({
      before,
      after,
      reason: reasonParts.join(' ').trim(),
    })
  }

  return [
    {
      before: candidate.before,
      after: candidate.after,
      reason: currentReasonParts.join(' ').trim(),
    },
    ...rows,
  ].filter(row => row.before && row.after && row.reason)
}

const extractEmbeddedStablePolishRow = (reason: string) => {
  const segments = String(reason || '')
    .split(/\s+/)
    .map(item => String(item || '').trim())
    .filter(Boolean)
  if (segments.length < 4) return null

  let tailIndex = -1
  for (let idx = 2; idx < segments.length; idx += 1) {
    if (stablePolishReasonCuePattern.test(segments[idx])) {
      tailIndex = idx
      break
    }
  }
  if (tailIndex < 3) return null

  const middle = segments.slice(1, tailIndex)
  let splitIndex = -1
  if (middle.length === 2) {
    splitIndex = 1
  } else {
    for (let idx = 1; idx < middle.length; idx += 1) {
      const previous = middle.slice(0, idx).join(' ')
      const current = String(middle[idx] || '')
      if (/[A-Za-z]/.test(current) && !/[A-Za-z]/.test(previous)) {
        splitIndex = idx
        break
      }
    }
    if (splitIndex < 0 && middle.length === 3) {
      splitIndex = 1
    }
  }
  if (splitIndex < 1 || splitIndex >= middle.length) return null

  const before = middle.slice(0, splitIndex).join(' ').trim()
  const after = middle.slice(splitIndex).join(' ').trim()
  const leadingReason = String(segments[0] || '').trim()
  const tailReason = segments.slice(tailIndex).join(' ').trim()
  if (!before || !after || !leadingReason || !tailReason) return null
  return {
    leadingReason,
    embeddedRow: {
      before,
      after,
      reason: tailReason,
    } as StablePolishRow,
  }
}

const trimStablePolishReasonOverflow = (reason: string, upcomingRows: StablePolishRow[]) => {
  let output = String(reason || '').trim()
  if (!output) return ''
  let cutIndex = -1
  for (const row of upcomingRows) {
    const candidates = [row.before, row.after]
      .map(item => String(item || '').trim())
      .filter(Boolean)
    for (const candidate of candidates) {
      const idx = output.indexOf(candidate)
      if (idx > 0 && (cutIndex < 0 || idx < cutIndex)) {
        cutIndex = idx
      }
    }
    if (cutIndex > 0) break
  }
  if (cutIndex > 0) {
    output = output.slice(0, cutIndex).trim()
  }
  return output.replace(/\s{2,}/g, ' ')
}

const collectRecoveredStablePolishRows = (value: string) => {
  const normalized = stripLeakedPolishTableInstructions(
    normalizeMarkdownTables(String(value || ''))
  )
  if (!normalized.trim()) return [] as StablePolishRow[]

  const lines = normalized.split('\n').map(line => String(line || '').trimEnd())
  const headerIndex = lines.findIndex(line => {
    const headerCells = splitStablePolishTableCells(String(line || '').trim())
    return (
      headerCells.length === 3 &&
      headerCells[0] === '修改前原文片段' &&
      headerCells[1] === '修改后片段' &&
      headerCells[2] === '修改原因与解释'
    )
  })
  if (headerIndex < 0) return [] as StablePolishRow[]

  let separatorIndex = -1
  for (let idx = headerIndex + 1; idx < lines.length; idx += 1) {
    const trimmed = String(lines[idx] || '').trim()
    if (!trimmed) continue
    if (tableSeparatorPattern.test(trimmed)) {
      separatorIndex = idx
      break
    }
    break
  }
  if (separatorIndex < 0) return [] as StablePolishRow[]

  const rawRows: StablePolishRow[] = []
  for (let idx = separatorIndex + 1; idx < lines.length; idx += 1) {
    const trimmed = String(lines[idx] || '').trim()
    if (!trimmed || !markdownTableLinePattern.test(trimmed)) continue
    const rowCells = splitStablePolishTableCells(trimmed)
    if (rowCells.length !== 3) continue
    rawRows.push({
      before: String(rowCells[0] || '').trim(),
      after: String(rowCells[1] || '').trim(),
      reason: String(rowCells[2] || '').trim(),
    })
  }

  const recovered: StablePolishRow[] = []
  const seen = new Set<string>()
  for (let idx = 0; idx < rawRows.length; idx += 1) {
    const row = rawRows[idx]
    if (!row.before || !row.after) continue
    if (isLeakedPolishControlCell(row.before) || isLeakedPolishControlCell(row.after)) continue
    const pushRow = (candidate: StablePolishRow, depth = 0, skipSequentialSplit = false) => {
      if (depth > 4) return
      const reason = depth
        ? String(candidate.reason || '').trim()
        : trimStablePolishReasonOverflow(candidate.reason, rawRows.slice(idx + 1, idx + 4))
      if (!reason) return
      if (
        !candidate.before ||
        !candidate.after ||
        isLeakedPolishControlCell(candidate.before) ||
        isLeakedPolishControlCell(candidate.after)
      ) {
        return
      }
      if (!skipSequentialSplit) {
        const explodedRows = explodeMergedStablePolishRows({
          before: candidate.before,
          after: candidate.after,
          reason,
        })
        if (explodedRows.length > 1) {
          explodedRows.forEach(rowItem => pushRow(rowItem, depth + 1, true))
          return
        }
      }
      const splitResult = extractEmbeddedStablePolishRow(reason)
      const finalReason = String(splitResult?.leadingReason || reason).trim()
      const rowKey = getStablePolishRowKey(candidate.before, candidate.after)
      if (!seen.has(rowKey) && finalReason) {
        seen.add(rowKey)
        recovered.push({
          before: candidate.before,
          after: candidate.after,
          reason: finalReason,
        })
      }
      if (splitResult?.embeddedRow) {
        pushRow(splitResult.embeddedRow, depth + 1)
      }
    }
    pushRow(row)
  }

  return recovered
}

const buildRecoveredStablePolishTable = (value: string) => {
  const normalized = stripLeakedPolishTableInstructions(
    normalizeMarkdownTables(String(value || ''))
  )
  const rows = collectRecoveredStablePolishRows(normalized)
  if (!rows.length) return ''

  const lines = normalized.split('\n').map(line => String(line || '').trimEnd())
  const headerIndex = lines.findIndex(line => {
    const headerCells = splitStablePolishTableCells(String(line || '').trim())
    return (
      headerCells.length === 3 &&
      headerCells[0] === '修改前原文片段' &&
      headerCells[1] === '修改后片段' &&
      headerCells[2] === '修改原因与解释'
    )
  })
  const maybeTitle = String(lines[headerIndex - 1] || '').trim()
  const tableLines = [
    /^修改对照表[:：]?$/.test(maybeTitle) ? maybeTitle : '',
    '| 修改前原文片段 | 修改后片段 | 修改原因与解释 |',
    '| --- | --- | --- |',
    ...rows.map(row => `| ${row.before} | ${row.after} | ${row.reason} |`),
  ].filter(Boolean)
  return tableLines.join('\n')
}

const stripLeadingStablePolishOverflowBlock = (value: string) => {
  const lines = String(value || '').split('\n')
  let firstMeaningfulIndex = 0
  while (firstMeaningfulIndex < lines.length && !String(lines[firstMeaningfulIndex] || '').trim()) {
    firstMeaningfulIndex += 1
  }
  if (firstMeaningfulIndex >= lines.length) return ''
  if (
    !String(lines[firstMeaningfulIndex] || '')
      .trim()
      .startsWith('|')
  ) {
    return String(value || '').trimStart()
  }
  let cursor = firstMeaningfulIndex
  while (cursor < lines.length) {
    const trimmed = String(lines[cursor] || '').trim()
    if (!trimmed) {
      cursor += 1
      continue
    }
    if (!trimmed.startsWith('|')) break
    cursor += 1
  }
  return lines.slice(cursor).join('\n').trimStart()
}

const extractStablePolishReasonTable = (value: string) => {
  return buildRecoveredStablePolishTable(value)
}

const findStablePolishReasonTableRange = (value: string) => {
  const normalized = stripLeakedPolishTableInstructions(
    normalizeMarkdownTables(String(value || ''))
  )
  if (!normalized.trim()) return null

  const lines = normalized.split('\n').map(line => String(line || '').trimEnd())
  let bestMatch: {
    start: number
    end: number
    rowCount: number
  } | null = null

  for (let i = 0; i < lines.length; i += 1) {
    const headerLine = String(lines[i] || '').trim()
    const headerCells = splitStablePolishTableCells(headerLine)
    if (
      headerCells.length !== 3 ||
      headerCells[0] !== '修改前原文片段' ||
      headerCells[1] !== '修改后片段' ||
      headerCells[2] !== '修改原因与解释'
    ) {
      continue
    }

    const maybeTitle = String(lines[i - 1] || '').trim()
    const start = /^修改对照表[:：]?$/.test(maybeTitle) ? Math.max(0, i - 1) : i

    let separatorConsumed = false
    let rowCount = 0
    let end = i + 1

    for (let j = i + 1; j < lines.length; j += 1) {
      const trimmed = String(lines[j] || '').trim()
      if (!trimmed) {
        if (separatorConsumed && rowCount > 0) {
          end = j
          break
        }
        continue
      }
      if (!separatorConsumed) {
        if (tableSeparatorPattern.test(trimmed)) {
          separatorConsumed = true
          end = j + 1
          continue
        }
        end = j
        break
      }
      if (!markdownTableLinePattern.test(trimmed)) {
        end = j
        break
      }
      const rowCells = splitStablePolishTableCells(trimmed)
      if (rowCells.length !== 3) {
        end = j
        break
      }
      rowCount += 1
      end = j + 1
    }

    if (!separatorConsumed || rowCount <= 0) continue
    if (!bestMatch || rowCount > bestMatch.rowCount) {
      bestMatch = { start, end, rowCount }
    }
  }

  return bestMatch
}

const replacePolishReasonTableWithStableSnapshot = (value: string, stableTable?: string) => {
  const normalized = stripLeakedPolishTableInstructions(
    normalizeMarkdownTables(String(value || ''))
  )
  const snapshot = String(stableTable || '').trim() || extractStablePolishReasonTable(normalized)
  if (!snapshot) return normalized

  const match = findStablePolishReasonTableRange(normalized)
  if (!match) {
    return normalized.trim() || snapshot
  }

  const lines = normalized.split('\n').map(line => String(line || '').trimEnd())
  const prefix = lines.slice(0, match.start).join('\n').trimEnd()
  const suffix = stripLeadingStablePolishOverflowBlock(lines.slice(match.end).join('\n'))
  const sections = [prefix, snapshot, suffix].filter(section => String(section || '').trim())
  return sections.join('\n\n').trim()
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

  const safeSrc = String(src).replace(/"/g, '&quot;')
  const safeAlt = String(alt || '').replace(/"/g, '&quot;')
  const safeTitle = String(title || alt || '').replace(/"/g, '&quot;')

  return `<img src="${safeSrc}" alt="${safeAlt}" title="${safeTitle}" data-preview-src="${safeSrc}" class="rounded-md max-h-[30vh] cursor-pointer hover:opacity-90 transition-opacity" />`
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
  const rawContent = String(props.content || '')
  const cacheKey = `${props.isUserMessage ? 'user' : 'assistant'}:${String(
    props.chatId ?? props.index
  )}:${streamLoading ? 'loading' : 'stable'}:${hashMessageContent(rawContent)}`
  const cached = messageRenderCache.get(cacheKey)
  if (cached !== undefined) {
    return cached
  }
  const sanitizeDisplayText = (input: string) => {
    const source = String(input || '')
      .replace(/[​⁠﻿]/g, '')
      .replace(
        /(^|[\s,(])(?:file\/dev\/userFiles|public\/file|private_upload|userFiles)\/[A-Za-z0-9_\-./]+/g,
        '$1'
      )
      .replace(/(?:academic-4\.0|gpt_log|downloadzone)\/[A-Za-z0-9_\-./]+/gi, '')
      .replace(/\/(?:www|root|home|Users|private_upload|userFiles|tmp|var)\/[A-Za-z0-9_\-./]+/g, '')
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
      .replace(/YutoAI Report\s*｜\s*昱镜报告/g, 'YutoAI Report｜昱镜报告')
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
  let value = sanitizeDisplayText(rawContent)
  value = normalizeMarkdownTables(value)
  value = stripLeakedPolishTableInstructions(value)
  if (!props.isUserMessage) {
    const stablePolishReasonTable = extractStablePolishReasonTable(value)
    if (stablePolishReasonTable) {
      value = replacePolishReasonTableWithStableSnapshot(value, stablePolishReasonTable)
    }
  }
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
    return rememberRenderedMessage(cacheKey, mdi.render(modifiedValue))
  }

  return rememberRenderedMessage(cacheKey, modifiedValue)
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

const hasReasoning = computed(() => Boolean(props.reasoningText))
const showThinkingPill = computed(
  () => !props.isUserMessage && (props.loading || hasReasoning.value)
)
const shouldAnimateThinking = computed(() => props.loading)
const promptReferenceItems = computed(() =>
  props.promptReference
    ? props.promptReference
        .match(/{(.*?)}/g)
        ?.map((str: string | any[]) => str.slice(1, -1))
        .slice(0, 3) || []
    : []
)
const recordEyebrow = computed(() => (props.isUserMessage ? '研究请求' : '研究结果'))
const recordTitle = computed(() => {
  if (props.isUserMessage) return '你的输入'
  return ''
})
const recordStatus = computed(() => {
  return ''
})
const recordSummary = computed(() => {
  if (props.isUserMessage) return ''

  if (props.usingNetwork && searchResult.value.length) {
    return `引用 ${searchResult.value.length} 个网页来源。`
  }
  if (parsedFileVectorFiles.value.length) {
    return `生成 ${parsedFileVectorFiles.value.length} 份可下载结果。`
  }
  return ''
})
const recordMeta = computed(() => {
  const items: string[] = []
  if (props.isUserMessage) return items

  if (props.usingNetwork) {
    items.push(searchResult.value.length ? `来源 ${searchResult.value.length}` : '联网搜索')
  }
  if (props.usingDeepThinking || hasReasoning.value) {
    items.push('推理')
  }
  if (parsedFileVectorFiles.value.length) {
    items.push(`附件 ${parsedFileVectorFiles.value.length}`)
  }
  return items
})

const parsedWorkflowTask = computed<Chat.AcademicWorkflowTaskData | null>(() => {
  if (!props.taskData) return null
  if (typeof props.taskData === 'object' && props.taskData?.type === 'academic-workflow') {
    return props.taskData as Chat.AcademicWorkflowTaskData
  }
  if (typeof props.taskData === 'string') {
    try {
      const parsed = JSON.parse(props.taskData)
      return parsed?.type === 'academic-workflow' ? parsed : null
    } catch (_error) {
      return null
    }
  }
  return null
})

const sanitizeWorkflowPreview = (value: string) => {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  const sanitized = sanitizeUserFacingErrorMessage(normalized, 0, '')
  return sanitized === normalized ? normalized : ''
}

const normalizeWorkflowStageStatus = (status: string) => {
  const normalized = String(status || '').trim().toLowerCase()
  if (normalized === 'done') return 'done'
  if (normalized === 'running') return 'running'
  if (normalized === 'error') return 'error'
  return 'pending'
}

const workflowStageList = computed(() =>
  (parsedWorkflowTask.value?.steps || []).map((step, index) => {
    const normalizedStatus = normalizeWorkflowStageStatus(String(step?.status || 'pending'))
    const rawError = String(step?.error || '').trim()
    const error =
      parsedWorkflowTask.value?.status !== 'done' && normalizedStatus === 'error' && rawError
        ? sanitizeUserFacingErrorMessage(rawError, 0, '步骤执行失败，请稍后重试')
        : ''

    return {
      ...step,
      index: Number(step?.index || index + 1),
      displayName: String(step?.displayName || step?.name || '').trim() || `Step ${index + 1}`,
      status: normalizedStatus,
      contentPreview: sanitizeWorkflowPreview(String(step?.contentPreview || '')),
      progressText: sanitizeWorkflowPreview(String(step?.progressText || '')),
      error,
    }
  })
)
const hasWorkflowStageList = computed(() => !props.isUserMessage && workflowStageList.value.length > 0)
const showWorkflowCard = computed(
  () => !props.isUserMessage && Boolean(props.isWorkflowMessage || hasWorkflowStageList.value)
)
const workflowCurrentStageLabel = computed(() => {
  const stageName = String(props.stepName || '').trim()
  if (stageName) return stageName
  const current = workflowStageList.value.find(stage => stage.status === 'running')
  return current?.displayName || ''
})

const workflowLiveProgressText = computed(() => {
  if (!props.loading || !showWorkflowCard.value) return ''
  const running = workflowStageList.value.find(stage => stage.status === 'running')
  const runningText = String(running?.progressText || '').trim()
  if (runningText) return runningText

  const stageName = workflowCurrentStageLabel.value
  if (!stageName) {
    if (props.fileUrl) return '正在接收上传资料，准备能力编排'
    return '正在准备能力编排'
  }
  const progress = workflowProgressValue.value ? ` · ${workflowProgressValue.value}%` : ''
  return `正在执行：${stageName}${progress}`
})

const normalizeThinkingPreview = (value: string) => {
  const normalized = String(value || '').trim()
  if (!normalized) return ''
  const safeMessage = sanitizeUserFacingErrorMessage(normalized, 0, '')
  if (safeMessage && safeMessage !== normalized) return safeMessage
  const lines = normalized
    .split(/\n+/)
    .map(line => line.trim())
    .filter(Boolean)
  const latest = lines[lines.length - 1] || normalized
  return latest.length > 96 ? `${latest.slice(0, 96)}...` : latest
}

const liveThinkingPreview = computed(() => normalizeThinkingPreview(props.thinkingPreview || ''))
const reasoningTextPreview = computed(() => normalizeThinkingPreview(props.reasoningText || ''))
const reasoningPreview = computed(
  () =>
    workflowLiveProgressText.value ||
    liveThinkingPreview.value ||
    reasoningTextPreview.value ||
    reasoningTips[reasoningTipIndex.value]
)

const workflowSummaryLabel = computed(() => {
  if (!hasWorkflowStageList.value) {
    return props.loading && props.isWorkflowMessage ? '正在准备能力编排' : ''
  }
  if (workflowCurrentStageLabel.value && props.loading) {
    return t('lens.message.workflowRunningAt', { name: workflowCurrentStageLabel.value })
  }
  const failed = workflowStageList.value.find(stage => stage.status === 'error')
  if (failed) {
    return t('lens.message.workflowFailedAt', { name: failed.displayName })
  }
  if ((parsedWorkflowTask.value?.status || '') === 'done') {
    return t('lens.message.workflowFinished')
  }
  return t('lens.message.workflowQueued')
})

const workflowProgressValue = computed(() => {
  if (typeof props.workflowProgress === 'number' && props.workflowProgress > 0) {
    return Math.max(0, Math.min(100, Math.round(props.workflowProgress)))
  }
  const total = workflowStageList.value.length
  if (!total) return 0
  const runningStage = workflowStageList.value.find(stage => stage.status === 'running')
  if (runningStage) {
    const stageBase = Math.round(((Math.max(runningStage.index, 1) - 1) / total) * 100)
    return Math.min(99, stageBase + 5)
  }
  const doneCount = workflowStageList.value.filter(stage => stage.status === 'done').length
  return Math.round((doneCount / total) * 100)
})

const workflowStageStats = computed(() => {
  const total = workflowStageList.value.length
  const done = workflowStageList.value.filter(stage => stage.status === 'done').length
  const running = workflowStageList.value.find(stage => stage.status === 'running') || null
  const error = workflowStageList.value.find(stage => stage.status === 'error') || null
  const pending = Math.max(0, total - done - (running ? 1 : 0) - (error ? 1 : 0))
  return { total, done, pending, running, error }
})

const workflowMetricChips = computed(() => {
  const { total, done, pending, running, error } = workflowStageStats.value
  if (!total) return [] as string[]
  const chips = [t('lens.message.workflowMetricDone', { done, total })]
  if (running?.displayName) {
    chips.push(t('lens.message.workflowMetricCurrent', { name: running.displayName }))
  } else if (error?.displayName) {
    chips.push(t('lens.message.workflowMetricError', { name: error.displayName }))
  } else if (pending > 0) {
    chips.push(t('lens.message.workflowMetricPending', { count: pending }))
  }
  return chips
})

const workflowStatusText = (status: string) => {
  if (status === 'done') return t('lens.message.workflowStatusDone')
  if (status === 'running') return t('lens.message.workflowStatusRunning')
  if (status === 'error') return t('lens.message.workflowStatusError')
  return t('lens.message.workflowStatusPending')
}

const workflowStateClass = (status: string) => ({
  'workspace-record__workflow-state--done': status === 'done',
  'workspace-record__workflow-state--running': status === 'running',
  'workspace-record__workflow-state--error': status === 'error',
  'workspace-record__workflow-state--pending': status === 'pending',
})
const recordStatusClass = computed(() => ({
  'workspace-record__status--active': props.loading,
  'workspace-record__status--user': props.isUserMessage,
}))

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
        targetReplyChatId = Number(item?.chatId || 0)
        break
      }
    }
    const currentModelInfo = getActiveConversationModelInfo()
    // 提交编辑后立即退出编辑态，避免等待整段流式回复期间仍显示为编辑中。
    isEditable.value = false
    const runConversation =
      typeof handleEditConversation === 'function' ? handleEditConversation : onConversation
    await runConversation({
      msg: tempEditableContent,
      imageUrl: props.imageUrl,
      fileUrl: props.fileUrl,
      chatId: props.chatId,
      model: currentModelInfo?.model,
      modelName: currentModelInfo?.modelName,
      modelType: currentModelInfo?.modelType,
      modelAvatar: currentModelInfo?.modelAvatar,
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
    const currentModelInfo = getActiveConversationModelInfo()
    handleRegenerate(props.index, props.chatId, currentModelInfo)
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

const handleTextContainerClick = (event: Event) => {
  const target = event.target as HTMLElement | null
  if (!target) return

  const container = textRef.value
  if (!container) return

  const copyButton = target.closest<HTMLElement>('.btn-copy[data-block-id]')
  if (copyButton && container.contains(copyButton)) {
    event.stopPropagation()
    event.preventDefault()
    const blockId = copyButton.getAttribute('data-block-id')
    if (blockId) {
      handleCodeCopy(blockId, copyButton)
    }
    return
  }

  const previewButton = target.closest<HTMLElement>('.btn-preview[data-block-id]')
  if (previewButton && container.contains(previewButton)) {
    event.stopPropagation()
    event.preventDefault()
    const blockId = previewButton.getAttribute('data-block-id')
    if (!blockId) return
    const codeBlock = document.getElementById(blockId)
    const code = codeBlock?.querySelector('code')?.textContent || ''
    if (!code) return
    globalStore.updateHtmlContent(code, previewButton.classList.contains('preview-markmap') ? 'markmap' : 'html')
    globalStore.updateHtmlPreviewer(true)
    return
  }

  const previewImage = target.closest<HTMLElement>('img[data-preview-src]')
  if (previewImage && container.contains(previewImage)) {
    event.stopPropagation()
    const src = previewImage.getAttribute('data-preview-src')
    if (src) {
      openSingleImagePreview(src)
    }
  }
}

onMounted(() => {
  // 注入主题覆盖样式
  injectThemeStyles()
  scheduleRenderMermaidBlocks()
  textRef.value?.addEventListener('click', handleTextContainerClick)

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
})

onUnmounted(() => {
  stopReasoningTips()
  textRef.value?.removeEventListener('click', handleTextContainerClick)
  copyTimeoutsMap.forEach(timeoutId => clearTimeout(timeoutId))
  copyTimeoutsMap.clear()
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
  <section
    class="workspace-record group"
    :class="{
      'workspace-record--user': isUserMessage,
      'workspace-record--assistant': !isUserMessage,
      'workspace-record--loading': loading,
    }"
  >
    <header v-if="!isUserMessage && !showWorkflowCard" class="workspace-record__header">
      <div class="workspace-record__header-main">
        <div class="workspace-record__eyebrow">{{ recordEyebrow }}</div>
        <div v-if="recordTitle || recordStatus" class="workspace-record__title-row">
          <h3 v-if="recordTitle" class="workspace-record__title">{{ recordTitle }}</h3>
          <span v-if="recordStatus" class="workspace-record__status" :class="recordStatusClass">
            {{ recordStatus }}
          </span>
        </div>
        <p v-if="recordSummary && !loading" class="workspace-record__summary">{{ recordSummary }}</p>
        <div v-if="recordMeta.length" class="workspace-record__meta">
          <span v-for="item in recordMeta" :key="item" class="workspace-record__meta-chip">
            {{ item }}
          </span>
        </div>
      </div>
    </header>

    <div v-if="showWorkflowCard" class="workspace-record__section workspace-record__workflow">
      <button
        type="button"
        class="workspace-record__toggle"
        @click="hasWorkflowStageList && (showWorkflowDetails = !showWorkflowDetails)"
      >
        <div class="workspace-record__toggle-copy">
          <ArrowRight theme="outline" size="18" class="flex" />
          <span>{{ t('lens.message.workflowTitle') }}</span>
          <span class="workspace-record__workflow-summary">{{ workflowSummaryLabel }}</span>
        </div>
        <div class="workspace-record__toggle-icons">
          <span class="workspace-record__workflow-progress">{{ workflowProgressValue }}%</span>
          <Down v-if="hasWorkflowStageList && !showWorkflowDetails" size="18" class="flex" />
          <Up v-else-if="hasWorkflowStageList" size="18" class="flex" />
        </div>
      </button>

      <div v-if="hasWorkflowStageList" class="workspace-record__workflow-overview">
        <div class="workspace-record__workflow-meter" aria-hidden="true">
          <div
            class="workspace-record__workflow-meter-fill"
            :style="{ width: `${workflowProgressValue}%` }"
          />
        </div>
        <div class="workspace-record__workflow-metrics">
          <span
            v-for="chip in workflowMetricChips"
            :key="chip"
            class="workspace-record__workflow-metric-chip"
          >
            {{ chip }}
          </span>
        </div>
      </div>

      <transition name="fold">
        <div v-if="showWorkflowDetails" class="workspace-record__workflow-list">
          <div
            v-for="stage in workflowStageList"
            :key="stage.index"
            class="workspace-record__workflow-item"
            :class="{
              'workspace-record__workflow-item--done': stage.status === 'done',
              'workspace-record__workflow-item--active': stage.status === 'running',
              'workspace-record__workflow-item--error': stage.status === 'error',
            }"
          >
            <div class="workspace-record__workflow-step">
              <span class="workspace-record__workflow-index">{{ stage.index }}</span>
              <div class="workspace-record__workflow-copy">
                <div class="workspace-record__workflow-name">{{ stage.displayName }}</div>
                <div class="workspace-record__workflow-state" :class="workflowStateClass(stage.status)">
                  {{ workflowStatusText(stage.status) }}
                </div>
              </div>
            </div>
            <div v-if="stage.args" class="workspace-record__workflow-extra">
              {{ stage.args }}
            </div>
            <div
              v-if="stage.status === 'running' && stage.progressText"
              class="workspace-record__workflow-extra"
            >
              {{ stage.progressText }}
            </div>
            <div v-if="stage.contentPreview" class="workspace-record__workflow-preview">
              {{ stage.contentPreview }}
            </div>
            <div
              v-if="stage.status === 'error' && stage.error"
              class="workspace-record__workflow-error"
            >
              {{ stage.error }}
            </div>
          </div>
        </div>
      </transition>
    </div>

    <div v-if="isUserMessage" class="workspace-record__request-head">
      <div class="workspace-record__eyebrow">{{ recordEyebrow }}</div>
      <div v-if="recordMeta.length" class="workspace-record__meta">
        <span v-for="item in recordMeta" :key="item" class="workspace-record__meta-chip">
          {{ item }}
        </span>
      </div>
    </div>

    <div
      v-if="!isUserMessage && (searchResult.length || (loading && usingNetwork))"
      class="workspace-record__section"
    >
      <button
        type="button"
        @click="showSearchResult = !showSearchResult"
        class="workspace-record__toggle"
      >
        <div class="workspace-record__toggle-copy">
          <Sphere theme="outline" size="18" class="flex" />
          <span v-if="searchResult.length">已浏览 {{ searchResult.length }} 个网页来源</span>
          <span v-else-if="loading && usingNetwork">联网搜索中</span>
        </div>
        <div class="workspace-record__toggle-icons">
          <LoadingOne v-if="loading && usingNetwork" class="rotate-icon flex" />
          <Down v-if="!showSearchResult && searchResult.length" size="18" class="flex" />
          <Up v-else-if="searchResult.length" size="18" class="flex" />
        </div>
      </button>

      <transition name="fold">
        <div v-if="showSearchResult && searchResult.length" class="workspace-record__source-list">
          <a
            v-for="(item, index) in searchResult"
            :key="index"
            :href="item.link"
            target="_blank"
            class="workspace-record__source-item"
          >
            <span class="workspace-record__source-index">{{ index + 1 }}</span>
            <span class="workspace-record__source-title">
              {{ item.title.slice(0, 80) }}{{ item.title.length > 80 ? '...' : '' }}
              <span v-if="item.media">[{{ item.media }}]</span>
            </span>
          </a>
        </div>
      </transition>
    </div>

    <div v-if="showThinkingPill" class="workspace-record__section">
      <div
        :class="[
          'reasoning-pill glow-container',
          { 'reasoning-pill--active': shouldAnimateThinking },
        ]"
      >
        <TwoEllipses theme="outline" size="18" class="flex icon" />
        <span class="label">{{ loading ? '深度思考中' : '已深度思考' }}</span>
        <LoadingOne
          v-if="
            (loading && usingDeepThinking && !hasReasoning) || (!text && loading && hasReasoning)
          "
          class="rotate-icon flex mx-1 text-base"
        />
        <div class="reasoning-preview" v-text="reasoningPreview"></div>
      </div>
    </div>

    <div class="workspace-record__body">
      <div ref="textRef" class="workspace-record__content">
        <div v-if="!isUserMessage" class="workspace-record__assistant">
          <span
            v-if="loading && !text && !hasReasoning"
            class="inline-block h-3.5 w-3.5 align-middle rounded-full animate-breathe bg-gray-950 dark:bg-gray-100"
          ></span>
          <div
            :class="[
              'markdown-body workspace-record__markdown text-gray-950 dark:text-gray-100',
              { 'markdown-body-generate': loading || !text },
            ]"
            v-html="text"
          ></div>
        </div>

        <div v-else class="workspace-record__user">
          <div v-if="isEditable" class="workspace-record__editor">
            <textarea
              ref="textarea"
              v-model="editableContent"
              class="workspace-record__editor-textarea"
              style="max-height: 60vh"
              @input="adjustTextareaHeight"
            ></textarea>
            <div class="workspace-record__editor-actions">
              <button type="button" class="btn-pill btn-md" @click="cancelEdit" aria-label="取消">
                <Close size="16" />
                <span class="ml-1">取消</span>
              </button>
              <button
                type="button"
                class="btn btn-primary btn-md"
                @click="handleEditMessage"
                aria-label="保存修改"
              >
                <Send size="16" />
                <span class="ml-1">保存修改</span>
              </button>
            </div>
          </div>
          <div v-else class="workspace-record__user-text" v-text="text" />
        </div>
      </div>
    </div>

    <div
      v-if="isUserMessage && parsedUserUploadedFiles.length"
      class="workspace-record__section workspace-record__section--files"
    >
      <div class="workspace-record__file-tags">
        <button
          v-for="(file, index) in parsedUserUploadedFiles"
          :key="`${file.url}-${index}`"
          type="button"
          class="workspace-record__file-tag"
          :class="{ 'cursor-wait opacity-80': isDownloadingFile(file.url) }"
          :title="file.name"
          :disabled="isDownloadingFile(file.url)"
          @click="downloadUserUploadedFile(file)"
        >
          <span class="workspace-record__file-badge">
            {{ getUserFileTypeLabel(file).replace(' 文件', '') }}
          </span>
          <span class="workspace-record__file-name">{{ file.name }}</span>
          <LoadingOne v-if="isDownloadingFile(file.url)" class="rotate-icon flex text-[13px]" />
        </button>
      </div>
    </div>

    <div
      v-if="imageUrlArray && imageUrlArray.length > 0 && isImageUrl"
      class="workspace-record__section"
    >
      <div class="workspace-record__section-label">
        {{ isUserMessage ? '图片资料' : '图像结果' }}
      </div>
      <div
        class="workspace-record__image-grid"
        :style="{
          gridTemplateColumns: `repeat(${Math.min(imageUrlArray.length, 4)}, 1fr)`,
        }"
      >
        <img
          v-for="(file, index) in imageUrlArray"
          :key="index"
          :src="file"
          alt="图片"
          @click="openImagePreview(index)"
          class="workspace-record__image"
          :style="{
            aspectRatio: '1/1',
            width: '160px',
            height: '160px',
          }"
        />
      </div>
    </div>

    <div
      v-if="!isUserMessage && parsedFileVectorFiles.length"
      class="workspace-record__section workspace-record__section--downloads"
    >
      <div class="workspace-record__section-label">可交付结果</div>
      <div class="workspace-record__download-list">
        <button
          v-for="(file, index) in parsedFileVectorFiles"
          :key="`${file.path}-${index}`"
          type="button"
          class="workspace-record__download-chip"
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

    <div
      v-if="promptReferenceItems.length && !isUserMessage && isLast"
      class="workspace-record__section"
    >
      <div class="workspace-record__section-label">下一步</div>
      <div class="workspace-record__followups">
        <button
          v-for="(item, index) in promptReferenceItems"
          :key="index"
          @click="handleMessage(item as string)"
          class="workspace-record__followup-btn"
        >
          {{ item }}
          <ArrowRight class="ml-1" />
        </button>
      </div>
    </div>

    <div class="workspace-record__footer" :class="buttonGroupClass">
      <div class="workspace-record__actions">
        <div v-if="!isEditable" class="relative group-btn">
          <button class="btn-icon btn-sm btn-icon-action mx-1" @click="handleCopy" aria-label="复制">
            <Copy />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">{{ t('chat.copy') }}</div>
        </div>

        <div v-if="!isEditable" class="relative group-btn">
          <button class="btn-icon btn-sm btn-icon-action mx-1" @click="handleDelete" aria-label="删除">
            <Delete />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">{{ t('chat.delete') }}</div>
        </div>

        <div v-if="isUserMessage && !isEditable" class="relative group-btn">
          <button class="btn-icon btn-sm btn-icon-action mx-1" @click="handleEditMessage" aria-label="编辑">
            <Edit />
          </button>
          <div v-if="!isMobile" class="tooltip tooltip-top">编辑</div>
        </div>

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

        <div v-if="!isUserMessage && !isHideTts" class="relative group-btn">
          <button class="btn-icon btn-sm btn-icon-action mx-1" @click="playOrPause" aria-label="朗读">
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
  </section>
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

.workspace-record {
  width: 100%;
  overflow: visible;
  padding: 0.95rem 0 0.25rem;
}

.workspace-record:first-child {
  padding-top: 0.2rem;
}

.workspace-record--user {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.workspace-record__request-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-bottom: 0.55rem;
}

.workspace-record__header,
.workspace-record__section,
.workspace-record__body,
.workspace-record__footer {
  padding-left: 0;
  padding-right: 0;
}

.workspace-record__header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding-top: 0;
  padding-bottom: 0.65rem;
}

.workspace-record__header-main {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.workspace-record__eyebrow,
.workspace-record__section-label {
  font-size: 0.68rem;
  line-height: 1;
  text-transform: uppercase;
  letter-spacing: 0.16em;
  font-weight: 700;
  color: var(--ink-faint);
}

.workspace-record__title-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.1rem;
  flex-wrap: wrap;
}

.workspace-record__title {
  margin: 0;
  font-size: 0.94rem;
  line-height: 1.2;
  font-weight: 650;
  color: var(--text-main);
}

.workspace-record__status {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.55rem;
  padding: 0.2rem 0.5rem;
  border-radius: 999px;
  border: 1px solid transparent;
  background: #f2f2ee;
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--ink-soft);
}

.workspace-record__status--active {
  border-color: transparent;
  background: #e9e9e4;
  color: var(--text-main);
}

.workspace-record__status--user {
  border-color: transparent;
  color: var(--text-main);
}

.workspace-record__summary {
  margin: 0;
  max-width: 58ch;
  font-size: 0.78rem;
  line-height: 1.55;
  color: var(--ink-faint);
}

.workspace-record__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.workspace-record__meta-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--ink-faint);
  font-size: 0.74rem;
  line-height: 1.4;
}

.workspace-record__meta-chip::before {
  content: '•';
  opacity: 0.4;
}

.workspace-record__meta-chip:first-child::before {
  content: '';
}

.workspace-record__download-chip,
.workspace-record__followup-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  min-height: 1.8rem;
  padding: 0.34rem 0.72rem;
  border-radius: 999px;
  border: 1px solid transparent;
  background: var(--surface-muted);
  color: var(--ink-soft);
  font-size: 0.72rem;
  line-height: 1;
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    transform 0.2s ease;
}

.workspace-record__section {
  padding-top: 0.8rem;
}

.workspace-record__toggle {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.8rem;
  padding: 0.72rem 0.9rem;
  border: 1px solid var(--paper-border);
  border-radius: 12px;
  background: var(--surface-card);
  color: var(--text-main);
  text-align: left;
}

.dark .workspace-record__toggle {
  background: rgba(18, 24, 34, 0.92);
  border-color: rgba(255, 255, 255, 0.08);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.015);
}

html.dark .workspace-record__toggle {
  background: rgba(18, 24, 34, 0.96) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  color: var(--text-main) !important;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.015) !important;
}

html.dark .workspace-record__toggle-copy,
html.dark .workspace-record__toggle-icons,
html.dark .workspace-record__toggle span {
  color: var(--text-main);
}

.workspace-record__toggle-copy,
.workspace-record__toggle-icons {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
}

.workspace-record__source-list {
  margin-top: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.workspace-record__source-item {
  display: flex;
  gap: 0.8rem;
  align-items: flex-start;
  padding: 0.76rem 0.9rem;
  border-radius: 12px;
  border: 1px solid var(--paper-border);
  background: var(--surface-card);
  color: var(--ink-soft);
  text-decoration: none;
}

.workspace-record__source-item:hover,
.workspace-record__download-chip:hover,
.workspace-record__followup-btn:hover {
  border-color: var(--paper-border);
  background: var(--surface-muted);
}

.workspace-record__source-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.6rem;
  height: 1.6rem;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.76rem;
  font-weight: 700;
}

.workspace-record__source-title {
  min-width: 0;
  flex: 1;
  line-height: 1.55;
}

.workspace-record__body {
  padding-top: 0.15rem;
}

.workspace-record__assistant,
.workspace-record__user {
  width: 100%;
}

.workspace-record--user .workspace-record__request-head,
.workspace-record--user .workspace-record__body,
.workspace-record--user .workspace-record__section {
  width: min(100%, 46rem);
  margin-left: auto;
}

.workspace-record--user .workspace-record__request-head {
  justify-content: flex-end;
  gap: 0.75rem;
}

.workspace-record--user .workspace-record__eyebrow,
.workspace-record--user .workspace-record__section-label {
  text-align: right;
}

.workspace-record--user .workspace-record__meta {
  justify-content: flex-end;
}

.workspace-record--user .workspace-record__file-tags {
  justify-content: flex-end;
}

.workspace-record__markdown,
.workspace-record__user-text,
.workspace-record__editor {
  border-radius: 12px;
}

.workspace-record__markdown {
  padding: 0.1rem 0 0.25rem;
  border: none;
  background: transparent;
}

.workspace-record__user-text {
  display: inline-block;
  width: fit-content;
  max-width: min(100%, 46rem);
  padding: 0.9rem 1rem;
  border: none;
  background: var(--surface-muted);
  white-space: pre-wrap;
  line-height: 1.75;
  color: var(--text-main);
  border-radius: 1.2rem;
  border-top-right-radius: 0.45rem;
  box-shadow: none;
}

.dark .workspace-record__user-text {
  background: rgba(255, 255, 255, 0.03);
}

.workspace-record__editor {
  max-width: min(100%, 46rem);
  margin-left: auto;
  padding: 0.95rem;
  border: none;
  background: var(--surface-muted);
  border-radius: 1.2rem;
  border-top-right-radius: 0.45rem;
}

.workspace-record__user {
  display: flex;
  justify-content: flex-end;
}

.workspace-record__editor-textarea {
  width: 100%;
  min-height: 7rem;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-main);
  font-size: 1rem;
  line-height: 1.75;
}

.workspace-record__editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.9rem;
}

.workspace-record__section--files,
.workspace-record__section--downloads {
  padding-top: 0.95rem;
}

.workspace-record__file-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
  margin-top: 0.45rem;
}

.workspace-record__file-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  max-width: min(100%, 26rem);
  padding: 0.52rem 0.72rem;
  border-radius: 999px;
  border: 1px solid var(--paper-border);
  background: var(--surface-card);
  box-shadow: none;
  text-align: left;
}

.dark .workspace-record__file-tag {
  background: rgba(18, 24, 34, 0.96);
  border-color: rgba(255, 255, 255, 0.1);
}

html.dark .workspace-record__file-tag {
  background: rgba(18, 24, 34, 0.96) !important;
  border-color: rgba(255, 255, 255, 0.1) !important;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.015) !important;
}

.workspace-record__file-tag:hover {
  background: var(--surface-muted);
}

.dark .workspace-record__file-tag:hover,
html.dark .workspace-record__file-tag:hover {
  background: rgba(255, 255, 255, 0.08) !important;
}

.workspace-record__file-badge {
  display: inline-flex;
  min-width: 2.2rem;
  height: 1.9rem;
  align-items: center;
  justify-content: center;
  padding: 0 0.5rem;
  border-radius: 999px;
  background: var(--surface-muted);
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--text-main);
}

.dark .workspace-record__file-badge {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-main);
}

html.dark .workspace-record__file-name,
html.dark .workspace-record__file-badge {
  color: var(--text-main) !important;
}

html.dark .workspace-record__file-badge {
  background: rgba(255, 255, 255, 0.08) !important;
}

.workspace-record__file-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.82rem;
  color: var(--text-main);
}

.workspace-record__image-grid {
  display: grid;
  gap: 0.75rem;
  margin-top: 0.75rem;
  max-width: min(100%, 760px);
}

.workspace-record__image {
  border-radius: 12px;
  border: none;
  box-shadow: var(--shadow-soft);
  cursor: pointer;
  object-fit: cover;
  transition:
    opacity 0.2s ease;
}

.workspace-record__image:hover {
  opacity: 0.92;
}

.workspace-record__download-list,
.workspace-record__followups {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.75rem;
}

.workspace-record__footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 0.45rem;
  padding-bottom: 0.4rem;
}

.workspace-record__actions {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
}

@media (max-width: 960px) {
  .workspace-record__header {
    flex-direction: column;
  }
}

@media (max-width: 640px) {
  .workspace-record__title {
    font-size: 0.9rem;
  }

  .workspace-record__summary {
    font-size: 0.8rem;
  }

  .workspace-record--user .workspace-record__request-head,
  .workspace-record--user .workspace-record__body,
  .workspace-record--user .workspace-record__section,
  .workspace-record__user-text,
  .workspace-record__editor {
    width: 100%;
    max-width: 100%;
  }

  .workspace-record__file-tags {
    flex-direction: column;
    align-items: stretch;
  }

  .workspace-record__file-tag {
    width: 100%;
    max-width: 100%;
  }

  .workspace-record__image-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
  }

  .workspace-record__image {
    width: 100% !important;
    height: auto !important;
  }

  .workspace-record__footer {
    justify-content: flex-start;
  }
}

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
  border: 1px solid var(--paper-border);
  border-radius: 12px;
  overflow: hidden;
  font-size: 0.97rem;
  background: var(--surface-card);
}

.dark .markdown-body table {
  background: rgba(18, 24, 34, 0.94);
  border-color: rgba(255, 255, 255, 0.08);
}

html.dark .markdown-body table {
  background: rgba(18, 24, 34, 0.94) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

.markdown-body th,
.markdown-body td {
  border-right: 1px solid var(--paper-border);
  border-bottom: 1px solid var(--paper-border);
  padding: 10px 12px;
  vertical-align: top;
  color: var(--text-main);
}

.markdown-body th:last-child,
.markdown-body td:last-child {
  border-right: none;
}

.markdown-body tr:last-child td {
  border-bottom: none;
}

.markdown-body thead th {
  background: var(--surface-muted);
  font-weight: 700;
}

.dark .markdown-body thead th {
  background: rgba(255, 255, 255, 0.05);
}

html.dark .markdown-body th,
html.dark .markdown-body td {
  border-color: rgba(255, 255, 255, 0.08) !important;
  color: var(--text-main) !important;
}

html.dark .markdown-body thead th {
  background: rgba(255, 255, 255, 0.05) !important;
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
  border: 1px solid var(--paper-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-card) 92%, transparent);
  color: var(--text-main);
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
  background: var(--surface-muted);
}

.markdown-body .mermaid-download-btn:focus-visible {
  outline: 2px solid var(--text-main);
  outline-offset: 1px;
}

.markdown-body .mermaid-fallback {
  margin: 0;
  border-radius: 0.75rem;
  border: 1px solid var(--paper-border);
  background: var(--surface-card);
  padding: 0.75rem;
  white-space: pre-wrap;
  color: var(--text-main);
}

html.dark .markdown-body pre,
html.dark .markdown-body code,
html.dark .markdown-body .code-block-wrapper,
html.dark .markdown-body .mermaid-fallback,
html.dark .markdown-body blockquote,
html.dark .workspace-record__markdown,
html.dark .workspace-record__assistant {
  background: rgba(18, 24, 34, 0.96) !important;
  color: var(--text-main) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
}

html.dark .markdown-body,
html.dark .markdown-body p,
html.dark .markdown-body li,
html.dark .markdown-body span,
html.dark .markdown-body strong,
html.dark .markdown-body em {
  color: var(--text-main) !important;
}

html.dark .markdown-body a {
  color: #bcd0ff !important;
}

html.dark .markdown-body .mermaid-download-btn {
  background: rgba(18, 24, 34, 0.96) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  color: var(--text-main) !important;
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
  border: 1px solid var(--paper-border);
  background: var(--surface-card);
  box-shadow: 0 8px 18px rgba(8, 8, 8, 0.06);
  color: var(--text-main);
}

.reasoning-pill--active {
  border-color: var(--input-border-focus);
  background: var(--surface-card);
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

.workspace-record__workflow {
  padding: 0;
}

html.dark .workspace-record__workflow {
  color: var(--text-main);
}

.workspace-record__workflow-summary {
  color: var(--text-sub);
}

.workspace-record__workflow-progress {
  margin-right: 4px;
  font-size: 12px;
  color: var(--text-sub);
}

.dark .workspace-record__workflow-summary,
.dark .workspace-record__workflow-progress {
  color: rgba(238, 242, 248, 0.72);
}

html.dark .workspace-record__workflow-summary,
html.dark .workspace-record__workflow-progress {
  color: rgba(238, 242, 248, 0.78) !important;
}

.workspace-record__workflow-overview {
  margin-top: 10px;
  padding: 12px 12px 0;
  border: 1px solid var(--paper-border);
  border-radius: 16px;
  background: linear-gradient(180deg, rgba(8, 8, 8, 0.02) 0%, transparent 100%);
}

html.dark .workspace-record__workflow-overview {
  border-color: rgba(255, 255, 255, 0.08) !important;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.01) 100%) !important;
}

.workspace-record__workflow-meter {
  position: relative;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(8, 8, 8, 0.08);
}

html.dark .workspace-record__workflow-meter {
  background: rgba(255, 255, 255, 0.08) !important;
}

.workspace-record__workflow-meter-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #080808 0%, #5a7dff 100%);
  transition: width 0.24s ease;
}

html.dark .workspace-record__workflow-meter-fill {
  background: linear-gradient(90deg, #f3f6fb 0%, #7ea5ff 100%) !important;
}

.workspace-record__workflow-metrics {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.workspace-record__workflow-metric-chip {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(8, 8, 8, 0.08);
  background: rgba(8, 8, 8, 0.04);
  color: var(--text-sub);
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
}

html.dark .workspace-record__workflow-metric-chip {
  border-color: rgba(255, 255, 255, 0.08) !important;
  background: rgba(255, 255, 255, 0.05) !important;
  color: rgba(238, 242, 248, 0.84) !important;
}

.workspace-record__workflow-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.workspace-record__workflow-item {
  border: 1px solid var(--paper-border);
  border-radius: 16px;
  background: var(--surface-card);
  padding: 12px 14px;
}

.dark .workspace-record__workflow-item {
  background: rgba(18, 24, 34, 0.94);
  border-color: rgba(255, 255, 255, 0.08);
}

html.dark .workspace-record__workflow-item {
  background: rgba(18, 24, 34, 0.94) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.015) !important;
}

.workspace-record__workflow-item--done {
  border-color: rgba(16, 185, 129, 0.16);
  background: rgba(16, 185, 129, 0.05);
}

html.dark .workspace-record__workflow-item--done {
  border-color: rgba(52, 211, 153, 0.18) !important;
  background: rgba(7, 56, 42, 0.4) !important;
}

.workspace-record__workflow-item--active {
  border-color: var(--input-border-focus);
  background: var(--surface-muted);
}

.dark .workspace-record__workflow-item--active {
  background: rgba(33, 43, 61, 0.94);
  border-color: rgba(127, 180, 255, 0.3);
}

html.dark .workspace-record__workflow-item--active {
  background: rgba(33, 43, 61, 0.94) !important;
  border-color: rgba(127, 180, 255, 0.3) !important;
}

.workspace-record__workflow-item--error {
  border-color: rgba(248, 113, 113, 0.32);
  background: rgba(248, 113, 113, 0.08);
}

html.dark .workspace-record__workflow-item--error {
  border-color: rgba(248, 113, 113, 0.28) !important;
  background: rgba(120, 22, 28, 0.32) !important;
}

.workspace-record__workflow-step {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.workspace-record__workflow-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--bg-body);
  font-size: 12px;
  font-weight: 600;
  flex-shrink: 0;
}

.workspace-record__workflow-copy {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.workspace-record__workflow-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
}

.workspace-record__workflow-state,
.workspace-record__workflow-extra,
.workspace-record__workflow-preview,
.workspace-record__workflow-error {
  font-size: 12px;
  line-height: 1.6;
}

.workspace-record__workflow-state {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid transparent;
  font-weight: 600;
}

.workspace-record__workflow-state--done {
  border-color: rgba(16, 185, 129, 0.16);
  background: rgba(16, 185, 129, 0.08);
  color: #047857;
}

.workspace-record__workflow-state--running {
  border-color: rgba(90, 125, 255, 0.18);
  background: rgba(90, 125, 255, 0.08);
  color: #335cff;
}

.workspace-record__workflow-state--pending {
  border-color: rgba(8, 8, 8, 0.08);
  background: rgba(8, 8, 8, 0.04);
  color: var(--text-sub);
}

.workspace-record__workflow-state--error {
  border-color: rgba(248, 113, 113, 0.18);
  background: rgba(248, 113, 113, 0.08);
  color: #dc2626;
}

html.dark .workspace-record__workflow-state--done {
  border-color: rgba(52, 211, 153, 0.18) !important;
  background: rgba(16, 185, 129, 0.14) !important;
  color: #86efac !important;
}

html.dark .workspace-record__workflow-state--running {
  border-color: rgba(127, 180, 255, 0.24) !important;
  background: rgba(90, 125, 255, 0.18) !important;
  color: #dbe7ff !important;
}

html.dark .workspace-record__workflow-state--pending {
  border-color: rgba(255, 255, 255, 0.08) !important;
  background: rgba(255, 255, 255, 0.05) !important;
  color: rgba(238, 242, 248, 0.72) !important;
}

html.dark .workspace-record__workflow-state--error {
  border-color: rgba(248, 113, 113, 0.22) !important;
  background: rgba(248, 113, 113, 0.12) !important;
  color: #fecdd3 !important;
}

.workspace-record__workflow-extra,
.workspace-record__workflow-preview {
  color: var(--text-sub);
}

.workspace-record__workflow-extra,
.workspace-record__workflow-preview,
.workspace-record__workflow-error {
  margin-top: 8px;
}

.workspace-record__workflow-preview {
  white-space: pre-wrap;
}

.dark .workspace-record__download-chip,
.dark .workspace-record__followup-btn {
  background: rgba(255, 255, 255, 0.05);
  border-color: rgba(255, 255, 255, 0.08);
  color: var(--text-main);
}

html.dark .workspace-record__download-chip,
html.dark .workspace-record__followup-btn {
  background: rgba(255, 255, 255, 0.05) !important;
  border-color: rgba(255, 255, 255, 0.08) !important;
  color: var(--text-main) !important;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.015) !important;
}

.workspace-record__workflow-error {
  color: #f87171;
}

html.dark .workspace-record__workflow-error {
  color: #fda4af !important;
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
