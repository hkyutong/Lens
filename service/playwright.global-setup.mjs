import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serviceDir = __dirname
const guardScript = path.join(serviceDir, 'scripts/guard_playwright_policy.mjs')
const sharedBrowsersPath =
  process.env.PLAYWRIGHT_BROWSERS_PATH ||
  path.join(os.homedir(), 'Library', 'Application Support', 'PlaywrightChromium')

export default async () => {
  const rs = spawnSync(process.execPath, [guardScript, '--require-playwright-chromium', '--probe-runtime'], {
    cwd: serviceDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PLAYWRIGHT_BROWSERS_PATH: sharedBrowsersPath,
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    },
  })
  if (rs.status !== 0) {
    throw new Error('Playwright策略校验失败（共享 Playwright Chromium 或安装策略不满足）')
  }
}
