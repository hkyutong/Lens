// Latest available ECB reference snapshot when configured. This rate is for
// display and compatible CNY pricing; the payment provider settles its currency.
export const PACKAGE_USD_TO_CNY_RATE = 7.489 / 1.1188;
export const PACKAGE_EXCHANGE_RATE_DATE = '2026-10-13';
export const PACKAGE_EXCHANGE_RATE_SOURCE =
  'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/euro_reference_exchange_rates/html/index.en.html';

export function resolvePackageAnnualDiscountRate(pkg: {
  annualDiscountRate?: number | string;
}): number {
  if (
    pkg.annualDiscountRate === undefined ||
    pkg.annualDiscountRate === null ||
    (typeof pkg.annualDiscountRate === 'string' && !pkg.annualDiscountRate.trim())
  ) {
    return 20;
  }
  const rate = Number(pkg.annualDiscountRate);
  return Number.isFinite(rate) && rate >= 0 && rate < 100 ? rate : 20;
}

export function roundPackageMoney(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function packageUsdToCny(value: number): number {
  return roundPackageMoney(value * PACKAGE_USD_TO_CNY_RATE);
}

export function packageCnyToUsd(value: number): number {
  return roundPackageMoney(value / PACKAGE_USD_TO_CNY_RATE);
}

export function resolvePackageUsdPrice(pkg: {
  price?: number | string | null;
  usdPrice?: number | string | null;
}): number {
  const usdPrice = Number(pkg.usdPrice);
  if (Number.isFinite(usdPrice) && usdPrice > 0) {
    return roundPackageMoney(usdPrice);
  }
  const price = Number(pkg.price);
  return Number.isFinite(price) && price > 0 ? packageCnyToUsd(price) : 0;
}
