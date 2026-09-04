export interface NdjsonLine {
  value: string
  appendLineBreak: boolean
}

export type NdjsonLineHandler = (line: NdjsonLine) => void

/**
 * 增量解码 Lens 学术服务与历史会话接口的 NDJSON/SSE 兼容响应。
 *
 * 网络分片与逻辑消息边界没有一一对应关系，因此这里仅负责 framing：
 * 不解析业务字段、不吞掉尾部残片，把业务语义留给上层 reducer。
 */
export class NdjsonStreamDecoder {
  private buffer = ''

  constructor(private readonly onLine: NdjsonLineHandler) {}

  push(chunk: string) {
    if (!chunk) return
    this.buffer += chunk

    let newlineIndex = this.buffer.indexOf('\n')
    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex)
      this.buffer = this.buffer.slice(newlineIndex + 1)
      this.onLine({ value: line, appendLineBreak: true })
      newlineIndex = this.buffer.indexOf('\n')
    }
  }

  flush() {
    const tail = this.buffer
    this.buffer = ''
    if (!tail.trim()) return
    this.onLine({ value: tail, appendLineBreak: false })
  }

  reset() {
    this.buffer = ''
  }
}
