import { EventEmitter } from 'events';
import { startAcademicResponseHeartbeat } from './academic.response-heartbeat';

declare const describe: any;
declare const it: any;
declare const expect: any;
declare const jest: any;
declare const afterEach: any;

class SyntheticResponse extends EventEmitter {
  writableEnded = false;
  destroyed = false;
  chunks: string[] = [];
  flushes = 0;

  write(chunk: string) {
    this.chunks.push(chunk);
    return true;
  }

  flush() {
    this.flushes += 1;
  }
}

describe('academic response heartbeat', () => {
  afterEach(() => jest.useRealTimers());

  it('keeps an idle research response active beyond the observed proxy deadline', () => {
    jest.useFakeTimers();
    const response = new SyntheticResponse();
    const stop = startAcademicResponseHeartbeat(response);
    jest.advanceTimersByTime(130_000);

    expect(response.chunks.length).toBeGreaterThan(1);
    expect(response.flushes).toBe(response.chunks.length);
    for (const chunk of response.chunks) {
      const frame = JSON.parse(chunk.trim());
      expect(Object.keys(frame)).toEqual(['thinkingPreview']);
      expect(frame.thinkingPreview).toBe('正在生成并核验研究结果…');
    }
    stop();
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(['finish', 'close', 'error'])('cleans up on response %s', event => {
    jest.useFakeTimers();
    const response = new SyntheticResponse();
    const stop = startAcademicResponseHeartbeat(response);
    response.emit(event);
    jest.advanceTimersByTime(130_000);

    expect(response.chunks).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
    expect(response.listenerCount('finish')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
    expect(response.listenerCount('error')).toBe(0);
    stop();
  });

  it.each(['writableEnded', 'destroyed'])('does not write after %s', property => {
    jest.useFakeTimers();
    const response = new SyntheticResponse();
    startAcademicResponseHeartbeat(response);
    response[property] = true;
    jest.advanceTimersByTime(30_000);

    expect(response.chunks).toEqual([]);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('contains write failures and releases the timer', () => {
    jest.useFakeTimers();
    const response = new SyntheticResponse();
    response.write = () => {
      throw new Error('synthetic transport failure');
    };
    startAcademicResponseHeartbeat(response);

    expect(() => jest.advanceTimersByTime(30_000)).not.toThrow();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('stops one request without affecting another', () => {
    jest.useFakeTimers();
    const first = new SyntheticResponse();
    const second = new SyntheticResponse();
    const stopFirst = startAcademicResponseHeartbeat(first);
    const stopSecond = startAcademicResponseHeartbeat(second);
    stopFirst();
    stopFirst();
    jest.advanceTimersByTime(30_000);

    expect(first.chunks).toEqual([]);
    expect(second.chunks.length).toBeGreaterThan(0);
    stopSecond();
    expect(jest.getTimerCount()).toBe(0);
  });
});
