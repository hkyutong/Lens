declare const jest: any;
declare const describe: any;
declare const it: any;
declare const expect: any;
declare const beforeEach: any;
declare const afterEach: any;

import { Logger } from '@nestjs/common';
import { OpenAI } from 'openai';
import { ChatService } from './chat.service';

jest.mock('openai', () => ({ OpenAI: jest.fn() }));
jest.mock('../../common/utils/packageEntitlements', () => ({
  isPackageModelAllowed: () => true,
}));
jest.mock('@/common/utils', () => ({
  getTokenCount: jest.fn().mockResolvedValue(0),
  removeThinkTags: (text: string) => text,
  formatUrl: (url: string) => url,
  correctApiBaseUrl: (url: string) => Promise.resolve(url),
  getClientIp: () => 'synthetic',
  convertUrlToBase64: jest.fn(() => {
    throw new Error('remote reads are forbidden');
  }),
}));

describe('chat private media ownership', () => {
  const ownerId = 701;
  const ref = 'attachment:00000000-0000-4000-8000-000000000001';
  const bytes = Buffer.from('synthetic image bytes');
  let service: ChatService;
  let readOwnedAttachment: any;
  let chatFree: any;

  beforeEach(() => {
    jest.spyOn(Logger, 'debug').mockImplementation(() => undefined);
    jest.spyOn(Logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn(Logger, 'error').mockImplementation(() => undefined);
    service = Object.create(ChatService.prototype);
    readOwnedAttachment = jest.fn().mockResolvedValue({
      buffer: bytes,
      filename: 'synthetic.png',
      contentType: 'image/png',
    });
    chatFree = jest.fn().mockResolvedValue('Synthetic image description.');
    Object.assign(service, {
      attachmentService: { readOwnedAttachment },
      openAIChatService: { chatFree },
    });
  });

  afterEach(() => jest.restoreAllMocks());

  const history = () => ({
    chatHistory: jest.fn().mockResolvedValue([
      {
        id: 1,
        role: 'user',
        content: 'Describe this synthetic image.',
        imageUrl: ref,
        createdAt: new Date(0),
      },
    ]),
  });

  it('uses owner-checked bytes for native vision regardless of URL conversion settings', async () => {
    for (const isConvertToBase64 of ['0', '1']) {
      const result = await service.buildMessageFromParentMessageId(
        { groupId: 2, userId: ownerId, isImageUpload: 2, isConvertToBase64 },
        history(),
      );
      expect(readOwnedAttachment).toHaveBeenCalledWith(ref, ownerId);
      expect(result.messagesHistory[0].content).toEqual([
        { type: 'text', text: 'Describe this synthetic image.' },
        {
          type: 'image_url',
          image_url: { url: `data:image/png;base64,${bytes.toString('base64')}` },
        },
      ]);
    }
  });

  it('uses owner-checked bytes for global image summaries', async () => {
    const result = await service.buildMessageFromParentMessageId(
      { groupId: 2, userId: ownerId, isImageUpload: 3, modelAccessTier: 'plus' },
      history(),
    );
    expect(readOwnedAttachment).toHaveBeenCalledWith(ref, ownerId);
    expect(chatFree).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      undefined,
      `data:image/png;base64,${bytes.toString('base64')}`,
      'plus',
      undefined,
    );
    expect(result.messagesHistory[0].content).toContain('Synthetic image description.');
  });

  it('does not expose an attachment reference for legacy text image mode', async () => {
    const result = await service.buildMessageFromParentMessageId(
      { groupId: 2, userId: ownerId, isImageUpload: 1, modelAccessTier: 'plus' },
      history(),
    );
    expect(readOwnedAttachment).toHaveBeenCalledWith(ref, ownerId);
    expect(result.messagesHistory[0].content).not.toContain(ref);
  });

  it('never falls back to a URL when attachment ownership fails', async () => {
    readOwnedAttachment.mockRejectedValue(new Error('synthetic access denial'));
    for (const isImageUpload of [1, 2, 3]) {
      await expect(service.buildMessageFromParentMessageId(
        { groupId: 2, userId: ownerId, isImageUpload },
        history(),
      )).rejects.toThrow('Attachment unavailable');
      expect(readOwnedAttachment).toHaveBeenCalledWith(ref, ownerId);
    }
    expect(chatFree).not.toHaveBeenCalled();
  });

  it('rejects media with a non-image content type before provider dispatch', async () => {
    readOwnedAttachment.mockResolvedValue({
      buffer: Buffer.from('synthetic text'),
      filename: 'synthetic.txt',
      contentType: 'text/plain',
    });
    await expect(service.buildMessageFromParentMessageId(
      { groupId: 2, userId: ownerId, isImageUpload: 2 },
      history(),
    )).rejects.toThrow('Attachment unavailable');
    expect(chatFree).not.toHaveBeenCalled();
  });

  it('keeps ordinary history working without an attachment lookup', async () => {
    const logs = history();
    logs.chatHistory.mockResolvedValue([
      { id: 1, role: 'user', content: 'Synthetic plain message.', createdAt: new Date(0) },
    ]);
    const result = await service.buildMessageFromParentMessageId(
      { groupId: 2, userId: ownerId, isImageUpload: 2 },
      logs,
    );
    expect(result.messagesHistory).toEqual([{ role: 'user', content: 'Synthetic plain message.' }]);
    expect(readOwnedAttachment).not.toHaveBeenCalled();
  });

  const configureTts = (chatLog: any = { id: 42, userId: ownerId }) => {
    const storePrivateAttachment = jest.fn().mockResolvedValue(ref);
    const findOneChatLog = jest.fn().mockResolvedValue(chatLog);
    const updateChatLog = jest.fn().mockResolvedValue(undefined);
    const validateBalance = jest.fn().mockResolvedValue(undefined);
    const deductFromBalance = jest.fn().mockResolvedValue(undefined);
    const speechCreate = jest.fn().mockResolvedValue({
      arrayBuffer: async () => Buffer.from('synthetic speech bytes'),
    });
    (OpenAI as any).mockImplementation(() => ({ audio: { speech: { create: speechCreate } } }));
    Object.assign(service, {
      attachmentService: { readOwnedAttachment, storePrivateAttachment },
      chatLogService: { findOneChatLog, updateChatLog },
      modelsService: {
        getCurrentModelKeyInfo: jest.fn().mockResolvedValue({
          key: 'synthetic-key', proxyUrl: 'https://models.example.test', deduct: 1, deductType: 1, timeout: 1,
        }),
      },
      globalConfigService: { getConfigs: jest.fn().mockResolvedValue({}) },
      userBalanceService: { validateBalance, deductFromBalance },
      resolveTextModelAccessBalance: jest.fn().mockResolvedValue({ packageEntitlements: undefined }),
    });
    const response = { status: jest.fn().mockReturnThis(), send: jest.fn() };
    return { storePrivateAttachment, findOneChatLog, updateChatLog, validateBalance, deductFromBalance, speechCreate, response };
  };

  it('stores TTS as a private attachment of the verified chat owner', async () => {
    const tts = configureTts();
    await service.ttsProcess({ chatId: 42, prompt: 'Synthetic speech.' }, { user: { id: ownerId } }, tts.response);
    expect(tts.findOneChatLog).toHaveBeenCalledWith(42);
    expect(tts.storePrivateAttachment).toHaveBeenCalledWith(
      Buffer.from('synthetic speech bytes'), { filename: 'speech.mp3', contentType: 'audio/mpeg' }, ownerId,
    );
    expect(tts.updateChatLog).toHaveBeenCalledWith(42, { ttsUrl: ref });
    expect(tts.deductFromBalance).toHaveBeenCalledWith(ownerId, 1, 1);
    expect(tts.response.send).toHaveBeenCalledWith({ ttsUrl: ref });
  });

  it('rejects TTS for another owner before charging, writing, or provider access', async () => {
    const tts = configureTts({ id: 42, userId: ownerId + 1 });
    await expect(service.ttsProcess(
      { chatId: 42, prompt: 'Synthetic speech.' }, { user: { id: ownerId } }, tts.response,
    )).rejects.toThrow('Attachment unavailable');
    for (const operation of [tts.storePrivateAttachment, tts.updateChatLog, tts.validateBalance, tts.deductFromBalance, tts.speechCreate]) {
      expect(operation).not.toHaveBeenCalled();
    }
  });

  it('rejects TTS without identity or a valid chat id before any side effect', async () => {
    const tts = configureTts();
    for (const [request, chatId] of [[{}, 42], [{ user: { id: ownerId } }, undefined], [{ user: { id: 0 } }, 42]]) {
      await expect(service.ttsProcess({ chatId, prompt: 'Synthetic speech.' }, request, tts.response))
        .rejects.toThrow('Attachment unavailable');
    }
    for (const operation of [tts.findOneChatLog, tts.storePrivateAttachment, tts.updateChatLog, tts.deductFromBalance, tts.speechCreate]) {
      expect(operation).not.toHaveBeenCalled();
    }
  });
});


describe('optional vision summary boundaries', () => {
  const prompt = 'Synthetic research question';
  const reference = 'attachment:11111111-1111-4111-8111-111111111111';

  it('propagates private attachment rejection before optional model work', async () => {
    const service = Object.create(ChatService.prototype) as any;
    const denied = new Error('synthetic attachment denied');
    service.extractImageUrls = jest.fn().mockReturnValue([reference]);
    service.readImageDataUri = jest.fn().mockRejectedValue(denied);
    service.openAIChatService = { chatFree: jest.fn() };

    await expect(service.prependGlobalImageSummary(prompt, reference, 7, 'plus')).rejects.toBe(denied);
    expect(service.openAIChatService.chatFree).not.toHaveBeenCalled();
  });

  it('keeps the original prompt when an authorized optional model is unavailable', async () => {
    const service = Object.create(ChatService.prototype) as any;
    service.extractImageUrls = jest.fn().mockReturnValue([reference]);
    service.readImageDataUri = jest.fn().mockResolvedValue('data:image/png;base64,c3ludGhldGljLWltYWdl');
    service.openAIChatService = { chatFree: jest.fn().mockRejectedValue(new Error('synthetic model unavailable')) };

    await expect(service.prependGlobalImageSummary(prompt, reference, 7, 'plus')).resolves.toBe(prompt);
    expect(service.readImageDataUri).toHaveBeenCalledWith(reference, 7);
    expect(service.openAIChatService.chatFree).toHaveBeenCalledTimes(1);
  });
});
