<script setup lang="ts">
// ============== 组件导入 ==============
import { fetchChatAPIProcess } from '@/api'
import { fetchAcademicChatAPIProcess } from '@/api/academic'
import { fetchQueryOneCatAPI } from '@/api/appStore'
import { openImageViewer } from '@/components/common/ImageViewer/useImageViewer'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import { dialog } from '@/utils/dialog'
import { message } from '@/utils/message'
import { Close, DropDownList } from '@icon-park/vue-next'
import DownSmall from '@icon-park/vue-next/es/icons/DownSmall'
import Sider from './components/sider/index.vue'
// 导入DropdownMenu组件用于弹窗
import { DropdownMenu } from '@/components/common/DropdownMenu'
import ExternalLinkComponent from './components/ExternalLink/index.vue'
// 移除不再直接使用的异步组件导入
// const TextEditor = defineAsyncComponent(() => import('./components/Previewer/TextEditor.vue'))
// const ImagePreviewer = defineAsyncComponent(() => import('./components/Previewer/ImagePreviewer.vue'))
// const HtmlPreviewer = defineAsyncComponent(() => import('./components/Previewer/HtmlPreviewer.vue'))

// ============== 静态组件导入 ==============
import AppList from './components/AppList/index.vue'
import AppTips from './components/AppTips/index.vue'
import FooterComponent from './components/Footer/index.vue'
import HeaderComponent from './components/Header/index.vue'
import Message from './components/Message/index.vue'
import WelcomeComponent from './components/Welcome/index.vue'
import WorkspaceHome from './components/Workspace/Home.vue'
import AcademicPanel from './components/Footer/components/AcademicPanel.vue'

// ============== Composition API ==============
import { computed, inject, nextTick, onMounted, provide, ref, watch } from 'vue'
import { DIALOG_TABS } from '@/store/modules/global'
import { useRoute } from 'vue-router'
import { useChat } from './hooks/useChat'
import { useScroll } from './hooks/useScroll'

// ============== 接口定义 ==============
// Type for the form schema field
interface FormField {
  type: 'input' | 'select'
  title: string
  placeholder: string
  options?: string[]
}

// ============== 组合式函数 ==============
const ms = message()
const { isMobile } = useBasicLayout()
const { scrollRef, scrollToBottom, scrollToBottomIfAtBottom, isAtBottom, handleScroll } =
  useScroll()
const { addGroupChat, updateGroupChatSome } = useChat()

const triggerUpgradeIfNeeded = (messageText: string) => {
  if (!messageText) return
  if (!/积分不足|选购套餐|升级套餐/i.test(messageText)) return
  if (isMobile.value) {
    useGlobalStore.updateMobileSettingsDialog(true, DIALOG_TABS.MEMBER)
  } else {
    useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.MEMBER)
  }
}

// 添加自定义的updateGroupChat函数
const updateGroupChat = (index: number, chat: Chat.Chat) => {
  chatStore.updateGroupChat(index, chat)
}

const clearLastError = () => {
  lastError.value = ''
  lastErrorRequestId.value = ''
}

const handleImportFiles = () => {
  footerRef.value?.openFilePicker?.(
    '.pdf,.tex,.latex,.zip,.tar,.tar.gz,.tgz,.doc,.docx,.md,.markdown'
  )
}

// ============== Store ==============
const useGlobalStore = useGlobalStoreWithOut()
const authStore = useAuthStore()
const chatStore = useChatStore()

// ============== 响应式状态 ==============
const route = useRoute()
const bottomContainer = ref()
const footerRef = ref<{ openFilePicker?: (accept?: string) => void } | null>(null)
const firstScroll = ref<boolean>(true)
const controller = ref(new AbortController())
const currentAppDetail = ref<any>(null)
const lastError = ref('')
const lastErrorRequestId = ref('')
const isRegenerating = ref(false)

// ============== 弹窗相关状态 ==============
// Modal state
const showFormModal = ref(false)
const currentFormSchema = ref<FormField[]>([])
const selectedAppForModal = ref<any>(null)
const isSubmitting = ref(false)

// 添加Modal相关的状态和函数
const modalFormData = ref<Record<string, any>>({})
const isModalLoading = computed(() => isSubmitting.value)
const dropdownStates = ref<Record<string, boolean>>({})

// ============== 计算属性 ==============
const groupSources = computed(() => chatStore.groupList || [])
const tradeStatus = computed(() => {
  return route?.query?.trade_status ? String(route.query.trade_status) : ''
})
const token = computed(() => {
  return route?.query?.token ? String(route.query.token) : ''
})
const isLogin = computed(() => authStore?.isLogin ?? false)
const usingPlugin = computed(() => chatStore.currentPlugin)
const academicMode = computed(() => chatStore.academicMode)
const academicPlugin = computed(() => chatStore.currentAcademicPlugin)
const academicCore = computed(() => chatStore.currentAcademicCore)
const academicPluginArgs = computed(() => chatStore.academicPluginArgs)
const academicPluginKwargs = computed(() => {
  if (!academicPlugin.value?.advancedArgs) return {}
  const raw = String(academicPluginArgs.value || '').trim()
  if (!raw) return {}
  return { user_prompt: raw }
})
const isAcademicDisabledOption = (value: any) => {
  const text = String(value || '').trim()
  if (!text) return true
  return /^(不启用|disabled|none|null)$/i.test(text)
}
const getAcademicPluginRequestName = (item: any) => {
  if (!item || typeof item !== 'object') return ''
  if (item?.disabled === true) return ''
  const displayName = String(item?.displayName || '').trim()
  const name = String(item?.name || '').trim()
  if (isAcademicDisabledOption(displayName) || isAcademicDisabledOption(name)) return ''
  // 优先发送当前展示所对应的新插件名，避免退回旧名导致命中过时后端分支。
  const candidates = [item?.name, item?.originName]
    .map(value => String(value || '').trim())
    .filter(value => value && !isAcademicDisabledOption(value))
  const selected = candidates[0] || ''
  if (isAcademicDisabledOption(selected)) return ''
  return selected
}
const getAcademicCoreRequestName = (item: any) => {
  if (!item || typeof item !== 'object') return ''
  const displayName = String(item?.displayName || '').trim()
  if (displayName && isAcademicDisabledOption(displayName)) return ''
  const candidates = [item?.name, item?.originName]
    .map(value => String(value || '').trim())
    .filter(value => value && !isAcademicDisabledOption(value))
  const selected = candidates[0] || ''
  if (isAcademicDisabledOption(selected)) return ''
  return selected
}
const normalizeAcademicName = (value: any) =>
  String(value || '')
    .toLowerCase()
    .replace(/[\s\-_/\\]+/g, '')
    .replace(/[（）()【】\[\]<>《》:：,.，。'"`]/g, '')
const academicFileRequiredPlugins = new Set(
  [
    'pdf批量总结',
    'pdf深度理解',
    'word批量总结',
    'latex摘要',
    'latex精准翻译',
    'latex英文润色',
    'latex中文润色',
    'latex高亮纠错',
    '解析整个python项目',
    '注释整个python项目',
    '解析整个matlab项目',
    '解析整个c项目头文件',
    '解析整个c项目cpphpp等',
    '解析整个go项目',
    '解析整个rust项目',
    '解析整个java项目',
    '解析整个前端项目jstscss等',
    '解析整个lua项目',
    '解析整个csharp项目',
    '解析jupyternotebook文件',
    '翻译markdown或readme',
    '批量生成函数注释',
    '解析项目源代码自定义文件类型',
  ].map(normalizeAcademicName)
)
const dataSources = computed(() => chatStore.chatList || [])
const activeGroupId = computed(() => chatStore.active)
const activeGroupInfo = computed(() => chatStore.getChatByGroupInfo())
const isStreaming = computed(() => Boolean(chatStore.isStreamIn))
const globalConfig = computed(() => authStore.globalConfig)
const sideDrawingEditModel = computed(() => authStore.globalConfig?.sideDrawingEditModel)
const isStreamCacheEnabled = computed(() => authStore.globalConfig.streamCacheEnabled === '1')
const copyrightEndYear = computed(() => new Date().getFullYear())
const lastAssistantMessage = computed(() => {
  const list = dataSources.value || []
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const item = list[i]
    if (item?.role !== 'user') return item
  }
  return null
})

// 使用watch监听activeGroupInfo的变化
const configObj = computed(() => {
  const configString = activeGroupInfo.value?.config
  if (!configString) {
    return {} // 提早返回一个空对象
  }

  try {
    return JSON.parse(configString)
  } catch (e) {
    return {} // 解析失败时返回一个空对象
  }
})

// Modified computed property for background image
const activeChatBackgroundImg = computed(() => {
  // Prioritize app detail if available
  if (currentAppDetail.value?.backgroundImg) {
    return currentAppDetail.value.backgroundImg
  }
  // Fallback to configObj
  return configObj.value?.backgroundImg || null
})

const isFlowith = computed(() => {
  return configObj?.value?.modelInfo?.isFlowith
})

const fileParsing = computed(() => {
  return String(configObj?.value?.fileInfo?.fileParsing || '')
})

// 获取模型
const activeModel = computed(() => {
  return String(configObj?.value?.modelInfo?.model || '')
})

// 获取模型名称
const activeModelName = computed(() => {
  return String(configObj?.value?.modelInfo?.modelName || 'AI')
})

// 获取模型类型
const activeModelKeyType = computed(() => {
  return Number(configObj?.value?.modelInfo?.keyType || 1)
})

// 获取模型头像
const activeModelAvatar = computed(() => {
  return String(configObj?.value?.modelInfo?.modelAvatar || '')
})

/* 当前对话组是否是应用 */
const activeAppId = computed(() => activeGroupInfo?.value?.appId || 0)

// ============== 弹窗相关计算属性 ==============
// Computed property for background style
const backgroundStyle = computed(() => {
  if (selectedAppForModal.value?.backgroundImg) {
    return {
      backgroundImage: `url(${selectedAppForModal.value.backgroundImg})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center center',
      backgroundRepeat: 'no-repeat',
    }
  }
  return {}
})

// ============== 监听器 ==============
watch(
  dataSources,
  val => {
    if (val.length === 0) return
    if (firstScroll.value) {
      firstScroll.value = false
      scrollToBottom()
    }
  },
  { immediate: true }
)

watch(
  () => activeGroupId.value,
  async () => {
    setTimeout(scrollToBottom, 100)
  }
)

// 在组件挂载时主动获取用户信息
onMounted(async () => {
  try {
    await authStore.getUserInfo()
  } catch (error) {
    console.error('获取用户信息失败:', error)
  }
})

// Watch activeAppId to fetch app details
watch(
  activeAppId,
  async newAppId => {
    if (newAppId && newAppId > 0) {
      await fetchCurrentAppDetail(newAppId)
    } else {
      currentAppDetail.value = null
    }
  },
  { immediate: false }
)

// Initialize formData when schema changes or modal becomes visible
watch(
  [() => currentFormSchema.value, () => showFormModal.value],
  ([newSchema, newVisible]) => {
    if (newVisible && newSchema && newSchema.length > 0) {
      const initialData: Record<string, any> = {}
      const initialDropdownStates: Record<string, boolean> = {}
      newSchema.forEach(field => {
        initialData[field.title] = ''
        if (field.type === 'select') initialDropdownStates[field.title] = false
      })
      modalFormData.value = initialData
      dropdownStates.value = initialDropdownStates
    }
  },
  { immediate: true }
)

// ============== 生命周期 ==============
onMounted(async () => {
  await chatStore.queryActiveChatLogList()
  await nextTick()

  if (token.value) {
    await otherLoginByToken(token.value)
  }

  if (tradeStatus.value) {
    await handleRefresh()
  }

  if (activeAppId.value && activeAppId.value > 0) {
    await fetchCurrentAppDetail(activeAppId.value)
  }

  useGlobalStore.clearWorkflowContent()
})

// ============== 弹窗相关方法 ==============
function tryParseJson(jsonString: string | undefined | null): FormField[] | null {
  if (!jsonString) return null
  try {
    const parsed = JSON.parse(jsonString)
    if (
      Array.isArray(parsed) &&
      parsed.every(item => item.type && item.title && item.placeholder)
    ) {
      return parsed as FormField[]
    }
    return null
  } catch (error) {
    console.error('Failed to parse prompt JSON:', error)
    return null
  }
}

function selectOption(fieldTitle: string, option: string) {
  modalFormData.value[fieldTitle] = option
}

function handleModalClose() {
  showFormModal.value = false
  currentFormSchema.value = []
  selectedAppForModal.value = null
}

async function handleModalSkip(app: any) {
  showFormModal.value = false
  await handleAppExecution(app)
}

function handleModalSubmit() {
  if (!selectedAppForModal.value) return

  let hasUserInput = false
  for (const fieldTitle in modalFormData.value) {
    const field = currentFormSchema.value.find(f => f.title === fieldTitle)
    if (field && !field.placeholder.includes('(系统生成)') && modalFormData.value[fieldTitle]) {
      hasUserInput = true
      break
    }
  }

  if (!hasUserInput) {
    showFormModal.value = false
    handleAppExecution(selectedAppForModal.value)
    return
  }

  isSubmitting.value = true
  const submitData: Record<string, any> = {}
  currentFormSchema.value.forEach(field => {
    submitData[field.title] = modalFormData.value[field.title] || ''
    if (field.placeholder.includes('(系统生成)')) {
      delete submitData[field.title]
    }
  })

  let formattedData = ''
  for (const key in submitData) {
    if (Object.prototype.hasOwnProperty.call(submitData, key) && submitData[key]) {
      formattedData += `${key}: ${submitData[key]}
`
    }
  }
  formattedData = formattedData.trim()

  handleAppExecutionWithData(selectedAppForModal.value, formattedData)
  setTimeout(() => {
    showFormModal.value = false
    isSubmitting.value = false
  }, 300)
}

function showAppConfigModal(app: any, formSchema: FormField[]) {
  currentFormSchema.value = formSchema
  selectedAppForModal.value = app
  showFormModal.value = true
}

async function handleAppExecution(app: any) {
  if (groupSources.value.length === 0) {
    await createNewChatGroup()
    await chatStore.queryMyGroup()
  }
  await chatStore.addNewChatGroup(Number(app.id))
}

async function handleAppExecutionWithData(app: any, formattedData: string) {
  if (groupSources.value.length === 0) {
    await createNewChatGroup()
    await chatStore.queryMyGroup()
  }

  await chatStore.addNewChatGroup(Number(app.id))
  await nextTick()

  if (chatStore.active === Number(app.id)) {
    onConversation({ msg: formattedData, appId: Number(app.id) })
  } else {
    onConversation({ msg: formattedData })
  }
}

const handleScrollBtm = () => {
  scrollToBottom()
}

const updateWorkflowContent = (text: string, isFirst: boolean = false) => {
  if (!text) return
  if (isFirst) {
    const initialContent = `### AI响应 ${new Date().toLocaleTimeString()}
${text}`
    useGlobalStore.addWorkflowContent(initialContent)
  } else {
    useGlobalStore.updateWorkflowContentLast(text)
  }
}

const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>

const hasVisibleText = (value: any) => String(value || '').trim().length > 0

const looksLikeSerializedPayload = (value: string) => {
  const text = String(value || '').trim()
  if (!text) return false
  if (/^[{\[]/.test(text) && /"[a-zA-Z0-9_]+"\s*:/.test(text)) return true
  if (/(^|[,{])\s*"type"\s*:\s*"text"/.test(text) && /"text"\s*:/.test(text)) return true
  if (
    /"(?:content|reasoning_content|full_reasoning_content|chatId|userBalance|promptReference|fileVectorResult|finishReason)"\s*:/.test(
      text
    )
  ) {
    return true
  }
  if (
    /(?:chatId|finishReason|userBalance|promptReference|fileVectorResult|networkSearchResult|reasoning_content)\s*[:=]/i.test(
      text
    ) &&
    /[{}\[\]]/.test(text)
  ) {
    return true
  }
  if (/ype"\s*:\s*"text"/i.test(text)) return true
  return false
}

const isLikelyJsonFragment = (value: string) => {
  const text = String(value || '').trim()
  if (!text) return false
  if (looksLikeSerializedPayload(text)) return true
  return /^[{\[]/.test(text) && /"[a-zA-Z0-9_]+"\s*:/.test(text)
}

const containsPayloadArtifacts = (value: string) => {
  const text = String(value || '').trim()
  if (!text) return false
  if (looksLikeSerializedPayload(text) || isLikelyJsonFragment(text)) return true
  if (/"[\w$]+"\s*:/.test(text) && /[{}\[\]]/.test(text)) return true
  if (/ype"\s*:\s*"text"/i.test(text) && /[{}\[\]]/.test(text)) return true
  return false
}

const isNoiseOnlyText = (value: string) => {
  const text = String(value || '').trim()
  if (!text) return false
  // 仅由符号组成但携带结构换行时（如 "。\n\n"），不能当噪声丢弃，否则会破坏段落/表格前置换行。
  if (/\n/.test(String(value || ''))) return false
  // 避免仅由流式占位符组成的残片落盘显示（例如 "."、"......"）
  return /^[.。…·\s]+$/.test(text)
}

const isAcademicHeartbeatText = (value: string) => {
  const text = String(value || '').trim()
  if (!text) return true
  if (/^[.。…·\s]+$/.test(text)) return true
  if (/`执行中`/i.test(text) && text.length < 180) return true
  if (/^\s*执行中\s*[:：]\s*\[.*\]\s*$/i.test(text)) return true
  if (/^\s*多线程操作已经开始/i.test(text)) return true
  if (/任务处理中\s*[，,]?\s*请稍候\s*[（(][^）)\n]{0,240}[）)]/i.test(text)) return true
  if (/分析结果[:：].*Latex主文件是/i.test(text) && text.length < 320) return true
  if (/正在精细切分latex文件/i.test(text) && text.length < 320) return true
  if (/主程序即将开始/i.test(text) && text.length < 220) return true
  if (/^\s*请开始多线程操作[。.]?\s*$/i.test(text)) return true
  if (
    /^\s*`?(?:等待中|执行中|已成功|截断重试|已失败|输入过长已放弃|重试中\s*\d+\/\d+|等待重试\s*\d+)`?(?:\s*[:：].*)?\s*$/i.test(
      text
    ) &&
    text.length < 320
  ) {
    return true
  }
  if (/waiting\s+gpt\s+response/i.test(text)) return true
  if (/^\[local\s+message\]/i.test(text)) return true
  if (
    /^(?:注意事项|此插件Windows支持最佳|Linux下必须使用Docker安装|详见项目主README\.md|目前对机器学习类文献转化效果最好|仅在Windows系统进行了测试|如果有Latex环境，请使用)/i.test(
      text
    ) &&
    text.length < 420
  ) {
    return true
  }
  if (/^对整个Latex项目进行(?:润色|纠错|翻译)/i.test(text) && text.length < 260) return true
  if (/^将PDF转换为Latex项目/i.test(text) && text.length < 260) return true
  if (
    /(正在提取摘要并下载pdf文档|下载arxiv论文并翻译摘要|读取并摘要arxiv论文|arxiv论文下载|正在获取文献名|下载中)/i.test(
      text
    ) &&
    text.length < 260
  ) {
    return true
  }
  return false
}

const shouldDropAcademicChunk = (value: string) => {
  const text = String(value || '')
  if (!text) return true
  const hasStructuralBreak = /\n/.test(text)
  if (isNoiseOnlyText(text)) return true
  if (containsPayloadArtifacts(text)) return true
  if (isAcademicHeartbeatText(text) && !hasStructuralBreak) return true
  return false
}

const stripSerializedPayloadArtifacts = (value: string) => {
  const raw = String(value || '')
  if (!raw.trim()) return ''
  if (!containsPayloadArtifacts(raw)) return raw
  const extracted = decodeSerializedTextPayload(raw)
  const text = String(extracted || '')
  if (!text) return ''
  if (containsPayloadArtifacts(text) || isLikelyJsonFragment(text)) return ''
  return text
}

const normalizeIncomingText = (
  value: string,
  options: { trim?: boolean; mode?: 'stream' | 'final' } = {}
) => {
  const { trim = false, mode = 'final' } = options
  let text = String(value || '')
  if (!text) return ''
  text = text
    .replace(/\[\s*Local\s+Message\s*]\s*/gi, '')
    .replace(
      /(?:函数)?插件(?:作者|贡献者)\s*[:：]?\s*(?:[A-Za-z0-9_.-]+(?:\s*[,，、/&]\s*[A-Za-z0-9_.-]+)*)[，,;；。\s]*/gi,
      ''
    )
    .replace(/(?:函数)?插件(?:作者|贡献者)\[[^\]]+\][，,。.\s]*/gi, '')
    .replace(/^\s*函数插件功能[？?]\s*$/gim, '')
    .replace(/^\s*对整个Latex项目进行(?:润色|纠错|翻译)[^\n]*$/gim, '')
    .replace(/^\s*将PDF转换为Latex项目[^\n]*$/gim, '')
    .replace(/^\s*注意事项[:：][^\n]*$/gim, '')
    .replace(/^\s*此插件Windows支持最佳[^\n]*$/gim, '')
    .replace(/^\s*Linux下必须使用Docker安装[^\n]*$/gim, '')
    .replace(/^\s*详见项目主README\.md[^\n]*$/gim, '')
    .replace(/^\s*目前对机器学习类文献转化效果最好[^\n]*$/gim, '')
    .replace(/^\s*仅在Windows系统进行了测试[^\n]*$/gim, '')
    .replace(/^\s*如果有Latex环境，请使用[^\n]*$/gim, '')
    .replace(/^\s*分析结果[:：][^\n]*Latex主文件是[^\n]*$/gim, '')
    .replace(/^\s*主程序即将开始[^\n]*$/gim, '')
    .replace(/^\s*正在精细切分latex文件[^\n]*$/gim, '')
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
    .replace(/\r\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')

  if (mode === 'final' && text.trim()) {
    text = stripSerializedPayloadArtifacts(text)
  }
  return trim ? text.trim() : text
}

const joinTextSegments = (segments: string[]) => {
  let merged = ''
  ;(segments || []).forEach(item => {
    const current = String(item || '')
    if (!current) return
    merged = mergeStreamText(merged, current)
  })
  return merged
}

const mergeStreamText = (current: string, incoming: string) => {
  const prev = String(current || '')
  const next = String(incoming || '')
  if (!next) return prev
  if (!prev) return next
  if (next === prev) return prev
  if (next.startsWith(prev)) return next
  if (prev.includes(next) && next.length >= 96) return prev
  if (next.includes(prev) && prev.length >= 96) return next
  return `${prev}${next}`
}

const scoreTextStructure = (value: string) => {
  const text = String(value || '')
  if (!text.trim()) return 0
  let score = 0
  const lineCount = text.split('\n').length
  if (lineCount > 2) score += 2
  if (/\n\s*[-*]\s+/.test(text)) score += 2
  if (/\n\s*\d+[.)、]\s+/.test(text)) score += 2
  if (/\n\s*#{1,6}\s+/.test(text)) score += 2
  if (/\|.*\|/.test(text) && /\n\s*[-: ]+\|/.test(text)) score += 3
  if (/```/.test(text)) score += 3
  if (/<details>|<\/details>|<summary>|<\/summary>/i.test(text)) score += 2
  return score
}

const polishReasonTableHeaderPattern =
  /^\s*\|\s*修改前原文片段\s*\|\s*修改后片段\s*\|\s*修改原因与解释\s*\|\s*$/m

const markdownTableLinePattern = /^\s*\|.*\|\s*$/

const countMarkdownTableRows = (value: string) =>
  String(value || '')
    .split('\n')
    .filter(line => markdownTableLinePattern.test(String(line || '').trim())).length

const extractStablePolishReasonTable = (value: string) => {
  const normalized = normalizeIncomingText(value, { trim: true })
  if (!normalized) return ''

  const lines = normalized.split('\n')
  const start = lines.findIndex(line => polishReasonTableHeaderPattern.test(String(line || '')))
  if (start < 0) return ''

  let end = start + 1
  while (end < lines.length && markdownTableLinePattern.test(String(lines[end] || '').trim())) {
    end += 1
  }

  const tableBlock = lines
    .slice(start, end)
    .map(line => String(line || '').trimEnd())
    .join('\n')
    .trim()

  return countMarkdownTableRows(tableBlock) >= 3 ? tableBlock : ''
}

const pickBetterPolishTableSnapshot = (current: string, candidate: string) => {
  const currentTable = extractStablePolishReasonTable(current)
  const candidateTable = extractStablePolishReasonTable(candidate)
  if (!candidateTable) return currentTable
  if (!currentTable) return candidateTable

  const currentRows = countMarkdownTableRows(currentTable)
  const candidateRows = countMarkdownTableRows(candidateTable)
  if (candidateRows > currentRows) return candidateTable
  return currentTable
}

const chooseBetterFinalText = (streamText: string, finalText: string) => {
  const current = normalizeIncomingText(streamText, { trim: true })
  const next = normalizeIncomingText(finalText, { trim: true })
  if (!next) return current
  if (!current) return next
  if (current === next) return next

  const currentPolishTable = extractStablePolishReasonTable(current)
  const nextPolishTable = extractStablePolishReasonTable(next)

  const currentScore = scoreTextStructure(current)
  const nextScore = scoreTextStructure(next)
  const currentHasStructuredMarkdown =
    /```|^\s*#{1,6}\s+|^\s*[-*]\s+|^\s*\d+[.)、]\s+|^\s*\|/m.test(current)
  const nextHasStructuredMarkdown = /```|^\s*#{1,6}\s+|^\s*[-*]\s+|^\s*\d+[.)、]\s+|^\s*\|/m.test(
    next
  )

  if (currentPolishTable && nextPolishTable) {
    const currentRows = countMarkdownTableRows(currentPolishTable)
    const nextRows = countMarkdownTableRows(nextPolishTable)
    if (currentRows > nextRows) return current
    if (currentRows === nextRows && currentScore >= nextScore) return current
  }
  if (currentPolishTable && !nextPolishTable) return currentPolishTable
  if (!currentPolishTable && nextPolishTable) return nextPolishTable

  // 优先保留流式阶段已经形成的结构化内容，避免 final 覆盖导致“挤成一段”。
  if (currentHasStructuredMarkdown && !nextHasStructuredMarkdown && currentScore >= nextScore) {
    return current
  }
  if (nextScore >= currentScore + 3) return next
  if (currentScore >= nextScore + 1) return current

  if (next.includes(current)) return next
  if (current.includes(next)) return current
  if (next.length >= Math.floor(current.length * 1.15) && nextScore >= currentScore) return next
  return current
}

const hasStablePolishReasonTable = (value: string) => Boolean(extractStablePolishReasonTable(value))

const extractTextChunk = (payload: any): string => {
  if (!payload) return ''
  if (typeof payload === 'string') return decodeSerializedTextPayload(payload)
  if (Array.isArray(payload)) {
    return joinTextSegments(payload.map(item => extractTextChunk(item)))
  }
  if (typeof payload === 'object') {
    if (typeof payload.text === 'string') return decodeSerializedTextPayload(payload.text)
    if (typeof payload.content === 'string') return decodeSerializedTextPayload(payload.content)
    if (payload.content) return extractTextChunk(payload.content)
    if (payload.message) return extractTextChunk(payload.message)
    if (payload.response) return extractTextChunk(payload.response)
    if (payload.delta?.content) return extractTextChunk(payload.delta.content)
  }
  return ''
}

const splitConcatenatedJsonObjects = (value: string) => {
  const raw = String(value || '').trim()
  if (!raw) return [] as string[]
  const segments: string[] = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (char === '\\') {
      escaped = true
      continue
    }
    if (char === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (char === '{') {
      if (depth === 0) start = i
      depth += 1
      continue
    }
    if (char === '}') {
      depth -= 1
      if (depth === 0 && start >= 0) {
        segments.push(raw.slice(start, i + 1))
        start = -1
      }
    }
  }
  return segments
}

const decodeSerializedTextPayload = (value: string) => {
  const raw = String(value || '')
  if (!raw.length) return ''
  const trimmed = raw.trim()
  if (!trimmed) return raw

  const maybeSerialized =
    looksLikeSerializedPayload(trimmed) || isLikelyJsonFragment(trimmed) || /}\s*{/.test(trimmed)
  if (!maybeSerialized) return raw

  const tryExtract = (candidate: string) => {
    try {
      return extractTextChunk(JSON.parse(candidate))
    } catch (_error) {
      return ''
    }
  }

  const direct = tryExtract(trimmed)
  if (direct) return direct

  const segments = splitConcatenatedJsonObjects(trimmed)
  if (!segments.length) {
    const textMatches = Array.from(
      trimmed.matchAll(/"(?:text|content|message|response)"\s*:\s*"((?:\\.|[^"\\])*)"/g)
    )
    if (!textMatches.length) return ''
    return joinTextSegments(
      textMatches.map(match => {
        const candidate = String(match?.[1] || '')
        if (!candidate) return ''
        try {
          return JSON.parse(`"${candidate.replace(/"/g, '\\"')}"`)
        } catch (_error) {
          return candidate.replace(/\\n/g, '\n')
        }
      })
    )
  }

  const recovered: string[] = []
  segments.forEach(segment => {
    const extracted = tryExtract(segment)
    if (extracted) recovered.push(extracted)
  })
  // 保留分片中的前后空白，避免流式拼接时出现单词粘连。
  return recovered.length ? joinTextSegments(recovered) : ''
}

const onConversation = async ({
  msg,
  action,
  drawId,
  customId,
  model,
  modelName,
  modelType,
  modelAvatar,
  appId,
  extraParam,
  fileUrl,
  chatId,
  taskId,
  imageUrl,
  overwriteReply,
  replyChatId,
  editIndex,
  replyIndex,
}: Chat.ConversationParams) => {
  if (!isLogin.value) {
    authStore.setLoginDialog(true)
    return
  }

  if (groupSources.value.length === 0) {
    await createNewChatGroup()
    await chatStore.queryMyGroup()
  }

  const useModelName = modelName || activeModelName.value
  const useModelType = modelType || activeModelKeyType.value || 1
  const useModelAvatar = modelAvatar || activeModelAvatar.value
  const useAppId = appId || activeAppId.value
  const messageText = msg || '提问'

  let useModel = model || activeModel.value

  controller.value = new AbortController()
  clearLastError()

  const options: any = {
    groupId: +activeGroupId.value,
    fileParsing: fileParsing.value,
    usingNetwork: chatStore.usingNetwork,
    usingDeepThinking: chatStore.usingDeepThinking,
  }
  // 仅发送当前轮次显式提交的附件，避免把历史附件自动带入新请求。
  const requestFileUrl = String(fileUrl || '')

  const activeList = chatStore.chatList || []
  let assistantIndex = -1
  let effectiveReplyChatId = Number(replyChatId || 0)
  const directReplyIndex =
    typeof replyIndex === 'number' &&
    replyIndex >= 0 &&
    activeList[replyIndex]?.role === 'assistant'
      ? replyIndex
      : -1

  const applyAssistantOverwriteState = (idx: number) => {
    assistantIndex = idx
    updateGroupChatSome(assistantIndex, {
      // 重新生成/编辑采用同条回复覆盖，不新建 assistant 气泡。
      content: '',
      reasoningText: '',
      model: useModel,
      modelName: useModelName,
      modelType: useModelType,
      modelAvatar: useModelAvatar,
      loading: true,
      error: false,
      status: 1,
    })
  }

  const truncateVisibleTailAfter = (idx: number) => {
    if (idx < 0) return
    const currentList = chatStore.chatList || []
    if (idx >= currentList.length - 1) return
    currentList.splice(idx + 1)
  }

  if (overwriteReply && directReplyIndex >= 0) {
    effectiveReplyChatId = Number(activeList[directReplyIndex]?.chatId || effectiveReplyChatId || 0)
    applyAssistantOverwriteState(directReplyIndex)
  }

  if (overwriteReply && assistantIndex < 0 && effectiveReplyChatId) {
    const globalExactIndex = activeList.findIndex(
      item => item?.role === 'assistant' && Number(item?.chatId || 0) === effectiveReplyChatId
    )
    if (globalExactIndex >= 0) {
      applyAssistantOverwriteState(globalExactIndex)
    }
  }

  if (overwriteReply) {
    const hasExplicitReplyTarget = directReplyIndex >= 0 || effectiveReplyChatId > 0
    if (!hasExplicitReplyTarget) {
      chatStore.setStreamIn(false)
      useGlobalStore.updateIsChatIn(false)
      ms.error('未定位到可覆盖的回复，请刷新页面后重试')
      return
    }

    const targetEditIndex =
      typeof editIndex === 'number' ? editIndex : typeof replyIndex === 'number' ? replyIndex : -1

    if (targetEditIndex >= 0 && activeList[targetEditIndex]?.role === 'user') {
      updateGroupChatSome(targetEditIndex, {
        content: messageText,
        imageUrl: imageUrl || '',
        fileUrl: requestFileUrl || activeList[targetEditIndex]?.fileUrl || '',
      })
      // 优先覆盖点击来源对应的 assistant，避免同一用户消息下多回复时覆盖错位。
      if (assistantIndex < 0 && effectiveReplyChatId) {
        const exactReplyIndex = activeList.findIndex(
          (item, idx) =>
            idx > targetEditIndex &&
            item?.role === 'assistant' &&
            Number(item?.chatId || 0) === effectiveReplyChatId
        )
        if (exactReplyIndex >= 0) {
          applyAssistantOverwriteState(exactReplyIndex)
        }
      }
      if (assistantIndex < 0) {
        for (let idx = targetEditIndex + 1; idx < activeList.length; idx += 1) {
          const item = activeList[idx]
          if (item?.role === 'user') break
          if (item?.role === 'assistant') {
            effectiveReplyChatId = Number(activeList[idx]?.chatId || effectiveReplyChatId || 0)
            applyAssistantOverwriteState(idx)
            break
          }
        }
      }
    }

    if (assistantIndex < 0 && effectiveReplyChatId) {
      const idx = activeList.findIndex(
        item => item?.role === 'assistant' && Number(item?.chatId) === effectiveReplyChatId
      )
      if (idx >= 0) {
        applyAssistantOverwriteState(idx)
      }
    }
  }

  if (assistantIndex < 0 && overwriteReply) {
    chatStore.setStreamIn(false)
    useGlobalStore.updateIsChatIn(false)
    ms.error('未找到可覆盖的历史回复，请刷新后重试')
    return
  }

  if (overwriteReply && assistantIndex >= 0) {
    truncateVisibleTailAfter(assistantIndex)
  }

  if (assistantIndex < 0) {
    addGroupChat({
      content: messageText,
      model: useModel,
      modelName: modelName,
      modelType: useModelType,
      role: 'user',
      fileUrl: requestFileUrl,
      imageUrl: imageUrl || '',
    })

    addGroupChat({
      content: '',
      model: useModel,
      action: action || '',
      loading: true,
      modelName: useModelName,
      modelType: useModelType,
      role: 'assistant',
      error: false,
      status: 1,
      useFileSearch: !!requestFileUrl || isFlowith.value,
      fileUrl: requestFileUrl,
      modelAvatar: useModelAvatar,
      pluginParam: usingPlugin.value?.parameters,
      usingNetwork: chatStore.usingNetwork,
      usingDeepThinking: chatStore.usingDeepThinking,
    })
    assistantIndex = dataSources.value.length - 1
  }

  await scrollToBottom()
  chatStore.setStreamIn(true)
  useGlobalStore.updateIsChatIn(true)

  let fullText = ''
  let displayedText = ''
  let fullReasoningText = ''
  let displayedReasoningText = ''
  let networkSearchResult = ''
  let tool_calls = ''
  let promptReference = ''
  let mcpToolUse = ''
  let fileVectorResult = ''
  let finishReason = ''
  let nodeType = ''
  let stepName = ''
  let workflowProgress = 0
  let assistantLogId = String(effectiveReplyChatId || '')
  let streamRequestId = ''
  let preservedStructuredContent = ''
  let stablePolishTableSnapshot = ''
  let academicPluginRequestName = ''
  let academicCoreRequestName = ''

  const isPolishAcademicTask = () =>
    academicMode.value &&
    ['中文润色', '英文润色'].includes(
      String(academicCoreRequestName || academicPluginRequestName || '').trim()
    )

  const patchCurrentAssistant = (payload: Partial<Chat.Chat>) => {
    if (assistantIndex < 0) return
    updateGroupChatSome(assistantIndex, {
      model: useModel,
      modelName: useModelName,
      modelType: useModelType,
      modelAvatar: useModelAvatar,
      ...payload,
    })
  }

  const sanitizeStreamChunk = (rawText: string) => {
    const decoded = decodeSerializedTextPayload(String(rawText ?? ''))
    const sanitized = normalizeIncomingText(decoded, { mode: 'stream' })
    if (!sanitized) return ''
    const isWhitespaceOnly = sanitized.length > 0 && sanitized.trim().length === 0
    if (!isWhitespaceOnly && (isNoiseOnlyText(sanitized) || containsPayloadArtifacts(sanitized)))
      return ''
    return sanitized
  }

  const appendContent = (
    rawText: string,
    target: 'content' | 'reasoning',
    alreadySanitized = false
  ) => {
    const sanitized = alreadySanitized ? String(rawText ?? '') : sanitizeStreamChunk(rawText)
    if (!sanitized) return
    const isWhitespaceChunk = sanitized.length > 0 && sanitized.trim().length === 0
    if (academicMode.value && !isWhitespaceChunk && shouldDropAcademicChunk(sanitized)) return

    if (target === 'reasoning') {
      fullReasoningText = mergeStreamText(fullReasoningText, sanitized)
      displayedReasoningText = fullReasoningText
    } else {
      fullText = mergeStreamText(fullText, sanitized)
      displayedText = fullText
      if (isPolishAcademicTask()) {
        stablePolishTableSnapshot = pickBetterPolishTableSnapshot(
          stablePolishTableSnapshot,
          displayedText
        )
      }
      updateWorkflowContent(sanitized, fullText === sanitized)
    }

    patchCurrentAssistant({
      chatId: assistantLogId ? Number(assistantLogId) : undefined,
      content: displayedText,
      reasoningText: displayedReasoningText,
      mcpToolUse,
      networkSearchResult,
      fileVectorResult,
      tool_calls,
      promptReference,
      nodeType,
      stepName,
      workflowProgress,
      loading: true,
      error: false,
      status: 1,
      modelType: useModelType,
      modelName: useModelName,
    })

    scrollToBottomIfAtBottom()
  }

  let ndjsonBuffer = ''
  let processedResponseLength = 0

  const consumeJsonPayload = (jsonObj: any) => {
    if (!jsonObj || typeof jsonObj !== 'object') return

    if (jsonObj?.requestId) {
      streamRequestId = String(jsonObj.requestId)
      lastErrorRequestId.value = streamRequestId
    }

    if (jsonObj?.userBalance) authStore.updateUserBalance(jsonObj.userBalance)
    if (jsonObj?.nodeType) nodeType = String(jsonObj.nodeType)
    if (jsonObj?.stepName) stepName = String(jsonObj.stepName)
    if (typeof jsonObj?.progress === 'number') workflowProgress = jsonObj.progress
    if (jsonObj?.chatId) assistantLogId = String(jsonObj.chatId)
    if (jsonObj?.finishReason) finishReason = String(jsonObj.finishReason)
    if (jsonObj?.mcpToolUse) mcpToolUse = String(jsonObj.mcpToolUse)
    if (jsonObj?.networkSearchResult) networkSearchResult = String(jsonObj.networkSearchResult)
    if (jsonObj?.fileVectorResult) {
      fileVectorResult =
        typeof jsonObj.fileVectorResult === 'string'
          ? jsonObj.fileVectorResult
          : JSON.stringify(jsonObj.fileVectorResult)
    }
    if (jsonObj?.tool_calls) {
      tool_calls =
        typeof jsonObj.tool_calls === 'string'
          ? jsonObj.tool_calls
          : JSON.stringify(jsonObj.tool_calls)
    }
    if (jsonObj?.promptReference) promptReference = String(jsonObj.promptReference)

    // 学术后端在“中间流内容被最终结果覆盖”时会发送 resetContent。
    // 这里必须清空已拼接内容，否则会把旧中间态和最终态混在一起，破坏 Markdown 表格结构。
    if (jsonObj?.resetContent) {
      if (isPolishAcademicTask() && fullText.trim()) {
        preservedStructuredContent = chooseBetterFinalText(preservedStructuredContent, fullText)
        stablePolishTableSnapshot = pickBetterPolishTableSnapshot(
          stablePolishTableSnapshot,
          fullText
        )
      }
      fullText = ''
      displayedText = ''
    }

    const contentChunk = extractTextChunk(
      jsonObj?.content ??
        jsonObj?.delta?.content ??
        jsonObj?.text ??
        jsonObj?.message ??
        jsonObj?.response
    )
    const finalChunk = extractTextChunk(jsonObj?.finalContent)
    const reasoningChunk = extractTextChunk(
      jsonObj?.reasoning_content ?? jsonObj?.reasoningContent ?? jsonObj?.full_reasoning_content
    )

    if (reasoningChunk) appendContent(reasoningChunk, 'reasoning')
    if (contentChunk) appendContent(contentChunk, 'content')

    if (finalChunk) {
      const normalizedFinal = normalizeIncomingText(decodeSerializedTextPayload(finalChunk), {
        trim: true,
      })
      if (
        normalizedFinal &&
        !containsPayloadArtifacts(normalizedFinal) &&
        (!academicMode.value || !shouldDropAcademicChunk(normalizedFinal))
      ) {
        const streamBaseline = stablePolishTableSnapshot || preservedStructuredContent || fullText
        const lockedPolishTable = isPolishAcademicTask()
          ? stablePolishTableSnapshot ||
            extractStablePolishReasonTable(normalizedFinal) ||
            extractStablePolishReasonTable(streamBaseline)
          : ''
        const preferred =
          isPolishAcademicTask() && lockedPolishTable
            ? lockedPolishTable
            : academicMode.value && !isPolishAcademicTask()
              ? normalizedFinal
              : chooseBetterFinalText(streamBaseline, normalizedFinal)
        fullText = preferred
        displayedText = preferred
        patchCurrentAssistant({
          chatId: assistantLogId ? Number(assistantLogId) : undefined,
          content: displayedText,
          reasoningText: displayedReasoningText,
          mcpToolUse,
          networkSearchResult,
          fileVectorResult,
          tool_calls,
          promptReference,
          nodeType,
          stepName,
          workflowProgress,
          loading: true,
          error: false,
          status: 1,
          modelType: useModelType,
          modelName: useModelName,
        })
      }
    }

    if (jsonObj?.streamError && !contentChunk) {
      const messageText = String(jsonObj.streamError)
      lastError.value = normalizeIncomingText(messageText, { trim: true })
    }
  }

  const processNdjsonLine = (lineRaw: string, options: { appendLineBreak?: boolean } = {}) => {
    const { appendLineBreak = false } = options
    let normalizedLine = String(lineRaw ?? '').replace(/\r/g, '')
    const marker = normalizedLine.trim()
    if (!marker) {
      if (appendLineBreak) appendContent('\n', 'content', true)
      return
    }

    if (/^\s*data:/i.test(normalizedLine)) {
      normalizedLine = normalizedLine.replace(/^\s*data:\s?/i, '')
    }
    const normalizedMarker = normalizedLine.trim()
    if (!normalizedMarker) return
    if (/^(?:event|id|retry):/i.test(normalizedMarker)) return
    if (/^\[done\]$/i.test(normalizedMarker)) return

    try {
      const jsonObj = JSON.parse(normalizedLine)
      consumeJsonPayload(jsonObj)
      return
    } catch (_error) {
      const segments = splitConcatenatedJsonObjects(normalizedLine)
      if (segments.length) {
        let consumed = false
        segments.forEach(segment => {
          try {
            const jsonObj = JSON.parse(segment)
            consumeJsonPayload(jsonObj)
            consumed = true
          } catch (_segmentError) {}
        })
        // 流式分片场景下，能解析出任意 JSON 即视作成功消费，避免把 JSON 残片误渲染为正文。
        if (consumed) return
      }

      if (isLikelyJsonFragment(normalizedLine) || looksLikeSerializedPayload(normalizedLine)) {
        return
      }
      const normalizedFallback = sanitizeStreamChunk(normalizedLine)
      if (!normalizedFallback) return
      if (academicMode.value && shouldDropAcademicChunk(normalizedFallback)) return
      const fallbackWithBreak = appendLineBreak ? `${normalizedFallback}\n` : normalizedFallback
      appendContent(fallbackWithBreak, 'content', true)
    }
  }

  const flushNdjsonBuffer = () => {
    const tail = ndjsonBuffer
    if (!tail.trim()) {
      ndjsonBuffer = ''
      return
    }
    try {
      processNdjsonLine(tail)
    } catch (err) {
      console.error('[stream] failed to process tail:', err)
    }
    ndjsonBuffer = ''
  }

  const handleStreamProgress = ({ event }) => {
    const target: any = event?.target || {}
    const responseText = String(target?.responseText || '')
    const isChunkMode = Boolean(target?.isChunk)
    let incrementalText = ''

    if (isChunkMode) {
      incrementalText = responseText
    } else if (responseText.length >= processedResponseLength) {
      incrementalText = responseText.slice(processedResponseLength)
      processedResponseLength = responseText.length
    } else {
      incrementalText = responseText
      processedResponseLength = responseText.length
    }

    if (!incrementalText) return

    ndjsonBuffer += incrementalText
    let newlineIndex = ndjsonBuffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = ndjsonBuffer.slice(0, newlineIndex)
      ndjsonBuffer = ndjsonBuffer.slice(newlineIndex + 1)
      processNdjsonLine(line, { appendLineBreak: true })
      newlineIndex = ndjsonBuffer.indexOf('\n')
    }
  }

  try {
    const pluginCandidate = getAcademicPluginRequestName(academicPlugin.value)
    const pluginName = pluginCandidate && pluginCandidate !== '不启用' ? pluginCandidate : ''
    const coreCandidate = getAcademicCoreRequestName(academicCore.value)
    const coreName = !pluginName && coreCandidate && coreCandidate !== '不启用' ? coreCandidate : ''
    academicPluginRequestName = pluginName
    academicCoreRequestName = coreName
    const academicFunction = pluginName ? 'plugin' : coreName ? 'basic' : 'chat'
    const academicPluginKwargsPayload = pluginName ? academicPluginKwargs.value : {}

    const updatedExtraParam = extraParam

    if (academicMode.value) {
      await fetchAcademicChatAPIProcess({
        data: {
          function: academicFunction,
          core_function: coreName || undefined,
          plugin_name: pluginName || undefined,
          plugin_kwargs: academicPluginKwargsPayload,
          main_input: messageText,
          chatId: chatId ? Number(chatId) : undefined,
          overwriteReply: Boolean(overwriteReply),
          replyChatId: effectiveReplyChatId || undefined,
          model: useModel,
          modelName: useModelName,
          modelType: useModelType,
          modelAvatar: useModelAvatar,
          appId: useAppId || 0,
          fileUrl: requestFileUrl,
          options,
        },
        signal: controller.value.signal,
        onDownloadProgress: handleStreamProgress,
      })
    } else {
      await fetchChatAPIProcess({
        model: useModel,
        modelName: useModelName,
        modelType: useModelType,
        prompt: messageText,
        usingPluginId: usingPlugin.value?.parameters ? 999 : 0,
        imageUrl: imageUrl || '',
        fileUrl: requestFileUrl,
        appId: useAppId || 0,
        modelAvatar: useModelAvatar,
        options,
        signal: controller.value.signal,
        extraParam: updatedExtraParam,
        chatId: chatId ? String(chatId) : undefined,
        overwriteReply: Boolean(overwriteReply),
        replyChatId: effectiveReplyChatId || undefined,
        onDownloadProgress: handleStreamProgress,
      })
    }
  } catch (error: any) {
    const errData = error?.data || error?.response?.data || {}
    const errorMessage =
      errData?.message || errData?.error || error?.message || '请求失败，请稍后重试'
    const requestId = errData?.requestId || streamRequestId || ''
    lastError.value = errorMessage
    lastErrorRequestId.value = requestId
    const suffix = requestId ? `（请求ID: ${requestId}）` : ''
    ms.error(`${errorMessage}${suffix}`)
    triggerUpgradeIfNeeded(errorMessage)
    patchCurrentAssistant({
      chatId: assistantLogId ? Number(assistantLogId) : undefined,
      content: normalizeIncomingText(errorMessage, { trim: true }),
      reasoningText: displayedReasoningText,
      mcpToolUse,
      networkSearchResult,
      fileVectorResult,
      tool_calls,
      promptReference,
      error: true,
      loading: false,
      status: 4,
      modelType: useModelType,
      modelName: useModelName,
    })
  } finally {
    flushNdjsonBuffer()

    if (academicMode.value && isAcademicHeartbeatText(displayedText)) {
      displayedText = ''
    }
    if (academicMode.value && isAcademicHeartbeatText(fullText)) {
      fullText = ''
    }
    if (isNoiseOnlyText(displayedText)) {
      displayedText = ''
    }
    if (isNoiseOnlyText(fullText)) {
      fullText = ''
    }

    if (!hasVisibleText(displayedText) && hasVisibleText(fullText)) {
      displayedText = fullText
    }
    const lockedPolishTable = isPolishAcademicTask()
      ? stablePolishTableSnapshot ||
        extractStablePolishReasonTable(fullText) ||
        extractStablePolishReasonTable(displayedText)
      : ''
    if (lockedPolishTable) {
      stablePolishTableSnapshot = lockedPolishTable
      displayedText = lockedPolishTable
      fullText = lockedPolishTable
    }
    if (!hasVisibleText(displayedReasoningText) && hasVisibleText(fullReasoningText)) {
      displayedReasoningText = fullReasoningText
    }

    // 使用同一套清洗规则判断“可见内容”，避免 raw 文本非空但清洗后为空导致页面看起来无回复。
    const visibleContent = normalizeIncomingText(displayedText, { trim: true })
    const visibleReasoning = normalizeIncomingText(displayedReasoningText, { trim: true })
    const preservedVisible = normalizeIncomingText(
      lockedPolishTable || preservedStructuredContent,
      {
        trim: true,
      }
    )
    const isErrorResponse =
      Boolean(lastError.value) || (finishReason === 'error' && !visibleContent)
    if (!visibleContent) {
      if (preservedVisible) {
        displayedText = preservedVisible
      } else if (fileVectorResult) {
        displayedText = '文件已生成，可在下方下载。'
      } else if (isErrorResponse && lastError.value) {
        displayedText = normalizeIncomingText(lastError.value, { trim: true })
      } else if (academicMode.value) {
        displayedText = '学术后端未返回摘要内容，请重试。'
      } else {
        displayedText = '服务未返回可展示内容，请重试。'
      }
    } else {
      displayedText = visibleContent
    }

    if (visibleReasoning) {
      displayedReasoningText = visibleReasoning
    }

    patchCurrentAssistant({
      chatId: assistantLogId ? Number(assistantLogId) : undefined,
      content: displayedText,
      reasoningText: displayedReasoningText,
      mcpToolUse,
      networkSearchResult,
      fileVectorResult,
      tool_calls,
      promptReference,
      loading: false,
      error: isErrorResponse,
      status: isErrorResponse ? 4 : 3,
      modelType: useModelType,
      modelName: useModelName,
    })

    chatStore.setStreamIn(false)
    useGlobalStore.updateIsChatIn(false)
    scrollToBottomIfAtBottom(200)
  }
}

// 其他登录方式
const otherLoginByToken = async (tokenValue: string) => {
  try {
    authStore.setToken(tokenValue)
    ms.success('账户登录成功、开始体验吧！')
    await authStore.getUserInfo()
  } catch (error) {
    console.error('登录过程中发生错误:', error)
  }
}

// 支付回调处理
const handleRefresh = async () => {
  if (tradeStatus.value.toLowerCase().includes('success')) {
    ms.success('支付成功，感谢支持！')
    await authStore.getUserBalance()
  }
}

const handleDelete = async (item: Chat.Chat) => {
  if (isStreaming.value) return
  if (item?.chatId) {
    await chatStore.deleteChatById(item.chatId)
    return
  }
  const idx = dataSources.value.findIndex(chat => chat === item)
  if (idx >= 0) {
    chatStore.chatList.splice(idx, 1)
  }
}

const handleEditConversation = async (payload: Record<string, any>) => {
  return onConversation(payload)
}

const handleRegenerate = async (
  index: number,
  chatId: number,
  modelInfo?: {
    model?: string
    modelName?: string
    modelType?: number
    modelAvatar?: string
  }
) => {
  if (isStreaming.value || isRegenerating.value) return
  const list = dataSources.value || []
  const assistant = list[index]
  if (!assistant) return

  let userIndex = index - 1
  while (userIndex >= 0 && list[userIndex]?.role !== 'user') {
    userIndex -= 1
  }
  if (userIndex < 0) return

  const userMsg = list[userIndex]
  const targetReplyId = Number(assistant?.chatId || chatId || 0)

  isRegenerating.value = true
  try {
    await handleEditConversation({
      msg: String(userMsg?.content || ''),
      imageUrl: userMsg?.imageUrl,
      fileUrl: userMsg?.fileUrl,
      model: modelInfo?.model || activeModel.value,
      modelName: modelInfo?.modelName || activeModelName.value,
      modelType: modelInfo?.modelType || activeModelKeyType.value,
      modelAvatar: modelInfo?.modelAvatar || activeModelAvatar.value,
      overwriteReply: true,
      chatId: userMsg?.chatId ? String(userMsg.chatId) : undefined,
      replyChatId: targetReplyId || undefined,
      editIndex: userIndex,
      replyIndex: index,
    })
  } finally {
    isRegenerating.value = false
  }
}

// ============== 方法定义 ==============

// Toggle AppList visibility
const toggleAppList = () => {
  useGlobalStore.updateShowAppListComponent(!useGlobalStore.showAppListComponent)
}

// Toggle TextEditor visibility
const toggleTextEditor = () => {
  useGlobalStore.updateTextEditor(!useGlobalStore.showTextEditor)
}

const pauseRequest = () => {
  controller.value.abort()
  controller.value = new AbortController()
  chatStore.setStreamIn(false)
  useGlobalStore.updateIsChatIn(false)
}

// Handle the 'run-app' event from AppList
async function handleRunAppFromList(app: any) {
  useGlobalStore.updateShowAppListComponent(false)
  await chatStore.addNewChatGroup(Number(app.id))
}

// Handle the 'show-member-dialog' event from AppList
function handleShowMemberDialogFromList() {
  useGlobalStore.updateShowAppListComponent(false)
  useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.MEMBER)
}

// Handle the 'run-app-with-data' event from AppList (via Modal)
async function handleRunAppWithData({ app, formattedData }: { app: any; formattedData: string }) {
  useGlobalStore.updateShowAppListComponent(false)
  await chatStore.addNewChatGroup(Number(app.id))
  await nextTick()
  if (chatStore.active === Number(app.id)) {
    onConversation({ msg: formattedData, appId: Number(app.id) })
  } else {
    onConversation({ msg: formattedData })
  }
}

// Function to fetch app details
async function fetchCurrentAppDetail(appId: number) {
  if (!appId) return
  try {
    const res: any = await fetchQueryOneCatAPI({ id: appId })
    currentAppDetail.value = res.data
  } catch (error) {
    console.error('Error fetching app details:', error)
    currentAppDetail.value = null // Clear on error
  }
}

// ============== 依赖注入 ==============
provide('onConversation', onConversation)
provide('handleRegenerate', handleRegenerate)
provide('handleEditConversation', handleEditConversation)
provide('getActiveConversationModelInfo', () => ({
  model: activeModel.value,
  modelName: activeModelName.value,
  modelType: activeModelKeyType.value,
  modelAvatar: activeModelAvatar.value,
}))

// Potentially expose toggleAppList if needed by other children
// defineExpose({ toggleAppList })
// Expose the toggleAppList function
defineExpose({ toggleAppList, toggleTextEditor })

// 打开图片预览器
function openImagePreviewer(imageUrls: string[], initialIndex: number, mjData?: any) {
  openImageViewer({
    imageUrl: imageUrls[0],
    fileName: imageUrls[0],
  })
}
// 提供打开图片预览器方法给子组件
provide('onOpenImagePreviewer', openImagePreviewer)
// 提供弹窗相关方法给子组件
provide('showAppConfigModal', showAppConfigModal)
provide('tryParseJson', tryParseJson)
</script>

<template>
  <div class="flex h-full w-full">
    <Sider class="h-full" />
    <!-- Main container flex -->
    <div
      class="relative overflow-hidden h-full w-full flex flex-col transition-all duration-300 ease-in-out transform"
    >
      <!-- Background Image Layer -->
      <div
        v-if="activeChatBackgroundImg"
        class="absolute inset-0 z-0 opacity-30"
        :style="{
          backgroundImage: `url(${activeChatBackgroundImg})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center center',
          backgroundRepeat: 'no-repeat',
        }"
      ></div>

      <!-- Header - Conditional Background with 50% opacity on image -->
      <HeaderComponent
        :class="[
          'relative z-10 flex-shrink-0',
          activeChatBackgroundImg && !useGlobalStore.showAppListComponent
            ? 'bg-[var(--bg-body)]/80 dark:bg-gray-900/50 backdrop-blur-sm'
            : 'bg-[var(--bg-body)] dark:bg-gray-800 backdrop-blur-sm',
        ]"
        @toggle-app-list="toggleAppList"
      />

      <!-- Conditional Content - Keep original non-transparent backgrounds for these -->
      <template v-if="useGlobalStore.externalLinkDialog">
        <ExternalLinkComponent class="relative z-10 flex-1 bg-white dark:bg-gray-900" />
      </template>
      <template v-else-if="useGlobalStore.showAppListComponent">
        <AppList
          class="relative z-10 flex-1 overflow-hidden bg-[var(--bg-body)] dark:bg-[#080808]"
          @run-app="handleRunAppFromList"
          @show-member-dialog="handleShowMemberDialogFromList"
          @run-app-with-data="handleRunAppWithData"
        />
      </template>
      <template v-else>
        <!-- Main Chat Area - Prism-style split layout -->
        <main class="relative z-10 flex-1 overflow-hidden">
          <div class="h-full w-full">
            <div class="flex h-full min-h-0 min-w-0">
              <div
                :class="[
                  'flex min-h-0 min-w-0 flex-1 flex-col',
                  academicMode && !isMobile ? 'pr-6' : 'mx-auto max-w-[980px]',
                ]"
              >
                <div class="flex-1 min-h-0 overflow-hidden">
                  <div
                    id="scrollRef"
                    ref="scrollRef"
                    class="relative h-full overflow-y-auto overflow-x-hidden scroll-smooth custom-scrollbar"
                    style="background-color: transparent; position: relative; z-index: 5"
                    @scroll="handleScroll"
                  >
                    <div
                      id="image-wrapper"
                      class="w-full h-full pb-8"
                      :class="[isMobile ? 'px-3 py-3' : 'px-8 py-6']"
                    >
                      <div
                        v-if="lastError"
                        class="mb-4 px-4 py-3 rounded-2xl border border-red-200/80 dark:border-red-900/60 bg-red-50/80 dark:bg-red-950/40 text-red-700 dark:text-red-200 flex items-start justify-between gap-3"
                      >
                        <div class="text-sm leading-6">
                          <div class="font-semibold">请求失败</div>
                          <div>{{ lastError }}</div>
                          <div v-if="lastErrorRequestId" class="opacity-80 mt-1">
                            请求ID: {{ lastErrorRequestId }}
                          </div>
                        </div>
                        <button class="btn-pill btn-sm" @click="clearLastError">知道了</button>
                      </div>
                      <!-- Welcome/Tips/Messages - These inherit the transparent background -->
                      <template v-if="!dataSources.length && !activeAppId">
                        <div class="h-full w-full">
                          <WorkspaceHome v-if="!isMobile" @import="handleImportFiles" />
                          <div v-else class="px-4 py-10">
                            <WelcomeComponent :appId="activeAppId" />
                          </div>
                        </div>
                      </template>
                      <template v-if="!dataSources.length && activeAppId">
                        <div
                          class="flex justify-center items-center"
                          :class="[isMobile ? 'h-full' : 'h-4/5 ']"
                        >
                          <AppTips :appId="activeAppId" />
                        </div>
                      </template>
                      <template v-if="dataSources.length">
                        <div
                          :class="{
                            'px-2': isMobile,
                          }"
                        >
                          <Message
                            v-for="(item, index) of dataSources"
                            :key="item.chatId ? `chat-${item.chatId}` : `idx-${index}`"
                            :index="index"
                            :chatId="item.chatId"
                            :content="item.content"
                            :reasoningText="item.reasoningText"
                            :model="item.model"
                            :modelType="item.modelType"
                            :modelName="item.modelName"
                            :modelAvatar="item.modelAvatar"
                            :status="item.status"
                            :imageUrl="item.imageUrl"
                            :fileUrl="item.fileUrl"
                            :ttsUrl="item.ttsUrl"
                            :taskId="item.taskId"
                            :taskData="item.taskData"
                            :videoUrl="item.videoUrl"
                            :audioUrl="item.audioUrl"
                            :action="item.action"
                            :role="item.role"
                            :loading="item.loading"
                            :drawId="item.drawId"
                            :customId="item.customId"
                            :pluginParam="item.pluginParam"
                            :promptReference="item.promptReference"
                            :progress="item.progress"
                            :networkSearchResult="item.networkSearchResult"
                            :fileVectorResult="item.fileVectorResult"
                            :isLast="index === dataSources.length - 1"
                            :usingNetwork="item.usingNetwork"
                            :usingDeepThinking="false"
                            :useFileSearch="item.useFileSearch"
                            :tool_calls="item.tool_calls"
                            @delete="handleDelete(item)"
                          />
                          <div class="sticky bottom-2 flex justify-center p-1 z-20">
                            <DownSmall
                              v-show="!isAtBottom"
                              size="24"
                              class="p-1 bg-white dark:bg-gray-600 shadow-sm rounded-full border text-gray-700 border-gray-400 dark:border-gray-600 dark:text-gray-500 cursor-pointer transition-all duration-300 ease-in-out"
                              :class="[isAtBottom ? 'opacity-0' : 'opacity-100']"
                              @click="handleScrollBtm"
                              theme="outline"
                              :strokeWidth="2"
                              aria-label="滚动到底部"
                              role="button"
                              tabindex="0"
                            />
                          </div>
                        </div>
                      </template>
                      <div ref="bottomContainer" class="bottom" />
                    </div>
                  </div>
                </div>
                <div class="relative z-20 w-full px-2 pb-3 pt-2">
                  <FooterComponent
                    ref="footerRef"
                    :class="['z-20 relative', isMobile ? 'pb-safe' : '']"
                    @pause-request="pauseRequest"
                    :dataSourcesLength="dataSources.length"
                  >
                  </FooterComponent>
                </div>
                <div v-if="!isMobile && !dataSources.length" class="w-full pb-3 pt-1">
                  <div
                    class="text-sm text-gray-600 dark:text-gray-400 max-h-6 flex justify-center items-center"
                  >
                    YutoLens 也可能会犯错，请核查重要信息。
                    <span> YutoAI © 2021–{{ copyrightEndYear }} </span>
                    <span class="ml-2">
                      <a
                        class="transition-all text-gray-600 hover:text-gray-500 dark:hover:text-gray-400"
                        href="https://beian.miit.gov.cn"
                        target="_blank"
                      >
                        {{ globalConfig?.filingNumber }}
                      </a>
                    </span>
                  </div>
                </div>
              </div>
              <aside
                v-if="academicMode && !isMobile"
                class="w-[360px] shrink-0 px-4 py-6 bg-transparent"
              >
                <div class="sticky top-6 max-h-[calc(100vh-140px)] overflow-y-auto pr-1">
                  <AcademicPanel
                    core-label="基础功能"
                    plugin-label="高级插件"
                    core-placeholder="不启用"
                    plugin-placeholder="不启用"
                    plugin-search-placeholder="筛选插件"
                    plugin-args-label="自定义指令"
                    plugin-args-placeholder="例如：不翻译 Agent 专业名词"
                    info-label="说明"
                  />
                </div>
              </aside>
            </div>
          </div>
        </main>
        <transition name="fade">
          <div
            v-if="academicMode && isMobile"
            class="fixed left-0 right-0 z-40 px-3"
            :style="{ bottom: 'calc(env(safe-area-inset-bottom) + 96px)' }"
          >
            <div class="max-h-[45vh] overflow-y-auto">
              <AcademicPanel
                core-label="基础功能"
                plugin-label="高级插件"
                core-placeholder="不启用"
                plugin-placeholder="不启用"
                plugin-search-placeholder="筛选插件"
                plugin-args-label="自定义指令"
                plugin-args-placeholder="例如：不翻译 Agent 专业名词"
                info-label="说明"
              />
            </div>
          </div>
        </transition>
      </template>
    </div>

    <!-- 通用应用配置弹窗 -->
    <transition name="modal-fade">
      <!-- Backdrop and Centering Container -->
      <div
        v-if="showFormModal && selectedAppForModal"
        class="fixed inset-0 z-[9000] flex items-center justify-center bg-gray-900 bg-opacity-50"
        @click.self="handleModalClose"
      >
        <!-- Modal Content Container -->
        <div
          class="relative overflow-hidden bg-white dark:bg-gray-750 rounded-lg shadow-lg flex flex-col w-full max-w-3xl max-h-[85vh] m-4"
        >
          <!-- Background Image Layer -->
          <div
            v-if="selectedAppForModal?.backgroundImg"
            class="absolute inset-0 z-0 opacity-10"
            :style="backgroundStyle"
          ></div>

          <!-- Header -->
          <div
            class="relative z-10 flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-600 flex-shrink-0 bg-white/80 dark:bg-gray-750/80 backdrop-blur-sm"
          >
            <span class="text-xl font-bold dark:text-white"
              >预设配置: {{ selectedAppForModal?.name || '' }}</span
            >
            <button
              @click="handleModalClose"
              class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <Close size="18" />
            </button>
          </div>

          <!-- Scrollable Content Area with native scroll -->
          <div
            class="relative z-10 flex-grow overflow-y-auto p-4 bg-white/80 dark:bg-gray-750/80 backdrop-blur-sm"
          >
            <!-- Form Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <!-- Form Field -->
              <div v-for="(field, index) in currentFormSchema" :key="index">
                <!-- Label -->
                <label
                  class="block text-sm font-medium leading-6 text-gray-900 dark:text-gray-300 mb-1"
                >
                  {{ field.title }}
                </label>

                <!-- Native Input -->
                <input
                  v-if="field.type === 'input'"
                  type="text"
                  v-model="modalFormData[field.title]"
                  :placeholder="field.placeholder"
                  :disabled="field.placeholder.includes('(系统生成)') || isModalLoading"
                  class="input input-md w-full disabled:opacity-50 disabled:cursor-not-allowed"
                />

                <!-- DropdownMenu替换原有的Menu -->
                <DropdownMenu
                  v-if="field.type === 'select'"
                  v-model="dropdownStates[field.title]"
                  position="bottom-left"
                  min-width="100%"
                  class="relative block w-full"
                  :disabled="isModalLoading"
                >
                  <template #trigger>
                    <div
                      :class="[
                        'input input-md w-full relative cursor-pointer',
                        isModalLoading ? 'disabled:opacity-50 disabled:cursor-not-allowed' : '',
                      ]"
                    >
                      <span class="block text-left truncate">{{
                        modalFormData[field.title] || field.placeholder
                      }}</span>
                      <span
                        class="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2"
                      >
                        <DropDownList class="text-gray-400" size="16" aria-hidden="true" />
                      </span>
                    </div>
                  </template>

                  <template #menu="{ close }">
                    <div>
                      <div
                        v-for="option in field.options"
                        :key="option"
                        @click="
                          () => {
                            selectOption(field.title, option)
                            close()
                          }
                        "
                        class="menu-item menu-item-md"
                      >
                        {{ option }}
                      </div>
                    </div>
                  </template>
                </DropdownMenu>
              </div>
            </div>
          </div>

          <!-- Footer with native buttons -->
          <div
            class="relative z-10 flex justify-end p-4 border-t border-gray-200 dark:border-gray-600 flex-shrink-0 space-x-2 bg-white/80 dark:bg-gray-750/80 backdrop-blur-sm"
          >
            <button
              type="button"
              @click="handleModalSkip(selectedAppForModal)"
              :disabled="isModalLoading"
              class="btn btn-secondary btn-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              跳过
            </button>
            <button
              type="button"
              @click="handleModalSubmit"
              :disabled="isModalLoading"
              class="btn btn-primary btn-md disabled:opacity-50 disabled:cursor-not-allowed"
            >
              开始
            </button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<style>
/* 全局过渡效果 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* 宽度变化动画效果 */
.transform {
  transition-property: transform, width, opacity;
}

/* 缩放动画 */
.scale-enter-active,
.scale-leave-active {
  transition: all 0.3s ease;
}

.scale-enter-from,
.scale-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

/* 滑动动画 */
.slide-enter-active,
.slide-leave-active {
  transition: all 0.3s ease;
}

.slide-enter-from {
  opacity: 0;
  transform: translateX(30px);
}

.slide-leave-to {
  opacity: 0;
  transform: translateX(-30px);
}

/* 添加安全区域适配 */
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}

.mb-safe {
  margin-bottom: env(safe-area-inset-bottom);
}

/* Modal animation */
.modal-fade-enter-active,
.modal-fade-leave-active {
  transition: opacity 0.3s ease;
}
.modal-fade-enter-from,
.modal-fade-leave-to {
  opacity: 0;
}
</style>
