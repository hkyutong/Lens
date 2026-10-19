const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')
const vm = require('node:vm')
const ts = require('typescript')
const { computed, reactive, ref } = require('vue')
const { parse } = require('vue/compiler-sfc')

const root = path.resolve(__dirname, '..')
const contentFile = 'src/views/workbench/components/ResearchRecord/Content/index.vue'
const recordFile = 'src/views/workbench/components/ResearchRecord/index.vue'
const workspaceFile = 'src/views/workbench/ResearchWorkspace.vue'
const component = file => parse(fs.readFileSync(path.join(root, file), 'utf8')).descriptor
const content = component(contentFile)
const script = ts.createSourceFile('report.ts', content.scriptSetup.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
const declarations = new Set(['isDownloadingReport', 'canDownloadResearchReport', 'downloadResearchReport'])
const executable = script.statements.filter(statement =>
  ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration =>
    ts.isIdentifier(declaration.name) && declarations.has(declaration.name.text)
  )
).map(statement => statement.getText(script)).join('\n')

function report(overrides = {}, options = {}) {
  const props = reactive({ status: 3, content: '# Synthetic report\n\nVerified body.', ...overrides })
  const calls = { downloads: 0, successes: 0, failures: 0 }
  const context = {
    props, computed, ref, Blob,
    text: computed(() => props.content),
    sanitizeShareFragment: value => value,
    createShareDocument: value => value,
    triggerBlobDownload() {
      if (options.throwDownload) throw new Error('synthetic download failure')
      calls.downloads++
      if (options.reenter) context.download()
    },
    t: key => key,
    ms: { success: () => calls.successes++, error: () => calls.failures++ },
  }
  vm.createContext(context)
  const js = ts.transpileModule(executable, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText
  vm.runInContext(`${js}\nglobalThis.download = downloadResearchReport`, context)
  return { props, calls, download: context.download }
}

test('failed persisted result never downloads or reports success', () => {
  const result = report({ status: 4, content: 'Synthetic service unavailable' })
  result.download()
  assert.equal(result.calls.downloads, 0)
  assert.equal(result.calls.successes, 0)
})

for (const [name, state] of [
  ['pending', { status: 1 }],
  ['running', { status: 2 }],
  ['unknown status', { status: undefined }],
  ['aborted', { aborted: true }],
  ['loading', { loading: true }],
  ['user attachment message', { isUserMessage: true }],
  ['empty body', { content: ' \n\t' }],
]) {
  test(`${name} cannot be exported as a completed report`, () => {
    const result = report(state)
    result.download()
    assert.equal(result.calls.downloads, 0)
    assert.equal(result.calls.successes, 0)
  })
}

test('completed persisted report retains the download path', () => {
  const result = report()
  result.download()
  assert.equal(result.calls.downloads, 1)
  assert.equal(result.calls.successes, 1)
  assert.equal(result.calls.failures, 0)
})

test('reactive failure transition invalidates a previously completed report', () => {
  const result = report()
  result.props.status = 4
  result.download()
  assert.equal(result.calls.downloads, 0)
})

test('duplicate download is blocked while exporting', () => {
  const result = report({}, { reenter: true })
  result.download()
  assert.equal(result.calls.downloads, 1)
})

test('download failure does not emit success and releases the lock', () => {
  const result = report({}, { throwDownload: true })
  result.download()
  result.download()
  assert.equal(result.calls.successes, 0)
  assert.equal(result.calls.failures, 2)
})

function elements(node, tag) {
  return [
    ...(node.tag === tag ? [node] : []),
    ...(node.children || []).flatMap(child => elements(child, tag)),
  ]
}

function directive(element, name, argument) {
  return element.props.find(prop => prop.type === 7 && prop.name === name &&
    (argument === undefined || prop.arg?.content === argument))?.exp?.content
}

test('download button and handler use the same readiness decision', () => {
  const button = elements(content.template.ast, 'button').find(element =>
    directive(element, 'on', 'click') === 'downloadResearchReport'
  )
  assert.ok(button)
  assert.equal(directive(button, 'if'), 'canDownloadResearchReport')
})

for (const [file, tag, expected] of [
  [workspaceFile, 'ResearchRecord', { status: 'entry.item.status', aborted: 'entry.item.aborted' }],
  [recordFile, 'ResearchContent', { status: 'status', aborted: 'aborted' }],
]) {
  test(`${tag} forwards lifecycle state through the real template`, () => {
    const element = elements(component(file).template.ast, tag)[0]
    assert.ok(element)
    for (const [name, expression] of Object.entries(expected)) {
      assert.equal(directive(element, 'bind', name), expression)
    }
  })
}
