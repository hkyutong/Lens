import { compression } from 'vite-plugin-compression2'
import type { PluginOption } from 'vite'

export default function createCompression(env, isBuild) {
  const plugin: (PluginOption | PluginOption[])[] = []
  if (isBuild) {
    const compressList = String(env?.VITE_BUILD_COMPRESS || '')
      .split(',')
      .map((item: string) => item.trim())
      .filter(Boolean)

    if (compressList.length === 0) {
      return plugin
    }

    if (compressList.includes('gzip')) {
      plugin.push(
        compression(),
      )
    }
    if (compressList.includes('brotli')) {
      plugin.push(
        compression({
          exclude: [/\.(br)$/, /\.(gz)$/],
          algorithm: 'brotliCompress',
        }),
      )
    }
  }
  return plugin
}
