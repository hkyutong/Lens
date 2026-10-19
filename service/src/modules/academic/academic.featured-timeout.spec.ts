import { AcademicService } from './academic.service';

declare const describe: any;
declare const it: any;
declare const expect: any;

describe('featured research execution boundaries', () => {
  const service = new (AcademicService as any)();

  it.each([
    'Lens｜研究设计体检',
    'Lens｜审稿意见应答',
    'Lens｜文献检索策略',
    'Lens｜整理研究笔记',
    'Lens｜比较多篇论文',
    'Lens｜生成教学材料',
    'Lens｜研究问题拆解',
    'Lens｜文献综述工作台',
    'Lens｜研究方案设计',
  ])('gives buffered task %s the bounded long task execution policy', (name) => {
    expect(
      service.isLongRunningAcademicPlugin(service.normalizePluginName(name)),
    ).toBe(true);
  });

  it('does not extend ordinary conversational execution', () => {
    expect(service.isLongRunningAcademicPlugin('普通对话')).toBe(false);
  });

  it('does not persist a preparation message as a completed research result', () => {
    expect(
      service.isMeaningfulAcademicContent('正在生成结构化结果...'),
    ).toBe(false);
  });

  it('does not treat an unchanged preparation message as model progress', () => {
    expect(
      service.shouldKeepAcademicStreamAlive(
        JSON.stringify({
          content: [{ type: 'text', text: '正在生成结构化结果...' }],
        }),
      ),
    ).toBe(false);
  });

  it('retains a substantive report that discusses the preparation phase', () => {
    expect(
      service.isMeaningfulAcademicContent(
        '## 研究方案\n本研究采用两组前后测设计，逐周实施形成性反馈，并核验量表、样本量和伦理要求。研究团队正在生成结构化结果...后续将独立复核。',
      ),
    ).toBe(true);
  });
});


describe('featured research generation placeholder', () => {
  it('retains a substantive report containing the generation status', () => {
    const service = Object.create(AcademicService.prototype) as any;
    const report = '# 研究方案\n\n界面曾显示“正在生成并核验研究结果…”。\n\n## 研究方法\n采用聚类随机设计，并调整基线测量。';

    expect(service.isAcademicPlaceholderContent(report)).toBe(false);
    expect(service.isAcademicHeartbeatText(report)).toBe(false);
    expect(service.isMeaningfulAcademicContent(report)).toBe(true);
  });


  it('rejects the featured generation status as a completed research result', () => {
    const service = Object.create(AcademicService.prototype) as any;
    const pending = '正在生成并核验研究结果…';

    expect({
      placeholder: service.isAcademicPlaceholderContent(pending),
      heartbeat: service.isAcademicHeartbeatText(pending),
      meaningful: service.isMeaningfulAcademicContent(pending),
    }).toEqual({ placeholder: true, heartbeat: true, meaningful: false });
    expect(service.isAcademicEmptyFailureState({
      fullContent: pending,
      stablePolishContent: '',
      finishReason: 'stop',
      streamError: '',
      fileVectorResult: [],
    }, pending)).toBe(true);
  });
});

describe('featured research failure contract', () => {
  const failureMessages = [
    '特色能力暂时无法完成，请稍后重试。',
    '结果未通过结构与来源校验，请重试或补充材料。',
  ];

  it.each(failureMessages)('rejects %s as a completed report', message => {
    const service = Object.create(AcademicService.prototype) as any;
    expect(service.isMeaningfulAcademicContent(message)).toBe(false);
    expect(service.isAcademicEmptyFailureState({
      fullContent: message, stablePolishContent: '', finishReason: 'stop',
      streamError: '', fileVectorResult: '',
    }, message)).toBe(true);
  });

  it.each(failureMessages)('retains a report discussing the notice %s', message => {
    const service = Object.create(AcademicService.prototype) as any;
    const report = `# Synthetic research report\n\nThe study compares two proposed interventions.\n\nThe interface previously showed “${message}”.`;
    expect(service.isMeaningfulAcademicContent(report)).toBe(true);
  });

  it.each(['Lens｜研究方案设计', 'Lens｜研究设计体检', 'Lens｜审稿意见应答', 'Lens｜文献检索策略',
    'Lens｜整理研究笔记', 'Lens｜比较多篇论文', 'Lens｜生成教学材料', 'Lens｜研究问题拆解', 'Lens｜文献综述工作台',
  ])('keeps %s retries inside the featured task pipeline', name => {
    const service = Object.create(AcademicService.prototype) as any;
    expect(service.canRetryAcademicAtGateway({ function: 'plugin', plugin_name: name })).toBe(false);
  });

  it.each([
    { function: 'basic', plugin_name: 'Lens｜研究方案设计' },
    { function: 'plugin', plugin_name: 'Synthetic ordinary plugin' },
  ])('preserves other gateway retry policies', payload => {
    const service = Object.create(AcademicService.prototype) as any;
    expect(service.canRetryAcademicAtGateway(payload)).toBe(true);
  });

  it('does not repeat a failed featured task through another model', async () => {
    const service = Object.create(AcademicService.prototype) as any;
    service.userBalanceService = {
      queryUserBalance: async () => { throw new Error('unexpected balance/model access'); },
    };
    const result = await service.tryAcademicRuntimeFallback(
      { function: 'plugin', plugin_name: 'Lens｜研究方案设计' }, new AbortController().signal,
      {}, {}, 'synthetic-request', 1, 'chat',
    );
    expect(result).toBe(null);
  });

  it('preserves runtime model recovery for ordinary requests', async () => {
    const service = Object.create(AcademicService.prototype) as any;
    let modelRequests = 0;
    service.logger = { warn: () => {} };
    service.userBalanceService = { queryUserBalance: async () => ({}) };
    service.resolveAcademicRuntimeFallbackModelInfo = async () => ({ model: 'synthetic-model' });
    service.assertAcademicModelAccess = async () => {};
    service.applyAcademicRuntimeModel = () => {};
    service.collectAcademicStreamState = async () => {
      modelRequests += 1;
      return { fullContent: '# Synthetic report\n\nA complete proposed research method.', fullReasoning: '',
        stablePolishContent: '', fileVectorResult: '', streamError: '', finishReason: 'stop' };
    };
    const result = await service.tryAcademicRuntimeFallback(
      { function: 'basic' }, new AbortController().signal, {},
      { fullContent: '', fullReasoning: '', stablePolishContent: '', fileVectorResult: '',
        streamError: 'synthetic failure', finishReason: 'error' }, 'synthetic-request', 1, 'chat',
    );
    expect(modelRequests).toBe(1);
    expect(result.content).toContain('Synthetic report');
  });
});
