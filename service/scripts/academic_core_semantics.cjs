const fixtures = [
  {
    category: 'chinese_polish',
    names: /中文.*润色|Chinese.*Polish|polish.*(?:cn|zh)/i,
    input: '请仅给出润色后的学术表述，保留实验尚未开展这一事实：本研究分析了雨量影响植物长大，但实验还没有做。',
    checks: text => ({
      rainfallPreserved: /降雨|降水|雨量/.test(text),
      plantGrowthPreserved: /植物.*生长/.test(text),
      experimentNotClaimed: /(?:尚未|未|没有|尚待).{0,12}实验|实验.{0,12}(?:尚未|未|没有|尚待)/.test(text),
    }),
  },
  {
    category: 'english_polish',
    names: /英文.*润色|English.*Polish|polish.*en/i,
    input: 'Polish the following academic English. Return the revised text only and preserve that the experiment has not started: We investigates how rainfall affect plant grow. The experiment has not started.',
    checks: text => ({
      rainfallPreserved: /\b(?:rainfall|rain|precipitation)\b/i.test(text),
      plantGrowthPreserved: /\bplant(?:s)?\b/i.test(text) && /\b(?:growth|development)\b/i.test(text),
      grammarRevised: !/\bwe investigates\b|\bplant grow\b/i.test(text),
      experimentNotClaimed: /\b(?:not|yet|pending|unstarted)\b|remain(?:s)?\s+to\s+be\s+(?:conducted|performed|undertaken|started)/i.test(text),
    }),
  },
  {
    category: 'mindmap',
    names: /脑图|思维导图|mind.*map/i,
    input: '研究主题为降雨与植物生长。变量包括降雨、土壤水分、植物生长。降雨影响土壤水分，土壤水分影响植物生长。请给出可渲染的 Mermaid 脑图，不添加研究结果。',
    checks: text => ({
      diagramPresent: /\bmindmap\b|\bflowchart\b|\bgraph\s+(?:TD|TB|LR|RL|BT)\b/i.test(text),
      rainfallPreserved: /降雨|降水|rainfall|precipitation/i.test(text),
      soilMoisturePreserved: /土壤.*水分|soil.*moisture/i.test(text),
      plantGrowthPreserved: /植物.*生长|plant.*(?:growth|development)/i.test(text),
    }),
  },
  {
    category: 'translation',
    names: /互译|翻译|translation|translate/i,
    input: '请仅将这句英文翻译为中文，不额外扩展内容：Rainfall affects plant growth.',
    checks: text => ({
      rainfallTranslated: /降雨|降水|雨水/.test(text),
      plantGrowthTranslated: /植物/.test(text) && /生长/.test(text),
    }),
  },
  {
    category: 'bibliography',
    names: /Bib|参考文献/i,
    input: '以下是合成测试文献，请转为 BibTeX。不要联网检索，不要补写 DOI：Chen, A.; Liu, B. (2024). Rainfall and Plant Growth. Journal of Synthetic Ecology, 12(3), 45-52.',
    checks: text => ({
      bibtexEntryPresent: /@article\s*\{/i.test(text),
      titlePreserved: /Rainfall\s+and\s+Plant\s+Growth/i.test(text),
      yearPreserved: /year\s*=\s*[{"]?\s*2024\b/i.test(text),
      authorsPreserved: /Chen/i.test(text) && /Liu/i.test(text),
      journalPreserved: /Journal\s+of\s+Synthetic\s+Ecology/i.test(text),
      noInventedDoi: !unprovidedDoiValue(text),
    }),
  },
  {
    category: 'code_explanation',
    names: /代码.*(?:解释|解读|解析|分析|解说)|(?:解释|解读|解析|分析).*代码|code.*explan|explain.*code/i,
    input: '请用中文解释以下合成代码的作用，并说明最后一次调用的返回值和原因，不执行其他操作：\ndef add(a, b):\n    return a + b\n\nadd(2, 3)',
    checks: text => ({
      independentReturnValueCorrect: /(?<!\d)5(?!\d)/.test(text),
      additionExplained: /相加|加法|求和|和为|a\s*\+\s*b|addition|sum/i.test(text),
      explanationInChinese: /[\u4e00-\u9fff]/.test(text),
    }),
  },
];

function unprovidedDoiValue(text) {
  const field = /\bdoi\s*=\s*(\{[^}]*\}|"[^"]*"|[^,\s}]+)/i.exec(text);
  return field ? field[1].replace(/^[{"]|[}"]$/g, '').trim().length > 0 : false;
}

function coreFixture(name) {
  if (typeof name !== 'string') return null;
  const fixture = fixtures.find(value => value.names.test(name));
  return fixture ? { category: fixture.category, input: fixture.input } : null;
}

function validateCoreAnswer(fixture, answer) {
  const contract = fixtures.find(value => value.category === fixture?.category);
  if (!contract || typeof answer !== 'string') {
    return { passed: false, checks: { recognizedFixtureAndAnswer: false } };
  }
  const text = answer.trim();
  const checks = {
    answerPresent: text.length > 0,
    fullPromptNotEchoed: !text.includes(fixture.input),
    ...contract.checks(text),
  };
  return { passed: Object.values(checks).every(Boolean), checks };
}

module.exports = { coreFixture, validateCoreAnswer };
