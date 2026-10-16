const fsModelPolicy = require('node:fs');
const vmModelPolicy = require('node:vm');
const tsModelPolicy = require('typescript');
const modelPolicyExports = {};
vmModelPolicy.runInNewContext(tsModelPolicy.transpileModule(fsModelPolicy.readFileSync(require('node:path').resolve(__dirname, '../src/common/utils/academicModelAccess.ts'), 'utf8'), { compilerOptions: { module: tsModelPolicy.ModuleKind.CommonJS, target: tsModelPolicy.ScriptTarget.ES2020 } }).outputText, { exports: modelPolicyExports });
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

// Exercise the production resolver with synthetic model rows only.
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/modules/academic/academic.service.ts'), 'utf8');
const ast = ts.createSourceFile('academic.ts', source, ts.ScriptTarget.Latest, true);
const service = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'AcademicService');
const constants = ast.statements.filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => ['LENS_DEFAULT_ACADEMIC_MODEL', 'isLensDeepSeekV32'].includes(declaration.name.getText(ast))));
const methodNames = ['resolveAcademicModelInfo', 'isModelEnabled', 'resolveAcademicRuntimeFallbackModelInfo'];
const methods = service.members.filter(node => ts.isMethodDeclaration(node) && methodNames.includes(node.name.getText(ast)));
const compile = constants.map(node => node.getText(ast)).join('\n') + '\nclass Resolver {' + methods.map(node => node.getText(ast)).join('\n') + '}\nResolver;';
const Resolver = vm.runInNewContext(ts.transpileModule(compile, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, { ...modelPolicyExports });

const row = (model, enabled = true) => ({ model, modelName: model, status: enabled });
function fixture(rows) {
  const resolver = new Resolver();
  resolver.findAcademicModelInfo = async (model, name) => rows.find(item => item.model === model || item.modelName === name) || null;
  resolver.modelsService = {
    getCurrentModelKeyInfo: async model => rows.find(item => item.model === model) || null,
    getAllKey: async () => rows,
  };
  return resolver;
}

test('unspecified model chooses configured V3.2 regardless of catalog order', async () => {
  const resolver = fixture([row('synthetic-other'), row('deepseek-v3.2')]);
  assert.equal((await resolver.resolveAcademicModelInfo('', '')).resolvedModel, 'deepseek-v3.2');
});

test('legacy deepseek-chat session resolves the configured V3.2 alias', async () => {
  const resolver = fixture([row('deepseek-v3.2')]);
  assert.equal((await resolver.resolveAcademicModelInfo('deepseek-chat', '')).resolvedModel, 'deepseek-v3.2');
});

test('missing or disabled V3.2 never chooses another model', async () => {
  for (const rows of [[row('synthetic-other')], [row('deepseek-v3.2', false), row('synthetic-other')]]) {
    assert.equal(await fixture(rows).resolveAcademicModelInfo('', ''), null);
  }
});

test('disabled alias does not hide another enabled V3.2 row', async () => {
  const result = await fixture([row('deepseek-chat', false), row('deepseek-v3.2')]).resolveAcademicModelInfo('deepseek-chat', '');
  assert.equal(result.resolvedModel, 'deepseek-v3.2');
});

test('numeric database status values preserve enabled model visibility', async () => {
  const resolver = fixture([
    { model: 'deepseek-v3.2', modelName: 'DeepSeek V3.2', status: 1 },
    { model: 'disabled-model', modelName: 'Disabled', status: 0 },
  ]);
  assert.equal((await resolver.resolveAcademicModelInfo('', '')).resolvedModel, 'deepseek-v3.2');
  assert.equal(
    (await resolver.resolveAcademicModelInfo('disabled-model', 'Disabled')).modelInfo,
    null,
  );
});

test('an explicitly selected enabled model is resolved without being relabeled', async () => {
  const result = await fixture([row('gpt-6-luna'), row('deepseek-v3.2')]).resolveAcademicModelInfo('gpt-6-luna', 'GPT-6 Luna');
  assert.equal(result.resolvedModel, 'gpt-6-luna');
});

test('a missing or disabled explicit model remains unavailable', async () => {
  for (const rows of [[row('deepseek-v3.2')], [row('gpt-6-luna', false), row('deepseek-v3.2')]]) {
    const result = await fixture(rows).resolveAcademicModelInfo('gpt-6-luna', 'GPT-6 Luna');
    assert.equal(result.modelInfo, null);
  }
});

test('an unverified fuzzy model name cannot be selected as V3.2', async () => {
  assert.equal(await fixture([row('synthetic-deepseek-3.2-other')]).resolveAcademicModelInfo('', ''), null);
});

test('runtime failure never falls back for either V3.2 alias', async () => {
  for (const model of ['deepseek-chat', 'deepseek-v3.2']) {
    assert.equal(await fixture([row(model), row('synthetic-other')]).resolveAcademicRuntimeFallbackModelInfo({ model }), null);
  }
});
