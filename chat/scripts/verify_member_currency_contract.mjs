import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { parse } from 'vue/compiler-sfc';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sharedImport = '../../../service/src/common/constants/packageCurrency';
const settlementKeys = [
  'billingCycle', 'billingMonths', 'price', 'originalPrice', 'originalTotal',
  'total', 'discountRate', 'saveAmount', 'monthlyEquivalentPrice', 'days',
  'model3Count', 'model4Count', 'drawMjCount', 'appCats',
];
const languages = ['zh-CN', 'zh-TW', 'en-US', 'ja-JP', 'ko-KR'];
let checks = 0;

function check(condition, category) {
  checks++;
  if (!condition)
    throw new Error(category);
}

function loadModule(relativePath, dependency) {
  const source = fs.readFileSync(path.join(root, relativePath), 'utf8');
  const exports = {};
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(compiled, {
    exports,
    module: { exports },
    require(specifier) {
      if (specifier === sharedImport && dependency)
        return dependency;
      throw new Error('dependency_boundary');
    },
  });
  return exports;
}

try {
  const currency = loadModule('service/src/common/constants/packageCurrency.ts');
  const pricing = loadModule('chat/src/utils/memberPricing.ts', currency);
  for (const [name, usdPrice] of [['Plus', 5], ['Pro', 12], ['Max', 25]]) {
    const pkg = {
      name, usdPrice, price: currency.packageUsdToCny(usdPrice), days: 30,
      model3Count: 1200, model4Count: 300, drawMjCount: 0, appCats: 'synthetic',
      annualDiscountRate: 20,
    };
    const hydrated = pricing.hydrateBillingOptions(pkg);
    for (const cycle of ['monthly', 'annual']) {
      const option = hydrated.billingOptions[cycle];
      const multiplier = cycle === 'annual' ? 12 : 1;
      check(option.model3Count === pkg.model3Count * multiplier, 'quota_contract');
      check(option.model4Count === pkg.model4Count * multiplier, 'quota_contract');
      check(option.drawMjCount === 0, 'quota_contract');
      check(option.days === (cycle === 'annual' ? 365 : 30), 'validity_contract');
      for (const language of languages) {
        const display = pricing.getMemberDisplayBilling(option, language);
        const usesCny = language === 'zh-CN';
        check(display.currency === (usesCny ? 'CNY' : 'USD'), 'language_currency');
        check(display.symbol === (usesCny ? '¥' : '$'), 'language_currency');
        check(display.price === (usesCny ? option.price : option.displayPrice), 'display_amount');
        check(display.originalTotal === (usesCny ? option.originalTotal : option.displayOriginalTotal), 'display_amount');
        check(display.saveAmount === (usesCny ? option.saveAmount : option.displaySaveAmount), 'display_amount');
        check(display.monthlyEquivalentPrice === (usesCny ? option.monthlyEquivalentPrice : option.displayMonthlyEquivalentPrice), 'display_amount');
      }
      const legacyOption = {
        ...option,
        displayPrice: option.price,
        displayOriginalPrice: option.originalPrice,
        displayOriginalTotal: option.originalTotal,
        displaySaveAmount: option.saveAmount,
        displayMonthlyEquivalentPrice: option.monthlyEquivalentPrice,
      };
      for (const legacyUsdPrice of [undefined, null, '', 0, -1]) {
        const legacyPkg = { ...pkg, usdPrice: legacyUsdPrice, billingOptions: { [cycle]: legacyOption } };
        const repaired = pricing.hydrateBillingOptions(legacyPkg).billingOptions[cycle];
        for (const key of settlementKeys)
          check(repaired[key] === legacyOption[key], 'legacy_settlement_contract');
        for (const [displayKey, paymentKey] of [
          ['displayPrice', 'price'], ['displayOriginalPrice', 'originalPrice'],
          ['displayOriginalTotal', 'originalTotal'], ['displaySaveAmount', 'saveAmount'],
          ['displayMonthlyEquivalentPrice', 'monthlyEquivalentPrice'],
        ])
          check(repaired[displayKey] === currency.packageCnyToUsd(legacyOption[paymentKey]), 'legacy_currency_fallback');
      }
      const preserved = pricing.hydrateBillingOptions({ ...pkg, billingOptions: { [cycle]: option } }).billingOptions[cycle];
      check(preserved === option, 'provided_billing_contract');
    }
  }
  for (const [name, usdPrice, expectedAnnualUsd] of [['Plus', 5, 48], ['Pro', 12, 115.2], ['Max', 25, 240]]) {
    for (const weight of [1, 50, 99]) {
      const pkg = { name, weight, usdPrice, price: currency.packageUsdToCny(usdPrice), days: 30 };
      const annual = pricing.createBillingOption(pkg, 'annual');
      check(annual.displayPrice === expectedAnnualUsd, 'default_annual_pricing');
      check(annual.price === currency.roundPackageMoney(annual.originalTotal * 0.8), 'annual_percent_unit');
      check(annual.days === 365, 'validity_contract');
    }
  }
  const annualFixture = { name: 'Synthetic', usdPrice: 10, price: currency.packageUsdToCny(10), days: 30 };
  for (const [annualDiscountRate, expectedAnnualUsd] of [[0, 120], [20, 96], [25, 90], [80, 24], [0.8, 119.04]]) {
    const annual = pricing.createBillingOption({ ...annualFixture, annualDiscountRate }, 'annual');
    check(annual.displayPrice === expectedAnnualUsd, 'explicit_annual_pricing');
  }
  for (const annualDiscountRate of [undefined, null, '', -1, 100, 150, Number.NaN, Number.POSITIVE_INFINITY, 'synthetic-invalid']) {
    const annual = pricing.createBillingOption({ ...annualFixture, annualDiscountRate }, 'annual');
    check(annual.displayPrice === 96, 'invalid_annual_fallback');
  }
  check(pricing.createBillingOption(annualFixture, 'annual', 25).displayPrice === 90, 'annual_fallback_compatibility');
  for (const language of languages) {
    const empty = pricing.getMemberDisplayBilling(undefined, language);
    check(empty.price === 0 && empty.originalTotal === 0 && empty.saveAmount === 0, 'empty_state');
  }
  const center = parse(fs.readFileSync(path.join(root, 'chat/src/components/Settings/MemberCenter.vue'), 'utf8')).descriptor;
  const payment = parse(fs.readFileSync(path.join(root, 'chat/src/components/Settings/MemberPayment.vue'), 'utf8')).descriptor;
  check(center.scriptSetup.content.includes('getMemberDisplayBilling(getDisplayBilling(pkg), appStore.language)'), 'center_language_binding');
  check(payment.scriptSetup.content.includes('getMemberDisplayBilling(billingInfo.value, appStore.language)'), 'payment_language_binding');
  check(!payment.template.content.includes('USD'), 'payment_currency_binding');
  check((payment.template.content.match(/displayPriceMeta\.currency/g) || []).length === 4, 'payment_currency_binding');
  check(payment.scriptSetup.content.includes('Number(data?.total)'), 'actual_payment_contract');
  check(payment.template.content.includes('lens.payment.actualPayment'), 'actual_payment_contract');
  for (const language of languages) {
    const locale = JSON.parse(fs.readFileSync(path.join(root, `chat/src/locales/${language}.json`), 'utf8'));
    const message = locale.lens.payment.actualPayment;
    check(typeof message === 'string' && message.includes('{amount}') && message.endsWith(' CNY'), 'actual_payment_translation');
    const member = locale.lens.member;
    const notice = locale.lens.usageNotice;
    check(member.features.basicModels.includes('YutoGPT 5.5') && member.features.basicModels.includes('GPT-6 luna'), 'tier_model_copy');
    check(member.features.advancedModels === 'GPT-6.1 Sol', 'tier_model_copy');
    for (const model of ['YutoGPT 5.5', 'GPT-6 luna', 'GPT-6.1 Sol', 'Claude Opus 5.5'])
      check(member.features.allModels.includes(model), 'tier_model_copy');
    check(!('advancedModelsLite' in member.features) && !('specialModels' in member.features), 'obsolete_model_copy');
    check(notice.plusNote.includes('YutoGPT 5.5') && notice.plusNote.includes('GPT-6 luna'), 'notice_model_copy');
    check(notice.proNote.includes('GPT-6.1 Sol'), 'notice_model_copy');
    check(notice.maxNote.includes('Claude Opus 5.5'), 'notice_model_copy');
  }
  const centerAst = ts.createSourceFile('synthetic.ts', center.scriptSetup.content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const featureFunction = centerAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'getPlanFeatureKeys');
  check(Boolean(featureFunction), 'tier_model_mapping');
  const featureContext = {
    getPlanPreset: pkg => ({ planKey: pkg.name }),
    result: undefined,
  };
  vm.runInNewContext(ts.transpileModule(`${featureFunction.getText(centerAst)}\nresult = getPlanFeatureKeys;`, {
    compilerOptions: { target: ts.ScriptTarget.ES2020 },
  }).outputText, featureContext);
  const plusFeatures = featureContext.result({ name: 'plus' });
  const proFeatures = featureContext.result({ name: 'pro' });
  const maxFeatures = featureContext.result({ name: 'max' });
  check(plusFeatures.includes('basicModels') && !plusFeatures.includes('advancedModels'), 'tier_model_mapping');
  check(proFeatures.includes('basicModels') && proFeatures.includes('advancedModels'), 'tier_model_mapping');
  check(maxFeatures.includes('allModels'), 'tier_model_mapping');
  check([...plusFeatures, ...proFeatures, ...maxFeatures].every(key => key !== 'specialModels' && key !== 'advancedModelsLite'), 'tier_model_mapping');
  const frontendNotice = loadModule('chat/src/constants/usageNotice.ts').LENS_USAGE_NOTICE;
  const backendNotice = loadModule('service/src/common/constants/usageNotice.constant.ts').LENS_USAGE_NOTICE;
  check(frontendNotice === backendNotice, 'default_notice_sync');
  for (const model of ['YutoGPT 5.5', 'GPT-6 luna', 'GPT-6.1 Sol', 'Claude Opus 5.5'])
    check(frontendNotice.includes(model), 'default_notice_models');
  const pointKeys = ['basicModelQuota', 'advancedModelQuota', 'drawingQuota'];
  const pointWords = { 'zh-CN': '积分', 'zh-TW': '積分', 'en-US': 'Points', 'ja-JP': 'ポイント', 'ko-KR': '포인트' };
  for (const language of languages) {
    const locale = JSON.parse(fs.readFileSync(path.join(root, 'chat/src/locales', language + '.json'), 'utf8'));
    for (const key of pointKeys) {
      check(locale.goods[key].includes(pointWords[language]), 'QUOTA_POINT_UNIT');
    }
  }
  const pointDeclarations = new Map();
  function collectPointDeclarations(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) {
      pointDeclarations.set(node.name.text, node.initializer);
    }
    ts.forEachChild(node, collectPointDeclarations);
  }
  collectPointDeclarations(centerAst);
  for (const [name, key] of [['model3Name', 'basicModelQuota'], ['model4Name', 'advancedModelQuota'], ['drawMjName', 'drawingQuota']]) {
    const initializer = pointDeclarations.get(name);
    check(Boolean(initializer), 'QUOTA_LABEL_DECLARATION');
    const labelExpression = initializer.getText(centerAst);
    check(labelExpression.includes('goods.' + key) && !labelExpression.includes('globalConfig'), 'QUOTA_LABEL_LANGUAGE_SOURCE');
  }

  console.log(JSON.stringify({ memberCurrencyContractPassed: true, checks, languageCount: languages.length }));
}
catch (error) {
  const allowed = new Set([
    'dependency_boundary', 'quota_contract', 'validity_contract', 'language_currency',
    'display_amount', 'legacy_settlement_contract', 'legacy_currency_fallback',
    'provided_billing_contract', 'empty_state', 'center_language_binding',
    'payment_language_binding', 'payment_currency_binding',
    'actual_payment_contract', 'actual_payment_translation',
    'default_annual_pricing', 'annual_percent_unit', 'explicit_annual_pricing',
    'invalid_annual_fallback', 'annual_fallback_compatibility',
    'tier_model_copy', 'obsolete_model_copy', 'notice_model_copy',
    'tier_model_mapping', 'default_notice_sync', 'default_notice_models',
  ]);
  console.error(JSON.stringify({ memberCurrencyContractPassed: false, checks, errorClassification: allowed.has(error.message) ? error.message : 'currency_contract' }));
  process.exitCode = 1;
}
