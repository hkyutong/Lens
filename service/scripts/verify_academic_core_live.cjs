'use strict';
// Local-only semantic acceptance. All private transport data remains in memory.
async function main() {
    const categoryFilter = process.env.LENS_ACADEMIC_CORE_CATEGORY;
    if (categoryFilter && !['chinese_polish','english_polish','mindmap','translation','bibliography','code_explanation'].includes(categoryFilter)) throw new Error('invalid_core_category');

    const fs = require('fs'), vm = require('vm'), ts = require('typescript');
    const { localTestCredentials } = require('./local_test_credentials.cjs');
    const { coreFixture, validateCoreAnswer } = require('./academic_core_semantics.cjs');
    const cp = require('child_process'), path = require('path');
    const repoRoot = path.resolve(__dirname, '../..');
    const streamCandidates = cp.execFileSync('rg', ['--files', path.join(repoRoot, 'chat/src')], { encoding: 'utf8' }).split('\n').filter(p => p.endsWith('/stream.ts') && fs.readFileSync(p, 'utf8').includes('normalizeAcademicStreamEvent'));
    if (streamCandidates.length !== 1)
        throw new Error('stream_contract_unavailable');
    const streamSource = fs.readFileSync(streamCandidates[0], 'utf8');
    const streamAst = ts.createSourceFile('stream.ts', streamSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    if (streamAst.statements.some(n => ts.isImportDeclaration(n) && !n.importClause?.isTypeOnly) || /\b(?:localStorage|sessionStorage|document\.cookie|process\.env)\b/.test(streamSource))
        throw new Error('stream_contract_not_pure');
    const streamExports = {};
    vm.runInNewContext(ts.transpileModule(streamSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, { exports: streamExports, Object, Array, JSON, String, Number, Boolean, Math, Date, Set, Map }, { timeout: 1000 });
    const frameFields = ['text', 'content', 'answer', 'response', 'delta', 'type', 'eventType', 'nodeType', 'messageType', 'role', 'resetContent', 'finalContent', 'finalText', 'fullText', 'finishReason', 'reasoningContent', 'reasoning_content', 'thinking', 'thinkingContent', 'isReasoning', 'isThinking', 'reasoning', 'data', 'payload', 'message', 'snapshot', 'isFinal', 'isFullText', 'isDelta', 'incrementalData', 'incremental'];
    function textProjection(value, depth = 0) { if (value == null || typeof value !== 'object' || depth > 4)
        return {}; const out = {}; for (const k of frameFields) {
        const v = value[k];
        if (typeof v === 'string' || typeof v === 'boolean')
            out[k] = v;
        else if (v && typeof v === 'object' && !Array.isArray(v))
            out[k] = textProjection(v, depth + 1);
    } return out; }
    async function readAnswer(response, parse) { const reader = response.clone().body.getReader(), decoder = new TextDecoder(); let raw = '', size = 0; try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            size += value.byteLength;
            if (size > 262144) {
                await reader.cancel();
                throw new Error('semantic_output_limit');
            }
            raw += decoder.decode(value, { stream: true });
        }
        raw += decoder.decode();
    }
    finally {
        reader.releaseLock();
    } const frames = parse(raw); let answer = '', streamError = false; const safeFrameStats = []; for (const frame of Array.isArray(frames) ? frames : []) {
        safeFrameStats.push({
            finishReason: typeof frame?.finishReason === 'string' ? frame.finishReason : (typeof frame?.finish_reason === 'string' ? frame.finish_reason : ''),
            contentLength: ['content','finalContent','text','answer','response'].reduce((n, key) => n + (typeof frame?.[key] === 'string' ? frame[key].length : 0), 0),
            hasStreamError: Boolean(frame?.streamError),
        });
        if (frame?.role === 'user' || ['progress', 'status', 'usage', 'metadata', 'input', 'user', 'reasoning', 'thinking'].includes(String(frame?.type ?? frame?.nodeType ?? '').toLowerCase()))
            continue;
        const event = streamExports.normalizeAcademicStreamEvent(textProjection(frame));
        if (event.resetContent)
            answer = '';
        if (typeof event.finalContent === 'string' && event.finalContent)
            answer = event.finalContent;
        else if (typeof event.content === 'string')
            answer += event.content;
        if (event.streamError)
            streamError = true;
    } return { answer, streamError, frameCount: Array.isArray(frames) ? frames.length : 0, safeFrameStats }; }
    async function runCoreCase(coreCategory) {
        let c, token, ownedId, canonicalSuccess;
        let base = 'http://127.0.0.1:9003/api', cleanupSucceeded = false;
        try {
            const h = await import('./academic_gate_protocol.mjs');
            const decode = h.decodeJwtSubject, success = h.successEnvelope, getData = h.responseData;
            canonicalSuccess = success;
            c = localTestCredentials();
            const auth = await fetch(base + '/auth/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: c.username, password: c.password }), signal: AbortSignal.timeout(15000) });
            token = (await auth.json()).data;
            const actor = decode(token);
            const { runAcademicRealGate } = await import('./academic_real_gate.mjs');
            const models = [];
            let coreRows = [];
            let dedicated = false, publicIdentity, expectedUsername;
            await runAcademicRealGate({ env: { LENS_ACADEMIC_BASE_URL: base, LENS_ACADEMIC_E2E_TOKEN: token, LENS_ACADEMIC_TIMEOUT_MS: '15000' }, fetchImpl: async (...args) => { const res = await fetch(...args), path = new URL(String(args[0])).pathname; if (path === '/api/auth/getInfo') {
                    const d = (await res.clone().json()).data, u = d?.userInfo ?? d;
                    dedicated = u?.username === c.username;
                    publicIdentity = u?.id;
                    expectedUsername = c.username;
                } if (path === '/api/academic/core-function-list') {
                    const d = (await res.clone().json()).data;
                    coreRows = Array.isArray(d) ? d : Object.values(d ?? {}).filter(Array.isArray).flat();
                } if (path === '/api/models/list') {
                    const data = (await res.clone().json()).data;
                    function scan(v, depth = 0) { if (!v || typeof v !== 'object' || depth > 6)
                        return; if (typeof v.modelName === 'string' && v.modelName.trim())
                        models.push(v); for (const child of Object.values(v))
                        scan(child, depth + 1); }
                    scan(data);
                } return res; } });

    if (process.env.LENS_ACADEMIC_READ_CONFIG_ACCESS === '1') {
        const profile = await require('./academic_config_access.cjs').inspectAcademicConfigAccess({base, repoRoot, fetchImpl: (url, options = {}) => fetch(url, { ...options, headers: { ...options.headers, Authorization: 'Bearer ' + token } })});
        process.stdout.write(JSON.stringify({configAccessProfile:profile}) + '\n');
        return;
    }
            const isDeepSeekV32 = item => [item?.model, item?.modelName]
                .map(value => String(value || '').trim().toLowerCase())
                .some(value => value === 'deepseek-chat' || value === 'deepseek-v3.2' || (value.includes('deepseek') && value.includes('3.2')));
            const isBillableEnabled = item => Number(item?.deduct) > 0 && [1, 2].includes(Number(item?.deductType)) && Number(item?.status ?? 1) !== 0;
            const useConfiguredModel = process.env.LENS_ACADEMIC_CORE_USE_CONFIGURED_MODEL === '1';
            const model = useConfiguredModel
                ? models.find(isBillableEnabled)
                : models.find(v => isDeepSeekV32(v) && isBillableEnabled(v));
            const core = coreRows.find(v => coreFixture(v?.name)?.category === coreCategory);
            const fixture = coreFixture(core?.name);
            c = null;
            if (!dedicated || !Number.isSafeInteger(actor) || actor <= 0 || !model || !fixture) {
                token = null;
                console.log(JSON.stringify({ writeAttempted: false, errorClass: 'write_prerequisite_unproven' }));
                return;
            }
            const { runAcademicControlledWriteGate } = await import('./academic_controlled_write_gate.mjs');
            let created = false, cleanupRequested = false, generationRequested = false, authInfoRequested = false, balanceRequested = false;
            let semantic = { passed: false, checks: { outputCaptured: false } }, frameCount = 0, streamError = false, safeFrameStats = [];
            const selectedModel = String(model.model || model.modelName || '').trim();
            const report = await runAcademicControlledWriteGate({ env: { LENS_ACADEMIC_BASE_URL: base, LENS_ACADEMIC_E2E_TOKEN: token, LENS_ACADEMIC_EXPECTED_USER_ID: String(actor), LENS_ACADEMIC_EXPECTED_PUBLIC_USER_ID: publicIdentity, LENS_ACADEMIC_EXPECTED_USERNAME: expectedUsername, LENS_ACADEMIC_E2E_MODEL: selectedModel, LENS_ACADEMIC_EXPECT_DEDUCTION: 'charged', LENS_ACADEMIC_WRITE_CONFIRM: 'CONFIRM_LENS_ACADEMIC_TEST_WRITES', LENS_ACADEMIC_WRITE_TIMEOUT_MS: '90000' }, fetchImpl: async (...args) => { const p = new URL(String(args[0])).pathname; if (p === '/api/auth/getInfo')
                    authInfoRequested = true; if (p === '/api/balance/query')
                    balanceRequested = true; if (p === '/api/academic/chat-process') {
                    generationRequested = true;
                    const body = JSON.parse(args[1].body);
                    // Academic 服务的路由字段是 function=basic，具体能力通过
                    // core_function 传入；把能力名写进 function 会绕过基础能力分支，
                    // 结果看似有输出却不会执行目标学术能力。
                    body.function = 'basic';
                    body.core_function = core.name;
                    body.main_input = fixture.input;
                    args[1] = { ...args[1], body: JSON.stringify(body) };
                } if (p === '/api/group/del')
                    cleanupRequested = true; const res = await fetch(...args); if (p === '/api/academic/chat-process') {
                    const capture = await readAnswer(res, h.parseNdjson);
                    frameCount = capture.frameCount;
                    safeFrameStats = capture.safeFrameStats;
                    streamError = capture.streamError;
                    semantic = validateCoreAnswer(fixture, capture.answer);
                    if (fixture.category === 'mindmap') {
                        let rendering;
                        try { rendering = await require('./academic_mindmap_render.cjs').renderMindmap(capture.answer); }
                        catch { rendering = { passed: false, temporaryProfileRemoved: false }; }
                        semantic.checks.renderModuleLoaded = rendering.moduleLoaded === true;
                        semantic.checks.renderAttempted = rendering.renderAttempted === true;
                        semantic.checks.renderDidNotFail = rendering.scriptFailed !== true;
                        semantic.checks.recognizedSyntaxErrorAbsent = rendering.syntaxError !== true;
                        semantic.checks.rendererTypeErrorAbsent = rendering.typeError !== true;
                        semantic.checks.rendererSanitizerErrorAbsent = rendering.sanitizerError !== true;
                        semantic.checks.rendererLayoutErrorAbsent = rendering.layoutError !== true;
                        semantic.checks.rendererMissingNodeErrorAbsent = rendering.missingNode !== true;
                        semantic.checks.singleRootErrorAbsent = rendering.multipleRoots !== true;
                        semantic.checks.unsupportedMarkdownErrorAbsent = rendering.unsupportedMarkdown !== true;
                        semantic.checks.renderDidNotTimeout = rendering.timedOut !== true;
                        semantic.checks.renderInputAccepted = rendering.invalidSource !== true;
                        semantic.checks.actualDiagramRendered = rendering.passed === true;
                        semantic.checks.renderProfileRemoved = rendering.temporaryProfileRemoved === true;
                        semantic.passed = semantic.passed && semantic.checks.actualDiagramRendered && semantic.checks.renderProfileRemoved;
                    }
                } if (p === '/api/group/create' || p === '/api/group/del') {
                    try {
                        const b = await res.clone().json();
                        const ok = res.ok && success(b);
                        if (p.endsWith('create')) {
                            created = ok;
                            ownedId = getData(b)?.id ?? getData(b)?.groupId;
                        }
                        else
                            cleanupSucceeded = ok;
                    }
                    catch { }
                } return res; } });
            let fallbackCleanup = false;
            if (created && !cleanupSucceeded && ownedId != null) {
                const res = await fetch(base + '/group/del', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ groupId: ownedId }), signal: AbortSignal.timeout(15000) });
                const b = await res.json();
                fallbackCleanup = true;
                cleanupSucceeded = res.ok && success(b);
            }
            let ownedRecordQueryRecognized = false, ownedRecordAbsent = false;
            await runAcademicRealGate({ env: { LENS_ACADEMIC_BASE_URL: base, LENS_ACADEMIC_E2E_TOKEN: token, LENS_ACADEMIC_TIMEOUT_MS: '15000' }, fetchImpl: async (...args) => { const res = await fetch(...args); if (new URL(String(args[0])).pathname === '/api/group/query' && ownedId != null) {
                    const body = await res.clone().json(), data = getData(body);
                    const rows = Array.isArray(data) ? data : data && typeof data === 'object' ? Object.values(data).filter(Array.isArray).flat() : null;
                    ownedRecordQueryRecognized = res.ok && success(body) && rows !== null;
                    ownedRecordAbsent = ownedRecordQueryRecognized && !rows.some(row => String(row?.id ?? row?.groupId) === String(ownedId));
                } return res; } });
            const error = typeof report.error === 'string' ? report.error.toLowerCase() : '';
            token = null;
            const result = { category: fixture.category, semanticPassed: semantic.passed, semanticChecks: semantic.checks, normalizedFrameCount: frameCount, safeFrameStats, streamError, writeAttempted: true, dedicatedAccountVerified: dedicated, declaredBillingExpectation: 'charged', controlledWriteGatePassed: report.exitCode === 0, authInfoRequested, balanceRequested, recordCreated: created, generationRequested, cleanupRequested, cleanupSucceeded, fallbackCleanup, ownedRecordQueryRecognized, ownedRecordAbsent, uploadAttempted: false, shareAttempted: false, errorCategories: Object.fromEntries(['identity', 'user', 'jwt', 'token', 'model', 'balance', 'billing', 'deduct', 'stream', 'generation', 'response', 'confirm', 'record', 'cleanup'].map(k => [k, error.includes(k)])) };
            fs.writeFileSync('/private/tmp/lens-core-' + coreCategory + '-safe-summary.json', JSON.stringify(result) + '\n', { mode: 0o600 });
            console.log(JSON.stringify(result));
            return result;
        }
        catch {
            let recovered = false;
            if (token && ownedId != null) {
                try {
                    const r = await fetch(base + '/group/del', { method: 'POST', headers: { 'content-type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ groupId: ownedId }), signal: AbortSignal.timeout(15000) });
                    recovered = r.ok && canonicalSuccess?.(await r.json());
                }
                catch { }
            }
            token = null;
            c = null;
            console.log(JSON.stringify({ errorClass: 'controlled_write_runner_failed', ownedRecordCleanupConfirmed: recovered, recordWasTracked: ownedId != null }));
        }
    }

    const categories = ['chinese_polish', 'english_polish', 'mindmap', 'translation', 'bibliography', 'code_explanation'].filter(category => !categoryFilter || category === categoryFilter);
    let passed = 0;
    for (const category of categories) {
        const result = await runCoreCase(category);
        if (process.env.LENS_ACADEMIC_READ_CONFIG_ACCESS === '1') return;

        if (!result?.ownedRecordAbsent) {
            console.log(JSON.stringify({ matrixStopped: true, errorClass: 'owned_cleanup_unproven' }));
            process.exitCode = 1;
            return;
        }
        if (result.semanticPassed && result.controlledWriteGatePassed && !result.streamError)
            passed++;
    }
    console.log(JSON.stringify({ coreMatrixCompleted: true, cases: categories.length, passed, failed: categories.length - passed }));
    if (passed !== categories.length)
        process.exitCode = 1;
}
main().catch(() => { console.log(JSON.stringify({ runnerFailed: true, errorClass: 'core_semantic_runner_failed' })); process.exitCode = 1; });
