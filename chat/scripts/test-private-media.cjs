const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../../service/node_modules/typescript')

const ref = 'attachment:00000000-0000-4000-8000-000000000001'
const source = fs.readFileSync(path.join(__dirname, '../src/utils/privateMedia.ts'), 'utf8')
  .replace('import.meta.env.VITE_GLOB_API_URL', "'https://synthetic.invalid/api'")

function harness(fetchImplementation) {
  const calls = []
  const created = []
  const revoked = []
  const unmountCallbacks = []
  let watchedCallback
  let getter
  let pending
  let previousKey
  let stopped = false
  const vue = {
    ref: value => ({ value }),
    computed: value => ({ get value() { return value() } }),
    onUnmounted: callback => unmountCallbacks.push(callback),
    watch: (sourceGetter, callback, options) => {
      getter = sourceGetter
      watchedCallback = callback
      previousKey = getter()
      if (options.immediate) pending = Promise.resolve(callback(previousKey))
      return () => { stopped = true }
    },
  }
  const module = { exports: {} }
  const context = {
    exports: module.exports,
    module,
    require: name => {
      if (name === 'vue') return vue
      if (name === '@/store') return { useAuthStore: () => ({ token: 'synthetic-token' }) }
      throw new Error('Unexpected test dependency')
    },
    AbortController,
    URL: {
      createObjectURL: blob => {
        assert.ok(blob instanceof Blob)
        const url = `blob:synthetic-${created.length + 1}`
        created.push(url)
        return url
      },
      revokeObjectURL: url => revoked.push(url),
    },
    fetch: async (...args) => {
      calls.push(args)
      return fetchImplementation ? fetchImplementation(...args) : {
        ok: true,
        blob: async () => new Blob(['synthetic media'], { type: 'image/png' }),
      }
    },
  }
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, context)
  return {
    api: module.exports,
    calls,
    created,
    revoked,
    settle: () => pending,
    update: async () => {
      const key = getter()
      if (key !== previousKey) {
        previousKey = key
        pending = Promise.resolve(watchedCallback(key))
      }
      await pending
    },
    unmount: () => unmountCallbacks.forEach(callback => callback()),
    stopped: () => stopped,
  }
}

const cases = [
  async function authenticatedRead() {
    const h = harness()
    const blob = await h.api.fetchAttachmentBlob(ref, 'synthetic.png')
    assert.ok(blob instanceof Blob)
    const [url, request] = h.calls[0]
    assert.equal(url, 'https://synthetic.invalid/api/upload/file/download')
    assert.equal(request.method, 'POST')
    assert.equal(request.headers.Authorization, 'Bearer synthetic-token')
    assert.deepEqual(JSON.parse(request.body), { source: ref, name: 'synthetic.png' })
  },
  async function denialDoesNotReadResponseBody() {
    let readBody = false
    const h = harness(async () => ({ ok: false, blob: async () => { readBody = true } }))
    await assert.rejects(h.api.fetchAttachmentBlob(ref))
    assert.equal(readBody, false)
  },
  async function opaqueReferencesNeverBecomeMediaSources() {
    const h = harness()
    const media = h.api.usePrivateMediaSources(() => [ref])
    assert.equal(media.resolveSource(ref), '')
    await h.settle()
    assert.equal(media.resolveSource(ref), 'blob:synthetic-1')
    assert.equal(media.resolveSource('attachment:malformed'), '')
    assert.equal(media.resolveSource('ATTACHMENT:malformed'), '')
  },
  async function removeRevokesAndRetainsUnchangedMedia() {
    const second = 'attachment:00000000-0000-4000-8000-000000000002'
    let values = [ref, second]
    const h = harness()
    const media = h.api.usePrivateMediaSources(() => values)
    await h.settle()
    const retained = media.resolveSource(second)
    values = [second]
    await h.update()
    assert.equal(media.resolveSource(second), retained)
    assert.equal(media.resolveSource(ref), '')
    assert.equal(h.revoked.length, 1)
    assert.equal(h.calls.length, 2)
  },
  async function unmountReleasesMediaAndWatcher() {
    const h = harness()
    h.api.usePrivateMediaSources(() => [ref])
    await h.settle()
    h.unmount()
    assert.equal(h.stopped(), true)
    assert.deepEqual(h.revoked, h.created)
  },
  async function staleResponseCannotCreateObjectUrl() {
    let respond
    const h = harness(() => new Promise(resolve => { respond = resolve }))
    h.api.usePrivateMediaSources(() => [ref])
    h.unmount()
    respond({ ok: true, blob: async () => new Blob(['synthetic']) })
    await h.settle()
    assert.equal(h.created.length, 0)
  },
  async function deniedMediaHasNoRemoteFallback() {
    const h = harness(async () => ({ ok: false }))
    const media = h.api.usePrivateMediaSources(() => [ref])
    await h.settle()
    assert.equal(media.resolveSource(ref), '')
    assert.equal(h.created.length, 0)
    assert.equal(h.calls.length, 1)
  },
  async function publicAndLocalPreviewSourcesRemainUsable() {
    const h = harness()
    const values = ['https://media.example.test/synthetic.png', 'data:image/png;base64,c3ludGhldGlj']
    const media = h.api.usePrivateMediaSources(() => values)
    await h.settle()
    values.forEach(value => assert.equal(media.resolveSource(value), value))
    assert.equal(h.calls.length, 0)
  },
  async function unchangedReferencesDoNotRestartFetch() {
    let values = [ref]
    const h = harness()
    const media = h.api.usePrivateMediaSources(() => values)
    await h.settle()
    const original = media.resolveSource(ref)
    values = [ref, ref]
    await h.update()
    assert.equal(h.calls.length, 1)
    assert.equal(media.resolveSource(ref), original)
    assert.equal(h.revoked.length, 0)
  },
]

;(async () => {
  let passed = 0
  const failed = []
  for (const test of cases) {
    try { await test(); passed += 1 } catch { failed.push(test.name) }
  }
  process.stdout.write(JSON.stringify({ suite: 'private-media', passed, total: cases.length, failed }) + '\n')
  process.exitCode = failed.length ? 1 : 0
})()
