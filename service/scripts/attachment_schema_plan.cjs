'use strict';

function isAdditiveAttachmentPlan(table, queries) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(table) || !Array.isArray(queries) || queries.length !== 1) {
    return false;
  }
  const query = queries[0];
  if (typeof query !== 'string' || query.includes(';') || /\b(?:DROP|ALTER|TRUNCATE|DELETE|UPDATE|INSERT)\b/i.test(query)) {
    return false;
  }
  return query.startsWith('CREATE TABLE `' + table + '` (') && /\) ENGINE=InnoDB\s*$/i.test(query);
}

module.exports = { isAdditiveAttachmentPlan };
