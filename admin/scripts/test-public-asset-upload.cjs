const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../../service/node_modules/typescript')

const source = fs.readFileSync(path.join(__dirname, '../src/api/modules/upload.ts'), 'utf8')
const calls = []
const response = { success: true }
const moduleObject = { exports: {} }
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, {
  exports: moduleObject.exports,
  module: moduleObject,
  require: () => ({ default: { post: (url, body) => { calls.push({ url, body }); return response } } }),
})
const api = moduleObject.exports.default
const purposes = ['logo', 'favicon', 'robot-avatar', 'default-avatar', 'model-avatar', 'app-cover',
  'app-background', 'package-cover', 'notice-image', 'agreement-image', 'classification-image']
let passed = 0
const failed = []
for (const purpose of purposes) {
  try {
    const form = { syntheticFile: true }
    assert.equal(api.uploadFile(form, purpose), response)
    assert.deepEqual(calls.at(-1), { url: `/upload/public-asset?purpose=${purpose}`, body: form })
    passed += 1
  } catch { failed.push(purpose) }
}
try {
  const before = calls.length
  for (const invalid of [undefined, '', 'legacy-directory', '../synthetic', 'admin-image']) {
    assert.throws(() => api.uploadFile({}, invalid))
  }
  assert.equal(calls.length, before)
  passed += 1
} catch { failed.push('reject-invalid-purpose') }
process.stdout.write(JSON.stringify({ suite: 'public-asset-upload', passed, total: purposes.length + 1, failed }) + '\n')
process.exitCode = failed.length ? 1 : 0
