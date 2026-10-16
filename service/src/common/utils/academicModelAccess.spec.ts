declare const describe: any;
declare const expect: any;
declare const test: any;
declare const jest: any;

import { HttpException, HttpStatus } from '@nestjs/common';
import { AcademicService } from '../../modules/academic/academic.service';
import { ChatService } from '../../modules/chat/chat.service';
import { OpenAIChatService } from '../../modules/aiTool/chat/chat.service';
import { AcademicPlanTier, canUseAcademicModel, resolveAcademicPlanTier } from './academicModelAccess';

const model = (deductType: number) => ({ model: `synthetic-model-${deductType}`, modelName: 'Synthetic model', status: true, keyType: 1,
  deduct: 1, deductType });
const balanceFor = (tier: AcademicPlanTier) => {
  if (tier === 'free') return { packageId: 0, packageWeight: 0, expirationTime: null };
  for (let weight = 1; weight <= 1000; weight += 1) {
    const balance = { packageId: 1, packageWeight: weight, expirationTime: '2999-01-01' };
    if (resolveAcademicPlanTier(balance) === tier) return balance;
  }
  throw new Error('Synthetic tier unavailable');
};
const req = () => ({
  connection: { remoteAddress: 'synthetic-client' }, user: { id: 1, username: 'synthetic-user' }, headers: {},
  header: jest.fn(() => ''), socket: {} });
const rejectsPlan = async (action: Promise<unknown>) => {
  try { await action; } catch (error) {
    if (!(error instanceof HttpException)) {
    const fixtureErrorType = error instanceof Error ? error.name : 'resolved';
    const fixtureMessage = error instanceof Error ? error.message : '';
    const functionMatch = fixtureMessage.match(/([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*) is not a function/);
    const propertyMatch = fixtureMessage.match(/Cannot read properties of (?:undefined|null) \(reading '([A-Za-z_$][\w$]*)'\)/);
    const missingSymbol = functionMatch?.[1] ?? propertyMatch?.[1] ?? 'none';
    throw new Error(JSON.stringify({ fixtureErrorType, missingSymbol }));
  }
  expect(error instanceof HttpException).toBe(true);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.PAYMENT_REQUIRED);
    return;
  }
  throw new Error('Expected model admission rejection');
};
const academicFor = (balance: any) => {
  const service: any = Object.create(AcademicService.prototype);
  service.logger = { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), log: jest.fn() };
  service.userBalanceService = {
    checkUserCertification: jest.fn().mockResolvedValue(undefined), queryUserBalance: jest.fn(async () => balance), validateBalance: jest.fn() };
  service.userService = { checkUserCertification: jest.fn(), checkUserStatus: jest.fn() };
  service.resolveAcademicModelInfo = jest.fn().mockResolvedValue({ requestedModel: 'synthetic-model-3', requestedModelName: 'Synthetic model', resolvedModel: 'synthetic-model-3', modelInfo: model(3) });
  service.modelsService = { getAllKey: jest.fn(() => []) };
  return service;
};

describe('Stable model admission', () => {
  test.each(['free', 'plus', 'pro', 'max'])('enforces %s independently of model names', (tier: AcademicPlanTier) => {
    const expected = tier === 'max' ? [true, true, true] : tier === 'pro' ? [true, true, false] : [true, false, false];
    expect([1, 2, 3].map(type => canUseAcademicModel(tier, type))).toEqual(expected);
    expect([1, 2, 3].map(type => canUseAcademicModel(tier, String(type)))).toEqual(expected);
  });
  test.each([undefined, null, '', true, false, 0, 4, -1, 1.5, NaN, Infinity, 'unknown', '4', 'model4'])('rejects unknown deduction types', type => {
    expect(canUseAcademicModel('max', type)).toBe(false);
  });
  test('retains upgrade, downgrade, expiration and ordinary-balance boundaries', () => {
    const plus = balanceFor('plus');
    const pro = balanceFor('pro');
    const max = balanceFor('max');
    expect(canUseAcademicModel(resolveAcademicPlanTier(plus), 2)).toBe(false);
    expect(canUseAcademicModel(resolveAcademicPlanTier(pro), 2)).toBe(true);
    expect(canUseAcademicModel(resolveAcademicPlanTier(max), 3)).toBe(true);
    expect(canUseAcademicModel(resolveAcademicPlanTier({ ...plus, model4Count: 999, drawMjCount: 999 }), 3)).toBe(false);
    expect(canUseAcademicModel(resolveAcademicPlanTier({ ...max, expirationTime: '2000-01-01' }), 3)).toBe(false);
    expect(canUseAcademicModel(resolveAcademicPlanTier(balanceFor('free')), 1)).toBe(true);
  });
  test('single academic execution rejects top-tier models before upstream or balance spending', async () => {
    const service = academicFor({ ...balanceFor('plus'), model4Count: 999, drawMjCount: 999 });
    await rejectsPlan(service.academicChatProcess({ prompt: 'Synthetic prompt', model: 'synthetic-model-3', options: {} }, req(), {}));
    expect(service.userBalanceService.validateBalance).not.toHaveBeenCalled();
  });
  test('workflow execution rejects a top-tier model before any stage starts', async () => {
    const balance = balanceFor('pro');
    const service = academicFor(balance);
    service.ensureAcademicWorkflowMember = jest.fn(async () => balance);
    service.normalizeAcademicWorkflowSteps = jest.fn(() => [{ kind: 'core', name: 'Synthetic step' }]);
    service.assertAcademicWorkflowAccess = jest.fn();
    await rejectsPlan(service.academicWorkflowProcess({ prompt: 'Synthetic prompt', model: 'synthetic-model-3', options: {} }, req(), {}));
    expect(service.userBalanceService.validateBalance).not.toHaveBeenCalled();
  });
  test('a downgraded workflow rechecks each model admission', async () => {
    const service = academicFor(balanceFor('max'));
    await expect(service.assertAcademicModelAccess(1, model(3))).resolves.toBeDefined();
    service.userBalanceService.queryUserBalance.mockResolvedValue(balanceFor('plus'));
    await rejectsPlan(service.assertAcademicModelAccess(1, model(3)));
  });
  test('fallback cannot choose an unauthorized or more expensive deduction bucket', async () => {
    const service = academicFor(balanceFor('plus'));
    service.modelsService.getAllKey.mockReturnValue([{ ...model(3), modelName: 'gpt-5-nano', model: 'gpt-5-nano' }, { ...model(2), modelName: 'gpt-5-mini', model: 'gpt-5-mini' }, { ...model(1), modelName: 'gpt-4o-mini', model: 'gpt-4o-mini' }]);
    const fallback = await service.resolveAcademicRuntimeFallbackModelInfo({ ...model(1), model: 'synthetic-main' }, 'plus');
    expect(fallback?.deductType === 1).toBe(true);
    const maxFallback = await service.resolveAcademicRuntimeFallbackModelInfo({ ...model(1), model: 'synthetic-main' }, 'max');
    expect(maxFallback?.deductType === 1).toBe(true);
  });
  test('legacy text API cannot spend stored advanced credit to bypass Plus', async () => {
    const service: any = Object.create(ChatService.prototype);
    service.logger = { warn: jest.fn(), error: jest.fn(), debug: jest.fn(), log: jest.fn() };
  service.userBalanceService = {
    checkUserCertification: jest.fn().mockResolvedValue(undefined), queryUserBalance: jest.fn(async () => ({ ...balanceFor('plus'), model4Count: 999 })), validateBalance: jest.fn() };
    service.userService = { checkUserCertification: jest.fn(), checkUserStatus: jest.fn() };
    service.globalConfigService = { getConfigs: jest.fn(async () => ({ openaiBaseModel: 'synthetic-model-2' })) };
    service.autoReplyService = { checkAutoReply: jest.fn(async () => null) };
    service.badWordsService = { checkBadWords: jest.fn() };
    service.modelsService = { getCurrentModelKeyInfo: jest.fn(async () => model(2)) };
    await rejectsPlan(service.chatProcess({ prompt: 'Synthetic prompt', model: 'synthetic-model-2', extraParam: '{}', options: { groupId: 1 } }, req(), { setHeader: jest.fn(), status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis(), write: jest.fn(), end: jest.fn() }));
    expect(service.userBalanceService.validateBalance).not.toHaveBeenCalled();
  });
  test('unconfigured auxiliary text model is denied without changing the primary content', async () => {
    const helper: any = Object.create(OpenAIChatService.prototype);
    helper.globalConfigService = { getConfigs: jest.fn(async () => ({ openaiBaseModel: 'synthetic-unconfigured' })) };
    helper.modelsService = { getCurrentModelKeyInfo: jest.fn(async () => null) };
    await rejectsPlan(helper.chatFree('Synthetic prompt', undefined, undefined, undefined, 'max'));
    const service: any = Object.create(ChatService.prototype);
    service.extractImageUrls = jest.fn(() => ['https://synthetic.invalid/image.png']);
    service.readImageDataUri = jest.fn().mockResolvedValue('data:image/png;base64,c3ludGhldGljLWltYWdl');
    service.openAIChatService = helper;
    const content = 'Synthetic primary content';
    await expect(service.prependGlobalImageSummary(content, 'synthetic-image', 7, 'plus')).resolves.toBe(content);
  });
});


describe('model admission compatibility', () => {
  test('disabled text models are denied even on Max', async () => {
    const service = academicFor(balanceFor('max'));
    await rejectsPlan(service.assertAcademicModelAccess(1, { ...model(1), status: 0 }));
    expect(service.userBalanceService.validateBalance).not.toHaveBeenCalled();
  });

  test('an expired package cannot use remaining top-tier credit', async () => {
    const service = academicFor({ ...balanceFor('max'), expirationTime: '2000-01-01', drawMjCount: 999 });
    await rejectsPlan(service.assertAcademicModelAccess(1, model(3)));
    expect(service.userBalanceService.validateBalance).not.toHaveBeenCalled();
  });

  test('runtime fallback may use a lower authorized deduction bucket', async () => {
    const service = academicFor(balanceFor('max'));
    service.modelsService.getAllKey.mockReturnValue([{ ...model(1), model: 'gpt-4o-mini', modelName: 'gpt-4o-mini' }]);
    const fallback = await service.resolveAcademicRuntimeFallbackModelInfo({ ...model(3), model: 'synthetic-main' }, 'max');
    expect(fallback?.deductType).toBe(1);
  });

  test('the existing DeepSeek no-replacement contract is preserved', async () => {
    const service = academicFor(balanceFor('max'));
    service.modelsService.getAllKey.mockReturnValue([{ ...model(1), model: 'gpt-4o-mini', modelName: 'gpt-4o-mini' }]);
    const fallback = await service.resolveAcademicRuntimeFallbackModelInfo({ ...model(3), model: 'deepseek-v3.2' }, 'max');
    expect(fallback).toBeNull();
  });
});
