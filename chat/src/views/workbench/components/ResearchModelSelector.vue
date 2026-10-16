<script setup lang="ts">import { resolveAcademicPlanTier } from '@/utils/academicPlanAccess';
import { canUseAcademicModel } from '../../../../../service/src/common/utils/academicModelAccess';
import { isPackageModelAllowed } from '../../../../../service/src/common/utils/packageEntitlements';

import { fetchUpdateGroupAPI } from '@/api/group'
import { fetchQueryModelsListAPI } from '@/api/models'
import { DropdownMenu } from '@/components/common/DropdownMenu'
import { t } from '@/locales'
import { useAuthStore, useChatStore } from '@/store'
import { message } from '@/utils/message'
import { sanitizeUserFacingErrorMessage } from '@/utils/request/sanitizeErrorMessage'
import { CheckOne, Down } from '@icon-park/vue-next'
import { computed, onMounted, ref , watch } from 'vue'

interface ModelOption {
  model?: string;
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
const props = withDefaults(defineProps<{ position?: 'top-left' | 'bottom-left'; navigation?: boolean }>(), { position: 'top-left' })
const modelOptions = ref<ModelOption[]>([])
const modelsLoaded = ref(false);
const academicTier = ref(resolveAcademicPlanTier(authStore.userBalance));

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

const baseCurrentModelLabel = computed(() => {
  return String(
    configObj.value?.modelInfo?.modelName ||
      chatStore.preferredModel?.label ||
      modelOptions.value[0]?.label ||
      t('lens.modelSelector.defaultModel')
  )
})
const currentModelOption = computed(() => modelOptions.value.find(option => option.value === currentModelValue.value));
const currentModelRestricted = computed(() => modelsLoaded.value && Boolean(currentModelValue.value) && !canSelectModel(currentModelOption.value));
const currentModelLabel = computed(() => {
  if (!currentModelRestricted.value) return baseCurrentModelLabel.value;
  const plan = getRequiredModelPlan(currentModelOption.value);
  return plan ? t('lens.modelSelector.restrictedModel', { model: baseCurrentModelLabel.value, plan }) : t('lens.modelSelector.unavailableModel', { model: baseCurrentModelLabel.value });
});

const getModelDisplayLabel = (model: Model) =>
  ['deepseek-chat', 'deepseek-v3.2'].includes(model.model.toLowerCase())
    ? 'DeepSeek V3.2'
    : model.modelName

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
      label: getModelDisplayLabel(model),
      value: model.model,
      model: model.model,
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

    refreshAcademicModelAccess();
  } catch (error) {} finally {
    modelsLoaded.value = true;
  }
}

async function switchModel(option: ModelOption) {
  if (!authStore.isLogin) {
    authStore.setLoginDialog(true)
    ms.info(t('lens.footer.loginRequired'))
    return
  }
  academicTier.value = resolveAcademicPlanTier(authStore.userBalance);
  if (!canSelectModel(option)) {
    ms.info(getModelPermissionHint(option));
    return;
  }

  chatStore.setUsingDeepThinking(false)
  chatStore.setUsingNetwork(false)
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
    ms.error(
      sanitizeUserFacingErrorMessage(error?.message || '', 0, t('lens.modelSelector.switchFailed'))
    )
  }
}

onMounted(() => {
  queryModelsList()
})

function canSelectModel(option: ModelOption | null | undefined) {
  return Boolean(option) && canUseAcademicModel(academicTier.value, option?.deductType) && isPackageModelAllowed(authStore.userBalance?.packageEntitlements, option?.model);
}
function getRequiredModelPlan(option: ModelOption | null | undefined): string {
  if (canUseAcademicModel('plus', option?.deductType)) return 'Plus';
  if (canUseAcademicModel('pro', option?.deductType)) return 'Pro';
  if (canUseAcademicModel('max', option?.deductType)) return 'Max';
  return '';
}
function getModelPermissionHint(option: ModelOption | null | undefined) {
  if (!isPackageModelAllowed(authStore.userBalance?.packageEntitlements, option?.model)) {
    return t('lens.modelSelector.notIncluded');
  }
  const plan = getRequiredModelPlan(option);
  return plan ? t('lens.modelSelector.upgradeRequired', { plan }) : t('lens.modelSelector.unavailable');
}
function reconcilePreferredAcademicModel() {
  const preferred = modelOptions.value.find(option => option.value === chatStore.preferredModel?.value);
  if (preferred && canSelectModel(preferred)) return;
  const allowed = modelOptions.value.find(option => canSelectModel(option));
  if (allowed) chatStore.setPreferredModel(allowed);
  else if (chatStore.preferredModel) chatStore.setPreferredModel(null);
}
function refreshAcademicModelAccess() {
  academicTier.value = resolveAcademicPlanTier(authStore.userBalance);
  reconcilePreferredAcademicModel();
}
watch([() => authStore.userBalance, modelOptions], refreshAcademicModelAccess, { deep: true });
watch(isMenuOpen, open => {
  if (open) refreshAcademicModelAccess();
});
</script>

<template>
  <DropdownMenu
    v-if="!notSwitchModel"
    v-model="isMenuOpen"
    :position="props.position"
    max-height="40vh"
    min-width="0"
  >
    <template #trigger>
      <button
        type="button"
        class="btn-pill btn-sm research-chip-button"
        :aria-label="t('lens.modelSelector.switchModel')"
        :aria-expanded="isMenuOpen" aria-haspopup="menu"
      >
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
      <div class="research-model-menu" :class="{ 'research-model-menu--navigation': props.navigation }">
        <div v-if="modelOptions.length === 0" class="px-4 pb-4 text-sm text-gray-500">
          {{ t('lens.modelSelector.noModels') }}
        </div>
        <button
          type="button"
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
          :aria-label="t('lens.modelSelector.switchTo', { name: option.label })"
         :disabled="!canSelectModel(option)">
          <div class="avatar avatar-md">
            <img
              v-if="option.modelAvatar"
              :src="option.modelAvatar"
              :alt="t('lens.modelSelector.modelIcon', { name: option.label })"
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

            <span v-if="!canSelectModel(option)" class="block text-xs text-[var(--text-secondary)]">{{ getModelPermissionHint(option) }}</span>
          </div>
          <div class="flex-shrink-0" v-if="currentModelValue === option.value">
            <CheckOne theme="filled" size="16" class="text-gray-500" aria-hidden="true" />
          </div>


</button>
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
.research-model-menu { width: max-content;
  padding: 6px;
  min-width: min(12rem, calc(100vw - 48px));
  max-width: min(15rem, calc(100vw - 48px)); }
.research-model-menu--navigation { min-width: min(12rem, calc(100vw - 112px));
  max-width: min(15rem, calc(100vw - 112px)); }
.research-model-menu .menu-item {
  width: 100%;
  gap: 8px;
  padding-inline: 10px;
  border-radius: var(--radius-small);
}

.research-model-menu .menu-item-content {
  min-width: 0;
  text-align: left;
}

.research-model-menu .menu-item-title {
  width: 100%;
  text-align: left;
}

.research-model-menu .menu-item-description {
  text-align: left;
  max-width: 10rem;
  white-space: normal;
  overflow-wrap: anywhere;
}

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
  border-color: transparent;
  background: var(--academic-surface);
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
    padding-inline: 8px;
  }

  .research-chip-button__label {
    max-width: 6.3rem;
  }
}
</style>
