import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serviceDir = __dirname
const guardScript = path.join(serviceDir, 'scripts/guard_playwright_policy.mjs')

export default async () => {
  const rs = spawnSync(process.execPath, [guardScript, '--require-local-browser'], {
    cwd: serviceDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    },
  })
  if (rs.status !== 0) {
    throw new Error('Playwright策略校验失败（本机 Chrome/Chromium 或安装策略不满足）')
  }
}
