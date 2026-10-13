const { randomInt } = require('node:crypto');

function createResearchChallenge(draw = randomInt) {
  const left = draw(200, 1000);
  const right = draw(200, 1000);
  return {
    prompt: `Local synthetic acceptance: calculate ${left} + ${right}. Reply with the result only.`,
    answer: String(left + right),
  };
}

function containsResearchAnswer(text, answer) {
  if (typeof text !== 'string' || !/^\d+$/.test(answer)) return false;
  return new RegExp(`(^|\\D)${answer}(?=\\D|$)`).test(text);
}

function inspectResearchProtocol(body, challenge, plainText = false) {
  let content = '';
  for (const line of body.split(/\r?\n/)) {
    const raw = line.replace(/^data:\s*/, '').trim();
    if (!raw || raw === '[DONE]') continue;
    try {
      const frame = JSON.parse(raw);
      if (typeof frame === 'string') { content += frame; continue; }
      if (!frame || typeof frame !== 'object' || frame.role === 'user') continue;
      if (['usage', 'metadata', 'progress', 'status'].includes(frame.type)) continue;
      const text = frame.text ?? frame.content ?? frame.delta?.content
        ?? frame.choices?.[0]?.delta?.content ?? frame.message?.content;
      if (typeof text === 'string') content += text;
    } catch (_) {
      if (plainText) content += raw;
    }
  }
  if (plainText && /^\s*\d+\s*$/.test(body)) content = body.trim();
  return {
    apiReplyTextPresent: Boolean(content.trim()),
    apiExpectedAnswerPresent: containsResearchAnswer(content, challenge.answer),
    apiPromptEchoed: content.includes(challenge.prompt),
  };
}

module.exports = { createResearchChallenge, containsResearchAnswer, inspectResearchProtocol };
