export interface AcademicStreamEvent {
  requestId?: string
  userBalance?: unknown
  nodeType?: string
  stepName?: string
  progress?: number
  chatId?: string
  finishReason?: string
  mcpToolUse?: string
  taskData?: unknown
  networkSearchResult?: string
  fileVectorResult?: unknown
  toolCalls?: unknown
  promptReference?: string
  thinkingPreview?: unknown
  resetContent: boolean
  content?: unknown
  finalContent?: unknown
  reasoningContent?: unknown
  streamError?: string
}

export interface AcademicMessageSnapshot {
  fileUrl?: unknown
  imageUrl?: unknown
  reasoningText?: unknown
  networkSearchResult?: unknown
  fileVectorResult?: unknown
  taskData?: unknown
  promptReference?: unknown
  workflowProgress?: unknown
}

const asRecord = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

const pick = (source: Record<string, unknown>, keys: string[]) => {
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null) return source[key]
  }
  return undefined
}

const optionalString = (value: unknown) => {
  if (value === undefined || value === null) return undefined
  const text = String(value).trim()
  return text || undefined
}

const boundedProgress = (value: unknown) => {
  const raw = typeof value === 'string' ? value.trim().replace(/%$/, '') : value
  const progress = Number(raw)
  if (!Number.isFinite(progress)) return undefined
  return Math.max(0, Math.min(100, Math.round(progress)))
}

/** 将后端历史字段别名收敛为 Lens 前端的单一研究事件契约。 */
export function normalizeAcademicStreamEvent(value: unknown): AcademicStreamEvent | null {
  const source = asRecord(value)
  if (!source) return null

  const delta = asRecord(source.delta)
  return {
    requestId: optionalString(source.requestId),
    userBalance: pick(source, ['userBalance']),
    nodeType: optionalString(source.nodeType),
    stepName: optionalString(source.stepName),
    progress: boundedProgress(source.progress),
    chatId: optionalString(source.chatId),
    finishReason: optionalString(source.finishReason),
    mcpToolUse: optionalString(source.mcpToolUse),
    taskData: pick(source, ['taskData', 'task_data']),
    networkSearchResult: optionalString(source.networkSearchResult),
    fileVectorResult: pick(source, ['fileVectorResult', 'file_vector_result']),
    toolCalls: pick(source, ['tool_calls', 'toolCalls']),
    promptReference: optionalString(source.promptReference),
    thinkingPreview: pick(source, ['thinkingPreview', 'progressText']),
    resetContent: Boolean(source.resetContent),
    content: source.content ?? delta?.content ?? pick(source, ['text', 'message', 'response']),
    finalContent: pick(source, ['finalContent', 'final_content']),
    reasoningContent: pick(source, [
      'reasoning_content',
      'reasoningContent',
      'full_reasoning_content',
    ]),
    streamError: optionalString(source.streamError),
  }
}

/** 将历史消息的兼容字段统一成刷新后可直接渲染的研究快照。 */
export function normalizeAcademicMessageSnapshot(
  value: unknown
): AcademicMessageSnapshot {
  const source = asRecord(value) || {}
  return {
    fileUrl: source.fileUrl ?? source.file_url ?? '',
    imageUrl: source.imageUrl ?? source.image_url ?? '',
    reasoningText:
      source.reasoningText ??
      source.reasoning_text ??
      source.reasoning_content ??
      source.full_reasoning_content ??
      '',
    networkSearchResult: source.networkSearchResult ?? source.network_search_result ?? '',
    fileVectorResult: source.fileVectorResult ?? source.file_vector_result ?? '',
    taskData: source.taskData ?? source.task_data,
    promptReference: source.promptReference ?? source.prompt_reference ?? '',
    workflowProgress: source.workflowProgress ?? source.workflow_progress ?? source.progress ?? '',
  }
}
