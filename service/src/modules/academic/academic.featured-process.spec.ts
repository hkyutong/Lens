import { EventEmitter } from 'events';
import { Readable } from 'stream';
import { AcademicService } from './academic.service';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const jest: any;

const FEATURED_PLUGIN = 'Lens｜研究方案设计';
const SYNTHETIC_REPORT = [
  '# 合成研究方案',
  '## 研究问题',
  '比较两种课堂反馈方式对学习参与的影响，明确研究对象和可验证的假设。',
  '## 研究设计',
  '使用合成材料设计分组比较，预先定义样本、测量、分析步骤及局限。',
  '## 伦理与进度',
  '仅使用虚构数据，说明知情同意、数据保护及分阶段研究安排。',
].join('\n\n');

function createHarness(content: string, upstreamResponse?: Response) {
  const service = Reflect.construct(AcademicService, []) as any;
  const req = Object.assign(new EventEmitter(), {
    user: { id: 101 },
    requestId: 'synthetic-featured-process',
    complete: true,
  });
  const chunks: string[] = [];
  const res = Object.assign(new EventEmitter(), {
    writableEnded: false,
    writableFinished: false,
    destroyed: false,
    setHeader: jest.fn(),
    flushHeaders: jest.fn(),
    flush: jest.fn(),
    write: jest.fn((chunk: string) => {
      chunks.push(String(chunk));
      return true;
    }),
    end: jest.fn(() => {
      res.writableEnded = true;
      res.writableFinished = true;
      res.emit('finish');
    }),
  });
  const finished = new Promise<void>(resolve => res.once('finish', resolve));
  const modelInfo = {
    id: 202,
    model: 'synthetic-academic-model',
    modelName: 'Synthetic academic model',
    key: 'synthetic-key-not-a-secret',
    proxyUrl: 'https://academic.invalid',
    maxModelTokens: 4096,
    keyType: 1,
    deduct: 1,
    deductType: 1,
    isTokenBased: false,
    tokenFeeRatio: 1,
  };
  service.logger = {
    log: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  service.userService = { checkUserStatus: jest.fn().mockResolvedValue(true) };
  service.userBalanceService = {
    checkUserCertification: jest.fn().mockResolvedValue(true),
    validateBalance: jest.fn().mockResolvedValue(true),
    deductFromBalance: jest.fn().mockResolvedValue(undefined),
    queryUserBalance: jest.fn().mockResolvedValue({}),
  };
  let nextLogId = 300;
  service.chatLogService = {
    saveChatLog: jest.fn().mockImplementation(async () => ({ id: ++nextLogId })),
    updateChatLog: jest.fn().mockResolvedValue(undefined),
  };
  service.modelsService = { saveUseLog: jest.fn().mockResolvedValue(undefined) };
  service.resolveAcademicModelInfo = jest.fn().mockResolvedValue({ modelInfo });
  service.assertAcademicModelAccess = jest.fn().mockResolvedValue(undefined);
  service.assertAcademicSingleAccess = jest.fn().mockResolvedValue(undefined);
  service.buildAcademicModelEndpoint = jest.fn().mockReturnValue('https://academic.invalid');
  service.resolvePluginName = jest.fn((name: string) => name);
  service.fetchAcademicStream = jest.fn().mockImplementation(async () => ({
    response: upstreamResponse || new Response(
      `${JSON.stringify({ text: content })}\n`,
      { status: 200, headers: { 'Content-Type': 'application/x-ndjson' } },
    ),
  }));

  return {
    service,
    req,
    res,
    chunks,
    finished,
    async run() {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        await service.academicChatProcess(
          {
            prompt: '请根据合成材料生成研究方案。',
            model: modelInfo.model,
            function: 'plugin',
            plugin_name: FEATURED_PLUGIN,
          },
          req,
          res,
        );
        await Promise.race([
          finished,
          new Promise<void>((_, reject) => {
            timeout = setTimeout(() => reject(new Error('synthetic response did not finish')), 3000);
          }),
        ]);
      } finally {
        if (timeout) clearTimeout(timeout);
        if (!res.writableEnded) res.end();
      }
    },
  };
}

function finalStatuses(harness: ReturnType<typeof createHarness>) {
  return harness.service.chatLogService.updateChatLog.mock.calls
    .map(([, update]: [number, { status?: number }]) => update.status)
    .filter((status: number | undefined) => status !== undefined);
}

describe('featured research request persistence and charging', () => {
  it.each([
    '特色能力暂时无法完成，请稍后重试。',
    '结果未通过结构与来源校验，请重试或补充材料。',
  ])('persists a failed task without charging or another upstream request: %s', async content => {
    const harness = createHarness(content);
    await harness.run();

    expect(harness.service.fetchAcademicStream).toHaveBeenCalledTimes(1);
    expect(finalStatuses(harness)).toEqual([4]);
    expect(harness.service.userBalanceService.deductFromBalance).not.toHaveBeenCalled();
    expect(harness.service.modelsService.saveUseLog).not.toHaveBeenCalled();
    expect(harness.chunks.join('')).toContain('"finishReason":"error"');
    expect(harness.service.logger.error.mock.calls).toEqual([]);
    expect(harness.res.end).toHaveBeenCalledTimes(1);
  });

  it('persists a complete report and charges only the successful result', async () => {
    const harness = createHarness(SYNTHETIC_REPORT);
    await harness.run();

    expect(harness.service.fetchAcademicStream).toHaveBeenCalledTimes(1);
    expect(harness.service.logger.error.mock.calls).toEqual([]);
    expect(finalStatuses(harness)).toEqual([3]);
    expect(harness.service.chatLogService.updateChatLog).toHaveBeenCalledWith(
      expect.any(Number),
      expect.objectContaining({ content: SYNTHETIC_REPORT, status: 3 }),
    );
    expect(harness.service.userBalanceService.deductFromBalance).toHaveBeenCalledTimes(1);
    expect(harness.service.modelsService.saveUseLog).toHaveBeenCalledTimes(1);
    expect(harness.chunks.join('')).toContain('"finishReason":"stop"');
    expect(harness.res.end).toHaveBeenCalledTimes(1);
  });

  it('turns an upstream stream read failure into a completed error response', async () => {
    const upstreamBody = new ReadableStream({
      start(controller) {
        setTimeout(() => controller.error(new TypeError('synthetic upstream stream failure')), 10);
      },
    });
    const upstreamResponse = new Response(upstreamBody, {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    });
    const harness = createHarness('', upstreamResponse);
    const uncaught: unknown[] = [];
    const onUncaught = (error: unknown) => uncaught.push(error);
    process.on('uncaughtException', onUncaught);
    try {
      const request = harness.service.academicChatProcess(
        {
          prompt: '请根据合成材料生成研究方案。',
          model: 'synthetic-academic-model',
          function: 'plugin',
          plugin_name: FEATURED_PLUGIN,
        },
        harness.req,
        harness.res,
      );
      await request;
      await Promise.race([
        harness.finished,
        new Promise((_, reject) => setTimeout(() => reject(new Error('synthetic response did not finish')), 300)),
      ]);
    } finally {
      process.off('uncaughtException', onUncaught);
      if (!harness.res.writableEnded) harness.res.end();
    }

    expect(uncaught).toEqual([]);
    expect(harness.res.end).toHaveBeenCalledTimes(1);
    expect(harness.chunks.join('')).toContain('"finishReason":"error"');
    expect(harness.service.userBalanceService.deductFromBalance).not.toHaveBeenCalled();
  });

  it('finalizes only once when an upstream end and error race', async () => {
    const upstreamBody = new EventEmitter() as EventEmitter & { destroyed: boolean };
    upstreamBody.destroyed = false;
    const fromWeb = jest.spyOn(Readable, 'fromWeb').mockReturnValue(upstreamBody as any);
    const harness = createHarness('', { status: 200, body: {} } as any);
    try {
      await harness.service.academicChatProcess(
        {
          prompt: '请根据合成材料生成研究方案。',
          model: 'synthetic-academic-model',
          function: 'plugin',
          plugin_name: FEATURED_PLUGIN,
        },
        harness.req,
        harness.res,
      );
      upstreamBody.emit('end');
      upstreamBody.emit('error', new TypeError('synthetic stream failure after end'));
      await new Promise(resolve => setImmediate(resolve));
    } finally {
      fromWeb.mockRestore();
      if (!harness.res.writableEnded) harness.res.end();
    }

    expect(harness.res.end).toHaveBeenCalledTimes(1);
  });
});
