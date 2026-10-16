const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('../../service/node_modules/typescript')
const source = fs.readFileSync(path.join(__dirname, '../src/domain/research/downloads.ts'), 'utf8')
const moduleObject = { exports: {} }
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports: moduleObject.exports, module: moduleObject, URL })
const api = moduleObject.exports
const ref = 'attachment:00000000-0000-4000-8000-000000000001'
const cases = [
  () => assert.equal(api.isLikelyAcademicDownloadPath(ref), true),
  () => {
    const result = api.parseAcademicDownloadFiles([{ path: ref, name: 'synthetic-report.pdf' }])
    assert.equal(result.length, 1)
    assert.equal(result[0].path, ref)
    assert.equal(result[0].name, 'synthetic-report.pdf')
  },
  () => {
    const result = api.parseAcademicDownloadFiles(JSON.stringify({ files: [{ file: ref, name: 'synthetic-report.txt' }] }))
    assert.equal(result.length, 1)
    assert.equal(result[0].path, ref)
  },
  () => {
    const result = api.parseUserUploadedFiles(JSON.stringify([{ url: ref, name: 'synthetic-upload.tex' }]))
    assert.equal(result.length, 1)
    assert.equal(result[0].url, ref)
    assert.equal(result[0].name, 'synthetic-upload.tex')
  },
  () => {
    for (const value of ['attachment:malformed', 'attachment:../../synthetic', 'data:text/plain,synthetic', 'javascript:synthetic']) {
      assert.equal(api.isLikelyAcademicDownloadPath(value), false)
    }
  },
  () => assert.equal(api.isLikelyAcademicDownloadPath('https://reports.example.test/synthetic.pdf'), true),
]
let passed = 0
const failed = []
cases.forEach((test, index) => {
  try { test(); passed += 1 } catch { failed.push(index + 1) }
})
process.stdout.write(JSON.stringify({ suite: 'private-attachment-downloads', passed, total: cases.length, failed }) + '\n')
process.exitCode = failed.length ? 1 : 0
