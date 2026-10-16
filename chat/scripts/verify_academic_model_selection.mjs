import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parse } from 'vue/compiler-sfc';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let checks = 0;

function check(condition, category) {
  checks++;
  if (!condition)
    throw new Error(category);
}

function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
}

let packageEntitlementContractRuntime;

try {
  const helperExports = {};
  vm.runInNewContext(compile(fs.readFileSync(path.join(root, 'service/src/common/utils/academicModelAccess.ts'), 'utf8')), {
    exports: helperExports,
    module: { exports: helperExports },
  });
  const packageEntitlementContractSource = fs.readFileSync(new URL("../../service/src/common/utils/packageEntitlements.ts", import.meta.url), "utf8");
  const packageEntitlementContractCode = ts.transpileModule(packageEntitlementContractSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const packageEntitlementContractModule = { exports: {} };
  new Function("module", "exports", packageEntitlementContractCode)(
    packageEntitlementContractModule,
    packageEntitlementContractModule.exports,
  );
  packageEntitlementContractRuntime = packageEntitlementContractModule.exports;

  const { canUseAcademicModel } = helperExports;
  const source = fs.readFileSync(path.join(root, 'chat/src/views/workbench/components/ResearchModelSelector.vue'), 'utf8');
  const descriptor = parse(source).descriptor;
  const ast = ts.createSourceFile('synthetic.ts', descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const functions = new Set([
    'canSelectModel', 'getRequiredModelPlan', 'getModelPermissionHint',
    'reconcilePreferredAcademicModel', 'refreshAcademicModelAccess',
    'queryModelsList', 'switchModel',
  ]);
  const computedNames = new Set(['currentModelOption', 'currentModelRestricted', 'currentModelLabel', 'getModelDisplayLabel']);
  const statements = ast.statements.filter(node => (
    ts.isFunctionDeclaration(node) && functions.has(node.name?.text)
  ) || (
    ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => computedNames.has(declaration.name.getText(ast)))
  ));
  check(statements.length === functions.size + computedNames.size, 'selector_function_contract');
  const productionCode = statements.map(node => node.getText(ast)).join('\n');
  const exposed = [...functions, 'currentModelRestricted', 'currentModelLabel'];
  const executable = compile(`${productionCode}\nresult = { ${exposed.join(', ')} };`);
  const model = (deductType, value = `synthetic-${deductType}`) => ({
    label: 'Synthetic model', value, deductType, deduct: 1, keyType: 1,
    modelDescription: 'Synthetic description', modelAvatar: '', maxRounds: 8,
    isFileUpload: false, isImageUpload: false, isNetworkSearch: false,
    isMcpTool: false, deepThinkingType: 0,
  });
  const options = [model(1), model(2), model(3), model(undefined, 'synthetic-unknown')];

  function harness(tier, preferred = options[2]) {
    const effects = { preferred: 0, records: 0, updates: 0, queries: 0, info: 0, errors: 0, login: 0 };
    const history = { modelInfo: { model: 'synthetic-3', modelName: 'Synthetic stored model', deductType: 3 }, fileInfo: {} };
    const group = { uuid: 7, config: JSON.stringify(history) };
    const store = {
      preferredModel: preferred, activeConfig: history, groupList: [group],
      setPreferredModel(value) { effects.preferred++; this.preferredModel = value; },
      setUsingDeepThinking() {}, setUsingNetwork() {},
      recordState() { effects.records++; },
      async queryMyGroup() { effects.queries++; },
    };
    const context = {
    isPackageModelAllowed: packageEntitlementContractRuntime.isPackageModelAllowed,
      result: undefined, canUseAcademicModel,
      resolveAcademicPlanTier: balance => balance.tier,
      academicTier: { value: tier }, modelsLoaded: { value: true },
      modelOptions: { value: options.map(option => ({ ...option })) },
      currentModelValue: { value: 'synthetic-3' },
      baseCurrentModelLabel: { value: 'Synthetic stored model' },
      activeGroupId: { value: 7 }, activeGroupInfo: { value: { appId: 0 } },
      configObj: { value: history },
      authStore: {
        isLogin: true, userBalance: { tier },
        setLoginDialog() { effects.login++; }, setUsingDeepThinking() {}, setUsingNetwork() {},
      },
      chatStore: store,
      computed: getter => ({ get value() { return getter(); } }),
      t: (key, params = {}) => `${key}:${params.plan || ''}:${params.model || ''}`,
      ms: { info() { effects.info++; }, error() { effects.errors++; } },
      sanitizeUserFacingErrorMessage: () => 'synthetic-safe-error',
      async fetchUpdateGroupAPI() { effects.updates++; return { success: true }; },
      async fetchQueryModelsListAPI() {
        return {
          success: true,
          data: { modelMaps: { synthetic: options.map(option => ({ ...option, model: option.value, modelName: option.label })) } },
        };
      },
    };
    vm.runInNewContext(executable, context);
    return { context, methods: context.result, effects, history, group };
  }

  const expectedClasses = { free: [1], plus: [1], pro: [1, 2], max: [1, 2, 3] };
  for (const [tier, allowed] of Object.entries(expectedClasses)) {
    for (const deductType of [1, 2, 3, undefined, null, 0, -1, 4, 'synthetic-invalid']) {
      const test = harness(tier);
      const option = model(deductType);
      const expected = allowed.includes(deductType);
      check(test.methods.canSelectModel(option) === expected, 'model_class_permissions');
      const previousHistory = JSON.stringify(test.history);
      const previousGroup = test.group.config;
      await test.methods.switchModel(option);
      if (expected) {
        check(test.effects.errors === 0 && test.effects.updates === 1, 'allowed_model_switch');
        check(test.effects.preferred === 1, 'allowed_model_switch');
      }
      else {
        check(test.effects.info === 1, 'denied_model_hint');
        check(test.effects.preferred === 0 && test.effects.records === 0 && test.effects.updates === 0, 'denied_model_side_effects');
        check(JSON.stringify(test.history) === previousHistory && test.group.config === previousGroup, 'history_preserved');
      }
    }
    const initial = harness(tier);
    const savedHistory = JSON.stringify(initial.history);
    initial.methods.reconcilePreferredAcademicModel();
    check(initial.context.chatStore.preferredModel === null || initial.methods.canSelectModel(initial.context.chatStore.preferredModel), 'allowed_preferred_only');
    check(JSON.stringify(initial.history) === savedHistory && initial.effects.records === 0 && initial.effects.updates === 0, 'history_preserved');
    check(initial.methods.currentModelRestricted.value === (tier !== 'max'), 'stored_model_restriction');
    check(tier === 'max' || initial.methods.currentModelLabel.value.includes('Max'), 'stored_model_restriction');
    const query = harness(tier);
    await query.methods.queryModelsList();
    check(query.context.chatStore.preferredModel === null || query.methods.canSelectModel(query.context.chatStore.preferredModel), 'query_preferred_only');
    check(query.effects.records === 0 && query.effects.updates === 0, 'history_preserved');
  }
  for (const [deductType, plan] of [[1, 'Plus'], [2, 'Pro'], [3, 'Max']])
    check(harness('free').methods.getRequiredModelPlan(model(deductType)) === plan, 'upgrade_hint_plan');
  for (const tier of ['plus', 'pro']) {
    const renamed = harness(tier);
    check(!renamed.methods.canSelectModel({ ...model(3), label: 'YutoGPT5.5', value: 'GPT-6 luna' }), 'display_name_cannot_authorize');
  }
  const expired = harness('max');
  expired.context.authStore.userBalance.tier = 'free';
  await expired.methods.switchModel(model(3));
  check(expired.effects.updates === 0 && expired.effects.records === 0, 'switch_rechecks_tier');
  expired.methods.refreshAcademicModelAccess();
  check(expired.context.chatStore.preferredModel?.deductType === 1, 'expired_preference_restricted');
  check(expired.methods.currentModelRestricted.value, 'stored_model_restriction');
  const unconfigured = harness('max');
  unconfigured.context.modelOptions.value = [model(undefined, 'synthetic-unconfigured')];
  unconfigured.methods.reconcilePreferredAcademicModel();
  check(unconfigured.context.chatStore.preferredModel === null, 'allowed_preferred_only');
  check(unconfigured.effects.records === 0 && unconfigured.effects.updates === 0, 'history_preserved');
  const anonymous = harness('plus');
  anonymous.context.authStore.isLogin = false;
  await anonymous.methods.switchModel(model(1));
  check(anonymous.effects.login === 1 && anonymous.effects.updates === 0, 'login_guard_retained');

  let disabledOption = false;
  function inspect(node) {
    if (node.type === 1 && node.tag === 'button' && node.props.some(prop => prop.name === 'on' && prop.exp?.content.includes('switchModel(option)')))
      disabledOption = node.props.some(prop => prop.name === 'bind' && prop.arg?.content === 'disabled' && prop.exp?.content === '!canSelectModel(option)');
    for (const child of node.children || [])
      inspect(child);
  }
  inspect(descriptor.template.ast);
  check(disabledOption, 'disabled_option_template');
  check(descriptor.template.content.includes('getModelPermissionHint(option)'), 'upgrade_hint_template');
  check(descriptor.scriptSetup.content.includes('watch([() => authStore.userBalance, modelOptions], refreshAcademicModelAccess'), 'tier_change_preference_refresh');
  for (const language of ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
    const locale = JSON.parse(fs.readFileSync(path.join(root, `chat/src/locales/${language}.json`), 'utf8')).lens.modelSelector;
    check(locale.upgradeRequired.includes('{plan}'), 'upgrade_hint_translation');
    check(locale.restrictedModel.includes('{model}') && locale.restrictedModel.includes('{plan}'), 'upgrade_hint_translation');
    check(locale.unavailableModel.includes('{model}') && Boolean(locale.unavailable), 'upgrade_hint_translation');
  }
  console.log(JSON.stringify({ academicModelSelectionPassed: true, checks, tierCount: 4, languageCount: 5 }));
}
catch (error) {
  const allowed = new Set([
    'selector_function_contract', 'model_class_permissions', 'allowed_model_switch',
    'denied_model_hint', 'denied_model_side_effects', 'history_preserved',
    'allowed_preferred_only', 'stored_model_restriction', 'query_preferred_only',
    'upgrade_hint_plan', 'display_name_cannot_authorize', 'switch_rechecks_tier',
    'expired_preference_restricted', 'login_guard_retained', 'disabled_option_template',
    'upgrade_hint_template', 'tier_change_preference_refresh', 'upgrade_hint_translation',
  ]);
  console.error(JSON.stringify({ academicModelSelectionPassed: false, checks, errorClassification: allowed.has(error.message) ? error.message : 'model_selection_contract' }));
  process.exitCode = 1;
}
