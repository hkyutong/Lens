import { get, post } from '@/utils/request'
import type { BillingCycle } from '@/types/billing'

/* order buy */
export function fetchOrderBuyAPI<T>(data: {
  goodsId: number
  payType?: string
  billingCycle?: BillingCycle
}): Promise<T> {
  return post<T>({
    url: '/order/buy',
    data,
  })
}

/* order query */
export function fetchOrderQueryAPI<T>(data: { orderId: string }): Promise<T> {
  return get<T>({
    url: '/order/queryByOrderId',
    data,
  })
}
