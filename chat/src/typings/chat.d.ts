declare namespace Chat {
  interface Chat {
    chatId?: number | string
    content: string
    canvasText?: string
    modelType?: number
    status?: number
    fileInfo?: string
    model?: string
    modelName?: string
    role?: string
    ttsUrl?: string
    imageUrl?: string
    fileUrl?: string
    videoUrl?: string
    audioUrl?: string
    action?: string
    drawId?: string
    customId?: string
    usage?: object
    error?: boolean
    loading?: boolean
    usingPlugin?: string
    modelAvatar?: string
    taskId?: string
    taskData?: any
    conversationOptions?: ConversationRequest | null
    pluginParam?: string
    promptReference?: string
    networkSearchResult?: string
    fileVectorResult?: string
    usingNetwork?: boolean
    usingDeepThinking?: boolean
    usingMcpTool?: boolean
    mcpToolUse?: string
    reasoningText?: string
    reasoning_content?: string
    tool_calls?: string
    progress?: string
    useFileSearch?: boolean
    isWorkflowMessage?: boolean
    nodeType?: string
    stepName?: string
    workflowProgress?: number
  }

  interface History {
    title: string
    isEdit: boolean
    uuid: number
    isSticky: boolean
    config: string
  }

  interface ChatState {
    active: number
    usingContext: boolean
    usingNetwork: boolean
    usingDeepThinking: boolean
    usingMcpTool: boolean
    reasoningText: string
    history?: History[]
    baseConfig: any
    chat?: { uuid: number; data: Chat[] }[]
    groupList: {
      uuid: number
      title: string
      appId: number
      isEdit: boolean
      isSticky: boolean
      config: string
      createdAt: Date
      updatedAt: Date
      appLogo?: string
      fileUrl?: string
    }[]
    chatList: Chat[]
    groupKeyWord?: string
    activeConfig?: any
    activeModel?: string
    activeModelName?: string
    activeGroupFileUrl?: string
    activeModelType?: number
    activeModelAvatar?: string
    activeModelFileUpload?: number
    activeModelDeductType?: number
    activeModelPrice?: number
    activeGroupAppId?: number
    isStreamIn?: boolean
    pluginList: []
    academicMode: boolean
    mobileAcademicPanelVisible: boolean
    academicPluginList: any[]
    academicCoreFunctions: any[]
    academicPluginArgs: string
    currentAcademicPlugin?: any
    currentAcademicCore?: any
    academicWorkflowEnabled?: boolean
    academicWorkflowRunning?: boolean
    academicWorkflowSteps?: AcademicWorkflowStep[]
    academicWorkflowTemplates?: AcademicWorkflowTemplate[]
    preferredModel?: any
    chatHistoryHasMore?: boolean
    chatHistoryLoading?: boolean
    chatHistoryCursor?: number
    hiddenReplyChatIdsByGroup?: Record<number, number[]>
    hiddenReplyTailAnchorByGroup?: Record<number, number>
    prompt?: string
    currentPlugin?: {
      // 可选，存储当前使用的插件信息
      pluginId: number
      pluginName: string
      description: string
      pluginImg: string
      parameters: string
      deductType: number
      drawingType: number
      modelType: number
    }
  }

  interface ConversationRequest {
    conversationId?: string
    parentMessageId?: string
    temperature?: number
    model?: number
    modelType?: number
    groupId?: number
  }

  interface AcademicWorkflowStep {
    kind: 'core' | 'plugin'
    name: string
    displayName?: string
    args?: string
  }

  interface AcademicWorkflowTemplate {
    id: string
    title: string
    prompt: string
    steps: AcademicWorkflowStep[]
  }

  interface AcademicWorkflowStageMeta {
    index: number
    kind: 'core' | 'plugin'
    name: string
    displayName: string
    args?: string
    status: 'pending' | 'running' | 'done' | 'error'
    contentPreview?: string
    error?: string
    startedAt?: string
    completedAt?: string
    progressText?: string
  }

  interface AcademicWorkflowTaskData {
    type: 'academic-workflow'
    enabled: true
    status: 'pending' | 'running' | 'done' | 'error'
    currentStage: number
    totalStages: number
    modelName?: string
    steps: AcademicWorkflowStageMeta[]
    lastUpdatedAt: string
  }

  interface ConversationParams {
    msg: string
    action?: string
    drawId?: string
    customId?: string
    model?: string
    modelName?: string
    modelType?: number
    modelAvatar?: string
    usingPlugin?: any
    appId?: number
    extraParam?: any
    fileUrl?: string
    chatId?: number | string
    taskId?: string
    imageUrl?: string
    regenerate?: boolean
    overwriteReply?: boolean
    replyChatId?: number
    replyIndex?: number
    editIndex?: number
  }

  interface SearchAppsResponse {}

  interface ConversationResponse {
    conversationId: string
    detail: {
      choices: {
        finish_reason: string
        index: number
        logprobs: any
        text: string
      }[]
      created: number
      id: string
      model: string
      object: string
      usage: {
        completion_tokens: number
        prompt_tokens: number
        total_tokens: number
      }
    }
    id: string
    parentMessageId: string
    role: string
    text: string
  }
}
