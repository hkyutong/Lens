import { AcademicService } from './academic.service';
import * as fs from 'fs';
import * as path from 'path';

declare function describe(name: string, fn: () => void): void;
declare function it(name: string, fn: () => void): void;
declare function expect(value: unknown): {
  toEqual(expected: unknown): void;
  toBe(expected: unknown): void;
};

describe('academic structured output integrity', () => {
  function streamState() {
    return {
      fullContent: '', hasStreamContent: false, tracebackMode: false,
      fullReasoning: '', stablePolishContent: '', fileVectorResult: '',
      networkSearchResult: '', promptReference: '', toolCalls: '',
      streamError: '', finishReason: '',
    };
  }

  it('preserves every research-plan step and the complete JSON envelope', () => {
    const rows = [1, 2, 3].map((stepId) => ({
      step_id: stepId,
      task: 'Define a proposed study step',
      deliverable: 'A reviewable protocol draft',
      criterion: 'The question and outcomes are specified',
      depends_on: stepId === 1 ? [] : [stepId - 1],
      status: 'proposal',
      refs: [],
    }));
    const expected = { rows };
    const service = Object.create(AcademicService.prototype) as any;

    const result = service.sanitizeAcademicOutput(JSON.stringify(expected, null, 2));

    expect(JSON.parse(result)).toEqual(expected);
  });

  it('retains JSON delimiters when an answer arrives in separate deltas', () => {
    const service = Object.create(AcademicService.prototype) as any;
    const input = JSON.stringify({
      rows: [{ step_id: 1, task: 'Define the proposed study', status: 'proposal', refs: [] }],
    }, null, 2);
    const chunks = input.match(/[\s\S]{1,47}/g) || [];

    const result = chunks.map((chunk) => service.sanitizeAcademicDelta(chunk)).join('');

    expect(JSON.parse(result)).toEqual(JSON.parse(input));
  });

  it('retains a final JSON closing delimiter delta', () => {
    const service = Object.create(AcademicService.prototype) as any;

    expect(service.sanitizeAcademicDelta('\n  ]\n}').replace(/\s/g, '')).toBe(']}');
  });

  it('retains the structured envelope when normalizing an outbound snapshot', () => {
    const service = Object.create(AcademicService.prototype) as any;
    const expected = { rows: [{ step_id: 1, task: 'Specify the protocol', status: 'proposal', refs: [] }] };

    const result = service.normalizeAcademicOutboundChunk(JSON.stringify(expected, null, 2));

    expect(JSON.parse(result)).toEqual(expected);
  });

  it('reconstructs a structured answer from transport content frames', () => {
    const service = Object.create(AcademicService.prototype) as any;
    const expected = { rows: [{ step_id: 1, task: 'Specify the protocol', status: 'proposal', refs: [] }] };
    const input = JSON.stringify(expected, null, 2);
    const state = streamState();

    for (const content of input.match(/[\s\S]{1,47}/g) || []) {
      service.consumeAcademicLine(JSON.stringify({ content: [{ text: content }] }), state);
    }

    expect(JSON.parse(state.fullContent)).toEqual(expected);
  });

  it('retains closing delimiters in a final transport content frame', () => {
    const service = Object.create(AcademicService.prototype) as any;
    const expected = { rows: [{ task: 'Specify the protocol' }] };
    const input = JSON.stringify(expected, null, 2);
    const closingIndex = input.lastIndexOf(']');
    const state = streamState();

    service.consumeAcademicLine(JSON.stringify({ content: [{ text: input.slice(0, closingIndex) }] }), state);
    service.consumeAcademicLine(JSON.stringify({ content: [{ text: input.slice(closingIndex) }] }), state);

    expect(JSON.parse(state.fullContent)).toEqual(expected);
  });

  it('does not deduplicate repeated words in native content deltas', () => {
    const service = Object.create(AcademicService.prototype) as any;
    const state = streamState();
    for (const content of ['ha', 'ha']) {
      service.consumeAcademicLine(JSON.stringify({ content: [{ text: content }] }), state);
    }
    expect(state.fullContent).toBe('haha');
  });

  it('preserves an OpenAI delta containing repeated closing braces', () => {
    const service = Object.create(AcademicService.prototype) as any;
    const state = streamState();
    for (const content of ['{"study":{"count":24', '}', '}']) {
      service.consumeAcademicLine(JSON.stringify({ choices: [{ delta: { content } }] }), state);
    }
    expect(JSON.parse(state.fullContent)).toEqual({ study: { count: 24 } });
  });

  it('uses a complete final snapshot without deduplicating its suffix', () => {
    const service = Object.create(AcademicService.prototype) as any;
    const state = streamState();
    service.consumeAcademicLine(JSON.stringify({ choices: [{ content: '{"study":{"count":24}' }] }), state);
    service.consumeAcademicLine(JSON.stringify({ finalContent: '{"study":{"count":24}}' }), state);
    expect(JSON.parse(state.fullContent)).toEqual({ study: { count: 24 } });
  });

  it('keeps legacy cumulative response frames compatible', () => {
    const service = Object.create(AcademicService.prototype) as any;
    const state = streamState();
    for (const response of ['A proposed study', 'A proposed study with a clear outcome']) {
      service.consumeAcademicLine(JSON.stringify({ response }), state);
    }
    expect(state.fullContent).toBe('A proposed study with a clear outcome');
  });

  it('replaces the previous native answer on a reset frame', () => {
    const service = Object.create(AcademicService.prototype) as any;
    const state = streamState();
    service.consumeAcademicLine(JSON.stringify({ choices: [{ content: 'First draft' }] }), state);
    service.consumeAcademicLine(JSON.stringify({ resetContent: true, choices: [{ content: 'Revised draft' }] }), state);
    expect(state.fullContent).toBe('Revised draft');
  });

  it('filters transport-only metadata and placeholder content', () => {
    const service = Object.create(AcademicService.prototype) as any;
    const state = streamState();
    service.consumeAcademicLine(JSON.stringify({ userBalance: 12, chatId: 42 }), state);
    service.consumeAcademicLine(JSON.stringify({ choices: [{ content: '[Local Message] waiting gpt response.' }] }), state);
    expect(state.fullContent).toBe('');
  });

  it('preserves Markdown paragraphs and table boundaries in native deltas', () => {
    const service = Object.create(AcademicService.prototype) as any;
    const state = streamState();
    const chunks = ['# Study\n', '\n', '| Step | Result |\n', '| --- | --- |\n', '| Design | Proposed |\n'];
    for (const text of chunks) {
      service.consumeAcademicLine(JSON.stringify({ content: [{ text }] }), state);
    }
    expect(state.fullContent).toBe(chunks.join(''));
  });

  it('still unwraps nested transport content instead of exposing metadata', () => {
    const service = Object.create(AcademicService.prototype) as any;
    const state = streamState();
    const nested = JSON.stringify({ choices: [{ delta: { content: 'A proposed study' } }], userBalance: 12 });
    service.consumeAcademicLine(JSON.stringify({ content: [{ text: nested }] }), state);
    expect(state.fullContent).toBe('A proposed study');
  });

  it('redacts synthetic file paths and traceback details from native content', () => {
    const service = Object.create(AcademicService.prototype) as any;
    const state = streamState();
    service.consumeAcademicLine(JSON.stringify({ content: [{ text: '/tmp/synthetic-study/private.txt' }] }), state);
    service.consumeAcademicLine(JSON.stringify({ content: [{ text: 'Traceback (most recent call last):\nFile "/tmp/synthetic-study/worker.py", line 7' }] }), state);
    expect(state.fullContent.includes('/tmp/synthetic-study')).toBe(false);
    expect(state.fullContent.includes('Traceback')).toBe(false);
  });

  it('preserves a completed answer when an older final snapshot arrives', () => {
    const service = Object.create(AcademicService.prototype) as any;
    const state = streamState();
    service.consumeAcademicLine(JSON.stringify({ content: [{ text: 'A complete proposed study' }] }), state);
    service.consumeAcademicLine(JSON.stringify({ full_content: 'A complete' }), state);
    expect(state.fullContent).toBe('A complete proposed study');
  });

  it('retains an error state without adding traceback details to the answer', () => {
    const service = Object.create(AcademicService.prototype) as any;
    const state = streamState();
    service.consumeAcademicLine(JSON.stringify({ finishReason: 'error',
      error: 'Request timeout. Traceback (most recent call last):\nFile "/tmp/synthetic-study/worker.py", line 7' }), state);
    expect(state.fullContent).toBe('');
    expect(state.streamError.length > 0).toBe(true);
    expect(state.streamError.includes('/tmp/synthetic-study')).toBe(false);
    expect(state.streamError.includes('Traceback')).toBe(false);
  });

  it('preserves all steps in a validated research-plan Markdown report', () => {
    const service = Object.create(AcademicService.prototype) as any;
    const file = path.resolve(__dirname, '../../..', 'test-fixtures', 'academic-synthetic-plan.md');
    const report = fs.readFileSync(file, 'utf8');
    const result = service.sanitizeAcademicOutput(report);
    const stepRows = result.split('\n').filter((line: string) => /^\s*\|\s*\d+\s*\|/.test(line));

    expect(stepRows.length).toBe(3);
    expect(result.includes('Protocol draft')).toBe(true);
    expect(result.includes('Recording sheet')).toBe(true);
  });
});
