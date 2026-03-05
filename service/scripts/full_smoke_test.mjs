import { setTimeout as sleep } from 'node:timers/promises'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:9520/api'
const LOGIN_USER = process.env.LOGIN_USER || 'super'
const LOGIN_PASS = process.env.LOGIN_PASS || '123456'
const TARGET_MODEL = process.env.SMOKE_MODEL || 'gpt-5-nano'
const TARGET_MODEL_NAME = process.env.SMOKE_MODEL_NAME || 'GPT-5 nano'
const SMOKE_CORE_ONLY = String(process.env.SMOKE_CORE_ONLY || 'false').toLowerCase() === 'true'
const SMOKE_PLUGIN_LIMIT = Math.max(Number(process.env.SMOKE_PLUGIN_LIMIT || 0), 0)

const sampleFiles = { pdf: '', docx: '', tex: '', zip: '' }

const pickExistingFile = (...candidates) => candidates.find(p => p && fs.existsSync(p)) || ''

const fixturePaths = {
  pdf: pickExistingFile(
    path.resolve('service/public/file/dev/smoke-e2e/smoke.pdf'),
    path.resolve('service/public/file/dev/e2e-1771408519075/smoke.pdf'),
    path.resolve('service/public/file/dev/e2e-1771406609693/smoke.pdf'),
    path.resolve('node_modules/.pnpm/pdf-parse@1.1.1/node_modules/pdf-parse/test/data/01-valid.pdf'),
  ),
  docx: pickExistingFile(
    path.resolve('service/public/file/dev/smoke-e2e/smoke.docx'),
    path.resolve('service/public/file/dev/e2e-1771408519075/smoke.docx'),
    path.resolve('service/public/file/dev/e2e-1771406609693/smoke.docx'),
    path.resolve(
      'node_modules/.pnpm/mammoth@1.9.0/node_modules/mammoth/test/test-data/single-paragraph.docx',
    ),
  ),
  zip: pickExistingFile(
    path.resolve('service/public/file/dev/smoke-e2e/smoke.zip'),
    path.resolve('service/public/file/dev/e2e-1771408519075/smoke.zip'),
    path.resolve('service/public/file/dev/e2e-1771406609693/smoke.zip'),
    path.resolve('node_modules/.pnpm/mammoth@1.9.0/node_modules/mammoth/test/test-data/hello.zip'),
  ),
}

const request = async (path, { method = 'GET', token = '', body = null, timeoutMs = 30000 } = {}) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  try {
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (body != null) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${BASE}${path}`, {
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
    const base64url = String(token || '').split('.')[1] || ''
    if (!base64url) return {}
    const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
    const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4))
    return JSON.parse(Buffer.from(base64 + pad, 'base64').toString('utf8'))
  } catch (_e) {
    return {}
  }
}

const resolveModelMeta = async token => {
  const rs = await request('/models/list', { token, timeoutMs: 20000 })
  const modelMaps = rs.json?.data?.modelMaps || rs.json?.modelMaps || {}
  const allModels = Object.values(modelMaps).flatMap(list => (Array.isArray(list) ? list : []))
  const matched =
    allModels.find(item => String(item?.model || '').toLowerCase() === TARGET_MODEL.toLowerCase()) ||
    allModels.find(item => String(item?.modelName || '').toLowerCase() === TARGET_MODEL_NAME.toLowerCase()) ||
    allModels[0]

  if (!matched) {
    return {
      model: TARGET_MODEL,
      modelName: TARGET_MODEL_NAME,
      modelType: 1,
      source: 'fallback',
    }
  }
  return {
    model: String(matched.model || TARGET_MODEL),
    modelName: String(matched.modelName || TARGET_MODEL_NAME),
    modelType: Number(matched.keyType || 1),
    source: 'models.list',
  }
}

const ensureTestBalance = async ({ token, userId, role, modelType }) => {
  if (!userId || role !== 'super') return { skipped: true, reason: 'not_super_or_no_user' }

  const info = await request('/auth/getInfo', { token, timeoutMs: 20000 })
  const balance = info.json?.data?.userBalance || info.json?.userBalance || {}
  const current =
    modelType === 2 ? Number(balance.sumModel4Count || 0) : Number(balance.sumModel3Count || 0)
  const minNeeded = Number(process.env.SMOKE_MIN_BALANCE || 120)

  if (current >= minNeeded) return { skipped: true, reason: 'already_enough', current }

  const rechargeBody =
    modelType === 2
      ? { userId, model4Count: 2000, model3Count: 0, drawMjCount: 0 }
      : { userId, model3Count: 2000, model4Count: 0, drawMjCount: 0 }
  const recharge = await request('/user/recharge', { method: 'POST', token, body: rechargeBody })
  return { skipped: false, ok: recharge.ok, status: recharge.status, current, rechargeBody }
}

const parseApiHost = () => {
  try {
    const parsed = new URL(BASE)
    return `${parsed.protocol}//${parsed.host}`
  } catch (_e) {
    return 'http://127.0.0.1:9520'
  }
}

const prepareSampleFiles = async () => {
  const fixtureDir = path.resolve('service/public/file/dev/smoke-e2e')
  fs.mkdirSync(fixtureDir, { recursive: true })

  const texFixture = path.join(fixtureDir, 'smoke.tex')
  fs.writeFileSync(
    texFixture,
    [
      '\\\\documentclass{article}',
      '\\\\begin{document}',
      'This is a smoke test tex file.',
      '\\\\end{document}',
      '',
    ].join('\\n'),
    'utf8',
  )

  if (!fixturePaths.pdf || !fixturePaths.docx || !fixturePaths.zip) {
    throw new Error(
      `fixture_missing pdf=${Boolean(fixturePaths.pdf)} docx=${Boolean(fixturePaths.docx)} zip=${Boolean(
        fixturePaths.zip,
      )}`,
    )
  }

  fs.copyFileSync(fixturePaths.pdf, path.join(fixtureDir, 'smoke.pdf'))
  fs.copyFileSync(fixturePaths.docx, path.join(fixtureDir, 'smoke.docx'))
  fs.copyFileSync(fixturePaths.zip, path.join(fixtureDir, 'smoke.zip'))

  const host = parseApiHost()
  sampleFiles.pdf = `${host}/file/dev/smoke-e2e/smoke.pdf`
  sampleFiles.docx = `${host}/file/dev/smoke-e2e/smoke.docx`
  sampleFiles.tex = `${host}/file/dev/smoke-e2e/smoke.tex`
  sampleFiles.zip = `${host}/file/dev/smoke-e2e/smoke.zip`
}

const streamAcademic = async ({ token, payload, timeoutMs = 60000 }) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  const result = {
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
    result.status = res.status
    if (!res.ok || !res.body) {
      result.error = `http_${res.status}`
      return result
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
        result.lines.push(line)
        let obj = null
        try {
          obj = JSON.parse(line)
        } catch (_e) {}
        if (obj && typeof obj === 'object') {
          const content = obj.content
          if (Array.isArray(content) && content.length > 0) {
            result.hasAnyContent = true
          }
          if (typeof obj.finalContent === 'string' && obj.finalContent.trim()) {
            result.finalContent = obj.finalContent
            result.hasAnyContent = true
          }
          if (typeof obj.finishReason === 'string') {
            result.finishReason = obj.finishReason
          }
          if (obj.fileVectorResult) {
            result.hasFileVector = true
          }
          if (obj.streamError) {
            result.error = String(obj.streamError)
          }
        } else {
          if (line.trim()) result.hasAnyContent = true
        }
        idx = buffer.indexOf('\n')
      }
    }

    if (buffer.trim()) {
      const line = buffer.trim()
      result.lines.push(line)
      try {
        const obj = JSON.parse(line)
        if (typeof obj.finalContent === 'string' && obj.finalContent.trim()) {
          result.finalContent = obj.finalContent
          result.hasAnyContent = true
        }
        if (typeof obj.finishReason === 'string') result.finishReason = obj.finishReason
        if (obj.fileVectorResult) result.hasFileVector = true
      } catch (_e) {
        result.hasAnyContent = true
      }
    }

    const isErrorFinish = String(result.finishReason || '').toLowerCase() === 'error'
    result.ok =
      !isErrorFinish &&
      (result.finishReason === 'stop' || Boolean(result.finalContent) || result.hasFileVector)
    if (!result.ok && !result.error) {
      result.error = isErrorFinish ? 'finish_reason_error' : 'no_renderable_result'
    }
    return result
  } catch (e) {
    result.error = e?.message || 'stream_error'
    return result
  } finally {
    clearTimeout(timer)
  }
}

const formatCase = c => `${c.kind}:${c.name}`

const main = async () => {
  const summary = { pass: [], fail: [] }

  const login = await request('/auth/login', {
    method: 'POST',
    body: { username: LOGIN_USER, password: LOGIN_PASS },
  })
  if (!login.ok || !login.json?.data) {
    throw new Error(`login_failed: ${login.status} ${login.text.slice(0, 200)}`)
  }
  const token = login.json.data
  const tokenPayload = decodeJwtPayload(token)
  const userId = Number(tokenPayload?.id || 0)
  const role = String(tokenPayload?.role || '')

  const modelMeta = await resolveModelMeta(token)
  const balanceGuard = await ensureTestBalance({
    token,
    userId,
    role,
    modelType: modelMeta.modelType,
  })

  const groupRes = await request('/group/create', { method: 'POST', token, body: {} })
  const groupId = groupRes.json?.data?.id || groupRes.json?.id
  if (!groupId) throw new Error(`group_create_failed: ${groupRes.text.slice(0, 200)}`)
  await prepareSampleFiles()

  const coreRes = await request('/academic/core-function-list', { method: 'POST', token, body: {} })
  const pluginRes = await request('/academic/plugin-list', { method: 'POST', token, body: {} })
  const cores = coreRes.json?.data?.rows || []
  const plugins = pluginRes.json?.data?.rows || []

  const cases = []
  for (const core of cores) {
    cases.push({ kind: 'core', name: core.displayName || core.name, requestName: core.name })
  }
  if (!SMOKE_CORE_ONLY) {
    const filteredPlugins = plugins.filter(
      plugin => String(plugin.displayName || plugin.name) !== '不启用',
    )
    const pluginsToRun =
      SMOKE_PLUGIN_LIMIT > 0 ? filteredPlugins.slice(0, SMOKE_PLUGIN_LIMIT) : filteredPlugins
    for (const plugin of pluginsToRun) {
      cases.push({
        kind: 'plugin',
        name: plugin.displayName || plugin.name,
        requestName: plugin.name,
      })
    }
  }

  const chooseFileUrl = name => {
    const n = String(name || '')
    if (/论文速读/.test(n)) return sampleFiles.pdf
    if (/PDF/.test(n)) return sampleFiles.pdf
    if (/Word/.test(n)) return sampleFiles.docx
    if (/LaTeX|Tex|latex/i.test(n)) return sampleFiles.tex
    if (/解析|注释|Notebook|Markdown|README|函数注释/.test(n)) return sampleFiles.zip
    return ''
  }

  for (const testCase of cases) {
    const payload = {
      function: testCase.kind === 'plugin' ? 'plugin' : 'basic',
      plugin_name: testCase.kind === 'plugin' ? testCase.requestName : undefined,
      core_function: testCase.kind === 'core' ? testCase.requestName : undefined,
      plugin_kwargs: {},
      main_input: /Arxiv/.test(testCase.name) ? '1706.03762' : '请简要说明测试通过',
      model: modelMeta.model,
      modelName: modelMeta.modelName,
      modelType: modelMeta.modelType,
      options: {
        groupId,
        usingNetwork: false,
        usingDeepThinking: false,
      },
    }

    const fileUrl = chooseFileUrl(testCase.name)
    if (fileUrl) payload.fileUrl = fileUrl

    const timeoutMs = /Arxiv|LaTeX|Word|PDF|论文速读|解析整个Python项目|批量生成函数注释|注释整个Python项目|解析项目源代码|历史上的今天/.test(
      testCase.name,
    )
      ? 180000
      : 60000
    let rs = await streamAcademic({ token, payload, timeoutMs })
    if (!rs.ok) {
      rs = await streamAcademic({ token, payload, timeoutMs })
    }
    const outputText = String(rs.finalContent || rs.lines.join('\n') || '')
    const hardErrorPattern =
      /(?:Traceback|插件调用出错|学术后端未返回可展示内容|已收到请求，但未返回可展示内容)/i
    const hasHardError = hardErrorPattern.test(outputText)

    const row = {
      case: formatCase(testCase),
      finishReason: rs.finishReason || '',
      finalLen: rs.finalContent.length,
      hasFileVector: rs.hasFileVector,
      hasAnyContent: rs.hasAnyContent,
      error: rs.error || '',
      preview: outputText.slice(0, 100),
      hardError: hasHardError,
    }

    if (rs.ok && !hasHardError) {
      summary.pass.push(row)
      console.log(`[PASS] ${row.case} len=${row.finalLen} file=${row.hasFileVector}`)
    } else {
      summary.fail.push(row)
      console.log(`[FAIL] ${row.case} reason=${row.error || row.finishReason || 'unknown'} hard=${hasHardError}`)
    }

    await sleep(250)
  }

  const adminChecks = [
    ['/auth/getInfo', 'GET'],
    ['/config/queryAll', 'GET'],
    ['/config/queryFront?domain=http://localhost:9002', 'GET'],
    ['/models/list', 'GET'],
    ['/models/query?page=1&size=5', 'GET'],
    ['/plugin/pluginList?page=1&size=5', 'GET'],
    ['/group/query?page=1&size=5', 'GET'],
    ['/app/list', 'GET'],
    ['/app/queryAppCats?page=1&size=5', 'GET'],
    ['/app/queryApp?page=1&size=5', 'GET'],
    ['/chatLog/chatList?groupId=' + groupId, 'GET'],
    ['/chatLog/chatAll?page=1&size=5', 'GET'],
    ['/balance/query', 'GET'],
    ['/balance/accountLog?page=1&size=5', 'GET'],
    ['/order/queryAll?page=1&size=5', 'GET'],
    ['/signin/signinLog?page=1&size=5', 'GET'],
    ['/crami/queryAllPackage?page=1&size=5', 'GET'],
    ['/crami/queryAllCrami?page=1&size=5', 'GET'],
    ['/badWords/query?page=1&size=5', 'GET'],
    ['/autoReply/query?page=1&size=5', 'GET'],
    ['/user/queryAll?page=1&size=5', 'GET'],
    ['/statistic/base', 'GET'],
    ['/statistic/chatStatistic?days=7', 'GET'],
    ['/statistic/baiduVisit?days=7', 'GET'],
    ['/statistic/observerCharts?days=7', 'GET'],
  ]

  const admin = []
  for (const [path, method] of adminChecks) {
    const rs = await request(path, { method, token })
    const item = { path, method, ok: rs.ok, status: rs.status, message: rs.json?.message || '' }
    admin.push(item)
    if (!item.ok) {
      console.log(`[ADMIN_FAIL] ${method} ${path} => ${item.status}`)
    }
  }

  console.log(
    JSON.stringify(
      {
        summary,
        admin,
        groupId,
        modelMeta,
        balanceGuard,
        totalCases: cases.length,
        passCount: summary.pass.length,
        failCount: summary.fail.length,
      },
      null,
      2,
    ),
  )
  process.exit(summary.fail.length > 0 ? 1 : 0)
}

main().catch(err => {
  console.error('[full_smoke_test] fatal:', err)
  process.exit(2)
})
