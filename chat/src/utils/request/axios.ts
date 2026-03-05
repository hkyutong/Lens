import { useAuthStore, useGlobalStore } from '@/store'
import axios, { type AxiosResponse } from 'axios'

function createRequestId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`
}

const service = axios.create({
  baseURL: import.meta.env.VITE_GLOB_API_URL || '',
  timeout: 2400 * 1000,
  adapter: 'fetch',
})

service.interceptors.request.use(
  config => {
    const token = useAuthStore().token
    const fingerprint = useGlobalStore()?.fingerprint
    const currentDomain = window.location.origin
    config.headers['X-Website-Domain'] = currentDomain
    if (!config.headers['X-Request-Id']) {
      config.headers['X-Request-Id'] = createRequestId()
    }
    fingerprint && (config.headers.Fingerprint = fingerprint)
    if (token) config.headers.Authorization = `Bearer ${token}`
    return config
  },
  error => {
    return Promise.reject(error.response)
  }
)

service.interceptors.response.use(
  (response: AxiosResponse): AxiosResponse => {
    if ([200, 201].includes(response.status)) return response

    throw new Error(response.status.toString())
  },
  error => {
    return Promise.reject(error)
  }
)

export default service
