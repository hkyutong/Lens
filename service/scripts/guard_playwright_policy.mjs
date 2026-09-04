import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVICE_DIR = path.resolve(__dirname, '..')
const REPO_DIR = path.resolve(SERVICE_DIR, '..')
const FIXED_CHROMIUM_EXECUTABLE =
  '/Users/hkyutong/Library/Application Support/PlaywrightChromium/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

const args = new Set(process.argv.slice(2))
const requirePlaywrightChromium = args.has('--require-playwright-chromium')
const probeChromiumRuntime = args.has('--probe-runtime')

const SCAN_ROOTS = ['service', 'chat', 'admin', '.github']
const SKIP_DIRS = new Set([
  '.git',
  '.idea',
  '.vscode',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
  'release',
  'logs',
  'tmp',
  'artifacts',
])
const MAX_SCAN_BYTES = 1024 * 1024
const SELF_RELATIVE = path.relative(REPO_DIR, path.resolve(__dirname, 'guard_playwright_policy.mjs'))

const normalizedSelf = SELF_RELATIVE.split(path.sep).join('/')

const shouldScanFile = relativePath => {
  const normalized = relativePath.split(path.sep).join('/')
  const base = path.basename(normalized)

  if (normalized === normalizedSelf) return false
  if (base === 'package.json') return true
  if (normalized.startsWith('.github/workflows/') && /\.(?:yml|yaml)$/i.test(base)) return true

  return /\.(?:mjs|cjs|js|ts|sh|bash|zsh|yml|yaml)$/i.test(base)
}

const blockedInstallRules = [
  /\b(?:npx|npm\s+exec|pnpm\s+(?:exec|dlx)|yarn\s+dlx)\s+(?:@playwright\/test|playwright(?:@[^\s]+)?)\s+install\b/i,
  /\bplaywright\s+install\b/i,
]

const blockedLineHits = []

const scanFile = (absolutePath, relativePath) => {
  if (!shouldScanFile(relativePath)) return
  const stat = fs.statSync(absolutePath)
  if (!stat.isFile()) return
  if (stat.size > MAX_SCAN_BYTES) return

  const text = fs.readFileSync(absolutePath, 'utf8')
  const lines = text.split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    for (const rule of blockedInstallRules) {
      if (rule.test(line)) {
        blockedLineHits.push({
          file: relativePath.split(path.sep).join('/'),
          line: i + 1,
          text: line.trim(),
        })
        break
      }
    }
  }
}

const walk = currentDir => {
  const entries = fs.readdirSync(currentDir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.name.startsWith('.DS_Store')) continue
    if (SKIP_DIRS.has(entry.name)) continue
    const abs = path.join(currentDir, entry.name)
    const rel = path.relative(REPO_DIR, abs)
    if (entry.isDirectory()) {
      walk(abs)
      continue
    }
    scanFile(abs, rel)
  }
}

const ensureNoPlaywrightInstall = () => {
  for (const root of SCAN_ROOTS) {
    const absRoot = path.join(REPO_DIR, root)
    if (!fs.existsSync(absRoot)) continue
    walk(absRoot)
  }

  if (!blockedLineHits.length) return

  console.error('\n[Playwright策略拦截] 检测到被禁止的浏览器安装命令。')
  console.error('原因：E2E/回归必须固定复用共享 Playwright Chromium，禁止在项目内触发浏览器安装。\n')
  for (const hit of blockedLineHits) {
    console.error(`- ${hit.file}:${hit.line}`)
    console.error(`  ${hit.text}`)
  }
  console.error('\n请移除以上安装命令，统一复用共享 Playwright Chromium。')
  process.exit(1)
}

const getSharedBrowsersPath = () =>
  process.env.PLAYWRIGHT_BROWSERS_PATH ||
  path.join(os.homedir(), 'Library', 'Application Support', 'PlaywrightChromium')

const detectPlaywrightChromiumBinary = () => {
  const browsersPath = getSharedBrowsersPath()
  if (!fs.existsSync(browsersPath)) return ''

  const browserDirs = fs
    .readdirSync(browsersPath, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('chromium-'))
    .map(entry => path.join(browsersPath, entry.name))
    .sort()
    .reverse()

  const relativeCandidates = [
    'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
    'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    'chrome-linux/chrome',
    'chrome-win/chrome.exe',
  ]

  for (const browserDir of browserDirs) {
    for (const relativeCandidate of relativeCandidates) {
      const candidate = path.join(browserDir, relativeCandidate)
      if (fs.existsSync(candidate)) return candidate
    }
  }

  return ''
}

const ensurePlaywrightChromiumInstalled = () => {
  const browserPath = detectPlaywrightChromiumBinary()
  if (browserPath) {
    console.log(`[Playwright策略] 共享 Playwright Chromium 可用: ${browserPath}`)
    return browserPath
  }
  console.error(`缺少共享 Playwright Chromium，已停止，不会回退到本机 Chrome/Edge。期望目录: ${getSharedBrowsersPath()}`)
  process.exit(1)
}

const ensurePlaywrightChromiumRunnable = browserPath => {
  const probe = spawnSync(
    browserPath,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--dump-dom',
      'data:text/html,<title>playwright-probe</title>',
    ],
    {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )

  const output = `${probe.stdout || ''}${probe.stderr || ''}`
  const hasProbeDocument = /playwright-probe/.test(output)
  if (probe.status === 0 && hasProbeDocument) {
    console.log('[Playwright策略] 共享 Playwright Chromium headless 运行预检通过')
    return
  }

  const exitDetail = probe.error?.code || (probe.signal ? `signal:${probe.signal}` : `exit:${probe.status}`)
  console.error(
    `[Playwright策略] 共享 Playwright Chromium 无法完成 headless 运行预检（${exitDetail}）；已停止，不会回退到本机 Chrome/Edge。`,
  )
  process.exit(1)
}

const ensureConfigUsesPlaywrightChromium = () => {
  const configPath = path.join(SERVICE_DIR, 'playwright.config.mjs')
  if (!fs.existsSync(configPath)) {
    console.error(`缺少 Playwright 配置文件: ${configPath}`)
    process.exit(1)
  }
  const text = fs.readFileSync(configPath, 'utf8')
  const usesChromium = /browserName\s*:\s*['"]chromium['"]/.test(text)
  const usesUnsupportedExecutable = /executablePath/.test(text) && !text.includes(FIXED_CHROMIUM_EXECUTABLE)
  const usesLocalBrowser =
    /channel\s*:\s*['"][^'"]+['"]/.test(text) ||
    usesUnsupportedExecutable ||
    /PLAYWRIGHT_CHROME_PATH|GOOGLE_CHROME_BIN|CHROME_PATH/.test(text)
  if (!usesChromium || usesLocalBrowser) {
    console.error(
      'Playwright 配置未锁定固定共享 Chromium：必须使用 browserName = "chromium"，仅允许项目约定的固定 Chromium executablePath，且不得使用 channel 或本机 Chrome 环境变量。',
    )
    process.exit(1)
  }
}

ensureNoPlaywrightInstall()
ensureConfigUsesPlaywrightChromium()
if (requirePlaywrightChromium) {
  const browserPath = ensurePlaywrightChromiumInstalled()
  if (probeChromiumRuntime) ensurePlaywrightChromiumRunnable(browserPath)
}
console.log('[Playwright策略] 通过')
