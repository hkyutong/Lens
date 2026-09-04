export interface TextStreamReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>
}

export interface TextStreamBody {
  getReader(): TextStreamReader
}

/**
 * 将 Fetch ReadableStream 稳定地消费为文本。
 * 网络分片可能切断 UTF-8 字符，必须由同一个 TextDecoder 保持上下文，
 * 并在 done 后 flush，才能保证尾部字节不会丢失。
 */
export const readTextStream = async (
  body: TextStreamBody | null | undefined,
  onChunk?: (chunk: string) => void
) => {
  if (!body) throw new Error('Failed to get reader from response')

  const reader = body.getReader()
  const decoder = new TextDecoder()
  let responseText = ''

  const publish = (chunk: string) => {
    if (!chunk) return
    responseText += chunk
    try {
      onChunk?.(chunk)
    } catch (error) {
      // 展示层回调不能改变网络读取结果，也不能伪装成请求失败。
      console.error('[readTextStream] onChunk error:', error)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      publish(decoder.decode())
      return responseText
    }
    publish(decoder.decode(value, { stream: true }))
  }
}
