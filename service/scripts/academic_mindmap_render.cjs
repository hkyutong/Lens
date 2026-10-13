const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');

const runtimeRoot = '/Users/hkyutong/Library/Application Support/PlaywrightChromium/chromium-1217/';

function diagramSource(answer) {
  if (typeof answer !== 'string' || answer.length > 16384) return null;
  const fenced = answer.match(/```(?:mermaid)?\s*\n([\s\S]*?)```/i);
  const source = (fenced ? fenced[1] : answer).trim();
  if (!/^(mindmap|flowchart\s+(?:LR|RL|TB|TD|BT)|graph\s+(?:LR|RL|TB|TD|BT))\b/.test(source)) return null;
  if (/https?:|<|%%\{|\b(?:click|href|callback|javascript|icon)\b/i.test(source)) return null;
  return source;
}

function fixedExecutable() {
  const visit = (directory, depth) => {
    if (depth > 7) return null;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        const found = visit(file, depth + 1);
        if (found) return found;
      } else if (entry.isFile() && /\/Contents\/MacOS\//.test(file) && /chrome|chromium/i.test(entry.name) && !/helper|frameworks|crashpad/i.test(file)) {
        try { fs.accessSync(file, fs.constants.X_OK); return file; } catch {}
      }
    }
    return null;
  };
  return visit(runtimeRoot, 0);
}

async function renderMindmap(answer) {
  const source = diagramSource(answer);
  if (!source) return { passed: false, invalidSource: true };
  const executable = fixedExecutable();
  if (!executable) throw new Error('fixed_runtime_unavailable');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lens-mindmap-render-'));
  let server;
  let result;
  let bootstrapRequested = false;
  try {
    const encoded = JSON.stringify(source).replace(/</g, '\\u003c');
    const html = `<!doctype html><html><body data-lens-render="pending" data-lens-stage="module"><main id="diagram"></main><script type="module">
      try {
        const {default:mermaid}=await import('http://127.0.0.1:9003/node_modules/mermaid/dist/mermaid.esm.min.mjs');
        document.body.dataset.lensStage='initialize';
        mermaid.initialize({startOnLoad:false,securityLevel:'loose',suppressErrorRendering:true});
        document.body.dataset.lensStage='render';
        const {renderMermaidWithRecovery}=await import('http://127.0.0.1:9003/src/utils/mermaidRecovery.ts');
        const result=await renderMermaidWithRecovery(mermaid,'lens_synthetic_mindmap',${encoded});
        document.querySelector('#diagram').innerHTML=result.svg;
        document.body.dataset.lensRender=document.querySelector('#diagram svg')?'passed':'failed';
      } catch (error) {
        document.body.dataset.lensRender='failed';
        document.body.dataset.lensSyntaxError=/parse error|syntax error|expecting|invalid diagram/i.test(String(error?.message||''))?'yes':'no';
        document.body.dataset.lensTypeError=error?.name==='TypeError'?'yes':'no';
        document.body.dataset.lensSanitizerError=/purify|sanitize/i.test(String(error?.message||''))?'yes':'no';
        document.body.dataset.lensLayoutError=/layout|cytoscape|dagre|elk/i.test(String(error?.message||''))?'yes':'no';
        document.body.dataset.lensMissingNode=/cannot read properties of (?:null|undefined)/i.test(String(error?.message||''))?'yes':'no';
        document.body.dataset.lensMultipleRoots=/only one root|multiple roots|no parent/i.test(String(error?.message||''))?'yes':'no';
        document.body.dataset.lensUnsupportedMarkdown=/unsupported markdown/i.test(String(error?.message||''))?'yes':'no';
      }
      </script></body></html>`;
    server = http.createServer((request, response) => {
      if (request.url !== '/') { response.writeHead(404); response.end(); return; }
      bootstrapRequested = true;
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(html);
    });
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const address = server.address();
    const child = spawn(executable, ['--headless=new', '--no-sandbox', '--use-mock-keychain', '--password-store=basic', '--disable-gpu', '--disable-extensions', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--disable-sync', '--disable-component-update', '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1', `--user-data-dir=${profile}`, `http://127.0.0.1:${address.port}/`], { detached: true, stdio: 'ignore' });
    let childExited = false;
    child.on('error', () => { childExited = true; });
    const closed = new Promise(resolve => child.once('close', () => { childExited = true; resolve(); }));
    let socket;
    let pending;
    const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
    try {
      const deadline = Date.now() + 30000;
      const activePort = path.join(profile, 'DevToolsActivePort');
      while (!fs.existsSync(activePort) && !childExited && Date.now() < deadline) await delay(100);
      if (!fs.existsSync(activePort)) throw new Error('render_debugger_unavailable');
      const [port, endpoint] = fs.readFileSync(activePort, 'utf8').trim().split('\n');
      if (!/^[1-9]\d{0,4}$/.test(port) || Number(port) > 65535 || !/^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(endpoint)) throw new Error('render_debugger_invalid');
      socket = new WebSocket(`ws://127.0.0.1:${port}${endpoint}`);
      await Promise.race([
        new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', () => reject(new Error('render_connection_failed')), { once: true }); }),
        delay(5000).then(() => { throw new Error('render_connection_timeout'); }),
      ]);
      pending = new Map(); let nextId = 0;
      socket.addEventListener('message', event => {
        let message; try { message = JSON.parse(event.data); } catch { return; }
        const callback = pending.get(message.id);
        if (!callback) return;
        pending.delete(message.id); callback(message);
      });
      const request = (method, params, sessionId) => new Promise((resolve, reject) => {
        const id = ++nextId;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error('render_request_timeout')); }, 5000);
        pending.set(id, message => { clearTimeout(timer); message.error ? reject(new Error('render_request_failed')) : resolve(message.result); });
        socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
      });
      const targets = await request('Target.getTargets', {});
      const target = targets.targetInfos?.find(item => item.type === 'page' && item.url === `http://127.0.0.1:${address.port}/`);
      if (!target) throw new Error('render_target_unavailable');
      const attached = await request('Target.attachToTarget', { targetId: target.targetId, flatten: true });
      const expression = `({passed:document.body?.dataset.lensRender==='passed',failed:document.body?.dataset.lensRender==='failed',moduleLoaded:['initialize','render'].includes(document.body?.dataset.lensStage),renderAttempted:document.body?.dataset.lensStage==='render',diagramPresent:!!document.querySelector('#diagram svg'),syntaxError:document.body?.dataset.lensSyntaxError==='yes',typeError:document.body?.dataset.lensTypeError==='yes',sanitizerError:document.body?.dataset.lensSanitizerError==='yes',layoutError:document.body?.dataset.lensLayoutError==='yes',missingNode:document.body?.dataset.lensMissingNode==='yes',multipleRoots:document.body?.dataset.lensMultipleRoots==='yes',unsupportedMarkdown:document.body?.dataset.lensUnsupportedMarkdown==='yes'})`;
      let state;
      do {
        const evaluation = await request('Runtime.evaluate', { expression, returnByValue: true }, attached.sessionId);
        state = evaluation.result?.value;
        if (state?.passed || state?.failed) break;
        await delay(200);
      } while (!childExited && Date.now() < deadline);
      result = { passed: state?.passed === true && state?.diagramPresent === true, diagramPresent: state?.diagramPresent === true, moduleLoaded: state?.moduleLoaded === true, renderAttempted: state?.renderAttempted === true, scriptFailed: state?.failed === true, syntaxError: state?.syntaxError === true, typeError: state?.typeError === true, sanitizerError: state?.sanitizerError === true, layoutError: state?.layoutError === true, missingNode: state?.missingNode === true, multipleRoots: state?.multipleRoots === true, unsupportedMarkdown: state?.unsupportedMarkdown === true, timedOut: !(state?.passed || state?.failed) };
    } finally {
      socket?.close();
      if (child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch (error) { if (error.code !== 'ESRCH') throw new Error('render_cleanup_failed'); }
      }
      await closed;
    }
    result.browserExited = childExited;
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    fs.rmSync(profile, { recursive: true, force: true });
  }
  return { ...result, bootstrapRequested, temporaryProfileRemoved: !fs.existsSync(profile) };
}

module.exports = { diagramSource, renderMindmap };
