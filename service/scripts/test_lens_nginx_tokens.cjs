'use strict';
const assert = require('node:assert/strict');
const { tokenizeNginx, selectPublicHosts } = require('./lens_download_boundary.cjs');
let count = 0;
function check(body) {
  const source = `http { server { listen 443 ssl; server_name example.invalid; ${body} location / { proxy_pass http://127.0.0.1:3100; } } }`;
  assert.deepEqual(selectPublicHosts(tokenizeNginx(source), 3100), ['example.invalid']);
  count++;
}
try {
  check('');
  for (const value of ['}', '{', ';', '#', 'include', 'server']) check(`set $synthetic "${value}";`);
  check('content_by_lua_block { ngx.say("} # include") }');
  check('access_by_lua_block { local x = { a = { 1, 2 } }; ngx.say(x) }');
  check('access_by_lua_block { -- } misleading close\nlocal x = {} }');
  check('access_by_lua_block { -- } misleading close\rlocal x = {} }');
  check('access_by_lua_block { -- } misleading close\r\nlocal x = {} }');
  check('# misleading server }\rset $synthetic ok;');
  check('content_by_lua_block { local x = [[ } # include fake; ]] }');
  check('content_by_lua_block { local x = [==[ } ]=] # ]==] }');
  check('content_by_lua_block { --[=[ } # include fake; ]=]\nreturn }');
  check('content_by_lua_block { ngx.say("a\\\"}b"); ngx.say(\'c\\\'}d\') }');
  check('init_by_lua_block { local x = "server { proxy_pass fake; }" }');
  check('set $synthetic "escaped\\\"};#";');
  check('set $synthetic ${synthetic};');
  for (const raw of [
    'content_by_lua_block { ngx.say("unterminated) }',
    'content_by_lua_block { local x = [=[ unfinished }',
    'content_by_lua_block { --[==[ unfinished }',
    'content_by_lua_block { local x = {}',
    'unknown_by_lua_block { return }',
    'set $x "unterminated;',
    'set $x ${unfinished;',
  ]) {
    assert.throws(() => tokenizeNginx(raw)); count++;
  }
  for (const body of ['include synthetic.conf;', 'location /extra { include synthetic.conf; }']) {
    const source = `server { listen 443 ssl; server_name example.invalid; ${body} location / { proxy_pass http://127.0.0.1:3100; } }`;
    assert.throws(() => selectPublicHosts(tokenizeNginx(source), 3100)); count++;
  }
  process.stdout.write(JSON.stringify({ nginxLexerPassed: true, tests: count }));
} catch (_) {
  process.stdout.write(JSON.stringify({ nginxLexerPassed: false, tests: count }));
  process.exitCode = 1;
}
