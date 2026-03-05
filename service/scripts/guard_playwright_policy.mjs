import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SERVICE_DIR = path.resolve(__dirname, '..')
const REPO_DIR = path.resolve(SERVICE_DIR, '..')

const args = new Set(process.argv.slice(2))
const requireEdge = args.has('--require-edge')

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
  console.error('原因：E2E/回归必须固定使用本机 Microsoft Edge，禁止触发 Playwright 浏览器下载。\n')
  for (const hit of blockedLineHits) {
    console.error(`- ${hit.file}:${hit.line}`)
    console.error(`  ${hit.text}`)
  }
  console.error('\n请移除以上安装命令，改为使用 Edge 通道（channel: "msedge"）。')
  process.exit(1)
}

const detectEdgeBinary = () => {
  const home = os.homedir()
  const candidates = [
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    path.join(home, 'Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'),
  ]
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }

  const whichEdge = spawnSync('which', ['msedge'], {
    encoding: 'utf8',
  })
  if (whichEdge.status === 0) {
    const resolved = String(whichEdge.stdout || '').trim()
    if (resolved) return resolved
  }

  return ''
}

const ensureEdgeInstalled = () => {
  const edgePath = detectEdgeBinary()
  if (edgePath) {
    console.log(`[Playwright策略] Edge可用: ${edgePath}`)
    return
  }
  console.error('缺少 Edge，已停止，不会自动下载 Chromium。')
  process.exit(1)
}

const ensureConfigUsesEdgeChannel = () => {
  const configPath = path.join(SERVICE_DIR, 'playwright.config.mjs')
  if (!fs.existsSync(configPath)) {
    console.error(`缺少 Playwright 配置文件: ${configPath}`)
    process.exit(1)
  }
  const text = fs.readFileSync(configPath, 'utf8')
  if (!/channel\s*:\s*['"]msedge['"]/.test(text)) {
    console.error('Playwright 配置未锁定 msedge 通道，请在 playwright.config.mjs 中设置 use.channel = "msedge"。')
    process.exit(1)
  }
}

ensureNoPlaywrightInstall()
ensureConfigUsesEdgeChannel()
if (requireEdge) {
  ensureEdgeInstalled()
}
console.log('[Playwright策略] 通过')
