import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import dotenv from 'dotenv'
import Redis from 'ioredis'
import mysql from 'mysql2/promise'
import bcrypt from 'bcryptjs'

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
const NAMESPACE = process.env.NAMESPACE || 'Lens'
const PERF_SEQ = Number(process.env.PERF_SEQ || 20)
const PERF_CONC = Number(process.env.PERF_CONC || 20)

const report = {
  startedAt: new Date().toISOString(),
  env: {
    base: BASE,
    serviceDir: SERVICE_DIR,
  },
  sections: {
    login: [],
    core: [],
    balance: [],
    admin: [],
    security: [],
    performance: [],
  },
  metrics: {},
  blockers: [],
  errors: [],
}

const addResult = (section, name, ok, detail = {}) => {
  report.sections[section].push({ name, ok, ...detail })
}

const addBlocker = (title, detail) => {
  report.blockers.push({ title, detail })
}

const request = async (
  apiPath,
  { method = 'GET', token = '', body = null, timeoutMs = 45000, rawBody = null } = {},
) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  const started = Date.now()
  try {
    const headers = {}
    if (token) headers.Authorization = `Bearer ${token}`
    if (body != null) headers['Content-Type'] = 'application/json'
    const res = await fetch(`${BASE}${apiPath}`, {
      method,
      headers,
      body: rawBody != null ? rawBody : body != null ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    const text = await res.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch (_e) {}
    return {
      ok: res.ok,
      status: res.status,
      text,
      json,
      ms: Date.now() - started,
    }
  } finally {
    clearTimeout(timer)
  }
}

const decodeJwtPayload = token => {
  try {
    const payload = String(token || '').split('.')[1] || ''
    if (!payload) return {}
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
  } catch (_e) {
    return {}
  }
}

const getMysql = async () =>
  mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_DATABASE,
  })

const getRedis = () => {
  if (process.env.REDIS_URL) {
    return new Redis(process.env.REDIS_URL)
  }
  return new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    username: process.env.REDIS_USER || undefined,
    db: Number(process.env.REDIS_DB || 0),
  })
}

const setCaptchaCode = async (contact, code) => {
  const redis = getRedis()
  try {
    const key = `${NAMESPACE}:CODE:${contact}`
    await redis.set(key, code, 'EX', 600)
    const value = await redis.get(key)
    return value === code
  } finally {
    await redis.quit()
  }
}

const pickToken = rs => rs?.json?.data || ''

const ensureSuperAccount = async () => {
  let login = await request('/auth/login', {
    method: 'POST',
    body: { username: SUPER_USER, password: SUPER_PASS },
    timeoutMs: 20000,
  })
  if (login.ok && pickToken(login)) {
    return { token: pickToken(login), repaired: false }
  }

  const conn = await getMysql()
  try {
    const [rows] = await conn.query(
      "SELECT id, username, role, status FROM users WHERE role = 'super' OR username = ? LIMIT 1",
      [SUPER_USER],
    )
    const hash = bcrypt.hashSync(SUPER_PASS, 10)
    let superId = 0

    if (!rows.length) {
      const [insertRs] = await conn.query(
        'INSERT INTO users (username, password, status, email, role, sex) VALUES (?, ?, ?, ?, ?, ?)',
        [SUPER_USER, hash, 1, SUPER_USER, 'super', 1],
      )
      superId = Number(insertRs.insertId || 0)
    } else {
      superId = Number(rows[0].id || 0)
      await conn.query('UPDATE users SET role = ?, status = ?, password = ? WHERE id = ?', [
        'super',
        1,
        hash,
        superId,
      ])
    }

    if (superId > 0) {
      const [balanceRows] = await conn.query('SELECT id FROM user_balances WHERE userId = ? LIMIT 1', [
        superId,
      ])
      if (!balanceRows.length) {
        await conn.query(
          'INSERT INTO user_balances (userId, model3Count, model4Count, drawMjCount, packageId, memberModel3Count, memberModel4Count, memberDrawMjCount, appCats) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [superId, 0, 0, 0, 0, 0, 0, 0, ''],
        )
      }
    }
  } finally {
    await conn.end()
  }

  login = await request('/auth/login', {
    method: 'POST',
    body: { username: SUPER_USER, password: SUPER_PASS },
    timeoutMs: 20000,
  })
  const token = pickToken(login)
  if (!token) {
    throw new Error(`super_account_repair_failed: ${login.status} ${login.text.slice(0, 200)}`)
  }
  return { token, repaired: true }
}

const streamAcademic = async ({ token, payload, timeoutMs = 120000 }) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort('timeout'), timeoutMs)
  const rs = {
    ok: false,
    status: 0,
    finalContent: '',
    finishReason: '',
    hasAnyContent: false,
    hasFileVector: false,
    error: '',
    textPreview: '',
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
      rs.textPreview = (await res.text()).slice(0, 160)
      return rs
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const lines = []

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
        lines.push(line)
        let obj = null
        try {
          obj = JSON.parse(line)
        } catch (_e) {}
        if (obj && typeof obj === 'object') {
          if (typeof obj.finalContent === 'string' && obj.finalContent.trim()) {
            rs.finalContent = obj.finalContent
            rs.hasAnyContent = true
          }
          if (typeof obj.finishReason === 'string') rs.finishReason = obj.finishReason
          if (obj.fileVectorResult) rs.hasFileVector = true
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

    if (buffer.trim()) lines.push(buffer.trim())
    const outputText = String(rs.finalContent || lines.join('\n') || '')
    rs.textPreview = outputText.slice(0, 200)
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
    rs.textPreview = rs.error
    return rs
  } finally {
    clearTimeout(timer)
  }
}

const percentile = (arr, p) => {
  if (!arr.length) return 0
  const sorted = [...arr].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

const runAdminSmoke = () => {
  const rs = spawnSync(process.execPath, ['scripts/admin_write_smoke_test.mjs'], {
    cwd: SERVICE_DIR,
    env: {
      ...process.env,
      LOGIN_USER: SUPER_USER,
      LOGIN_PASS: SUPER_PASS,
      BASE_URL: BASE,
    },
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  })
  let parsed = null
  try {
    parsed = JSON.parse(String(rs.stdout || '{}'))
  } catch (_e) {}
  return {
    ok: rs.status === 0,
    exitCode: Number(rs.status ?? -1),
    parsed,
    stderr: String(rs.stderr || ''),
  }
}

const parseApiHost = () => {
  const parsed = new URL(BASE)
  return `${parsed.protocol}//${parsed.host}`
}

const resolveAcademicModelForGate = async token => {
  const preferred = 'deepseek-v3.2'
  const modelListRs = await request('/models/list', { method: 'GET', token, timeoutMs: 30000 })
  const modelMaps = modelListRs.json?.data?.modelMaps || {}
  const candidates = Object.values(modelMaps).flatMap(group => (Array.isArray(group) ? group : []))
  const validCandidates = candidates
    .map(item => ({
      model: String(item?.model || '').trim(),
      modelName: String(item?.modelName || item?.model || '').trim(),
    }))
    .filter(item => item.model)

  const byPreferred = validCandidates.find(
    item =>
      item.model.toLowerCase() === preferred ||
      item.modelName.toLowerCase() === preferred ||
      (item.model.toLowerCase().includes('deepseek') && item.model.includes('3.2')) ||
      (item.modelName.toLowerCase().includes('deepseek') && item.modelName.includes('3.2')),
  )
  if (byPreferred) {
    return {
      ok: true,
      model: byPreferred.model,
      modelName: byPreferred.modelName || byPreferred.model,
      source: 'models/list',
      candidates: validCandidates.slice(0, 20),
    }
  }

  if (validCandidates.length > 0) {
    return {
      ok: true,
      model: validCandidates[0].model,
      modelName: validCandidates[0].modelName || validCandidates[0].model,
      source: 'models/list:first',
      candidates: validCandidates.slice(0, 20),
    }
  }

  const baseConfigRs = await request('/models/baseConfig', { method: 'GET', token, timeoutMs: 30000 })
  const baseModel = String(baseConfigRs.json?.data?.modelInfo?.model || '').trim()
  const baseModelName = String(baseConfigRs.json?.data?.modelInfo?.modelName || baseModel || '').trim()
  if (baseModel) {
    return {
      ok: true,
      model: baseModel,
      modelName: baseModelName || baseModel,
      source: 'models/baseConfig',
      candidates: [],
    }
  }

  return {
    ok: false,
    model: '',
    modelName: '',
    source: 'none',
    candidates: [],
  }
}

const main = async () => {
  let superToken = ''
  let superUserId = 0
  let userToken = ''
  let userId = 0
  let userEmail = ''
  let coreName = ''
  let groupId = 0
  let resolvedAcademicModel = { ok: false, model: '', modelName: '', source: 'none', candidates: [] }

  try {
    const superInfo = await ensureSuperAccount()
    superToken = superInfo.token
    const superPayload = decodeJwtPayload(superToken)
    superUserId = Number(superPayload.id || 0)
    addResult('login', 'super账号可登录（必要时自动修复）', Boolean(superToken), {
      repaired: superInfo.repaired,
      superUserId,
    })

    const wrongPass = await request('/auth/login', {
      method: 'POST',
      body: { username: SUPER_USER, password: `${SUPER_PASS}_wrong` },
    })
    addResult('login', '错误密码提示', !wrongPass.ok, {
      status: wrongPass.status,
      message: wrongPass.json?.message || wrongPass.text.slice(0, 120),
    })

    const unauth = await request('/auth/getInfo', { method: 'GET', timeoutMs: 15000 })
    addResult('login', '未登录访问拦截', !unauth.ok && unauth.status === 401, {
      status: unauth.status,
      message: unauth.json?.message || unauth.text.slice(0, 120),
    })

    const getInfoOk = await request('/auth/getInfo', { token: superToken, timeoutMs: 15000 })
    const logoutRs = await request('/auth/logout', {
      method: 'POST',
      token: superToken,
      timeoutMs: 15000,
    })
    const logoutCheck = await request('/auth/getInfo', { token: superToken, timeoutMs: 15000 })
    addResult('login', '退出登录（服务端立即失效token）', getInfoOk.ok && logoutRs.ok && !logoutCheck.ok, {
      loginStatus: getInfoOk.status,
      logoutStatus: logoutRs.status,
      postLogoutStatus: logoutCheck.status,
    })
    const reloginRs = await request('/auth/login', {
      method: 'POST',
      body: { username: SUPER_USER, password: SUPER_PASS },
      timeoutMs: 20000,
    })
    superToken = pickToken(reloginRs)
    addResult('login', '退出后可重新登录', Boolean(superToken), {
      status: reloginRs.status,
    })
    if (!superToken) {
      throw new Error(`relogin_after_logout_failed: ${reloginRs.status} ${reloginRs.text.slice(0, 160)}`)
    }

    addResult('core', '后台CRUD冒烟（admin_write_smoke_test）', false, { pending: true })
    const adminSmoke = runAdminSmoke()
    report.sections.core[report.sections.core.length - 1] = {
      name: '后台CRUD冒烟（admin_write_smoke_test）',
      ok: adminSmoke.ok,
      exitCode: adminSmoke.exitCode,
      failCount: Number(adminSmoke.parsed?.fail || 0),
      total: Number(adminSmoke.parsed?.total || 0),
      stderrPreview: adminSmoke.stderr.slice(0, 160),
    }

    // 创建测试用户（验证码登录，若不存在自动创建）
    userEmail = `pg${Date.now().toString().slice(-8)}@t.cn`
    const code = '246810'
    const codeReady = await setCaptchaCode(userEmail, code)
    addResult('login', '验证码注入可用', codeReady, { userEmail })
    if (!codeReady) throw new Error('captcha_inject_failed')

    const userLogin = await request('/auth/login', {
      method: 'POST',
      body: { username: userEmail, captchaId: code },
      timeoutMs: 60000,
    })
    userToken = pickToken(userLogin)
    userId = Number(decodeJwtPayload(userToken).id || 0)
    addResult('login', '普通用户注册/登录可用', Boolean(userToken && userId > 0), {
      status: userLogin.status,
      userId,
    })
    if (!userToken || !userId) throw new Error('user_login_failed')

    // 后台系统：查看用户、修改（重置密码）、禁用用户、立即生效
    const queryUsers = await request('/user/queryAll?page=1&size=20', {
      token: superToken,
      timeoutMs: 30000,
    })
    const listedUser = Array.isArray(queryUsers.json?.data?.rows)
      ? queryUsers.json.data.rows.some(row => Number(row.id) === userId)
      : false
    addResult('admin', '后台查看用户', queryUsers.ok && listedUser, {
      status: queryUsers.status,
      listedUser,
    })

    const resetPass = await request('/user/resetUserPass', {
      method: 'POST',
      token: superToken,
      body: { id: userId },
      timeoutMs: 30000,
    })
    const loginAfterReset = await request('/auth/login', {
      method: 'POST',
      body: { username: userEmail, password: '123456' },
      timeoutMs: 30000,
    })
    addResult('admin', '后台修改用户（重置密码）', resetPass.ok && loginAfterReset.ok, {
      resetStatus: resetPass.status,
      loginStatus: loginAfterReset.status,
    })

    const lockUser = await request('/user/updateStatus', {
      method: 'POST',
      token: superToken,
      body: { id: userId, status: 2 },
      timeoutMs: 30000,
    })
    const loginWhenLocked = await request('/auth/login', {
      method: 'POST',
      body: { username: userEmail, password: '123456' },
      timeoutMs: 30000,
    })
    const unlockUser = await request('/user/updateStatus', {
      method: 'POST',
      token: superToken,
      body: { id: userId, status: 1 },
      timeoutMs: 30000,
    })
    const loginAfterUnlock = await request('/auth/login', {
      method: 'POST',
      body: { username: userEmail, password: '123456' },
      timeoutMs: 30000,
    })
    addResult('admin', '后台禁用用户并立即生效',
      lockUser.ok && !loginWhenLocked.ok && unlockUser.ok && loginAfterUnlock.ok,
      {
        lockStatus: lockUser.status,
        lockedLoginStatus: loginWhenLocked.status,
        unlockStatus: unlockUser.status,
        unlockLoginStatus: loginAfterUnlock.status,
      },
    )
    const refreshedUserToken = pickToken(loginAfterUnlock) || pickToken(loginAfterReset)
    if (refreshedUserToken) {
      userToken = refreshedUserToken
    }

    // 积分系统：后台加积分、生效、落库
    const beforeRecharge = await request('/balance/query', { token: userToken, timeoutMs: 20000 })
    const beforeSum = Number(beforeRecharge.json?.data?.sumModel3Count || 0)
    const rechargeRs = await request('/user/recharge', {
      method: 'POST',
      token: superToken,
      body: { userId, model3Count: 8, model4Count: 0, drawMjCount: 0 },
      timeoutMs: 30000,
    })
    const afterRecharge = await request('/balance/query', { token: userToken, timeoutMs: 20000 })
    const afterSum = Number(afterRecharge.json?.data?.sumModel3Count || 0)
    addResult('balance', '后台修改积分即时生效', rechargeRs.ok && afterSum - beforeSum >= 8, {
      beforeSum,
      afterSum,
      delta: afterSum - beforeSum,
      status: rechargeRs.status,
    })

    const conn = await getMysql()
    let accountLogExists = false
    let balanceRow = null
    try {
      const [logRows] = await conn.query(
        'SELECT id, userId, rechargeType, model3Count, createdAt FROM account_log WHERE userId = ? AND rechargeType = 5 ORDER BY id DESC LIMIT 1',
        [userId],
      )
      accountLogExists = Array.isArray(logRows) && logRows.length > 0
      const [balanceRows] = await conn.query(
        'SELECT userId, model3Count, memberModel3Count, useModel3Count, useModel3Token FROM user_balances WHERE userId = ? LIMIT 1',
        [userId],
      )
      balanceRow = Array.isArray(balanceRows) && balanceRows[0] ? balanceRows[0] : null
    } finally {
      await conn.end()
    }
    addResult('balance', '积分充值记录真实落库(account_log)', accountLogExists, {
      accountLogExists,
    })

    // 学术核心能力 + 扣积分校验
    const groupRs = await request('/group/create', {
      method: 'POST',
      token: userToken,
      body: {},
      timeoutMs: 30000,
    })
    groupId = Number(groupRs.json?.data?.id || 0)

    const coreList = await request('/academic/core-function-list', {
      method: 'POST',
      token: userToken,
      body: {},
      timeoutMs: 30000,
    })
    coreName = String(coreList.json?.data?.rows?.[0]?.name || '')
    if (!coreName) {
      addBlocker('学术核心功能列表为空', 'academic/core-function-list 未返回任何核心功能')
    }

    resolvedAcademicModel = await resolveAcademicModelForGate(superToken)
    addResult('core', '学术模型可解析（优先deepseek-v3.2）', resolvedAcademicModel.ok, {
      source: resolvedAcademicModel.source,
      model: resolvedAcademicModel.model,
      modelName: resolvedAcademicModel.modelName,
      candidateCount: resolvedAcademicModel.candidates.length,
    })
    const beforeDeduct = await request('/balance/query', { token: userToken, timeoutMs: 20000 })
    const academicPayload = {
      function: 'basic',
      core_function: coreName,
      plugin_kwargs: {},
      main_input: '请简要说明测试通过',
      model: resolvedAcademicModel.model,
      modelName: resolvedAcademicModel.modelName || resolvedAcademicModel.model,
      modelType: 1,
      options: {
        groupId,
        usingNetwork: false,
        usingDeepThinking: false,
      },
    }
    const academicOne = coreName
      ? await streamAcademic({ token: userToken, payload: academicPayload, timeoutMs: 120000 })
      : { ok: false, status: 0, error: 'no_core_name', textPreview: '' }
    const afterDeduct = await request('/balance/query', { token: userToken, timeoutMs: 20000 })
    const deducted =
      Number(beforeDeduct.json?.data?.sumModel3Count || 0) > Number(afterDeduct.json?.data?.sumModel3Count || 0) ||
      Number(afterDeduct.json?.data?.useModel3Count || 0) > Number(beforeDeduct.json?.data?.useModel3Count || 0)

    addResult('balance', '正常调用学术功能并扣积分', academicOne.ok && deducted, {
      coreName,
      streamStatus: academicOne.status,
      finishReason: academicOne.finishReason,
      streamError: academicOne.error,
      deducted,
      preview: academicOne.textPreview,
    })

    // 不足积分拦截
    const conn2 = await getMysql()
    try {
      await conn2.query(
        'UPDATE user_balances SET model3Count = 0, memberModel3Count = 0, packageId = 0 WHERE userId = ?',
        [userId],
      )
    } finally {
      await conn2.end()
    }
    const insufficient = await streamAcademic({ token: userToken, payload: academicPayload, timeoutMs: 40000 })
    addResult('balance', '不足积分拦截', !insufficient.ok && insufficient.status === 402, {
      status: insufficient.status,
      error: insufficient.error,
      preview: insufficient.textPreview,
    })

    // 并发点击重复扣费/越扣校验
    const conn3 = await getMysql()
    try {
      await conn3.query(
        'UPDATE user_balances SET model3Count = 1, memberModel3Count = 0, packageId = 0, useModel3Count = 0, useModel3Token = 0 WHERE userId = ?',
        [userId],
      )
    } finally {
      await conn3.end()
    }

    const concurrentPayload = {
      ...academicPayload,
      options: {
        groupId,
        usingNetwork: false,
        usingDeepThinking: false,
      },
      main_input: '并发扣费一致性测试',
    }

    const [c1, c2] = await Promise.all([
      streamAcademic({ token: userToken, payload: concurrentPayload, timeoutMs: 120000 }),
      streamAcademic({ token: userToken, payload: concurrentPayload, timeoutMs: 120000 }),
    ])
    const afterConcurrent = await request('/balance/query', { token: userToken, timeoutMs: 20000 })
    const successCount = [c1, c2].filter(item => item.ok).length
    const remain = Number(afterConcurrent.json?.data?.sumModel3Count || 0)
    const used = Number(afterConcurrent.json?.data?.useModel3Count || 0)
    const concurrencyOk = successCount <= 1 && remain >= 0 && used <= 1
    addResult('balance', '并发点击不应出现重复成功扣费', concurrencyOk, {
      successCount,
      remain,
      used,
      first: { ok: c1.ok, status: c1.status, error: c1.error },
      second: { ok: c2.ok, status: c2.status, error: c2.error },
    })
    if (!concurrencyOk) {
      addBlocker('并发扣费一致性失败', '同一余额下并发请求出现多个成功或扣费数据异常')
    }

    // DB 扣费痕迹
    const conn4 = await getMysql()
    let chatLogExists = false
    try {
      const [rows] = await conn4.query(
        "SELECT id, userId, role, totalTokens, createdAt FROM chatlog WHERE userId = ? AND role = 'assistant' ORDER BY id DESC LIMIT 1",
        [userId],
      )
      chatLogExists = Array.isArray(rows) && rows.length > 0
    } finally {
      await conn4.end()
    }
    addResult('balance', '扣费调用后存在对话落库(chatlog)', chatLogExists, {
      chatLogExists,
    })

    // 安全测试
    const sqlInjectionLogin = await request('/auth/login', {
      method: 'POST',
      body: { username: "super' OR '1'='1", password: 'anything' },
      timeoutMs: 20000,
    })
    addResult('security', 'SQL注入登录拦截', !sqlInjectionLogin.ok, {
      status: sqlInjectionLogin.status,
      message: sqlInjectionLogin.json?.message || sqlInjectionLogin.text.slice(0, 120),
    })

    const xssPayload = '<img src=x onerror=alert(1)><script>alert(1)</script><a href="javascript:alert(1)">x</a>'
    const shareCreate = await request('/share/create', {
      method: 'POST',
      token: superToken,
      body: { htmlContent: xssPayload },
      timeoutMs: 30000,
    })
    let xssSafe = false
    if (shareCreate.ok) {
      const raw = String(shareCreate.json?.data?.shareCode || shareCreate.json?.shareCode || '')
      const code = raw.includes('shareCode=') ? raw.split('shareCode=')[1] : raw
      const shareGet = await request(`/share/${code}`, { method: 'GET', timeoutMs: 20000 })
      const html = String(shareGet.json?.data?.htmlContent || shareGet.json?.htmlContent || shareGet.text || '')
      xssSafe = !/(<script\b|onerror\s*=|javascript:)/i.test(html)
    }
    addResult('security', 'XSS注入过滤（share）', xssSafe, {
      status: shareCreate.status,
    })
    if (!xssSafe) {
      addBlocker('XSS 风险未完全拦截', 'share 内容可回显潜在脚本或事件注入')
    }

    const privilege = await request('/user/queryAll?page=1&size=5', {
      token: userToken,
      timeoutMs: 20000,
    })
    addResult('security', '越权访问接口拦截（普通用户访问后台用户列表）', !privilege.ok, {
      status: privilege.status,
      message: privilege.json?.message || privilege.text.slice(0, 120),
    })

    const frontConfig = await request('/config/queryFront?domain=http://localhost:9002', {
      method: 'GET',
      timeoutMs: 20000,
    })
    const frontText = JSON.stringify(frontConfig.json || frontConfig.text || '')
    const noSensitiveLeak = !/openaiBaseKey|JWT_SECRET|REDIS_PASSWORD|DB_PASS/i.test(frontText)
    addResult('security', '前台配置不泄露敏感字段', noSensitiveLeak, {
      status: frontConfig.status,
    })

    const emptyLogin = await request('/auth/login', {
      method: 'POST',
      body: { username: '', password: '' },
      timeoutMs: 20000,
    })
    const longLogin = await request('/auth/login', {
      method: 'POST',
      body: { username: 'a'.repeat(400), password: 'b'.repeat(400) },
      timeoutMs: 20000,
    })
    const badWordLong = await request('/badWords/add', {
      method: 'POST',
      token: superToken,
      body: { word: 'x'.repeat(24) },
      timeoutMs: 20000,
    })
    addResult(
      'security',
      '边界输入（空值/超长/特殊）处理',
      !emptyLogin.ok && !longLogin.ok && !badWordLong.ok,
      {
        emptyStatus: emptyLogin.status,
        longStatus: longLogin.status,
        badWordStatus: badWordLong.status,
      },
    )

    // 性能测试
    const firstLoad = await request('/config/queryFront?domain=http://localhost:9002', {
      method: 'GET',
      timeoutMs: 20000,
    })

    const seqDurations = []
    let seqFail = 0
    for (let i = 0; i < PERF_SEQ; i++) {
      const rs = await request('/config/queryFront?domain=http://localhost:9002', {
        method: 'GET',
        timeoutMs: 20000,
      })
      seqDurations.push(rs.ms)
      if (!rs.ok) seqFail += 1
      await sleep(40)
    }

    const concRuns = await Promise.all(
      Array.from({ length: PERF_CONC }).map(() =>
        request('/config/queryFront?domain=http://localhost:9002', {
          method: 'GET',
          timeoutMs: 20000,
        }),
      ),
    )
    const concDurations = concRuns.map(item => item.ms)
    const concFail = concRuns.filter(item => !item.ok).length

    const authDurations = []
    let authFail = 0
    for (let i = 0; i < PERF_SEQ; i++) {
      const rs = await request('/auth/getInfo', {
        method: 'GET',
        token: superToken,
        timeoutMs: 20000,
      })
      authDurations.push(rs.ms)
      if (!rs.ok) authFail += 1
    }

    report.metrics.performance = {
      firstLoadMs: firstLoad.ms,
      seqAvgMs: Number((seqDurations.reduce((a, b) => a + b, 0) / Math.max(seqDurations.length, 1)).toFixed(2)),
      seqP95Ms: percentile(seqDurations, 95),
      seqMaxMs: Math.max(...seqDurations),
      seqFail,
      concAvgMs: Number((concDurations.reduce((a, b) => a + b, 0) / Math.max(concDurations.length, 1)).toFixed(2)),
      concP95Ms: percentile(concDurations, 95),
      concMaxMs: Math.max(...concDurations),
      concFail,
      authAvgMs: Number((authDurations.reduce((a, b) => a + b, 0) / Math.max(authDurations.length, 1)).toFixed(2)),
      authP95Ms: percentile(authDurations, 95),
      authMaxMs: Math.max(...authDurations),
      authFail,
    }

    const perfOk =
      firstLoad.ok &&
      firstLoad.ms <= 1500 &&
      seqFail === 0 &&
      concFail === 0 &&
      authFail === 0 &&
      report.metrics.performance.seqP95Ms <= 1500 &&
      report.metrics.performance.concP95Ms <= 2000 &&
      report.metrics.performance.authP95Ms <= 1500

    addResult('performance', '首次加载/连续请求/并发请求性能', perfOk, report.metrics.performance)
    if (!perfOk) {
      addBlocker('性能未达标', JSON.stringify(report.metrics.performance))
    }

    const host = parseApiHost()
    report.metrics.sampleFileHost = host
  } catch (error) {
    report.errors.push(String(error?.stack || error?.message || error))
  } finally {
    report.finishedAt = new Date().toISOString()
  }

  const allItems = Object.values(report.sections).flatMap(list => list)
  const failItems = allItems.filter(item => !item.ok)
  report.summary = {
    totalChecks: allItems.length,
    passChecks: allItems.length - failItems.length,
    failChecks: failItems.length,
    blockers: report.blockers.length,
    canRelease: failItems.length === 0 && report.blockers.length === 0 && report.errors.length === 0,
  }

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  process.exit(report.summary.canRelease ? 0 : 1)
}

main()
