import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import dotenv from 'dotenv'
import Redis from 'ioredis'
import mysql from 'mysql2/promise'

const resolveServiceDir = () => {
  const rootService = path.resolve('service/src/main.ts')
  if (fs.existsSync(rootService)) return path.resolve('service')
  const localService = path.resolve('src/main.ts')
  if (fs.existsSync(localService)) return path.resolve('.')
  return path.resolve('service')
}
const SERVICE_DIR = resolveServiceDir()
dotenv.config({ path: path.join(SERVICE_DIR, '.env') })
dotenv.config()

const BASE = process.env.BASE_URL || 'http://127.0.0.1:9520/api'
const SUPER_USER = process.env.SUPER_USER || 'super'
const SUPER_PASS = process.env.SUPER_PASS || '123456'
const MODEL = process.env.E2E_MODEL || 'gpt-5-nano'
const NAMESPACE = process.env.NAMESPACE || 'Lens'
const E2E_CORE_ONLY = String(process.env.E2E_CORE_ONLY || 'false').toLowerCase() === 'true'
const E2E_PLUGIN_LIMIT = Math.max(Number(process.env.E2E_PLUGIN_LIMIT || 0), 0)

const result = {
  startedAt: new Date().toISOString(),
  env: { base: BASE, model: MODEL },
  steps: [],
  pluginSummary: { total: 0, pass: 0, fail: 0, rows: [] },
  checks: {},
  errors: [],
}

const sampleFiles = { pdf: '', docx: '', tex: '', zip: '' }

const pickExistingFile = (...candidates) => candidates.find(p => p && fs.existsSync(p)) || ''

const fixturePaths = {
  pdf: pickExistingFile(
    path.join(SERVICE_DIR, 'public/file/dev/smoke-e2e/smoke.pdf'),
    path.join(SERVICE_DIR, 'public/file/dev/e2e-1771408519075/smoke.pdf'),
    path.join(
      SERVICE_DIR,
      'node_modules/.pnpm/pdf-parse@1.1.1/node_modules/pdf-parse/test/data/01-valid.pdf',
    ),
    path.resolve('node_modules/.pnpm/pdf-parse@1.1.1/node_modules/pdf-parse/test/data/01-valid.pdf'),
    path.join(SERVICE_DIR, 'node_modules/pdf-parse/test/data/01-valid.pdf'),
    path.resolve('node_modules/pdf-parse/test/data/01-valid.pdf'),
  ),
  docx: pickExistingFile(
    path.join(SERVICE_DIR, 'public/file/dev/smoke-e2e/smoke.docx'),
    path.join(SERVICE_DIR, 'public/file/dev/e2e-1771408519075/smoke.docx'),
    path.join(
      SERVICE_DIR,
      'node_modules/.pnpm/mammoth@1.9.0/node_modules/mammoth/test/test-data/single-paragraph.docx',
    ),
    path.resolve(
      'node_modules/.pnpm/mammoth@1.9.0/node_modules/mammoth/test/test-data/single-paragraph.docx',
    ),
    path.join(SERVICE_DIR, 'node_modules/mammoth/test/test-data/single-paragraph.docx'),
    path.resolve('node_modules/mammoth/test/test-data/single-paragraph.docx'),
  ),
  zip: pickExistingFile(
    path.join(SERVICE_DIR, 'public/file/dev/smoke-e2e/smoke.zip'),
    path.join(SERVICE_DIR, 'public/file/dev/e2e-1771408519075/smoke.zip'),
    path.join(
      SERVICE_DIR,
      'node_modules/.pnpm/mammoth@1.9.0/node_modules/mammoth/test/test-data/hello.zip',
    ),
    path.resolve('node_modules/.pnpm/mammoth@1.9.0/node_modules/mammoth/test/test-data/hello.zip'),
    path.join(SERVICE_DIR, 'node_modules/mammoth/test/test-data/hello.zip'),
    path.resolve('node_modules/mammoth/test/test-data/hello.zip'),
  ),
}

const request = async (
  apiPath,
  { method = 'GET', token = '', body = null, timeoutMs = 45000 } = {},
) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  try {
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (body != null) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${BASE}${apiPath}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch (_e) {}
    return { ok: res.ok, status: res.status, text, json }
  } finally {
    clearTimeout(timer)
  }
}

const decodeJwtPayload = token => {
  try {
    const payload = token.split('.')[1]
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch (_e) {
    return {}
  }
}

const pickToken = res => res?.json?.data || ''

const parseApiHost = () => {
  const parsed = new URL(BASE)
  return `${parsed.protocol}//${parsed.host}`
}

const prepareSampleFiles = async () => {
  const now = Date.now()
  const fixtureDir = path.join(SERVICE_DIR, `public/file/dev/e2e-${now}`)
  fs.mkdirSync(fixtureDir, { recursive: true })

  const texFixture = path.join(fixtureDir, 'smoke.tex')
  fs.writeFileSync(
    texFixture,
    ['\\\\documentclass{article}', '\\\\begin{document}', 'This is an e2e tex file.', '\\\\end{document}', ''].join('\n'),
    'utf8',
  )

  fs.copyFileSync(fixturePaths.pdf, path.join(fixtureDir, 'smoke.pdf'))
  fs.copyFileSync(fixturePaths.docx, path.join(fixtureDir, 'smoke.docx'))
  fs.copyFileSync(fixturePaths.zip, path.join(fixtureDir, 'smoke.zip'))

  const host = parseApiHost()
  const base = `${host}/file/dev/e2e-${now}`
  sampleFiles.pdf = `${base}/smoke.pdf`
  sampleFiles.docx = `${base}/smoke.docx`
  sampleFiles.tex = `${base}/smoke.tex`
  sampleFiles.zip = `${base}/smoke.zip`
}

const streamAcademic = async ({ token, payload, timeoutMs = 180000 }) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  const rs = {
    ok: false,
    status: 0,
    lines: [],
    finalContent: '',
    finishReason: '',
    hasFileVector: false,
    hasAnyContent: false,
    error: '',
  }

  try {
    const res = await fetch(`${BASE}/academic/chat-process`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
    rs.status = res.status
    if (!res.ok || !res.body) {
      rs.error = `http_${res.status}`
      return rs
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx = buffer.indexOf('\n')
      while (idx >= 0) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (!line) {
          idx = buffer.indexOf('\n')
          continue
        }
        rs.lines.push(line)
        let obj = null
        try {
          obj = JSON.parse(line)
        } catch (_e) {}
        if (obj && typeof obj === 'object') {
          if (typeof obj.finalContent === 'string' && obj.finalContent.trim()) {
            rs.finalContent = obj.finalContent
            rs.hasAnyContent = true
          }
          if (obj.fileVectorResult) rs.hasFileVector = true
          if (typeof obj.finishReason === 'string') rs.finishReason = obj.finishReason
          if (obj.content && Array.isArray(obj.content) && obj.content.length > 0) {
            rs.hasAnyContent = true
          }
          if (obj.streamError) rs.error = String(obj.streamError)
        } else {
          rs.hasAnyContent = true
        }
        idx = buffer.indexOf('\n')
      }
    }
    if (buffer.trim()) rs.lines.push(buffer.trim())
    const outputText = String(rs.finalContent || rs.lines.join('\n') || '')
    const hardErrorPattern =
      /(?:Traceback|插件调用出错|学术服务异常|学术服务响应超时|无法读取论文内容|未返回可展示内容|Academic stream error)/i
    const hasHardError = hardErrorPattern.test(outputText)
    rs.ok =
      !hasHardError &&
      String(rs.finishReason).toLowerCase() !== 'error' &&
      (Boolean(rs.finalContent) || rs.hasAnyContent || rs.hasFileVector)
    if (!rs.ok && !rs.error) rs.error = hasHardError ? 'hard_error_content' : 'no_renderable_result'
    return rs
  } catch (e) {
    rs.error = e?.message || 'stream_error'
    return rs
  } finally {
    clearTimeout(timer)
  }
}

const chooseFileUrl = name => {
  const n = String(name || '')
  if (/论文速读|PDF/.test(n)) return sampleFiles.pdf
  if (/Word/.test(n)) return sampleFiles.docx
  if (/LaTeX|latex|Tex/i.test(n)) return sampleFiles.tex
  if (/解析|注释|Notebook|Markdown|README|函数注释|项目/.test(n)) return sampleFiles.zip
  return ''
}

const getBalance = async token => {
  const rs = await request('/balance/query', { token })
  return rs?.json?.data || null
}

const getMysql = async () =>
  mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_DATABASE,
  })

const setCaptchaCode = async (contact, code) => {
  const redis = process.env.REDIS_URL
    ? new Redis(process.env.REDIS_URL)
    : new Redis({
        host: process.env.REDIS_HOST,
        port: Number(process.env.REDIS_PORT || 6379),
        password: process.env.REDIS_PASSWORD || undefined,
        username: process.env.REDIS_USER || undefined,
        db: Number(process.env.REDIS_DB || 0),
      })
  const key = `${NAMESPACE}:CODE:${contact}`
  await redis.set(key, code, 'EX', 600)
  const v = await redis.get(key)
  await redis.quit()
  return v === code
}

const addStep = (name, ok, detail = {}) => {
  result.steps.push({ name, ok, ...detail })
}

const main = async () => {
  let superToken = ''
  let userToken = ''
  let userId = 0
  let groupId = 0
  let packageId = 0
  let cramiCode = ''

  try {
    const superLogin = await request('/auth/login', {
      method: 'POST',
      body: { username: SUPER_USER, password: SUPER_PASS },
    })
    superToken = pickToken(superLogin)
    addStep('super登录', Boolean(superToken), {
      status: superLogin.status,
      requestId: superLogin?.json?.requestId || '',
    })
    if (!superToken) throw new Error('super_login_failed')

    const email = `e2e_${Date.now()}@example.com`
    const code = '654321'
    let codeReady = false
    for (let i = 0; i < 6; i++) {
      try {
        codeReady = await setCaptchaCode(email, code)
        if (codeReady) break
      } catch (_e) {
        await sleep(800)
      }
    }
    addStep('注册验证码注入', codeReady, { email })
    if (!codeReady) throw new Error('captcha_code_inject_failed')

    const regLogin = await request('/auth/login', {
      method: 'POST',
      body: { username: email, captchaId: code },
      timeoutMs: 90000,
    })
    userToken = pickToken(regLogin)
    const payload = decodeJwtPayload(userToken)
    userId = Number(payload.id || 0)
    addStep('注册+登录', Boolean(userToken && userId > 0), {
      status: regLogin.status,
      requestId: regLogin?.json?.requestId || '',
      userId,
    })
    if (!userToken) throw new Error('register_login_failed')

    const initialBalance = await getBalance(userToken)
    addStep('注册后余额初始化', Boolean(initialBalance), { balance: initialBalance })
    if (!initialBalance) throw new Error('initial_balance_missing')

    const uniqueNum = Date.now() % 1000000
    const createPkg = await request('/crami/createPackage', {
      method: 'POST',
      token: superToken,
      body: {
        name: `E2E会员包-${uniqueNum}`,
        des: 'e2e自动验收套餐',
        weight: uniqueNum,
        deductionType: 1,
        coverImg: '',
        price: 0.01,
        order: uniqueNum,
        status: 1,
        days: 1,
        model3Count: 80,
        model4Count: 0,
        drawMjCount: 0,
        appCats: '',
      },
    })
    packageId = Number(createPkg?.json?.data?.id || createPkg?.json?.data || 0)
    addStep('创建会员套餐', Boolean(packageId > 0), {
      status: createPkg.status,
      packageId,
      message: createPkg?.json?.message || '',
      requestId: createPkg?.json?.requestId || '',
    })
    if (!packageId) throw new Error('create_package_failed')

    const createCrami = await request('/crami/createCrami', {
      method: 'POST',
      token: superToken,
      body: { packageId, count: 1 },
    })
    const cramiData = createCrami?.json?.data
    if (Array.isArray(cramiData) && cramiData[0]?.code) cramiCode = cramiData[0].code
    addStep('生成充值卡密', Boolean(cramiCode), {
      status: createCrami.status,
      requestId: createCrami?.json?.requestId || '',
    })
    if (!cramiCode) throw new Error('create_crami_failed')

    const useCrami = await request('/crami/useCrami', {
      method: 'POST',
      token: userToken,
      body: { code: cramiCode },
    })
    const afterMember = await getBalance(userToken)
    const memberOk = Number(afterMember?.packageId || 0) === packageId
    addStep('充值并成为会员', Boolean(useCrami.ok && memberOk), {
      status: useCrami.status,
      packageId: afterMember?.packageId,
      memberModel3Count: afterMember?.memberModel3Count,
      expirationTime: afterMember?.expirationTime,
    })
    if (!memberOk) throw new Error('member_upgrade_failed')

    const groupRes = await request('/group/create', { method: 'POST', token: userToken, body: {} })
    groupId = Number(groupRes?.json?.data?.id || groupRes?.json?.id || 0)
    addStep('创建会话组', Boolean(groupId > 0), { groupId, status: groupRes.status })
    if (!groupId) throw new Error('group_create_failed')

    await prepareSampleFiles()

    const coreRes = await request('/academic/core-function-list', {
      method: 'POST',
      token: userToken,
      body: {},
    })
    const pluginRes = await request('/academic/plugin-list', {
      method: 'POST',
      token: userToken,
      body: {},
    })
    const cores = coreRes?.json?.data?.rows || []
    const plugins = pluginRes?.json?.data?.rows || []
    const cases = []
    for (const core of cores) {
      cases.push({ kind: 'core', displayName: core.displayName || core.name, requestName: core.name })
    }
    if (!E2E_CORE_ONLY) {
      const filteredPlugins = plugins.filter(
        plugin => String(plugin.displayName || plugin.name) !== '不启用',
      )
      const pluginsToRun =
        E2E_PLUGIN_LIMIT > 0 ? filteredPlugins.slice(0, E2E_PLUGIN_LIMIT) : filteredPlugins
      for (const plugin of pluginsToRun) {
        cases.push({
          kind: 'plugin',
          displayName: plugin.displayName || plugin.name,
          requestName: plugin.name,
        })
      }
    }
    result.pluginSummary.total = cases.length

    const beforeAcademic = await getBalance(userToken)
    for (const c of cases) {
      const payload = {
        function: c.kind === 'plugin' ? 'plugin' : 'basic',
        plugin_name: c.kind === 'plugin' ? c.requestName : undefined,
        core_function: c.kind === 'core' ? c.requestName : undefined,
        plugin_kwargs: {},
        main_input: /Arxiv/.test(c.displayName)
          ? '1706.03762'
          : c.kind === 'core'
          ? '请简洁回答：什么是可验证系统'
          : '请基于文件给出重点总结',
        model: MODEL,
        modelName: MODEL,
        modelType: 1,
        options: {
          groupId,
          usingNetwork: false,
          usingDeepThinking: false,
        },
      }

      const fileUrl = chooseFileUrl(c.displayName)
      if (fileUrl) payload.fileUrl = fileUrl

      const timeoutMs = /Arxiv|LaTeX|Word|PDF|解析|批量/.test(c.displayName) ? 180000 : 90000
      let rs = await streamAcademic({ token: userToken, payload, timeoutMs })
      if (!rs.ok) rs = await streamAcademic({ token: userToken, payload, timeoutMs })

      const row = {
        case: `${c.kind}:${c.displayName}`,
        ok: rs.ok,
        finishReason: rs.finishReason || '',
        finalLen: String(rs.finalContent || '').length,
        hasFileVector: rs.hasFileVector,
        error: rs.error || '',
      }
      if (row.ok) result.pluginSummary.pass += 1
      else result.pluginSummary.fail += 1
      result.pluginSummary.rows.push(row)
      await sleep(180)
    }
    addStep(
      '所有学术插件验收',
      result.pluginSummary.fail === 0,
      { total: result.pluginSummary.total, pass: result.pluginSummary.pass, fail: result.pluginSummary.fail },
    )

    const afterAcademic = await getBalance(userToken)
    const beforeSum = Number(beforeAcademic?.sumModel3Count || 0)
    const afterSum = Number(afterAcademic?.sumModel3Count || 0)
    const beforeUse = Number(beforeAcademic?.useModel3Count || 0)
    const afterUse = Number(afterAcademic?.useModel3Count || 0)
    const consumed = beforeSum - afterSum
    const deducted = consumed > 0 || afterUse > beforeUse
    result.checks.deduction = { beforeAcademic, afterAcademic, consumed, beforeUse, afterUse, deducted }
    addStep('扣费校验', deducted, { consumed, beforeUse, afterUse })

    const beforeErr = await getBalance(userToken)
    const invalidPayload = {
      function: 'plugin',
      plugin_name: 'PDF批量总结',
      plugin_kwargs: {},
      main_input: '测试异常不扣费',
      model: MODEL,
      modelName: MODEL,
      modelType: 1,
      fileUrl: `${parseApiHost()}/file/dev/not-exists/e2e-404.pdf`,
      options: { groupId, usingNetwork: false, usingDeepThinking: false },
    }
    const errRs = await streamAcademic({ token: userToken, payload: invalidPayload, timeoutMs: 90000 })
    const afterErr = await getBalance(userToken)
    const rollbackOk =
      Number(beforeErr?.sumModel3Count || 0) === Number(afterErr?.sumModel3Count || 0) &&
      Number(beforeErr?.useModel3Count || 0) === Number(afterErr?.useModel3Count || 0)
    result.checks.exceptionRollback = {
      beforeErr,
      afterErr,
      finishReason: errRs.finishReason,
      streamError: errRs.error,
      rollbackOk,
    }
    addStep('异常回滚（失败请求不扣费）', rollbackOk, {
      finishReason: errRs.finishReason,
      streamError: errRs.error,
    })

    const conn = await getMysql()
    await conn.query('UPDATE user_balances SET expirationTime = DATE_SUB(NOW(), INTERVAL 2 MINUTE) WHERE userId = ?', [
      userId,
    ])
    await conn.end()
    addStep('手动置为过期状态（测试准备）', true, { userId })

    const expireDeadline = Date.now() + 360000
    let expireOk = false
    let expireBalance = null
    while (Date.now() < expireDeadline) {
      await sleep(30000)
      expireBalance = await getBalance(userToken)
      if (Number(expireBalance?.packageId || 0) === 0) {
        expireOk = true
        break
      }
    }
    result.checks.expire = { expireOk, expireBalance }
    addStep('会员过期回滚（Cron清理）', expireOk, {
      packageId: expireBalance?.packageId,
      memberModel3Count: expireBalance?.memberModel3Count,
      expirationTime: expireBalance?.expirationTime,
    })
  } catch (e) {
    result.errors.push(String(e?.message || e))
  } finally {
    result.finishedAt = new Date().toISOString()
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
  const hasStepFailure = result.steps.some(step => !step.ok)
  const hasCheckFailure = Object.values(result.checks).some(check => {
    if (!check || typeof check !== 'object') return false
    if ('deducted' in check && !check.deducted) return true
    if ('rollbackOk' in check && !check.rollbackOk) return true
    if ('expireOk' in check && !check.expireOk) return true
    return false
  })
  const hasPluginFailure = Number(result.pluginSummary.fail || 0) > 0
  const hasFatal = result.errors.length > 0 || hasStepFailure || hasCheckFailure || hasPluginFailure
  process.exit(hasFatal ? 1 : 0)
}

main()
