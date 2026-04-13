import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const serviceDir = path.resolve(__dirname, '..')
const guardScript = path.join(serviceDir, 'scripts/guard_playwright_policy.mjs')
const sharedBrowsersPath =
  process.env.PLAYWRIGHT_BROWSERS_PATH ||
  path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright')
const sharedEnv = {
  ...process.env,
  PLAYWRIGHT_BROWSERS_PATH: sharedBrowsersPath,
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1',
}

const guard = spawnSync(process.execPath, [guardScript, '--require-playwright-chromium'], {
  cwd: serviceDir,
  stdio: 'inherit',
  env: sharedEnv,
})

if (guard.status !== 0) {
  process.exit(guard.status ?? 1)
}

const cliCandidates = [
  path.join(serviceDir, 'node_modules/.pnpm/node_modules/@playwright/test/cli.js'),
  path.join(serviceDir, 'node_modules/@playwright/test/cli.js'),
]
const cliPath = cliCandidates.find(candidate => fs.existsSync(candidate))
const configPath = path.join(serviceDir, 'playwright.config.mjs')
const cliArgs = ['test', '-c', configPath]
for (const arg of process.argv.slice(2)) {
  cliArgs.push(arg)
}

let run
if (cliPath) {
  const nodePathExtras = [path.join(serviceDir, 'node_modules/.pnpm/node_modules')]
  if (process.env.NODE_PATH) {
    nodePathExtras.push(process.env.NODE_PATH)
  }
  run = spawnSync(process.execPath, [cliPath, ...cliArgs], {
    cwd: serviceDir,
    stdio: 'inherit',
    env: {
      ...sharedEnv,
      NODE_PATH: nodePathExtras.join(path.delimiter),
    },
  })
} else {
  console.error('未检测到本地 @playwright/test，改用 npx 临时执行。')
  run = spawnSync('npx', ['--yes', '-p', '@playwright/test', 'playwright', ...cliArgs], {
    cwd: serviceDir,
    stdio: 'inherit',
    env: sharedEnv,
  })
}

process.exit(run.status ?? 1)
