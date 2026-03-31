<script setup lang="ts">
import { fetchUpdateGroupAPI } from '@/api/group'
import { fetchQueryModelsListAPI } from '@/api/models'
import { DropdownMenu } from '@/components/common/DropdownMenu'
import { useAuthStore, useChatStore } from '@/store'
import { message } from '@/utils/message'
import { sanitizeUserFacingErrorMessage } from '@/utils/request/sanitizeErrorMessage'
import { CheckOne, Down } from '@icon-park/vue-next'
import { computed, onMounted, ref } from 'vue'

interface ModelOption {
  label: string
  value: string
  modelDescription?: string
  modelAvatar?: string
  keyType?: number
  deductType?: number
  deduct?: number
  isFileUpload?: number
  isImageUpload?: number
  isNetworkSearch?: number
  deepThinkingType?: number
  isMcpTool?: number
  maxRounds?: number
}

interface Model {
  isFileUpload: any
  isImageUpload: any
  modelName: string
  model: string
  deductType: number
  keyType: number
  deduct: number
  modelAvatar: string
  modelDescription: string
  maxRounds?: number
  isNetworkSearch: any
  isMcpTool: any
  deepThinkingType: any
}

const authStore = useAuthStore()
const chatStore = useChatStore()
const ms = message()

const isMenuOpen = ref(false)
const modelOptions = ref<ModelOption[]>([])

const activeGroupInfo = computed(() => chatStore.getChatByGroupInfo())
const activeGroupId = computed(() => Number(chatStore.active || 0))
const configObj = computed(() => {
  const configString = activeGroupInfo.value?.config
  if (!configString) return {}

  try {
    return JSON.parse(configString)
  } catch (error) {
    return {}
  }
})

const currentModelValue = computed(
  () => String(configObj.value?.modelInfo?.model || chatStore.preferredModel?.value || '')
)

const currentModelLabel = computed(() => {
  return String(
    configObj.value?.modelInfo?.modelName ||
      chatStore.preferredModel?.label ||
      modelOptions.value[0]?.label ||
      '默认模型'
  )
})

const notSwitchModel = computed(() => {
  const modelInfo = (configObj.value as any)?.modelInfo
  return (
    !!activeGroupInfo.value?.appId &&
    (modelInfo?.isFixedModel === 1 || modelInfo?.isGPTs === 1 || modelInfo?.isFlowith === 1)
  )
})

async function queryModelsList() {
  try {
    const res: any = await fetchQueryModelsListAPI()
    if (!res.success) return

    const { modelMaps } = res.data
    const flatModelArray = Object.values(modelMaps).flat() as Model[]
    const modelsToUse = Array.from(
      new Map(flatModelArray.map(model => [model.model, model])).values()
    )

    modelOptions.value = modelsToUse.map(model => ({
      label: model.modelName,
      value: model.model,
      deductType: model.deductType,
      keyType: model.keyType,
      deduct: model.deduct,
      isFileUpload: model.isFileUpload,
      isImageUpload: model.isImageUpload,
      isNetworkSearch: model.isNetworkSearch,
      deepThinkingType: model.deepThinkingType,
      isMcpTool: model.isMcpTool,
      modelAvatar: model.modelAvatar,
      modelDescription: model.modelDescription,
      maxRounds: model.maxRounds,
    }))

    if (chatStore.preferredModel?.value) {
      const exists = modelOptions.value.some(option => option.value === chatStore.preferredModel.value)
      if (!exists) chatStore.setPreferredModel(null)
    }
  } catch (error) {}
}

async function switchModel(option: ModelOption) {
  if (!authStore.isLogin) {
    authStore.setLoginDialog(true)
    ms.info('请先登录后再切换模型')
    return
  }

  chatStore.setUsingDeepThinking(false)
  chatStore.setUsingNetwork(false)
  chatStore.setUsingPlugin(null)
  chatStore.setPreferredModel(option)

  const modelInfo = chatStore.activeConfig?.modelInfo || (configObj.value as any)?.modelInfo || {}
  const fileInfo = chatStore.activeConfig?.fileInfo || (configObj.value as any)?.fileInfo || {}
  const currentGroup = chatStore.groupList.find(item => Number(item.uuid) === activeGroupId.value)

  if (!activeGroupId.value || !currentGroup) {
    return
  }

  const config = {
    modelInfo: {
      keyType: option.keyType,
      modelName: activeGroupInfo.value?.appId ? modelInfo.modelName || option.label : option.label,
      model: option.value,
      deductType: option.deductType,
      deduct: option.deduct,
      isFileUpload: option.isFileUpload,
      isImageUpload: option.isImageUpload,
      isNetworkSearch: option.isNetworkSearch,
      deepThinkingType: option.deepThinkingType,
      isMcpTool: option.isMcpTool,
      modelAvatar: option.modelAvatar || '',
      isGPTs: modelInfo?.isGPTs,
      isFlowith: modelInfo?.isFlowith,
      isFixedModel: modelInfo?.isFixedModel,
    },
    fileInfo: fileInfo || {},
  }

  const params = {
    groupId: activeGroupId.value,
    config: JSON.stringify(config),
  }
  const previousConfig = currentGroup.config || ''

  currentGroup.config = params.config
  chatStore.recordState()

  try {
    await fetchUpdateGroupAPI(params)
    await chatStore.queryMyGroup()
  } catch (error: any) {
    currentGroup.config = previousConfig
    chatStore.recordState()
    ms.error(sanitizeUserFacingErrorMessage(error?.message || '', 0, '模型切换失败，请稍后重试'))
  }
}

onMounted(() => {
  queryModelsList()
})
</script>

<template>
  <DropdownMenu
    v-if="!notSwitchModel"
    v-model="isMenuOpen"
    position="top-left"
    max-height="40vh"
    min-width="16rem"
  >
    <template #trigger>
      <button type="button" class="btn-pill btn-sm research-chip-button" aria-label="切换模型">
        <span class="research-chip-button__label" :title="currentModelLabel">
          {{ currentModelLabel }}
        </span>
        <Down
          size="14"
          class="research-chip-button__arrow"
          :class="{ 'research-chip-button__arrow--open': isMenuOpen }"
          aria-hidden="true"
        />
      </button>
    </template>
    <template #menu="{ close }">
      <div class="min-w-[16rem] max-w-[22rem]">
        <div v-if="modelOptions.length === 0" class="px-4 pb-4 text-sm text-gray-500">
          未找到可切换模型
        </div>
        <div
          v-for="(option, index) in modelOptions"
          :key="index"
          class="menu-item menu-item-md"
          :class="{ 'menu-item-active': currentModelValue === option.value }"
          @click="
            () => {
              switchModel(option)
              close()
            }
          "
          role="menuitem"
          tabindex="0"
          :aria-label="`切换到${option.label}`"
        >
          <div class="avatar avatar-md">
            <img
              v-if="option.modelAvatar"
              :src="option.modelAvatar"
              :alt="`${option.label}模型图标`"
              class="w-full h-full object-cover"
            />
            <span v-else>
              {{ option.label.charAt(0) }}
            </span>
          </div>
          <div class="menu-item-content">
            <div class="menu-item-title">
              {{ option.label }}
            </div>
            <div v-if="option.modelDescription" class="menu-item-description">
              {{ option.modelDescription }}
            </div>
          </div>
          <div class="flex-shrink-0" v-if="currentModelValue === option.value">
            <CheckOne theme="filled" size="16" class="text-gray-500" aria-hidden="true" />
          </div>
        </div>
      </div>
    </template>
  </DropdownMenu>

  <button v-else type="button" class="btn-pill btn-sm research-chip-button" disabled>
    <span class="research-chip-button__label" :title="currentModelLabel">
      {{ currentModelLabel }}
    </span>
  </button>
</template>

<style scoped>
.research-chip-button {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  cursor: pointer;
  max-width: 13rem;
  transition:
    border-color 0.16s ease,
    background-color 0.16s ease;
}

.research-chip-button:hover {
  border-color: #cdcdcd;
  background: var(--surface-panel);
}

.research-chip-button:disabled {
  cursor: default;
  opacity: 1;
}

.research-chip-button__label {
  display: inline-block;
  max-width: 9.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.research-chip-button__arrow {
  flex-shrink: 0;
  transition: transform 0.16s ease;
}

.research-chip-button__arrow--open {
  transform: rotate(180deg);
}

@media (max-width: 768px) {
  .research-chip-button {
    max-width: 8.75rem;
    min-width: 0;
  }

  .research-chip-button__label {
    max-width: 6.3rem;
  }
}
</style>
