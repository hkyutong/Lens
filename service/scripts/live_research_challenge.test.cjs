const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createResearchChallenge, containsResearchAnswer, inspectResearchProtocol } = require('./live_research_challenge.cjs');

test('the expected response is derived independently and absent from the question', () => {
  const values = [231, 245];
  const challenge = createResearchChallenge(() => values.shift());
  assert.equal(challenge.answer, '476');
  assert.equal(challenge.prompt.includes(challenge.answer), false);
  assert.equal(containsResearchAnswer(challenge.prompt, challenge.answer), false);
});

test('a computed response passes while an echo or a different number fails', () => {
  assert.equal(containsResearchAnswer('Research result\n476', '476'), true);
  assert.equal(containsResearchAnswer('The result is 476.', '476'), true);
  assert.equal(containsResearchAnswer('Received: calculate 231 + 245', '476'), false);
  assert.equal(containsResearchAnswer('1476', '476'), false);
  assert.equal(containsResearchAnswer('4760', '476'), false);
  assert.equal(containsResearchAnswer('475', '476'), false);
});

test('invalid answers cannot become regular-expression patterns', () => {
  assert.equal(containsResearchAnswer('anything', '.*'), false);
  assert.equal(containsResearchAnswer(null, '476'), false);
});

test('protocol inspection ignores numeric metadata and user messages', () => {
  const challenge = { prompt: 'calculate 231 + 245', answer: '476' };
  const body = [
    { id: 476, type: 'usage', text: '476' },
    { role: 'user', content: '476' },
    { id: 476, progress: 476 },
  ].map(value => JSON.stringify(value)).join('\n');
  assert.equal(inspectResearchProtocol(body, challenge).apiExpectedAnswerPresent, false);
});

test('protocol inspection joins text frames and supports legacy delta content', () => {
  const challenge = { prompt: 'calculate 231 + 245', answer: '476' };
  const body = 'data: {"text":"4"}\ndata: {"choices":[{"delta":{"content":"76"}}]}\ndata: [DONE]';
  const result = inspectResearchProtocol(body, challenge);
  assert.equal(result.apiReplyTextPresent, true);
  assert.equal(result.apiExpectedAnswerPresent, true);
  assert.equal(result.apiPromptEchoed, false);
});
