const { test, expect } = require('@playwright/test');

const CHAT_BASE_URL = process.env.CHAT_BASE_URL || 'http://127.0.0.1:9002';
const LOGIN_USER = process.env.E2E_LOGIN_USER || 'super';
const LOGIN_PASS = process.env.E2E_LOGIN_PASS || '123456';
const FAKE_TOKEN =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJzdXBlciIsInJvbGUiOiJzdXBlciJ9.signature';

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

async function mountRegressionApi(page, options = {}) {
  const group = createGroup();
  const state = {
    groups: [group],
    chatLogsByGroup: {
      1: Array.isArray(options.initialLogs) ? [...options.initialLogs] : [],
    },
    nextChatId: 6000,
    chatRequests: [],
    academicRequests: [],
  };

  await page.route('**/api/**', async route => {
    const request = route.request();
    const reqUrl = request.url();
    const parsed = new URL(reqUrl);
    if (!parsed.pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }

    const path = parsed.pathname.slice(4);
    const groupLogs = state.chatLogsByGroup[1];

    if (path === '/auth/login') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: FAKE_TOKEN, message: 'ok' }),
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
            id: 1,
            username: 'super',
            email: 'super@example.com',
            role: 'super',
            userBalance: {
              sumModel3Count: 9999,
              sumModel4Count: 9999,
              drawMjCount: 0,
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
            rows: [
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
        body: JSON.stringify({ success: true, data: { rows: [] }, message: 'ok' }),
      });
      return;
    }

    if (path === '/group/query') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: state.groups, message: 'ok' }),
      });
      return;
    }

    if (path === '/chatlog/chatList') {
      const size = Math.max(Number(parsed.searchParams.get('size') || 80), 1);
      const beforeChatId = Number(parsed.searchParams.get('beforeChatId') || 0);
      const ordered = [...groupLogs].sort((a, b) => Number(a.chatId || 0) - Number(b.chatId || 0));
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
      output = `${stableSummary}\n\n我将首先用中文提供文本的更正版本，然后输出一个 Markdown 表格列名严格为：\`修改前原文片段 | 修改后片段 | 修改原因与解释\`表格会按“小句/短片段”的粒度拆分，确保每一行只描述一个局部修改每个单元格内容将尽量简短，只摘录必要片段\n\n${malformedTable}\n${leakedTail}`;

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

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: {}, message: 'ok' }),
    });
  });

  return state;
}

async function loginAsSuper(page) {
  await page.goto(CHAT_BASE_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);

  const loginButton = page.getByRole('button', { name: '登录或注册' });
  if (await loginButton.count()) {
    await loginButton.first().click({ force: true });
    await page.locator('#username').fill(LOGIN_USER);
    await page.locator('#password').fill(LOGIN_PASS);
    await page.locator('#agreement-password').check();
    await page.locator('form button[type="submit"]').first().click({ force: true });
    await page.waitForTimeout(1200);
  }

  await expect(page.getByText('E2E Regression Group')).toBeVisible({ timeout: 20000 });
}

test('编辑消息会永久截断后续消息，主题切换分隔线不会闪白', async ({ page }) => {
  const state = await mountRegressionApi(page, {
    initialLogs: [
      buildChatLog({ chatId: 1001, role: 'user', content: '首条用户消息' }),
      buildChatLog({ chatId: 1002, role: 'assistant', content: '首条回复' }),
      buildChatLog({ chatId: 1003, role: 'user', content: '后续用户消息' }),
      buildChatLog({ chatId: 1004, role: 'assistant', content: '后续助手回复' }),
    ],
  });

  await loginAsSuper(page);

  await expect(page.getByText('后续用户消息')).toBeVisible();
  await expect(page.getByText('后续助手回复')).toBeVisible();

  await page.getByRole('button', { name: '编辑' }).first().click();
  const editTextarea = page.locator('.text-wrap textarea').first();
  await editTextarea.fill('编辑后的首条用户消息');
  await page.getByRole('button', { name: '发送' }).first().click();

  await expect(page.getByText('编辑后的首条回复')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('后续用户消息')).toHaveCount(0);
  await expect(page.getByText('后续助手回复')).toHaveCount(0);

  await page.getByRole('button', { name: '重新生成' }).first().click();
  await expect.poll(() => state.chatRequests.length).toBe(2);
  await expect(page.getByText('后续用户消息')).toHaveCount(0);
  await expect(page.getByText('后续助手回复')).toHaveCount(0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('编辑后的首条用户消息')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('编辑后的首条回复')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('后续用户消息')).toHaveCount(0);
  await expect(page.getByText('后续助手回复')).toHaveCount(0);

  expect(state.chatRequests[0].overwriteReply).toBe(true);
  expect(Number(state.chatRequests[0].chatId)).toBe(1001);
  expect(Number(state.chatRequests[0].replyChatId)).toBe(1002);
  expect(state.chatRequests[1].overwriteReply).toBe(true);
  expect(Number(state.chatRequests[1].chatId)).toBe(1001);
  expect(Number(state.chatRequests[1].replyChatId)).toBe(1002);

  await page.getByRole('button', { name: '切换主题' }).click();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(document.querySelector('.account-divider')))
    )
    .toBe(false);
});

test('学术润色保留总段落且刷新后表格稳定，重新生成走覆盖链路', async ({ page }) => {
  const state = await mountRegressionApi(page, {
    initialLogs: [
      buildChatLog({ chatId: 2001, role: 'user', content: '已有学术提问' }),
      buildChatLog({
        chatId: 2002,
        role: 'assistant',
        content: '已有学术回答',
      }),
    ],
  });

  await loginAsSuper(page);

  const academicToggle = page.getByRole('button', { name: '启用或禁用学术模式' });
  if ((await academicToggle.getAttribute('aria-pressed')) !== 'true') {
    await academicToggle.click();
  }
  await page.locator('select').first().selectOption('中文润色');

  const input = page.locator('textarea[aria-label="聊天消息输入框"]');
  await input.fill('请用中文润色下面这段说明文字');
  await page.getByRole('button', { name: '发送消息' }).click();

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
    '拼写、语法、清晰、简洁和整体可读性'
  );
  await expect(liveTable.locator('tbody tr').nth(1).locator('td').nth(2)).not.toContainText(
    '同时必须用中文分解长句'
  );
  await expect(liveTable.locator('tbody tr').nth(2).locator('td').nth(2)).not.toContainText(
    '我的能力包括：'
  );
  await expect(liveTable.locator('tbody tr').nth(5).locator('td').nth(2)).not.toContainText(
    '编程帮助、代码调试与思路梳理'
  );
  await expect(liveTable.locator('tbody tr').nth(8).locator('td').nth(2)).not.toContainText(
    '使用方式很简单：'
  );
  await expect(liveTable.locator('tbody tr').nth(10).locator('td').nth(2)).not.toContainText(
    '我会给出对应的回答或处理结果'
  );
  await expect(liveTable.locator('tbody tr').nth(13).locator('td').nth(2)).not.toContainText(
    '我不能直接访问你的本地文件'
  );
  await expect(
    liveTable.locator('tbody tr', {
      has: page.locator('td', { hasText: '我的服务能力包括：' }),
    }).locator('td').nth(2)
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
  await expect(
    persistedTable.locator('tbody tr').first().locator('td').nth(2)
  ).not.toContainText('拼写、语法、清晰、简洁和整体可读性');
  await expect(
    persistedTable.locator('tbody tr').nth(1).locator('td').nth(2)
  ).not.toContainText('同时必须用中文分解长句');
  await expect(
    persistedTable.locator('tbody tr').nth(2).locator('td').nth(2)
  ).not.toContainText('我的能力包括：');
  await expect(
    persistedTable.locator('tbody tr').nth(5).locator('td').nth(2)
  ).not.toContainText('编程帮助、代码调试与思路梳理');
  await expect(
    persistedTable.locator('tbody tr').nth(8).locator('td').nth(2)
  ).not.toContainText('使用方式很简单：');
  await expect(
    persistedTable.locator('tbody tr').nth(10).locator('td').nth(2)
  ).not.toContainText('我会给出对应的回答或处理结果');
  await expect(
    persistedTable.locator('tbody tr').nth(13).locator('td').nth(2)
  ).not.toContainText('我不能直接访问你的本地文件');
  await expect(
    persistedTable.locator('tbody tr', {
      has: page.locator('td', { hasText: '我的服务能力包括：' }),
    }).locator('td').nth(2)
  ).not.toContainText('回答问题、解释概念、提供学习与研究辅导');

  const academicToggleAfterReload = page.getByRole('button', { name: '启用或禁用学术模式' });
  if ((await academicToggleAfterReload.getAttribute('aria-pressed')) !== 'true') {
    await academicToggleAfterReload.click();
  }
  await page.locator('select').first().selectOption('中文润色');
  await page.getByRole('button', { name: '重新生成' }).last().click();
  await expect(
    page.getByText('以下为润色后的总段落：我会先给出完整润色版本，然后用三列表格说明修改原因。'),
  ).toBeVisible({ timeout: 10000 });

  expect(state.academicRequests).toHaveLength(2);
  expect(Boolean(state.academicRequests[1].overwriteReply)).toBe(true);
  expect(state.academicRequests[1].chatId).toBeGreaterThan(0);
  expect(state.academicRequests[1].replyChatId).toBeGreaterThan(0);
});
