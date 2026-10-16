const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const failures = {
  PARSE_CONTRACT: 0,
  HISTORICAL_COMPATIBILITY: 0,
  TRANSLATION_CONTRACT: 0,
  TEMPLATE_SOURCE_CONTRACT: 0,
  MUTATION_CONTRACT: 0,
};
let passed = 0;

function check(condition, category) {
  if (condition) passed += 1;
  else failures[category] += 1;
}

try {
  const ts = require('typescript');
  const { createI18n } = require('vue-i18n');
  const { parse } = require('vue/compiler-sfc');
  const root = path.resolve(__dirname, '..');

  function loadTypeScript(file, resolveImport) {
    const source = fs.readFileSync(file, 'utf8');
    const output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const context = { module: { exports: {} }, exports: {}, TextEncoder, require: resolveImport };
    context.module.exports = context.exports;
    vm.runInNewContext(output, context);
    return context.exports;
  }

  const entitlementModule = loadTypeScript(
    path.resolve(root, '../service/src/common/utils/packageEntitlements.ts'),
    () => { throw new Error('IMPORT_NOT_ALLOWED'); },
  );
  const { getPackageUploadFeatures } = loadTypeScript(
    path.resolve(root, 'src/utils/packageUploadFeatures.ts'),
    name => {
      if (name === '../../../service/src/common/utils/packageEntitlements') return entitlementModule;
      throw new Error('IMPORT_NOT_ALLOWED');
    },
  );

  const packageWith = upload => ({ entitlements: JSON.stringify({ version: 1, upload }) });
  const translate = (key, values) => `${key}:${JSON.stringify(values || {})}`;
  const limited = packageWith({ mode: 'limited', dailyLimit: 7, maxFileSizeMb: 22 });
  const before = JSON.stringify(limited);
  const limitedFeatures = getPackageUploadFeatures(limited, translate);
  check(limitedFeatures.length === 2, 'PARSE_CONTRACT');
  check(limitedFeatures[0] === 'packageUploadFeatures.dailyLimit:{"count":7}', 'PARSE_CONTRACT');
  check(limitedFeatures[1] === 'packageUploadFeatures.fileAllowance:{"size":22}', 'PARSE_CONTRACT');
  check(JSON.stringify(limited) === before, 'MUTATION_CONTRACT');
  check(
    getPackageUploadFeatures(packageWith({ mode: 'unlimited', maxFileSizeMb: 45 }), translate)[1]
      === 'packageUploadFeatures.fileAllowance:{"size":30}',
    'PARSE_CONTRACT',
  );
  check(getPackageUploadFeatures(packageWith({ mode: 'unlimited' }), translate).length === 1, 'PARSE_CONTRACT');
  check(
    getPackageUploadFeatures(packageWith({ mode: 'disabled' }), translate)[0]
      === 'packageUploadFeatures.disabled:{}',
    'PARSE_CONTRACT',
  );
  check(getPackageUploadFeatures(packageWith({ mode: 'disabled' }), translate).length === 1, 'PARSE_CONTRACT');
  check(
    getPackageUploadFeatures({ entitlements: { version: 1, upload: { mode: 'limited', dailyLimit: 7 } } }, translate).length === 1,
    'PARSE_CONTRACT',
  );
  for (const value of [
    undefined, null, [], 'invalid', {},
    { entitlements: undefined },
    { entitlements: null },
    { entitlements: '{}' },
    { entitlements: '{invalid' },
    { entitlements: JSON.stringify({ version: 2, upload: { mode: 'unlimited' } }) },
    { entitlements: JSON.stringify({ version: 1 }) },
    packageWith({ mode: 'limited' }),
    packageWith({ mode: 'limited', dailyLimit: 0 }),
    packageWith({ mode: 'limited', dailyLimit: -1 }),
    packageWith({ mode: 'limited', dailyLimit: 1.5 }),
    packageWith({ mode: 'limited', dailyLimit: 7, maxFileSizeMb: -1 }),
    packageWith({ mode: 'disabled', maxFileSizeMb: 22 }),
    packageWith({ mode: 'unknown', dailyLimit: 7 }),
  ]) check(getPackageUploadFeatures(value, translate).length === 0, 'HISTORICAL_COMPATIBILITY');
  check(getPackageUploadFeatures(limited, () => { throw new Error('SYNTHETIC_TRANSLATOR_FAILURE'); }).length === 0, 'TRANSLATION_CONTRACT');
  check(getPackageUploadFeatures(limited, key => key).length === 0, 'TRANSLATION_CONTRACT');
  check(getPackageUploadFeatures(limited, () => '').length === 0, 'TRANSLATION_CONTRACT');

  const namespaceKeys = ['dailyLimit', 'unlimited', 'disabled', 'fileAllowance'];
  for (const locale of ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR']) {
    const messages = JSON.parse(fs.readFileSync(path.resolve(root, `src/locales/${locale}.json`), 'utf8'));
    const copy = messages.packageUploadFeatures;
    check(copy && Object.keys(copy).length === namespaceKeys.length, 'TRANSLATION_CONTRACT');
    check(namespaceKeys.every(key => typeof copy?.[key] === 'string' && copy[key].trim()), 'TRANSLATION_CONTRACT');
    check((copy.dailyLimit.match(/\{count\}/g) || []).length === 1, 'TRANSLATION_CONTRACT');
    check((copy.fileAllowance.match(/\{size\}/g) || []).length === 1, 'TRANSLATION_CONTRACT');
    const i18n = createI18n({ legacy: false, locale, fallbackLocale: false, missingWarn: false, fallbackWarn: false, messages: { [locale]: messages } });
    const t = (key, values) => i18n.global.t(key, values || {});
    const features = getPackageUploadFeatures(limited, t);
    check(features[0] === copy.dailyLimit.replace('{count}', '7'), 'TRANSLATION_CONTRACT');
    check(features[1] === copy.fileAllowance.replace('{size}', '22'), 'TRANSLATION_CONTRACT');
    check(getPackageUploadFeatures(packageWith({ mode: 'unlimited' }), t)[0] === copy.unlimited, 'TRANSLATION_CONTRACT');
    check(getPackageUploadFeatures(packageWith({ mode: 'disabled' }), t)[0] === copy.disabled, 'TRANSLATION_CONTRACT');
  }

  const component = fs.readFileSync(path.resolve(root, 'src/components/Settings/MemberCenter.vue'), 'utf8');
  const descriptor = parse(component).descriptor;
  let featureLoop;
  function walk(node) {
    if (node.type === 1) {
      const loop = node.props.find(prop => prop.type === 7 && prop.name === 'for' && /getPackageUploadFeatures/.test(prop.exp?.content || ''));
      if (loop) featureLoop = loop.exp.content;
    }
    for (const child of node.children || []) walk(child);
  }
  walk(descriptor.template.ast);
  check(typeof featureLoop === 'string', 'TEMPLATE_SOURCE_CONTRACT');
  check(/packageList\.find\(packageItem => packageItem\.id === [A-Za-z_$][\w$]*\.id\)/.test(featureLoop || ''), 'TEMPLATE_SOURCE_CONTRACT');
  check(/\[\.\.\.[\s\S]+, \.\.\.getPackageUploadFeatures\(/.test(featureLoop || ''), 'TEMPLATE_SOURCE_CONTRACT');
  check(descriptor.scriptSetup.content.includes("import { getPackageUploadFeatures } from '@/utils/packageUploadFeatures'"), 'TEMPLATE_SOURCE_CONTRACT');

  const failed = Object.values(failures).reduce((sum, count) => sum + count, 0);
  console.log(JSON.stringify({ checks: passed + failed, passed, failed, failures }));
  process.exitCode = failed ? 1 : 0;
} catch {
  console.log(JSON.stringify({ classification: 'PACKAGE_UPLOAD_FEATURE_CHECK_SETUP_FAILED' }));
  process.exitCode = 1;
}
