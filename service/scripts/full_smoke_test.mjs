import { setTimeout as sleep } from 'node:timers/promises'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:9520/api'
const require = createRequire(import.meta.url)
const { localTestCredentials } = require('./local_test_credentials.cjs')
const localCredentials =
  process.env.LOGIN_USER && process.env.LOGIN_PASS
    ? null
    : (() => {
        try {
          return localTestCredentials()
        } catch (_error) {
          return null
        }
      })()
const LOGIN_USER = process.env.LOGIN_USER || localCredentials?.username || ''
const LOGIN_PASS = process.env.LOGIN_PASS || localCredentials?.password || ''
const TARGET_MODEL = process.env.SMOKE_MODEL || 'gpt-5-nano'
const TARGET_MODEL_NAME = process.env.SMOKE_MODEL_NAME || 'GPT-5 nano'
const SMOKE_CORE_ONLY = String(process.env.SMOKE_CORE_ONLY || 'false').toLowerCase() === 'true'
const SMOKE_SKIP_CORE = String(process.env.SMOKE_SKIP_CORE || 'false').toLowerCase() === 'true'
const SMOKE_PLUGIN_LIMIT = Math.max(Number(process.env.SMOKE_PLUGIN_LIMIT || 0), 0)
const SMOKE_PLUGIN_NAME = String(process.env.SMOKE_PLUGIN_NAME || '').trim()
const SMOKE_LONG_TIMEOUT_MS = Math.min(
  Math.max(Number(process.env.SMOKE_LONG_TIMEOUT_MS || 300000), 1000),
  300000,
)
const SMOKE_SESSION_MARKER = 'lens-smoke-e2e'

let activeSmokeToken = ''
let activeSmokeGroupId = 0

const cleanupSmokeSession = async () => {
  if (!activeSmokeToken || !activeSmokeGroupId) {
    return { attempted: false, succeeded: true }
  }
  try {
    const response = await request('/group/del', {
      method: 'POST',
      token: activeSmokeToken,
      body: { groupId: activeSmokeGroupId },
      timeoutMs: 20000,
    })
    return { attempted: true, succeeded: response.ok }
  } catch (_error) {
    return { attempted: true, succeeded: false }
  } finally {
    activeSmokeToken = ''
    activeSmokeGroupId = 0
  }
}
const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const serviceDir = path.resolve(scriptDir, '..')
const lensDir = path.resolve(serviceDir, '..')
const fixtureDir = path.join(serviceDir, 'public/file/dev/smoke-e2e')

const sampleFiles = { pdf: '', docx: '', tex: '', zip: '' }

const pickExistingFile = (...candidates) => candidates.find(p => p && fs.existsSync(p)) || ''

const fixturePaths = {
  pdf: pickExistingFile(
    path.join(fixtureDir, 'smoke.pdf'),
    path.join(serviceDir, 'public/file/dev/e2e-1771408519075/smoke.pdf'),
    path.join(serviceDir, 'public/file/dev/e2e-1771406609693/smoke.pdf'),
    path.join(
      serviceDir,
      'node_modules/.pnpm/pdf-parse@1.1.1/node_modules/pdf-parse/test/data/01-valid.pdf',
    ),
    path.join(lensDir, 'chat/node_modules/pdf-parse/test/data/01-valid.pdf'),
  ),
  docx: pickExistingFile(
    path.join(fixtureDir, 'smoke.docx'),
    path.join(serviceDir, 'public/file/dev/e2e-1771408519075/smoke.docx'),
    path.join(serviceDir, 'public/file/dev/e2e-1771406609693/smoke.docx'),
    path.join(
      serviceDir,
      'node_modules/.pnpm/mammoth@1.9.0/node_modules/mammoth/test/test-data/single-paragraph.docx',
    ),
    path.join(lensDir, 'chat/node_modules/mammoth/test/test-data/single-paragraph.docx'),
  ),
  zip: pickExistingFile(
    path.join(fixtureDir, 'smoke.zip'),
    path.join(serviceDir, 'public/file/dev/e2e-1771408519075/smoke.zip'),
    path.join(serviceDir, 'public/file/dev/e2e-1771406609693/smoke.zip'),
    path.join(
      serviceDir,
      'node_modules/.pnpm/mammoth@1.9.0/node_modules/mammoth/test/test-data/hello.zip',
    ),
    path.join(lensDir, 'chat/node_modules/mammoth/test/test-data/hello.zip'),
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
  const allModels = Object.values(modelMaps).flatMap(list => {
    if (Array.isArray(list)) return list
    if (list && typeof list === 'object') {
      if ('model' in list || 'modelName' in list) return [list]
      return Object.values(list).filter(item => item && typeof item === 'object')
    }
    return []
  })
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

const writeFixtureFile = (targetPath, content) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  fs.writeFileSync(targetPath, content, 'utf8')
}

const buildProjectFixtureZip = zipPath => {
  const sourceDir = path.join(fixtureDir, 'project-src')
  fs.rmSync(sourceDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(sourceDir, 'src'), { recursive: true })
  fs.mkdirSync(path.join(sourceDir, 'docs'), { recursive: true })

  writeFixtureFile(
    path.join(sourceDir, 'main.py'),
    [
      'def summarize_status(status: str) -> str:',
      '    return f"状态：{status}"',
      '',
      'if __name__ == "__main__":',
      '    print(summarize_status("测试通过"))',
      '',
    ].join('\n'),
  )
  writeFixtureFile(
    path.join(sourceDir, 'analysis.m'),
    [
      'function result = analysis(x)',
      'result = mean(x);',
      'end',
      '',
    ].join('\n'),
  )
  writeFixtureFile(
    path.join(sourceDir, 'main.cpp'),
    [
      '#include "helper.hpp"',
      '#include <iostream>',
      'int main() {',
      '  std::cout << helper_message() << std::endl;',
      '  return 0;',
      '}',
      '',
    ].join('\n'),
  )
  writeFixtureFile(
    path.join(sourceDir, 'helper.hpp'),
    [
      '#pragma once',
      '#include <string>',
      'inline std::string helper_message() { return "test passed"; }',
      '',
    ].join('\n'),
  )
  writeFixtureFile(
    path.join(sourceDir, 'main.go'),
    [
      'package main',
      'import "fmt"',
      'func main() {',
      '  fmt.Println("test passed")',
      '}',
      '',
    ].join('\n'),
  )
  writeFixtureFile(
    path.join(sourceDir, 'main.rs'),
    [
      'fn main() {',
      '    println!("test passed");',
      '}',
      '',
    ].join('\n'),
  )
  writeFixtureFile(
    path.join(sourceDir, 'Main.java'),
    [
      'public class Main {',
      '  public static void main(String[] args) {',
      '    System.out.println("test passed");',
      '  }',
      '}',
      '',
    ].join('\n'),
  )
  writeFixtureFile(
    path.join(sourceDir, 'Program.cs'),
    [
      'using System;',
      'class Program {',
      '  static void Main() {',
      '    Console.WriteLine("test passed");',
      '  }',
      '}',
      '',
    ].join('\n'),
  )
  writeFixtureFile(
    path.join(sourceDir, 'main.lua'),
    [
      'local function status()',
      '  return "test passed"',
      'end',
      'print(status())',
      '',
    ].join('\n'),
  )
  writeFixtureFile(
    path.join(sourceDir, 'src/index.ts'),
    [
      'export const message = "test passed";',
      'console.log(message);',
      '',
    ].join('\n'),
  )
  writeFixtureFile(
    path.join(sourceDir, 'src/app.css'),
    [
      'body {',
      '  font-family: sans-serif;',
      '  color: #111;',
      '}',
      '',
    ].join('\n'),
  )
  writeFixtureFile(
    path.join(sourceDir, 'README.md'),
    [
      '# Smoke Project',
      '',
      'This repository is used to test project-analysis plugins.',
      '',
    ].join('\n'),
  )
  writeFixtureFile(
    path.join(sourceDir, 'docs/README.md'),
    [
      '# Notes',
      '',
      'The project contains multiple language samples.',
      '',
    ].join('\n'),
  )
  writeFixtureFile(
    path.join(sourceDir, 'notebook.ipynb'),
    JSON.stringify(
      {
        cells: [
          {
            cell_type: 'markdown',
            metadata: {},
            source: ['# Smoke Notebook\n', 'This notebook is used for plugin validation.\n'],
          },
          {
            cell_type: 'code',
            execution_count: 1,
            metadata: {},
            outputs: [],
            source: ['print("test passed")\n'],
          },
        ],
        metadata: {
          kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
          language_info: { name: 'python', version: '3.11' },
        },
        nbformat: 4,
        nbformat_minor: 5,
      },
      null,
      2,
    ),
  )

  fs.rmSync(zipPath, { force: true })
  execFileSync('zip', ['-qr', zipPath, '.'], { cwd: sourceDir })
}

const prepareSampleFiles = async () => {
  fs.mkdirSync(fixtureDir, { recursive: true })

  const texFixture = path.join(fixtureDir, 'smoke.tex')
  fs.writeFileSync(
    texFixture,
    [
      '\\documentclass{article}',
      '\\begin{document}',
      'This is a smoke test tex file.',
      '\\end{document}',
      '',
    ].join('\n'),
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
  buildProjectFixtureZip(path.join(fixtureDir, 'smoke.zip'))

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
    errorKind: '',
    streamErrorSeen: false,
  }
  const consumeObject = obj => {
    if (!obj || typeof obj !== 'object') return
    const content = obj.content ?? obj.delta ?? obj.text
    if (Array.isArray(content) ? content.length > 0 : typeof content === 'string' && content.trim()) {
      result.hasAnyContent = true
    }
    if (typeof obj.finalContent === 'string' && obj.finalContent.trim()) {
      result.finalContent = obj.finalContent
      result.hasAnyContent = true
    }
    const finish = String(obj.finishReason || obj.finish_reason || '').trim()
    if (finish) {
      result.finishReason =
        finish.toLowerCase() === 'error' || result.finishReason.toLowerCase() === 'error'
          ? 'error'
          : finish
    }
    if (obj.fileVectorResult) result.hasFileVector = true
    if (obj.streamError) result.streamErrorSeen = true
    const error = obj.streamError || obj.error
    if (error) result.error = String(error)
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
    const deadlineAt = Date.now() + timeoutMs
    const readWithDeadline = async () => {
      const remaining = Math.max(deadlineAt - Date.now(), 1)
      let readTimer
      try {
        return await Promise.race([
          reader.read(),
          new Promise((_, reject) => {
            readTimer = setTimeout(() => reject(new Error('stream_read_timeout')), remaining)
          }),
        ])
      } finally {
        if (readTimer) clearTimeout(readTimer)
      }
    }

    while (true) {
      const { done, value } = await readWithDeadline()
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
          consumeObject(obj)
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
        consumeObject(obj)
      } catch (_e) {
        result.hasAnyContent = true
      }
    }

    const isErrorFinish = String(result.finishReason || '').toLowerCase() === 'error'
    result.ok =
      !result.error &&
      !isErrorFinish &&
      (result.finishReason === 'stop' || Boolean(result.finalContent) || result.hasFileVector)
    if (!result.ok && !result.error) {
      result.error = isErrorFinish ? 'finish_reason_error' : 'no_renderable_result'
    }
    return result
  } catch (e) {
    result.errorKind = e?.name || typeof e
    result.error = e?.name ? `stream_${e.name}` : e?.message || 'stream_error'
    return result
  } finally {
    clearTimeout(timer)
  }
}

const formatCase = c => `${c.kind}:${c.name}`

const buildSmokeInput = testCase => {
  if (testCase.kind !== 'plugin') return '请简要说明测试通过，并给出一条可核验的研究建议。'
  const name = String(testCase.name || '')
  if (name === '研究设计体检') {
    return '研究主题：评估在线学习干预对本科生统计焦虑与课程成绩的影响，计划开展为期八周的随机对照研究。'
  }
  if (name === '审稿意见应答') {
    return '1. 请补充样本选择依据与纳入标准。\n2. 请说明统计方法和稳健性检验。'
  }
  if (name === '文献检索策略') {
    return '研究主题：生成关于在线学习干预与统计焦虑关系的系统检索策略。'
  }
  if (name === '整理研究笔记') {
    return '研究主题：将以下研究笔记整理为事实、作者观点、推论和下一步行动。笔记显示样本量为120人，干预组成绩有所提高，但尚未完成长期随访。'
  }
  if (name === '比较多篇论文' || name === '文献综述工作台') {
    return [
      '论文：在线学习干预与统计焦虑',
      '研究问题是在线学习是否降低统计焦虑；采用八周随机对照设计；局限是随访时间较短。',
      '',
      '论文：统计课程中的认知支持',
      '研究问题是认知支持如何影响课程成绩；采用混合方法；局限是样本来自单一院校。',
    ].join('\n')
  }
  if (name === '生成教学材料') {
    return '研究主题：为本科生设计一节关于因果推断基础的课堂教学材料，包含学习目标、活动、练习和评分标准。'
  }
  if (name === '研究问题拆解') {
    return '研究主题：拆解在线学习干预是否降低本科生统计焦虑并改善课程成绩这一可检验问题。'
  }
  if (name === '研究方案设计') {
    return '研究主题：设计一项评估在线学习干预对统计焦虑影响的随机对照研究，明确步骤、交付物、验收标准和前置依赖。'
  }
  return '研究主题：评估在线学习干预对本科生统计焦虑与课程成绩的影响，并列出可核验的研究建议。'
}

const runSmoke = async () => {
  if (!LOGIN_USER || !LOGIN_PASS) {
    throw new Error('local_test_credentials_unavailable')
  }
  const summary = { pass: [], fail: [] }

  const login = await request('/auth/login', {
    method: 'POST',
    body: { username: LOGIN_USER, password: LOGIN_PASS },
  })
  if (!login.ok || !login.json?.data) {
    throw new Error(`login_failed: ${login.status} ${login.text.slice(0, 200)}`)
  }
  const token = login.json.data
  activeSmokeToken = token
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

  const groupRes = await request('/group/create', {
    method: 'POST',
    token,
    body: { params: SMOKE_SESSION_MARKER },
  })
  const groupId = groupRes.json?.data?.id || groupRes.json?.id
  if (!groupId) throw new Error(`group_create_failed: ${groupRes.text.slice(0, 200)}`)
  activeSmokeGroupId = Number(groupId)
  await prepareSampleFiles()

  const coreRes = await request('/academic/core-function-list', { method: 'POST', token, body: {} })
  const pluginRes = await request('/academic/plugin-list', { method: 'POST', token, body: {} })
  const cores = coreRes.json?.data?.rows || []
  const plugins = pluginRes.json?.data?.rows || []

  const cases = []
  if (!SMOKE_SKIP_CORE) {
    for (const core of cores) {
      cases.push({ kind: 'core', name: core.displayName || core.name, requestName: core.name })
    }
  }
  if (!SMOKE_CORE_ONLY) {
    const filteredPlugins = plugins
      .filter(plugin => String(plugin.displayName || plugin.name) !== '不启用')
      .filter(plugin => !SMOKE_PLUGIN_NAME || String(plugin.displayName || plugin.name) === SMOKE_PLUGIN_NAME)
    const pluginsToRun =
      SMOKE_PLUGIN_LIMIT > 0 ? filteredPlugins.slice(0, SMOKE_PLUGIN_LIMIT) : filteredPlugins
    for (const plugin of pluginsToRun) {
      cases.push({
        kind: 'plugin',
        name: plugin.displayName || plugin.name,
        requestName: /^Lens(?:\s|[｜|:：])/.test(String(plugin.name || '').trim())
          ? plugin.displayName || plugin.name
          : plugin.name || plugin.displayName,
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
      main_input: /Arxiv/.test(testCase.name) ? '1706.03762' : buildSmokeInput(testCase),
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
      ? SMOKE_LONG_TIMEOUT_MS
      : 60000
    let rs = await streamAcademic({ token, payload, timeoutMs })
    if (!rs.ok) {
      rs = await streamAcademic({ token, payload, timeoutMs })
    }
    const outputText = String(rs.finalContent || rs.lines.join('\n') || '')
    const hardErrorPattern =
      /(?:Traceback|插件调用出错|学术后端未返回可展示内容|已收到请求，但未返回可展示内容|学术服务连接异常|服务暂时不可用)/i
    const hasHardError =
      Boolean(rs.error) ||
      String(rs.finishReason || '').toLowerCase() === 'error' ||
      hardErrorPattern.test(outputText)

    const row = {
      case: formatCase(testCase),
      status: rs.status,
      lineCount: rs.lines.length,
      finishReason: rs.finishReason || '',
      finalLen: rs.finalContent.length,
      hasFileVector: rs.hasFileVector,
      hasAnyContent: rs.hasAnyContent,
      error: rs.error || '',
      errorKind: rs.errorKind || '',
      streamErrorSeen: rs.streamErrorSeen,
      dataLineCount: rs.lines.filter(line => /^data\s*:/i.test(line)).length,
      jsonLineCount: rs.lines.filter(line => /^\s*\{/.test(line)).length,
      finishMarkerSeen: rs.lines.some(line => /finishReason|\[DONE\]/i.test(line)),
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

  const result = {
    summary,
    admin,
    groupId,
    modelMeta,
    balanceGuard,
    totalCases: cases.length,
    passCount: summary.pass.length,
    failCount: summary.fail.length,
  }
  return result
}

const main = async () => {
  try {
    const result = await runSmoke()
    const cleanup = await cleanupSmokeSession()
    return { ...result, cleanup }
  } catch (error) {
    await cleanupSmokeSession()
    throw error
  }
}

export { main }

const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href

if (isMain) {
  main()
    .then(result => {
      console.log(JSON.stringify(result, null, 2))
      process.exit(result.failCount > 0 || !result.cleanup.succeeded ? 1 : 0)
    })
    .catch(err => {
      console.error('[full_smoke_test] fatal:', err)
      process.exit(2)
    })
}
