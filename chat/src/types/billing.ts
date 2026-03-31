export type BillingCycle = 'monthly' | 'annual'

export interface BillingOption {
  billingCycle: BillingCycle
  billingMonths: number
  price: number
  originalPrice: number
  originalTotal: number
  total: number
  discountRate: number
  saveAmount: number
  monthlyEquivalentPrice: number
  days: number
  model3Count: number
  model4Count: number
  drawMjCount: number
  appCats: string
}
