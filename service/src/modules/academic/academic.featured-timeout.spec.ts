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
