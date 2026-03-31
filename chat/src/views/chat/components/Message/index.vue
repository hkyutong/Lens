<script setup lang="ts">
import { message } from '@/utils/message'
import { computed, defineAsyncComponent, inject, nextTick, onMounted, onUnmounted, provide, ref, watch, type Ref } from 'vue'
import { copyText } from '@/utils/format'

const TextComponent = defineAsyncComponent(() => import('./Text/index.vue'))

interface Props {
  chatId?: number | string
  dateTime?: string
  content?: string
  model?: string
  modelName?: string
  modelType?: number
  status?: number
  role?: string
  loading?: boolean
  imageUrl?: string
  ttsUrl?: string
  useFileSearch?: boolean
  fileUrl?: string
  videoUrl?: string
  audioUrl?: string
  drawId?: string
  extend?: string
  customId?: string
  modelAvatar?: string
  action?: string
  taskData?: string
  pluginParam?: string
  progress?: string
  index: number
  promptReference?: string
  networkSearchResult?: string
  fileVectorResult?: string
  tool_calls?: string
  isLast?: boolean
  usingNetwork?: boolean
  usingDeepThinking?: boolean
  usingMcpTool?: boolean
  reasoningText?: string
  taskId?: string
  isWorkflowMessage?: boolean
  nodeType?: string
  stepName?: string
  workflowProgress?: number
}

// 添加计算属性判断是否是用户消息
const isUserMessage = computed(() => props.role === 'user')

interface Emit {
  (ev: 'regenerate'): void
  (ev: 'delete'): void
  (ev: 'height-change', height: number): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emit>()
const ms = message()

const textRef = ref<HTMLElement>()

const messageRef = ref<HTMLElement>()
const measuredHeight = ref(0)
const shouldRenderContent = ref(true)
const messageViewportRef = inject<Ref<HTMLDivElement | null>>('messageViewportRef', ref(null))
let resizeObserver: ResizeObserver | null = null
let intersectionObserver: IntersectionObserver | null = null

// 从父组件接收onOpenImagePreviewer
const onOpenImagePreviewer =
  inject<(imageUrls: string[], initialIndex: number, mjData?: any) => void>('onOpenImagePreviewer')

// 将onOpenImagePreviewer提供给子组件，确保依赖注入链不断
provide('onOpenImagePreviewer', onOpenImagePreviewer)

function handleDetele() {
  emit('delete')
}

function handleCopy() {
  copyText({ text: props.content ?? '' })
  props.content && ms.success('复制成功！')
}

function handleRegenerate() {
  messageRef.value?.scrollIntoView()
  emit('regenerate')
}

const shouldKeepMounted = computed(() => Boolean(props.loading || props.isLast))
const placeholderHeight = computed(() => {
  if (measuredHeight.value > 0) return measuredHeight.value
  return isUserMessage.value ? 120 : 280
})
const messageStyle = computed(() => {
  if (shouldRenderContent.value) return undefined
  return {
    minHeight: `${placeholderHeight.value}px`,
    height: `${placeholderHeight.value}px`,
  }
})

const updateMeasuredHeight = () => {
  if (!messageRef.value) return
  const nextHeight = Math.ceil(messageRef.value.getBoundingClientRect().height)
  if (nextHeight > 0 && nextHeight !== measuredHeight.value) {
    measuredHeight.value = nextHeight
    emit('height-change', nextHeight)
  }
}

const disconnectResizeObserver = () => {
  if (!resizeObserver) return
  resizeObserver.disconnect()
  resizeObserver = null
}

const startResizeObserver = () => {
  disconnectResizeObserver()
  if (!messageRef.value || !shouldRenderContent.value || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => updateMeasuredHeight())
  resizeObserver.observe(messageRef.value)
}

const mountContent = async () => {
  if (shouldRenderContent.value) {
    startResizeObserver()
    return
  }
  shouldRenderContent.value = true
  await nextTick()
  updateMeasuredHeight()
  startResizeObserver()
}

const unmountContent = () => {
  if (shouldKeepMounted.value || !shouldRenderContent.value) return
  updateMeasuredHeight()
  shouldRenderContent.value = false
  disconnectResizeObserver()
}

const disconnectIntersectionObserver = () => {
  if (!intersectionObserver) return
  intersectionObserver.disconnect()
  intersectionObserver = null
}

const syncVisibilityObserver = () => {
  disconnectIntersectionObserver()
  if (
    !messageRef.value ||
    !messageViewportRef.value ||
    typeof IntersectionObserver === 'undefined'
  ) {
    shouldRenderContent.value = true
    startResizeObserver()
    return
  }

  intersectionObserver = new IntersectionObserver(
    entries => {
      const entry = entries[0]
      if (!entry) return
      if (shouldKeepMounted.value || entry.isIntersecting) {
        void mountContent()
        return
      }
      unmountContent()
    },
    {
      root: messageViewportRef.value,
      rootMargin: '480px 0px 480px 0px',
      threshold: 0.01,
    }
  )
  intersectionObserver.observe(messageRef.value)
}

watch(shouldKeepMounted, active => {
  if (active) {
    void mountContent()
    return
  }
  syncVisibilityObserver()
})

watch(
  () => messageViewportRef.value,
  () => {
    syncVisibilityObserver()
  }
)

watch(
  () => props.content,
  () => {
    if (!shouldRenderContent.value) return
    nextTick(() => updateMeasuredHeight())
  }
)

onMounted(() => {
  updateMeasuredHeight()
  syncVisibilityObserver()
  nextTick(() => updateMeasuredHeight())
})

onUnmounted(() => {
  disconnectIntersectionObserver()
  disconnectResizeObserver()
})

</script>

<template>
  <div
    ref="messageRef"
    class="workspace-entry"
    :class="{ 'workspace-entry--user': isUserMessage, 'workspace-entry--placeholder': !shouldRenderContent }"
    :style="messageStyle"
  >
    <TextComponent
      v-if="shouldRenderContent"
      ref="textRef"
      :index="index"
      :modelName="modelName"
      :chatId="chatId"
      :isUserMessage="isUserMessage"
      :content="content"
      :modelType="modelType"
      :imageUrl="imageUrl"
      :ttsUrl="ttsUrl"
      :fileUrl="fileUrl"
      :useFileSearch="useFileSearch"
      :model="model"
      :loading="loading"
      :promptReference="promptReference"
      :networkSearchResult="networkSearchResult"
      :fileVectorResult="fileVectorResult"
      :tool_calls="tool_calls"
      :isLast="isLast"
      :usingNetwork="usingNetwork"
      :usingDeepThinking="usingDeepThinking"
      :usingMcpTool="usingMcpTool"
      :reasoningText="reasoningText"
      :isWorkflowMessage="isWorkflowMessage"
      @regenerate="handleRegenerate"
      @copy="handleCopy"
      @delete="handleDetele"
    />
    <div v-else class="workspace-entry__placeholder" aria-hidden="true"></div>
  </div>
</template>

<style scoped>
.workspace-entry {
  width: 100%;
  min-width: 0;
  margin: 0;
}

.workspace-entry--user {
  position: relative;
}

.workspace-entry--placeholder {
  overflow: hidden;
}

.workspace-entry__placeholder {
  width: 100%;
  height: 100%;
}
</style>
