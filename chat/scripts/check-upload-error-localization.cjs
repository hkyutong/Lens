try {
  const fs = require('fs')
  const path = require('path')
  const vm = require('vm')
  const ts = require('typescript')
  const assert = require('node:assert/strict')
  const { createI18n } = require('vue-i18n')

  const root = path.join(__dirname, '..')
  let passed = 0
  const failures = []
  function check(name, run) {
    try { run(); passed++ }
    catch { failures.push(name) }
  }

  const helperSource = fs.readFileSync(path.join(root, 'src/utils/request/uploadErrorMessage.ts'), 'utf8')
  const box = { exports: {} }
  vm.runInNewContext(ts.transpileModule(helperSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, box)
  const localize = box.exports.localizeUploadErrorMessage
  const fixtures = [
    {
      "input": "已达到文件上传次数上限，请稍后再试",
      "key": "uploadErrors.limitReached"
    },
    {
      "input": "文件超过允许的上传大小",
      "key": "uploadErrors.fileTooLarge"
    },
    {
      "input": "当前套餐暂不支持上传文件",
      "key": "uploadErrors.notIncluded"
    },
    {
      "input": "文件上传未完成，请稍后再试",
      "key": "uploadErrors.temporarilyUnavailable"
    },
    {
      "input": "文件大小超过限制(5)",
      "key": "uploadErrors.sizeLimit",
      "values": {
        "size": "5"
      }
    }
  ]
  const locales = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']
  const sizeTemplate = {"head":"文件大小超过限制(","tail":")"}

  for (const locale of locales) {
    const messages = JSON.parse(fs.readFileSync(path.join(root, 'src/locales', locale + '.json'), 'utf8'))
    const i18n = createI18n({ legacy: false, locale, fallbackLocale: locale, messages: { [locale]: messages } })
    for (const fixture of fixtures) {
      check('recognized-response-localized-' + locale, () => {
        let calls = 0
        const translated = localize(fixture.input, (key, values) => {
          calls++
          assert.equal(key, fixture.key)
          assert.deepEqual(values ? { ...values } : undefined, fixture.values)
          const value = messages.uploadErrors[key.split('.')[1]]
          assert.equal(typeof value, 'string')
          const translated = values ? i18n.global.t(key, values) : i18n.global.t(key)
          assert.equal(translated, value.replace(/\{size\}/g, values?.size ?? ''))
          return translated
        })
        assert.equal(calls, 1)
        assert.notEqual(translated, fixture.input)
        assert.doesNotMatch(translated, /uploadErrors\.|UPLOAD_|packageEntitlements|dailyLimit|maxFileSizeMb/)
      })
    }
  }

  for (const input of ['synthetic unrelated business error', '', undefined, null, 7, { message: 'synthetic error' }, ['synthetic validation error']]) {
    check('unrelated-input-preserved', () => {
      let calls = 0
      assert.equal(localize(input, () => { calls++; return 'unexpected' }), input)
      assert.equal(calls, 0)
    })
  }
  for (const fixture of fixtures) {
    for (const altered of [fixture.input + ' synthetic suffix', ' ' + fixture.input, fixture.input + ' ']) {
      check('partial-match-preserved', () => {
        assert.equal(localize(altered, () => 'unexpected'), altered)
      })
    }
    check('translation-failure-preserved', () => {
      assert.equal(localize(fixture.input, () => { throw Error('synthetic') }), fixture.input)
      assert.equal(localize(fixture.input, () => fixture.key), fixture.input)
      assert.equal(localize(fixture.input, () => ''), fixture.input)
    })
  }
  for (const size of ['0', '-1', 'NaN', 'Infinity', '1e3', 'synthetic']) {
    check('invalid-size-preserved', () => {
      const input = sizeTemplate.head + size + sizeTemplate.tail
      assert.equal(localize(input, () => 'unexpected'), input)
    })
  }
  check('fractional-size-localized', () => {
    const input = sizeTemplate.head + '2.5' + sizeTemplate.tail
    assert.equal(localize(input, (key, values) => key === 'uploadErrors.sizeLimit' && values.size === '2.5' ? 'synthetic translated limit' : 'unexpected'), 'synthetic translated limit')
  })

  for (const [filename, count] of [['index.ts', 2], ['fetch.ts', 1]]) {
    check('shared-display-boundary-' + filename, () => {
      const filenamePath = path.join(root, 'src/utils/request', filename)
      const source = fs.readFileSync(filenamePath, 'utf8')
      const ast = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true)
      let displays = 0
      let wrappers = 0
      function walk(node) {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'localizeUploadErrorMessage') {
          wrappers++
          assert.equal(node.arguments.length, 2)
          assert.equal(node.arguments[1].getText(ast), 't')
          assert.ok(ts.isCallExpression(node.parent) && ts.isPropertyAccessExpression(node.parent.expression) && node.parent.expression.name.text === 'error')
        }
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'error' && !/^console(?:\.|$)/.test(node.expression.expression.getText(ast))) {
          displays++
          assert.ok(ts.isCallExpression(node.arguments[0]) && ts.isIdentifier(node.arguments[0].expression) && node.arguments[0].expression.text === 'localizeUploadErrorMessage')
        }
        ts.forEachChild(node, walk)
      }
      walk(ast)
      assert.equal(displays, count)
      assert.equal(wrappers, count)
    })
  }

  process.stdout.write(JSON.stringify({ passedChecks: passed, failedChecks: failures.length, failureClasses: failures }) + '\n')
  process.exitCode = failures.length ? 1 : 0

}
catch {
  process.stdout.write(JSON.stringify({ passedChecks: 0, failedChecks: 1, failureClasses: ['test-setup-failed'] }) + '\n')
  process.exitCode = 1
}
