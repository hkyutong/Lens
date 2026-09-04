import type { GenericAbortSignal } from 'axios'

export const ACADEMIC_ENDPOINTS = {
  chat: '/academic/chat-process',
  workflow: '/academic/workflow-process',
  coreFunctions: '/academic/core-function-list',
  plugins: '/academic/plugin-list',
} as const

export interface AcademicRequestOptions {
  groupId?: number
  usingNetwork?: boolean
  usingMcpTool?: boolean
}

export interface AcademicChatRequest {
  function: 'chat' | 'basic' | 'plugin'
  core_function?: string
  plugin_name?: string
  plugin_kwargs?: Record<string, unknown>
  main_input: string
  chatId?: number
  overwriteReply?: boolean
  replyChatId?: number
  model?: string
  modelName?: string
  modelType?: number
  modelAvatar?: string
  appId?: number
  fileUrl?: string
  options?: AcademicRequestOptions
}

export interface AcademicWorkflowRequest {
  main_input: string
  chatId?: number
  overwriteReply?: boolean
  replyChatId?: number
  model?: string
  modelName?: string
  modelType?: number
  modelAvatar?: string
  appId?: number
  fileUrl?: string
  options?: AcademicRequestOptions
  workflow: {
    steps: Array<{
      kind: 'core' | 'plugin'
      name: string
      displayName?: string
      args?: string
    }>
  }
}

export interface AcademicProcessParams<TRequest> {
  data: TRequest
  signal?: GenericAbortSignal
  onDownloadProgress?: (progressEvent: import('axios').AxiosProgressEvent) => void
}
