const BASE = process.env.BASE_URL || 'http://127.0.0.1:9520/api'
const LOGIN_USER = process.env.LOGIN_USER || 'super'
const LOGIN_PASS = process.env.LOGIN_PASS || '123456'

const now = Date.now()
const packageWeight = (now % 900000) + 100000
const packageWeightUpdated = packageWeight + 1

const request = async (path, { method = 'GET', token = '', body } = {}) => {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch (_err) {}
  const data = json && typeof json === 'object' && 'data' in json ? json.data : json
  return { ok: res.ok, status: res.status, text, json, data }
}

const rowsFrom = payload => {
  if (!payload) return []
  if (Array.isArray(payload.rows)) return payload.rows
  if (payload.data && Array.isArray(payload.data.rows)) return payload.data.rows
  if (Array.isArray(payload.data)) return payload.data
  if (Array.isArray(payload)) return payload
  return []
}

const result = []
const push = (name, rs, extra = '') => {
  result.push({
    name,
    ok: rs.ok,
    status: rs.status,
    message: rs.json?.message || rs.text?.slice(0, 160) || '',
    extra,
  })
}

const makeFail = (status, message) => ({
  ok: false,
  status,
  json: { message },
  text: message,
})

const main = async () => {
  const login = await request('/auth/login', {
    method: 'POST',
    body: { username: LOGIN_USER, password: LOGIN_PASS },
  })
  if (!login.ok || !login.data) {
    throw new Error(`login_failed: ${login.status} ${login.text.slice(0, 200)}`)
  }
  const token = login.data

  const info = await request('/auth/getInfo', { token })
  push('auth.getInfo', info, `role=${info.data?.role || ''}`)
  if (!info.ok) {
    console.log(JSON.stringify(result, null, 2))
    process.exit(1)
  }

  const ids = {
    groupId: 0,
    pluginId: 0,
    badWordId: 0,
    autoReplyId: 0,
    appCatId: 0,
    appId: 0,
    packageId: 0,
    cramiId: 0,
    modelId: 0,
  }

  // group
  const groupCreate = await request('/group/create', { method: 'POST', token, body: {} })
  ids.groupId = Number(groupCreate.data?.id || groupCreate.data?.groupId || 0)
  push('group.create', groupCreate, `groupId=${ids.groupId}`)
  const groupUpdate = await request('/group/update', {
    method: 'POST',
    token,
    body: { groupId: ids.groupId, title: `e2e-group-${now}`, isSticky: false, config: '{}' },
  })
  push('group.update', groupUpdate)

  // share
  const shareCreate = await request('/share/create', {
    method: 'POST',
    token,
    body: { htmlContent: `<h1>e2e-share-${now}</h1>` },
  })
  push('share.create', shareCreate)
  const shareCodeRaw = String(shareCreate.data?.shareCode || '')
  const shareCode = shareCodeRaw.includes('shareCode=')
    ? shareCodeRaw.split('shareCode=')[1]
    : shareCodeRaw
  const shareGet = await fetch(`http://127.0.0.1:9520/api/share/${shareCode}`)
  const shareGetText = await shareGet.text()
  push(
    'share.get',
    {
      ok: shareGet.ok,
      status: shareGet.status,
      json: { message: shareGet.ok ? 'ok' : shareGetText.slice(0, 160) },
      text: shareGetText,
    },
    `shareCode=${shareCode}`,
  )

  // plugin CRUD
  const pluginName = `e2e-plugin-${now}`
  const pluginCreate = await request('/plugin/createPlugin', {
    method: 'POST',
    token,
    body: {
      name: pluginName,
      pluginImg: '',
      description: 'e2e',
      isEnabled: 1,
      parameters: 'gpt-5-nano',
      sortOrder: 9999,
    },
  })
  push('plugin.create', pluginCreate)
  const pluginList = await request('/plugin/pluginList?page=1&size=500', { token })
  ids.pluginId = Number(rowsFrom(pluginList.data).find(item => item.name === pluginName)?.id || 0)
  push('plugin.query', { ...pluginList, ok: pluginList.ok && ids.pluginId > 0 }, `pluginId=${ids.pluginId}`)
  const pluginUpdate = await request('/plugin/updatePlugin', {
    method: 'POST',
    token,
    body: {
      id: ids.pluginId,
      name: `${pluginName}-u`,
      pluginImg: '',
      description: 'e2e-u',
      isEnabled: 0,
      parameters: 'gpt-5-nano',
      sortOrder: 9998,
    },
  })
  push('plugin.update', pluginUpdate)

  // badWords CRUD + length validation
  const word = `bw${String(now).slice(-8)}`
  const badAdd = await request('/badWords/add', { method: 'POST', token, body: { word } })
  push('badWords.add', badAdd)
  const badQuery = await request(`/badWords/query?page=1&size=500&word=${encodeURIComponent(word)}`, {
    token,
  })
  ids.badWordId = Number(rowsFrom(badQuery.data).find(item => item.word === word)?.id || 0)
  push('badWords.query', { ...badQuery, ok: badQuery.ok && ids.badWordId > 0 }, `badWordId=${ids.badWordId}`)
  const badUpdate = await request('/badWords/update', {
    method: 'POST',
    token,
    body: { id: ids.badWordId, word: `${word}u`, status: 1 },
  })
  push('badWords.update', badUpdate)
  const badTooLong = await request('/badWords/add', {
    method: 'POST',
    token,
    body: { word: 'x'.repeat(24) },
  })
  const badTooLongOk = !badTooLong.ok && badTooLong.status === 400
  push('badWords.add.tooLongExpect400', { ...badTooLong, ok: badTooLongOk }, `status=${badTooLong.status}`)

  // autoReply CRUD
  const prompt = `e2e-prompt-${now}`
  const autoAdd = await request('/autoReply/add', {
    method: 'POST',
    token,
    body: { prompt, answer: 'e2e-answer' },
  })
  push('autoReply.add', autoAdd)
  const autoQuery = await request(
    `/autoReply/query?page=1&size=500&prompt=${encodeURIComponent(prompt)}`,
    { token },
  )
  ids.autoReplyId = Number(rowsFrom(autoQuery.data).find(item => item.prompt === prompt)?.id || 0)
  push(
    'autoReply.query',
    { ...autoQuery, ok: autoQuery.ok && ids.autoReplyId > 0 },
    `autoReplyId=${ids.autoReplyId}`,
  )
  const autoUpdate = await request('/autoReply/update', {
    method: 'POST',
    token,
    body: { id: ids.autoReplyId, prompt: `${prompt}-u`, answer: 'e2e-answer-u', status: 1 },
  })
  push('autoReply.update', autoUpdate)

  // app cat + app CRUD
  const catName = `e2e-cat-${now}`
  const catCreate = await request('/app/createAppCats', {
    method: 'POST',
    token,
    body: { name: catName, order: 9999, status: 1, isMember: 0, hideFromNonMember: 0 },
  })
  ids.appCatId = Number(catCreate.data?.id || 0)
  push('appCats.create', catCreate, `catId=${ids.appCatId}`)
  const catUpdate = await request('/app/updateAppCats', {
    method: 'POST',
    token,
    body: {
      id: ids.appCatId,
      name: `${catName}-u`,
      order: 9998,
      status: 1,
      isMember: 0,
      hideFromNonMember: 0,
    },
  })
  push('appCats.update', catUpdate)
  const appName = `e2e-app-${now}`
  const appCreate = await request('/app/createApp', {
    method: 'POST',
    token,
    body: {
      name: appName,
      catId: String(ids.appCatId),
      des: 'e2e app',
      preset: 'You are test assistant.',
      status: 1,
      order: 9999,
      demoData: 'hello',
      role: 'system',
      isGPTs: 0,
      isFlowith: 0,
      flowithId: '',
      flowithName: '',
      flowithKey: '',
      coverImg: '',
      appModel: '',
      isFixedModel: 0,
      backgroundImg: '',
      prompt: '',
    },
  })
  ids.appId = Number(appCreate.data?.id || 0)
  push('app.create', appCreate, `appId=${ids.appId}`)
  const appUpdate = await request('/app/updateApp', {
    method: 'POST',
    token,
    body: {
      id: ids.appId,
      name: `${appName}-u`,
      catId: String(ids.appCatId),
      des: 'e2e app update',
      preset: 'You are test assistant update.',
      status: 1,
      order: 9998,
      demoData: 'hello update',
      role: 'system',
      isGPTs: 0,
      isFlowith: 0,
      flowithId: '',
      flowithName: '',
      flowithKey: '',
      coverImg: '',
      appModel: '',
      isFixedModel: 0,
      backgroundImg: '',
      prompt: '',
    },
  })
  push('app.update', appUpdate)
  const appCollect = await request('/app/collect', {
    method: 'POST',
    token,
    body: { appId: ids.appId },
  })
  push('app.collect', appCollect)

  // model CRUD
  const modelQuery = await request('/models/query?page=1&size=200', { token })
  const modelRows = rowsFrom(modelQuery.data)
  const modelSeed = modelRows.find(item => Number(item.keyType) !== 1) || modelRows[0]
  if (!modelSeed) {
    push('models.seed', makeFail(500, 'no_model_seed_found'))
  } else {
    const modelName = `e2e-model-name-${now}`
    const modelAlias = `e2e-model-${now}`
    const createModelBody = {
      keyType: Number(modelSeed.keyType || 2),
      modelName,
      key: Number(modelSeed.keyType) === 1 ? [String(modelSeed.key || 'sk-test')] : String(modelSeed.key || 'sk-test'),
      status: true,
      model: modelAlias,
      modelOrder: 9999,
      modelAvatar: String(modelSeed.modelAvatar || ''),
      maxModelTokens: Number(modelSeed.maxModelTokens || 64000),
      proxyUrl: String(modelSeed.proxyUrl || ''),
      timeout: Number(modelSeed.timeout || 300),
      keyStatus: Number(modelSeed.keyStatus || 0),
      deductType: Number(modelSeed.deductType || 1),
      deduct: Number(modelSeed.deduct || 1),
      maxRounds: Number(modelSeed.maxRounds || 12),
      isDraw: Boolean(modelSeed.isDraw || false),
      isFileUpload: Number(modelSeed.isFileUpload || 0),
      isTokenBased: Boolean(modelSeed.isTokenBased || false),
      tokenFeeRatio: Number(modelSeed.tokenFeeRatio || 0),
      isImageUpload: Number(modelSeed.isImageUpload || 0),
      max_tokens: Number(modelSeed.max_tokens || 4096),
      modelDescription: 'e2e model',
      isNetworkSearch: Boolean(modelSeed.isNetworkSearch ?? true),
      deepThinkingType: Number(modelSeed.deepThinkingType || 0),
      deductDeepThink: Number(modelSeed.deductDeepThink || 1),
      isMcpTool: Boolean(modelSeed.isMcpTool || false),
      systemPrompt: String(modelSeed.systemPrompt || ''),
      systemPromptType: Number(modelSeed.systemPromptType || 0),
      drawingType: Number(modelSeed.drawingType || 0),
    }
    const modelCreate = await request('/models/setModel', {
      method: 'POST',
      token,
      body: createModelBody,
    })
    push('models.create', modelCreate)

    const modelQuery2 = await request('/models/query?page=1&size=300', { token })
    ids.modelId = Number(rowsFrom(modelQuery2.data).find(item => item.model === modelAlias)?.id || 0)
    push(
      'models.query',
      { ...modelQuery2, ok: modelQuery2.ok && ids.modelId > 0 },
      `modelId=${ids.modelId}`,
    )
    const modelUpdate = await request('/models/setModel', {
      method: 'POST',
      token,
      body: {
        ...createModelBody,
        id: ids.modelId,
        modelName: `${modelName}-u`,
      },
    })
    push('models.update', modelUpdate)
  }

  // crami package + crami CRUD
  const packageName = `e2e-package-${now}`
  const packageCreate = await request('/crami/createPackage', {
    method: 'POST',
    token,
    body: {
      name: packageName,
      des: 'e2e package',
      weight: packageWeight,
      deductionType: 1,
      coverImg: '',
      price: 1.23,
      order: 9999,
      status: 1,
      days: 30,
      model3Count: 10,
      model4Count: 10,
      drawMjCount: 0,
      appCats: String(ids.appCatId || ''),
    },
  })
  ids.packageId = Number(packageCreate.data?.id || 0)
  push('crami.package.create', packageCreate, `packageId=${ids.packageId}`)
  const packageUpdate = await request('/crami/updatePackage', {
    method: 'POST',
    token,
    body: {
      id: ids.packageId,
      name: `${packageName}-u`,
      des: 'e2e package update',
      weight: packageWeightUpdated,
      deductionType: 1,
      coverImg: '',
      price: 2.34,
      order: 9998,
      status: 1,
      days: 30,
      model3Count: 12,
      model4Count: 11,
      drawMjCount: 1,
      appCats: String(ids.appCatId || ''),
    },
  })
  push('crami.package.update', packageUpdate)

  const cramiCreate = await request('/crami/createCrami', {
    method: 'POST',
    token,
    body: { packageId: ids.packageId, count: 1 },
  })
  const cramiList = Array.isArray(cramiCreate.data) ? cramiCreate.data : []
  ids.cramiId = Number(cramiList[0]?.id || 0)
  push('crami.create', cramiCreate, `cramiId=${ids.cramiId}`)

  // cleanup：按依赖顺序串行删除，避免并发时出现“分类下仍有应用”等误报。
  const cleanupTasks = []
  if (ids.cramiId) {
    cleanupTasks.push(() => request('/crami/delCrami', { method: 'POST', token, body: { id: ids.cramiId } }))
  }
  if (ids.packageId) {
    cleanupTasks.push(() =>
      request('/crami/delPackage', { method: 'POST', token, body: { id: ids.packageId } }),
    )
  }
  if (ids.modelId) {
    cleanupTasks.push(() => request('/models/delModel', { method: 'POST', token, body: { id: ids.modelId } }))
  }
  if (ids.appId) {
    cleanupTasks.push(() => request('/app/delApp', { method: 'POST', token, body: { id: ids.appId } }))
  }
  if (ids.appCatId) {
    cleanupTasks.push(() => request('/app/delAppCats', { method: 'POST', token, body: { id: ids.appCatId } }))
  }
  if (ids.autoReplyId) {
    cleanupTasks.push(() => request('/autoReply/del', { method: 'POST', token, body: { id: ids.autoReplyId } }))
  }
  if (ids.badWordId) {
    cleanupTasks.push(() => request('/badWords/del', { method: 'POST', token, body: { id: ids.badWordId } }))
  }
  if (ids.pluginId) {
    cleanupTasks.push(() => request('/plugin/delPlugin', { method: 'POST', token, body: { id: ids.pluginId } }))
  }
  if (ids.groupId) {
    cleanupTasks.push(() => request('/group/del', { method: 'POST', token, body: { groupId: ids.groupId } }))
  }
  for (let i = 0; i < cleanupTasks.length; i += 1) {
    try {
      const rs = await cleanupTasks[i]()
      push(`cleanup.${i + 1}`, rs)
    } catch (error) {
      push(`cleanup.${i + 1}`, makeFail(500, String(error || 'cleanup_error')))
    }
  }

  const fails = result.filter(item => !item.ok)
  console.log(
    JSON.stringify(
      {
        total: result.length,
        pass: result.length - fails.length,
        fail: fails.length,
        fails,
        details: result,
      },
      null,
      2,
    ),
  )
  process.exit(fails.length > 0 ? 1 : 0)
}

main().catch(error => {
  console.error('[admin_write_smoke_test] fatal:', error)
  process.exit(2)
})
