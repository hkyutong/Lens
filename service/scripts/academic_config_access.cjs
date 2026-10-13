const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');

function classifyRouteAccess(status, payload, successEnvelope) {
  const denied = status === 401 || status === 403 || payload?.statusCode === 401 || payload?.statusCode === 403 || payload?.code === 401 || payload?.code === 403;
  return { denied, granted: !denied && status >= 200 && status < 300 && successEnvelope(payload) === true };
}

function discoverConfigReadRoute(repoRoot) {
  const listing = spawnSync('rg', ['--files', 'service/src', '-g', '*.ts'], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  if (listing.status !== 0) throw new Error('source_contract_unavailable');
  const routes = [];
  for (const file of listing.stdout.split('\n').filter(file => /config.*controller/i.test(file))) {
    const source = fs.readFileSync(path.join(repoRoot, file), 'utf8');
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    const visit = node => {
      if (ts.isClassDeclaration(node)) {
        const classDecorators = ts.getDecorators(node) || [];
        const controller = classDecorators.find(d => ts.isCallExpression(d.expression) && d.expression.expression.getText(ast) === 'Controller');
        const prefix = controller?.expression.arguments[0]?.text;
        if (typeof prefix === 'string') for (const method of node.members) {
          if (!ts.isMethodDeclaration(method) || !/getAll|queryAll|allConfig/i.test(method.getText(ast))) continue;
          const decorators = ts.getDecorators(method) || [];
          const route = decorators.find(d => ts.isCallExpression(d.expression) && d.expression.expression.getText(ast) === 'Get');
          if (!route) continue;
          const suffix = route.expression.arguments[0]?.text || '';
          const endpoint = [prefix, suffix].filter(Boolean).join('/');
          if (!/^[A-Za-z0-9_/-]+$/.test(endpoint)) continue;
          routes.push({ endpoint, authenticationDeclared: [...classDecorators, ...decorators].some(d => /AuthGuard|JwtGuard/.test(d.getText(ast))) });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);
  }
  if (routes.length !== 1) throw new Error('readonly_route_ambiguous');
  return routes[0];
}

async function responseAccess(response, successEnvelope) {
  if (response.status === 401 || response.status === 403) {
    await response.body?.cancel();
    return classifyRouteAccess(response.status, null, successEnvelope);
  }
  const reader = response.body?.getReader();
  if (!reader) return { denied: false, granted: false };
  const chunks = []; let size = 0;
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.length;
      if (size > 262144) { await reader.cancel(); return { denied: false, granted: false }; }
      chunks.push(Buffer.from(item.value));
    }
    let payload;
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return { denied: false, granted: false }; }
    return classifyRouteAccess(response.status, payload, successEnvelope);
  } finally { chunks.forEach(chunk => chunk.fill(0)); }
}

async function inspectAcademicConfigAccess({ base, fetchImpl, repoRoot }) {
  const url = new URL(base);
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) throw new Error('local_base_required');
  const contract = discoverConfigReadRoute(repoRoot);
  const { successEnvelope } = await import('./academic_gate_protocol.mjs');
  const endpoint = base.replace(/\/$/, '') + '/' + contract.endpoint;
  const anonymous = await responseAccess(await fetch(endpoint, { method: 'GET' }), successEnvelope);
  const authenticated = await responseAccess(await fetchImpl(endpoint, { method: 'GET' }), successEnvelope);
  return { readonlyConfigRouteIdentified: true, authenticationDeclared: contract.authenticationDeclared, anonymousAccessDenied: anonymous.denied, anonymousAccessGranted: anonymous.granted, authenticatedAccessGranted: authenticated.granted, authenticatedAccessDenied: authenticated.denied, uploadAttempted: false, modelCallAttempted: false, recordWriteAttempted: false };
}

module.exports = { classifyRouteAccess, inspectAcademicConfigAccess };
