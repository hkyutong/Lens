<script setup lang="ts">
// ============== 组件导入 ==============
import { fetchChatAPIProcess } from '@/api'
import { fetchAcademicChatAPIProcess, fetchAcademicWorkflowAPIProcess } from '@/api/academic'
import { fetchQueryOneCatAPI } from '@/api/appStore'
import {
  fetchDeleteGroupChatsAfterIdAPI,
  fetchQuerySingleChatLogAPI,
  fetchSyncDisplayContentAPI,
} from '@/api/chatLog'
import { openImageViewer } from '@/components/common/ImageViewer/useImageViewer'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import { message } from '@/utils/message'
import { sanitizeUserFacingErrorMessage } from '@/utils/request/sanitizeErrorMessage'
import { Close, DropDownList } from '@icon-park/vue-next'
import DownSmall from '@icon-park/vue-next/es/icons/DownSmall'
import type { AxiosProgressEvent } from 'axios'
import AcademicPanel from './components/Footer/components/AcademicPanel.vue'
import FooterComponent from './components/Footer/index.vue'
import HeaderComponent from './components/Header/index.vue'
import WorkspaceHome from './components/Workspace/Home.vue'
// 导入DropdownMenu组件用于弹窗
import { DropdownMenu } from '@/components/common/DropdownMenu'
// 移除不再直接使用的异步组件导入
// const TextEditor = defineAsyncComponent(() => import('./components/Previewer/TextEditor.vue'))
// const ImagePreviewer = defineAsyncComponent(() => import('./components/Previewer/ImagePreviewer.vue'))
// const HtmlPreviewer = defineAsyncComponent(() => import('./components/Previewer/HtmlPreviewer.vue'))

// ============== Composition API ==============
import {
  computed,
  defineAsyncComponent,
  inject,
  nextTick,
  onMounted,
  provide,
  ref,
  watch,
} from 'vue'
import { DIALOG_TABS } from '@/store/modules/global'
import { useRoute } from 'vue-router'
import { useChat } from './hooks/useChat'
import { useScroll } from './hooks/useScroll'
import Sider from './components/sider/index.vue'

const ExternalLinkComponent = defineAsyncComponent(
  () => import('./components/ExternalLink/index.vue')
)
const AppList = defineAsyncComponent(() => import('./components/AppList/index.vue'))
const AppTips = defineAsyncComponent(() => import('./components/AppTips/index.vue'))
const Message = defineAsyncComponent(() => import('./components/Message/index.vue'))

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
const { isMobile, isSmallXl } = useBasicLayout()
const { scrollRef, scrollToBottom, scrollToBottomIfAtBottom, isAtBottom, handleScroll: baseHandleScroll } =
  useScroll()
const { addGroupChat, updateGroupChatSome } = useChat()
const enableDetailedErrorUi = import.meta.env.DEV || import.meta.env.MODE === 'test'

const toUserFacingRequestError = (rawMessage: string, statusCode = 0) =>
  sanitizeUserFacingErrorMessage(rawMessage, statusCode, '请求失败，请稍后重试')

const triggerUpgradeIfNeeded = (messageText: string) => {
  if (!messageText) return
  if (!/积分不足|选购套餐|升级套餐/i.test(messageText)) return
  if (isMobile.value) {
    useGlobalStore.updateMobileSettingsDialog(true, DIALOG_TABS.MEMBER)
  } else {
    useGlobalStore.updateSettingsDialog(true, DIALOG_TABS.MEMBER)
  }
}

const clearLastError = () => {
  lastError.value = ''
  lastErrorRequestId.value = ''
}

const trimConversationTailAfterOverwrite = async (
  assistantIndex: number,
  baseList: Chat.Chat[],
  groupId: number
) => {
  if (assistantIndex < 0 || !Array.isArray(baseList)) return
  const tailItems = baseList.slice(assistantIndex + 1)
  if (!tailItems.length) {
    chatStore.clearHiddenReplyTail(groupId)
    return
  }

  const currentTailLength = Math.max(0, (chatStore.chatList?.length || 0) - assistantIndex - 1)
  if (currentTailLength > 0) {
    chatStore.chatList.splice(assistantIndex + 1, currentTailLength)
  }

  const deleteStartChatId = Number(
    tailItems.find(item => Number(item?.chatId || 0) > 0)?.chatId || 0
  )
  if (deleteStartChatId > 0) {
    try {
      await fetchDeleteGroupChatsAfterIdAPI({ id: deleteStartChatId })
    } catch (error) {
      if (tailItems.length) {
        chatStore.chatList.splice(assistantIndex + 1, 0, ...tailItems)
      }
      throw error
    }
  }

  chatStore.clearHiddenReplyTail(groupId)
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

const closeMobileAcademicPanel = () => {
  chatStore.setMobileAcademicPanelVisible(false)
}

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
const desktopAcademicPanelRef = ref<HTMLElement | null>(null)
const VIRTUAL_MESSAGE_OVERSCAN_PX = 960
const DEFAULT_USER_MESSAGE_HEIGHT = 152
const DEFAULT_ASSISTANT_MESSAGE_HEIGHT = 320
const messageHeightMap = ref<Record<string, number>>({})
const viewportScrollTop = ref(0)
const viewportClientHeight = ref(0)

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
const showDetailedErrorBanner = computed(() => enableDetailedErrorUi && !!lastError.value)
const usingPlugin = computed(() => chatStore.currentPlugin)
const academicMode = computed(() => chatStore.academicMode)
const mobileAcademicPanelVisible = computed(() => chatStore.mobileAcademicPanelVisible)
const academicPlugin = computed(() => chatStore.currentAcademicPlugin)
const academicCore = computed(() => chatStore.currentAcademicCore)
const academicWorkflowEnabled = computed(() => Boolean(chatStore.academicWorkflowEnabled))
const academicWorkflowSteps = computed(() => chatStore.academicWorkflowSteps || [])
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
const dataSources = computed(() => chatStore.chatList || [])
const activeGroupId = computed(() => chatStore.active)
const activeGroupInfo = computed(() => chatStore.getChatByGroupInfo())
const isStreaming = computed(() => Boolean(chatStore.isStreamIn))
const chatHistoryHasMore = computed(() => Boolean(chatStore.chatHistoryHasMore))
const chatHistoryLoading = computed(() => Boolean(chatStore.chatHistoryLoading))

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

const preferredModelConfig = computed(() => chatStore.preferredModel || null)

const getCurrentConversationModelInfo = () => ({
  model: preferredModelConfig.value?.value || activeModel.value,
  modelName: preferredModelConfig.value?.label || activeModelName.value,
  modelType: preferredModelConfig.value?.keyType || activeModelKeyType.value,
  modelAvatar: preferredModelConfig.value?.modelAvatar || activeModelAvatar.value,
})

/* 当前对话组是否是应用 */
const activeAppId = computed(() => activeGroupInfo?.value?.appId || 0)

const getVirtualMessageKey = (item: Chat.Chat, index: number) => {
  const stableId =
    item?.chatId || item?.taskId || item?.customId || item?.drawId || item?.promptReference
  if (stableId) return String(stableId)
  const contentPreview = String(item?.content || '').slice(0, 32)
  return `${item?.role || 'message'}-${index}-${contentPreview}`
}

const estimateMessageHeight = (item: Chat.Chat, index: number) => {
  const key = getVirtualMessageKey(item, index)
  const measuredHeight = messageHeightMap.value[key]
  if (measuredHeight && measuredHeight > 0) return measuredHeight
  if (item?.role === 'user') return DEFAULT_USER_MESSAGE_HEIGHT
  const hasRichPayload = Boolean(
    item?.imageUrl ||
      item?.fileUrl ||
      item?.reasoningText ||
      item?.networkSearchResult ||
      item?.fileVectorResult ||
      item?.tool_calls
  )
  return hasRichPayload ? 380 : DEFAULT_ASSISTANT_MESSAGE_HEIGHT
}

const syncMessageViewportMetrics = () => {
  const container = scrollRef.value
  viewportScrollTop.value = container?.scrollTop || 0
  viewportClientHeight.value = container?.clientHeight || 0
}

const pruneMessageHeightCache = (rows: Chat.Chat[]) => {
  const activeKeys = new Set(rows.map((item, index) => getVirtualMessageKey(item, index)))
  messageHeightMap.value = Object.fromEntries(
    Object.entries(messageHeightMap.value).filter(([key]) => activeKeys.has(key))
  )
}

const isDisposableAssistantPlaceholder = (item: Chat.Chat | undefined) => {
  if (!item || item.role !== 'assistant') return false
  const hasVisiblePayload = Boolean(
    String(item.content || '').trim() ||
      String(item.reasoningText || '').trim() ||
      String(item.fileVectorResult || '').trim() ||
      String(item.networkSearchResult || '').trim()
  )
  if (hasVisiblePayload) return false
  const isWorkflowShadow = Boolean(item.isWorkflowMessage || item.taskData)
  if (!item.loading && !isWorkflowShadow) return false
  return true
}

const hasRenderableAssistantState = (item: Chat.Chat | undefined) => {
  if (!item || item.role !== 'assistant') return false
  return (
    Boolean(String(item.content || '').trim()) ||
    Boolean(String(item.reasoningText || '').trim()) ||
    Boolean(String(item.fileVectorResult || '').trim()) ||
    Boolean(String(item.networkSearchResult || '').trim()) ||
    Boolean(item.taskData) ||
    Boolean(item.isWorkflowMessage) ||
    Number(item.chatId || 0) > 0
  )
}

const renderDataSources = computed(() => {
  const rows = dataSources.value || []
  if (rows.length < 2) return rows
  return rows.filter((item, index) => {
    if (!isDisposableAssistantPlaceholder(item)) return true
    for (let cursor = index + 1; cursor < rows.length; cursor += 1) {
      const nextItem = rows[cursor]
      if (!nextItem) break
      if (nextItem.role === 'user') break
      if (hasRenderableAssistantState(nextItem)) return false
    }
    return true
  })
})

const virtualMessageState = computed(() => {
  const rows = renderDataSources.value || []
  if (!rows.length) {
    return {
      visibleItems: [] as Array<{ item: Chat.Chat; index: number; key: string }>,
      paddingTop: 0,
      paddingBottom: 0,
      totalHeight: 0,
    }
  }

  if (!scrollRef.value || viewportClientHeight.value <= 0) {
    return {
      visibleItems: rows.map((item, index) => ({
        item,
        index,
        key: getVirtualMessageKey(item, index),
      })),
      paddingTop: 0,
      paddingBottom: 0,
      totalHeight: 0,
    }
  }

  const overscanStart = Math.max(0, viewportScrollTop.value - VIRTUAL_MESSAGE_OVERSCAN_PX)
  const overscanEnd =
    viewportScrollTop.value + viewportClientHeight.value + VIRTUAL_MESSAGE_OVERSCAN_PX

  const metrics: Array<{
    item: Chat.Chat
    index: number
    key: string
    top: number
    bottom: number
  }> = []

  let cursor = 0
  let startIndex = 0
  let endIndex = rows.length - 1
  let foundStart = false
  let foundEnd = false

  rows.forEach((item, index) => {
    const height = estimateMessageHeight(item, index)
    const top = cursor
    const bottom = cursor + height
    metrics.push({
      item,
      index,
      key: getVirtualMessageKey(item, index),
      top,
      bottom,
    })
    if (!foundStart && bottom >= overscanStart) {
      startIndex = index
      foundStart = true
    }
    if (!foundEnd && top > overscanEnd) {
      endIndex = Math.max(startIndex, index - 1)
      foundEnd = true
    }
    cursor = bottom
  })

  const totalHeight = cursor
  const startMetric = metrics[startIndex]
  const endMetric = metrics[endIndex]

  return {
    visibleItems: metrics.slice(startIndex, endIndex + 1),
    paddingTop: startMetric?.top || 0,
    paddingBottom: Math.max(0, totalHeight - (endMetric?.bottom || 0)),
    totalHeight,
  }
})

const handleMessageHeightChange = (item: Chat.Chat, index: number, height: number) => {
  const nextHeight = Math.max(0, Math.ceil(Number(height) || 0))
  if (!nextHeight) return
  const key = getVirtualMessageKey(item, index)
  if (messageHeightMap.value[key] === nextHeight) return
  messageHeightMap.value = {
    ...messageHeightMap.value,
    [key]: nextHeight,
  }
}

const scrollWorkspaceHomeToTop = async () => {
  await nextTick()
  requestAnimationFrame(() => {
    if (!scrollRef.value) return
    scrollRef.value.scrollTop = 0
    scrollRef.value.scrollTo?.({
      top: 0,
      behavior: 'auto',
    })
  })
}

watch(
  [() => dataSources.value.length, () => activeAppId.value],
  async ([messageCount, appId]) => {
    pruneMessageHeightCache(renderDataSources.value)
    if (messageCount || appId) return
    await scrollWorkspaceHomeToTop()
  },
  { immediate: true }
)

onMounted(() => {
  if (!dataSources.value.length && !activeAppId.value) {
    scrollWorkspaceHomeToTop()
  }
})

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
    pruneMessageHeightCache(renderDataSources.value)
    syncMessageViewportMetrics()
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
  syncMessageViewportMetrics()

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

const loadOlderMessages = async () => {
  if (!chatHistoryHasMore.value || chatHistoryLoading.value || !scrollRef.value) return
  const container = scrollRef.value
  const previousHeight = container.scrollHeight
  const previousTop = container.scrollTop
  await chatStore.queryActiveChatLogList(true)
  await nextTick()
  syncMessageViewportMetrics()
  const nextHeight = container.scrollHeight
  container.scrollTop = Math.max(0, nextHeight - previousHeight + previousTop)
  syncMessageViewportMetrics()
}

const handleWorkspaceScroll = async () => {
  baseHandleScroll()
  syncMessageViewportMetrics()
  if (!scrollRef.value || chatHistoryLoading.value || !chatHistoryHasMore.value) return
  if (scrollRef.value.scrollTop <= 120) {
    await loadOlderMessages()
  }
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

const openDesktopAcademicPanel = () => {
  if (isMobile.value) {
    chatStore.setMobileAcademicPanelVisible(true)
    return
  }
  desktopAcademicPanelRef.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

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

const stripLeakedPolishTableInstructions = (value: string) =>
  String(value || '')
    .replace(
      /^[^\S\r\n>]*\|?\s*(?:列名|表头)(?:必须)?(?:严格)?为[:：]\s*\|?\s*修改前原文片段\s*\|\s*修改后片段\s*\|\s*修改原因与解释\s*\|?\s*$/gim,
      ''
    )
    .replace(
      /(?:列名|表头)(?:必须)?(?:严格)?为[:：]\s*\|?\s*修改前原文片段\s*\|\s*修改后片段\s*\|\s*修改原因与解释\s*\|?/gi,
      ''
    )

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
  text = stripLeakedPolishTableInstructions(text)

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

const markdownTableLinePattern = /^\s*\|.*\|\s*$/

const splitMarkdownTableCells = (line: string) => {
  const text = String(line || '').trim()
  if (!text.startsWith('|') || !text.endsWith('|')) return []
  let body = text.slice(1, -1)
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

const countMarkdownTableRows = (value: string) =>
  String(value || '')
    .split('\n')
    .map(line => String(line || '').trim())
    .filter(line => markdownTableLinePattern.test(line))
    .filter(line => {
      const cells = splitMarkdownTableCells(line)
      if (cells.length !== 3) return false
      if (
        cells[0] === '修改前原文片段' &&
        cells[1] === '修改后片段' &&
        cells[2] === '修改原因与解释'
      )
        return false
      return !/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*(?:\s*:?-{3,}:?\s*)?\|?\s*$/.test(line)
    }).length

const extractStablePolishReasonTable = (value: string) => {
  const normalized = normalizeIncomingText(value, { trim: true })
  if (!normalized) return ''

  const lines = normalized.split('\n').map(line => String(line || '').trimEnd())
  let bestTable = ''
  let bestRowCount = 0

  for (let i = 0; i < lines.length; i += 1) {
    const headerLine = String(lines[i] || '').trim()
    const headerCells = splitMarkdownTableCells(headerLine)
    if (
      headerCells.length !== 3 ||
      headerCells[0] !== '修改前原文片段' ||
      headerCells[1] !== '修改后片段' ||
      headerCells[2] !== '修改原因与解释'
    ) {
      continue
    }

    const tableLines = ['| 修改前原文片段 | 修改后片段 | 修改原因与解释 |']
    let separatorConsumed = false
    let rowCount = 0

    for (let j = i + 1; j < lines.length; j += 1) {
      const trimmed = String(lines[j] || '').trim()
      if (!trimmed) {
        if (separatorConsumed && rowCount > 0) break
        continue
      }

      if (!separatorConsumed) {
        if (/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*(?:\s*:?-{3,}:?\s*)?\|?\s*$/.test(trimmed)) {
          tableLines.push('| --- | --- | --- |')
          separatorConsumed = true
          continue
        }
        break
      }

      if (!markdownTableLinePattern.test(trimmed)) break
      const rowCells = splitMarkdownTableCells(trimmed)
      if (rowCells.length !== 3) break
      tableLines.push(`| ${rowCells.join(' | ')} |`)
      rowCount += 1
    }

    if (separatorConsumed && rowCount > bestRowCount) {
      bestTable = tableLines.join('\n')
      bestRowCount = rowCount
    }
  }

  return bestRowCount > 0 ? bestTable : ''
}

const findStablePolishReasonTableRange = (value: string) => {
  const normalized = normalizeIncomingText(value, { trim: true })
  if (!normalized) return null

  const lines = normalized.split('\n').map(line => String(line || '').trimEnd())
  let bestMatch: {
    start: number
    end: number
    rowCount: number
  } | null = null

  for (let i = 0; i < lines.length; i += 1) {
    const headerLine = String(lines[i] || '').trim()
    const headerCells = splitMarkdownTableCells(headerLine)
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
        if (/^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*(?:\s*:?-{3,}:?\s*)?\|?\s*$/.test(trimmed)) {
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
      const rowCells = splitMarkdownTableCells(trimmed)
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
  const normalized = normalizeIncomingText(value, { trim: true })
  const snapshot = String(stableTable || '').trim() || extractStablePolishReasonTable(normalized)
  if (!snapshot) return normalized

  const match = findStablePolishReasonTableRange(normalized)
  if (!match) return normalized || snapshot

  const lines = normalized.split('\n').map(line => String(line || '').trimEnd())
  const prefix = lines.slice(0, match.start).join('\n').trimEnd()
  const suffix = lines.slice(match.end).join('\n').trimStart()
  return [prefix, snapshot, suffix].filter(section => String(section || '').trim()).join('\n\n')
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

  const currentConversationModel = getCurrentConversationModelInfo()
  const useModelName = modelName || currentConversationModel.modelName
  const useModelType = modelType || currentConversationModel.modelType || 1
  const useModelAvatar = modelAvatar || currentConversationModel.modelAvatar
  const useAppId = appId || activeAppId.value
  const messageText = msg || '提问'

  let useModel = model || currentConversationModel.model

  controller.value = new AbortController()
  clearLastError()

  const options: any = {
    groupId: +activeGroupId.value,
    fileParsing: fileParsing.value,
    usingNetwork: chatStore.usingNetwork,
    usingDeepThinking: chatStore.usingDeepThinking,
  }
  const isWorkflowConversation =
    academicMode.value && academicWorkflowEnabled.value && academicWorkflowSteps.value.length > 0
  // 仅发送当前轮次显式提交的附件，避免把历史附件自动带入新请求。
  const requestFileUrl = String(fileUrl || '')

  const activeList = chatStore.chatList || []
  const activeListSnapshot = Array.isArray(activeList) ? [...activeList] : []
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
      thinkingPreview: '',
      model: useModel,
      modelName: useModelName,
      modelType: useModelType,
      modelAvatar: useModelAvatar,
      loading: true,
      error: false,
      status: 1,
      taskData: undefined,
      isWorkflowMessage: isWorkflowConversation,
    })
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

  if (overwriteReply) {
    try {
      await trimConversationTailAfterOverwrite(
        assistantIndex,
        activeListSnapshot,
        Number(activeGroupId.value)
      )
    } catch (error) {
      chatStore.setStreamIn(false)
      useGlobalStore.updateIsChatIn(false)
      ms.error('删除后续消息失败，请刷新后重试')
      return
    }
  }

  if (assistantIndex < 0) {
    addGroupChat({
      content: messageText,
      model: useModel,
      modelName: useModelName,
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
      taskData: undefined,
      isWorkflowMessage: isWorkflowConversation,
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
  let thinkingPreview = ''
  let networkSearchResult = ''
  let tool_calls = ''
  let promptReference = ''
  let mcpToolUse = ''
  let fileVectorResult = ''
  let finishReason = ''
  let nodeType = ''
  let stepName = ''
  let workflowProgress = 0
  let taskData: any = undefined
  let assistantLogId = String(effectiveReplyChatId || '')
  let streamRequestId = ''
  let preservedStructuredContent = ''
  let stablePolishTableSnapshot = ''
  let freezePolishTable = false
  let academicPluginRequestName = ''
  let academicCoreRequestName = ''
  let recoveredAssistantStatus = 0
  let workflowRecoveredFromServer = false

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
      thinkingPreview,
      mcpToolUse,
      networkSearchResult,
      fileVectorResult,
      tool_calls,
      promptReference,
      nodeType,
      stepName,
      workflowProgress,
      taskData,
      isWorkflowMessage: isWorkflowConversation,
      loading: true,
      error: false,
      status: 1,
      modelType: useModelType,
      modelName: useModelName,
    })

    scrollToBottomIfAtBottom()
  }

  const parseWorkflowProgress = (value: any) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return Math.max(0, Math.min(100, Math.round(value)))
    }
    const matched = String(value || '')
      .trim()
      .match(/^(\d{1,3})%$/)
    if (!matched) return 0
    const parsed = Number(matched[1])
    return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : 0
  }

  const recoverWorkflowAssistantFromServer = async () => {
    const chatId = Number(assistantLogId || 0)
    if (!chatId) return false
    const retryDelays = [0, 450, 1200]
    for (const delay of retryDelays) {
      if (delay > 0) {
        await new Promise(resolve => setTimeout(resolve, delay))
      }
      try {
        const latest = await fetchQuerySingleChatLogAPI<any>({ chatId })
        if (!latest || typeof latest !== 'object') continue

        const latestTaskData = latest.taskData ?? taskData
        const latestContent = normalizeIncomingText(String(latest.content || ''), { trim: true })
        const latestReasoning = normalizeIncomingText(String(latest.reasoningText || ''), {
          trim: true,
        })
        const latestStatus = Number(latest.status || 0)
        const latestWorkflowProgress =
          parseWorkflowProgress(latest.progress) || workflowProgress || 0
        const hasRenderablePayload = Boolean(
          latestContent ||
            latestReasoning ||
            String(latest.fileVectorResult || '').trim() ||
            String(latest.networkSearchResult || '').trim() ||
            latestTaskData ||
            latestStatus
        )

        if (!hasRenderablePayload) continue

        workflowRecoveredFromServer = true
        recoveredAssistantStatus = latestStatus
        taskData = latestTaskData
        workflowProgress = latestWorkflowProgress
        displayedText = latestContent || displayedText
        fullText = latestContent || fullText
        displayedReasoningText = latestReasoning || displayedReasoningText
        fullReasoningText = latestReasoning || fullReasoningText
        networkSearchResult = String(latest.networkSearchResult || networkSearchResult || '')
        fileVectorResult = String(latest.fileVectorResult || fileVectorResult || '')
        tool_calls = String(latest.tool_calls || tool_calls || '')
        promptReference = String(latest.promptReference || promptReference || '')
        if (!lastError.value || latestStatus !== 4) {
          lastError.value = ''
        }

        patchCurrentAssistant({
          chatId,
          content: displayedText,
          reasoningText: displayedReasoningText,
          networkSearchResult,
          fileVectorResult,
          tool_calls,
          promptReference,
          workflowProgress,
          taskData,
          isWorkflowMessage: true,
          loading: false,
          error: latestStatus === 4,
          status: latestStatus || 3,
          modelType: Number(latest.modelType || useModelType || 0),
          modelName: String(latest.modelName || useModelName || ''),
        })

        return true
      } catch (recoverError) {
        console.error('[workflow] recover latest assistant failed:', recoverError)
      }
    }
    return false
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
    if (jsonObj?.taskData) taskData = jsonObj.taskData
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
    const incomingThinkingPreview = extractTextChunk(
      jsonObj?.thinkingPreview ?? jsonObj?.progressText
    )
    if (incomingThinkingPreview) {
      thinkingPreview = normalizeIncomingText(incomingThinkingPreview, { trim: true }).slice(0, 120)
      patchCurrentAssistant({
        chatId: assistantLogId ? Number(assistantLogId) : undefined,
        content: displayedText,
        reasoningText: displayedReasoningText,
        thinkingPreview,
        mcpToolUse,
        networkSearchResult,
        fileVectorResult,
        tool_calls,
        promptReference,
        nodeType,
        stepName,
        workflowProgress,
        taskData,
        isWorkflowMessage: isWorkflowConversation,
        loading: true,
        error: false,
        status: 1,
        modelType: useModelType,
        modelName: useModelName,
      })
    }

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
        if (isPolishAcademicTask() && lockedPolishTable) {
          freezePolishTable = true
          stablePolishTableSnapshot = lockedPolishTable
          const mergedPolishText = replacePolishReasonTableWithStableSnapshot(
            normalizedFinal || streamBaseline,
            lockedPolishTable
          )
          fullText = mergedPolishText
          displayedText = mergedPolishText
        } else {
          const preferred =
            academicMode.value && !isPolishAcademicTask()
              ? normalizedFinal
              : chooseBetterFinalText(streamBaseline, normalizedFinal)
          fullText = preferred
          displayedText = preferred
        }
        patchCurrentAssistant({
          chatId: assistantLogId ? Number(assistantLogId) : undefined,
          content: displayedText,
          reasoningText: displayedReasoningText,
          thinkingPreview,
          mcpToolUse,
          networkSearchResult,
          fileVectorResult,
          tool_calls,
          promptReference,
          nodeType,
          stepName,
          workflowProgress,
          taskData,
          isWorkflowMessage: isWorkflowConversation,
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

  const handleStreamProgress = (progressEvent: AxiosProgressEvent) => {
    const target = (progressEvent.event?.target || {}) as {
      responseText?: string
      isChunk?: boolean
    }
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

    if (isWorkflowConversation) {
      chatStore.setAcademicWorkflowRunning(true)
      await fetchAcademicWorkflowAPIProcess({
        data: {
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
          workflow: {
            steps: academicWorkflowSteps.value.map(step => ({
              kind: step.kind,
              name: step.name,
              displayName: step.displayName || step.name,
              args: step.args || '',
            })),
          },
        },
        signal: controller.value.signal,
        onDownloadProgress: handleStreamProgress,
      })
    } else if (academicMode.value) {
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
    const rawErrorMessage =
      errData?.message || errData?.error || error?.message || '请求失败，请稍后重试'
    const requestId = errData?.requestId || streamRequestId || ''
    const statusCode = Number(errData?.code || errData?.status || error?.response?.status || 0)
    console.error('[chat request failed]', {
      statusCode,
      rawErrorMessage,
      requestId,
      error,
    })
    if (isWorkflowConversation && (await recoverWorkflowAssistantFromServer())) {
      if (recoveredAssistantStatus === 4 && displayedText) {
        lastError.value = displayedText
      }
    } else {
      const errorMessage = toUserFacingRequestError(rawErrorMessage, statusCode)
      lastError.value = errorMessage
      lastErrorRequestId.value = enableDetailedErrorUi ? requestId : ''
      const suffix = enableDetailedErrorUi && requestId ? `（请求ID: ${requestId}）` : ''
      ms.error(`${errorMessage}${suffix}`)
      triggerUpgradeIfNeeded(rawErrorMessage)
      patchCurrentAssistant({
        chatId: assistantLogId ? Number(assistantLogId) : undefined,
        content: normalizeIncomingText(errorMessage, { trim: true }),
        reasoningText: displayedReasoningText,
        mcpToolUse,
        networkSearchResult,
        fileVectorResult,
        tool_calls,
        promptReference,
        nodeType,
        stepName,
        workflowProgress,
        taskData,
        isWorkflowMessage: isWorkflowConversation,
        error: true,
        loading: false,
        status: 4,
        modelType: useModelType,
        modelName: useModelName,
      })
    }
  } finally {
    if (isWorkflowConversation) {
      chatStore.setAcademicWorkflowRunning(false)
    }
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
      freezePolishTable = true
      stablePolishTableSnapshot = lockedPolishTable
      const mergedPolishText = replacePolishReasonTableWithStableSnapshot(
        fullText || displayedText,
        lockedPolishTable
      )
      displayedText = mergedPolishText
      fullText = mergedPolishText
    }
    if (freezePolishTable && stablePolishTableSnapshot) {
      const mergedPolishText = replacePolishReasonTableWithStableSnapshot(
        fullText || displayedText,
        stablePolishTableSnapshot
      )
      displayedText = mergedPolishText
      fullText = mergedPolishText
    }
    if (!hasVisibleText(displayedReasoningText) && hasVisibleText(fullReasoningText)) {
      displayedReasoningText = fullReasoningText
    }

    // 使用同一套清洗规则判断“可见内容”，避免 raw 文本非空但清洗后为空导致页面看起来无回复。
    const visibleContent = normalizeIncomingText(
      freezePolishTable && stablePolishTableSnapshot
        ? replacePolishReasonTableWithStableSnapshot(displayedText, stablePolishTableSnapshot)
        : displayedText,
      { trim: true }
    )
    const visibleReasoning = normalizeIncomingText(displayedReasoningText, { trim: true })
    const preservedVisible = normalizeIncomingText(
      lockedPolishTable || preservedStructuredContent,
      {
        trim: true,
      }
    )
    const isErrorResponse =
      recoveredAssistantStatus === 4 ||
      Boolean(lastError.value) ||
      (finishReason === 'error' && !visibleContent)
    if (!visibleContent) {
      if (preservedVisible) {
        displayedText = preservedVisible
      } else if (fileVectorResult) {
        displayedText = '文件已生成，可在下方下载。'
      } else if (workflowRecoveredFromServer && taskData?.type === 'academic-workflow') {
        displayedText = ''
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

    const workflowCompletedSuccessfully =
      taskData?.type === 'academic-workflow' &&
      String(taskData?.status || '').trim().toLowerCase() === 'done' &&
      hasVisibleText(displayedText)
    if (workflowCompletedSuccessfully) {
      lastError.value = ''
      recoveredAssistantStatus = 3
    }

    const shouldSanitizeAssistantFailure =
      !workflowCompletedSuccessfully &&
      (Boolean(lastError.value) ||
        finishReason === 'error' ||
        /api[_ -]?key|authorization|bearer\s+|network error|request timeout|read timed out|connect timeout|http(?:s)?connectionpool|max retries exceeded|socket hang up|connection aborted|econn(?:refused|reset)|enotfound|getaddrinfo/i.test(
          String(displayedText || '')
        ))
    if (shouldSanitizeAssistantFailure) {
      displayedText = sanitizeUserFacingErrorMessage(
        displayedText,
        finishReason === 'error' ? 502 : 0,
        '学术能力暂时不可用，请稍后重试'
      )
    }

    if (visibleReasoning) {
      displayedReasoningText = visibleReasoning
    }

    if (academicMode.value && !isErrorResponse && assistantLogId && hasVisibleText(displayedText)) {
      try {
        await fetchSyncDisplayContentAPI({
          chatId: Number(assistantLogId),
          content: displayedText,
          reasoningText: displayedReasoningText || undefined,
        })
      } catch (syncError) {
        console.error('[academic] sync display content failed:', syncError)
      }
    }

    patchCurrentAssistant({
      chatId: assistantLogId ? Number(assistantLogId) : undefined,
      content: displayedText,
      reasoningText: displayedReasoningText,
      thinkingPreview,
      mcpToolUse,
      networkSearchResult,
      fileVectorResult,
      tool_calls,
      promptReference,
      nodeType,
      stepName,
      workflowProgress,
      taskData,
      isWorkflowMessage: isWorkflowConversation,
      loading: false,
      error: isErrorResponse,
      status: recoveredAssistantStatus || (isErrorResponse ? 4 : 3),
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
    await chatStore.deleteChatById(Number(item.chatId))
    return
  }
  const idx = dataSources.value.findIndex(chat => chat === item)
  if (idx >= 0) {
    chatStore.chatList.splice(idx, 1)
  }
}

const handleEditConversation = async (payload: Chat.ConversationParams) => {
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
    let workflowTask: Chat.AcademicWorkflowTaskData | null = null
    if (assistant?.taskData) {
      if (typeof assistant.taskData === 'object' && assistant.taskData?.type === 'academic-workflow') {
        workflowTask = assistant.taskData as Chat.AcademicWorkflowTaskData
      } else if (typeof assistant.taskData === 'string') {
        try {
          const parsed = JSON.parse(assistant.taskData)
          if (parsed?.type === 'academic-workflow') {
            workflowTask = parsed as Chat.AcademicWorkflowTaskData
          }
        } catch (_error) {}
      }
    }

    if (workflowTask?.steps?.length) {
      chatStore.setAcademicCore(undefined)
      chatStore.setAcademicPlugin(undefined)
      chatStore.setAcademicWorkflowSteps(
        workflowTask.steps.slice(0, 3).map(step => ({
          kind: step.kind === 'plugin' ? 'plugin' : 'core',
          name: String(step.name || '').trim(),
          displayName: String(step.displayName || step.name || '').trim(),
          args: String(step.args || '').trim(),
        }))
      )
      chatStore.setAcademicWorkflowEnabled(true)
    } else {
      chatStore.clearAcademicWorkflow()
    }

    const currentModelInfo = getCurrentConversationModelInfo()
    await handleEditConversation({
      msg: String(userMsg?.content || ''),
      imageUrl: userMsg?.imageUrl,
      fileUrl: userMsg?.fileUrl,
      model: currentModelInfo.model,
      modelName: currentModelInfo.modelName,
      modelType: currentModelInfo.modelType,
      modelAvatar: currentModelInfo.modelAvatar,
      overwriteReply: true,
      chatId: userMsg?.chatId ? Number(userMsg.chatId) : undefined,
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
provide('getActiveConversationModelInfo', getCurrentConversationModelInfo)
provide('messageViewportRef', scrollRef)
provide('openResearchImport', handleImportFiles)
provide('openResearchControls', openDesktopAcademicPanel)

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
  <div class="prism-shell flex h-full w-full">
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

      <!-- Conditional Content - Keep original non-transparent backgrounds for these -->
      <template v-if="useGlobalStore.externalLinkDialog">
        <HeaderComponent
          :class="[
            'relative z-10 flex-shrink-0',
            activeChatBackgroundImg && !useGlobalStore.showAppListComponent
              ? 'bg-[var(--bg-body)]/92 backdrop-blur-sm'
              : 'bg-[var(--bg-body)] backdrop-blur-sm',
          ]"
          @toggle-app-list="toggleAppList"
        />
        <ExternalLinkComponent class="relative z-10 flex-1 bg-[var(--bg-body)]" />
      </template>
      <template v-else-if="useGlobalStore.showAppListComponent">
        <HeaderComponent
          :class="[
            'relative z-10 flex-shrink-0',
            activeChatBackgroundImg && !useGlobalStore.showAppListComponent
              ? 'bg-[var(--bg-body)]/92 backdrop-blur-sm'
              : 'bg-[var(--bg-body)] backdrop-blur-sm',
          ]"
          @toggle-app-list="toggleAppList"
        />
        <AppList
          class="relative z-10 flex-1 overflow-hidden bg-[var(--bg-body)]"
          @run-app="handleRunAppFromList"
          @show-member-dialog="handleShowMemberDialogFromList"
          @run-app-with-data="handleRunAppWithData"
        />
      </template>
      <template v-else>
        <div class="relative z-10 flex h-full min-h-0">
          <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <HeaderComponent
              :class="[
                'relative z-10 flex-shrink-0',
                activeChatBackgroundImg && !useGlobalStore.showAppListComponent
                  ? 'bg-[var(--bg-body)]/92 backdrop-blur-sm'
                  : 'bg-[var(--bg-body)] backdrop-blur-sm',
              ]"
              @toggle-app-list="toggleAppList"
            />

            <!-- Main Chat Area - Prism-style split layout -->
            <main class="relative z-10 flex-1 overflow-hidden">
              <div class="h-full w-full">
                <div class="mx-auto flex h-full min-h-0 min-w-0 w-full max-w-[1280px]">
                  <div class="flex min-h-0 min-w-0 flex-1 flex-col">
                    <div class="flex-1 min-h-0 overflow-hidden">
                      <div
                        id="scrollRef"
                        ref="scrollRef"
                        class="relative h-full overflow-y-auto overflow-x-hidden scroll-smooth custom-scrollbar"
                        style="background-color: transparent; position: relative; z-index: 5"
                        @scroll="handleWorkspaceScroll"
                      >
                        <div
                          id="image-wrapper"
                          class="w-full h-full pb-8"
                          :class="[isMobile ? 'px-3 py-3' : 'px-6 py-6']"
                        >
                          <div class="mx-auto w-full max-w-[1120px]">
                            <div
                              v-if="showDetailedErrorBanner"
                              class="mb-4 flex items-start justify-between gap-3 rounded-2xl border border-red-200/80 bg-red-50/80 px-4 py-3 text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
                            >
                              <div class="text-sm leading-6">
                                <div class="font-semibold">请求失败</div>
                                <div>{{ lastError }}</div>
                                <div v-if="lastErrorRequestId" class="mt-1 opacity-80">
                                  请求ID: {{ lastErrorRequestId }}
                                </div>
                              </div>
                              <button class="btn-pill btn-sm" @click="clearLastError">
                                知道了
                              </button>
                            </div>

                            <template v-if="!renderDataSources.length && !activeAppId">
                              <div class="workspace-surface">
                                <WorkspaceHome @import="handleImportFiles" />
                              </div>
                            </template>
                            <template v-if="!renderDataSources.length && activeAppId">
                              <div
                                class="workspace-document flex items-center justify-center p-5"
                                :class="[isMobile ? 'h-full' : 'min-h-[480px]']"
                              >
                                <AppTips :appId="activeAppId" />
                              </div>
                            </template>
                            <template v-if="renderDataSources.length">
                              <div
                                class="workspace-document mx-auto w-full max-w-[1048px] overflow-visible"
                              >
                                <div class="px-2 py-1">
                                  <div
                                    v-if="chatHistoryHasMore || chatHistoryLoading"
                                    class="mb-3 flex justify-center"
                                  >
                                    <button
                                      v-if="chatHistoryHasMore && !chatHistoryLoading"
                                      type="button"
                                      class="btn-pill btn-sm"
                                      @click="loadOlderMessages"
                                    >
                                      加载更早消息
                                    </button>
                                    <div
                                      v-else
                                      class="inline-flex items-center rounded-full bg-[var(--surface-muted)] px-3 py-1.5 text-xs text-[var(--text-sub)]"
                                    >
                                      正在加载更早消息...
                                    </div>
                                  </div>
                                  <div
                                    v-if="virtualMessageState.paddingTop > 0"
                                    :style="{ height: `${virtualMessageState.paddingTop}px` }"
                                    aria-hidden="true"
                                  />
                                  <Message
                                    v-for="entry in virtualMessageState.visibleItems"
                                    :key="entry.key"
                                    :index="entry.index"
                                    :chatId="entry.item.chatId"
                                    :content="entry.item.content"
                                    :reasoningText="entry.item.reasoningText"
                                    :thinkingPreview="entry.item.thinkingPreview"
                                    :model="entry.item.model"
                                    :modelType="entry.item.modelType"
                                    :modelName="entry.item.modelName"
                                    :modelAvatar="entry.item.modelAvatar"
                                    :status="entry.item.status"
                                    :imageUrl="entry.item.imageUrl"
                                    :fileUrl="entry.item.fileUrl"
                                    :ttsUrl="entry.item.ttsUrl"
                                    :taskId="entry.item.taskId"
                                    :taskData="entry.item.taskData"
                                    :isWorkflowMessage="entry.item.isWorkflowMessage"
                                    :stepName="entry.item.stepName"
                                    :workflowProgress="entry.item.workflowProgress"
                                    :videoUrl="entry.item.videoUrl"
                                    :audioUrl="entry.item.audioUrl"
                                    :action="entry.item.action"
                                    :role="entry.item.role"
                                    :loading="entry.item.loading"
                                    :drawId="entry.item.drawId"
                                    :customId="entry.item.customId"
                                    :pluginParam="entry.item.pluginParam"
                                    :promptReference="entry.item.promptReference"
                                    :progress="entry.item.progress"
                                    :networkSearchResult="entry.item.networkSearchResult"
                                    :fileVectorResult="entry.item.fileVectorResult"
                                    :isLast="entry.index === renderDataSources.length - 1"
                                    :usingNetwork="entry.item.usingNetwork"
                                    :usingDeepThinking="false"
                                    :useFileSearch="entry.item.useFileSearch"
                                    :tool_calls="entry.item.tool_calls"
                                    @delete="handleDelete(entry.item)"
                                    @height-change="
                                      handleMessageHeightChange(entry.item, entry.index, $event)
                                    "
                                  />
                                  <div
                                    v-if="virtualMessageState.paddingBottom > 0"
                                    :style="{ height: `${virtualMessageState.paddingBottom}px` }"
                                    aria-hidden="true"
                                  />
                                  <div class="sticky bottom-2 z-20 flex justify-center p-1">
                                    <DownSmall
                                      v-show="!isAtBottom"
                                      size="24"
                                      class="cursor-pointer rounded-full bg-[var(--surface-muted)] p-1.5 text-[var(--ink-soft)] transition-all duration-300 ease-in-out dark:bg-[var(--surface-panel)] dark:text-gray-400"
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
                              </div>
                            </template>
                            <div ref="bottomContainer" class="bottom" />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div class="relative z-20 w-full px-2 pb-3 pt-2">
                      <FooterComponent
                        ref="footerRef"
                        :class="['z-20 relative', isMobile ? 'pb-safe' : '']"
                        @pause-request="pauseRequest"
                        :dataSourcesLength="renderDataSources.length"
                      >
                      </FooterComponent>
                    </div>
                  </div>
                </div>
              </div>
            </main>
          </div>
          <aside
            v-if="!isMobile"
            ref="desktopAcademicPanelRef"
            class="desktop-research-rail flex h-full min-h-0 shrink-0 self-stretch flex-col"
            :class="[isSmallXl ? 'w-[288px]' : 'w-[324px]']"
          >
            <div class="flex h-full min-h-0 flex-col overflow-hidden">
              <div class="flex items-start justify-between gap-4 px-5 pb-2 pt-5">
                <div class="min-w-0">
                  <div class="text-[15px] font-medium text-[var(--text-main)]">
                    {{ t('lens.academicPanel.title') }}
                  </div>
                </div>
              </div>
              <div class="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-4 custom-scrollbar">
                    <AcademicPanel
                      :core-label="t('lens.academicPanel.coreLabel')"
                      :plugin-label="t('lens.academicPanel.pluginLabel')"
                      :core-placeholder="t('lens.academicPanel.corePlaceholder')"
                      :plugin-placeholder="t('lens.academicPanel.pluginPlaceholder')"
                      :plugin-args-label="t('lens.academicPanel.customInstructionLabel')"
                      :plugin-args-placeholder="t('lens.academicPanel.customInstructionPlaceholder')"
                      info-label="说明"
                      :embedded="true"
                  :show-close="false"
                />
              </div>
            </div>
          </aside>
        </div>
        <teleport to="body">
          <transition name="fade">
            <div
              v-if="isMobile && mobileAcademicPanelVisible"
              class="fixed inset-0 z-[100] flex items-end bg-[var(--modal-overlay)] backdrop-blur-[8px]"
              @click.self="closeMobileAcademicPanel"
            >
              <div
                class="w-full rounded-t-[22px] bg-[var(--surface-panel)] px-4 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4 shadow-[var(--shadow-panel)]"
              >
                <div class="mx-auto mb-3 h-1.5 w-12 rounded-full bg-[var(--accent-soft)]"></div>
                <div class="max-h-[78vh] overflow-y-auto custom-scrollbar">
                  <AcademicPanel
                    :core-label="t('lens.academicPanel.coreLabel')"
                    :plugin-label="t('lens.academicPanel.pluginLabel')"
                    :core-placeholder="t('lens.academicPanel.corePlaceholder')"
                    :plugin-placeholder="t('lens.academicPanel.pluginPlaceholder')"
                    :plugin-args-label="t('lens.academicPanel.customInstructionLabel')"
                    :plugin-args-placeholder="t('lens.academicPanel.customInstructionPlaceholder')"
                    info-label="说明"
                    :embedded="false"
                    :show-close="true"
                    @close="closeMobileAcademicPanel"
                  />
                </div>
              </div>
            </div>
          </transition>
        </teleport>
      </template>
    </div>

    <!-- 通用应用配置弹窗 -->
    <transition name="modal-fade">
      <!-- Backdrop and Centering Container -->
      <div
        v-if="showFormModal && selectedAppForModal"
        class="fixed inset-0 z-[9000] flex items-center justify-center bg-[var(--modal-overlay)] backdrop-blur-[10px]"
        @click.self="handleModalClose"
      >
        <!-- Modal Content Container -->
        <div
          class="relative m-4 flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-[var(--paper-border)] bg-[var(--dialog-bg)] shadow-[var(--dialog-shadow)]"
        >
          <!-- Background Image Layer -->
          <div
            v-if="selectedAppForModal?.backgroundImg"
            class="absolute inset-0 z-0 opacity-10"
            :style="backgroundStyle"
          ></div>

          <!-- Header -->
          <div
            class="relative z-10 flex flex-shrink-0 items-center justify-between border-b border-[var(--paper-border)] bg-[var(--surface-elevated)] p-4 backdrop-blur-sm"
          >
            <span class="text-xl font-bold text-[var(--text-main)]"
              >预设配置: {{ selectedAppForModal?.name || '' }}</span
            >
            <button
              @click="handleModalClose"
              class="p-1 text-[var(--ink-faint)] transition hover:text-[var(--text-main)]"
            >
              <Close size="18" />
            </button>
          </div>

          <!-- Scrollable Content Area with native scroll -->
          <div
            class="relative z-10 flex-grow overflow-y-auto bg-[var(--surface-elevated)] p-4 backdrop-blur-sm"
          >
            <!-- Form Grid -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <!-- Form Field -->
              <div v-for="(field, index) in currentFormSchema" :key="index">
                <!-- Label -->
                <label
                  class="mb-1 block text-sm font-medium leading-6 text-[var(--text-main)]"
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
            class="relative z-10 flex flex-shrink-0 justify-end space-x-2 border-t border-[var(--paper-border)] bg-[var(--surface-elevated)] p-4 backdrop-blur-sm"
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
