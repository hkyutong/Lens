import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { transformSync } from 'esbuild'

const loadTypeScriptModule = relativePath => {
  const filename = path.resolve(new URL('..', import.meta.url).pathname, relativePath)
  const source = fs.readFileSync(filename, 'utf8')
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs', target: 'es2020' })
  const module = { exports: {} }
  new Function('exports', 'module', code)(module.exports, module)
  return module.exports
}

const { parseResearchFiles } = loadTypeScriptModule('src/domain/research/files.ts')
const {
  parseAcademicDownloadFiles,
  parseUserUploadedFiles,
  normalizeExternalDownloadUrl,
  sanitizeDownloadName,
} = loadTypeScriptModule('src/domain/research/downloads.ts')
const { NdjsonStreamDecoder } = loadTypeScriptModule('src/domain/research/ndjson.ts')
const { normalizeAcademicMessageSnapshot, normalizeAcademicStreamEvent } = loadTypeScriptModule(
  'src/domain/research/stream.ts'
)
const {
  completeAcademicResult,
  createAcademicResultState,
  markAcademicResultAborted,
  reduceAcademicResult,
} = loadTypeScriptModule('src/domain/research/result.ts')
const {
  HOME_FEATURED_RESEARCH_TASK_IDS,
  RESEARCH_STARTER_LANES,
  RESEARCH_STARTER_TASKS,
} = loadTypeScriptModule(
  'src/domain/research/starter.ts'
)
const { normalizeExternalSourceUrl, parseAcademicSources } = loadTypeScriptModule(
  'src/domain/research/sources.ts'
)
const { createShareDocument, normalizeShareResultUrl, parseShareCode, sanitizeShareFragment } =
  loadTypeScriptModule('src/domain/research/share.ts')
const { readTextStream } = loadTypeScriptModule('src/domain/research/textStream.ts')
const { canUseAcademicCore, canUseAcademicPlugin, resolveAcademicPlanTier } = loadTypeScriptModule(
  'src/utils/academicPlanAccess.ts'
)

const researchWorkspaceSource = fs.readFileSync(
  path.resolve(new URL('..', import.meta.url).pathname, 'src/views/workbench/ResearchWorkspace.vue'),
  'utf8'
)
const appSource = fs.readFileSync(
  path.resolve(new URL('..', import.meta.url).pathname, 'src/App.vue'),
  'utf8'
)
const sharedHtmlViewSource = fs.readFileSync(
  path.resolve(new URL('..', import.meta.url).pathname, 'src/components/SharedHtmlView.vue'),
  'utf8'
)
const headerSource = fs.readFileSync(
  path.resolve(
    new URL('..', import.meta.url).pathname,
    'src/views/workbench/components/WorkbenchHeader.vue'
  ),
  'utf8'
)
const modelSelectorSource = fs.readFileSync(
  path.resolve(
    new URL('..', import.meta.url).pathname,
    'src/views/workbench/components/ResearchModelSelector.vue'
  ),
  'utf8'
)
const globalStoreSource = fs.readFileSync(
  path.resolve(new URL('..', import.meta.url).pathname, 'src/store/modules/global/index.ts'),
  'utf8'
)
const chatStateHelperSource = fs.readFileSync(
  path.resolve(new URL('..', import.meta.url).pathname, 'src/store/modules/chat/helper.ts'),
  'utf8'
)
const storeModulesSource = fs.readFileSync(
  path.resolve(new URL('..', import.meta.url).pathname, 'src/store/modules/index.ts'),
  'utf8'
)
const workspaceHomeSource = fs.readFileSync(
  path.resolve(
    new URL('..', import.meta.url).pathname,
    'src/views/workbench/components/ResearchStart.vue'
  ),
  'utf8'
)
const academicPanelSource = fs.readFileSync(
  path.resolve(
    new URL('..', import.meta.url).pathname,
    'src/views/workbench/components/CapabilityPanel.vue'
  ),
  'utf8'
)
const messageTextSource = fs.readFileSync(
  path.resolve(
    new URL('..', import.meta.url).pathname,
    'src/views/workbench/components/ResearchRecord/Content/index.vue'
  ),
  'utf8'
)
const messageSource = fs.readFileSync(
  path.resolve(
    new URL('..', import.meta.url).pathname,
    'src/views/workbench/components/ResearchRecord/index.vue'
  ),
  'utf8'
)
const memberCenterSource = fs.readFileSync(
  path.resolve(new URL('..', import.meta.url).pathname, 'src/components/Settings/MemberCenter.vue'),
  'utf8'
)
const shareDomainSource = fs.readFileSync(
  path.resolve(new URL('..', import.meta.url).pathname, 'src/domain/research/share.ts'),
  'utf8'
)
const researchStorageSource = fs.readFileSync(
  path.resolve(new URL('..', import.meta.url).pathname, 'src/domain/research/storage.ts'),
  'utf8'
)
const viteConfigSource = fs.readFileSync(
  path.resolve(new URL('..', import.meta.url).pathname, 'vite.config.ts'),
  'utf8'
)
const routerSource = fs.readFileSync(
  path.resolve(new URL('..', import.meta.url).pathname, 'src/utils/router.ts'),
  'utf8'
)
const workbenchViewSource = fs.readFileSync(
  path.resolve(new URL('..', import.meta.url).pathname, 'src/views/workbench/index.vue'),
  'utf8'
)
const loginSource = fs.readFileSync(
  path.resolve(new URL('..', import.meta.url).pathname, 'src/components/Login/Login.vue'),
  'utf8'
)
const fetchRequestSource = fs.readFileSync(
  path.resolve(new URL('..', import.meta.url).pathname, 'src/utils/request/fetch.ts'),
  'utf8'
)
const legacyApiIndexSource = fs.readFileSync(
  path.resolve(new URL('..', import.meta.url).pathname, 'src/api/index.ts'),
  'utf8'
)
const academicControllerSource = fs.readFileSync(
  path.resolve(
    new URL('..', import.meta.url).pathname,
    '../service/src/modules/academic/academic.controller.ts'
  ),
  'utf8'
)
const compatibilityApiSources = Object.fromEntries(
  ['user.ts', 'share.ts', 'balance.ts', 'order.ts', 'upload.ts', 'group.ts', 'chatLog.ts'].map(
    filename => [
      filename,
      fs.readFileSync(
        path.resolve(new URL('..', import.meta.url).pathname, `src/api/${filename}`),
        'utf8'
      ),
    ]
  )
)
const longChatPressureSource = fs.readFileSync(
  path.resolve(
    new URL('..', import.meta.url).pathname,
    '../service/playwright/long_chat_pressure.spec.cjs'
  ),
  'utf8'
)
const academicRegressionSource = fs.readFileSync(
  path.resolve(
    new URL('..', import.meta.url).pathname,
    '../service/playwright/academic_regression.spec.cjs'
  ),
  'utf8'
)
const activeUiSources = [
  'src/App.vue',
  'src/views/workbench/index.vue',
  'src/views/workbench/ResearchWorkspace.vue',
  'src/views/workbench/components/WorkbenchHeader.vue',
  'src/views/workbench/components/ResearchComposer.vue',
  'src/views/workbench/components/CapabilityPanel.vue',
  'src/views/workbench/components/ResearchStart.vue',
  'src/views/workbench/components/ResearchProjects/index.vue',
  'src/views/workbench/components/ResearchProjects/ProjectListItem.vue',
  'src/store/modules/index.ts',
].map(relativePath => [
  relativePath,
  fs.readFileSync(path.resolve(new URL('..', import.meta.url).pathname, relativePath), 'utf8'),
])
const legacyMarketplaceReference =
  /@\/api\/(?:appStore|plugin)|useAppCatStore|fetchQuery(?:Apps|MineApps|AppCats|OneCat|Plugins)API|components\/(?:AppList|AppTips|AiBot|PresetHints)\//
assert.doesNotMatch(researchWorkspaceSource, /(?:import|<)\s*[^\n]*AppList/)
assert.doesNotMatch(researchWorkspaceSource, /components\/AppTips|components\/AppList|appStore/)
assert.doesNotMatch(headerSource, /showAppListComponent|应用广场/)
assert.doesNotMatch(globalStoreSource, /showAppListComponent|updateShowAppListComponent/)
for (const key of ['researchWorkspace']) {
  assert.match(headerSource, new RegExp(`lens\\.header\\.${key}`))
}
assert.doesNotMatch(headerSource, /ExpandLeft|siderCollapsed|expandSidebar|handleUpdateCollapsed/)
assert.doesNotMatch(workbenchViewSource, /prism-login|prism-shell/)
assert.doesNotMatch(loginSource, /prism-login|prism-login-card|欢迎使用 YutoAI/)
assert.match(loginSource, /lens\.login\.title/)
assert.match(loginSource, /:aria-label="t\('lens\.header\.close'\)"/)
for (const key of [
  'defaultModel',
  'switchModel',
  'noModels',
  'switchTo',
  'modelIcon',
  'switchFailed',
]) {
  assert.match(modelSelectorSource, new RegExp(`lens\\.modelSelector\\.${key}`))
}
assert.match(workspaceHomeSource, /lens\.workspace\.importData/)
assert.match(headerSource, /openResearchProjects/)
assert.match(researchWorkspaceSource, /ResearchProjects/)
assert.match(chatStateHelperSource, /academicMode:\s*true/)
assert.match(chatStateHelperSource, /academicMode:\s*true,\s*\n\s*}/)
for (const [relativePath, source] of activeUiSources) {
  assert.doesNotMatch(
    source,
    legacyMarketplaceReference,
    `${relativePath} must not reintroduce the legacy marketplace`
  )
}
assert.doesNotMatch(storeModulesSource, /export\s+\*\s+from\s+['"]\.\/appStore['"]/)
assert.match(routerSource, /import LensWorkbench from ['"]@\/views\/workbench\/index\.vue['"]/)
assert.match(routerSource, /component:\s*LensWorkbench/)
assert.doesNotMatch(routerSource, /@\/views\/chat/)
assert.equal(
  fs.existsSync(path.resolve(new URL('..', import.meta.url).pathname, 'src/views/chat')),
  false,
  'the retired 99AI chat view directory must stay removed'
)
assert.doesNotMatch(routerSource, /Welcome|AiBot|PresetHints|AppList|AppTips/)
assert.match(
  workbenchViewSource,
  /import ResearchWorkspace from ['"]\.\/ResearchWorkspace\.vue['"]$/m
)
assert.doesNotMatch(
  workbenchViewSource,
  /components\/(?:Welcome|AiBot|PresetHints|AppList|AppTips)\//
)
assert.match(appSource, /getShare\(shareCode\.value\)/)
assert.match(appSource, /searchParams\.get\('shareCode'\)/)
assert.match(appSource, /parseShareCode\(rawShareCode\)/)
assert.match(appSource, /<SharedHtmlView/)
assert.match(appSource, /<router-view v-else \/>/)
assert.match(appSource, /if \(isShareView\.value\) \{[\s\S]*await loadSharedHtml\(\)[\s\S]*return/)
assert.ok(
  appSource.indexOf('if (isShareView.value)') < appSource.lastIndexOf('loadBaiduCode()'),
  'share mode must return before optional analytics code'
)
assert.match(sharedHtmlViewSource, /sandbox="allow-same-origin"/)
assert.match(sharedHtmlViewSource, /referrerpolicy="no-referrer"/)
assert.doesNotMatch(sharedHtmlViewSource, /allow-scripts|allow-forms|allow-popups/)
for (const key of [
  'eyebrow',
  'title',
  'openWorkspace',
  'loading',
  'loadFailed',
  'invalidLink',
  'notFound',
  'backToWorkspace',
  'frameTitle',
  'readOnlyNotice',
]) {
  assert.match(sharedHtmlViewSource + appSource, new RegExp(`lens\\.share\\.${key}`))
}
assert.match(longChatPressureSource, /\.workspace-record/)
assert.doesNotMatch(longChatPressureSource, /\.workspace-entry/)
assert.match(academicRegressionSource, /分享链接只显示只读成果/)
assert.match(academicRegressionSource, /Lens 研究结果可创建只读分享链接/)
assert.match(academicRegressionSource, /path\.startsWith\('\/share\/'\)/)
assert.match(academicRegressionSource, /path === '\/share\/create'/)
assert.match(academicRegressionSource, /state\.shareRequests/)
assert.match(academicRegressionSource, /state\.shareCreateRequests/)
assert.match(academicRegressionSource, /sandbox', 'allow-same-origin'/)
assert.match(workspaceHomeSource, /:aria-pressed="isStarterActive\(item\)"/)
assert.match(workspaceHomeSource, /t\('lens\.workspace\.importedFilesLabel'\)/)
assert.match(
  workspaceHomeSource,
  /@media \(max-width: 800px\)[\s\S]*\.academic-home__task-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/
)
assert.match(workspaceHomeSource, /\.academic-home__task-grid button span \{\s*display: none;/)
assert.match(academicPanelSource, /:aria-pressed="workflowEnabled"/)
assert.doesNotMatch(
  academicPanelSource,
  /research-controls__presets|quickCoreCandidates|quickPluginCandidates/
)
assert.match(messageTextSource, /role="status"/)
assert.match(messageTextSource, /workflowStatusAborted/)
assert.match(messageTextSource, /lens\.message\.browsedWebSources/)
assert.match(messageTextSource, /lens\.message\.deepThinking/)
assert.match(messageTextSource, /import \{ createShare \} from ['"]@\/api\/share['"]/)
assert.match(messageTextSource, /createShareDocument\(sanitizeShareFragment\(text\.value\)\)/)
assert.match(messageTextSource, /normalizeShareResultUrl\(response\?\.data\?\.shareCode/)
assert.match(shareDomainSource, /export function sanitizeShareFragment\(content: string\)/)
assert.match(shareDomainSource, /querySelectorAll\([\s\S]*script, iframe, object, embed, form/)
assert.match(shareDomainSource, /name\.startsWith\('on'\) \|\| name === 'style'/)
assert.match(shareDomainSource, /isAllowedShareUrl\(name, value\)/)
assert.match(messageTextSource, /handleShareResult/)
assert.match(messageTextSource, /lens\.message\.shareSuccess/)
assert.match(messageTextSource, /lens\.message\.shareFailed/)
assert.match(messageTextSource, /domain\/research\/share/)
assert.equal(
  sanitizeShareFragment(
    '<script>alert(1)</script><p onclick="evil()" style="color:red"><a href="javascript:alert(1)">结果</a></p><iframe src="/evil"></iframe>'
  ),
  '<p><a>结果</a></p>'
)
assert.match(createShareDocument('<p>结果</p>'), /<article><p>结果<\/p><\/article>/)
assert.equal(parseShareCode(' Ab12Cd34 '), 'Ab12Cd34')
assert.equal(parseShareCode('invalid-code'), '')
assert.equal(
  normalizeShareResultUrl('/?shareCode=Ab12Cd34', 'https://lens.example/'),
  'https://lens.example/?shareCode=Ab12Cd34'
)
assert.equal(
  normalizeShareResultUrl(
    '/?shareCode=Ab12Cd34&next=https://evil.example',
    'https://lens.example/'
  ),
  ''
)
for (const key of ['cancel', 'update', 'edit']) {
  assert.match(messageTextSource, new RegExp(`(?:common|chat)\\.${key}`))
}
assert.match(messageSource, /t\('chat\.copied'\)/)
assert.doesNotMatch(messageSource, /复制成功！?'/)
for (const key of [
  'invalidDownloadLink',
  'downloadFailed',
  'invalidFileAddress',
  'fileDownloadFailed',
  'copyFailed',
  'userImages',
  'resultImages',
  'downloadableResults',
  'nextSteps',
]) {
  assert.match(messageTextSource, new RegExp(`lens\\.message\\.${key}`))
}
assert.doesNotMatch(messageTextSource, /已浏览 \{\{ searchResult\.length \}\}/)
assert.match(researchWorkspaceSource, /lens\.message\.academicEmptyResult/)
assert.match(researchWorkspaceSource, /t\('login\.loginSuccess'\)/)
assert.match(researchWorkspaceSource, /t\('goods\.paymentSuccess'\)/)
assert.doesNotMatch(researchWorkspaceSource, /账户登录成功、开始体验吧！|支付成功，感谢支持！/)
assert.match(memberCenterSource, /function normalizeSignInRecords\(value: unknown\)/)
assert.match(memberCenterSource, /signInData\.value = normalizeSignInRecords\(res\.data\)/)
assert.doesNotMatch(memberCenterSource, /console\.log\(/)
for (const key of [
  'signInReward',
  'signInGift',
  'consecutiveDays',
  'weekdaySun',
  'weekdayMon',
  'weekdayTue',
  'weekdayWed',
  'weekdayThu',
  'weekdayFri',
  'weekdaySat',
  'signingIn',
  'signedIn',
  'signIn',
  'signInSuccess',
  'loginRequired',
  'loggedOut',
  'quotaInfo',
  'unlimitedQuota',
  'memberStatus',
  'expires',
  'nonMember',
  'cardRedeem',
  'redeem',
]) {
  assert.match(memberCenterSource, new RegExp(`lens\\.member\\.${key}`))
}
assert.doesNotMatch(memberCenterSource, />签到奖励</)
assert.doesNotMatch(memberCenterSource, />签到赠送：</)
assert.doesNotMatch(memberCenterSource, />额度信息</)
assert.doesNotMatch(memberCenterSource, />会员状态</)
assert.doesNotMatch(memberCenterSource, />卡密兑换</)
assert.match(researchStorageSource, /const normalizeNumberListMap = \(value: unknown\)/)
assert.match(researchStorageSource, /hiddenReplyChatIdsByGroup: normalizeNumberListMap\(/)
assert.match(researchStorageSource, /hiddenReplyTailAnchorByGroup: normalizeNumberMap\(/)
assert.match(researchWorkspaceSource, /@keydown\.enter\.prevent="handleScrollBtm"/)
assert.match(researchWorkspaceSource, /t\('lens\.academicPanel\.infoLabel'\)/)
for (const key of [
  'serviceUnavailableTitle',
  'serviceUnavailableDesc',
  'requestFailed',
  'requestId',
  'loadOlderMessages',
  'loadingOlderMessages',
]) {
  assert.match(researchWorkspaceSource, new RegExp(`lens\\.workspace\\.${key}`))
}
for (const key of [
  'academicUnavailable',
  'replyTargetMissing',
  'historyReplyMissing',
  'tailDeleteFailed',
]) {
  assert.match(researchWorkspaceSource, new RegExp(`lens\\.message\\.${key}`))
}
assert.match(researchWorkspaceSource, /const requestSignal = controller\.value\.signal/)
assert.match(researchWorkspaceSource, /requestWasAborted = error\?\.name === 'AbortError'/)
assert.match(researchWorkspaceSource, /fetchAcademicChatAPIProcess/)
assert.match(researchWorkspaceSource, /fetchAcademicWorkflowAPIProcess/)
assert.doesNotMatch(researchWorkspaceSource, /fetchChatAPIProcess|useAppId|rawAppId/)
assert.doesNotMatch(legacyApiIndexSource, /chatgpt\/chat-process|fetchChatAPIProcess/)
assert.match(
  fetchRequestSource,
  /import \{ readTextStream \} from ['"]@\/domain\/research\/textStream['"]/
)
assert.match(fetchRequestSource, /readTextStream\(response\.body, onProgress\)/)

const activeMaxBalance = {
  packageId: 1,
  packageWeight: 30,
  expirationTime: new Date(Date.now() + 24 * 60 * 60 * 1000),
}
assert.equal(resolveAcademicPlanTier(activeMaxBalance), 'max')
assert.equal(
  resolveAcademicPlanTier({
    packageId: 1,
    packageWeight: 20,
    expirationTime: '2099-12-31',
  }),
  'pro'
)
assert.equal(
  resolveAcademicPlanTier({
    packageId: 1,
    packageWeight: 30,
    expirationTime: '2099-12-31T23:59:59+08:00',
  }),
  'max'
)
assert.equal(
  resolveAcademicPlanTier({
    packageId: 1,
    packageWeight: 30,
    expirationTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
  }),
  'free'
)
assert.equal(resolveAcademicPlanTier({ packageId: 1, packageWeight: 20 }), 'pro')
assert.equal(canUseAcademicCore('中文润色', { packageId: 0, packageWeight: 0 }), true)
assert.equal(canUseAcademicPlugin('论文速读', { packageId: 0, packageWeight: 0 }), true)
assert.equal(canUseAcademicPlugin('PDF 深度理解', { packageId: 0, packageWeight: 0 }), false)
const footerSource = fs.readFileSync(
  path.resolve(
    new URL('..', import.meta.url).pathname,
    'src/views/workbench/components/ResearchComposer.vue'
  ),
  'utf8'
)
assert.match(footerSource, /t\('lens\.footer\.researchInputLabel'\)/)
assert.match(footerSource, /const academicMode = computed\(\(\) => chatStore\.academicMode\)/)
assert.doesNotMatch(footerSource, /setAcademicMode\(value\)/)
assert.doesNotMatch(footerSource, /fetchQueryAppsAPI|await\s+queryApps\(/)
assert.doesNotMatch(footerSource, /appStore|pinyin-match|selectedApp|isSelectedApp/)
for (const key of ['unsupportedBoth', 'unsupportedImages', 'unsupportedDocuments']) {
  assert.match(footerSource, new RegExp(`lens\\.footer\\.${key}`))
}
assert.doesNotMatch(footerSource, /当前模型不支持图片上传|当前模型不支持文档上传/)
assert.match(footerSource, /const preloadAcademicData = async[\s\S]*queryAcademicCoreFunctions\(\)/)
assert.match(footerSource, /watch\(isLogin, \(loggedIn, wasLoggedIn\) =>/)
assert.match(viteConfigSource, /VITE_GLOB_API_URL/)
assert.match(viteConfigSource, /VITE_APP_API_BASE_URL/)
assert.match(viteConfigSource, /http:\/\/127\.0\.0\.1:9520/)
for (const route of ['chat-process', 'workflow-process', 'core-function-list', 'plugin-list']) {
  assert.match(academicControllerSource, new RegExp(`@Post\\(['"]${route}['"]\\)`))
}
for (const [filename, routes] of Object.entries({
  'user.ts': ['/auth/'],
  'share.ts': ['/share/create', '/share/'],
  'balance.ts': ['/balance/query', '/balance/rechargeLog'],
  'order.ts': ['/order/buy', '/order/queryByOrderId'],
  'upload.ts': ['/upload/file'],
  'group.ts': ['/group/create', '/group/query', '/group/update', '/group/del'],
  'chatLog.ts': ['/chatlog/chatList', '/chatlog/syncDisplayContent'],
})) {
  for (const route of routes) {
    assert.match(compatibilityApiSources[filename], new RegExp(route.replace('/', '\\/')))
  }
}

const lines = []
const decoder = new NdjsonStreamDecoder(line => lines.push(line))
decoder.push('{"content":"第一段"}\n{"delta":{"content":"第二')
decoder.push('段"}}\n尾部')
decoder.flush()
assert.deepEqual(lines, [
  { value: '{"content":"第一段"}', appendLineBreak: true },
  { value: '{"delta":{"content":"第二段"}}', appendLineBreak: true },
  { value: '尾部', appendLineBreak: false },
])

const encodedText = new TextEncoder().encode('学术结果')
const streamChunks = [encodedText.slice(0, 2), encodedText.slice(2, 7), encodedText.slice(7)]
let streamChunkCount = 0
let callbackErrorCount = 0
const originalConsoleError = console.error
console.error = (...args) => {
  if (String(args[0] || '').includes('[readTextStream] onChunk error')) {
    callbackErrorCount += 1
    return
  }
  originalConsoleError(...args)
}
let streamedText
try {
  streamedText = await readTextStream(
    {
      getReader() {
        return {
          async read() {
            if (streamChunkCount >= streamChunks.length) return { done: true }
            return { done: false, value: streamChunks[streamChunkCount++] }
          },
        }
      },
    },
    () => {
      throw new Error('test callback failure')
    }
  )
} finally {
  console.error = originalConsoleError
}
assert.equal(streamedText, '学术结果')
// 首个字节片段仍在等待完整 UTF-8 字符，因此只有两个非空文本分片会触发回调。
assert.equal(callbackErrorCount, 2)

const event = normalizeAcademicStreamEvent({
  progress: '67%',
  chatId: 42,
  reasoningContent: '思考',
  delta: { content: '正文' },
  tool_calls: [{ name: 'search' }],
})
assert.deepEqual(event, {
  requestId: undefined,
  userBalance: undefined,
  nodeType: undefined,
  stepName: undefined,
  progress: 67,
  chatId: '42',
  finishReason: undefined,
  mcpToolUse: undefined,
  taskData: undefined,
  networkSearchResult: undefined,
  fileVectorResult: undefined,
  toolCalls: [{ name: 'search' }],
  promptReference: undefined,
  thinkingPreview: undefined,
  resetContent: false,
  content: '正文',
  finalContent: undefined,
  reasoningContent: '思考',
  streamError: undefined,
})

const files = parseResearchFiles(
  JSON.stringify([
    { name: '/private_upload/paper.pdf', url: '/api/file/paper.pdf', type: 'document' },
    { fileName: 'notes.md', fileUrl: '/api/file/notes.md' },
    { name: '', url: '/api/file/ignored' },
  ])
)
assert.deepEqual(files, [
  { name: 'paper.pdf', url: '/api/file/paper.pdf', type: 'document' },
  { name: 'notes.md', url: '/api/file/notes.md', type: 'document' },
])

assert.deepEqual(parseUserUploadedFiles('/file/paper.pdf, /file/notes.md, /file/paper.pdf'), [
  { url: '/file/paper.pdf', name: 'paper.pdf' },
  { url: '/file/notes.md', name: 'notes.md' },
])
assert.deepEqual(
  parseAcademicDownloadFiles(
    JSON.stringify({
      files: [
        { path: '/gpt_log/report.pdf', name: '研究报告.pdf' },
        { download_path: '/downloadzone/results.zip' },
        { path: '不是下载路径' },
      ],
    })
  ),
  [
    { path: '/gpt_log/report.pdf', name: '研究报告.pdf' },
    { path: '/downloadzone/results.zip', name: 'results.zip' },
  ]
)
assert.equal(sanitizeDownloadName('../\u0000报告?.pdf'), '..__报告_.pdf')
assert.equal(
  normalizeExternalDownloadUrl('https://papers.example/report.pdf'),
  'https://papers.example/report.pdf'
)
assert.equal(normalizeExternalDownloadUrl('https://user:pass@papers.example/report.pdf'), '')
assert.equal(normalizeExternalDownloadUrl('http://127.0.0.1/internal'), '')

assert.deepEqual(
  normalizeAcademicMessageSnapshot({
    file_url: '[{"name":"paper.pdf","url":"/api/file/paper.pdf"}]',
    reasoning_content: '历史推理',
    network_search_result: '来源列表',
    task_data: { type: 'academic-workflow', status: 'done' },
    workflow_progress: 100,
  }),
  {
    fileUrl: '[{"name":"paper.pdf","url":"/api/file/paper.pdf"}]',
    imageUrl: '',
    reasoningText: '历史推理',
    networkSearchResult: '来源列表',
    fileVectorResult: '',
    taskData: { type: 'academic-workflow', status: 'done' },
    promptReference: '',
    workflowProgress: 100,
  }
)

let resultState = createAcademicResultState()
resultState = reduceAcademicResult(
  resultState,
  normalizeAcademicStreamEvent({ progress: '25%', content: '处理中' })
)
assert.equal(resultState.phase, 'streaming')
assert.equal(resultState.progress, 25)
resultState = reduceAcademicResult(
  resultState,
  normalizeAcademicStreamEvent({ finalContent: '最终结果' })
)
assert.equal(resultState.hasFinalContent, true)
resultState = completeAcademicResult(resultState)
assert.equal(resultState.phase, 'completed')
assert.equal(markAcademicResultAborted(resultState).phase, 'completed')
let streamingResultState = createAcademicResultState()
streamingResultState = reduceAcademicResult(
  streamingResultState,
  normalizeAcademicStreamEvent({ content: '部分结果' })
)
assert.equal(markAcademicResultAborted(streamingResultState).phase, 'aborted')

const starterTaskIds = new Set(RESEARCH_STARTER_TASKS.map(task => task.id))
assert.equal(starterTaskIds.size, RESEARCH_STARTER_TASKS.length)
assert.ok(RESEARCH_STARTER_TASKS.some(task => task.id === 'code-explain'))
assert.ok(
  RESEARCH_STARTER_TASKS.some(task => task.id === 'literature-review' && task.mode === 'chat')
)
for (const taskId of ['multi-paper-compare', 'research-notes', 'teaching-material']) {
  assert.ok(
    RESEARCH_STARTER_TASKS.some(task => task.id === taskId && task.mode === 'chat'),
    `${taskId} must remain a first-class Lens research task`
  )
}
assert.deepEqual(
  HOME_FEATURED_RESEARCH_TASK_IDS,
  [
    'paper-summary',
    'pdf-deep-read',
    'arxiv-summary',
    'multi-paper-compare',
    'literature-review',
    'english-polish',
    'latex-translation',
    'code-explain',
    'research-notes',
    'teaching-material',
  ]
)
for (const lane of RESEARCH_STARTER_LANES) {
  for (const taskId of lane.taskIds) assert.ok(starterTaskIds.has(taskId))
}

assert.equal(normalizeExternalSourceUrl('http://127.0.0.1:9520/internal'), '')
assert.equal(normalizeExternalSourceUrl('https://user:pass@example.com/paper'), '')
assert.deepEqual(
  parseAcademicSources({
    searchResults: [
      { title: 'Paper', link: 'https://example.com/paper', media: 'journal' },
      { title: 'Private', link: 'http://192.168.1.5/paper' },
      { title: 'No link', link: '' },
    ],
  }),
  [{ title: 'Paper', link: 'https://example.com/paper', media: 'journal' }]
)

console.log('research contract verification passed')
