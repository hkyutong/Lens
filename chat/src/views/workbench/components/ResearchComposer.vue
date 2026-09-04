<script setup lang="ts">
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

// import { getDocument } from 'pdfjs-dist';
import { uploadFile } from '@/api/upload'
import { parseResearchFiles, type ResearchFile } from '@/domain/research/files'
import { getAcademicEntityDisplayLabel } from '@/utils/academicI18n'
import { getAcademicWorkflowChainLabel } from '@/utils/academicWorkflow'
import { message } from '@/utils/message'
import { computed, inject, nextTick, onMounted, onUnmounted, Ref, ref, watch } from 'vue'
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
const ms = message()
let academicDataLoading: Promise<void> | null = null
const fileInput = ref()
const isUploading = ref(false)
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

const activeModelAvatar = computed(() => {
  return String(configObj?.value.modelInfo?.modelAvatar || '')
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
      .map(
        step => getAcademicEntityDisplayLabel(step as any) || step?.displayName || step?.name || ''
      )
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
    console.warn('非图片文件应使用文件上传功能:', file.name)
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
          class="research-command-panel flex w-full flex-col justify-center border transition-all duration-200"
          :class="[
            isMobile ? 'rounded-[20px] px-3 py-3' : 'rounded-[22px] px-4 py-3',
            {
              'ring-1 ring-[var(--accent)]': isDragging,
              'bg-[var(--surface-muted)]': isFileDraggingOverPage,
              'opacity-70 cursor-not-allowed': !isLogin,
            },
          ]"
          :style="{ minHeight: '1.5rem', position: 'relative' }"
        >
          <header class="research-command-panel__header">
            <strong>{{ t('lens.workspace.inputArea') }}</strong>
            <span v-if="!isMobile">{{ t('lens.workspace.inputShortcut') }}</span>
          </header>

          <AttachmentTray
            :data-base64-list="dataBase64List"
            :file-list="fileList"
            :saved-files="savedFiles"
            :show-saved-files="false"
            @clear-data="clearData"
          />

          <div
            class="relative w-full rounded-[18px] px-2 py-1.5"
            :style="{ background: 'transparent' }"
          >
            <!-- 扩展按钮 - 只在内容高度超过阈值时显示 -->
            <div v-if="shouldShowExpandButton" class="absolute right-1 top-2 z-10 group">
              <button
                @click="toggleExpanded"
                class="btn-pill btn-sm"
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
              ref="inputRef"
              v-model="prompt"
              :placeholder="placeholderText"
              class="custom-scrollbar flex w-full flex-grow items-center justify-center bg-transparent px-0 py-2 text-[15px] leading-6 text-[var(--text-main)] placeholder:text-[var(--ink-faint)] resize-none transition-all duration-300 ease-in-out"
              :disabled="!isLogin || isStreamIn"
              @input="autoResize"
              @keypress="handleEnter"
              @paste="handlePaste"
              :style="{
                maxHeight: isExpanded ? '7rem' : '3.6rem',
                minHeight: '1.5rem',
              }"
              :aria-label="t('lens.footer.researchInputLabel')"
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
                  <ResearchModelSelector />

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
                </div>

                <div class="flex shrink-0 items-center">
                  <button
                    v-if="!isStreamIn"
                    type="button"
                    class="research-send-button inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--btn-bg-primary)] px-4 text-[14px] font-semibold text-[var(--btn-text-primary)] transition hover:bg-[var(--btn-bg-primary-hover)]"
                    :class="{
                      'cursor-not-allowed opacity-60 hover:bg-[var(--btn-bg-primary)]':
                        buttonDisabled,
                    }"
                    :disabled="buttonDisabled"
                    @click="handleSubmit()"
                    :aria-label="t('lens.footer.send')"
                  >
                    <SendOne size="15" />
                    <span class="ml-1.5 whitespace-nowrap">{{ t('lens.footer.send') }}</span>
                  </button>

                  <button
                    v-else
                    type="button"
                    class="research-send-button inline-flex min-h-[44px] items-center justify-center rounded-full bg-[var(--btn-bg-primary)] px-4 text-[14px] font-semibold text-[var(--btn-text-primary)] transition hover:bg-[var(--btn-bg-primary-hover)]"
                    @click="handleStop()"
                    :aria-label="t('lens.footer.stopGeneration')"
                  >
                    <Square size="15" />
                    <span class="ml-1.5 whitespace-nowrap">{{
                      t('lens.footer.stopGeneration')
                    }}</span>
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
                    :aria-label="t('lens.footer.reasoningToggleLabel')"
                  >
                    <TwoEllipses size="15" />
                    <span class="ml-1">{{ t('lens.footer.reasoning') }}</span>
                  </button>
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
                    <span class="ml-1">{{ t('lens.footer.search') }}</span>
                  </button>
                </div>
              </div>
            </template>

            <template v-else>
              <div class="flex flex-wrap items-center gap-2">
                <ResearchModelSelector />

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

              <div class="flex items-center justify-end gap-3 lg:justify-end">
                <div v-if="!isStreamIn" class="group relative">
                  <button
                    type="button"
                    class="research-send-button inline-flex min-h-[44px] min-w-[132px] items-center justify-center rounded-full bg-[var(--btn-bg-primary)] px-5 text-sm font-semibold text-[var(--btn-text-primary)] transition hover:bg-[var(--btn-bg-primary-hover)]"
                    :class="{
                      'cursor-not-allowed opacity-60 hover:bg-[var(--btn-bg-primary)]':
                        buttonDisabled,
                    }"
                    :disabled="buttonDisabled"
                    @click="handleSubmit()"
                    :aria-label="t('lens.footer.send')"
                  >
                    <SendOne size="15" />
                    <span class="ml-2">{{ t('lens.footer.send') }}</span>
                  </button>
                  <div v-if="!isMobile" class="tooltip tooltip-top">
                    {{ t('lens.footer.sendTooltip') }}
                  </div>
                </div>

                <div v-if="isStreamIn" class="group relative">
                  <button
                    type="button"
                    class="research-send-button inline-flex min-h-[44px] min-w-[132px] items-center justify-center rounded-full bg-[var(--btn-bg-primary)] px-5 text-sm font-semibold text-[var(--btn-text-primary)] transition hover:bg-[var(--btn-bg-primary-hover)]"
                    @click="handleStop()"
                    :aria-label="t('lens.footer.stopGeneration')"
                  >
                    <Square size="16" />
                    <span class="ml-2">{{ t('lens.footer.stopGeneration') }}</span>
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
:deep(.btn-pill) {
  min-height: 40px;
  border-color: transparent;
  border-radius: 999px;
  background: var(--surface-muted);
  color: var(--ink-soft);
}

:deep(.btn-pill:hover) {
  background: var(--btn-bg-ghost-active);
  color: var(--text-main);
}

:deep(.btn-pill-active) {
  background: var(--accent-soft);
  color: var(--accent);
}

.research-send-button {
  box-shadow: 0 5px 14px var(--academic-blue-shadow);
}
</style>
