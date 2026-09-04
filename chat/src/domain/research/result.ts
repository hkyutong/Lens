import type { AcademicStreamEvent } from './stream'

export type AcademicResultPhase =
  | 'idle'
  | 'streaming'
  | 'completed'
  | 'failed'
  | 'aborted'

export interface AcademicResultState {
  phase: AcademicResultPhase
  progress: number
  hasFinalContent: boolean
  hasStructuredResult: boolean
}

export const createAcademicResultState = (): AcademicResultState => ({
  phase: 'idle',
  progress: 0,
  hasFinalContent: false,
  hasStructuredResult: false,
})

const isFailureReason = (reason?: string) => /^(?:error|failed|failure)$/i.test(reason || '')

/** 仅负责结果生命周期，不拼接正文，正文清洗仍由现有展示层负责。 */
export function reduceAcademicResult(
  state: AcademicResultState,
  event: AcademicStreamEvent
): AcademicResultState {
  if (state.phase === 'failed' || state.phase === 'aborted') return state

  const failed = Boolean(event.streamError) || isFailureReason(event.finishReason)
  const completed = Boolean(event.finishReason) && !failed
  const hasStructuredResult =
    state.hasStructuredResult ||
    event.taskData !== undefined ||
    event.fileVectorResult !== undefined ||
    Boolean(event.networkSearchResult)

  return {
    phase: failed ? 'failed' : completed ? 'completed' : 'streaming',
    progress: event.progress === undefined ? state.progress : event.progress,
    hasFinalContent: state.hasFinalContent || event.finalContent !== undefined,
    hasStructuredResult,
  }
}

export function markAcademicResultFailed(state: AcademicResultState): AcademicResultState {
  return state.phase === 'aborted' ? state : { ...state, phase: 'failed' }
}

export function markAcademicResultAborted(state: AcademicResultState): AcademicResultState {
  if (state.phase === 'completed' || state.phase === 'failed') return state
  return { ...state, phase: 'aborted' }
}

export function completeAcademicResult(state: AcademicResultState): AcademicResultState {
  if (state.phase === 'failed' || state.phase === 'aborted') return state
  return { ...state, phase: 'completed' }
}
