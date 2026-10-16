type TestBody = () => void | Promise<void>;
declare const describe: (name: string, body: TestBody) => void;
declare const beforeAll: (body: TestBody) => void;
declare const afterAll: (body: TestBody) => void;
declare const it: {
  (name: string, body: TestBody): void;
  each<T>(rows: readonly T[]): (name: string, body: (row: T) => void | Promise<void>) => void;
};
declare const expect: (value: unknown) => {
  toBe(value: unknown): void;
  toEqual(value: unknown): void;
  toMatchObject(value: unknown): void;
  toBeUndefined(): void;
  toBeGreaterThan(value: number): void;
  not: { toBe(value: unknown): void };
};
declare const jest: {
  fn<T extends (...args: any[]) => any>(implementation: T): T;
  spyOn(object: object, method: string): any;
  restoreAllMocks(): void;
};

import { Logger } from '@nestjs/common';
import axios from 'axios';
import {
  packageCnyToUsd,
  packageUsdToCny,
  resolvePackageUsdPrice,
  resolvePackageAnnualDiscountRate,
  roundPackageMoney,
} from '../../common/constants/packageCurrency';
import { getPackageBillingOffer } from './package-pricing.util';
import { OrderService } from '../order/order.service';
import { PayService } from '../pay/pay.service';
import { CramiService } from './crami.service';

const plans = [
  { name: 'Plus', usdPrice: 5, price: 33.47, weight: 1 },
  { name: 'Pro', usdPrice: 12, price: 80.33, weight: 2 },
  { name: 'Max', usdPrice: 25, price: 167.34, weight: 3 },
];

const makePackage = (plan = plans[0]) => ({
  id: 1,
  ...plan,
  days: 30,
  model3Count: 1000,
  model4Count: 200,
  drawMjCount: 10,
  appCats: '',
  status: 1,
});

type Normalizer = { normalizePackagePayload: (value: Record<string, unknown>) => Record<string, unknown> };
const normalize = (payload: Record<string, unknown>) =>
  (CramiService.prototype as unknown as Normalizer).normalizePackagePayload(payload);

const createOrderService = (pkg: ReturnType<typeof makePackage>) => {
  const orders = { save: jest.fn(async (value: Record<string, unknown>) => ({ ...value })) };
  const packages = { findOne: jest.fn(async () => pkg) };
  const config = { queryPayType: jest.fn(async () => 'synthetic') };
  const service = new OrderService(orders as any, packages as any, {} as any, {} as any, config as any);
  return { service, orders, packages };
};

describe('package currency and settlement compatibility', () => {
  beforeAll(() => { jest.spyOn(Logger, 'log').mockImplementation(() => undefined); });
  afterAll(() => { jest.restoreAllMocks(); });

  it.each(plans)('converts the public USD monthly price for $name', (plan) => {
    expect(packageUsdToCny(plan.usdPrice)).toBe(plan.price);
    expect(packageCnyToUsd(plan.price)).toBe(plan.usdPrice);
  });

  it('defaults the annual discount to twenty percent', () => {
    expect(resolvePackageAnnualDiscountRate({})).toBe(20);
  });

  it.each([0, 10, 50, 99])('preserves an explicit annual discount percentage', (annualDiscountRate) => {
    expect(resolvePackageAnnualDiscountRate({ annualDiscountRate })).toBe(annualDiscountRate);
    const offer = getPackageBillingOffer({ ...makePackage(), annualDiscountRate }, 'annual');
    expect(offer.displayPrice).toBe(roundPackageMoney(60 * (1 - annualDiscountRate / 100)));
  });

  it.each([undefined, null, -1, 100, 1e5, NaN, Infinity, 'invalid'])('defaults unusable annual discount settings', (annualDiscountRate) => {
    expect(resolvePackageAnnualDiscountRate({ annualDiscountRate })).toBe(20);
  });

  it('rounds money to two decimals and rejects non-finite money', () => {
    expect(roundPackageMoney(12.346)).toBe(12.35);
    expect(roundPackageMoney(12.344)).toBe(12.34);
    expect(roundPackageMoney(NaN)).toBe(0);
    expect(roundPackageMoney(Infinity)).toBe(0);
  });

  it.each(plans)('normalizes USD authority instead of contradictory CNY for $name', (plan) => {
    const input = { ...makePackage(plan), price: 999.99 };
    const saved = normalize(input);
    expect(saved.price).toBe(plan.price);
    expect(saved.usdPrice).toBe(plan.usdPrice);
    expect(saved.name).toBe(plan.name);
    expect(saved.weight).toBe(plan.weight);
    expect(saved.days).toBe(input.days);
    expect(saved.model3Count).toBe(input.model3Count);
    expect(saved.model4Count).toBe(input.model4Count);
    expect(saved.drawMjCount).toBe(input.drawMjCount);
    expect(input.price).toBe(999.99);
  });

  it('preserves CNY when the historical payload has no USD field', () => {
    const input = { name: 'Legacy', price: 98.76, days: 45, model3Count: 1000, model4Count: 200, drawMjCount: 10 };
    expect(normalize(input)).toMatchObject(input);
  });

  it.each([undefined, null, 0, -1, NaN])('keeps legacy settlement price for unusable USD input', (usdPrice) => {
    const input = { ...makePackage(), usdPrice, price: 98.76 };
    expect(normalize(input).price).toBe(98.76);
  });

  it.each(plans)('keeps monthly settlement/quota/days independent of USD display for $name', (plan) => {
    const pkg = makePackage(plan);
    const offer = getPackageBillingOffer(pkg, 'monthly');
    expect(offer.price).toBe(plan.price);
    expect(offer.total).toBe(plan.price);
    expect(offer.displayPrice).toBe(plan.usdPrice);
    expect(offer.billingMonths).toBe(1);
    expect(offer.days).toBe(30);
    expect(offer.model3Count).toBe(pkg.model3Count);
    expect(offer.model4Count).toBe(pkg.model4Count);
    expect(offer.drawMjCount).toBe(pkg.drawMjCount);
  });

  it.each(plans)('keeps annual monetary and allowance contracts for $name', (plan) => {
    const pkg = makePackage(plan);
    const offer = getPackageBillingOffer(pkg, 'annual');
    const legacyOffer = getPackageBillingOffer({ ...pkg, usdPrice: undefined }, 'annual');
    expect(offer.billingMonths).toBe(12);
    expect(offer.price).toBe(legacyOffer.price);
    expect(offer.total).toBe(legacyOffer.total);
    expect(offer.originalTotal).toBe(roundPackageMoney(plan.price * 12));
    expect(offer.displayOriginalTotal).toBe(plan.usdPrice * 12);
    expect(offer.displayPrice).toBe(roundPackageMoney(plan.usdPrice * 12 * 0.8));
    expect(offer.price).toBe(roundPackageMoney(plan.price * 12 * 0.8));
    expect(offer.days).toBe(legacyOffer.days);
    expect(offer.days).toBe(365);
    expect(offer.model3Count).toBe(pkg.model3Count * 12);
    expect(offer.model4Count).toBe(pkg.model4Count * 12);
    expect(offer.drawMjCount).toBe(pkg.drawMjCount * 12);
  });

  it('converts legacy display while preserving its original CNY payment amount', () => {
    const legacy = { ...makePackage(), price: 98.76, usdPrice: undefined };
    const offer = getPackageBillingOffer(legacy, 'monthly');
    expect(resolvePackageUsdPrice(legacy)).toBe(packageCnyToUsd(98.76));
    expect(offer.displayPrice).toBe(packageCnyToUsd(98.76));
    expect(offer.price).toBe(98.76);
    expect(offer.total).toBe(98.76);
  });

  it('does not mutate a frozen historical package or existing offer', () => {
    const legacy = Object.freeze({ ...makePackage(), price: 98.76, usdPrice: undefined });
    const original = getPackageBillingOffer(legacy, 'monthly');
    const before = { ...original };
    getPackageBillingOffer({ ...legacy, usdPrice: 25, price: 167.34 }, 'annual');
    expect(original).toEqual(before);
    expect(legacy.price).toBe(98.76);
    expect(legacy.usdPrice).toBeUndefined();
  });

  it.each(plans)('creates monthly orders using CNY snapshot amounts for $name', async (plan) => {
    const pkg = makePackage(plan);
    const { service } = createOrderService(pkg);
    const order = await service.create(17, 1, 2, 'synthetic', 'monthly');
    expect(order.price).toBe(plan.price);
    expect(order.total).toBe(roundPackageMoney(plan.price * 2));
    expect(order.price).not.toBe(plan.usdPrice);
    expect(order.billingCycle).toBe('monthly');
  });

  it.each(plans)('creates annual orders with unchanged billing contracts for $name', async (plan) => {
    const pkg = makePackage(plan);
    const expected = getPackageBillingOffer(pkg, 'annual');
    const { service } = createOrderService(pkg);
    const order = await service.create(17, 1, 2, 'synthetic', 'annual');
    expect(order.price).toBe(expected.price);
    expect(order.total).toBe(roundPackageMoney(expected.price * 2));
    expect(order.originalTotal).toBe(roundPackageMoney(expected.originalTotal * 2));
    expect(order.billingMonths).toBe(12);
    expect(order.billingCycle).toBe('annual');
  });

  it('keeps a legacy order snapshot when current package prices are changed', async () => {
    const pkg = { ...makePackage(), price: 98.76, usdPrice: undefined };
    const { service } = createOrderService(pkg as any);
    const order = await service.create(17, 1, 2, 'synthetic', 'monthly');
    const snapshot = { ...order };
    pkg.price = 167.34;
    pkg.usdPrice = 25 as any;
    await service.create(17, 1, 1, 'synthetic', 'annual');
    expect(order).toEqual(snapshot);
    expect(order.total).toBe(197.52);
  });

  it('passes a historical CNY order total to the existing payment path', async () => {
    const oldOrder = { userId: 17, orderId: 'synthetic-order', goodsId: 1, total: 197.52 };
    const currentPackage = { ...makePackage(plans[2]), price: 167.34 };
    const orders = { findOne: jest.fn(async () => oldOrder) };
    const packages = { findOne: jest.fn(async () => currentPackage) };
    const config = { getConfigs: jest.fn(async () => ({
      payEpayPid: '123',
      payEpaySecret: 'synthetic-secret',
      payEpayNotifyUrl: 'https://example.invalid/notify',
      payEpayReturnUrl: 'https://example.invalid/return',
      payEpayApiPayUrl: 'https://example.invalid/submit.php',
    })) };
    const post = jest.spyOn(axios, 'post').mockResolvedValue({ data: { code: 1, url_qrcode: 'https://example.invalid/qr' } } as any);
    const service = new PayService(packages as any, orders as any, {} as any, config as any, {} as any);
    const result = await service.payEpay(17, 'synthetic-order', 'synthetic');
    if (post.mock.calls.length) {
      expect(Number((post.mock.calls[0][1] as Record<string, unknown>).money)).toBe(oldOrder.total);
    } else {
      expect(Number(new URL(result.redirectUrl).searchParams.get('money'))).toBe(oldOrder.total);
    }
    expect(oldOrder.total).toBe(197.52);
    post.mockRestore();
  });
});
