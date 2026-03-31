export type BillingCycle = 'monthly' | 'annual';

export interface PackageBillingOffer {
  billingCycle: BillingCycle;
  billingMonths: number;
  price: number;
  originalPrice: number;
  originalTotal: number;
  total: number;
  discountRate: number;
  saveAmount: number;
  monthlyEquivalentPrice: number;
  days: number;
  model3Count: number;
  model4Count: number;
  drawMjCount: number;
  appCats: string;
}

const ANNUAL_DISCOUNT_RATE = 20;
const ANNUAL_MONTHS = 12;
const ANNUAL_PRICE_OVERRIDES_BY_NAME: Record<string, number> = {
  plus: 796.8,
  pro: 1078.8,
  max: 2191.2,
  team: 2450,
};
const ANNUAL_PRICE_OVERRIDES_BY_WEIGHT: Record<number, number> = {
  10: 796.8,
  20: 1078.8,
  30: 2191.2,
  40: 2450,
};

function roundPrice(value: number) {
  return Number((Math.round(Number(value || 0) * 100) / 100).toFixed(2));
}

function toNumber(value: unknown) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function scaleQuota(value: unknown, factor: number) {
  return Math.round(toNumber(value) * factor);
}

function resolveAnnualDays(days: number) {
  if (days <= 0) return days;
  if (days >= 365) return days;
  return 365;
}

function resolveAnnualOverride(pkg: any) {
  const nameKey = String(pkg?.name || '')
    .trim()
    .toLowerCase();
  if (ANNUAL_PRICE_OVERRIDES_BY_NAME[nameKey] !== undefined) {
    return ANNUAL_PRICE_OVERRIDES_BY_NAME[nameKey];
  }
  const weight = toNumber(pkg?.weight);
  if (ANNUAL_PRICE_OVERRIDES_BY_WEIGHT[weight] !== undefined) {
    return ANNUAL_PRICE_OVERRIDES_BY_WEIGHT[weight];
  }
  return null;
}

export function normalizeBillingCycle(value?: string): BillingCycle {
  return value === 'annual' ? 'annual' : 'monthly';
}

export function getPackageBillingOffer(pkg: any, billingCycle?: string): PackageBillingOffer {
  const cycle = normalizeBillingCycle(billingCycle);
  const billingMonths = cycle === 'annual' ? ANNUAL_MONTHS : 1;
  const basePrice = roundPrice(toNumber(pkg?.price));
  const originalTotal = roundPrice(basePrice * billingMonths);
  const annualOverride = resolveAnnualOverride(pkg);
  const price =
    cycle === 'annual'
      ? roundPrice(annualOverride ?? originalTotal * (1 - ANNUAL_DISCOUNT_RATE / 100))
      : basePrice;
  const discountRate =
    cycle === 'annual' && originalTotal > 0
      ? roundPrice(((originalTotal - price) / originalTotal) * 100)
      : 0;
  const days = cycle === 'annual' ? resolveAnnualDays(toNumber(pkg?.days)) : toNumber(pkg?.days);
  const quotaFactor = cycle === 'annual' ? ANNUAL_MONTHS : 1;

  return {
    billingCycle: cycle,
    billingMonths,
    price,
    originalPrice: basePrice,
    originalTotal,
    total: price,
    discountRate,
    saveAmount: roundPrice(originalTotal - price),
    monthlyEquivalentPrice: roundPrice(price / billingMonths),
    days,
    model3Count: scaleQuota(pkg?.model3Count, quotaFactor),
    model4Count: scaleQuota(pkg?.model4Count, quotaFactor),
    drawMjCount: scaleQuota(pkg?.drawMjCount, quotaFactor),
    appCats: String(pkg?.appCats || ''),
  };
}

export function withPackageBillingOptions<T extends Record<string, any>>(pkg: T) {
  const monthly = getPackageBillingOffer(pkg, 'monthly');
  const annual = getPackageBillingOffer(pkg, 'annual');
  return {
    ...pkg,
    billingOptions: {
      monthly,
      annual,
    },
    annualDiscountRate: annual.discountRate,
    recommendedBillingCycle: 'annual' as BillingCycle,
  };
}
