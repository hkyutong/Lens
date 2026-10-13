const path = require('node:path');
const { auditInterface } = require('./ui_audit.cjs')
const { test, expect } = require('@playwright/test');

const CHAT_BASE_URL = process.env.CHAT_BASE_URL || 'http://127.0.0.1:9002';
const LOGIN_USER = String(process.env.E2E_LOGIN_USER || '').trim();
const LOGIN_PASS = String(process.env.E2E_LOGIN_PASS || '').trim();
const FIXTURE_AUTH_VALUE = 'fixture-authenticated-session';
const acceptanceFixturePages = new WeakSet();

const createModelConfig = () =>
  JSON.stringify({
    modelInfo: {
      model: 'gpt-5-nano',
      modelName: 'GPT-5 nano',
      keyType: 1,
      deductType: 1,
      deduct: 1,
      isFileUpload: 1,
      isImageUpload: 0,
      isNetworkSearch: 1,
      deepThinkingType: 1,
      isMcpTool: 0,
      modelAvatar: '',
      modelDescription: 'Edge regression model',
      maxRounds: 20,
      isGPTs: 0,
      isFlowith: 0,
      isFixedModel: 0,
    },
    fileInfo: {},
  });

const createGroup = () => ({
  id: 1,
  title: 'E2E Regression Group',
  isSticky: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  appId: 0,
  config: createModelConfig(),
  appLogo: '',
  isFixedModel: 0,
  isGpts: 0,
  params: '',
  fileUrl: '',
  content: '',
  appModel: '',
});

const buildChatLog = ({ chatId, role, content }) => ({
  id: chatId,
  chatId,
  role,
  content,
  model: 'gpt-5-nano',
  modelName: role === 'user' ? '我' : 'GPT-5 nano',
  modelAvatar: '',
  type: 1,
  status: 3,
  reasoningText: '',
  promptReference: '',
  networkSearchResult: '',
  fileVectorResult: '',
  tool_calls: '',
  imageUrl: '',
  fileUrl: '',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

const parseRequestBody = request => {
  try {
    return JSON.parse(request.postData() || '{}');
  } catch (_error) {
    return {};
  }
};

const sendButton = page =>
  page.getByRole('button', { name: /发送消息|^发送$|^Send$/ }).last();

const openResearchControls = async (page) => {
  const controls = page.locator('.research-controls:visible').first()
  if (!(await controls.isVisible().catch(() => false))) {
    await page.locator('.workspace-sidebar-toggle:visible, .research-composer__capability:visible, .research-tools-button:visible').first().click()
  }
  await expect(controls).toBeVisible({ timeout: 10000 })
  return controls
};

const closeResearchControls = async (page) => {
  const sheet = page.locator('.research-tool-drawer:visible, .lens-mobile-controls-sheet:visible').first()
  if (!(await sheet.isVisible().catch(() => false))) return
  await sheet.locator('.research-controls__close').click()
  await expect(sheet).toBeHidden({ timeout: 10000 })
};

async function mountRegressionApi(page, options = {}) {
  const group = createGroup();
  const state = {
    ownerId: 1,
    groupFailures: 0,
    groups: [group],
    chatLogsByGroup: {
      1: Array.isArray(options.initialLogs) ? [...options.initialLogs] : [],
    },
    nextChatId: 6000,
    chatRequests: [],
    academicRequests: [],
    workflowRequests: [],
    shareRequests: [],
    shareCreateRequests: [],
    orderRequests: [],
    packageFailuresRemaining: options.packageFailures || 0,
  };

  await page.route('**/api/**', async route => {
    const request = route.request();
    const reqUrl = request.url();
    const parsed = new URL(reqUrl);
    if (!parsed.pathname.startsWith('/api/')) {
      await route.fallback();
      return;
    }

    const path = parsed.pathname.slice(4);
    const groupLogs = state.chatLogsByGroup[1];

    if (path === '/academic/health') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { status: 'ready' }, message: 'ok' }),
      });
      return;
    }

    if (path === '/auth/login') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: FIXTURE_AUTH_VALUE, message: 'ok' }),
      });
      return;
    }

    if (path === '/auth/getInfo') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            userInfo: {
              id: state.ownerId,
              username: 'super',
              email: 'super@example.com',
              role: 'super',
            },
            userBalance: {
              sumModel3Count: 9999,
              sumModel4Count: 9999,
              drawMjCount: 0,
              ...(options.member
                ? {
                    packageId: 1,
                    packageWeight: 30,
                    packageName: '研究者 Max',
                    expirationTime: '2099-12-31',
                  }
                : {}),
              ...options.balance,
            },
          },
          message: 'ok',
        }),
      });
      return;
    }

    if (path === '/config/queryFront') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            showWatermark: 0,
            isAutoOpenNotice: 0,
            wechatSilentLoginStatus: 0,
            clearCacheEnabled: 0,
            ...options.globalConfig,
          },
          message: 'ok',
        }),
      });
      return;
    }

    if (path === '/share/create') {
      state.shareCreateRequests.push(parseRequestBody(request))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { shareCode: `${CHAT_BASE_URL}/?shareCode=Abc12345` },
          message: 'ok',
        }),
      })
      return
    }

    if (path.startsWith('/share/')) {
      state.shareRequests.push(path.slice('/share/'.length));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            htmlContent:
              '<!doctype html><html><body><h2>只读研究成果</h2><p>分享内容不会挂载聊天操作。</p><button>不应在父页面执行</button></body></html>',
          },
          message: 'ok',
        }),
      });
      return;
    }

    if (path === '/models/list') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            modelMaps: {
              default: [
                {
                  model: 'gpt-5-nano',
                  modelName: 'GPT-5 nano',
                  modelDescription: 'Edge regression model',
                  keyType: 1,
                  deductType: 1,
                  deduct: 1,
                  isFileUpload: 1,
                  isImageUpload: 0,
                  isNetworkSearch: 1,
                  deepThinkingType: 1,
                  isMcpTool: 0,
                  maxRounds: 20,
                  modelAvatar: '',
                },
              ],
            },
            modelTypeList: [],
          },
          message: 'ok',
        }),
      });
      return;
    }

    if (path === '/plugin/pluginList' || path === '/app/list') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { rows: [] }, code: 200, message: 'ok' }),
      });
      return;
    }

    if (path === '/academic/core-function-list') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            rows: options.coreFunctions || [
              { name: '中文润色', description: '中文学术表达润色与结构优化' },
              { name: '英文润色', description: '英文论文润色与语法优化' },
            ],
          },
          message: 'ok',
        }),
      });
      return;
    }

    if (path === '/academic/plugin-list') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: { rows: Array.isArray(options.plugins) ? options.plugins : [] },
          message: 'ok',
        }),
      });
      return;
    }

    if (path === '/group/query') {
      if (state.groupFailures > 0) {
        state.groupFailures -= 1;
        await route.fulfill({ status: 503, contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Research service unavailable' }) });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: state.groups, message: 'ok' }),
      });
      return;
    }

    if (path === '/chatlog/chatList') {
      const requestedGroup = Number(parsed.searchParams.get('groupId') || 1);
      const requestedLogs = state.chatLogsByGroup[requestedGroup] || [];
      const size = Math.max(Number(parsed.searchParams.get('size') || 80), 1);
      const beforeChatId = Number(parsed.searchParams.get('beforeChatId') || 0);
      const ordered = [...requestedLogs].sort((a, b) => Number(a.chatId || 0) - Number(b.chatId || 0));
      const filtered = beforeChatId
        ? ordered.filter(item => Number(item.chatId || 0) < beforeChatId)
        : ordered;
      const pageRows = filtered.slice(Math.max(filtered.length - size, 0));
      const nextBeforeChatId = Number(pageRows[0]?.chatId || 0);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            rows: pageRows,
            hasMore: filtered.length > pageRows.length,
            nextBeforeChatId,
          },
          message: 'ok',
        }),
      });
      return;
    }

    if (path === '/chatlog/del' || path === '/chatlog/delByGroupId') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: true, message: 'ok' }),
      });
      return;
    }

    if (path === '/chatlog/deleteChatsAfterId') {
      const body = parseRequestBody(request);
      const startId = Number(body.id || 0);
      if (startId > 0) {
        state.chatLogsByGroup[1] = groupLogs.filter(item => Number(item.chatId) < startId);
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: true, message: 'ok' }),
      });
      return;
    }

    if (path === '/upload/file') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: '/file/userFiles/209912/31/paper.pdf',
          message: 'ok',
        }),
      });
      return;
    }

    if (path === '/chatgpt/chat-process') {
      const body = parseRequestBody(request);
      state.chatRequests.push(body);

      let assistantId = Number(body.replyChatId || 0);
      let output = '';

      if (body.overwriteReply) {
        const userId = Number(body.chatId || 0);
        const targetUser = groupLogs.find(item => Number(item.chatId) === userId);
        const targetAssistant = groupLogs.find(item => Number(item.chatId) === assistantId);
        if (targetUser) targetUser.content = String(body.prompt || '');
        output = String(body.prompt || '').includes('编辑')
          ? '编辑后的首条回复'
          : '重新生成后的首条回复';
        if (targetAssistant) targetAssistant.content = output;
      } else {
        const userId = ++state.nextChatId;
        assistantId = ++state.nextChatId;
        output = `已收到：${String(body.prompt || '').trim()}`;
        groupLogs.push(
          buildChatLog({ chatId: userId, role: 'user', content: String(body.prompt || '') }),
          buildChatLog({ chatId: assistantId, role: 'assistant', content: output }),
        );
      }

      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: `${JSON.stringify({ chatId: assistantId })}\n${JSON.stringify({
          finalContent: output,
          content: output,
          finishReason: 'stop',
        })}\n`,
      });
      return;
    }

    if (path === '/academic/chat-process') {
      const body = parseRequestBody(request);
      state.academicRequests.push(body);

      let assistantId = Number(body.replyChatId || 0);
      let output = '';
      const stableSummary =
        '以下为润色后的总段落：我会先给出完整润色版本，然后用三列表格说明修改原因。';
      const malformedTable = [
        '| 修改前原文片段 | 修改后片段 | 修改原因与解释 |',
        '| --- | --- | --- |',
        '| 你的任务是必须用中文改进所提供文本 | 我的职责是帮助用户提升文本质量 | 将“你的任务”改为“我的职责”，使表述更符合助理身份；将“必须用中文改进”简化为“帮助提升”，使语气更自然 拼写、语法、清晰、简洁和整体可读性 提升文本质量 概括具体改进方向，避免罗列细节，使语句更简洁 同时必须用中文分解长句，减少重复，并提供改进建议 具体包括： 删除冗余描述，用“具体包括”引出后续列表，使结构更清晰 我的能力包括： 具体包括： 将“能力包括”改为“具体包括”，使上下文衔接更连贯 |',
        '| 我的服务能力包括： | 我的服务能力涵盖以下方面： | “服务能力涵盖以下方面”比“服务能力包括”更正式 回答问题、解释概念、提供学习与研究辅导 解答问题、阐释概念、提供学习与研究指导 “解答”“阐释”“指导”用词更准确，与学术辅助场景更匹配 |',
        '| 回答问题、解释概念、提供学习与研究辅导 | 解答问题、阐释概念、提供学习与研究指导 | “解答”比“回答”更贴合学术语境；“阐释”比“解释”更正式；“指导”比“辅导”适用范围更广 |',
        '| 写作、润色、摘要、翻译、改写 | 协助写作、润色、摘要、翻译与改写 | 增加“协助”明确辅助性质；用“与”连接最后两项，使列表更规范 编程帮助、代码调试与思路梳理 提供编程支持、代码调试与逻辑梳理 “支持”比“帮助”更贴切；“逻辑梳理”比“思路梳理”更准确 文本分析、数据解读、研究方向建议 进行文本分析、数据解读与研究方向建议 增加“进行”使动词结构一致；用“与”连接项目，优化并列关系 |',
        '| 与你日常对话、提供创作灵感等 | 日常交流、激发创作灵感等 | “日常交流”比“与你日常对话”更简洁；“激发”比“提供”更主动生动 使用方式很简单： 使用方法十分简便： “使用方法”比“使用方式”更常用；“十分简便”比“很简单”更正式 把问题、文本或任务发给我 您只需将问题、文本或任务发送给我 增加“您只需”使指引更友好；用“发送”替代“发”，语气更正式 我会给出对应的回答或处理结果 我将提供相应的答复或处理结果 “提供”比“给出”更正式；“相应的”比“对应的”更符合书面语习惯 |',
        '| 我的知识有时效性 | 我的知识存在时效限制 | “存在时效限制”比“有时效性”表述更严谨清晰 |',
        '| 涉及最新事件可能需要你提供线索让我查证 | 如需处理最新事件，可能需要您补充线索以便我进行查证 | 补充“如需处理”使逻辑更完整；“您”和“以便”使语气更尊重、逻辑更顺畅 我不能直接访问你的本地文件 我无法直接访问您的本地文件 “无法”比“不能”更正式；“您的”体现尊重 除非你粘贴文本或上传内容 请通过粘贴文本或上传内容的方式提供信息 改为主动建议句式，使指引更明确、更礼貌 |',
        '| 处理隐私和敏感信息时，请谨慎分享 | 涉及隐私或敏感内容时，请务必谨慎分享 | “涉及内容”比“处理信息”搭配更自然；“务必”加强提醒语气 |',
      ].join('\n');
      const leakedTail = [
        '| 第三列只解释这一处修改，说明要简洁准确： | 第三列只解释这一处修改，说明要简洁准确 | 将末尾冒号改为句号，因后续内容已另起段落，并非直接列举。 |',
        '| 把问题、文本或任务发给我 | 您只需将问题、文本或任务发送给我 | 增加“您只需”使指引更友好；用“发送”替代“发”，语气更正式 |',
        '| 我不能直接访问你的本地文件 | 我无法直接访问您的本地文件 | “无法”比“不能”更正式；“您的”体现尊重 |',
      ].join('\n');
      output =
        body.overwriteReply && String(body.main_input || '').includes('编辑')
          ? '编辑后的首条回复'
          : body.function === 'chat'
          ? `已收到：${String(body.main_input || '').trim()}`
          : `${stableSummary}\n\n我将首先用中文提供文本的更正版本，然后输出一个 Markdown 表格列名严格为：\`修改前原文片段 | 修改后片段 | 修改原因与解释\`表格会按“小句/短片段”的粒度拆分，确保每一行只描述一个局部修改每个单元格内容将尽量简短，只摘录必要片段\n\n${malformedTable}\n${leakedTail}`;

      if (body.overwriteReply) {
        const userId = Number(body.chatId || 0);
        const targetUser = groupLogs.find(item => Number(item.chatId) === userId);
        const targetAssistant = groupLogs.find(item => Number(item.chatId) === assistantId);
        if (targetUser) targetUser.content = String(body.main_input || '');
        if (targetAssistant) targetAssistant.content = output;
      } else {
        const userId = ++state.nextChatId;
        assistantId = ++state.nextChatId;
        groupLogs.push(
          buildChatLog({ chatId: userId, role: 'user', content: String(body.main_input || '') }),
          buildChatLog({ chatId: assistantId, role: 'assistant', content: output }),
        );
      }

      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: `${JSON.stringify({ chatId: assistantId })}\n${JSON.stringify({
          finalContent: output,
          content: output,
          finishReason: 'stop',
        })}\n`,
      });
      return;
    }

    if (path === '/academic/workflow-process') {
      const body = parseRequestBody(request);
      state.workflowRequests.push(body);
      const assistantId = ++state.nextChatId;
      const output = `工作流已完成：${body.workflow?.steps?.length || 0} 步`;
      groupLogs.push(
        buildChatLog({
          chatId: assistantId - 1,
          role: 'user',
          content: String(body.main_input || ''),
        }),
        buildChatLog({ chatId: assistantId, role: 'assistant', content: output }),
      );
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: `${JSON.stringify({ chatId: assistantId })}\n${JSON.stringify({
          taskData: {
            type: 'academic-workflow',
            status: 'completed',
            steps: body.workflow?.steps || [],
          },
          progress: 100,
          finalContent: output,
          content: output,
          finishReason: 'stop',
        })}\n`,
      });
      return;
    }

    if (path === '/crami/queryAllPackage') {
      if (state.packageFailuresRemaining > 0) {
        state.packageFailuresRemaining -= 1;
        return route.fulfill({ status: 503, contentType: 'application/json',
          body: JSON.stringify({ success: false, message: 'Service unavailable' }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { rows: options.packages || [] }, message: 'ok' }) });
    }
    if (path === '/order/buy') {
      state.orderRequests.push(parseRequestBody(request));
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { orderId: 'synthetic-order', url_qrcode: 'synthetic-payment-code' }, message: 'ok' }) });
    }
    if (path === '/order/queryByOrderId') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { status: 0 }, message: 'ok' }) });
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: {}, message: 'ok' }),
    });
  });

  return state;
}

async function loginAsSuper(page) {
  const isolated = acceptanceFixturePages.has(page);
  if (!isolated && (!LOGIN_USER || !LOGIN_PASS)) {
    throw new Error('academic regression requires E2E_LOGIN_USER and E2E_LOGIN_PASS from the process environment');
  }
  await page.goto(CHAT_BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const loginButton = page.getByRole('button', { name: /^(?:登录|登入|Login|Log in|Sign in)$/i });
  if (await loginButton.count()) {
    await loginButton.first().click({ force: true });
    await page.locator('#username').fill(isolated ? 'isolated-fixture-user' : LOGIN_USER);
    await page.locator('#password').fill(isolated ? 'isolated-fixture-password' : LOGIN_PASS);
    await page.locator('#agreement-password').check();
    await page.locator('form button[type="submit"]').first().click({ force: true });
    await page.waitForTimeout(1200);
  }

  await expect(page.locator('#workspace-composer')).toBeEnabled({ timeout: 20000 });
}

// Fresh browser contexts and fail-closed routing keep acceptance fixtures away
// from real accounts, backend requests, and external resources.
async function mountAcceptanceFixture(page, options = {}) {
  const origin = new URL(CHAT_BASE_URL).origin;
  const unexpectedRequests = [];
  await page.context().route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin && !url.pathname.startsWith('/api/')) {
      return route.continue();
    }
    if (url.pathname === '/css2' || url.pathname === '/open/js/jweixin-1.6.0.js') {
      return route.abort();
    }
    unexpectedRequests.push(url.pathname);
    return route.abort();
  });
  const state = await mountRegressionApi(page, options);
  acceptanceFixturePages.add(page);
  return { unexpectedRequests, state };
}

const evidenceFixtureLogs = () => [
  buildChatLog({ chatId: 7001, role: 'user', content: '隔离验收：研究证据示例' }),
  {
    ...buildChatLog({ chatId: 7002, role: 'assistant', content: '隔离验收：研究结论示例' }),
    networkSearchResult: JSON.stringify([
      { title: '公开来源示例', link: 'https://example.org/research' },
      { title: '禁止的内网来源', link: 'http://127.0.0.1/private' },
    ]),
    fileVectorResult: JSON.stringify([{ path: 'gpt_log/academic_results/fixture/report.pdf', name: 'report.pdf' }]),
    reasoningText: '隔离验收：先检查材料，再比较公开证据。',
    usingNetwork: false,
  },
];

async function captureAcceptanceView(page, name) {
  if (!process.env.E2E_VISUAL_DIR) return;
  await page.screenshot({ path: `${process.env.E2E_VISUAL_DIR}/${name}.png` });
}

test('隔离验收：证据保存、刷新、记录隔离与取消保存', async ({ page }) => {
  const evidenceWithUpload = () => evidenceFixtureLogs().map(log => log.role === 'assistant'
    ? { ...log, fileUrl: JSON.stringify([{ name: 'evidence-input.pdf',
      url: '/file/userFiles/209912/31/evidence-input.pdf' }]) }
    : log);
  const { unexpectedRequests, state } = await mountAcceptanceFixture(page, {
    member: true,
    initialLogs: evidenceWithUpload(),
  });
  state.groups.push({ ...createGroup(), id: 2, title: 'Isolated second record' });
  state.chatLogsByGroup[2] = evidenceWithUpload();
  await loginAsSuper(page);
  const sourceSave = page.locator('.evidence-cards__item')
    .filter({ hasText: '公开来源示例' }).locator('.evidence-cards__save');
  const fileSave = page.locator('.evidence-cards__item')
    .filter({ hasText: 'evidence-input.pdf' }).locator('.evidence-cards__save');
  await expect(sourceSave).toHaveAttribute('aria-pressed', 'false');
  await sourceSave.click();
  await fileSave.click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(sourceSave).toHaveAttribute('aria-pressed', 'true');
  await expect(fileSave).toHaveAttribute('aria-pressed', 'true');

  const selectRecord = async title => {
    await page.getByRole('button', { name: /研究记录|Research records/i }).first().click();
    await expect(page.locator('.project-list__item')).toHaveCount(2);
    await page.locator('.project-list__item').filter({ hasText: title }).click();
    await expect(page.locator('.research-projects')).toBeHidden();
  };
  await selectRecord('Isolated second record');
  await expect(sourceSave).toHaveAttribute('aria-pressed', 'false');
  await expect(fileSave).toHaveAttribute('aria-pressed', 'false');
  await selectRecord('E2E Regression Group');
  await expect(sourceSave).toHaveAttribute('aria-pressed', 'true');
  await expect(fileSave).toHaveAttribute('aria-pressed', 'true');
  await sourceSave.click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(sourceSave).toHaveAttribute('aria-pressed', 'false');
  await expect(fileSave).toHaveAttribute('aria-pressed', 'true');
  expect(unexpectedRequests).toEqual([]);
});

test('隔离验收：证据保存状态不跨合成账号', async ({ page }) => {
  const { unexpectedRequests, state } = await mountAcceptanceFixture(page, {
    member: true,
    initialLogs: evidenceFixtureLogs(),
  });
  await loginAsSuper(page);
  const save = page.locator('.evidence-cards__item')
    .filter({ hasText: '公开来源示例' }).locator('.evidence-cards__save');
  await save.click();
  await expect(save).toHaveAttribute('aria-pressed', 'true');
  state.ownerId = 2;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(save).toHaveAttribute('aria-pressed', 'false');
  state.ownerId = 1;
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(save).toHaveAttribute('aria-pressed', 'true');
  expect(unexpectedRequests).toEqual([]);
});

test('隔离验收：研究记录刷新失败后可重试恢复', async ({ page }) => {
  const { unexpectedRequests, state } = await mountAcceptanceFixture(page, {
    member: true,
    initialLogs: evidenceFixtureLogs(),
  });
  await loginAsSuper(page);
  state.groupFailures = 1;
  await page.reload({ waitUntil: 'domcontentloaded' });
  const banner = page.locator('.workspace-service-banner');
  await expect(banner).toBeVisible();
  await banner.locator('.workspace-service-banner__retry').click();
  await expect(banner).toBeHidden();
  await expect(page.locator('.workspace-record__evidence')).toContainText(/Sources 1|来源 1/);
  await page.getByRole('button', { name: /研究记录|Research records/i }).first().click();
  await expect(page.locator('.project-list__item')
    .filter({ hasText: 'E2E Regression Group' })).toBeVisible();
  expect(unexpectedRequests).toEqual([]);
});

for (const [tier, weight, expired, advancedAccess, fullAccess] of [
  ['free', 0, false, false, false],
  ['plus', 10, false, false, false],
  ['pro', 20, false, true, false],
  ['max', 30, false, true, true],
  ['expired-max', 30, true, false, false],
]) {
  test(`隔离验收：${tier} 能力权限在面板与首页一致`, async ({ page }) => {
    const { unexpectedRequests } = await mountAcceptanceFixture(page, {
      balance: { packageId: weight ? 1 : 0, packageWeight: weight,
        expirationTime: expired ? '2000-01-01' : '2099-12-31' },
      coreFunctions: [{ name: '英文润色' }, { name: '高级数学分析' }],
      plugins: [{ name: '论文速读', group: '学术' },
        { name: 'PDF批量总结', group: '学术' },
        { name: '解析整个Python项目', group: '学术' }],
    });
    await loginAsSuper(page);
    const panel = page.locator('.lens-shell__tools');
    const entry = value => panel.locator(`[data-capability="${value}"]`);
    await expect(panel.locator('select, .research-controls__advanced')).toHaveCount(0);
    await expect(entry('core:英文润色')).toHaveCount(1);
    await expect(entry('core:高级数学分析')).toHaveCount(advancedAccess ? 1 : 0);
    await expect(entry('plugin:论文速读')).toHaveCount(1);
    await expect(entry('plugin:PDF批量总结')).toHaveCount(advancedAccess ? 1 : 0);
    await expect(entry('plugin:解析整个Python项目')).toHaveCount(fullAccess ? 1 : 0);
    await expect(panel.locator('.research-shortcuts__button')).toHaveCount(9);
    await expect(panel.locator('.research-shortcuts__button').first()).toBeEnabled();
    await page.locator('#workspace-composer').fill('Synthetic permission transition');
    await sendButton(page).click();
    await expect(page.locator('.workspace-record--assistant').last()).toBeVisible();
    await expect(entry('core:英文润色')).toHaveCount(1);
    await expect(entry('core:高级数学分析')).toHaveCount(advancedAccess ? 1 : 0);
    await expect(entry('plugin:论文速读')).toHaveCount(1);
    await expect(entry('plugin:PDF批量总结')).toHaveCount(advancedAccess ? 1 : 0);
    await expect(entry('plugin:解析整个Python项目')).toHaveCount(fullAccess ? 1 : 0);
    expect(unexpectedRequests).toEqual([]);
  });
}

test('隔离验收：登录历史证据链刷新后仍完整，来源过滤与权限面板可用', async ({ page }) => {
  const { unexpectedRequests } = await mountAcceptanceFixture(page, {
    member: true,
    initialLogs: evidenceFixtureLogs(),
  });
  await loginAsSuper(page);
  const evidence = page.locator('.workspace-record__evidence');
  await expect(evidence).toContainText(/Sources 1|来源 1/);
  await expect(evidence).toContainText(/Attachments 1|附件 1/);
  await expect(evidence).toContainText(/Reasoning|推理/);
  await expect(page.locator('.reasoning-pill')).toContainText('先检查材料');
  await expect(page.getByRole('button', { name: 'report.pdf', exact: true })).toBeVisible();
  await page.locator('.workspace-record__toggle').filter({ hasText: /web sources|网页来源|sources/i }).click();
  await expect(page.locator('.workspace-record__source-item')).toHaveCount(1);
  await expect(page.locator('.workspace-record__source-item')).toHaveAttribute('href', 'https://example.org/research');
  await expect(page.getByText('禁止的内网来源')).toHaveCount(0);
  await expect(page.locator('.research-controls__option').first()).toBeEnabled();
  await captureAcceptanceView(page, 'desktop-light');
  await page.locator('.research-theme-button').click();
  await expect(page.locator('.research-theme-button')).toHaveAttribute('aria-pressed', 'true');
  await captureAcceptanceView(page, 'desktop-dark');
  await page.locator('.research-theme-button').click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(evidence).toContainText(/Sources 1|来源 1/);
  await expect(evidence).toContainText(/Attachments 1|附件 1/);
  await expect(evidence).toContainText(/Reasoning|推理/);
  for (const [width, height] of [[1440, 900], [1280, 720], [1280, 600]]) {
    await page.setViewportSize({ width, height });
    await expect(page.locator('.research-controls select')).toHaveCount(0);
    await expect(page.locator('.research-controls__advanced')).toHaveCount(0);
    await expect(page.locator('.lens-shell__tools .research-shortcuts__button')).toHaveCount(9);
    const send = await sendButton(page).boundingBox();
    expect(send).not.toBeNull();
    expect(send.y).toBeGreaterThanOrEqual(0);
    expect(send.y + send.height).toBeLessThanOrEqual(height);
    expect(await page.locator('.lens-shell__configuration').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(false);
  }
  expect(unexpectedRequests).toEqual([]);
});

test('隔离验收：上传资料会随 Academic 请求提交', async ({ page }) => {
  const { unexpectedRequests, state } = await mountAcceptanceFixture(page, {
    member: true,
    initialLogs: [],
  });
  await loginAsSuper(page);
  await page.locator('.research-controls__option[data-capability="core:中文润色"]').click();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'fixture-paper.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 isolated fixture'),
  });
  await expect(page.getByText('fixture-paper.pdf', { exact: true })).toBeVisible();

  await page.locator('#workspace-composer').fill('请概括这份隔离测试资料');
  await sendButton(page).click();
  await expect.poll(() => state.academicRequests.length).toBe(1);
  const submittedFiles = JSON.parse(String(state.academicRequests[0].fileUrl || '[]'));
  expect(submittedFiles).toEqual([
    {
      name: 'fixture-paper.pdf',
      url: '/file/userFiles/209912/31/paper.pdf',
      type: 'document',
    },
  ]);
  expect(state.academicRequests[0].main_input).toBe('请概括这份隔离测试资料');
  await expect(page.locator('.academic-home')).toHaveCount(0);
  await expect(page.locator('.workspace-document')).toContainText('请概括这份隔离测试资料');
  await expect(page.locator('.workspace-document')).toContainText('总段落：');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.locator('.workspace-document')).toContainText('总段落：');
});

test('隔离验收：登录手机布局、权限抽屉与发送控件不重叠', async ({ page }) => {
  const { unexpectedRequests } = await mountAcceptanceFixture(page, {
    member: true,
    initialLogs: evidenceFixtureLogs(),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsSuper(page);
  await expect(page.locator('.workspace-record__evidence')).toContainText(/Sources 1|来源 1/);
  await expect(page.locator('.research-composer__capability, .research-tools-button')).toHaveCount(1);
  await captureAcceptanceView(page, 'mobile-390');
  await page.locator('.research-composer__capability, .research-tools-button').click();
  const drawer = page.locator('.fixed.inset-0')
    .filter({ has: page.locator('.research-controls') }).last();
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('.research-controls__option').first()).toBeEnabled();
  const drawerWidth = await drawer.evaluate(el => el.getBoundingClientRect().width);
  expect(drawerWidth).toBeLessThanOrEqual(390);
  await captureAcceptanceView(page, 'mobile-permissions');
  await closeResearchControls(page, drawer);
  for (const width of [390, 360, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(page.locator('#workspace-composer')).toBeVisible();
    const dimensions = await page.evaluate(() => ({
      viewport: innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport);
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
    const send = await sendButton(page).boundingBox();
    const upload = await page
      .getByRole('button', { name: /上传文件或图片|Upload file or image|Upload/ })
      .boundingBox();
    expect(send).not.toBeNull();
    expect(upload).not.toBeNull();
    expect(send.x + send.width <= upload.x || upload.x + upload.width <= send.x ||
      send.y + send.height <= upload.y || upload.y + upload.height <= send.y).toBeTruthy();
  }
  expect(unexpectedRequests).toEqual([]);
});

test('隔离验收：输入溢出才显示展开，短输入和清空后隐藏', async ({ page }) => {
  await mountAcceptanceFixture(page, { member: true });
  await loginAsSuper(page);
  const input = page.locator('#workspace-composer');
  const expand = page.locator('.research-composer__expand');
  const longInput = Array.from({ length: 10 }, (_, index) => `Synthetic research paragraph ${index + 1}`).join('\n');
  for (const [width, height] of [[1440, 900], [1280, 600], [390, 844], [320, 740]]) {
    await page.setViewportSize({ width, height });
    await input.fill('');
    await expect(expand).toHaveCount(0);
    await input.fill('Brief research question');
    await expect(expand).toHaveCount(0);
    await input.fill(longInput);
    await expect(expand).toBeVisible();
    const collapsedHeight = await input.evaluate(el => el.clientHeight);
    await expand.click();
    await expect(expand).toHaveAttribute('aria-expanded', 'true');
    await expect.poll(() => input.evaluate(el => el.clientHeight)).toBeGreaterThan(collapsedHeight);
    await expect(input).toHaveValue(longInput);
    const send = await sendButton(page).boundingBox();
    expect(send.y + send.height).toBeLessThanOrEqual(height);
    expect(send.width).toBeGreaterThanOrEqual(44);
    expect(send.height).toBeGreaterThanOrEqual(44);
    await expand.click();
    await expect(expand).toHaveAttribute('aria-expanded', 'false');
    await input.fill('');
    await expect(expand).toHaveCount(0);
  }
});

test('隔离验收：游客可切换语言和主题，研究操作仍要求登录', async ({ browser }) => {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'en-US' });
    try {
      const page = await context.newPage();
      const { unexpectedRequests, state } = await mountAcceptanceFixture(page);
      await page.goto(CHAT_BASE_URL, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('.academic-home__capability')).toHaveCount(width >= 1024 ? 6 : 0);
      await expect(page.locator('.language-selector-trigger .research-chip-button__label')).toBeVisible();
      await expect(page.locator('.language-selector-trigger .language-selector-icon')).toHaveCount(0);
      for (const [index, locale] of [[0, 'zh-CN'], [1, 'zh-TW'], [3, 'ja-JP'], [4, 'ko-KR'], [2, 'en-US']]) {
        await page.locator('.language-selector-trigger').click();
        const languageMenu = page.locator('.research-language-menu');
        await expect(languageMenu).toBeVisible();
        const menuBox = await languageMenu.boundingBox();
        const languageTrigger = await page.locator('.language-selector-trigger').boundingBox();
        expect(menuBox.y).toBeGreaterThanOrEqual(0);
        expect(menuBox.y).toBeGreaterThanOrEqual(languageTrigger.y + languageTrigger.height);
        await page.getByRole('menuitemradio').nth(index).click();
        await expect(page.locator('html')).toHaveAttribute('lang', locale);
        await expect(page.locator('.language-selector-trigger .research-chip-button__label')).toBeVisible();
        const short = { 'zh-CN': '简', 'zh-TW': '繁', 'ja-JP': '日', 'ko-KR': '한', 'en-US': 'EN' }[locale];
        await expect(page.locator('.language-selector-trigger .research-chip-button__label')).toHaveText(short);
        await expect(page.locator('.academic-login')).toHaveCount(0);
        await expect(page.getByRole('menuitemradio')).toHaveCount(0);
        await page.locator('.workspace-account-button').click();
        const login = page.locator('dialog.academic-login');
        await expect(login).toBeVisible();
        await expect(login.locator('.login-policy-link')).toHaveCount(2);
        const links = await login.locator('.login-policy-link').all();
        const linkBoxes = await Promise.all(links.map(link => link.boundingBox()));
        expect(linkBoxes).toHaveLength(2);
        expect(Math.abs(linkBoxes[0].y - linkBoxes[1].y)).toBeLessThanOrEqual(1);
        const policyBounds = await login.locator('.login-policy-row').boundingBox();
        expect(linkBoxes[1].x + linkBoxes[1].width).toBeLessThanOrEqual(policyBounds.x + policyBounds.width + 1);
        for (const mode of ['password', 'captcha']) {
          if (mode === 'captcha') await login.locator('.login-switch').click();
          const copyBox = await login.locator('.login-policy-copy').boundingBox();
          const submitBox = await login.locator('button[type="submit"]').boundingBox();
          const checkBox = await login.locator('.login-policy-check').boundingBox();
          const dialogBox = await login.boundingBox();
          const modeLinks = await Promise.all((await login.locator('.login-policy-link').all()).map(link => link.boundingBox()));
          expect(Math.abs(copyBox.x + copyBox.width / 2 - submitBox.x - submitBox.width / 2)).toBeLessThanOrEqual(1);
          expect(Math.abs(modeLinks[0].y - modeLinks[1].y)).toBeLessThanOrEqual(1);
          expect(checkBox.width).toBeGreaterThanOrEqual(44);
          expect(checkBox.x).toBeGreaterThanOrEqual(dialogBox.x);
          expect(checkBox.x + checkBox.width).toBeLessThanOrEqual(copyBox.x);
          expect(modeLinks[1].x + modeLinks[1].width).toBeLessThanOrEqual(dialogBox.x + dialogBox.width);
          const checkbox = login.locator('.lens-checkbox');
          await expect(checkbox).not.toBeChecked();
          await login.locator('.login-policy-check').click();
          await expect(checkbox).toBeChecked();
          await login.locator('.login-policy-check').click();
          await expect(checkbox).not.toBeChecked();
          if (process.env.LENS_CAPTURE_DIR && locale === 'zh-CN') {
            await page.mouse.move(0, 0);
            await auditInterface(page, 'auth')
            await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-policy-centered-${width}-${mode}.png` });
          }
        }
        await login.locator('.academic-login-close').hover();
        await expect(login.locator('.academic-login-close')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        await expect(login.locator('.academic-login-close')).toHaveCSS('transform', 'none');
        await login.locator('.academic-login-close').click();
        await expect(login).toHaveCount(0);
      }
      await page.locator('.research-theme-button').click();
      await expect(page.locator('.research-theme-button')).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.academic-login')).toHaveCount(0);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
      const visibleResearchEntry = page.locator(
        width >= 1024
          ? '.academic-home__capability:visible'
          : '.academic-home .research-shortcuts__button:visible',
      ).first();
      await expect(visibleResearchEntry).toBeVisible();
      await visibleResearchEntry.click();
      await expect(page.locator('.academic-login')).toBeVisible();
      expect(state.academicRequests).toEqual([]);
      expect(state.workflowRequests).toEqual([]);
      expect(unexpectedRequests).toEqual([]);
    } finally { await context.close(); }
  }
});

test('隔离验收：左侧直接提问保留草稿，六个特色功能使用默认 Academic 链路', async ({ browser }) => {
  const features = [
    [/研究问题拆解|Question breakdown/, /可验证的子问题|testable subquestions/],
    [/文献综述|Literature review/, /不要编造文献|Do not fabricate literature/],
    [/研究方案设计|Research plan/, /可执行的研究方案|actionable research plan/],
    [/整理研究笔记|Organize research notes/, /结构化研究笔记|structured research notes/],
    [/比较多篇论文|Compare papers/, /比较当前资料中的多篇论文|Compare the papers/],
    [/生成教学材料|Create teaching material/, /生成教学材料|Create teaching material/],
  ];
  for (const width of [1440, 390]) {
    for (const [label, prompt] of features) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'zh-CN' });
      try {
        const page = await context.newPage();
        const { state, unexpectedRequests } = await mountAcceptanceFixture(page, {
          member: true, plugins: [{ name: 'PDF 深度理解', group: '学术' }],
        });
        await loginAsSuper(page);
        const input = page.locator('#workspace-composer');
        await input.fill('Synthetic research draft');
        await page.locator('#workspace-composer').click();
        await expect(input).toBeFocused();
        await expect(input).toHaveValue('Synthetic research draft');
        if (width < 1024) await page.locator('.academic-home__capability').first().click();
        if (width >= 1024) {
          await page.locator('.research-controls__option[data-capability="plugin:PDF 深度理解"]').click();
        }
        await page.locator('.academic-home').getByRole('button', { name: label }).click();
        await expect(input).toBeFocused();
        await expect(input).toHaveValue(prompt);
        await sendButton(page).click();
        await expect.poll(() => state.academicRequests.length).toBe(1);
        expect(state.academicRequests[0].function).toBe('chat');
        expect(state.academicRequests[0].appId).toBe(0);
        expect(state.academicRequests[0].main_input).toMatch(prompt);
        expect(state.chatRequests).toEqual([]);
        expect(state.workflowRequests).toEqual([]);
        await expect(page.locator('.workspace-record--assistant').last()).toBeVisible();
        await expect(page.locator('.academic-home')).toHaveCount(0);
        expect(unexpectedRequests).toEqual([]);
      } finally { await context.close(); }
    }
  }
});

test('隔离验收：六个特色功能与发送区在桌面矮屏和手机保持可用', async ({ browser }) => {
  const viewports = [
    [1440, 900, 'zh-CN', false, 'desktop'],
    [1280, 720, 'en-US', false],
    [1440, 900, 'en-US', false],
    [768, 1024, 'zh-CN', false],
    [1280, 600, 'zh-CN', false, 'short'],
    [1280, 600, 'en-US', false],
    [1024, 768, 'zh-CN', false],
    [390, 844, 'zh-CN', false, 'mobile'],
    [320, 740, 'en-US', false],
    [390, 844, 'zh-CN', true],
    [1440, 900, 'zh-CN', true, 'dark'],
  ];
  for (const [width, height, locale, dark, capture] of viewports) {
    const context = await browser.newContext({ viewport: { width, height }, locale });
    try {
      const page = await context.newPage();
      const { unexpectedRequests } = await mountAcceptanceFixture(page, {
        member: true,
        coreFunctions: [{ name: '英文润色' }, { name: '中文润色' }, { name: '参考文献转BibTeX' }],
        plugins: [{ name: 'PDF 深度理解', group: '学术' }, { name: 'PDF 批量总结', group: '学术' }, { name: '论文速读', group: '学术' }],
      });
      await loginAsSuper(page);
      if (dark) await page.locator('.research-theme-button').click();
      await expect(page.locator('.academic-home__capability')).toHaveCount(width >= 1024 ? 0 : 6);
      await expect(page.locator('.academic-home .research-shortcuts__button')).toHaveCount(6);
      await expect(page.locator('.research-shortcuts h2')).toHaveCount(0);
      await expect(page.locator('#research-home-input #workspace-composer')).toHaveCount(1);
      await expect(page.locator('.lens-shell__tools #workspace-composer')).toHaveCount(0);
      for (const [entrySelector, headingSelector] of [
        ['.research-shortcuts__button', '#research-start-title'],
        ...(width < 1024 ? [['.academic-home__capability', '.research-capabilities h2']] : []),
      ]) {
        const entry = page.locator(entrySelector).first();
        await entry.scrollIntoViewIfNeeded();
        const before = await entry.boundingBox();
        const heading = await page.locator(headingSelector).boundingBox();
        expect(Math.abs(before.x - heading.x)).toBeLessThanOrEqual(1);
        await entry.hover();
        await expect(entry.locator('.research-entry-arrow')).toHaveCSS('opacity', '1');
        expect(await entry.boundingBox()).toEqual(before);
        await entry.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Shift+Tab');
        await expect(entry).toBeFocused();
        expect(await entry.evaluate(el => el.matches(':focus-visible'))).toBe(true);
      }
      await page.locator('#research-start-title').click();
      for (const button of await page.locator('.academic-home .research-shortcuts__button').all()) {
        await expect(button).toBeVisible();
        const box = await button.boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
      }
      const send = await sendButton(page).boundingBox();
      await page.locator('#scrollRef').evaluate(el => { el.scrollTop = 0; });
      const navigation = await page.locator(width < 1024 ? '.workspace-navigation--mobile' : '.workspace-navigation--preferences').boundingBox();
      expect(navigation.y + navigation.height).toBeLessThanOrEqual(height);
      await expect(page.locator('footer.workspace-navigation')).toHaveCount(0);
      await expect(page.locator('.workspace-navigation')).toHaveCount(width < 1024 ? 1 : 2);
      expect(send.y + send.height).toBeLessThanOrEqual(height);
      if (width < 1024) {
        expect(navigation.y).toBe(0);
        expect(navigation.height).toBeGreaterThanOrEqual(56);
        expect(send.y).toBeGreaterThanOrEqual(navigation.y + navigation.height);
        await expect(page.locator('header.workspace-navigation--mobile')).toBeVisible();
      } else {
        const tools = await page.locator('.lens-shell__tools').boundingBox();
        expect(navigation.x).toBeGreaterThanOrEqual(tools.x);
        expect(navigation.width).toBeLessThanOrEqual(tools.width);
        expect(send.x + send.width).toBeLessThanOrEqual(navigation.x);
        const language = await page.locator('.language-selector-trigger').boundingBox();
        const records = await page.locator('.workspace-projects-button').boundingBox();
        const theme = await page.locator('.research-theme-button').boundingBox();
        expect(theme.y).toBe(language.y);
        expect(theme.x + theme.width).toBeLessThanOrEqual(language.x);
        expect(language.y + language.height).toBeLessThanOrEqual(tools.y + 80);
        expect(language.x + language.width).toBeGreaterThan(tools.x + tools.width - 90);
        expect(records.y).toBeGreaterThan(language.y + language.height);
        expect(records.x).toBeGreaterThanOrEqual(navigation.x);
      }
      if (width >= 1024) {
        const shortcuts = await page.locator('.academic-home .research-shortcuts').boundingBox();
        expect(shortcuts.y + shortcuts.height, `tasks at ${width}x${height} ${locale}`).toBeLessThanOrEqual(height);
      }
      expect(send.width).toBeGreaterThanOrEqual(44);
      expect(send.height).toBeGreaterThanOrEqual(44);
      const geometry = await page.evaluate(() => ({
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        configurationOverflow: (() => {
          const el = document.querySelector('.lens-shell__configuration');
          return el ? el.scrollHeight > el.clientHeight + 1 : false;
        })(),
      }));
      expect(geometry.horizontalOverflow).toBe(false);
      if (width >= 1024) expect(geometry.configurationOverflow, `configuration overflow at ${width}x${height} ${locale}`).toBe(false);
      if (process.env.LENS_CAPTURE_DIR && capture) {
        await expect(page.getByText(/账户登录成功|Account login successful/)).toBeHidden({ timeout: 10000 });
        await page.locator('#scrollRef').evaluate(el => { el.scrollTop = 0; });
        await page.mouse.move(0, 0);
        await page.waitForTimeout(200);
        await auditInterface(page, 'home')
        await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-final-${capture}.png` });
        if (capture === 'desktop' || capture === 'dark') {
          await page.locator('.academic-home .research-shortcuts__button').first().hover();
          await page.waitForTimeout(180);
          await auditInterface(page, 'other')
          await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-hover-${capture}.png` });
          await page.locator('.lens-shell__tools .research-shortcuts__button').first().hover();
          await page.waitForTimeout(180);
          await auditInterface(page, 'other')
          await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-hover-general-${capture}.png` });
        }
      }
      expect(unexpectedRequests).toEqual([]);
    } finally { await context.close(); }
  }
});

test('隔离验收：聊天右栏扁平滚动能力与特色任务，要求只从主输入提交', async ({ page }) => {
  const plugins = [{ name: 'PDF 深度理解', group: '学术', advancedArgs: true },
    { name: '解析整个Python项目', group: '编程' },
    ...Array.from({ length: 12 }, (_, index) => ({ name: `Synthetic tool ${index}`, group: '学术' })),
    { name: '虚空终端', group: '编程' }];
  const { unexpectedRequests, state } = await mountAcceptanceFixture(page, { member: true, plugins });
  await loginAsSuper(page);
  const sidebar = page.locator('.lens-shell__tools');
  await expect(sidebar.locator('.research-controls__list')).toBeVisible();
  await expect(sidebar.locator('select, .research-controls__advanced')).toHaveCount(0);
  await expect(sidebar.locator('.research-controls h3')).toHaveText(/更多功能|More tools/);
  const assertSidebarOrder = async () => {
    const more = await sidebar.locator('.research-controls h3').boundingBox();
    const featured = await sidebar.locator('.research-shortcuts__title').boundingBox();
    expect(more.y).toBeLessThan(featured.y);
    expect(Math.abs(more.x - featured.x)).toBeLessThanOrEqual(1);
  };
  await assertSidebarOrder();
  await sidebar.locator('.research-controls__category').click();
  await page.getByRole('menuitemradio', { name: require('../../chat/src/locales/en-US.json').lens.academicPanel.groupProgramming, exact: true }).click();
  await expect(sidebar.locator('[data-capability="core:中文润色"]')).toHaveCount(0);
  await sidebar.locator('.research-controls__category').click();
  await page.getByRole('menuitemradio', { name: require('../../chat/src/locales/en-US.json').lens.academicPanel.categoryAll, exact: true }).click();
  await sidebar.locator('.research-controls__search-toggle').click();
  await sidebar.locator('.research-controls__search').fill('Synthetic tool 11');
  await expect(sidebar.locator('.research-controls__option')).toHaveCount(1);
  await sidebar.locator('.research-controls__search').press('Escape');
  if (process.env.LENS_CAPTURE_DIR) {
    await expect(page.getByText(/账户登录成功|Account login successful/)).toBeHidden();
    await auditInterface(page, 'conversation')
    await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-new-conversation-sidebar.png` });
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(sidebar.locator('.research-controls__list')).toBeVisible();
  await expect(sidebar.locator('select, .research-controls__advanced')).toHaveCount(0);
  await assertSidebarOrder();
  await expect(sidebar.locator('.research-shortcuts__button')).toHaveCount(9);
  await expect(page.locator('.research-instructions')).toHaveCount(0);
  await page.locator('#workspace-composer').fill('Synthetic conversation start');
  await sendButton(page).click();
  await expect(page.locator('.workspace-record--assistant').last()).toBeVisible();
  const option = (value) => sidebar.locator('.research-controls__option')
    .and(sidebar.locator(`[data-capability="${value}"]`));
  await expect(sidebar.locator('select')).toHaveCount(0);
  await assertSidebarOrder();
  await expect(sidebar.locator('.research-controls__advanced')).toHaveCount(0);
  await expect(sidebar.locator('.research-shortcuts__button')).toHaveCount(9);
  await expect(option('plugin:虚空终端')).toHaveCount(0);
  await expect(option('plugin:解析整个Python项目')).toHaveCount(1);
  for (const [width, height] of [[1440, 900], [1280, 600]]) {
    await page.setViewportSize({ width, height });
    const list = sidebar.locator('.research-controls__scroll-region .capability-scroll__viewport');
    expect(await list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
    expect(await page.locator('.lens-shell__configuration').evaluate(el => el.scrollHeight > el.clientHeight)).toBe(false);
    await list.hover();
    await page.mouse.wheel(0, 500);
    await expect.poll(() => list.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    await option('plugin:Synthetic tool 11').click();
    await expect(option('plugin:Synthetic tool 11')).toHaveAttribute('aria-pressed', 'true');
    expect(await list.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
    const send = await sendButton(page).boundingBox();
    const nav = await page.locator('.workspace-navigation--preferences').boundingBox();
    expect(send.y + send.height).toBeLessThanOrEqual(height);
    expect(send.x + send.width).toBeLessThanOrEqual(nav.x);
    await expect(page.locator('footer.workspace-navigation')).toHaveCount(0);
    expect(await page.locator('body').evaluate(el => el.scrollWidth > innerWidth)).toBe(false);
  }
  await option('core:中文润色').click();
  await page.locator('#workspace-composer').fill('Synthetic continued research');
  await sendButton(page).click();
  await expect.poll(() => state.academicRequests.length).toBe(2);
  expect(state.academicRequests[1].function).toBe('basic');
  expect(state.academicRequests[1].core_function).toBe('中文润色');
  await expect(page.locator('.workspace-record--assistant').last()).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(sidebar.locator('.research-controls__list')).toBeVisible();
  await expect(sidebar.locator('.research-shortcuts__button')).toHaveCount(9);
  await page.setViewportSize({ width: 1440, height: 900 });
        const sidebarToggle = page.locator('.workspace-sidebar-toggle');
        await expect(sidebarToggle).toBeVisible();
        await sidebarToggle.click();
        await expect(page.locator('.lens-shell__tools')).toHaveClass(/lens-shell__tools--collapsed/);
        await expect(page.locator('#workspace-composer')).toBeVisible();
        await sidebarToggle.click();
        await expect(page.locator('.lens-shell__tools')).not.toHaveClass(/lens-shell__tools--collapsed/);
  await option('plugin:PDF 深度理解').click();
  await page.locator('#workspace-composer').fill('Synthetic plugin request. Additional requirement: compare methods.');
  if (process.env.LENS_CAPTURE_DIR) {
    await page.mouse.move(0, 0);
    await auditInterface(page, 'conversation')
    await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-chat-sidebar.png` });
    await page.locator('.research-theme-button').click();
    await expect(page.locator('.research-shortcuts__button').first()).toHaveCSS('color', await page.locator('.research-shortcuts__title').evaluate(el => getComputedStyle(el).color));
    await auditInterface(page, 'composer')
    await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-chat-sidebar-dark.png` });
    await page.locator('.research-theme-button').click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  const sheet = page.locator('.lens-mobile-controls-sheet');
  if (!await sheet.isVisible()) await page.locator('.research-composer__capability:visible, .research-tools-button:visible').click();
  await expect(sheet.locator('[data-capability="plugin:PDF 深度理解"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(sheet.locator('.research-shortcuts__button')).toHaveCount(9);
  await expect(sheet.locator('select')).toHaveCount(0);
  if (process.env.LENS_CAPTURE_DIR) {
    await auditInterface(page, 'composer')
    await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-chat-mobile-tools.png` });
  }
  await sheet.getByRole('button', { name: /研究设计体检|Research design review/ }).click();
  await expect(page.locator('.lens-mobile-controls-sheet')).toHaveCount(0);
  await expect(page.locator('#workspace-composer')).toBeFocused();
  await expect(page.locator('#workspace-composer')).toHaveValue(/研究设计|research design/i);
  await page.locator('.research-composer__capability, .research-tools-button').click();
  await page.locator('.lens-mobile-controls-sheet [data-capability="plugin:PDF 深度理解"]').click();
  await page.keyboard.press('Escape');
  await page.locator('#workspace-composer').fill('Synthetic plugin request. Additional requirement: compare methods.');
  await sendButton(page).click();
  await expect.poll(() => state.academicRequests.length).toBe(3);
  expect(state.academicRequests[2].function).toBe('plugin');
  expect(state.academicRequests[2].plugin_name).toBe('PDF 深度理解');
  expect(state.academicRequests[2].main_input).toContain('Additional requirement: compare methods.');
  expect(state.academicRequests[2].plugin_kwargs || {}).not.toHaveProperty('user_prompt');
  await expect(page.locator('.research-instructions')).toHaveCount(0);
  expect(state.chatRequests).toEqual([]);
  expect(state.workflowRequests).toEqual([]);
  expect(unexpectedRequests).toEqual([]);
});

test('隔离验收：未登录首页左侧展示特色任务，右侧展示常用能力', async ({ page }) => {
  const { unexpectedRequests, state } = await mountAcceptanceFixture(page);
  await page.goto(CHAT_BASE_URL, { waitUntil: 'domcontentloaded' });
  const home = page.locator('.academic-home');
  const sidebar = page.locator('.lens-shell__tools');
  await expect(home.locator('.research-shortcuts__button')).toHaveCount(6);
  await expect(home.locator('.academic-home__capability')).toHaveCount(0);
  await expect(sidebar.locator('.academic-home__capability')).toHaveCount(6);
  await expect(sidebar.locator('.research-shortcuts__button')).toHaveCount(3);
  await home.getByRole('button', { name: /研究方案设计|Research plan/ }).click();
  await expect(page.locator('.academic-login')).toBeVisible();
  expect(state.academicRequests).toEqual([]);
  expect(unexpectedRequests).toEqual([]);
});

test('隔离验收：游客侧栏默认展开、收起后可恢复且特色入口逐个要求登录', async ({ browser }) => {
  for (const [width, height] of [[1440, 900], [1280, 600], [1024, 768]]) {
    const context = await browser.newContext({ viewport: { width, height }, locale: 'zh-CN' });
    try {
      const page = await context.newPage();
      const { state, unexpectedRequests } = await mountAcceptanceFixture(page);
      await page.goto(CHAT_BASE_URL, { waitUntil: 'domcontentloaded' });
      const sidebar = page.locator('.lens-shell__tools');
      const toggle = sidebar.locator('.workspace-sidebar-toggle');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(sidebar).toHaveCSS('width', /28[0-9]px|29[0-9]px|3[0-9]{2}px/);
      await expect(page.locator('#research-sidebar-content')).toBeVisible();
      await expect(page.locator('.academic-home .research-shortcuts__button')).toHaveCount(6);
      await expect(page.locator('#workspace-composer')).toBeInViewport();
      if (process.env.LENS_CAPTURE_DIR) await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-guest-rail-${width}.png` });
      await toggle.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(sidebar).toHaveCSS('width', '64px');
      await expect(page.locator('#research-sidebar-content')).toBeHidden();
      await toggle.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#research-sidebar-content')).toBeVisible();
      await expect(page.locator('dialog.academic-login')).toHaveCount(0);
      expect((await sidebar.boundingBox()).width).toBeGreaterThanOrEqual(280);
      const preview = page.locator('.lens-shell__featured .research-shortcuts__button');
      await expect(preview).toHaveCount(3);
      await expect(preview).toHaveText(['研究设计体检', '审稿意见应答', '文献检索策略']);
      await expect(sidebar.locator('.research-capabilities h2')).toHaveText('更多功能');
      const readSidebarPresentation = async loggedIn => sidebar.evaluate((root, loggedIn) => {
        const moreTitle = root.querySelector(loggedIn ? '.research-controls__title' : '.research-capabilities h2');
        const moreRows = root.querySelectorAll(loggedIn ? '.research-controls__option' : '.academic-home__capability');
        const moreText = moreRows[0].querySelector(loggedIn ? 'span' : 'strong');
        const featuredTitle = root.querySelector('.research-shortcuts__title');
        const featuredRows = root.querySelectorAll('.research-shortcuts__button');
        const rootX = root.getBoundingClientRect().left;
        const typography = el => {
          const style = getComputedStyle(el);
          return [style.fontSize, style.fontWeight, style.lineHeight, style.letterSpacing];
        };
        const row = el => {
          const style = getComputedStyle(el);
          return [style.padding, style.borderWidth, Math.round(el.getBoundingClientRect().height)];
        };
        const x = el => Math.round(el.getBoundingClientRect().left - rootX);
        const center = el => { const rect = el.getBoundingClientRect(); return rect.top + rect.height / 2; };
        return {
          headings: [typography(moreTitle), typography(featuredTitle)],
          labels: [typography(moreText), typography(featuredRows[0].querySelector('strong'))],
          rows: [row(moreRows[0]), row(featuredRows[0])],
          alignment: [x(moreTitle), x(moreText), x(featuredTitle), x(featuredRows[0].querySelector('strong'))],
          moreRhythm: [Math.round(center(moreRows[0]) - center(moreTitle)), Math.round(center(moreRows[1]) - center(moreRows[0]))],
          featuredColumns: getComputedStyle(featuredRows[0].parentElement).gridTemplateColumns,
        };
      }, loggedIn);
      const guestPresentation = await readSidebarPresentation(false);
      await expect(page.locator('.research-controls__disclosure')).toHaveCount(0);
      if (process.env.LENS_CAPTURE_DIR) {
        await page.locator('#research-start-title').click();
        await page.mouse.move(0, 0);
        await auditInterface(page, 'auth')
        await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-guest-featured-${width}.png` });
      }
      for (let index = 0; index < 3; index += 1) {
        const button = preview.nth(index);
        await expect(button).toBeInViewport();
        expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
        await button.click();
        const login = page.locator('dialog.academic-login');
        await expect(login).toBeVisible();
        expect(await button.evaluate(el => el.matches(':focus-visible'))).toBe(false);
        await page.keyboard.press('Escape');
        await expect(login).toHaveCount(0);
      }
      await expect(page.locator('.academic-home .research-shortcuts__button')).toHaveCount(6);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await loginAsSuper(page);
      await expect(sidebar).not.toHaveClass(/lens-shell__tools--collapsed/);
      await expect(toggle).toBeVisible();
      await expect(sidebar.locator('.research-controls__list')).toBeVisible();
      expect(await readSidebarPresentation(true)).toEqual(guestPresentation);
      if (process.env.LENS_CAPTURE_DIR) {
        await page.mouse.move(0, 0);
        await auditInterface(page, 'conversation')
        await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-sidebar-type-logged-${width}.png` });
      }
      expect(state.academicRequests).toEqual([]);
      expect(state.chatRequests).toEqual([]);
      expect(unexpectedRequests).toEqual([]);
    } finally { await context.close(); }
  }
});

test('隔离验收：游客不显示研究历史且权限选择器禁用', async ({ page }) => {
  const { unexpectedRequests } = await mountAcceptanceFixture(page, {
    initialLogs: evidenceFixtureLogs(),
  });
  await page.goto(CHAT_BASE_URL, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.academic-home')).toBeVisible();
  await expect(page.locator('.workspace-record')).toHaveCount(0);
  await expect(page.locator('.research-controls select, .research-controls__option')).toHaveCount(0);
  await expect(page.locator('.lens-shell__featured .research-shortcuts__button')).toHaveCount(3);
  expect(unexpectedRequests).toEqual([]);
});


test('Lens 默认研究会话只走 Academic 请求，不回退到 99AI 通用聊天页', async ({ page }) => {

  const state = (await mountAcceptanceFixture(page)).state;

  await loginAsSuper(page);

  await expect(page.getByText(/应用广场|应用市场/)).toHaveCount(0);
  await expect(page.locator('.academic-home')).toBeVisible();

  const input = page.locator('#workspace-composer');
  await input.fill('请概括这项研究的核心问题');
  await sendButton(page).click();

  await expect.poll(() => state.academicRequests.length).toBe(1);
  expect(state.chatRequests).toHaveLength(0);
  expect(state.academicRequests[0].function).toBe('chat');
  expect(state.academicRequests[0].main_input).toBe('请概括这项研究的核心问题');
});


test('Lens 研究结果可创建只读分享链接', async ({ page }) => {

  const state = (await mountAcceptanceFixture(page)).state;
  await loginAsSuper(page);

  const input = page.locator('#workspace-composer');
  await input.fill('请输出可分享的研究结论');
  await sendButton(page).click();
  await expect(page.getByText('已收到：请输出可分享的研究结论')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: /分享研究结果|Share research result/ }).click();
  await expect.poll(() => state.shareCreateRequests.length).toBe(1);
  expect(state.shareCreateRequests[0].htmlContent).toContain('<article>');
  expect(state.shareCreateRequests[0].htmlContent).toContain('已收到：请输出可分享的研究结论');
  expect(state.chatRequests).toHaveLength(0);
});

test('分享链接只显示只读成果，不挂载 Lens/99AI 聊天壳', async ({ page }) => {
  const state = await mountRegressionApi(page);

  await page.goto(`${CHAT_BASE_URL}/?shareCode=Abc12345`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/只读研究成果|Read-only research result/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/此页面仅供阅读|This page is read-only/)).toBeVisible();
  await expect(page.locator('.academic-home')).toHaveCount(0);
  await expect(page.locator('#workspace-composer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /编辑|删除|重新生成|Edit|Delete|Regenerate/ })).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect(page.locator('iframe').first()).toHaveAttribute('sandbox', 'allow-same-origin');

  const sharedFrame = page.frameLocator('iframe').first();
  await expect(sharedFrame.locator('h2')).toHaveText('只读研究成果');
  expect(state.shareRequests).toEqual(['Abc12345']);
  expect(state.academicRequests).toHaveLength(0);
  expect(state.chatRequests).toHaveLength(0);
});

test('非法分享链接停留在只读错误态，不回退到聊天首页或发起请求', async ({ page }) => {
  const state = await mountRegressionApi(page);

  await page.goto(`${CHAT_BASE_URL}/?shareCode=bad`, { waitUntil: 'domcontentloaded' });

  await expect(page.getByText(/分享链接格式无效|The share link is invalid/)).toBeVisible({ timeout: 10000 });
  await expect(page.locator('.academic-home')).toHaveCount(0);
  await expect(page.locator('#workspace-composer')).toHaveCount(0);
  expect(state.shareRequests).toHaveLength(0);
  expect(state.academicRequests).toHaveLength(0);
  expect(state.chatRequests).toHaveLength(0);
});

test('隔离验收：编辑取消、保存截断与刷新在多端明暗模式一致', async ({ browser }) => {
  for (const [width, height, dark] of [[1440, 900, false], [1280, 600, true], [390, 844, false], [320, 740, true]]) {
    const context = await browser.newContext({ viewport: { width, height } });
    try {
      const page = await context.newPage();
      const { state, unexpectedRequests } = await mountAcceptanceFixture(page, {
        initialLogs: [
          buildChatLog({ chatId: 1001, role: 'user', content: '首条用户消息' }),
          buildChatLog({ chatId: 1002, role: 'assistant', content: '首条回复' }),
          buildChatLog({ chatId: 1003, role: 'user', content: '后续用户消息' }),
          buildChatLog({ chatId: 1004, role: 'assistant', content: '后续助手回复' }),
        ],
      });
      await loginAsSuper(page);
      if (dark) await page.locator('.research-theme-button').click();
      await expect(page.getByText('后续助手回复')).toBeVisible();
      await page.getByRole('button', { name: /编辑|Edit/ }).first().click();
      const editor = page.locator('.workspace-record__editor');
      await editor.locator('textarea').fill('取消的修改');
      for (const button of await editor.getByRole('button').all()) {
        const box = await button.boundingBox();
        const surface = await button.locator('span').boundingBox();
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(surface.height).toBeLessThanOrEqual(36);
        expect(box.x + box.width).toBeLessThanOrEqual(width);
      }
      const cancel = editor.getByRole('button', { name: /取消|Cancel/ });
      await cancel.focus();
      await page.keyboard.press('Tab');
      await page.keyboard.press('Shift+Tab');
      await expect(cancel).toBeFocused();
      expect(await cancel.evaluate(el => el.matches(':focus-visible'))).toBe(true);
      if (process.env.LENS_CAPTURE_DIR) {
        await auditInterface(page, 'composer')
        await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-edit-${width}-${dark ? 'dark' : 'light'}.png` });
      }
      await auditInterface(page, 'composer')
      if (process.env.LENS_CAPTURE_DIR) {
        await page.screenshot({ path: require('node:path').join(process.env.LENS_CAPTURE_DIR, 'lens-full-audit-edit-active.png') })
      }
      await cancel.click();
      await expect(editor).toHaveCount(0);
      await expect(page.getByText('首条用户消息', { exact: true })).toBeVisible();
      await expect(page.getByText('后续助手回复')).toBeVisible();
      expect(state.academicRequests).toHaveLength(0);

      await page.getByRole('button', { name: /编辑|Edit/ }).first().click();
      await editor.locator('textarea').fill('编辑后的首条用户消息');
      await editor.getByRole('button', { name: /保存修改|Save|Update/ }).click();
      await expect(page.getByText('编辑后的首条回复')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('后续用户消息')).toHaveCount(0);
      await expect(page.getByText('后续助手回复')).toHaveCount(0);
      await page.getByRole('button', { name: /重新生成|Regenerate/ }).first().click();
      await expect.poll(() => state.academicRequests.length).toBe(2);
      await expect(page.locator('.workspace-record--assistant')).toBeVisible();
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByText('编辑后的首条用户消息')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('编辑后的首条回复')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('后续用户消息')).toHaveCount(0);
      await expect(page.getByText('后续助手回复')).toHaveCount(0);
      for (const request of state.academicRequests) {
        expect(request.overwriteReply).toBe(true);
        expect(Number(request.chatId)).toBe(1001);
        expect(Number(request.replyChatId)).toBe(1002);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      await page.locator('.research-theme-button').click();
      await expect(page.locator('.account-divider')).toHaveCount(0);
      expect(unexpectedRequests).toEqual([]);
      await auditInterface(page, 'conversation')
      if (process.env.LENS_CAPTURE_DIR) {
        await page.screenshot({ path: require('node:path').join(process.env.LENS_CAPTURE_DIR, 'lens-full-audit-conversation-flow.png') })
        if (process.env.LENS_UI_AUDIT === '1') {
          const originalViewport = page.viewportSize()
          await page.setViewportSize({ width: 1440, height: 900 })
          await auditInterface(page, 'conversation')
          await page.screenshot({ path: require('node:path').join(process.env.LENS_CAPTURE_DIR, 'lens-full-audit-conversation-desktop.png') })
          await page.setViewportSize(originalViewport)
        }
      }
    } finally {
      await context.close();
    }
  }
});


test('学术润色保留总段落且刷新后表格稳定，重新生成走覆盖链路', async ({ page }) => {

  const state = (await mountAcceptanceFixture(page, {
    initialLogs: [
      buildChatLog({ chatId: 2001, role: 'user', content: '已有学术提问' }),
      buildChatLog({
        chatId: 2002,
        role: 'assistant',
        content: '已有学术回答',
      }),
    ],
  })).state;

  await loginAsSuper(page);

  const researchTools = await openResearchControls(page);
  const polishOption = researchTools.locator('[data-capability="core:中文润色"]')
  await expect(polishOption).toBeVisible()
  await polishOption.click()
  await expect(polishOption).toHaveAttribute('aria-pressed', 'true')
  await closeResearchControls(page, researchTools);

  const input = page.locator('#workspace-composer');
  await input.fill('请用中文润色下面这段说明文字');
  await sendButton(page).click();

  await expect(
    page.getByText('以下为润色后的总段落：我会先给出完整润色版本，然后用三列表格说明修改原因。'),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('列名必须严格为：修改前原文片段')).toHaveCount(0);
  await expect(page.getByText('第三列只解释这一处修改')).toHaveCount(0);

  const liveTable = page.locator('.markdown-body table').last();
  await expect(liveTable).toBeVisible();
  await expect(liveTable.locator('thead th')).toHaveCount(3);
  const liveRows = await liveTable.locator('tbody tr').count();
  expect(liveRows).toBeGreaterThan(10);
  expect(await liveTable.locator('tbody tr').first().locator('td').count()).toBe(3);
  await expect(liveTable.locator('tbody tr').first().locator('td').nth(2)).not.toContainText(
    '拼写、语法、清晰、简洁和整体可读性',
  );
  await expect(liveTable.locator('tbody tr').nth(1).locator('td').nth(2)).not.toContainText(
    '同时必须用中文分解长句',
  );
  await expect(liveTable.locator('tbody tr').nth(2).locator('td').nth(2)).not.toContainText(
    '我的能力包括：',
  );
  await expect(liveTable.locator('tbody tr').nth(5).locator('td').nth(2)).not.toContainText(
    '编程帮助、代码调试与思路梳理',
  );
  await expect(liveTable.locator('tbody tr').nth(8).locator('td').nth(2)).not.toContainText(
    '使用方式很简单：',
  );
  await expect(liveTable.locator('tbody tr').nth(10).locator('td').nth(2)).not.toContainText(
    '我会给出对应的回答或处理结果',
  );
  await expect(liveTable.locator('tbody tr').nth(13).locator('td').nth(2)).not.toContainText(
    '我不能直接访问你的本地文件',
  );
  await expect(
    liveTable
      .locator('tbody tr', {
        has: page.locator('td', { hasText: '我的服务能力包括：' }),
      })
      .locator('td')
      .nth(2),
  ).not.toContainText('回答问题、解释概念、提供学习与研究辅导');

  expect(state.academicRequests).toHaveLength(1);
  expect(Boolean(state.academicRequests[0].overwriteReply)).toBe(false);
  expect(Number(state.academicRequests[0].replyChatId || 0)).toBe(0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  await expect(
    page.getByText('以下为润色后的总段落：我会先给出完整润色版本，然后用三列表格说明修改原因。'),
  ).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('列名必须严格为：修改前原文片段')).toHaveCount(0);
  await expect(page.getByText('第三列只解释这一处修改')).toHaveCount(0);

  const persistedTable = page.locator('.markdown-body table').last();
  await expect(persistedTable.locator('thead th')).toHaveCount(3);
  const persistedRows = await persistedTable.locator('tbody tr').count();
  expect(persistedRows).toBeGreaterThan(10);
  expect(await persistedTable.locator('tbody tr').first().locator('td').count()).toBe(3);
  await expect(persistedTable.locator('tbody tr').first().locator('td').nth(2)).not.toContainText(
    '拼写、语法、清晰、简洁和整体可读性',
  );
  await expect(persistedTable.locator('tbody tr').nth(1).locator('td').nth(2)).not.toContainText(
    '同时必须用中文分解长句',
  );
  await expect(persistedTable.locator('tbody tr').nth(2).locator('td').nth(2)).not.toContainText(
    '我的能力包括：',
  );
  await expect(persistedTable.locator('tbody tr').nth(5).locator('td').nth(2)).not.toContainText(
    '编程帮助、代码调试与思路梳理',
  );
  await expect(persistedTable.locator('tbody tr').nth(8).locator('td').nth(2)).not.toContainText(
    '使用方式很简单：',
  );
  await expect(persistedTable.locator('tbody tr').nth(10).locator('td').nth(2)).not.toContainText(
    '我会给出对应的回答或处理结果',
  );
  await expect(persistedTable.locator('tbody tr').nth(13).locator('td').nth(2)).not.toContainText(
    '我不能直接访问你的本地文件',
  );
  await expect(
    persistedTable
      .locator('tbody tr', {
        has: page.locator('td', { hasText: '我的服务能力包括：' }),
      })
      .locator('td')
      .nth(2),
  ).not.toContainText('回答问题、解释概念、提供学习与研究辅导');

  const reopenedResearchTools = await openResearchControls(page);
  await reopenedResearchTools.locator('[data-capability="core:中文润色"]').click()
  await closeResearchControls(page, reopenedResearchTools);
  await page.getByRole('button', { name: /重新生成|Regenerate/ }).last().click();
  await expect(
    page.getByText('以下为润色后的总段落：我会先给出完整润色版本，然后用三列表格说明修改原因。'),
  ).toBeVisible({ timeout: 10000 });

  expect(state.academicRequests).toHaveLength(2);
  expect(Boolean(state.academicRequests[1].overwriteReply)).toBe(true);
  expect(state.academicRequests[1].chatId).toBeGreaterThan(0);
  expect(state.academicRequests[1].replyChatId).toBeGreaterThan(0);
});


test('上传论文后随学术请求提交，资料不会停留在界面状态', async ({ page }) => {

  const state = (await mountAcceptanceFixture(page, { initialLogs: [] })).state;
  await loginAsSuper(page);

  await page.locator('.research-shortcuts--compact:visible').getByRole('button', { name: /Literature review|\u6587\u732e\u7efc\u8ff0/ }).click();

  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles({
    name: 'paper.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 academic regression fixture'),
  });
  await expect(page.getByText('paper.pdf')).toBeVisible({ timeout: 10000 });

  const input = page.locator('#workspace-composer');
  await input.fill('请总结这篇论文的研究问题与主要结论');
  await sendButton(page).click();

  await expect(page.getByText('已收到：请总结这篇论文的研究问题与主要结论')).toBeVisible({
    timeout: 10000,
  });
  expect(state.academicRequests).toHaveLength(1);
  const submittedFiles = JSON.parse(String(state.academicRequests[0].fileUrl || '[]'));
  expect(submittedFiles).toEqual([
    {
      name: 'paper.pdf',
      url: '/file/userFiles/209912/31/paper.pdf',
      type: 'document',
    },
  ]);
});


test('老师和学生的比较、研究笔记与教学材料入口走 Academic 对话链路', async ({ page }) => {

  const state = (await mountAcceptanceFixture(page, { initialLogs: [] })).state;
  await loginAsSuper(page);

  const input = page.locator('#workspace-composer');
  await expect(page.locator('.research-shortcuts--compact:visible').getByRole('button', { name: /比较多篇论文|Compare papers/ })).toBeVisible();
  await expect(page.locator('.research-shortcuts--compact:visible').getByRole('button', { name: /整理研究笔记|Organize research notes/ })).toBeVisible();
  await expect(page.locator('.research-shortcuts--compact:visible').getByRole('button', { name: /生成教学材料|Create teaching material/ })).toBeVisible();

  await page.locator('.research-shortcuts--compact:visible').getByRole('button', { name: /比较多篇论文|Compare papers/ }).click();
  await expect(input).toHaveValue(/比较当前资料中的多篇论文|Compare the papers/);
  await page.locator('.research-shortcuts--compact:visible').getByRole('button', { name: /整理研究笔记|Organize research notes/ }).click();
  await expect(input).toHaveValue(/结构化研究笔记|structured research notes/);
  await page.locator('.research-shortcuts--compact:visible').getByRole('button', { name: /生成教学材料|Create teaching material/ }).click();
  await expect(input).toHaveValue(/生成教学材料|Create teaching material/);

  await sendButton(page).click();
  await expect.poll(() => state.academicRequests.length).toBe(1);
  expect(state.academicRequests).toHaveLength(1);
  expect(state.academicRequests[0].function).toBe('chat');
  expect(state.academicRequests[0].appId).toBe(0);
  expect(String(state.academicRequests[0].main_input || '')).toMatch(/生成教学材料|Create teaching material/);
  await expect(page.locator('.workspace-record--assistant').last()).toBeVisible({ timeout: 10000 });
});


test('论文与 LaTeX 插件通过更多功能选择并保持 Academic 请求绑定', async ({ page }) => {
  const state = (await mountAcceptanceFixture(page, {
    initialLogs: [],
    member: true,
    plugins: [
      {
        name: 'PDF批量总结',
        group: '学术',
        description: '批量阅读 PDF 论文',
      },
      {
        name: 'LaTeX精准翻译',
        group: '学术',
        description: '翻译 LaTeX 文稿',
      },
    ],
  })).state;
  await loginAsSuper(page)
  const controls = await openResearchControls(page)
  const paper = controls.getByRole('button', { name: /PDF.*(?:深度理解|批量总结|Summary)/i })
  const latex = controls.locator('[data-capability^="plugin:LaTeX"]')
  await expect(paper).toBeVisible()
  await paper.click()
  await expect(paper).toHaveAttribute('aria-pressed', 'true')
  await latex.click()
  await expect(latex).toHaveAttribute('aria-pressed', 'true')
  await expect(paper).toHaveAttribute('aria-pressed', 'false')
  await paper.click()
  await expect(paper).toHaveAttribute('aria-pressed', 'true')
  await page.locator('#workspace-composer').fill('Summarize this synthetic paper and identify its methods and limitations.')
  await sendButton(page).click()
  await expect.poll(() => state.academicRequests.length).toBe(1)
  expect(state.academicRequests).toHaveLength(1)
  expect(state.academicRequests[0].function).toBe('plugin')
  expect(state.academicRequests[0].plugin_name).toBe('PDF批量总结')
  await expect(page.locator('.workspace-record--assistant').last()).toBeVisible()
});


test('会员研究计划复用 Academic 对话链路且不暴露旧能力编排', async ({ page }) => {
  const state = (await mountAcceptanceFixture(page, { member: true, initialLogs: [] })).state
  await loginAsSuper(page)
  const controls = await openResearchControls(page)
  await expect(controls.locator('.research-controls__workflow-card')).toHaveCount(0)
  const planner = page.locator('.research-shortcuts--compact:visible').getByRole('button', { name: /研究方案设计|Research plan/i })
  await expect(planner).toBeVisible()
  await planner.click()
  const input = page.locator('#workspace-composer')
  await expect(input).not.toHaveValue('')
  const draft = await input.inputValue()
  await sendButton(page).click()
  await expect.poll(() => state.academicRequests.length).toBe(1)
  expect(state.academicRequests[0].function).toBe('chat')
  expect(state.academicRequests[0].appId).toBe(0)
  expect(String(state.academicRequests[0].main_input || '')).toContain(draft)
  expect(state.workflowRequests).toHaveLength(0)
  await expect(page.locator('.workspace-record--assistant').last()).toBeVisible()
});

test('长研究会话窗口化并保持输入可交互', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(String(error?.message || error)));

  const initialLogs = Array.from({ length: 1000 }, (_, index) =>
    buildChatLog({
      chatId: 10000 + index,
      role: index % 2 === 0 ? 'user' : 'assistant',
      content: `长研究会话第 ${index + 1} 条记录`,
    }),
  );


  (await mountAcceptanceFixture(page, { initialLogs })).state;
  await loginAsSuper(page);

  const scroller = page.locator('#scrollRef');
  const input = page.locator('#workspace-composer');
  await expect(scroller).toBeVisible();
  await expect(input).toBeVisible();

  const collectMetrics = () =>
    page.evaluate(() => ({
      renderedRecords: document.querySelectorAll('.workspace-record').length,
      totalDomNodes: document.querySelectorAll('*').length,
      scrollHeight: document.querySelector('#scrollRef')?.scrollHeight || 0,
    }));

  const firstMetrics = await collectMetrics();
  expect(firstMetrics.renderedRecords).toBeLessThan(180);
  expect(firstMetrics.totalDomNodes).toBeLessThan(2600);
  expect(firstMetrics.scrollHeight).toBeGreaterThan(0);

  for (let pageIndex = 0; pageIndex < 4; pageIndex += 1) {
    await scroller.evaluate(node => {
      node.scrollTop = 0;
      node.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await page.waitForTimeout(500);
  }

  const loadedMetrics = await collectMetrics();
  expect(loadedMetrics.renderedRecords).toBeLessThan(240);
  expect(loadedMetrics.totalDomNodes).toBeLessThan(3600);
  await input.click();
  await input.fill('继续总结这组长研究会话的共同结论');
  expect(pageErrors).toEqual([]);
});

test('隔离验收：重设计的登录、研究记录、账户与嵌套确认可用', async ({ browser }) => {
  for (const [width, height, dark] of [[1440, 900, false], [390, 844, false], [320, 740, true]]) {
    const context = await browser.newContext({ viewport: { width, height }, locale: 'zh-CN' });
    try {
      const page = await context.newPage();
      let runtimeErrors = 0;
      let missingIcons = 0;
      page.on('pageerror', () => { runtimeErrors += 1; });
      page.on('console', entry => { if (entry.type() === 'warning' && entry.text().startsWith('[SvgIcon]')) missingIcons += 1; });
      const { unexpectedRequests } = await mountAcceptanceFixture(page, {
        member: true, initialLogs: evidenceFixtureLogs(),
      });
      await page.goto(CHAT_BASE_URL, { waitUntil: 'domcontentloaded' });
      if (dark) await page.locator('.research-theme-button').click();
      const account = page.locator('.workspace-account-button');
      await account.click();
      const login = page.locator('dialog.academic-login');
      await expect(login).toBeVisible();
      expect(await login.evaluate(el => el.matches(':modal'))).toBe(true);
      await expect(login.locator('input').first()).toBeVisible();
      await page.keyboard.press('Tab');
      expect(await login.evaluate(el => el.contains(document.activeElement))).toBe(true);
      if (process.env.LENS_CAPTURE_DIR) {
        await auditInterface(page, 'auth')
        await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-audit-login-${width}.png` });
      }
      await login.locator('.login-switch').click();
      await login.locator('#contact').fill('fixture@example.invalid');
      await login.locator('.btn-captcha').click();
      const captcha = page.locator('dialog.vue-puzzle-vcode');
      await expect(captcha).toBeVisible();
      expect(await captcha.evaluate(el => el.matches(':modal'))).toBe(true);
      const puzzleBounds = await captcha.locator('.vue-auth-box_').boundingBox();
      expect(puzzleBounds.x).toBeGreaterThanOrEqual(0);
      expect(puzzleBounds.x + puzzleBounds.width).toBeLessThanOrEqual(width);
      const slider = captcha.getByRole('slider');
      await expect.poll(() => captcha.locator('.loading-box_').evaluate(el => el.classList.contains('hide_'))).toBe(true);
      await slider.focus();
      const originalPosition = Number(await slider.getAttribute('aria-valuenow'));
      await slider.press('ArrowRight');
      await expect(slider).toHaveAttribute('aria-valuenow', String(originalPosition + 1));
      await page.keyboard.press('Escape');
      await expect(captcha).toBeHidden();
      await expect(login).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(login).toHaveCount(0);
      await expect(account).toBeFocused();
      await loginAsSuper(page);
      await expect(page.getByText(/账户登录成功|Account login successful/)).toBeHidden();
      await page.locator('.workspace-projects-button').click();
      const records = page.locator('dialog').filter({ has: page.locator('.research-projects') });
      await expect(records).toBeVisible();
      await expect(records.locator('.project-list__more').first()).toHaveAttribute('aria-label', /更多|More/);
      for (const button of await records.locator('button').all()) {
        if (await button.isVisible()) expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
      const recordSearchButton = records.locator('.research-projects__actions button').first();
      await recordSearchButton.click();
      const recordSearch = records.locator('.research-projects__search');
      await expect(recordSearch).toBeFocused();
      await recordSearch.fill('Synthetic no matching record');
      await expect(records.locator('.project-list__item')).toHaveCount(0);
      const recordSearchField = records.locator('.research-search-field');
      await expect(recordSearchField.locator('.research-search-field__icon')).toBeVisible();
      await expect(recordSearch).toHaveCSS('box-shadow', 'none');
      await expect(recordSearch).toHaveCSS('border-top-width', '0px');
      if (process.env.LENS_CAPTURE_DIR) {
        await auditInterface(page, 'records')
        await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-search-records-${width}.png` });
      }
      await recordSearchField.locator('.research-search-field__clear').click();
      await expect(recordSearch).toHaveValue('');
      await expect(recordSearch).toBeFocused();
      await expect(records.locator('.project-list__item')).not.toHaveCount(0);
      await recordSearch.press('Escape');
      await expect(recordSearch).toHaveCount(0);
      await expect(records).toBeVisible();
      await expect(recordSearchButton).toBeFocused();
      const more = records.locator('.project-list__more').first();
      await more.click();
      await expect(more).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('Escape');
      await expect(more).toHaveAttribute('aria-expanded', 'false');
      await expect(records).toBeVisible();
      await more.click();
      await records.getByRole('button', { name: /^重命名$|^Rename$/ }).first().click();
      const recordTitle = records.locator('.project-list__item input').first();
      await expect(recordTitle).toBeFocused();
      await recordTitle.fill('Synthetic renamed record');
      await recordTitle.press('Enter');
      await expect(records).toContainText('Synthetic renamed record');
      if (process.env.LENS_CAPTURE_DIR) {
        await auditInterface(page, 'settings')
        await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-audit-records-${width}.png` });
      }
      await page.keyboard.press('Escape');
      await expect(records).toHaveCount(0);
      await expect(page.locator('.workspace-projects-button')).toBeFocused();
      await account.click();
      const settings = page.locator('dialog.lens-settings');
      await expect(settings).toBeVisible();
      await expect(settings).toHaveCSS('opacity', '1');
      await expect(settings.locator('.lens-settings__content')).not.toBeEmpty();
      await expect(settings.locator('.research-account')).toBeVisible();
      for (const section of await settings.locator('.research-account__section').all()) {
        await expect(section).toHaveCSS('border-top-width', '0px');
        await expect(section).toHaveCSS('border-bottom-width', '0px');
      }
      const sectionGap = await settings.locator('.research-account__overview').evaluate(el => parseFloat(getComputedStyle(el).rowGap));
      expect(sectionGap).toBeGreaterThanOrEqual(24);
      const bounds = await settings.locator('.lens-settings__shell').boundingBox();
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
      if (process.env.LENS_CAPTURE_DIR) {
        await auditInterface(page, 'settings')
        await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-audit-settings-${width}.png` });
      }
      await settings.locator('.research-account__section').last().getByRole('button', { name: /^修改$|^Change$/ }).click();
      await expect(settings.locator('#new-password')).toBeVisible();
      const accountBack = settings.getByRole('button', { name: /^返回$|^Back$/ });
      await expect(accountBack.locator('..')).toHaveCSS('border-bottom-width', '0px');
      if (process.env.LENS_CAPTURE_DIR) await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-account-password-${width}.png` });
      await accountBack.click();
      await expect(settings.locator('.research-account__overview')).toBeVisible();
      if (width >= 1024) {
        await settings.locator('.lens-settings__logout').click();
        const confirm = page.locator('dialog.research-confirm');
        await expect(confirm).toBeVisible();
        expect(await confirm.evaluate(el => el.matches(':modal'))).toBe(true);
        await page.keyboard.press('Escape');
        await expect(confirm).toHaveCount(0);
        await expect(settings).toBeVisible();
      }
      await page.keyboard.press('Escape');
      await expect(settings).toHaveCount(0);
      await expect(account).toBeFocused();
      expect(unexpectedRequests).toEqual([]);
      expect(runtimeErrors).toBe(0);
      expect(missingIcons).toBe(0);
    } finally { await context.close(); }
  }
});

test('隔离验收：手机验证码倒计时结束后可重试且不改认证合同', async ({ page }) => {
  const copy = require('../../chat/src/locales/zh-CN.json');
  const { unexpectedRequests } = await mountAcceptanceFixture(page, {
    member: true, globalConfig: { phoneLoginStatus: 1 },
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsSuper(page);
  await page.locator('.language-selector-trigger').click();
  await page.getByRole('menuitemradio').nth(0).click();
  await page.clock.install();
  await page.locator('.workspace-account-button').click();
  const account = page.locator('.research-account');
  await account.getByRole('button', { name: '绑定', exact: true }).click();
  await account.getByRole('textbox', { name: copy.lens.account.phone, exact: true }).fill('13000000000');
  const sendCode = account.getByRole('button', { name: copy.login.sendVerificationCode, exact: true });
  await sendCode.click();
  const countdown = account.getByRole('button', { name: /^\d+秒$/ });
  await expect(countdown).toBeDisabled();
  await page.clock.runFor(61000);
  await expect(sendCode).toBeEnabled();
  await page.keyboard.press('Escape');
  expect(unexpectedRequests).toEqual([]);
});

test('隔离验收：统一悬停焦点、协议对齐与手机模型能力分工', async ({ browser }) => {
  for (const [width, height, dark] of [[1440, 900, false], [1280, 600, true], [390, 844, false], [320, 740, true]]) {
    const context = await browser.newContext({ viewport: { width, height }, locale: 'zh-CN' });
    try {
      const page = await context.newPage();
      const { state, unexpectedRequests } = await mountAcceptanceFixture(page, { member: true });
      await page.goto(CHAT_BASE_URL, { waitUntil: 'domcontentloaded' });
      const theme = page.locator('.research-theme-button');
      if (dark) await theme.click();
      await theme.hover();
      const themeBorder = await theme.evaluate(el => getComputedStyle(el).borderTopColor);
      expect(themeBorder).toBe('rgba(0, 0, 0, 0)');
      const language = page.locator('.language-selector-trigger');
      await language.click();
      const languageMenu = page.locator('.research-language-menu');
      await expect(languageMenu).toBeVisible();
      await expect(languageMenu.locator('..')).toHaveCSS('opacity', '1');
      if (process.env.LENS_CAPTURE_DIR) await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-language-${width}.png` });
      const menuBox = await languageMenu.boundingBox();
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(width);
      await page.getByRole('menuitemradio').first().click();
      if (width >= 1024) await page.locator('.workspace-sidebar-toggle').click();
      const homeAction = width >= 1024 ? page.locator('.research-controls__preview .research-shortcuts__button').first() : page.locator('.research-composer__capability');
      if (width >= 1024) {
        await expect(page.locator('.research-controls h3')).toHaveText(/特色功能/);
        await expect(page.locator('.research-controls__preview .research-shortcuts__button')).toHaveCount(3);
        const records = await page.locator('.workspace-projects-button').boundingBox();
        expect(records.width).toBeLessThan(180);
      }
      await homeAction.click();
      const login = page.locator('dialog.academic-login');
      await expect(login).toBeVisible();
      expect(await homeAction.evaluate(el => el.matches(':focus-visible'))).toBe(false);
      const checkbox = await login.locator('.lens-checkbox').boundingBox();
      const policy = await login.locator('.login-policy-copy').boundingBox();
      expect(Math.abs(checkbox.y + checkbox.height / 2 - policy.y - policy.height / 2)).toBeLessThan(2);
      const accountInput = login.locator('#username');
      await accountInput.click();
      // Wait for the border-color transition; its initial frame retains the neutral border.
      await expect.poll(async () => {
        const focusColor = await accountInput.evaluate(el => getComputedStyle(el).borderTopColor);
        const channels = focusColor.match(/\d+/g).map(Number);
        return channels[1] > channels[0] && channels[1] > channels[2];
      }).toBe(true);
      await expect(accountInput).toHaveCSS('box-shadow', 'none');
      await expect(accountInput).toHaveCSS('outline-style', 'none');
      await expect(accountInput).toHaveCSS('border-top-width', '1px');
      const links = await login.locator('.login-policy-link').all();
      const linksGeometry = await Promise.all(links.map(link => link.boundingBox()));
      expect(Math.abs(linksGeometry[0].y - linksGeometry[1].y)).toBeLessThanOrEqual(1);
      const loginClose = login.locator('.academic-login-close');
      await loginClose.hover();
      await expect(loginClose).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
      await expect(loginClose).toHaveCSS('box-shadow', 'none');
      await accountInput.focus();
      if (process.env.LENS_CAPTURE_DIR) await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-focused-login-${width}.png` });
      await page.keyboard.press('Escape');
      await loginAsSuper(page);
      await expect(page.getByText(/账户登录成功|Account login successful/)).toBeHidden();
      const input = page.locator('#workspace-composer');
      if (width < 640) {
        const model = page.locator('.workspace-navigation__model .research-chip-button');
        await expect(page.locator('.research-composer__frame button[aria-haspopup="menu"]')).toHaveCount(0);
        await expect(page.locator('.workspace-navigation__model')).toBeVisible();
        const modelBox = await model.boundingBox();
        const headerBox = await page.locator('header.workspace-navigation--mobile').boundingBox();
      const headerSurfaceMatches = await page.locator('header.workspace-navigation--mobile').evaluate((element) => {
        const reference = document.createElement('span');
        reference.style.backgroundColor = 'var(--surface-panel)';
        element.append(reference);
        const matches = getComputedStyle(element).backgroundColor === getComputedStyle(reference).backgroundColor;
        reference.remove();
        return matches;
      });
      expect(headerSurfaceMatches).toBeTruthy();
        expect(modelBox.y + modelBox.height).toBeLessThanOrEqual(headerBox.y + headerBox.height);
        const inputBox = await input.boundingBox();
        const capability = page.locator('.research-composer__capability');
        const capabilityBox = await capability.boundingBox();
        expect(modelBox.y + modelBox.height).toBeLessThanOrEqual(inputBox.y);
        expect(capabilityBox.y).toBeGreaterThanOrEqual(inputBox.y + inputBox.height);
        await model.click();
        const modelMenu = page.locator('.research-model-menu');
        await expect(modelMenu).toBeVisible();
        await expect(modelMenu.locator('..')).toHaveCSS('opacity', '1');
        if (process.env.LENS_CAPTURE_DIR) await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-model-menu-${width}.png` });
        const modelMenuBox = await modelMenu.boundingBox();
        expect(modelMenuBox.x).toBeGreaterThanOrEqual(0);
        expect(modelMenuBox.x + modelMenuBox.width).toBeLessThanOrEqual(width);
      expect(modelMenuBox.width).toBeLessThanOrEqual(240);
      if (process.env.LENS_CAPTURE_DIR) {
        await page.screenshot({ path: path.join(process.env.LENS_CAPTURE_DIR, `lens-final-model-menu-${width}.png`), fullPage: false });
      }
        await modelMenu.getByRole('menuitem').first().press('Enter');
        await expect(model).toHaveAttribute('aria-expanded', 'false');
        await capability.click();
        const tools = page.locator('dialog').filter({ has: page.locator('.research-controls') });
        await expect(tools).toBeVisible();
        await tools.locator('[data-capability="core:中文润色"]').click();
        await closeResearchControls(page, tools);
        await expect(capability).toContainText(/中文润色/);
      }
      if (width < 640) {
        expect(await input.evaluate(el => el.clientHeight)).toBeGreaterThanOrEqual(64);
        if (process.env.LENS_CAPTURE_DIR) await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-mobile-composer-${width}.png` });
      }
      await input.fill('请检查统一界面链路');
      await sendButton(page).click();
      await expect.poll(() => state.academicRequests.length).toBe(1);
      expect(state.chatRequests).toHaveLength(0);
      const more = page.locator(width < 640 ? '.research-composer__capability' : '.lens-shell__tools .research-controls h3');
      if (width >= 1024) await expect(more).toHaveText(/更多功能/);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
      expect(unexpectedRequests).toEqual([]);
    } finally { await context.close(); }
  }
});

test('隔离验收：五语言手机账户、会员与付款展示保留请求合同', async ({ browser }) => {
  for (const [index, locale] of [[0, 'zh-CN'], [1, 'zh-TW'], [2, 'en-US'], [3, 'ja-JP'], [4, 'ko-KR']]) {
    const copy = require(`../../chat/src/locales/${locale}.json`).lens;
    const context = await browser.newContext({ viewport: { width: 320, height: 740 }, locale: 'zh-CN' });
    try {
      const page = await context.newPage();
      let runtimeErrors = 0;
      page.on('pageerror', () => { runtimeErrors += 1; });
      const { state, unexpectedRequests } = await mountAcceptanceFixture(page, {
        member: true,
        globalConfig: { payWechatStatus: 1 },
        packages: [{ id: 1, name: 'Plus', price: 100, usdPrice: 10, days: 30, model3Count: 100, model4Count: 100, drawMjCount: 0 }],
      });
      await loginAsSuper(page);
      await page.locator('.language-selector-trigger').click();
      await page.getByRole('menuitemradio').nth(index).click();
      await page.locator('.workspace-account-button').click();
      const settings = page.locator('dialog.lens-settings');
      const account = settings.locator('.research-account');
      await expect(account).toContainText(copy.account.personalInfo);
      await account.getByRole('button', { name: copy.account.change, exact: true }).click();
      await account.locator('#new-password').fill('short');
      await account.locator('#confirm-password').fill('short');
      await account.locator('button[type="submit"]').click();
      await expect(account).toContainText(copy.account.passwordLength);
      await account.getByRole('button', { name: copy.account.back, exact: true }).click();
      await settings.locator('.lens-settings__nav nav button').nth(1).click();
      const member = settings.locator('.research-member');
      await expect(member).toContainText(copy.member.planList);
      await member.getByRole('button', { name: copy.member.annual, exact: false }).click();
      await member.getByRole('button', { name: copy.member.openNow, exact: true }).first().click();
      const payment = settings.locator('.research-payment');
      await expect(payment).toBeVisible();
      await expect(payment).toContainText(copy.payment.annual);
      await expect.poll(() => state.orderRequests.length).toBe(1);
      expect(state.orderRequests[0]).toEqual({ goodsId: 1, payType: 'native', billingCycle: 'annual' });
      const overflowing = await payment.evaluate(el => Array.from(el.querySelectorAll('*')).filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.width && rect.height && (rect.left < -1 || rect.right > innerWidth + 1);
      }).length);
      expect(overflowing).toBe(0);
      if (process.env.LENS_CAPTURE_DIR && locale === 'en-US') {
        await auditInterface(page, 'settings')
        await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-audit-payment-320.png` });
      }
      await payment.getByRole('button', { name: copy.account.back, exact: true }).click();
      await expect(member).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(settings).toHaveCount(0);
      expect(unexpectedRequests).toEqual([]);
      expect(runtimeErrors).toBe(0);
    } finally { await context.close(); }
  }
});

test('隔离验收：套餐加载失败可重试，空套餐显示明确状态', async ({ page }) => {
  const { unexpectedRequests } = await mountAcceptanceFixture(page, { member: true, packageFailures: 1 });
  await loginAsSuper(page);
  await page.locator('.language-selector-trigger').click();
  await page.getByRole('menuitemradio').nth(0).click();
  await page.locator('.workspace-account-button').click();
  await page.locator('.lens-settings__nav nav button').nth(1).click();
  const state = page.locator('.member-plan-state');
  await expect(state).toContainText('暂时无法加载套餐，请重试');
  await state.getByRole('button', { name: '重试', exact: true }).click();
  await expect(state).toContainText('当前没有可购买套餐');
  await expect(state).toHaveAttribute('aria-busy', 'false');
  await page.keyboard.press('Escape');
  expect(unexpectedRequests).toEqual([]);
});


test('隔离验收：特色任务、分类搜索、无图标侧栏与桌面轻控件', async ({ browser }) => {
  for (const [width, height, dark] of [[1440, 900, false], [1280, 600, true], [390, 844, false]]) {
    const context = await browser.newContext({ viewport: { width, height }, locale: 'zh-CN' });
    try {
      const page = await context.newPage();
      const { state, unexpectedRequests } = await mountAcceptanceFixture(page, {
        member: true,
        initialLogs: evidenceFixtureLogs(),
        coreFunctions: [{ name: '中文润色' }, { name: '学术型代码解释' }],
        plugins: [{ name: 'PDF 深度理解', group: '学术' }, { name: '解析整个Python项目', group: '编程' }],
      });
      await loginAsSuper(page);
      if (process.env.LENS_CAPTURE_DIR) await expect(page.getByText(/账户登录成功|Account login successful/)).toBeHidden();
      if (dark) await page.locator('.research-theme-button').click();
      let tools = page.locator('.lens-shell__tools');
      if (width < 1024) {
        await page.locator('.research-composer__capability').click();
        tools = page.locator('.lens-mobile-controls-sheet');
      }
      const more = tools.locator('.research-controls h3');
      const featured = tools.locator('.research-shortcuts__title');
      expect(Math.abs((await more.boundingBox()).x - (await featured.boundingBox()).x)).toBeLessThanOrEqual(1);
      await expect(tools.locator('.research-shortcuts__icon')).toHaveCount(0);
      const category = tools.locator('.research-controls__category');
      await category.click();
      await expect(page.locator('.menu-items[aria-hidden="false"]')).toHaveCSS('opacity', '1');
      if (process.env.LENS_CAPTURE_DIR) await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-category-${width}.png` });
      await page.getByRole('menuitemradio', { name: '编程', exact: true }).click();
      await expect(tools.locator('[data-capability="core:中文润色"]')).toHaveCount(0);
      const code = tools.locator('[data-capability="core:学术型代码解释"]');
      await expect(code).toBeVisible();
      await code.click();
      await expect(code).toHaveAttribute('aria-pressed', 'true');
      await category.click();
      await page.getByRole('menuitemradio', { name: '全部', exact: true }).click();
      await tools.locator('.research-controls__search-toggle').click();
      const search = tools.locator('.research-controls__search');
      await expect(search).toBeFocused();
      await search.fill('PDF');
      await expect(tools.locator('.research-controls__option')).toHaveCount(1);
      if (process.env.LENS_CAPTURE_DIR) await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-search-${width}.png` });
      await search.fill('Synthetic no match');
      await expect(tools.locator('.research-controls__empty')).toBeVisible();
      const searchField = tools.locator('.research-search-field');
      await expect(searchField.locator('.research-search-field__icon')).toBeVisible();
      await expect(search).toHaveCSS('box-shadow', 'none');
      await expect(search).toHaveCSS('border-top-width', '0px');
      const inputBeforeClear = await search.boundingBox();
      const clearSearch = searchField.locator('.research-search-field__clear');
      expect((await clearSearch.boundingBox()).height).toBeGreaterThanOrEqual(44);
      await clearSearch.click();
      await expect(search).toHaveValue('');
      await expect(search).toBeFocused();
      await expect(tools.locator('.research-controls__empty')).toHaveCount(0);
      await expect(clearSearch).toBeHidden();
      expect((await search.boundingBox()).width).toBe(inputBeforeClear.width);
      await search.press('Escape');
      await expect(search).toHaveCount(0);
      await expect(code).toHaveAttribute('aria-pressed', 'true');
      if (width >= 1024) {
        const model = page.locator('.research-composer__option-row .research-chip-button');
        const textX = await page.locator('#workspace-composer').evaluate(el => el.getBoundingClientRect().x + parseFloat(getComputedStyle(el).paddingLeft));
        const modelX = await model.locator('.research-chip-button__label').evaluate(el => el.getBoundingClientRect().x);
        expect(Math.abs(textX - modelX)).toBeLessThanOrEqual(2);
        for (const control of [model, page.locator('.research-composer__upload')]) {
          await control.hover();
          await expect(control).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
        }
        for (const icon of await page.locator('.workspace-record__actions svg').all()) {
          expect((await icon.boundingBox()).width).toBeLessThanOrEqual(16);
        }
        const task = tools.locator('.research-shortcuts__button').first();
        await task.hover();
        await expect(task.locator('.research-entry-arrow')).toHaveCSS('opacity', '1');
        expect(await task.evaluate(el => getComputedStyle(el, '::before').left)).toBe('-8px');
      }
      if (process.env.LENS_CAPTURE_DIR) await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-functions-${width}.png` });
      for (const [index, key] of ['featureDesignReviewPrompt', 'featureReviewerReplyPrompt', 'featureSearchStrategyPrompt'].entries()) {
        if (width < 1024 && !await tools.isVisible()) await page.locator('.research-composer__capability').click();
        await tools.locator('.research-shortcuts__button').nth(index).click();
        const prompt = require('../../chat/src/locales/zh-CN.json').lens.workspace[key];
        await expect(page.locator('#workspace-composer')).toHaveValue(prompt);
        await sendButton(page).click();
        await expect.poll(() => state.academicRequests.length).toBe(index + 1);
        expect(state.academicRequests[index].function).toBe('chat');
        expect(state.academicRequests[index].main_input).toBe(prompt);
        await expect(page.locator('.workspace-record--assistant').last()).toBeVisible();
      }
      expect(state.chatRequests).toHaveLength(0);
      expect(unexpectedRequests).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
    } finally { await context.close(); }
  }
});


test('隔离验收：设置阅读与套餐视觉', async ({ browser }) => {
  for (const [width, dark] of [[1440, false], [390, false], [320, true]]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, locale: 'zh-CN' });
    try {
      const page = await context.newPage();
      const { unexpectedRequests, state } = await mountAcceptanceFixture(page, { member: true, packages: [
        { id: 901, name: '合成基础套餐', price: 19, des: '合成验收权益', model3Count: 1000, model4Count: 100, drawMjCount: 0 },
        { id: 902, name: '合成研究套餐', price: 39, des: '合成验收权益', model3Count: 2000, model4Count: 200, drawMjCount: 0 },
        { id: 903, name: '合成专业套餐', price: 59, des: '合成验收权益', model3Count: 3000, model4Count: 300, drawMjCount: 0 },
      ] });
      await loginAsSuper(page);
      await expect(page.getByText(/账户登录成功|Account login successful/)).toBeHidden();
      if (dark) await page.locator('.research-theme-button').click();
      await page.locator('.workspace-account-button').click();
      const settings = page.locator('dialog.lens-settings');
      await expect(settings).toHaveCSS('opacity', '1');
      const nav = settings.locator('.lens-settings__nav nav button');
      await nav.nth(1).click();
      await expect(settings.locator('.research-member')).toBeVisible();
      await expect(settings.locator('.member-plan-state')).toHaveCount(0);
      const cards = settings.locator('.research-member__plan');
      await expect(cards).toHaveCount(3);
      const prices = settings.locator('.research-member__price-number');
      await expect(prices).toHaveText(['19', '39', '59']);
      for (const purchase of await settings.locator('.research-member__plan .research-member__purchase').all()) {
        expect((await purchase.boundingBox()).height).toBeGreaterThanOrEqual(44);
        await expect(purchase).toHaveCSS('font-size', '13px');
      }
      const billingButtons = settings.locator('.research-member__billing > button');
      await billingButtons.nth(1).click();
      expect((await prices.allTextContents()).every(price => price.trim() && !price.includes('NaN'))).toBe(true);
      await billingButtons.nth(0).click();
      await expect(prices).toHaveText(['19', '39', '59']);
      for (const section of await settings.locator('.research-member__section').all()) {
      const planCardHeight = await page.locator('.research-member__plan').first().evaluate(element => element.getBoundingClientRect().height)
      expect(planCardHeight).toBeLessThan(340)
      const purchaseFill = await page.locator('.research-member__purchase').first().evaluate(element => getComputedStyle(element).backgroundColor)
      expect(purchaseFill).not.toBe('rgba(0, 0, 0, 0)')
      const allowanceRows = await page.locator('.research-member__plan .research-member__allowance').first().locator(':scope > *').evaluateAll(elements => elements.map(element => ({ x: element.getBoundingClientRect().x, y: element.getBoundingClientRect().y })))
      expect(allowanceRows).toHaveLength(3)
      expect(Math.abs(allowanceRows[0].x - allowanceRows[1].x)).toBeLessThan(1)
      expect(allowanceRows[1].y - allowanceRows[0].y).toBeGreaterThan(18)
        await expect(section).toHaveCSS('border-top-width', '0px');
      }
      expect(await settings.locator('.lens-settings__content').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
      if (process.env.LENS_CAPTURE_DIR) await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-settings-plans-${width}.png` });
      await nav.nth(2).click();
      await expect(settings.locator('.research-guide')).toBeVisible();
      await expect(settings.locator('.research-guide__label')).toHaveCount(0);
      await expect(settings.locator('.research-guide__tier-badge')).toHaveCount(3);
      for (const name of await settings.locator('.research-guide__tier-badge').all()) await expect(name).toHaveCSS('font-size', '16px');
      require('node:fs').writeFileSync('/private/tmp/lens-reading-shape.json', JSON.stringify(await settings.locator('.research-guide').evaluate(el => ({
        frames: el.querySelectorAll('iframe').length,
        levelOne: el.querySelectorAll('h1').length,
        levelTwo: el.querySelectorAll('h2').length,
        levelThree: el.querySelectorAll('h3').length,
        shadowRoots: [...el.querySelectorAll('*')].filter(node => node.shadowRoot).length,
        renderChildren: el.querySelector('.research-reading__body')?.children.length || 0,
      }))));
      const heading = settings.locator('.research-guide h2').first();
      const readingTiers = page.locator('.research-guide__tier')
      await expect(readingTiers).toHaveCount(3)
      await expect(readingTiers.first()).not.toHaveAttribute('open', '')
      await readingTiers.first().locator('summary').focus()
      await page.keyboard.press('Enter')
      await expect(readingTiers.first()).toHaveAttribute('open', '')
      await expect(readingTiers.first().locator('ul')).toBeVisible()
      await page.keyboard.press('Enter')
      await expect(readingTiers.first().locator('ul')).not.toBeVisible()
      await readingTiers.first().locator('summary').evaluate(element => element.blur())
      await expect(heading).toBeVisible();
      expect(await heading.evaluate(el => parseFloat(getComputedStyle(el).fontSize))).toBeLessThanOrEqual(24);
      expect(await settings.locator('.lens-settings__content').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
      if (process.env.LENS_CAPTURE_DIR) await page.screenshot({ path: `${process.env.LENS_CAPTURE_DIR}/lens-settings-reading-${width}.png` });
      expect(await settings.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
      expect(state.academicRequests).toEqual([]);
      expect(unexpectedRequests).toEqual([]);
    } finally { await context.close(); }
  }
});


test('隔离验收：登录侧栏可折叠与桌面模型菜单紧凑', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
  const page = await context.newPage();
  try {
    const { unexpectedRequests } = await mountAcceptanceFixture(page, { member: true });
    await page.goto(CHAT_BASE_URL);
    await loginAsSuper(page);
    const sidebar = page.locator('.lens-shell__tools');
    const toggle = page.locator('.workspace-sidebar-toggle');
    await expect(toggle).toBeVisible();
    await expect(sidebar).not.toHaveClass(/lens-shell__tools--collapsed/);
    const sidebarBox = await sidebar.boundingBox();
    expect(sidebarBox.width).toBeGreaterThanOrEqual(280);
    expect(sidebarBox.width).toBeLessThanOrEqual(304);
    await toggle.click();
    await expect(sidebar).toHaveClass(/lens-shell__tools--collapsed/);
    await expect(page.locator('#workspace-composer')).toBeVisible();
    await toggle.click();
    await expect(sidebar).not.toHaveClass(/lens-shell__tools--collapsed/);
    await page.locator('.research-composer__frame .research-chip-button').first().click();
    const menu = page.locator('.research-model-menu');
    await expect(menu).toBeVisible();
    const geometry = await menu.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      const parent = element.parentElement.getBoundingClientRect();
      return { contentWidth: Math.round(rect.width), popupWidth: Math.round(parent.width) };
    });
    expect(geometry.contentWidth).toBeLessThanOrEqual(240);
    expect(geometry.popupWidth).toBeLessThanOrEqual(264);
    await expect.poll(() => menu.evaluate((element) => {
      let opacity = 1;
      for (let current = element; current; current = current.parentElement) {
        opacity *= Number.parseFloat(getComputedStyle(current).opacity);
      }
      return opacity >= 0.99;
    })).toBeTruthy();
    await auditInterface(page, 'composer');
    if (process.env.LENS_CAPTURE_DIR) {
      require('node:fs').writeFileSync(path.join(process.env.LENS_CAPTURE_DIR, 'lens-model-geometry.json'), JSON.stringify(geometry));
      await page.screenshot({ path: path.join(process.env.LENS_CAPTURE_DIR, 'lens-final-model-desktop.png'), fullPage: false });
    }
    expect(unexpectedRequests).toEqual([]);
  } finally {
    await context.close();
  }
});


test('隔离验收：对话特色任务补齐且滚动入口可发现', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const plugins =  [{ name: 'PDF 深度理解', group: '学术', advancedArgs: true },
    { name: '解析整个Python项目', group: '编程' },
    ...Array.from({ length: 12 }, (_, index) => ({ name: `Synthetic tool ${index}`, group: '学术' })),
    { name: '虚空终端', group: '编程' }];
  await mountAcceptanceFixture(page, { member: true, plugins });
  await loginAsSuper(page);
  await page.locator('#workspace-composer').fill('合成滚动验收问题');
  await page.locator('.research-send-button:visible').click();
  await expect(page.locator('.workspace-record--assistant').first()).toBeVisible();
  const sidebar = page.locator('.lens-shell__tools');
  await expect(sidebar.locator('.research-shortcuts__button')).toHaveCount(9);
  const region = sidebar.locator('.research-shortcuts .capability-scroll');
  const viewport = region.locator('.capability-scroll__viewport');
  const more = region.locator('.capability-scroll__hint button');
  await expect(more).toBeVisible();
  await expect(more.locator('svg path')).toHaveAttribute('d', 'm6 9 6 6 6-6');
  await expect.poll(() => viewport.evaluate(el => getComputedStyle(el, '::-webkit-scrollbar').width)).toBe('5px');
  await captureAcceptanceView(page, 'lens-final-feature-scroll-top-approved');
  await expect.poll(() => viewport.evaluate(el => el.offsetWidth - el.clientWidth)).toBeGreaterThanOrEqual(5);
  await expect.poll(() => viewport.evaluate(el => getComputedStyle(el, '::-webkit-scrollbar-thumb').backgroundColor !== 'rgba(0, 0, 0, 0)')).toBe(true);
  const firstPosition = await viewport.evaluate(el => el.scrollTop);
  await more.click();
  await expect.poll(() => viewport.evaluate(el => el.scrollTop)).toBeGreaterThan(firstPosition);
  const last = sidebar.locator('.research-shortcuts__button').last();
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  await expect(more).toHaveCount(0);
  await last.click();
  await expect(page.locator('#workspace-composer')).not.toHaveValue('');
  await captureAcceptanceView(page, 'lens-final-feature-scroll-desktop-approved');
  await page.setViewportSize({ width: 1024, height: 600 });
  await expect(page.locator('#workspace-composer')).toBeInViewport();
  await expect.poll(() => page.locator('body').evaluate(el => el.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
});
