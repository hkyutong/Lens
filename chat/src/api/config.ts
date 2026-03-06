import { get } from '@/utils/request'

/* query globe config  */
export function fetchQueryConfigAPI<T>(data?: { domain?: string }) {
  return get<T>({
    url: '/config/queryFront',
    data: data?.domain ? data : undefined,
  })
}
