import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const tsModelPolicy = createRequire(import.meta.url)('typescript');
const modelPolicyExports = {};
vm.runInNewContext(tsModelPolicy.transpileModule(fs.readFileSync(new URL('../../service/src/common/utils/academicModelAccess.ts', import.meta.url), 'utf8'), { compilerOptions: { module: tsModelPolicy.ModuleKind.CommonJS, target: tsModelPolicy.ScriptTarget.ES2020 } }).outputText, { exports: modelPolicyExports });


const chatRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const projectRoot = path.resolve(chatRoot, '..');
const require = createRequire(path.join(chatRoot, 'package.json'));
const ts = require('typescript');
const languages = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR'];
const check = (passed, code) => {
  if (!passed) throw new Error(`[lens-multilingual-contract] ${code}`);
};
const flatten = (value, prefix = '', result = {}) => {
  for (const [key, item] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key;
    if (item && typeof item === 'object') flatten(item, name, result);
    else result[name] = item;
  }
  return result;
};
const dictionaries = Object.fromEntries(languages.map(language => [
  language,
  flatten(JSON.parse(fs.readFileSync(path.join(chatRoot, 'src/locales', `${language}.json`), 'utf8'))),
]));
const sourceFiles = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
  const filename = path.join(directory, entry.name);
  return entry.isDirectory() ? sourceFiles(filename) : /\.(vue|ts)$/.test(entry.name) ? [filename] : [];
});
const activeKeys = new Set();
const { parse: parseVue } = require('vue/compiler-sfc');
let accessibilityLabelChecks = 0;
for (const filename of sourceFiles(path.join(chatRoot, 'src'))) {
  const source = fs.readFileSync(filename, 'utf8');
  if (!/\bt\(['"]lens\./.test(source)) continue;
  for (const match of source.matchAll(/\bt\(['"]([^'"\r\n]+)['"]/g)) activeKeys.add(match[1]);
  if (filename.endsWith('.vue')) {
    const template = parseVue(source).descriptor.template?.ast;
    const inspectTemplate = node => {
      if (node.type === 1) {
        for (const prop of node.props || []) {
          if (prop.type !== 6 || !['aria-label', 'title', 'placeholder', 'alt'].includes(prop.name)) continue;
          accessibilityLabelChecks++;
          check(!/[\u3400-\u9fff]/.test(prop.value?.content || ''), 'hardcoded-accessibility-label');
        }
      }
      for (const child of node.children || []) inspectTemplate(child);
    };
    if (template) inspectTemplate(template);
  }

}
const lensKeys = Object.keys(dictionaries['zh-CN']).filter(key => key.startsWith('lens.'));
const parameters = value => [...value.matchAll(/\{([\w]+)\}/g)].map(match => match[1]).sort().join(',');
for (const language of languages) {
  for (const key of new Set([...activeKeys, ...lensKeys])) {
    const value = dictionaries[language][key];
    check(typeof value === 'string', 'translation-missing');
    if (activeKeys.has(key)) check(value.trim().length > 0, 'active-translation-empty');
    check(parameters(value) === parameters(dictionaries['zh-CN'][key]), 'translation-parameters-mismatch');
  }
}
const compile = (source, dependencies = {}, globals = {}) => {
  const module = { exports: {} };
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(output, { ...modelPolicyExports,
    module,
    exports: module.exports,
    require: name => {
      check(Object.hasOwn(dependencies, name), 'unexpected-test-dependency');
      return dependencies[name];
    },
    ...globals,
  });
  return module.exports;
};
const backendFilename = path.join(projectRoot, 'service/src/modules/academic/academic.service.ts');
const backendSource = ts.createSourceFile(backendFilename, fs.readFileSync(backendFilename, 'utf8'), ts.ScriptTarget.Latest, true);
const methodNames = new Set([
  'normalizePluginName', 'resolveAcademicPlanTier', 'getAcademicWorkflowStepLimit',
  'canUseAcademicCoreByTier', 'canUseAcademicPluginByTier', 'assertAcademicWorkflowAccess',
]);
const methods = [];
const visit = node => {
  if (ts.isMethodDeclaration(node) && methodNames.has(node.name.getText(backendSource))) methods.push(node.getText(backendSource));
  ts.forEachChild(node, visit);
};
visit(backendSource);
check(methods.length === methodNames.size, 'backend-contract-unavailable');
const serviceRequire = createRequire(path.join(projectRoot, 'service/package.json'));
const { HttpException, HttpStatus } = serviceRequire('@nestjs/common');
const backend = new (compile(`export class PlanContract {${methods.join('\n')}}`, {}, { HttpException, HttpStatus }).PlanContract)();
let permissionChecks = 0;
let workflowChecks = 0;
const mapSource = fs.readFileSync(path.join(chatRoot, 'src/utils/academicI18n.ts'), 'utf8');
const planSource = fs.readFileSync(path.join(chatRoot, 'src/utils/academicPlanAccess.ts'), 'utf8');
for (const language of languages) {
  const t = key => dictionaries[language][key] ?? key;
  const entities = compile(`${mapSource}\nexport { academicEntityKeyMap };`, { '@/locales': { t } });
  const plan = compile(planSource, { '@/utils/academicI18n': entities });
  const balances = { free: {} };
  for (let weight = 1; weight <= 100; weight++) {
    const balance = { packageId: 1, packageWeight: weight, packageName: '', expirationTime: '2999-01-01' };
    const tier = backend.resolveAcademicPlanTier(balance);
    if (['plus', 'pro', 'max'].includes(tier) && !balances[tier]) balances[tier] = balance;
  }
  check(Object.keys(balances).length === 4, 'paid-tier-fixtures-unavailable');
  for (const [tier, balance] of Object.entries(balances)) {
    check(plan.resolveAcademicPlanTier(balance) === tier, 'frontend-backend-tier-mismatch');
    check(plan.getAcademicWorkflowStepLimit(balance) === backend.getAcademicWorkflowStepLimit(balance), 'workflow-limit-mismatch');
    const localizedPackage = { ...balance, packageName: dictionaries[language]['lens.settings.upgradePlan'] };
    check(plan.resolveAcademicPlanTier(localizedPackage) === tier, 'translated-package-name-changes-tier');
    const expired = { ...balance, expirationTime: '2000-01-01' };
    check(plan.resolveAcademicPlanTier(expired) === 'free' && backend.resolveAcademicPlanTier(expired) === 'free', 'expired-membership-grants-access');
    for (const [name, key] of Object.entries(entities.academicEntityKeyMap)) {
      const original = { name, displayName: name };
      const label = entities.getAcademicEntityDisplayLabel(original);
      const translated = { name, displayName: label };
      check(entities.getAcademicEntitySelectorValue(translated) === name, 'translation-changes-selector-value');
      const kind = key.includes('.core.') ? 'core' : 'plugin';
      const frontendCheck = kind === 'core' ? plan.canUseAcademicCore : plan.canUseAcademicPlugin;
      const serverCheck = kind === 'core' ? backend.canUseAcademicCoreByTier.bind(backend) : backend.canUseAcademicPluginByTier.bind(backend);
      check(frontendCheck(original, balance) === serverCheck(name, tier), 'frontend-backend-capability-mismatch');
      check(frontendCheck(translated, balance) === frontendCheck(original, balance), 'translated-label-changes-permission');
      check(frontendCheck({ displayName: name }, balance) === frontendCheck(original, balance), 'historical-label-fallback-changed');
      check(frontendCheck(name, balance) === frontendCheck(original, balance), 'historical-string-fallback-changed');
      permissionChecks += 4;
    }
    const unknownAbility = { name: 'Unrecognized synthetic capability', displayName: '中文润色' };
    check(plan.canUseAcademicCore(unknownAbility, balance) === backend.canUseAcademicCoreByTier(unknownAbility.name, tier), 'display-label-grants-unknown-core');
    check(plan.canUseAcademicPlugin(unknownAbility, balance) === backend.canUseAcademicPluginByTier(unknownAbility.name, tier), 'display-label-grants-unknown-plugin');
    permissionChecks += 2;
    if (tier !== 'free') {
      const core = Object.entries(entities.academicEntityKeyMap).find(([name, key]) => key.includes('.core.') && backend.canUseAcademicCoreByTier(name, tier));
      check(Boolean(core), 'allowed-core-fixture-unavailable');
      const step = { kind: 'core', name: core[0], displayName: t(`${core[1]}.label`) };
      const limit = backend.getAcademicWorkflowStepLimit(balance);
      backend.assertAcademicWorkflowAccess(balance, Array.from({ length: limit }, () => step));
      let rejected = false;
      try { backend.assertAcademicWorkflowAccess(balance, Array.from({ length: limit + 1 }, () => step)); }
      catch (error) { rejected = error?.getStatus?.() === HttpStatus.PAYMENT_REQUIRED; }
      check(rejected, 'workflow-over-limit-accepted');
      workflowChecks += 2;
    }
  }
}
console.log(JSON.stringify({ multilingualContractPassed: true, languageCount: languages.length, activeTranslationKeyCount: activeKeys.size, permissionChecks, workflowChecks, accessibilityLabelChecks }));
