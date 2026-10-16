'use strict';

// Runtime paths, hostnames and document names remain private to this process.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const net = require('net');
const dns = require('dns').promises;
const snapshots = new WeakMap();
const denied = new Set([401, 403, 404, 410]);
const errors = new Set([
  'boundary_context_invalid', 'boundary_config_invalid', 'boundary_origin_unproven',
  'boundary_public_unproven', 'boundary_snapshot_invalid', 'boundary_files_changed',
  'boundary_origin_not_denied', 'boundary_public_not_denied', 'boundary_request_failed',
]);

function fail(code) { const error = new Error(code); error.code = code; throw error; }
function token(value) {
  if (typeof value !== 'string' || value.length > 65536) fail('boundary_config_invalid');
  return value.replace(/^(["'])(.*)\1$/s, '$2');
}
// Lua block contents are opaque to the Nginx directive parser. Keep their
// strings/comments intact while locating the matching outer brace.
function tokenizeNginx(raw) {
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > 4194304) fail('boundary_config_invalid');
  const luaBlocks = new Set([
    'init_by_lua_block', 'init_worker_by_lua_block', 'exit_worker_by_lua_block',
    'set_by_lua_block', 'rewrite_by_lua_block', 'server_rewrite_by_lua_block',
    'access_by_lua_block', 'content_by_lua_block', 'header_filter_by_lua_block',
    'body_filter_by_lua_block', 'log_by_lua_block', 'balancer_by_lua_block',
    'ssl_certificate_by_lua_block', 'ssl_session_fetch_by_lua_block',
    'ssl_session_store_by_lua_block', 'ssl_client_hello_by_lua_block',
    'preread_by_lua_block',
  ]);
  const output = []; let cursor = 0, head = null;
  function lineComment() {
    while (cursor < raw.length && raw[cursor] !== '\r' && raw[cursor] !== '\n') cursor++;
  }
  function quoted() {
    const quote = raw[cursor++];
    while (cursor < raw.length) {
      const next = raw[cursor++];
      if (next === '\\') { if (cursor >= raw.length) fail('boundary_config_invalid'); cursor++; }
      else if (next === quote) return;
    }
    fail('boundary_config_invalid');
  }
  function longBracket() {
    if (raw[cursor] !== '[') return false;
    let end = cursor + 1;
    while (raw[end] === '=') end++;
    if (raw[end] !== '[') return false;
    const close = ']' + raw.slice(cursor + 1, end) + ']';
    const found = raw.indexOf(close, end + 1);
    if (found < 0) fail('boundary_config_invalid');
    cursor = found + close.length; return true;
  }
  function luaBody() {
    let depth = 1;
    while (cursor < raw.length) {
      const ch = raw[cursor];
      if (ch === '"' || ch === "'") { quoted(); continue; }
      if (raw.startsWith('--', cursor)) {
        cursor += 2;
        if (!longBracket()) lineComment();
        continue;
      }
      if (longBracket()) continue;
      cursor++;
      if (ch === '{' && ++depth > 64) fail('boundary_config_invalid');
      if (ch === '}' && --depth === 0) return;
    }
    fail('boundary_config_invalid');
  }
  while (cursor < raw.length) {
    const ch = raw[cursor];
    if (/\s/.test(ch)) { cursor++; continue; }
    if (ch === '#') { lineComment(); continue; }
    if ('{};'.includes(ch)) {
      output.push(ch); cursor++;
      if (ch === '{' && head && head.endsWith('_by_lua_block')) {
        if (!luaBlocks.has(head)) fail('boundary_config_invalid');
        luaBody(); output.push('}');
      }
      head = null; continue;
    }
    const start = cursor;
    while (cursor < raw.length) {
      const next = raw[cursor];
      if (next === '"' || next === "'") { quoted(); continue; }
      if (next === '\\') { cursor += 2; if (cursor > raw.length) fail('boundary_config_invalid'); continue; }
      if (raw.startsWith('${', cursor)) {
        const end = raw.indexOf('}', cursor + 2);
        if (end < 0 || !/^[a-zA-Z0-9_]+$/.test(raw.slice(cursor + 2, end))) fail('boundary_config_invalid');
        cursor = end + 1; continue;
      }
      if (/\s/.test(next) || '{};#'.includes(next)) break;
      cursor++;
    }
    if (cursor === start || cursor - start > 65536) fail('boundary_config_invalid');
    const word = raw.slice(start, cursor); output.push(word);
    if (head === null) head = token(word);
    if (output.length > 1000000) fail('boundary_config_invalid');
  }
  return output;
}
function parseTokens(input) {
  if (!Array.isArray(input) || input.length > 1000000) fail('boundary_config_invalid');
  input.forEach(token);
  const tokens = input; let cursor = 0;
  function block(nested, depth) {
    if (depth > 64) fail('boundary_config_invalid');
    const directives = [];
    while (cursor < tokens.length) {
      if (tokens[cursor] === '}') {
        if (!nested) fail('boundary_config_invalid');
        cursor++; return directives;
      }
      const words = [];
      while (cursor < tokens.length && ![';', '{', '}'].includes(tokens[cursor])) words.push(token(tokens[cursor++]));
      if (!words.length || cursor >= tokens.length) fail('boundary_config_invalid');
      const ending = tokens[cursor++];
      if (ending === '}') fail('boundary_config_invalid');
      directives.push({ words, children: ending === '{' ? block(true, depth + 1) : [] });
    }
    if (nested) fail('boundary_config_invalid');
    return directives;
  }
  return block(false, 0);
}
function all(nodes) { return nodes.flatMap(node => [node, ...all(node.children)]); }
function isLocalEndpoint(value, port) {
  try {
    const url = new URL(value.includes('://') ? value : 'http://' + value);
    return ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) && Number(url.port || 80) === port;
  } catch (_) { return false; }
}
function selectPublicHosts(input, port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('boundary_context_invalid');
  const nodes = all(parseTokens(input)); const upstreams = new Set();
  // The capture expands includes at their original directive positions. A
  // detached dump cannot prove ownership of included server names or routes.
  if (nodes.some(node => node.words[0] === 'include')) fail('boundary_config_invalid');
  for (const node of nodes.filter(node => node.words[0] === 'upstream')) {
    if (node.words.length !== 2) fail('boundary_config_invalid');
    const servers = node.children.filter(item => item.words[0] === 'server');
    if (servers.length && servers.every(item => isLocalEndpoint(item.words[1] || '', port))) upstreams.add(node.words[1]);
  }
  const hosts = new Set();
  for (const server of nodes.filter(node => node.words[0] === 'server' && node.children.length)) {
    const proxy = all(server.children).filter(node => node.words[0] === 'proxy_pass');
    const matches = proxy.some(node => {
      if (isLocalEndpoint(node.words[1] || '', port)) return true;
      try { return upstreams.has(new URL(node.words[1]).hostname); } catch (_) { return false; }
    });
    const tls = server.children.some(node => node.words[0] === 'listen' && node.words.includes('ssl'));
    if (!matches || !tls) continue;
    for (const item of server.children.filter(node => node.words[0] === 'server_name')) {
      for (const host of item.words.slice(1)) {
        if (host.length <= 253 && /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(host) &&
            host.includes('.') && !net.isIP(host) && !host.endsWith('.local') && !host.endsWith('.localhost') &&
            host.split('.').every(label => label && label.length <= 63 && !label.startsWith('-') && !label.endsWith('-'))) hosts.add(host.toLowerCase());
      }
    }
  }
  if (!hosts.size || hosts.size > 8) fail('boundary_public_unproven');
  return [...hosts].sort();
}
function inventory(serviceCwd) {
  if (typeof serviceCwd !== 'string' || !path.isAbsolute(serviceCwd)) fail('boundary_context_invalid');
  const base = path.join(serviceCwd, 'public', 'file'); const files = new Map();
  let totalBytes = 0;
  if (!fs.existsSync(base)) return files;
  function walk(directory) {
    if (!fs.lstatSync(directory).isDirectory() || fs.lstatSync(directory).isSymbolicLink()) fail('boundary_snapshot_invalid');
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name); const stat = fs.lstatSync(full);
      if (stat.isSymbolicLink()) fail('boundary_snapshot_invalid');
      if (stat.isDirectory()) { walk(full); continue; }
      if (!stat.isFile() || files.size >= 10000) fail('boundary_snapshot_invalid');
      totalBytes += stat.size;
      if (totalBytes > 1024 * 1024 * 1024) fail('boundary_snapshot_invalid');
      const relative = path.relative(base, full).split(path.sep).join('/');
      const hash = crypto.createHash('sha256'); const descriptor = fs.openSync(full, 'r');
      try {
        const opened = fs.fstatSync(descriptor);
        if (!opened.isFile() || opened.ino !== stat.ino || opened.dev !== stat.dev) fail('boundary_snapshot_invalid');
        const chunk = Buffer.alloc(65536); let count;
        while ((count = fs.readSync(descriptor, chunk, 0, chunk.length, null)) > 0) hash.update(chunk.subarray(0, count));
        const finished = fs.fstatSync(descriptor);
        if (finished.size !== opened.size || finished.mtimeMs !== opened.mtimeMs) fail('boundary_snapshot_invalid');
      } finally { fs.closeSync(descriptor); }
      files.set(relative, hash.digest('hex'));
    }
  }
  walk(base); return files;
}
function captureDownloadBoundary(context) {
  const files = inventory(context.serviceCwd);
  const snapshot = Object.freeze({ legacyFileCount: files.size });
  snapshots.set(snapshot, { cwd: context.serviceCwd, files });
  return snapshot;
}
function publicAddress(address) {
  if (net.isIP(address) === 6) return /^[23][0-9a-f]{3}:/i.test(address) && !/^(2001:|2002:|3fff:)/i.test(address);
  if (net.isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168 || (b === 88 && c === 99))) ||
    (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113));
}
async function requestStatus(url) {
  let lookup;
  if (url.protocol === 'https:') {
    let deadline;
    try {
      const addresses = await Promise.race([
        dns.lookup(url.hostname, { all: true }),
        new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('boundary_request_failed')), 8000); }),
      ]);
      if (!addresses.length || addresses.some(item => !publicAddress(item.address))) return null;
      const pinned = addresses.find(item => item.family === 4) || addresses[0];
      lookup = (_hostname, options, callback) => {
        if (options && options.all) callback(null, [pinned]);
        else callback(null, pinned.address, pinned.family);
      };
    } catch (_) { return null; }
    finally { clearTimeout(deadline); }
  }
  return new Promise(resolve => {
    let settled = false;
    const finish = result => { if (!settled) { settled = true; resolve(result); } };
    const transport = url.protocol === 'https:' ? https : http;
    // Use an ordinary anonymous GET so a stale public cache entry cannot be
    // hidden by a cache-bypass header or a separate Range cache key.
    const request = transport.request(url, { method: 'GET', timeout: 8000, lookup }, response => {
      finish({ status: response.statusCode, edgeObserved: typeof response.headers['cf-ray'] === 'string' });
      response.destroy();
    });
    request.on('timeout', () => { finish(null); request.destroy(); });
    request.on('error', () => finish(null)); request.end();
  });
}
async function verifyDownloadBoundary(context, options = {}) {
  const result = { passed: false, error: 'boundary_context_invalid', legacyFileCount: 0,
    filesPreserved: false, originDenied: false, publicDenied: false, publicHostCount: 0, edgeObserved: false };
  try {
    if (!context || !Number.isInteger(context.smokePort)) fail('boundary_context_invalid');
    const baseline = snapshots.get(options.snapshot);
    if (!baseline || baseline.cwd !== context.serviceCwd) fail('boundary_snapshot_invalid');
    result.legacyFileCount = baseline.files.size;
    const current = inventory(context.serviceCwd);
    if (current.size !== baseline.files.size || [...baseline.files].some(([name, hash]) => current.get(name) !== hash)) fail('boundary_files_changed');
    result.filesPreserved = true;
    const hosts = selectPublicHosts(context.nginxTokens, context.smokePort); result.publicHostCount = hosts.length;
    const paths = [...baseline.files.keys()].map(name => '/file/' + name.split('/').map(encodeURIComponent).join('/'));
    if (!paths.length) paths.push('/file/__lens_boundary_nonexistent__.txt');
    const transport = options.transport || requestStatus;
    async function probe(origin, failure) {
      for (const relative of paths) {
        const response = await transport(new URL(relative, origin));
        if (!response || !Number.isInteger(response.status)) fail('boundary_request_failed');
        if (!denied.has(response.status)) fail(failure);
        result.edgeObserved ||= response.edgeObserved === true;
      }
    }
    await probe('http://127.0.0.1:' + context.smokePort, 'boundary_origin_not_denied'); result.originDenied = true;
    if (options.beforePublic !== undefined) {
      if (typeof options.beforePublic !== 'function') fail('boundary_context_invalid');
      await options.beforePublic();
    }
    for (const host of hosts) await probe('https://' + host, 'boundary_public_not_denied'); result.publicDenied = true;
    const final = inventory(context.serviceCwd);
    if (final.size !== baseline.files.size || [...baseline.files].some(([name, hash]) => final.get(name) !== hash)) {
      result.filesPreserved = false; fail('boundary_files_changed');
    }
    result.passed = true; result.error = 'none';
  } catch (error) { result.error = errors.has(error && error.code) ? error.code : 'boundary_request_failed'; }
  return Object.freeze(result);
}
module.exports = { captureDownloadBoundary, verifyDownloadBoundary, selectPublicHosts, publicAddress, tokenizeNginx, parseTokens };
