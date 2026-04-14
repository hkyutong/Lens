<script setup lang="ts">
import { fetchQueryAppsAPI, fetchQueryOneCatAPI } from '@/api/appStore'
import type { ResData } from '@/api/types'
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import {
  AddPicture,
  FullScreen,
  LoadingFour,
  OffScreen,
  Plus,
  SendOne,
  Sphere,
  Square,
  TwoEllipses,
} from '@icon-park/vue-next'
import PinyinMatch from 'pinyin-match'

// import { getDocument } from 'pdfjs-dist';
import { uploadFile } from '@/api/upload'
import { getAcademicEntityDisplayLabel } from '@/utils/academicI18n'
import { getAcademicWorkflowChainLabel } from '@/utils/academicWorkflow'
import { message } from '@/utils/message'
import {
  computed,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  Ref,
  ref,
  watch,
} from 'vue'
import FilePreview from './components/FilePreview.vue'
import ModelSelector from '../ModelSelector.vue'

interface Emit {
  (ev: 'pause-request'): void
}

interface Props {
  dataSourcesLength: number
}

const props = defineProps<Props>()

// 引入依赖
const onConversation = inject<any>('onConversation')
// 引用的 store
const useGlobalStore = useGlobalStoreWithOut()
const authStore = useAuthStore()
const chatStore = useChatStore()
const emit = defineEmits<Emit>()
const ms = message()
const isFile = ref(true)
const fileInput = ref()
const imageInput = ref()
const isUploading = ref(false)
const searchResults = ref<any[]>([])
const inputRef = ref<Ref | null>(null)
const footerRef = ref<HTMLElement | null>(null) // 添加容器引用
const isDragging = ref(false) // 添加拖拽状态标志
const isFileDraggingOverPage = ref(false) // 添加文件拖到页面内(但未到输入框)的状态标志
const extraParam = ref<{
  size: string
  style: string
  quality?: string
  compression?: string
  background?: string
}>({ size: '', style: '' })

const showSuggestions = ref(false)
const selectedApp = ref()
const isSelectedApp = ref(false)
const appList = ref<App[]>([])
let searchTimeout: string | number | NodeJS.Timeout | null | undefined = null
const fileUploadConfig = ref({
  accept: '.pdf, .txt, .doc, .docx,.ppt,.pptx, .xlsx,.xls,.csv .md, .markdown',
  multiple: true,
})

interface App {
  id: number
  name: string
  des: string
  coverImg: string
  catId: number
  appCount: number
  demoData: string
  backgroundImg?: string
  prompt?: string
  loading?: boolean
  createdAt: string
  updatedAt: string
}

// 双向绑定 chatStore.prompt
const prompt = computed({
  get: () => chatStore.prompt,
  set: value => {
    chatStore.setPrompt(value || '')
  },
})

const usingNetwork = computed({
  get: () => chatStore.usingNetwork,
  set: value => {
    chatStore.setUsingNetwork(value)
  },
})

const usingDeepThinking = computed({
  get: () => chatStore.usingDeepThinking,
  set: value => {
    chatStore.setUsingDeepThinking(value)
  },
})

const academicMode = computed({
  get: () => chatStore.academicMode,
  set: value => {
    if (value) chatStore.setUsingPlugin(null)
    chatStore.setAcademicMode(value)
  },
})
const { isMobile } = useBasicLayout()
const usingPlugin = computed(() => chatStore.currentPlugin)
const isStreamIn = computed(() => {
  return chatStore.isStreamIn !== undefined ? chatStore.isStreamIn : false
})
const isLogin = computed(() => authStore.isLogin)
const isAdvancedUploadUser = computed(() => {
  const balance: any = authStore.userBalance || {}
  const hasMember =
    Number(balance.packageId) > 0 ||
    (balance.expirationTime && new Date(balance.expirationTime) > new Date())
  const hasSpecialCredits =
    Number(balance.model4Count || 0) > 0 ||
    Number(balance.drawMjCount || 0) > 0 ||
    Number(balance.memberModel4Count || 0) > 0 ||
    Number(balance.memberDrawMjCount || 0) > 0
  return hasMember || hasSpecialCredits
})
const maxDocumentSizeMb = computed(() => (isAdvancedUploadUser.value ? 30 : 5))
const maxImageSizeMb = computed(() => (isAdvancedUploadUser.value ? 10 : 5))
const dataSources = computed(() => chatStore.chatList || [])
const activeModelName = computed(() => String(configObj?.value?.modelInfo?.modelName || ''))
const activeModelKeyType = computed(() => {
  return usingPlugin.value?.modelType || Number(configObj?.value?.modelInfo?.keyType)
})

const activeGroupId = computed(() => chatStore.active)
const activeGroupInfo = computed(() => chatStore.getChatByGroupInfo())
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
const activeModelFileUpload = computed(() => Number(configObj?.value?.modelInfo?.isFileUpload))
const activeModelImageUpload = computed(() => Number(configObj?.value?.modelInfo?.isImageUpload))

watch(
  () => usingPlugin.value?.parameters,
  param => {
    if (param === 'mermaid') {
      chatStore.setUsingPlugin(null)
    }
  },
  { immediate: true }
)

const isFilesModel = computed(() => {
  // 如果不使用插件，则按照模型配置判断
  return activeModelFileUpload.value !== 0
})

const isImageModel = computed(() => {
  // 如果不使用插件，则按照模型配置判断
  return activeModelImageUpload.value !== 0
})

const isNetworkSearch = computed(() => configObj?.value?.modelInfo?.isNetworkSearch || false)

const isDeepThinking = computed(() => configObj?.value?.modelInfo?.deepThinkingType === 1 || false)

const clipboardText = computed(() => useGlobalStore.clipboardText)

watch(
  () => isNetworkSearch.value,
  enabled => {
    if (!enabled && usingNetwork.value) {
      usingNetwork.value = false
    }
  },
  { immediate: true }
)

const buttonDisabled = computed(
  () =>
    isStreamIn.value ||
    !isLogin.value ||
    ((!prompt.value || prompt.value.trim() === '') && !(dataBase64List.value.length > 0))
)

const isExpanded = ref(false) // 控制输入框是否扩展
const shouldShowExpandButton = ref(false) // 控制是否显示扩展按钮

const autoResize = () => {
  if (inputRef.value) {
    const textarea = inputRef.value

    if (isExpanded.value) {
      // 展开模式下，使用较高但有限的高度
      const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 20
      const expandedMaxLines = 8
      textarea.style.height = `${lineHeight * expandedMaxLines}px`
      textarea.style.overflowY = 'auto'
      return
    }

    // 普通模式下，先重置高度，然后根据内容自适应
    textarea.style.height = 'auto' // 使用auto而不是固定的小值，让浏览器自动计算

    // 获取自动计算后的scrollHeight
    const contentHeight = textarea.scrollHeight

    // 获取行高
    const singleLineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 20 // 默认行高 20px

    // 普通模式最大行数为4行
    const maxLines = 4
    const maxHeight = singleLineHeight * maxLines // 最大高度

    // 计算新高度，确保不超过最大高度
    const newHeight = Math.min(contentHeight, maxHeight)

    // 设置新高度
    textarea.style.height = `${newHeight}px`
    textarea.style.overflowY = contentHeight > maxHeight ? 'auto' : 'hidden'

    // 判断是否应该显示扩展按钮 - 当内容高度超过3行时显示
    shouldShowExpandButton.value = contentHeight > singleLineHeight * 3
  }
}

// 切换扩展模式
const toggleExpanded = () => {
  // 从展开到收起模式时，先获取当前高度
  const currentHeight = isExpanded.value ? inputRef.value.style.height : null

  // 切换状态
  isExpanded.value = !isExpanded.value

  nextTick(() => {
    if (isExpanded.value) {
      const textarea = inputRef.value
      const lineHeight = parseFloat(window.getComputedStyle(textarea).lineHeight) || 20
      const expandedMaxLines = 8
      textarea.style.height = `${lineHeight * expandedMaxLines}px`
      textarea.style.overflowY = 'auto'
    } else {
      // 收起模式时，先保持当前高度，然后在下一帧进行调整
      // 这样可以让过渡效果更平滑
      if (currentHeight) {
        // 先设置当前高度，避免立即收缩导致的视觉跳跃
        inputRef.value.style.height = currentHeight

        // 在下一帧进行实际的大小调整
        requestAnimationFrame(() => {
          autoResize()
        })
      } else {
        autoResize()
      }
    }
  })
}

// 监听 prompt 的变化（外部修改时调整高度）
watch(
  prompt,
  () => {
    nextTick(() => {
      autoResize()
    })
  },
  { immediate: true } // 初始化时立即调整
)

const handleInput = async (event: KeyboardEvent) => {
  const inputElement = event.target as HTMLTextAreaElement
  const inputValue = inputElement.value
  showSuggestions.value = inputValue.startsWith('@')

  // 清除之前的定时器，如果有的话
  if (searchTimeout) {
    clearTimeout(searchTimeout)
  }

  if (showSuggestions.value && !isSelectedApp.value) {
    const searchTerm = inputValue.slice(1) // 去掉'@'

    // 使用定时器来节流搜索请求
    searchTimeout = setTimeout(async () => {
      if (searchTerm.length > 0) {
        try {
          const keywordLower = searchTerm.toLowerCase()

          // 根据拼音匹配过滤符合的应用
          const filteredResults = appList.value.filter(item =>
            PinyinMatch.match(item.name, keywordLower)
          )

          searchResults.value = filteredResults.slice(0, 5)
        } catch (error) {
          console.error('Error fetching search results:', error)
          searchResults.value = []
        }
      } else {
        // 如果关键字为空，随机选取5个结果
        const randomResults = appList.value
          .sort(() => Math.random() - 0.5) // 随机打乱顺序
          .slice(0, 5) // 取前5个
        searchResults.value = randomResults
      }
    }, 100) // 设置1秒的延迟
  } else {
    searchResults.value = []
  }
}

async function queryApps() {
  const res: ResData = await fetchQueryAppsAPI()
  appList.value = res?.data?.rows.map((item: App) => {
    item.loading = false
    return item
  })
  // activeList.value = appList.value;
}

const activeModelAvatar = computed(() => {
  return String(usingPlugin?.value?.pluginImg || configObj?.value.modelInfo?.modelAvatar || '')
})

const selectedAcademicLabel = computed(() => {
  if (chatStore.academicWorkflowEnabled && (chatStore.academicWorkflowSteps || []).length) {
    return getAcademicWorkflowChainLabel(chatStore.academicWorkflowSteps || [])
  }
  return getAcademicEntityDisplayLabel(
    chatStore.currentAcademicPlugin || chatStore.currentAcademicCore
  )
})

const selectedAcademicCompactLabel = computed(() => {
  if (chatStore.academicWorkflowEnabled && (chatStore.academicWorkflowSteps || []).length) {
    const labels = (chatStore.academicWorkflowSteps || [])
      .map(step => getAcademicEntityDisplayLabel(step as any) || step?.displayName || step?.name || '')
      .filter(Boolean)
    if (!labels.length) return ''
    if (labels.length === 1) return labels[0]
    return `${labels[0]} · ${labels.length}${t('lens.workflow.stepsShort')}`
  }
  return selectedAcademicLabel.value
})

const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>

// 修改计算属性，直接从对话组获取fileUrl
const fileUrl = computed(() => activeGroupInfo.value?.fileUrl || '')

// 修改计算属性，解析fileUrl为对象数组
const savedFiles = computed(() => {
  if (!fileUrl.value) return []

  try {
    return JSON.parse(fileUrl.value) as { name: string; url: string; type?: string }[]
  } catch (e) {
    console.error('解析fileUrl失败:', e)
    return []
  }
})

const handleSubmit = async (index?: number) => {
  if (isStreamIn.value) {
    return
  }
  if (!isLogin.value) {
    authStore.setLoginDialog(true)
    ms.info('请先登录后再提问')
    return
  }

  if ((chatStore.groupList || []).length === 0) {
    await createNewChatGroup()
  }
  chatStore.setStreamIn(true)
  let action = ''

  let useModel =
    usingPlugin.value?.parameters || selectedApp?.value?.model || chatStore?.activeModel
  let useModelName =
    usingPlugin?.value?.pluginName || selectedApp?.value?.name || activeModelName.value

  const useModelType = usingPlugin.value?.parameters ? 2 : activeModelKeyType.value

  let modelAvatar = selectedApp?.value?.coverImg || activeModelAvatar.value
  let appId

  if (selectedApp?.value) {
    appId = selectedApp?.value?.id
  } else {
    appId = activeGroupInfo?.value?.appId
  }

  let imageUrl = ''
  let submittedFileUrl = ''
  let msg = prompt.value || ''
  let uploadFailed = false

  // 附件统一在发送时上传，上传完成后随本次消息一起提交
  const imageFiles = fileList.value.filter(file => file.type.startsWith('image/'))
  const documentFiles = fileList.value.filter(file => !file.type.startsWith('image/'))
  let uploadedImageCount = 0
  let uploadedDocCount = 0
  if (imageFiles.length > 0 || documentFiles.length > 0) {
    isUploading.value = true
    try {
      if (imageFiles.length > 0) {
        const imageResults = await Promise.all(
          imageFiles.map(async file => {
            try {
              const response = await uploadFile(file)
              return response.data
            } catch (error) {
              console.error(`上传图片 ${file.name} 失败:`, error)
              uploadFailed = true
              return ''
            }
          })
        )
        uploadedImageCount = imageResults.filter(Boolean).length
        imageUrl = imageResults.filter(Boolean).join(',')
      }

      if (documentFiles.length > 0) {
        const docResults = await Promise.all(
          documentFiles.map(async file => {
            try {
              const response = await uploadFile(file)
              return {
                name: file.name,
                url: response.data,
                type: 'document',
              }
            } catch (error) {
              console.error(`上传文件 ${file.name} 失败:`, error)
              uploadFailed = true
              return null
            }
          })
        )
        const uploadedDocs = docResults.filter(Boolean)
        uploadedDocCount = uploadedDocs.length
        submittedFileUrl = uploadedDocs.length > 0 ? JSON.stringify(uploadedDocs) : ''
      }
    } catch (error) {
      console.error('附件上传过程中发生错误:', error)
      uploadFailed = true
      ms.error('附件上传失败')
    } finally {
      isUploading.value = false
    }
  }

  const hasAttachmentUploadMismatch =
    (imageFiles.length > 0 && uploadedImageCount !== imageFiles.length) ||
    (documentFiles.length > 0 && uploadedDocCount !== documentFiles.length)
  if (uploadFailed || hasAttachmentUploadMismatch) {
    chatStore.setStreamIn(false)
    useGlobalStore.updateIsChatIn(false)
    ms.error('附件上传失败，请重试后再发送')
    return
  }

  if (appId) {
    try {
      const res: any = await fetchQueryOneCatAPI({ id: appId })
      modelAvatar = res.data.modelAvatar
    } catch (error) {}
  }

  await chatStore.setPrompt('')
  isExpanded.value = false
  shouldShowExpandButton.value = false
  if (inputRef.value) {
    inputRef.value.style.height = ''
    nextTick(() => {
      autoResize()
    })
  }

  onConversation({
    msg: msg,
    action: action,
    model: useModel,
    modelName: useModelName,
    modelType: useModelType,
    modelAvatar: modelAvatar,
    appId: appId,
    extraParam: extraParam.value,
    fileUrl: submittedFileUrl,
    imageUrl: imageUrl,
    pluginParam: usingPlugin.value?.parameters,
  })

  isUploading.value = false

  fileList.value = []
  dataBase64List.value = []

  // 重要: 清空临时变量，确保不会被再次使用
  imageUrl = ''
}

const triggerUpload = () => {
  // 根据当前模型支持情况决定触发哪种上传
  const canUploadFiles = isFilesModel.value || academicMode.value
  const canUploadImages = isImageModel.value

  if (canUploadFiles && canUploadImages) {
    // 两种类型都支持，使用综合配置
    fileUploadConfig.value = {
      accept: '*/*',
      multiple: true,
    }
  } else if (canUploadImages) {
    // 只支持图片
    fileUploadConfig.value = {
      accept: 'image/*',
      multiple: true,
    }
  } else if (canUploadFiles) {
    // 只支持文件
    fileUploadConfig.value = {
      accept: '*/*',
      multiple: true,
    }
  }

  // 重新设置 input 的属性
  if (fileInput.value) {
    fileInput.value.accept = fileUploadConfig.value.accept
    fileInput.value.multiple = fileUploadConfig.value.multiple
  }

  // 触发文件选择
  fileInput?.value?.click()
}

const openFilePicker = (accept?: string) => {
  if (!fileInput.value) return
  if (accept) fileInput.value.accept = accept
  fileInput.value.multiple = true
  fileInput.value.click()
}

const fileList = ref<File[]>([]) // 使用 ref 来创建响应式的文件列表
const dataBase64List = ref<string[]>([]) // 使用 ref 来创建响应式的 Base64 数据列表
const MAX_IMAGE_FILES = 10
const MAX_DOCUMENT_FILES = 10
const filterPendingFiles = (keep: (file: File) => boolean) => {
  const nextFiles: File[] = []
  const nextData: string[] = []
  fileList.value.forEach((file, index) => {
    if (keep(file)) {
      nextFiles.push(file)
      nextData.push(dataBase64List.value[index] || '')
    }
  })
  fileList.value = nextFiles
  dataBase64List.value = nextData
}

const handleSetFile = async (file: File) => {
  // 添加数量限制检查
  const isImageFile = file.type.startsWith('image/')

  // 获取当前待发送附件数量
  const currentImageCount = fileList.value.filter(f => f.type.startsWith('image/')).length
  const currentFileCount = fileList.value.filter(f => !f.type.startsWith('image/')).length

  // 图片数量限制为10张（待发送附件）
  if (isImageFile && currentImageCount >= MAX_IMAGE_FILES) {
    ms.warning(`图片数量已达上限（最多${MAX_IMAGE_FILES}张）`)
    return
  }

  // 文件数量限制为10个（待发送附件）
  if (!isImageFile && currentFileCount >= MAX_DOCUMENT_FILES) {
    ms.warning(`文件数量已达上限（最多${MAX_DOCUMENT_FILES}个）`)
    return
  }

  fileList.value.push(file) // 使用 .value 访问 ref 对象并追加新文件
  if (!isImageFile) {
    // 文档只保留文件名，不读取base64，避免大文件占用内存
    dataBase64List.value.push('')
    return
  }

  await new Promise<void>(resolve => {
    const reader = new FileReader()
    reader.onload = (event: any) => {
      const base64Data = event.target?.result as string
      dataBase64List.value.push(base64Data) // 使用 .value 访问 ref 对象并追加 Base64 数据
      resolve()
    }
    reader.onerror = () => {
      dataBase64List.value.push('')
      resolve()
    }
    reader.readAsDataURL(file) // 读取图片并转换为 Base64
  })
}

const blockedDocumentExtensions = ['exe', 'sh', 'bat', 'js', 'php', 'py']
const isBlockedDocument = (file: File) => {
  const fileName = file.name.toLowerCase()
  return blockedDocumentExtensions.some(ext => fileName.endsWith(`.${ext}`))
}

const handlePaste = async (event: ClipboardEvent) => {
  const clipboardData = event.clipboardData || (window as any).clipboardData
  const items = clipboardData.items

  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile()
      if (file) {
        if (file.type.startsWith('image/') && isImageModel.value) {
          await processImageFile(file)
        } else if (!file.type.startsWith('image/') && (isFilesModel.value || academicMode.value)) {
          await processDocumentFile(file)
        } else {
          console.warn('文件类型不匹配当前模型支持的类型:', file.name)
        }
      }
    }
  }
}

// 处理文档类型文件
const processDocumentFile = async (file: File) => {
  if (file.type.startsWith('image/')) {
    console.warn('图片文件应使用图片上传功能:', file.name)
    return
  }

  if (isBlockedDocument(file)) {
    ms.warning(`不支持的文件类型: ${file.name}`)
    return
  }

  // 检查文件大小限制（普通 5MB / 高级 30MB）
  const maxSize = maxDocumentSizeMb.value * 1024 * 1024
  if (file.size > maxSize) {
    ms.warning(`文件过大: ${file.name}，最大支持${maxDocumentSizeMb.value}MB`)
    return
  }

  const currentFileCount = fileList.value.filter(f => !f.type.startsWith('image/')).length

  // 检查文件总数是否超过限制
  if (currentFileCount >= MAX_DOCUMENT_FILES) {
    ms.warning('文件数量已达上限')
    return
  }

  let trimmedFileName = file.name
  const maxLength = 25 // 最大长度限制
  const extension = trimmedFileName.split('.').pop() || '' // 获取文件扩展名

  if (trimmedFileName.length > maxLength) {
    // 截取文件名并添加省略号，同时保留扩展名
    trimmedFileName =
      trimmedFileName.substring(0, maxLength - extension.length - 1) + '….' + extension
  }

  // 处理非图片文件，支持多文件
  isFile.value = true
  await handleSetFile(file)
}

// 处理图片类型文件
const processImageFile = async (file: File) => {
  if (!file.type.startsWith('image/')) {
    console.warn('非图片文件应使用文件上传功能:', file.name)
    return
  }

  // 检查图片类型
  const acceptedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']

  if (!acceptedTypes.includes(file.type)) {
    ms.warning(`不支持的图片类型: ${file.name}，请使用jpg、png、gif、webp或bmp格式`)
    return
  }

  // 检查图片大小限制（普通 5MB / 高级 10MB）
  const maxSize = maxImageSizeMb.value * 1024 * 1024
  if (file.size > maxSize) {
    ms.warning(`图片过大: ${file.name}，最大支持${maxImageSizeMb.value}MB`)
    return
  }

  // 检查当前已有图片数量
  const currentImageCount = fileList.value.filter(f => f.type.startsWith('image/')).length

  // 检查图片总数是否超过限制
  if (currentImageCount >= MAX_IMAGE_FILES) {
    ms.warning('图片数量已达上限')
    return
  }

  let trimmedFileName = file.name
  const maxLength = 25 // 最大长度限制
  const extension = trimmedFileName.split('.').pop() || '' // 获取文件扩展名

  if (trimmedFileName.length > maxLength) {
    // 截取文件名并添加省略号，同时保留扩展名
    trimmedFileName =
      trimmedFileName.substring(0, maxLength - extension.length - 1) + '….' + extension
  }

  // 处理图片文件，支持多图片
  isFile.value = false
  await handleSetFile(file)
}

const handleFileSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = input?.files
  if (!files || files.length === 0) return

  // 分类文件
  const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))
  const documentFiles = Array.from(files).filter(file => !file.type.startsWith('image/'))

  // 处理图片文件
  if (imageFiles.length > 0 && isImageModel.value) {
    // 获取当前已有图片数量
    const currentImageCount = fileList.value.filter(f => f.type.startsWith('image/')).length
    // 限制只处理允许范围内的图片数量
    const remainingImageSlots = MAX_IMAGE_FILES - currentImageCount

    // 如果图片数量超过限制
    if (imageFiles.length > remainingImageSlots && remainingImageSlots > 0) {
      ms.warning(
        `已选择${imageFiles.length}张图片，但只能再添加${remainingImageSlots}张图片。将只处理前${remainingImageSlots}张图片。`
      )
    } else if (remainingImageSlots <= 0) {
      ms.warning(`图片数量已达上限（最多${MAX_IMAGE_FILES}张）`)
    }

    // 处理允许范围内的图片
    const imagesToProcess = imageFiles.slice(0, Math.max(0, remainingImageSlots))
    for (const file of imagesToProcess) {
      await processImageFile(file)
    }
  } else if (imageFiles.length > 0 && !isImageModel.value) {
    ms.warning('当前模型不支持图片上传')
  }

  // 处理文档文件
  if (documentFiles.length > 0 && (isFilesModel.value || academicMode.value)) {
    const currentFileCount = fileList.value.filter(f => !f.type.startsWith('image/')).length
    const remainingFileSlots = MAX_DOCUMENT_FILES - currentFileCount

    // 如果文件数量超过限制
    if (documentFiles.length > remainingFileSlots && remainingFileSlots > 0) {
      ms.warning(
        `已选择${documentFiles.length}个文件，但只能再添加${remainingFileSlots}个文件。将只处理前${remainingFileSlots}个文件。`
      )
    } else if (remainingFileSlots <= 0) {
      ms.warning(`文件数量已达上限（最多${MAX_DOCUMENT_FILES}个）`)
    }

    // 处理允许范围内的文件（仅挂载到输入框，发送时再上传）
    const filesToProcess = documentFiles.slice(0, Math.max(0, remainingFileSlots))
    for (const file of filesToProcess) {
      await processDocumentFile(file)
    }
  } else if (documentFiles.length > 0 && !isFilesModel.value && !academicMode.value) {
    ms.warning('当前模型不支持文件上传')
  }

  // 清空input的值，允许再次选择相同文件
  input.value = ''
}

const handleImageSelect = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const files = input?.files
  if (!files || files.length === 0) return

  // 计算当前已有图片数量
  const currentImageCount = fileList.value.filter(f => f.type.startsWith('image/')).length

  // 检查图片总数是否超过限制
  if (currentImageCount >= MAX_IMAGE_FILES) {
    ms.warning(`图片数量已达上限（最多${MAX_IMAGE_FILES}张）`)
    input.value = ''
    return
  }

  // 限制只处理允许范围内的图片数量
  const remainingSlots = MAX_IMAGE_FILES - currentImageCount

  // 先收集所有图片文件
  const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'))

  // 如果图片文件数量超过剩余槽位，进行提示
  if (imageFiles.length > remainingSlots) {
    ms.warning(
      `已选择${imageFiles.length}张图片，但只能再添加${remainingSlots}张图片。将只预览前${remainingSlots}张图片。`
    )
  }

  // 只处理剩余槽位数量的图片
  const imagesToProcess = imageFiles.slice(0, remainingSlots)

  // 并行处理所有图片（只预览，不上传）
  try {
    await Promise.all(
      imagesToProcess.map(async file => {
        // 获取Base64预览
        await new Promise<void>(resolve => {
          const reader = new FileReader()
          reader.onload = e => {
            const base64Data = e.target?.result as string
            fileList.value.push(file)
            dataBase64List.value.push(base64Data)
            resolve()
          }
          reader.readAsDataURL(file)
        })
      })
    )
  } catch (error) {
    console.error('批量处理图片失败:', error)
  } finally {
    input.value = ''
  }
}

const clearSelectApp = async () => {
  searchResults.value = []
  showSuggestions.value = false
  isSelectedApp.value = false
  selectedApp.value = null
  chatStore.setUsingPlugin(null)
}

const handleEnter = (event: KeyboardEvent) => {
  if (!isMobile.value) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSubmit()
    }
  } else {
    if (event.key === 'Enter' && event.ctrlKey) {
      event.preventDefault()
      handleSubmit()
    }
  }
}

const selectApp = async (app: any) => {
  // 这里可以设置选中的应用程序的逻辑
  selectedApp.value = app
  isSelectedApp.value = true
  await chatStore.setPrompt('')
  // prompt.value = '';
  inputRef.value?.focus()
}

const handleStop = () => {
  emit('pause-request')
  chatStore.setStreamIn(false)
}

watch(clipboardText, async val => {
  await chatStore.setPrompt(val)
  // prompt.value = val;
  inputRef.value?.focus()
  inputRef.value.scrollTop = inputRef.value.scrollHeight
})

watch(
  dataSources,
  val => {
    if (val.length === 0) return
  },
  { immediate: true }
)

// 监听 activeModelFileUpload 和 activeModelImageUpload 的变化
watch(
  [activeModelFileUpload, activeModelImageUpload],
  async ([newFileUpload, newImageUpload], [oldFileUpload, oldImageUpload]) => {
    if (oldFileUpload !== 0 && newFileUpload === 0) {
      // 文件上传支持从有变为无，清空待发送文档
      filterPendingFiles(file => file.type.startsWith('image/'))
    }

    if (oldImageUpload !== 0 && newImageUpload === 0) {
      // 图片上传支持从有变为无，清空待发送图片
      filterPendingFiles(file => !file.type.startsWith('image/'))
    }
  }
)

// 修改clearData方法，统一使用JSON处理
const clearData = async (index: number, isSavedFile = false) => {
  if (isSavedFile) {
    // 处理已保存的文件，从对话组中删除文件
    try {
      if (fileUrl.value) {
        const files = JSON.parse(fileUrl.value)
        if (Array.isArray(files) && index >= 0 && index < files.length) {
          files.splice(index, 1)
          // 更新对话组文件信息
          await chatStore.updateGroupInfo({
            groupId: activeGroupId.value,
            fileUrl: files.length > 0 ? JSON.stringify(files) : '',
          })
          // 刷新数据以更新UI
          await chatStore.queryMyGroup()
        }
      }
    } catch (error) {
      console.error('删除文件失败：', error)
    }
  } else {
    // 处理新上传的文件，从本地列表中移除
    if (index >= 0 && index < dataBase64List.value.length) {
      dataBase64List.value.splice(index, 1)
      fileList.value.splice(index, 1)
    }
  }
}

const buttonContainerRef = ref<HTMLElement | null>(null)
const availableWidth = ref(0)
const containerResizeObserver = ref<ResizeObserver | null>(null)

// 计算输入框占位符文本，根据不同工具状态显示不同提示
const placeholderText = computed(() => {
  if (!isLogin.value) {
    return t('lens.footer.placeholderLoggedOut')
  }

  if (isDragging.value) {
    return t('lens.footer.placeholderDragging')
  }

  if (selectedApp.value?.name) {
    return t('lens.footer.placeholderContinueApp', { name: selectedApp.value.name })
  }

  if (academicMode.value && selectedAcademicLabel.value) {
    return t('lens.footer.placeholderWithAbility', { name: selectedAcademicLabel.value })
  }

  if (academicMode.value) {
    return t('lens.footer.placeholderAcademicDefault')
  }

  const activeFeatures = []
  if (usingDeepThinking.value) activeFeatures.push(t('lens.footer.featureReasoning'))
  if (usingNetwork.value) activeFeatures.push(t('chat.networkMode'))
  if (activeFeatures.length > 0) {
    return t('lens.footer.placeholderWithFeatures', { features: activeFeatures.join(' + ') })
  }

  return t('lens.footer.placeholderDefault')
})

const shouldShowNetworkSearch = computed(() => {
  // 只检查是否支持网络搜索且没有使用插件
  return isNetworkSearch.value
})

const shouldShowDeepThinking = computed(() => {
  // 只检查是否支持深度思考且没有使用插件
  return isDeepThinking.value
})

// 添加拖拽相关的处理函数
const handleDragOver = (event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()
  isDragging.value = true
}

const handleDragLeave = (event: DragEvent) => {
  event.preventDefault()
  event.stopPropagation()
  isDragging.value = false
}

const handleDrop = (event: DragEvent) => {
  handleUnifiedFileDrop(event, 'area')
}

// 添加全局拖拽相关的处理函数
const handleDocumentDragOver = (event: DragEvent) => {
  event.preventDefault()
  // 检查是否有文件被拖动
  if (event.dataTransfer?.types.includes('Files')) {
    isFileDraggingOverPage.value = true
  }
}

const handleDocumentDragLeave = (event: DragEvent) => {
  // 只有当拖动到viewport外部时才重置状态
  if (
    event.clientX <= 0 ||
    event.clientY <= 0 ||
    event.clientX >= window.innerWidth ||
    event.clientY >= window.innerHeight
  ) {
    isFileDraggingOverPage.value = false
  }
}

const handleDocumentDrop = (event: DragEvent) => {
  // 重置拖拽状态
  isFileDraggingOverPage.value = false
  // 如果不是拖到了指定的上传区域，阻止默认行为
  if (!isDragging.value) {
    event.preventDefault()
  }
}

onMounted(async () => {
  chatStore.setPrompt('')

  // 设置焦点
  nextTick(() => {
    if (inputRef.value && !isMobile.value) {
      inputRef.value.focus()
    }
  })
  await queryApps()
  await chatStore.queryAcademicCoreFunctions()
  await chatStore.queryAcademicPluginList()

  // 添加全局拖拽事件监听
  document.addEventListener('dragover', handleDocumentDragOver)
  document.addEventListener('dragleave', handleDocumentDragLeave)
  document.addEventListener('drop', handleDocumentDrop)

  // 初始化调整宽度
  nextTick(() => {
    if (buttonContainerRef.value) {
      availableWidth.value = buttonContainerRef.value.offsetWidth
    }

    // 创建ResizeObserver来监听容器宽度变化
    containerResizeObserver.value = new ResizeObserver(entries => {
      for (const entry of entries) {
        if (entry.target === buttonContainerRef.value) {
          availableWidth.value = entry.contentRect.width
        }
      }
    })

    if (buttonContainerRef.value) {
      containerResizeObserver.value.observe(buttonContainerRef.value)
    }
  })
})

onUnmounted(() => {
  // 移除全局拖拽事件监听
  document.removeEventListener('dragover', handleDocumentDragOver)
  document.removeEventListener('dragleave', handleDocumentDragLeave)
  document.removeEventListener('drop', handleDocumentDrop)

  // 组件卸载时取消观察
  if (containerResizeObserver.value && buttonContainerRef.value) {
    containerResizeObserver.value.unobserve(buttonContainerRef.value)
    containerResizeObserver.value.disconnect()
  }
})

// 整合文件拖放处理逻辑
const handleUnifiedFileDrop = async (event: DragEvent, source: 'button' | 'area') => {
  event.preventDefault()
  event.stopPropagation()
  isDragging.value = false
  isFileDraggingOverPage.value = false

  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return

  // 将FileList转换为数组以便处理
  const fileArray = Array.from(files)

  // 分类文件
  const imageFiles = fileArray.filter(file => file.type.startsWith('image/'))
  const documentFiles = fileArray.filter(file => !file.type.startsWith('image/'))

  // 检查文件类型支持情况
  const canUploadImages = isImageModel.value
  const canUploadDocuments = isFilesModel.value || academicMode.value

  // 准备处理的文件数组
  const filesToProcess = []
  const unsupportedFiles = []

  // 检查图片文件
  if (imageFiles.length > 0) {
    if (canUploadImages) {
      filesToProcess.push(...imageFiles)
    } else {
      unsupportedFiles.push(
        ...imageFiles.map(f => ({
          name: f.name,
          reason: '当前模型不支持图片上传',
        }))
      )
    }
  }

  // 检查文档文件
  if (documentFiles.length > 0) {
    if (canUploadDocuments) {
      filesToProcess.push(...documentFiles)
    } else {
      unsupportedFiles.push(
        ...documentFiles.map(f => ({
          name: f.name,
          reason: '当前模型不支持文档上传',
        }))
      )
    }
  }

  // 处理不支持的文件提示
  if (unsupportedFiles.length > 0) {
    // 按类型分组
    const imageCount = unsupportedFiles.filter(f =>
      f.name.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/i)
    ).length
    const docCount = unsupportedFiles.length - imageCount

    // 生成提示消息
    let message = ''
    if (imageCount > 0 && docCount > 0) {
      message = `无法上传 ${imageCount} 张图片和 ${docCount} 个文档，当前模型不支持`
    } else if (imageCount > 0) {
      message = `无法上传 ${imageCount} 张图片，当前模型不支持图片上传`
    } else if (docCount > 0) {
      message = `无法上传 ${docCount} 个文档，当前模型不支持文档上传`
    }

    if (message) {
      ms.warning(message)
    }
  }

  // 处理可以上传的文件
  for (const file of filesToProcess) {
    if (file.type.startsWith('image/')) {
      await processImageFile(file)
    } else {
      await processDocumentFile(file)
    }
  }
}

// 添加一个计算属性来判断是否显示上传按钮
const showUploadButton = computed(() => {
  return isFilesModel.value || isImageModel.value || academicMode.value
})

// 计算上传按钮的提示文本
const uploadButtonTooltip = computed(() => {
  if (isFilesModel.value && isImageModel.value) {
    return '上传文件或图片'
  } else if (isImageModel.value) {
    return '上传图片'
  } else if (isFilesModel.value) {
    return '上传文件'
  }
  if (academicMode.value) return '上传学术文件'
  return '上传'
})

// 添加计算属性来控制按钮文字的显示
const shouldShowButtonText = computed(() => {
  return availableWidth.value > 300 // 当宽度大于300px时显示按钮文字
})

defineExpose({
  openFilePicker,
})
</script>

<template>
  <div>
    <!-- 移除全屏蒙版 -->

    <!-- before-footer slot -->
    <slot name="before-footer"></slot>

    <!-- Main footer content -->
    <div
      class="flex flex-col items-center justify-center w-full"
      :class="[isMobile ? 'px-3 pb-3' : 'px-2']"
    >
      <footer
        ref="footerRef"
        class="flex flex-col items-center justify-center w-full bg-transparent"
        :class="[isMobile ? 'max-w-full' : 'max-w-[1048px]']"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
      >
        <div
          class="chat-input-card flex w-full flex-col justify-center border transition-all duration-200"
          :class="[
            isMobile ? 'rounded-[16px] px-3 py-3' : 'rounded-[22px] px-4 py-2',
            {
              'ring-1 ring-[var(--accent)]': isDragging,
              'bg-[var(--surface-muted)]': isFileDraggingOverPage,
              'opacity-70 cursor-not-allowed': !isLogin,
            },
          ]"
          :style="{ minHeight: '1.5rem', position: 'relative' }"
        >
          <div
            v-if="showSuggestions && !isSelectedApp && searchResults.length !== 0"
            class="z-50 my-2 flex w-full flex-col items-center justify-center rounded-[24px] border border-[var(--paper-border)] bg-[var(--paper-bg)] px-1 py-1 resize-none"
            :style="{
              minHeight: '1.5rem',
              position: 'absolute',
              top: props.dataSourcesLength || isMobile ? 'auto' : '100%',
              bottom: props.dataSourcesLength || isMobile ? '100%' : 'auto',
              left: '50%',
              transform: 'translateX(-50%)',
            }"
          >
            <div
              v-if="searchResults.length !== 0"
              v-for="app in searchResults"
              :key="app.id"
              @click="selectApp(app)"
              class="flex w-full cursor-pointer items-center rounded-[18px] bg-[var(--surface-card)] px-2 py-3 duration-150 ease-in-out hover:bg-[var(--surface-muted)]"
            >
              <div
                class="w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden shadow-sm border border-gray-300 mr-3"
              >
                <img
                  v-if="app.coverImg"
                  :src="app.coverImg"
                  alt="Cover Image"
                  class="w-8 h-8 rounded-full flex justify-start"
                />
                <span
                  v-else
                  class="w-8 h-8 rounded-full flex items-center justify-center text-base font-medium text-[var(--text-sub)] bg-[var(--surface-muted)]"
                >
                  {{ app.name.charAt(0) }}
                </span>
              </div>

              <h3 class="text-md mr-3 flex-shrink-0 font-semibold text-[var(--text-main)]">
                {{ app.name }}
              </h3>
              <p class="flex-grow truncate text-base text-[var(--ink-faint)]">
                {{ app.des }}
              </p>
            </div>
          </div>

          <FilePreview
            :data-base64-list="dataBase64List"
            :file-list="fileList"
            :saved-files="savedFiles"
            :show-saved-files="false"
            :is-selected-app="isSelectedApp"
            :selected-app="selectedApp"
            @clear-data="clearData"
            @clear-select-app="clearSelectApp"
          />

          <div class="relative w-full rounded-[18px] px-2 py-1.5" :style="{ background: 'transparent' }">
            <!-- 扩展按钮 - 只在内容高度超过阈值时显示 -->
            <div v-if="shouldShowExpandButton" class="absolute right-1 top-2 z-10 group">
              <button
                @click="toggleExpanded"
                class="btn-pill btn-sm"
                :aria-label="isExpanded ? '收起输入框' : '展开输入框'"
              >
                <OffScreen v-if="isExpanded" size="15" />
                <FullScreen v-else size="15" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">
                {{ isExpanded ? '收起' : '展开' }}
              </div>
            </div>

            <!-- 拖拽提示覆盖层 - 替代文本区域 -->
            <div
              v-if="isFileDraggingOverPage"
              class="my-2 flex h-20 w-full items-center justify-center"
            >
              <div class="flex flex-col items-center justify-center">
                <AddPicture
                  size="28"
                  class="mb-2"
                  :class="
                    isDragging
                      ? 'text-[var(--text-main)]'
                      : 'text-[var(--ink-faint)]'
                  "
                />
                <p
                  class="text-center text-sm"
                  :class="
                    isDragging
                      ? 'text-[var(--text-main)] font-medium'
                      : 'text-[var(--ink-faint)]'
                  "
                >
                  {{ isDragging ? '松开鼠标开始导入研究资料' : '拖放文件到这里上传' }}
                </p>
              </div>
            </div>

            <!-- 文本区域 - 非拖拽状态显示 -->
            <textarea
              v-show="!isFileDraggingOverPage"
              id="workspace-composer"
              ref="inputRef"
              v-model="prompt"
              :placeholder="placeholderText"
              class="custom-scrollbar flex w-full flex-grow items-center justify-center bg-transparent px-0 py-1.5 text-[14px] text-[var(--text-main)] placeholder:text-[var(--ink-faint)] resize-none transition-all duration-300 ease-in-out"
              :disabled="!isLogin || isStreamIn"
              @input="autoResize"
              @keypress="handleEnter"
              @keyup="handleInput"
              @paste="handlePaste"
              :style="{
                maxHeight: isExpanded ? '7rem' : '3.6rem',
                minHeight: '1.5rem',
              }"
              aria-label="研究输入框"
              role="textbox"
            ></textarea>
          </div>

          <div
            ref="buttonContainerRef"
            class="mt-1 flex w-full flex-col gap-2 px-2 pb-0.5 lg:flex-row lg:items-center lg:justify-between"
          >
            <template v-if="isMobile">
              <div class="flex w-full items-center gap-2">
                <div class="flex min-w-0 flex-1 items-center gap-2">
                  <ModelSelector />

                  <span
                    v-if="selectedAcademicCompactLabel"
                    class="btn-pill btn-sm pointer-events-none min-w-0 max-w-[10rem] shrink truncate text-[12px]"
                    :title="selectedAcademicLabel"
                  >
                    {{ selectedAcademicCompactLabel }}
                  </span>

                  <div
                    v-if="showUploadButton && !isUploading"
                    class="group relative shrink-0"
                    @dragover.prevent="
                      e => {
                        e.stopPropagation()
                        isDragging = true
                      }
                    "
                    @dragleave.prevent="
                      e => {
                        e.stopPropagation()
                        isDragging = false
                      }
                    "
                    @drop.prevent="
                      e => {
                        e.stopPropagation()
                        isDragging = false
                        isFileDraggingOverPage = false
                        handleUnifiedFileDrop(e, 'button')
                      }
                    "
                  >
                    <button
                      type="button"
                      class="btn-pill btn-sm"
                      @click="triggerUpload"
                      :aria-label="uploadButtonTooltip"
                    >
                      <Plus size="15" />
                      <span v-if="!isMobile" class="ml-1">资料</span>
                    </button>
                  </div>

                  <LoadingFour
                    v-if="isUploading"
                    size="15"
                    class="animate-rotate text-gray-500 dark:text-gray-500"
                  />
                </div>

                <div class="flex shrink-0 items-center">
                  <button
                    v-if="!isStreamIn"
                    type="button"
                    class="inline-flex items-center justify-center rounded-full bg-[var(--btn-bg-primary)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--btn-text-primary)] transition hover:bg-[var(--btn-bg-primary-hover)]"
                    :class="{ 'cursor-not-allowed opacity-60 hover:bg-[var(--btn-bg-primary)]': buttonDisabled }"
                    :disabled="buttonDisabled"
                    @click="handleSubmit()"
                    aria-label="发送消息"
                  >
                    <SendOne size="15" />
                    <span class="ml-1.5 whitespace-nowrap">发送</span>
                  </button>

                  <button
                    v-else
                    type="button"
                    class="inline-flex items-center justify-center rounded-full bg-[var(--btn-bg-primary)] px-3.5 py-1.5 text-[13px] font-semibold text-[var(--btn-text-primary)] transition hover:bg-[var(--btn-bg-primary-hover)]"
                    @click="handleStop()"
                    aria-label="停止生成"
                  >
                    <Square size="15" />
                    <span class="ml-1.5 whitespace-nowrap">停止生成</span>
                  </button>
                </div>
              </div>

              <div
                v-if="shouldShowDeepThinking || shouldShowNetworkSearch"
                class="flex w-full flex-wrap items-center gap-2"
              >
                <div v-if="shouldShowDeepThinking" class="group relative">
                  <button
                    type="button"
                    class="btn-pill btn-sm"
                    :class="[usingDeepThinking ? 'btn-pill-active' : '']"
                    @click="usingDeepThinking = !usingDeepThinking"
                    :aria-pressed="usingDeepThinking"
                    aria-label="启用或禁用推理功能"
                  >
                    <TwoEllipses size="15" />
                    <span class="ml-1">推理</span>
                  </button>
                </div>

                <div v-if="shouldShowNetworkSearch" class="group relative">
                  <button
                    type="button"
                    class="btn-pill btn-sm"
                    :class="[usingNetwork ? 'btn-pill-active' : '']"
                    @click="usingNetwork = !usingNetwork"
                    :aria-pressed="usingNetwork"
                    aria-label="启用或禁用网络搜索"
                  >
                    <Sphere size="15" />
                    <span class="ml-1">搜索</span>
                  </button>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="flex flex-wrap items-center gap-2">
                <ModelSelector />

                <span
                  v-if="selectedAcademicCompactLabel"
                  class="btn-pill btn-sm pointer-events-none min-w-0 max-w-[13rem] shrink truncate text-[12px]"
                  :title="selectedAcademicLabel"
                >
                  {{ selectedAcademicCompactLabel }}
                </span>

                <div
                  v-if="showUploadButton && !isUploading"
                  class="group relative"
                  @dragover.prevent="
                    e => {
                      e.stopPropagation()
                      isDragging = true
                    }
                  "
                  @dragleave.prevent="
                    e => {
                      e.stopPropagation()
                      isDragging = false
                    }
                  "
                  @drop.prevent="
                    e => {
                      e.stopPropagation()
                      isDragging = false
                      isFileDraggingOverPage = false
                      handleUnifiedFileDrop(e, 'button')
                    }
                  "
                >
                  <button
                    type="button"
                    class="btn-pill btn-sm"
                    @click="triggerUpload"
                    :aria-label="uploadButtonTooltip"
                  >
                    <Plus size="15" />
                    <span v-if="shouldShowButtonText" class="ml-1">资料</span>
                  </button>
                  <div v-if="!isMobile" class="tooltip tooltip-top">{{ uploadButtonTooltip }}</div>
                </div>

                <LoadingFour
                  v-if="isUploading"
                  size="15"
                  class="p-1 mx-2 animate-rotate text-gray-500 dark:text-gray-500"
                />

                <div v-if="shouldShowDeepThinking" class="group relative">
                  <button
                    type="button"
                    class="btn-pill btn-sm"
                    :class="[usingDeepThinking ? 'btn-pill-active' : '']"
                    @click="usingDeepThinking = !usingDeepThinking"
                    :aria-pressed="usingDeepThinking"
                    aria-label="启用或禁用推理功能"
                  >
                    <TwoEllipses size="15" />
                    <span v-if="shouldShowButtonText" class="ml-1">推理</span>
                  </button>
                  <div v-if="!isMobile" class="tooltip tooltip-top">
                    AI 推理能力，帮助寻找更深层次的答案
                  </div>
                </div>

                <div v-if="shouldShowNetworkSearch" class="group relative">
                  <button
                    type="button"
                    class="btn-pill btn-sm"
                    :class="[usingNetwork ? 'btn-pill-active' : '']"
                    @click="usingNetwork = !usingNetwork"
                    :aria-pressed="usingNetwork"
                    aria-label="启用或禁用网络搜索"
                  >
                    <Sphere size="15" />
                    <span v-if="shouldShowButtonText" class="ml-1">搜索</span>
                  </button>
                  <div v-if="!isMobile" class="tooltip tooltip-top">
                    启用网络搜索，获取最新信息
                  </div>
                </div>
              </div>

              <div class="flex items-center justify-end gap-3 lg:justify-end">
                <div v-if="!isStreamIn" class="group relative">
                  <button
                    type="button"
                    class="inline-flex min-w-[132px] items-center justify-center rounded-full bg-[var(--btn-bg-primary)] px-4 py-1.5 text-sm font-semibold text-[var(--btn-text-primary)] transition hover:bg-[var(--btn-bg-primary-hover)]"
                    :class="{ 'cursor-not-allowed opacity-60 hover:bg-[var(--btn-bg-primary)]': buttonDisabled }"
                    :disabled="buttonDisabled"
                    @click="handleSubmit()"
                    aria-label="发送消息"
                  >
                    <SendOne size="15" />
                    <span class="ml-2">发送</span>
                  </button>
                  <div v-if="!isMobile" class="tooltip tooltip-top">发送</div>
                </div>

                <div v-if="isStreamIn" class="group relative">
                  <button
                    type="button"
                    class="inline-flex min-w-[132px] items-center justify-center rounded-full bg-[var(--btn-bg-primary)] px-4 py-1.5 text-sm font-semibold text-[var(--btn-text-primary)] transition hover:bg-[var(--btn-bg-primary-hover)]"
                    @click="handleStop()"
                    aria-label="停止生成"
                  >
                    <Square size="16" />
                    <span class="ml-2">停止生成</span>
                  </button>
                  <div v-if="!isMobile" class="tooltip tooltip-top">停止生成</div>
                </div>
              </div>
            </template>

            <input
              ref="fileInput"
              type="file"
              class="hidden"
              multiple
              @change="handleFileSelect"
            />
            <input
              ref="imageInput"
              type="file"
              accept="image/*"
              class="hidden"
              @change="handleImageSelect"
            />
          </div>
        </div>
      </footer>
    </div>

    <!-- after-footer slot -->
    <slot name="after-footer"></slot>
  </div>
</template>
