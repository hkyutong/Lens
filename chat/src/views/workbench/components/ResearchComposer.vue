<script setup lang="ts">
import { useBasicLayout } from '@/hooks/useBasicLayout'
import { t } from '@/locales'
import { useAuthStore, useChatStore, useGlobalStoreWithOut } from '@/store'
import {
  AddPicture,
  FullScreen,
  Down,
  LoadingFour,
  OffScreen,
  Plus,
  SendOne,
  Sphere,
  Square,
  TwoEllipses,
} from '@icon-park/vue-next'

// import { getDocument } from 'pdfjs-dist';
import { uploadFile } from '@/api/upload'
import { parseResearchFiles, type ResearchFile } from '@/domain/research/files'
import { getAcademicEntityDisplayLabel } from '@/utils/academicI18n'
import { message } from '@/utils/message'
import { computed, inject, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import AttachmentTray from './AttachmentTray.vue'
import ResearchModelSelector from './ResearchModelSelector.vue'

interface Emit {
  (ev: 'pause-request'): void
}

// 引入依赖
const onConversation = inject<any>('onConversation')
// 引用的 store
const useGlobalStore = useGlobalStoreWithOut()
const authStore = useAuthStore()
const chatStore = useChatStore()
const emit = defineEmits<Emit>()
const props = defineProps<{ compactLayout?: boolean }>()
const ms = message()
let academicDataLoading: Promise<void> | null = null
const fileInput = ref()
const isUploading = ref(false)
const inputRef = ref<HTMLTextAreaElement | null>(null)
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

const fileUploadConfig = ref({
  accept: '.pdf, .txt, .doc, .docx,.ppt,.pptx, .xlsx,.xls,.csv .md, .markdown',
  multiple: true,
})

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

// Lens 研究工作台始终使用学术模式；这里仅读取状态，不提供旧聊天模式开关。
const academicMode = computed(() => chatStore.academicMode)
const { isMobile } = useBasicLayout()
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
  return Number(configObj?.value?.modelInfo?.keyType)
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
  const textarea = inputRef.value
  if (!textarea) return

  const hasContent = Boolean(prompt.value?.trim())
  if (isExpanded.value && !hasContent) {
    isExpanded.value = false
    nextTick(autoResize)
    return
  }

  textarea.style.height = 'auto'
  const style = window.getComputedStyle(textarea)
  const minHeight = parseFloat(style.minHeight)
  // 空输入不根据 placeholder 的换行显示展开；有内容时按实际可见高度判断。
  const contentHeight = textarea.scrollHeight
  textarea.style.height = `${Math.max(contentHeight, minHeight)}px`
  const hasOverflow = hasContent && textarea.scrollHeight > textarea.clientHeight + 1
  textarea.style.overflowY = hasOverflow ? 'auto' : 'hidden'
  shouldShowExpandButton.value = isExpanded.value || hasOverflow
}

const toggleExpanded = () => {
  isExpanded.value = !isExpanded.value
  nextTick(autoResize)
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

const activeModelAvatar = computed(() => {
  return String(configObj?.value.modelInfo?.modelAvatar || '')
})

const selectedAcademicLabel = computed(() => {
  return getAcademicEntityDisplayLabel(
    chatStore.currentAcademicPlugin || chatStore.currentAcademicCore
  )
})

const openResearchControls = inject('openResearchControls', () => {})

const createNewChatGroup = inject('createNewChatGroup', () =>
  Promise.resolve()
) as () => Promise<void>

// 修改计算属性，直接从对话组获取fileUrl
const fileUrl = computed(() => activeGroupInfo.value?.fileUrl || '')

// 修改计算属性，解析fileUrl为对象数组
const savedFiles = computed(() => {
  return parseResearchFiles(fileUrl.value) as ResearchFile[]
})

const handleSubmit = async (index?: number) => {
  if (isStreamIn.value) {
    return
  }
  if (!isLogin.value) {
    authStore.setLoginDialog(true)
    ms.info(t('lens.footer.loginRequired'))
    return
  }

  if ((chatStore.groupList || []).length === 0) {
    await createNewChatGroup()
  }
  chatStore.setStreamIn(true)
  let action = ''

  const useModel = chatStore?.activeModel
  const useModelName = activeModelName.value
  const useModelType = activeModelKeyType.value

  let modelAvatar = activeModelAvatar.value
  // 旧会话可能仍带有 appId；继续透传以保持后端历史数据兼容，但不再提供应用市场 UI。
  const appId = activeGroupInfo?.value?.appId

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

      uploadFailed = true
      ms.error(t('lens.footer.uploadFailed'))
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
    ms.error(t('lens.footer.uploadFailedRetry'))
    return
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
    ms.warning(t('lens.footer.imageCountLimit', { max: MAX_IMAGE_FILES }))
    return
  }

  // 文件数量限制为10个（待发送附件）
  if (!isImageFile && currentFileCount >= MAX_DOCUMENT_FILES) {
    ms.warning(t('lens.footer.fileCountLimit', { max: MAX_DOCUMENT_FILES }))
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

        }
      }
    }
  }
}

// 处理文档类型文件
const processDocumentFile = async (file: File) => {
  if (file.type.startsWith('image/')) {

    return
  }

  if (isBlockedDocument(file)) {
    ms.warning(t('lens.footer.unsupportedFileType', { name: file.name }))
    return
  }

  // 检查文件大小限制（普通 5MB / 高级 30MB）
  const maxSize = maxDocumentSizeMb.value * 1024 * 1024
  if (file.size > maxSize) {
    ms.warning(t('lens.footer.fileTooLarge', { name: file.name, max: maxDocumentSizeMb.value }))
    return
  }

  const currentFileCount = fileList.value.filter(f => !f.type.startsWith('image/')).length

  // 检查文件总数是否超过限制
  if (currentFileCount >= MAX_DOCUMENT_FILES) {
    ms.warning(t('lens.footer.fileCountLimitPlain'))
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
  await handleSetFile(file)
}

// 处理图片类型文件
const processImageFile = async (file: File) => {
  if (!file.type.startsWith('image/')) {

    return
  }

  // 检查图片类型
  const acceptedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp']

  if (!acceptedTypes.includes(file.type)) {
    ms.warning(t('lens.footer.unsupportedImageType', { name: file.name }))
    return
  }

  // 检查图片大小限制（普通 5MB / 高级 10MB）
  const maxSize = maxImageSizeMb.value * 1024 * 1024
  if (file.size > maxSize) {
    ms.warning(t('lens.footer.imageTooLarge', { name: file.name, max: maxImageSizeMb.value }))
    return
  }

  // 检查当前已有图片数量
  const currentImageCount = fileList.value.filter(f => f.type.startsWith('image/')).length

  // 检查图片总数是否超过限制
  if (currentImageCount >= MAX_IMAGE_FILES) {
    ms.warning(t('lens.footer.imageCountLimitPlain'))
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
        t('lens.footer.selectedImagesOverflow', {
          count: imageFiles.length,
          remaining: remainingImageSlots,
        })
      )
    } else if (remainingImageSlots <= 0) {
      ms.warning(t('lens.footer.imageCountLimit', { max: MAX_IMAGE_FILES }))
    }

    // 处理允许范围内的图片
    const imagesToProcess = imageFiles.slice(0, Math.max(0, remainingImageSlots))
    for (const file of imagesToProcess) {
      await processImageFile(file)
    }
  } else if (imageFiles.length > 0 && !isImageModel.value) {
    ms.warning(t('lens.footer.modelNoImageUpload'))
  }

  // 处理文档文件
  if (documentFiles.length > 0 && (isFilesModel.value || academicMode.value)) {
    const currentFileCount = fileList.value.filter(f => !f.type.startsWith('image/')).length
    const remainingFileSlots = MAX_DOCUMENT_FILES - currentFileCount

    // 如果文件数量超过限制
    if (documentFiles.length > remainingFileSlots && remainingFileSlots > 0) {
      ms.warning(
        t('lens.footer.selectedFilesOverflow', {
          count: documentFiles.length,
          remaining: remainingFileSlots,
        })
      )
    } else if (remainingFileSlots <= 0) {
      ms.warning(t('lens.footer.fileCountLimit', { max: MAX_DOCUMENT_FILES }))
    }

    // 处理允许范围内的文件（仅挂载到输入框，发送时再上传）
    const filesToProcess = documentFiles.slice(0, Math.max(0, remainingFileSlots))
    for (const file of filesToProcess) {
      await processDocumentFile(file)
    }
  } else if (documentFiles.length > 0 && !isFilesModel.value && !academicMode.value) {
    ms.warning(t('lens.footer.modelNoFileUpload'))
  }

  // 清空input的值，允许再次选择相同文件
  input.value = ''
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

const handleStop = () => {
  emit('pause-request')
  chatStore.setStreamIn(false)
}

watch(clipboardText, async val => {
  await chatStore.setPrompt(val)
  // prompt.value = val;
  const textarea = inputRef.value
  if (!textarea) return
  textarea.focus()
  textarea.scrollTop = textarea.scrollHeight
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
        const files = parseResearchFiles(fileUrl.value)
        if (index >= 0 && index < files.length) {
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
    return t(props.compactLayout ? 'lens.footer.placeholderLoggedOutCompact' : 'lens.footer.placeholderLoggedOut')
  }

  if (isDragging.value) {
    return t('lens.footer.placeholderDragging')
  }

  if (academicMode.value && selectedAcademicLabel.value) {
    return t('lens.footer.placeholderWithAbility', { name: selectedAcademicLabel.value })
  }

  if (academicMode.value) {
    return t(props.compactLayout ? 'lens.footer.placeholderResearchQuestion' : 'lens.footer.placeholderAcademicDefault')
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

const handleUploadButtonDrop = (event: DragEvent) => {
  handleUnifiedFileDrop(event, 'button')
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

const preloadAcademicData = async () => {
  if (!isLogin.value || academicDataLoading) return academicDataLoading

  academicDataLoading = (async () => {
    await chatStore.queryAcademicCoreFunctions()
    await chatStore.queryAcademicPluginList()
  })().finally(() => {
    academicDataLoading = null
  })

  return academicDataLoading
}

watch(isLogin, (loggedIn, wasLoggedIn) => {
  if (loggedIn && !wasLoggedIn) void preloadAcademicData()
})

onMounted(async () => {
  chatStore.setPrompt('')

  // 设置焦点
  nextTick(() => {
    if (inputRef.value && !isMobile.value && dataSources.value.length > 0) {
      inputRef.value.focus()
    }
  })
  if (isLogin.value) {
    await preloadAcademicData()
  }

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
          autoResize()
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
      message = t('lens.footer.unsupportedBoth', {
        images: imageCount,
        documents: docCount,
      })
    } else if (imageCount > 0) {
      message = t('lens.footer.unsupportedImages', { count: imageCount })
    } else if (docCount > 0) {
      message = t('lens.footer.unsupportedDocuments', { count: docCount })
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
    return t('lens.footer.uploadFileOrImage')
  } else if (isImageModel.value) {
    return t('lens.footer.uploadImage')
  } else if (isFilesModel.value) {
    return t('lens.footer.uploadFile')
  }
  if (academicMode.value) return t('lens.footer.uploadAcademicFile')
  return t('lens.footer.upload')
})

// 窄操作区优先保留完整触控目标，按钮说明由现有提示和无障碍名称提供。
const shouldShowButtonText = computed(() => availableWidth.value > 400)

watch(placeholderText, () => nextTick(autoResize))

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
      class="research-composer__frame flex flex-col items-center justify-center w-full"
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
          class="research-command-panel flex w-full flex-col justify-center border transition-all duration-200"
          :class="[
            isMobile ? 'px-3 py-3' : 'px-4 py-3',
            {
              'ring-1 ring-[var(--accent)]': isDragging,
              'bg-[var(--surface-muted)]': isFileDraggingOverPage,
              'cursor-not-allowed': !isLogin,
            },
          ]"
          :style="{ minHeight: '1.5rem', position: 'relative' }"
        >
          <AttachmentTray
            class="research-composer__attachments custom-scrollbar"
            :data-base64-list="dataBase64List"
            :file-list="fileList"
            :saved-files="savedFiles"
            :show-saved-files="false"
            @clear-data="clearData"
          />

            <div
              class="research-composer__input-row relative w-full rounded-[2px] px-2 py-1.5"
              :style="{ background: 'transparent' }"
            >
            <!-- 仅在内容超出输入区域或已展开时显示。 -->
            <div v-if="shouldShowExpandButton" class="absolute right-1 top-2 z-10 group">
              <button
                @click="toggleExpanded"
                type="button"
                class="btn-pill btn-sm research-composer__expand"
                :aria-expanded="isExpanded"
                aria-controls="workspace-composer"
                :aria-label="
                  isExpanded ? t('lens.footer.collapseInput') : t('lens.footer.expandInput')
                "
              >
                <OffScreen v-if="isExpanded" size="15" />
                <FullScreen v-else size="15" />
              </button>
              <div v-if="!isMobile" class="tooltip tooltip-bottom">
                {{ isExpanded ? t('lens.footer.collapse') : t('lens.footer.expand') }}
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
                  :class="isDragging ? 'text-[var(--text-main)]' : 'text-[var(--ink-faint)]'"
                />
                <p
                  class="text-center text-sm"
                  :class="
                    isDragging ? 'text-[var(--text-main)] font-medium' : 'text-[var(--ink-faint)]'
                  "
                >
                  {{ isDragging ? t('lens.footer.dragActive') : t('lens.footer.dragInactive') }}
                </p>
              </div>
            </div>

            <!-- 文本区域 - 非拖拽状态显示 -->
            <textarea
              v-show="!isFileDraggingOverPage"
              id="workspace-composer"
              rows="1"
              ref="inputRef"
              v-model="prompt"
              :placeholder="placeholderText"
              class="custom-scrollbar flex w-full flex-grow items-center justify-center bg-transparent px-0 py-2 text-[15px] leading-6 text-[var(--text-main)] placeholder:text-[var(--text-sub)] resize-none"
              :disabled="!isLogin || isStreamIn"
              @keypress="handleEnter"
              @paste="handlePaste"
              :style="{
                maxHeight: isExpanded ? 'min(13rem, 30dvh)' : '5.5rem',
                minHeight: isMobile ? '4rem' : '2.5rem',
              }"
              :aria-label="t('lens.footer.researchInputLabel')"
              role="textbox"
            ></textarea>
          </div>

          <div
            ref="buttonContainerRef"
            class="research-composer__controls mt-1 flex w-full flex-col gap-2 px-2 pb-0.5"
          >
            <template v-if="isMobile">
              <div class="research-mobile-controls-row">
                <div class="research-mobile-options">
                  <div
                    v-if="showUploadButton && !isUploading"
                    class="group relative shrink-0"
                    @dragover="handleDragOver"
                    @dragleave="handleDragLeave"
                    @drop="handleUploadButtonDrop"
                  >
                    <button
                      type="button"
                      class="btn-pill btn-sm"
                      @click="triggerUpload"
                      :aria-label="uploadButtonTooltip"
                    >
                      <Plus size="15" />
                      <span v-if="!isMobile" class="ml-1">{{ t('lens.footer.uploadLabel') }}</span>
                    </button>
                  </div>

                  <LoadingFour
                    v-if="isUploading"
                    size="15"
                    class="animate-rotate text-gray-500 dark:text-gray-500"
                  />
                  <button type="button" class="btn-pill btn-sm research-composer__capability"
                    :aria-label="t('lens.academicPanel.settingsTitle')" :title="selectedAcademicLabel || t('lens.academicPanel.defaultCapability')"
                    @click="openResearchControls">
                    <span>{{ selectedAcademicLabel || t('lens.academicPanel.settingsTitle') }}</span>
                    <Down size="14" aria-hidden="true" />
                  </button>
                  <button v-if="shouldShowDeepThinking" type="button" class="btn-pill btn-sm research-mobile-toggle"
                    :class="{ 'btn-pill-active': usingDeepThinking }" :aria-pressed="usingDeepThinking"
                    :aria-label="t('lens.footer.reasoningToggleLabel')" @click="usingDeepThinking = !usingDeepThinking">
                    <TwoEllipses size="15" /><span>{{ t('lens.footer.reasoning') }}</span>
                  </button>
                  <button v-if="shouldShowNetworkSearch" type="button" class="btn-pill btn-sm research-mobile-toggle"
                    :class="{ 'btn-pill-active': usingNetwork }" :aria-pressed="usingNetwork"
                    :aria-label="t('lens.footer.searchToggleLabel')" @click="usingNetwork = !usingNetwork">
                    <Sphere size="15" /><span>{{ t('lens.footer.search') }}</span>
                  </button>
                </div>

                <div class="research-mobile-submit">
                  <button
                    v-if="!isStreamIn"
                    type="button"
                    class="research-send-button inline-flex items-center justify-center text-[14px] font-semibold transition"
                    :class="{
                      'cursor-not-allowed opacity-60':
                        buttonDisabled,
                    }"
                    :disabled="buttonDisabled"
                    @click="handleSubmit()"
                    :aria-label="t('lens.footer.send')"
                  >
                    <SendOne size="16" />
                  </button>

                  <button
                    v-else
                    type="button"
                    class="research-send-button inline-flex items-center justify-center text-[14px] font-semibold transition"
                    @click="handleStop()"
                    :aria-label="t('lens.footer.stopGeneration')"
                  >
                    <Square size="16" />
                  </button>
                </div>
              </div>

            </template>

            <template v-else>
              <div class="research-composer__option-row flex flex-wrap items-center gap-2">
                <ResearchModelSelector v-if="!props.compactLayout" />

                <div
                  v-if="showUploadButton && !isUploading"
                  class="group relative"
                  @dragover="handleDragOver"
                  @dragleave="handleDragLeave"
                  @drop="handleUploadButtonDrop"
                >
                  <button
                    type="button"
                    class="btn-pill btn-sm research-composer__upload"
                    @click="triggerUpload"
                    :aria-label="uploadButtonTooltip"
                  >
                    <Plus size="15" />
                    <span v-if="shouldShowButtonText" class="ml-1">{{
                      t('lens.footer.uploadLabel')
                    }}</span>
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
                    :aria-label="t('lens.footer.reasoningToggleLabel')"
                  >
                    <TwoEllipses size="15" />
                    <span v-if="shouldShowButtonText" class="ml-1">{{
                      t('lens.footer.reasoning')
                    }}</span>
                  </button>
                  <div v-if="!isMobile" class="tooltip tooltip-top">
                    {{ t('lens.footer.reasoningTooltip') }}
                  </div>
                </div>

                <div v-if="shouldShowNetworkSearch" class="group relative">
                  <button
                    type="button"
                    class="btn-pill btn-sm"
                    :class="[usingNetwork ? 'btn-pill-active' : '']"
                    @click="usingNetwork = !usingNetwork"
                    :aria-pressed="usingNetwork"
                    :aria-label="t('lens.footer.searchToggleLabel')"
                  >
                    <Sphere size="15" />
                    <span v-if="shouldShowButtonText" class="ml-1">{{
                      t('lens.footer.search')
                    }}</span>
                  </button>
                  <div v-if="!isMobile" class="tooltip tooltip-top">
                    {{ t('lens.footer.networkSearchTooltip') }}
                  </div>
                </div>
              </div>

              <div class="research-composer__submit-row flex items-center justify-end gap-3">
                <div v-if="!isStreamIn" class="group relative">
                  <button
                    type="button"
                    class="research-send-button inline-flex items-center justify-center text-sm font-semibold transition"
                    :class="{
                      'cursor-not-allowed opacity-60':
                        buttonDisabled,
                    }"
                    :disabled="buttonDisabled"
                    @click="handleSubmit()"
                    :aria-label="t('lens.footer.send')"
                  >
                    <SendOne size="16" />
                  </button>
                  <div v-if="!isMobile" class="tooltip tooltip-top">
                    {{ t('lens.footer.sendTooltip') }}
                  </div>
                </div>

                <div v-if="isStreamIn" class="group relative">
                  <button
                    type="button"
                    class="research-send-button inline-flex items-center justify-center text-sm font-semibold transition"
                    @click="handleStop()"
                    :aria-label="t('lens.footer.stopGeneration')"
                  >
                    <Square size="16" />
                  </button>
                  <div v-if="!isMobile" class="tooltip tooltip-top">
                    {{ t('lens.footer.stopTooltip') }}
                  </div>
                </div>
              </div>
            </template>

            <input ref="fileInput" type="file" class="hidden" multiple @change="handleFileSelect" />
          </div>
        </div>
      </footer>
    </div>

    <!-- after-footer slot -->
    <slot name="after-footer"></slot>
  </div>
</template>

<style scoped>
.research-command-panel {
  border-color: color-mix(in srgb, var(--academic-accent) 16%, var(--paper-border));
  background: color-mix(in srgb, var(--surface-card) 94%, var(--academic-accent-soft));
  -webkit-backdrop-filter: blur(18px) saturate(145%);
  backdrop-filter: blur(18px) saturate(145%);
  border-radius: var(--radius-panel);
  box-shadow: none;
  transition: border-color 160ms ease;
}

.research-command-panel:focus-within {
  border-color: color-mix(in srgb, var(--academic-accent) 48%, var(--paper-border));
}
.research-command-panel:has(textarea:focus-visible) {
  box-shadow: 0 0 0 2px var(--focus-ring);
}
.research-composer__input-row textarea:focus-visible {
  outline: none;
}

.research-composer__input-row {
  min-height: 42px;
}

.research-composer__input-row:has(.research-composer__expand) textarea {
  padding-inline-end: 48px;
}

.research-composer__controls {
  align-items: stretch;
}

:deep(.btn-pill) {
  min-height: var(--control-height-compact) !important;
  height: var(--control-height-compact) !important;
  padding-inline: 12px;
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--ink-soft);
  font-size: 12px;
  font-weight: 500;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

:deep(.btn-pill:hover) {
  border-color: transparent;
  background: var(--accent-soft);
  color: var(--text-main);
}

:deep(.btn-pill-active) {
  background: var(--accent-soft);
  color: var(--accent);
}

.research-send-button {
  width: var(--control-height-compact);
  min-width: var(--control-height-compact) !important;
  height: var(--control-height-compact);
  min-height: var(--control-height-compact) !important;
  padding: 0 !important;
  border: 4px solid transparent;
  background: var(--btn-bg-primary);
  background-clip: padding-box;
  color: var(--btn-text-primary);
  border-radius: calc(var(--radius-button) + 4px) !important;
  box-shadow: none;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.research-composer__option-row,
.research-composer__submit-row {
  width: 100%;
}

.research-composer__option-row {
  min-width: 0;
}
@media (min-width: 1024px) {
  .research-composer__option-row :deep(.research-chip-button),
  .research-composer__option-row .research-composer__upload {
    padding-inline: 8px;
    background: transparent;
    transition: none;
  }
  .research-composer__option-row :deep(.research-chip-button:hover),
  .research-composer__option-row .research-composer__upload:hover {
    background: transparent;
  }
  .research-composer__option-row { gap: 20px; }
}

.research-composer__submit-row {
  min-height: var(--control-height);
}

@media (min-width: 769px) {
  .research-composer__controls {
    flex-direction: row;
    align-items: center;
    gap: 10px;
  }

  .research-composer__option-row {
    flex: 1 1 auto;
    min-width: 0;
  }

  .research-composer__submit-row {
    width: auto;
    flex: 0 0 auto;
    margin-left: auto;
  }
}

.research-send-button:not(:disabled):hover {
  background: var(--btn-bg-primary-hover);
}

.research-send-button:not(:disabled):active {
  background: var(--btn-bg-primary-active);
  box-shadow: none;
  transform: translateY(0);
}

.research-send-button:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}

.research-mobile-controls-row { display: flex; width: 100%; align-items: center; gap: 4px; }
.research-mobile-options { display: flex; min-width: 0; flex: 1; align-items: center; gap: 4px; }
.research-mobile-submit { display: flex; flex: none; }
.research-composer__capability { min-width: 44px; flex: 1; gap: 4px; }
.research-composer__capability span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.research-composer__capability svg { flex: none; }
.research-mobile-toggle { gap: 4px; flex: none; }

@media (max-width: 768px) {
  .research-command-panel {
    padding: 11px 11px 12px !important;
    border-radius: 18px !important;
  }

  .research-composer__input-row {
    min-height: 40px;
    padding-inline: 4px;
  }

  #workspace-composer {
    font-size: 16px;
  }

  .research-composer__controls {
    gap: 8px;
    padding-inline: 0;
  }

  :deep(.btn-pill) {
    min-height: var(--control-height) !important;
    height: var(--control-height) !important;
  }

  .research-send-button {
    width: var(--control-height);
    min-width: var(--control-height) !important;
    height: var(--control-height);
    min-height: var(--control-height) !important;
  }

  .research-mobile-options :deep(.btn-pill) { padding-inline: 8px; }
  .research-mobile-options > .group { flex: none; }
}

@media (max-width: 420px) {
  .research-mobile-toggle span { display: none; }
  .research-mobile-toggle { width: 44px; padding: 0; }
}

@media (max-width: 360px) {
  .research-mobile-controls-row {
    flex-wrap: nowrap;
  }

  .research-mobile-options {
    flex: 1 1 auto;
    min-width: 0;
  }

  .research-mobile-submit {
    width: auto;
  }

  .research-mobile-submit .research-send-button {
    width: var(--control-height);
  }
}

@media (prefers-reduced-transparency: reduce) {
  .research-command-panel {
    -webkit-backdrop-filter: none;
    backdrop-filter: none;
    background: var(--surface-card) !important;
  }
}
</style>
