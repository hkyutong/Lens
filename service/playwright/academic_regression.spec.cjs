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

const sendButton = page =>
  page.getByRole('button', { name: /发送消息|^发送$|^Send$/ }).last();

const openResearchTools = async page => {
  const drawer = page.locator('.research-tool-drawer');
  if (await drawer.isVisible().catch(() => false)) return drawer;
  await page
    .getByRole('button', { name: /研究工具|Research Tools|研究ツール|연구 도구/ })
    .click();
  await expect(drawer).toBeVisible({ timeout: 10000 });
  return drawer;
};

const closeResearchTools = async (page, drawer) => {
  await drawer
    .getByRole('button', {
      name: /关闭能力设置|關閉能力設定|Close capability settings|機能設定を閉じる|기능 설정 닫기/,
    })
    .click();
  await expect(drawer).toBeHidden({ timeout: 10000 });
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
    workflowRequests: [],
    shareRequests: [],
    shareCreateRequests: [],
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
            userInfo: {
              id: 1,
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
        body: JSON.stringify({
          success: true,
          data: { rows: Array.isArray(options.plugins) ? options.plugins : [] },
          message: 'ok',
        }),
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

  const loginButton = page.getByRole('button', { name: /登录|Sign In/ });
  if (await loginButton.count()) {
    await loginButton.first().click({ force: true });
    await page.locator('#username').fill(LOGIN_USER);
    await page.locator('#password').fill(LOGIN_PASS);
    await page.locator('#agreement-password').check();
    await page.locator('form button[type="submit"]').first().click({ force: true });
    await page.waitForTimeout(1200);
  }

  await expect(page.locator('#workspace-composer')).toBeEnabled({ timeout: 20000 });
}

test('Lens 默认研究会话只走 Academic 请求，不回退到 99AI 通用聊天页', async ({ page }) => {
  const state = await mountRegressionApi(page);

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
  const state = await mountRegressionApi(page);
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

  await page.getByRole('button', { name: /编辑|Edit/ }).first().click();
  const editTextarea = page.locator('.workspace-record__editor textarea').first();
  await editTextarea.fill('编辑后的首条用户消息');
  await page.getByRole('button', { name: /保存修改|Save|Update/ }).click();

  await expect(page.getByText('编辑后的首条回复')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('后续用户消息')).toHaveCount(0);
  await expect(page.getByText('后续助手回复')).toHaveCount(0);

  await page.getByRole('button', { name: /重新生成|Regenerate/ }).first().click();
  await expect.poll(() => state.academicRequests.length).toBe(2);
  await expect(page.getByText('后续用户消息')).toHaveCount(0);
  await expect(page.getByText('后续助手回复')).toHaveCount(0);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('编辑后的首条用户消息')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('编辑后的首条回复')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('后续用户消息')).toHaveCount(0);
  await expect(page.getByText('后续助手回复')).toHaveCount(0);

  expect(state.academicRequests[0].overwriteReply).toBe(true);
  expect(Number(state.academicRequests[0].chatId)).toBe(1001);
  expect(Number(state.academicRequests[0].replyChatId)).toBe(1002);
  expect(state.academicRequests[1].overwriteReply).toBe(true);
  expect(Number(state.academicRequests[1].chatId)).toBe(1001);
  expect(Number(state.academicRequests[1].replyChatId)).toBe(1002);

  await page.getByRole('button', { name: /切换主题|Switch to (?:dark|light) mode/ }).click();
  await expect
    .poll(() => page.evaluate(() => Boolean(document.querySelector('.account-divider'))))
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

  const researchTools = await openResearchTools(page);
  const coreSelector = researchTools.locator('select').first();
  await expect(coreSelector.locator('option[value="中文润色"]')).toBeAttached({ timeout: 10000 });
  await coreSelector.selectOption('中文润色');
  await closeResearchTools(page, researchTools);

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

  const reopenedResearchTools = await openResearchTools(page);
  await reopenedResearchTools.locator('select').first().selectOption('中文润色');
  await closeResearchTools(page, reopenedResearchTools);
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
  const state = await mountRegressionApi(page, { initialLogs: [] });
  await loginAsSuper(page);

  await page.getByRole('button', { name: /开始文献综述|Start literature review/ }).click();

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
  const state = await mountRegressionApi(page, { initialLogs: [] });
  await loginAsSuper(page);

  const input = page.locator('#workspace-composer');
  await expect(page.getByRole('button', { name: /比较多篇论文|Compare papers/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /整理研究笔记|Organize research notes/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /生成教学材料|Create teaching material/ })).toBeVisible();

  await page.getByRole('button', { name: /比较多篇论文|Compare papers/ }).click();
  await expect(input).toHaveValue(/比较当前资料中的多篇论文|Compare the papers/);
  await page.getByRole('button', { name: /整理研究笔记|Organize research notes/ }).click();
  await expect(input).toHaveValue(/结构化研究笔记|structured research notes/);
  await page.getByRole('button', { name: /生成教学材料|Create teaching material/ }).click();
  await expect(input).toHaveValue(/生成教学材料|Create teaching material/);

  await sendButton(page).click();
  await expect.poll(() => state.academicRequests.length).toBe(1);
  expect(state.academicRequests).toHaveLength(1);
  expect(state.academicRequests[0].function).toBe('chat');
  expect(state.academicRequests[0].appId).toBe(0);
  expect(String(state.academicRequests[0].main_input || '')).toMatch(/生成教学材料|Create teaching material/);
  await expect(page.locator('.workspace-record--assistant').last()).toBeVisible({ timeout: 10000 });
});

test('研究入口将论文速读与 LaTeX 任务绑定到 Academic 插件选择器', async ({ page }) => {
  const state = await mountRegressionApi(page, {
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
  });
  await loginAsSuper(page);

  await page.getByRole('button', { name: /总结论文|Summarize Paper/ }).click();
  const researchTools = await openResearchTools(page);
  const pluginSelect = researchTools.locator('select').nth(1);
  await expect(pluginSelect.locator('option[value="PDF批量总结"]')).toBeAttached({
    timeout: 10000,
  });

  await expect.poll(() => pluginSelect.inputValue()).toBe('PDF批量总结');
  await expect(page.locator('#workspace-composer')).toHaveValue(
    /论文|paper/i,
  );

  await closeResearchTools(page, researchTools);
  await page.getByRole('button', { name: /LaTeX 翻译|Translate LaTeX/ }).click();
  const reopenedResearchTools = await openResearchTools(page);
  const reopenedPluginSelect = reopenedResearchTools.locator('select').nth(1);
  await expect.poll(() => reopenedPluginSelect.inputValue()).toBe('LaTeX精准翻译');
  await closeResearchTools(page, reopenedResearchTools);
  await page.getByRole('button', { name: /总结论文|Summarize Paper/ }).click();
  const finalResearchTools = await openResearchTools(page);
  await expect.poll(() => finalResearchTools.locator('select').nth(1).inputValue()).toBe('PDF批量总结');
  await closeResearchTools(page, finalResearchTools);

  await sendButton(page).click();
  await expect.poll(() => state.academicRequests.length).toBe(1);
  expect(state.academicRequests).toHaveLength(1);
  expect(state.academicRequests[0].function).toBe('plugin');
  expect(state.academicRequests[0].plugin_name).toBe('PDF批量总结');
});

test('会员可从能力编排添加步骤并提交工作流', async ({ page }) => {
  const state = await mountRegressionApi(page, { member: true, initialLogs: [] });
  await loginAsSuper(page);

  await page
    .getByRole('button', {
      name: /自定义研究流程|自訂研究流程|Custom research workflow|研究フローを作成|연구 워크플로 만들기/,
    })
    .click();
  const researchTools = await openResearchTools(page);
  await researchTools.getByRole('button', { name: /添加能力|Add capability/ }).click();

  const workflowCard = page.locator('.research-controls__workflow-card').first();
  await expect(workflowCard).toBeVisible({ timeout: 10000 });
  await workflowCard.locator('select').first().selectOption('core');
  await expect(
    workflowCard.locator('select').nth(1).locator('option[value="中文润色"]'),
  ).toBeAttached({
    timeout: 10000,
  });
  await workflowCard.locator('select').nth(1).selectOption('中文润色');
  await closeResearchTools(page, researchTools);

  const input = page.locator('#workspace-composer');
  await input.fill('请按当前链路处理这份研究材料');
  await sendButton(page).click();

  await expect(page.getByText('工作流已完成：1 步')).toBeVisible({ timeout: 10000 });
  expect(state.workflowRequests).toHaveLength(1);
  expect(state.workflowRequests[0].workflow.steps).toEqual([
    expect.objectContaining({ kind: 'core', name: '中文润色' }),
  ]);
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
  await mountRegressionApi(page, { initialLogs });
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
