import { get, post, type Response } from '@/utils/request'

export interface CreateShareResult {
  shareCode: string
}

export interface SharedHtmlResult {
  htmlContent: string
}

export function createShare(data: { htmlContent: string }): Promise<Response<CreateShareResult>> {
  return post<CreateShareResult>({
    url: '/share/create',
    data,
  })
}

export function getShare(shareCode: string): Promise<Response<SharedHtmlResult>> {
  return get<SharedHtmlResult>({
    url: `/share/${shareCode}`,
  })
}
