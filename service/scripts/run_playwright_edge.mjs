import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serviceDir = path.resolve(__dirname, '..')
const guardScript = path.join(serviceDir, 'scripts/guard_playwright_policy.mjs')

const guard = spawnSync(process.execPath, [guardScript, '--require-edge'], {
  cwd: serviceDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
  },
})

if (guard.status !== 0) {
  process.exit(guard.status ?? 1)
}

const cliCandidates = [
  path.join(serviceDir, 'node_modules/.pnpm/node_modules/@playwright/test/cli.js'),
  path.join(serviceDir, 'node_modules/@playwright/test/cli.js'),
]
const cliPath = cliCandidates.find(candidate => fs.existsSync(candidate))

if (!cliPath) {
  console.error('缺少 @playwright/test 依赖，请先安装依赖后再运行。')
  process.exit(1)
}

const nodePathExtras = [path.join(serviceDir, 'node_modules/.pnpm/node_modules')]
if (process.env.NODE_PATH) {
  nodePathExtras.push(process.env.NODE_PATH)
}

const cliArgs = [cliPath, 'test', '-c', path.join(serviceDir, 'playwright.config.mjs')]
for (const arg of process.argv.slice(2)) {
  cliArgs.push(arg)
}

const run = spawnSync(process.execPath, cliArgs, {
  cwd: serviceDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
    NODE_PATH: nodePathExtras.join(path.delimiter),
  },
})

process.exit(run.status ?? 1)
