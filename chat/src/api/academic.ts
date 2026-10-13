import { get, post } from '@/utils/request'
import { fetchStream } from '@/utils/request/fetch'
import type { AxiosProgressEvent } from 'axios'
import {
  ACADEMIC_ENDPOINTS,
  type AcademicChatRequest,
  type AcademicProcessParams,
  type AcademicWorkflowRequest,
} from '@/domain/research/contracts'

export function fetchAcademicChatAPIProcess<T = any>(
  params: AcademicProcessParams<AcademicChatRequest>
) {
  if (!params.onDownloadProgress) {
    return post<T>({
      url: ACADEMIC_ENDPOINTS.chat,
      data: params.data,
      signal: params.signal,
    })
  }

  return new Promise((resolve, reject) => {
    const fetchOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params.data),
    }

    if (params.signal) {
      fetchOptions.signal = params.signal as any
    }

    fetchStream(ACADEMIC_ENDPOINTS.chat, fetchOptions, chunk => {
      if (params.onDownloadProgress) {
        const progressEvent: AxiosProgressEvent = {
          event: {
            target: {
              responseText: chunk,
              isChunk: true,
              getResponseHeader: (_name: string) => null,
            },
          } as any,
          loaded: chunk.length,
          total: 0,
          bytes: chunk.length,
          lengthComputable: false,
          progress: 0,
        }
        params.onDownloadProgress(progressEvent)
      }
    })
      .then(response => {
        resolve({ data: response } as any)
      })
      .catch(error => {
        reject(error)
      })
  })
}

export function fetchAcademicWorkflowAPIProcess<T = any>(
  params: AcademicProcessParams<AcademicWorkflowRequest>
) {
  if (!params.onDownloadProgress) {
    return post<T>({
      url: ACADEMIC_ENDPOINTS.workflow,
      data: params.data,
      signal: params.signal,
    })
  }

  return new Promise((resolve, reject) => {
    const fetchOptions: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params.data),
    }

    if (params.signal) {
      fetchOptions.signal = params.signal as any
    }

    fetchStream(ACADEMIC_ENDPOINTS.workflow, fetchOptions, chunk => {
      if (params.onDownloadProgress) {
        const progressEvent: AxiosProgressEvent = {
          event: {
            target: {
              responseText: chunk,
              isChunk: true,
              getResponseHeader: (_name: string) => null,
            },
          } as any,
          loaded: chunk.length,
          total: 0,
          bytes: chunk.length,
          lengthComputable: false,
          progress: 0,
        }
        params.onDownloadProgress(progressEvent)
      }
    })
      .then(response => {
        resolve({ data: response } as any)
      })
      .catch(error => {
        reject(error)
      })
  })
}

export function fetchAcademicCoreFunctionList<T = any>() {
  return post<T>({
    url: ACADEMIC_ENDPOINTS.coreFunctions,
    data: {},
  })
}

export function fetchAcademicPluginList<T = any>() {
  return post<T>({
    url: ACADEMIC_ENDPOINTS.plugins,
    data: {},
  })
}

export function fetchAcademicHealth<T = any>(params?: { model?: string; modelName?: string }) {
  return get<T>({
    url: '/academic/health',
    data: params,
  })
}
