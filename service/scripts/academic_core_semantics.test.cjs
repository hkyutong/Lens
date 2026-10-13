const assert = require('node:assert/strict');
const test = require('node:test');
const { coreFixture, validateCoreAnswer } = require('./academic_core_semantics.cjs');

const examples = [
  ['中文润色', '本研究旨在分析降雨对植物生长的影响，相关实验尚未开展。'],
  ['英文润色', 'We investigate how rainfall affects plant growth. The experiment has not yet begun.'],
  ['绘制脑图', 'mindmap\n  root((降雨与植物生长))\n    降雨\n      土壤水分\n        植物生长'],
  ['中英互译', '降雨影响植物生长。'],
  ['参考文献转Bib', '@article{synthetic, title={Rainfall and Plant Growth}, author={Chen, A. and Liu, B.}, journal={Journal of Synthetic Ecology}, year={2024}}'],
  ['学术代码解读', '该函数将 a 和 b 相加，add(2, 3) 的返回值是 5。'],
];

for (const [name, answer] of examples) {
  test(`synthetic semantic contract: ${coreFixture(name).category}`, () => {
    const fixture = coreFixture(name);
    assert.equal(validateCoreAnswer(fixture, answer).passed, true);
    assert.equal(validateCoreAnswer(fixture, fixture.input).passed, false);
    assert.equal(validateCoreAnswer(fixture, '已收到：' + fixture.input).passed, false);
    assert.equal(validateCoreAnswer(fixture, '').passed, false);
  });
}

test('unknown capabilities are not guessed or silently treated as chat', () => {
  assert.equal(coreFixture('synthetic-unknown-capability'), null);
  assert.equal(coreFixture(null), null);
  assert.equal(validateCoreAnswer(null, 'synthetic answer').passed, false);
});

test('independent code result is required and unchanged English is rejected', () => {
  assert.equal(validateCoreAnswer(coreFixture('学术代码解读'), '两个参数相加，返回值是 4。').passed, false);
  assert.equal(validateCoreAnswer(coreFixture('英文润色'), 'We investigates how rainfall affect plant grow. The experiment has not started.').passed, false);
});

test('invented DOI and claimed experimental completion are rejected', () => {
  const bib = examples[4][1].replace('year={2024}', 'year={2024}, doi={10.0000/synthetic}');
  assert.equal(validateCoreAnswer(coreFixture('参考文献转Bib'), bib).passed, false);
  assert.equal(validateCoreAnswer(coreFixture('中文润色'), '本研究已经完成实验，证明降雨影响植物生长。').passed, false);
});

test('valid citation whitespace and an empty DOI placeholder are not fabricated facts', () => {
  const bib = '@article{synthetic, title={Rainfall and\nPlant Growth}, author={Chen, A. and Liu, B.}, journal={Journal of\nSynthetic Ecology}, year={ 2024 }, doi={}}';
  assert.equal(validateCoreAnswer(coreFixture('参考文献转Bib'), bib).passed, true);
});

const englishComparison = revisedSentence => [
  '| 原文 | 修改后的句子 | 修改原因 |',
  '| --- | --- | --- |',
  '| We investigates how rainfall affect plant grow. | ' + revisedSentence + ' | Correct grammar. |',
  '| The experiment has not started. | The experiment has not started. | Preserve the fact. |',
].join('\n');

test('English comparison checks the revised column and preserves research facts', () => {
  const result = validateCoreAnswer(coreFixture('english_polish'),
    englishComparison('We investigate how rainfall affects plant growth.'));
  assert.equal(result.passed, true);
});

test('English comparison still rejects grammar errors in the revised column', () => {
  const result = validateCoreAnswer(coreFixture('english_polish'),
    englishComparison('We investigates how rainfall affect plant grow.'));
  assert.equal(result.passed, false);
  assert.equal(result.checks.grammarRevised, false);
});

test('English comparison rejects changed facts even when the original column preserves them', () => {
  const answer = englishComparison('We investigate how rainfall affects plant growth.')
    .replace('| The experiment has not started. | The experiment has not started. |',
      '| The experiment has not started. | The experiment has started. |');
  const result = validateCoreAnswer(coreFixture('english_polish'), answer);
  assert.equal(result.passed, false);
  assert.equal(result.checks.experimentNotClaimed, false);
});

test('English grammar checks cannot be evaded with Markdown emphasis', () => {
  const result = validateCoreAnswer(coreFixture('english_polish'),
    'We **investigates** how rainfall affect **plant grow**. The experiment has not started.');
  assert.equal(result.passed, false);
  assert.equal(result.checks.grammarRevised, false);
});

test('An unrelated table cannot hide English grammar errors', () => {
  const answer = 'We investigates how rainfall affect plant grow. The experiment has not started.\n'
    + '| Metric | Value |\n| --- | --- |\n| rainfall | plant growth |';
  assert.equal(validateCoreAnswer(coreFixture('english_polish'), answer).passed, false);
});

test('Word-level comparison retains the complete revised paragraph', () => {
  const answer = [
    'We investigate how rainfall affects plant growth. The experiment has not started.',
    '',
    '| 原文 | 修改后的词语 | 修改原因 |',
    '| --- | --- | --- |',
    '| investigates | investigate | Correct agreement. |',
    '| plant grow | growth | Use the noun. |',
  ].join('\n');
  assert.equal(validateCoreAnswer(coreFixture('english_polish'), answer).passed, true);
});

test('A comparison cannot hide grammar errors outside the table', () => {
  const answer = 'We investigates how rainfall affect plant grow.\n'
    + englishComparison('We investigate how rainfall affects plant growth.');
  const result = validateCoreAnswer(coreFixture('english_polish'), answer);
  assert.equal(result.passed, false);
  assert.equal(result.checks.grammarRevised, false);
});
