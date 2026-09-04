import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const chatDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let argumentError = ''

const valueAfter = flag => {
  const index = process.argv.indexOf(flag)
  if (index < 0) return ''
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) {
    argumentError = `${flag} 缺少目录参数`
    return ''
  }
  return value
}

const candidateDir = path.resolve(valueAfter('--candidate') || path.join(chatDir, 'dist'))
const mirrorArg = valueAfter('--mirror')
const mirrorDir = mirrorArg ? path.resolve(mirrorArg) : ''

const requiredContractTokens = [
  '/auth/getInfo',
  '/group/query',
  '/chatlog/chatList',
  '/upload/file',
  '/balance/query',
  '/order/buy',
  '/share/create',
  '/academic/chat-process',
  '/academic/workflow-process',
  '/academic/core-function-list',
  '/academic/plugin-list',
  'lens.research.v1',
]

const forbiddenLegacyTokens = [
  'AppList',
  'AppTips',
  '应用广场',
  '应用市场',
  '@应用',
  '/app/queryCats',
  '/app/list',
  '/app/searchList',
  '/app/mineApps',
  '/app/collect',
  '/app/queryOneCat',
  '/plugin/pluginList',
]

const forbiddenSensitiveTokens = [
  '/Users/',
  '/www/wwwroot/',
  '服务器.txt',
  'BEGIN OPENSSH PRIVATE KEY',
  'JWT_SECRET',
  'MYSQL_PASSWORD',
  'REDIS_PASSWORD',
  'Authorization: Bearer ',
  'YutoLens 欢迎您',
  '初始管理员账号密码',
  '初始预览账号密码',
  'super 123456',
  'admin 123456',
]

const forbiddenFileNames = new Set(['.DS_Store', '.env', '服务器.txt', 'known_hosts'])

const textExtensions = new Set(['.css', '.html', '.js', '.json', '.svg', '.txt', '.xml'])

const fail = message => {
  throw new Error(message)
}

const toPosix = value => value.split(path.sep).join('/')

const listFiles = async root => {
  const files = []

  const visit = async relativeDir => {
    const absoluteDir = path.join(root, relativeDir)
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true })
    entries.sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      const relativePath = path.join(relativeDir, entry.name)
      if (entry.isDirectory()) {
        await visit(relativePath)
      } else if (entry.isFile()) {
        files.push(toPosix(relativePath))
      } else {
        fail(`候选包包含非普通文件：${toPosix(relativePath)}`)
      }
    }
  }

  await visit('')
  return files
}

const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex')

const inspectCandidate = async () => {
  const stat = await fs.stat(candidateDir).catch(() => null)
  if (!stat?.isDirectory()) fail('缺少 chat/dist 发布候选目录，请先执行生产构建')

  const files = await listFiles(candidateDir)
  if (!files.length) fail('发布候选目录为空')
  if (!files.includes('index.html')) fail('发布候选缺少 index.html')
  if (!files.some(file => file.endsWith('.js'))) fail('发布候选缺少 JavaScript 产物')
  if (!files.some(file => file.endsWith('.css'))) fail('发布候选缺少 CSS 产物')

  for (const file of files) {
    const basename = path.posix.basename(file)
    if (
      forbiddenFileNames.has(basename) ||
      basename.startsWith('._') ||
      basename.startsWith('.env')
    ) {
      fail(`发布候选包含禁止文件：${file}`)
    }
    if (file.endsWith('.map')) fail(`发布候选包含 source map：${file}`)
  }

  const textParts = []
  let totalBytes = 0
  for (const file of files) {
    const content = await fs.readFile(path.join(candidateDir, file))
    totalBytes += content.byteLength
    if (textExtensions.has(path.extname(file))) textParts.push(content.toString('utf8'))
  }
  const searchableText = textParts.join('\n')

  for (const token of requiredContractTokens) {
    if (!searchableText.includes(token)) fail(`发布候选缺少兼容契约：${token}`)
  }
  for (const token of forbiddenLegacyTokens) {
    if (searchableText.includes(token)) fail(`发布候选仍包含旧 99AI 用户端标记：${token}`)
  }
  for (const token of forbiddenSensitiveTokens) {
    if (searchableText.includes(token)) fail(`发布候选包含敏感标记：${token}`)
  }

  const indexHtml = await fs.readFile(path.join(candidateDir, 'index.html'), 'utf8')
  const assetReferences = [...indexHtml.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map(match => match[1])
    .filter(reference => !/^(?:[a-z]+:|\/\/|#|data:)/i.test(reference))
    .map(reference => reference.split(/[?#]/, 1)[0].replace(/^\//, ''))
    .filter(Boolean)

  for (const reference of new Set(assetReferences)) {
    const assetPath = path.resolve(candidateDir, reference)
    if (!assetPath.startsWith(`${candidateDir}${path.sep}`)) {
      fail(`index.html 包含越界静态资源引用：${reference}`)
    }
    const assetStat = await fs.stat(assetPath).catch(() => null)
    if (!assetStat?.isFile()) fail(`index.html 引用了不存在的静态资源：${reference}`)
  }

  return {
    files,
    totalBytes,
    indexSha256: sha256(Buffer.from(indexHtml)),
  }
}

const verifyMirror = async candidate => {
  if (!mirrorDir) return { checked: false }
  const mirrorStat = await fs.stat(mirrorDir).catch(() => null)
  if (!mirrorStat?.isDirectory()) fail(`同步镜像目录不存在：${mirrorDir}`)

  for (const file of candidate.files) {
    const candidateContent = await fs.readFile(path.join(candidateDir, file))
    const mirrorContent = await fs.readFile(path.join(mirrorDir, file)).catch(() => null)
    if (!mirrorContent) fail(`同步镜像缺少候选文件：${file}`)
    if (sha256(candidateContent) !== sha256(mirrorContent)) {
      fail(`同步镜像文件与候选包不一致：${file}`)
    }
  }

  return { checked: true, path: mirrorDir }
}

try {
  if (argumentError) fail(argumentError)
  const candidate = await inspectCandidate()
  const mirror = await verifyMirror(candidate)
  console.log(
    JSON.stringify(
      {
        passed: true,
        candidate: candidateDir,
        fileCount: candidate.files.length,
        totalBytes: candidate.totalBytes,
        indexSha256: candidate.indexSha256,
        mirror,
        legacyUiIncluded: false,
        compatibilityContracts: requiredContractTokens.length,
      },
      null,
      2
    )
  )
} catch (error) {
  console.error(`[academic-release-gate] ${error?.message || 'unknown error'}`)
  process.exitCode = 1
}
