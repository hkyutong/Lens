import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

let errorCategory = 'TEST_SETUP_FAILED';

async function main() {
  const require = createRequire(import.meta.url);
  const ts = require('typescript');
  const { parse, compileTemplate } = require('vue/compiler-sfc');
  const directory = path.dirname(fileURLToPath(import.meta.url));
  const componentPath = path.resolve(directory, '../src/components/Settings/MemberCenter.vue');
  const component = parse(fs.readFileSync(componentPath, 'utf8')).descriptor;
  const source = ts.createSourceFile('component.ts', [component.script?.content, component.scriptSetup?.content].filter(Boolean).join('\n'), ts.ScriptTarget.Latest, true);
  const requestSource = ts.createSourceFile('request.ts', fs.readFileSync(path.resolve(directory, '../src/utils/request/index.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  const functions = new Map();
  const collect = (node, target) => {
    if (ts.isFunctionDeclaration(node) && node.name) target.set(node.name.text, node);
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) target.set(node.name.text, node);
    ts.forEachChild(node, (child) => collect(child, target));
  };
  collect(source, functions);
  const requestFunctions = new Map();
  collect(requestSource, requestFunctions);
  const printer = ts.createPrinter();
  const compile = (parsed, definitions, roots, scope) => {
    const selected = new Set();
    const select = (name) => {
      if (selected.has(name) || !definitions.has(name)) return;
      selected.add(name);
      const declaration = definitions.get(name);
      const inspect = (node) => {
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && definitions.has(node.expression.text) && !(node.expression.text in scope)) select(node.expression.text);
        ts.forEachChild(node, inspect);
      };
      inspect(declaration);
    };
    roots.forEach(select);
    assert.equal(roots.every((name) => selected.has(name)), true);
    const code = [...selected].map((name) => {
      const node = definitions.get(name);
      return printer.printNode(ts.EmitHint.Unspecified, ts.isVariableDeclaration(node) ? node.parent.parent : node, parsed);
    }).join('\n') + '\nmodule.exports = {' + roots.join(',') + '};';
    const compiled = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
    const context = { ...scope, module: { exports: {} }, console: { log() {}, warn() {}, error() {} } };
    vm.runInNewContext(compiled, context);
    return context.module.exports;
  };
  const { successHandler } = compile(requestSource, requestFunctions, ['successHandler'], { useAuthStore: () => ({ removeToken() {} }) });
  const rows = [
    { id: 1, name: 'Plus', price: 33.47, usdPrice: 5 },
    { id: 2, name: 'Pro', price: 80.33, usdPrice: 12 },
    { id: 3, name: 'Max', price: 167.34, usdPrice: 25 },
  ];
  const envelope = { code: 200, success: true, data: { rows, count: rows.length } };
  errorCategory = 'RESPONSE_UNWRAP_FAILED';
  const publicResponse = await successHandler({ status: 200, data: envelope });
  assert.equal(publicResponse.data.rows.length, 3);
  let checks = 1;
  errorCategory = 'ANONYMOUS_TEMPLATE_HIDES_CATALOG';
  const template = compileTemplate({ id: 'public-package-regression', filename: 'component.vue', source: component.template.content }).ast;
  const referencesBinding = (node, name) => {
    if (!node) return false;
    if (typeof node === 'string') return new RegExp('\\b' + name + '\\b').test(node);
    if (typeof node.content === 'string' && new RegExp('\\b' + name + '\\b').test(node.content)) return true;
    return (node.children || []).some((child) => referencesBinding(child, name));
  };
  const loadingChains = [];
  const inspectTemplate = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 9 && node.branches.some((branch) => referencesBinding(branch.condition, 'loading'))) loadingChains.push(node);
    for (const child of node.children || []) inspectTemplate(child);
    for (const branch of node.branches || []) inspectTemplate(branch);
  };
  inspectTemplate(template);
  assert.equal(loadingChains.length > 0, true);
  assert.equal(loadingChains.every((chain) => chain.branches.every((branch) => !referencesBinding(branch.condition, 'isLogin'))), true);
  checks++;
  const scenario = ({ loggedIn = true, profileRejected = false, catalogRejected = false, mode = 'pricing' } = {}) => {
    const state = { packageCalls: 0, profileCalls: 0, loginPrompts: 0, purchaseCalls: 0, paymentViews: 0 };
    const packageList = { value: [] };
    const packageLoadFailed = { value: false };
    const loading = { value: false };
    const scope = {
      props: { mode },
      isLogin: { value: loggedIn },
      loading,
      packageLoadFailed,
      packageList,
      selectName: { value: '' },
      displayPackages: { get value() { return packageList.value; } },
      checkLoginStatus: () => { if (!loggedIn) state.loginPrompts++; return loggedIn; },
      authStore: { userInfo: { userBalance: { userId: 17 } }, getUserInfo: async () => { state.profileCalls++; if (profileRejected) throw new Error('SYNTHETIC_PROFILE_REJECTION'); } },
      fetchGetPackageAPI: async () => { state.packageCalls++; if (catalogRejected) throw new Error('SYNTHETIC_CATALOG_REJECTION'); return publicResponse; },
      hydrateBillingOptions: (pkg) => ({ ...pkg }),
      getSigninLog: async () => undefined,
      payChannel: { value: 'synthetic' },
      payPlatform: { value: 'synthetic' },
      isWxEnv: false,
      ms: { warning() {} },
      t: (key) => key,
      handleBuyGoods: async () => { state.purchaseCalls++; },
      showPaymentView: () => { state.paymentViews++; },
    };
    const functions = compile(source, new Map([...globalFunctions]), ['openDrawerAfter', 'handleSuccess'], scope);
    return { ...functions, state, packageList, packageLoadFailed, loading };
  };
  const globalFunctions = functions;
  errorCategory = 'HEALTHY_CATALOG_LOAD_FAILED';
  const healthy = scenario();
  await healthy.openDrawerAfter();
  assert.equal(healthy.state.packageCalls, 1);
  assert.equal(healthy.state.profileCalls, 0);
  assert.equal(healthy.packageList.value.length, 3);
  assert.equal(healthy.packageLoadFailed.value, false);
  assert.equal(healthy.loading.value, false);
  checks++;
  errorCategory = 'PROFILE_FAILURE_HIDES_CATALOG';
  const profileFailure = scenario({ profileRejected: true, mode: 'full' });
  await profileFailure.openDrawerAfter();
  assert.equal(profileFailure.state.profileCalls, 1);
  assert.equal(profileFailure.state.packageCalls, 1);
  assert.equal(profileFailure.packageList.value.length, 3);
  assert.equal(profileFailure.packageLoadFailed.value, false);
  assert.equal(profileFailure.loading.value, false);
  checks++;
  errorCategory = 'CATALOG_FAILURE_STATE_FAILED';
  const catalogFailure = scenario({ catalogRejected: true });
  await catalogFailure.openDrawerAfter();
  assert.equal(catalogFailure.state.packageCalls, 1);
  assert.equal(catalogFailure.packageList.value.length, 0);
  assert.equal(catalogFailure.packageLoadFailed.value, true);
  assert.equal(catalogFailure.loading.value, false);
  checks++;
  errorCategory = 'RETRY_ERROR_CLEARING_FAILED';
  const retry = scenario();
  retry.packageLoadFailed.value = true;
  await retry.openDrawerAfter();
  assert.equal(retry.packageLoadFailed.value, false);
  assert.equal(retry.packageList.value.length, 3);
  checks++;
  errorCategory = 'ANONYMOUS_CATALOG_BLOCKED';
  const anonymous = scenario({ loggedIn: false });
  await anonymous.openDrawerAfter();
  assert.equal(anonymous.state.packageCalls, 1);
  assert.equal(anonymous.state.profileCalls, 0);
  assert.equal(anonymous.packageList.value.length, 3);
  assert.equal(anonymous.packageLoadFailed.value, false);
  checks++;
  errorCategory = 'ANONYMOUS_PURCHASE_UNGUARDED';
  await anonymous.handleSuccess(rows[0]);
  assert.equal(anonymous.state.loginPrompts, 1);
  assert.equal(anonymous.state.purchaseCalls, 0);
  assert.equal(anonymous.state.paymentViews, 0);
  checks++;
  process.stdout.write(JSON.stringify({ publicPackageLoadingContractPassed: true, checks, errorCategory: 'NONE', syntheticFixturesOnly: true }) + '\n');
}

main().catch(() => {
  process.stdout.write(JSON.stringify({ publicPackageLoadingContractPassed: false, errorCategory }) + '\n');
  process.exitCode = 1;
});
