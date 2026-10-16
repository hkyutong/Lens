import { packageCnyToUsd, resolvePackageUsdPrice , resolvePackageAnnualDiscountRate } from '../../../service/src/common/constants/packageCurrency';
import type { BillingCycle, BillingOption } from '@/types/billing'

type PackageLike = {
  name?: string
  weight?: number | string
  price?: number | string
  usdPrice?: number | string
  days?: number | string
  model3Count?: number | string
  model4Count?: number | string
  drawMjCount?: number | string
  appCats?: string
  billingOptions?: Partial<Record<BillingCycle, BillingOption>>
  annualDiscountRate?: number
}

const DEFAULT_ANNUAL_DISCOUNT_RATE = resolvePackageAnnualDiscountRate({})

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

function resolveAnnualDiscountRate(pkg: PackageLike) {
  return resolvePackageAnnualDiscountRate(pkg);
}

export function createBillingOption(
  pkg: PackageLike,
  billingCycle: BillingCycle,
  defaultAnnualDiscountRate = DEFAULT_ANNUAL_DISCOUNT_RATE
): BillingOption {
  const billingMonths = billingCycle === 'annual' ? 12 : 1
  const basePrice = roundPrice(toNumber(pkg.price))
  const originalTotal = roundPrice(basePrice * billingMonths)
  const baseDisplayPrice = roundPrice(resolvePackageUsdPrice(pkg))
  const displayOriginalTotal = roundPrice(baseDisplayPrice * billingMonths)
  const annualDiscountRate =
    resolveAnnualDiscountRate({ ...pkg, annualDiscountRate: pkg.annualDiscountRate ?? defaultAnnualDiscountRate })
  const price =
    billingCycle === 'annual'
      ? roundPrice(originalTotal * (1 - annualDiscountRate / 100))
      : basePrice
  const discountRate =
    billingCycle === 'annual' && originalTotal > 0
      ? roundPrice(((originalTotal - price) / originalTotal) * 100)
      : 0
  const displayPrice =
    billingCycle === 'annual'
      ? roundPrice(displayOriginalTotal * (1 - annualDiscountRate / 100))
      : baseDisplayPrice

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
    displayPrice,
    displayOriginalPrice: baseDisplayPrice,
    displayOriginalTotal,
    displaySaveAmount: roundPrice(displayOriginalTotal - displayPrice),
    displayMonthlyEquivalentPrice: roundPrice(displayPrice / billingMonths),
    days: billingCycle === 'annual' ? resolveAnnualDays(toNumber(pkg.days)) : toNumber(pkg.days),
    model3Count: scaleQuota(pkg.model3Count, billingMonths),
    model4Count: scaleQuota(pkg.model4Count, billingMonths),
    drawMjCount: scaleQuota(pkg.drawMjCount, billingMonths),
    appCats: String(pkg.appCats || ''),
  }
}

export function hydrateBillingOptions<T extends PackageLike>(pkg: T) {
  const annualDiscountRate = resolveAnnualDiscountRate(pkg)
  const monthly =
    repairLegacyDisplayBilling(pkg, pkg.billingOptions?.monthly || createBillingOption(pkg, 'monthly', annualDiscountRate))
  const annual =
    repairLegacyDisplayBilling(pkg, pkg.billingOptions?.annual || createBillingOption(pkg, 'annual', annualDiscountRate))

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

function repairLegacyDisplayBilling(pkg: PackageLike, option: BillingOption): BillingOption {
  const usdPrice = Number(pkg.usdPrice);
  if (pkg.usdPrice !== undefined && pkg.usdPrice !== null && pkg.usdPrice !== '' && Number.isFinite(usdPrice) && usdPrice > 0)
    return option;
  return {
    ...option,
    displayPrice: packageCnyToUsd(option.price),
    displayOriginalPrice: packageCnyToUsd(option.originalPrice),
    displayOriginalTotal: packageCnyToUsd(option.originalTotal),
    displaySaveAmount: packageCnyToUsd(option.saveAmount),
    displayMonthlyEquivalentPrice: packageCnyToUsd(option.monthlyEquivalentPrice),
  };
}

export function getMemberDisplayBilling(option: BillingOption | null | undefined, language: string) {
  const usesCny = language === 'zh-CN';
  return {
    currency: usesCny ? 'CNY' : 'USD',
    symbol: usesCny ? '¥' : '$',
    price: toNumber(usesCny ? option?.price : option?.displayPrice),
    originalTotal: toNumber(usesCny ? option?.originalTotal : option?.displayOriginalTotal),
    saveAmount: toNumber(usesCny ? option?.saveAmount : option?.displaySaveAmount),
    monthlyEquivalentPrice: toNumber(usesCny ? option?.monthlyEquivalentPrice : option?.displayMonthlyEquivalentPrice),
  };
}
