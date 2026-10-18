interface AcademicHeartbeatResponse {
  writableEnded: boolean;
  destroyed: boolean;
  write(chunk: string): unknown;
  flush?(): void;
  on(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
}

export function startAcademicResponseHeartbeat(response: AcademicHeartbeatResponse): () => void {
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    response.removeListener('finish', stop);
    response.removeListener('close', stop);
    response.removeListener('error', stop);
  };
  const timer = setInterval(() => {
    if (response.writableEnded || response.destroyed) {
      stop();
      return;
    }
    try {
      response.write(`${JSON.stringify({ thinkingPreview: '正在生成并核验研究结果…' })}\n`);
      response.flush?.();
    } catch {
      stop();
    }
  }, 15_000);
  timer.unref?.();
  response.on('finish', stop);
  response.on('close', stop);
  response.on('error', stop);
  return stop;
}
