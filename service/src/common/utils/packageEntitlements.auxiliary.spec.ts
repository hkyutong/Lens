declare const beforeEach: (callback: () => void) => void;
import { HttpException } from '@nestjs/common';
declare const describe: any;
declare const expect: any;
declare const it: any;
declare const jest: any;

jest.mock('openai', () => {
  const create = jest.fn().mockResolvedValue({ choices: [{ message: { content: 'synthetic-output' } }] });
  const client = jest.fn().mockImplementation(() => ({ chat: { completions: { create } } }));
  return { __esModule: true, default: client, OpenAI: client, syntheticCreate: create };
});

import { OpenAIChatService } from '../../modules/aiTool/chat/chat.service';

const create = require('openai').syntheticCreate;
const restricted = { version: 1, allowedModels: ['synthetic-basic'] };

function helper(model = 'synthetic-basic', deductType = 1) {
  const service: any = Object.create(OpenAIChatService.prototype);
  service.globalConfigService = { getConfigs: jest.fn().mockResolvedValue({ "openaiBaseKey": "synthetic-test-key", "openaiBaseUrl": "https://example.invalid", "openaiBaseModel": model }) };
  service.modelsService = { getCurrentModelKeyInfo: jest.fn().mockResolvedValue({ model, modelName: 'synthetic-display', status: true, deductType, keyType: 1, key: 'synthetic-key', proxyUrl: 'https://example.invalid' }) };
  return service;
}

beforeEach(() => create.mockClear());

describe('auxiliary model admission before provider invocation', () => {
  it('allows a canonical configured model under both legacy and explicit policies', async () => {
    create.mockClear();
    const service = helper();
    expect(await service.chatFree('synthetic-prompt', undefined, undefined, undefined, 'free', restricted)).toBe('synthetic-output');
    expect(await service.chatFree('synthetic-prompt', undefined, undefined, undefined, 'free')).toBe('synthetic-output');
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('rejects omitted and empty whitelist choices before contacting the provider', async () => {

  await expect(helper('synthetic-other').chatFree('synthetic-prompt', undefined, undefined, undefined, 'free', restricted)).rejects.toBeInstanceOf(HttpException);
  await expect(helper().chatFree('synthetic-prompt', undefined, undefined, undefined, 'free', { version: 1, allowedModels: [] })).rejects.toBeInstanceOf(HttpException);
  expect(create).not.toHaveBeenCalled();
});

  it('does not grant a higher bucket just because a model is listed', async () => {

  await expect(helper('synthetic-basic', 2).chatFree('synthetic-prompt', undefined, undefined, undefined, 'free', restricted)).rejects.toBeInstanceOf(HttpException);
  expect(create).not.toHaveBeenCalled();
});
});
