'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { isAdditiveAttachmentPlan } = require('./attachment_schema_plan.cjs');

test('accepts one additive table and rejects unrelated or destructive plans', () => {
  const create = 'CREATE TABLE `synthetic_attachments` (`id` int NOT NULL) ENGINE=InnoDB';
  assert.equal(isAdditiveAttachmentPlan('synthetic_attachments', [create]), true);
  assert.equal(isAdditiveAttachmentPlan('other_table', [create]), false);
  assert.equal(isAdditiveAttachmentPlan('synthetic_attachments', [create, create]), false);
  for (const query of ['ALTER TABLE `synthetic_attachments` ADD x int',
    'DROP TABLE `synthetic_attachments`', create + '; DROP TABLE `other_table`']) {
    assert.equal(isAdditiveAttachmentPlan('synthetic_attachments', [query]), false);
  }
});

test('does not accept untrusted identifiers or missing plans', () => {
  for (const table of ['', 'a`b', 'a.b', 'a;drop']) {
    assert.equal(isAdditiveAttachmentPlan(table, []), false);
  }
  assert.equal(isAdditiveAttachmentPlan('synthetic_attachments', []), false);
  assert.equal(isAdditiveAttachmentPlan('synthetic_attachments', null), false);
});
