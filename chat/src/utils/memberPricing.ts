import type { BillingCycle, BillingOption } from '@/types/billing'

type PackageLike = {
  name?: string
  weight?: number | string
  price?: number | string
  days?: number | string
  model3Count?: number | string
  model4Count?: number | string
  drawMjCount?: number | string
  appCats?: string
  billingOptions?: Partial<Record<BillingCycle, BillingOption>>
  annualDiscountRate?: number
}

const DEFAULT_ANNUAL_DISCOUNT_RATE = 20
const ANNUAL_PRICE_OVERRIDES_BY_NAME: Record<string, number> = {
  plus: 370,
  pro: 950,
  max: 1900,
  team: 2450,
}
const ANNUAL_PRICE_OVERRIDES_BY_WEIGHT: Record<number, number> = {
  10: 370,
  20: 950,
  30: 1900,
  40: 2450,
}

function toNumber(value: unknown) {
  const num = Number(value || 0)
  return Number.isFinite(num) ? num : 0
}

function roundPrice(value: number) {
  return Number((Math.round(Number(value || 0) * 100) / 100).toFixed(2))
}

function scaleQuota(value: unknown, factor: number) {
  return Math.round(toNumber(value) * factor)
}

function resolveAnnualDays(days: number) {
  if (days <= 0) return days
  if (days >= 365) return days
  return 365
}

function resolveAnnualOverride(pkg: PackageLike) {
  const nameKey = String(pkg.name || '')
    .trim()
    .toLowerCase()
  if (ANNUAL_PRICE_OVERRIDES_BY_NAME[nameKey] !== undefined) {
    return ANNUAL_PRICE_OVERRIDES_BY_NAME[nameKey]
  }
  const weight = toNumber(pkg.weight)
  if (ANNUAL_PRICE_OVERRIDES_BY_WEIGHT[weight] !== undefined) {
    return ANNUAL_PRICE_OVERRIDES_BY_WEIGHT[weight]
  }
  return null
}

export function createBillingOption(
  pkg: PackageLike,
  billingCycle: BillingCycle,
  annualDiscountRate = DEFAULT_ANNUAL_DISCOUNT_RATE
): BillingOption {
  const billingMonths = billingCycle === 'annual' ? 12 : 1
  const basePrice = roundPrice(toNumber(pkg.price))
  const originalTotal = roundPrice(basePrice * billingMonths)
  const annualOverride = resolveAnnualOverride(pkg)
  const price =
    billingCycle === 'annual'
      ? roundPrice(annualOverride ?? originalTotal * (1 - annualDiscountRate / 100))
      : basePrice
  const discountRate =
    billingCycle === 'annual' && originalTotal > 0
      ? roundPrice(((originalTotal - price) / originalTotal) * 100)
      : 0

  return {
    billingCycle,
    billingMonths,
    price,
    originalPrice: basePrice,
    originalTotal,
    total: price,
    discountRate,
    saveAmount: roundPrice(originalTotal - price),
    monthlyEquivalentPrice: roundPrice(price / billingMonths),
    days: billingCycle === 'annual' ? resolveAnnualDays(toNumber(pkg.days)) : toNumber(pkg.days),
    model3Count: scaleQuota(pkg.model3Count, billingMonths),
    model4Count: scaleQuota(pkg.model4Count, billingMonths),
    drawMjCount: scaleQuota(pkg.drawMjCount, billingMonths),
    appCats: String(pkg.appCats || ''),
  }
}

export function hydrateBillingOptions<T extends PackageLike>(pkg: T) {
  const annualDiscountRate = toNumber(pkg.annualDiscountRate) || DEFAULT_ANNUAL_DISCOUNT_RATE
  const monthly =
    pkg.billingOptions?.monthly || createBillingOption(pkg, 'monthly', annualDiscountRate)
  const annual =
    pkg.billingOptions?.annual || createBillingOption(pkg, 'annual', annualDiscountRate)

  return {
    ...pkg,
    annualDiscountRate,
    recommendedBillingCycle: 'annual' as BillingCycle,
    billingOptions: {
      monthly,
      annual,
    },
  }
}

export function formatCurrency(value: number | string) {
  const num = toNumber(value)
  if (Number.isInteger(num)) return num.toString()
  return num.toFixed(2)
}
