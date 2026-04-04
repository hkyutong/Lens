import { post } from '@/utils/request'
import { fetchStream } from '@/utils/request/fetch'
import type { AxiosProgressEvent, GenericAbortSignal } from 'axios'

export function fetchAcademicChatAPIProcess<T = any>(params: {
  data: any
  signal?: GenericAbortSignal
  onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void
}) {
  if (!params.onDownloadProgress) {
    return post<T>({
      url: '/academic/chat-process',
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

    fetchStream('/academic/chat-process', fetchOptions, chunk => {
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

export function fetchAcademicWorkflowAPIProcess<T = any>(params: {
  data: any
  signal?: GenericAbortSignal
  onDownloadProgress?: (progressEvent: AxiosProgressEvent) => void
}) {
  if (!params.onDownloadProgress) {
    return post<T>({
      url: '/academic/workflow-process',
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

    fetchStream('/academic/workflow-process', fetchOptions, chunk => {
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
    url: '/academic/core-function-list',
    data: {},
  })
}

export function fetchAcademicPluginList<T = any>() {
  return post<T>({
    url: '/academic/plugin-list',
    data: {},
  })
}
