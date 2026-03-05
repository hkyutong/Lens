const { test, expect } = require('@playwright/test')

test('Mermaid语法错误应降级为代码块且不泄漏炸弹错误图', async ({ page }) => {
  const chatBaseUrl = process.env.CHAT_BASE_URL || 'http://127.0.0.1:9002'
  const loginUser = process.env.E2E_LOGIN_USER || 'super'
  const loginPass = process.env.E2E_LOGIN_PASS || '123456'
  const fakeToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwidXNlcm5hbWUiOiJzdXBlciIsInJvbGUiOiJzdXBlciJ9.signature'
  const groups = [
    {
      id: 1,
      title: 'E2E Group',
      isSticky: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      appId: 0,
      config: '{}',
      appLogo: '',
      isFixedModel: 0,
      isGpts: 0,
      params: '',
      fileUrl: '',
      content: '',
      appModel: '',
    },
  ]

  await page.route('**/api/**', async route => {
    const reqUrl = route.request().url()
    const parsed = new URL(reqUrl)
    if (!parsed.pathname.startsWith('/api/')) {
      await route.continue()
      return
    }
    const path = `${parsed.pathname.slice(4)}${parsed.search || ''}`

    if (path.startsWith('/academic/chat-process') || path.startsWith('/chatgpt/chat-process')) {
      const line = JSON.stringify({
        finalContent: [
          '```mermaid',
          '@article{citekey,',
          '  title={Bad Mermaid}',
          '}',
          '```',
        ].join('\n'),
        content: [
          '```mermaid',
          '@article{citekey,',
          '  title={Bad Mermaid}',
          '}',
          '```',
        ].join('\n'),
        finishReason: 'stop',
      })
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: `${line}\n`,
      })
      return
    }

    if (path.startsWith('/auth/login')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: fakeToken, message: 'ok' }),
      })
      return
    }

    if (path.startsWith('/auth/getInfo')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            id: 1,
            username: 'super',
            role: 'super',
            userBalance: {
              sumModel3Count: 9999,
              sumModel4Count: 9999,
              drawMjCount: 0,
            },
          },
          message: 'ok',
        }),
      })
      return
    }

    if (path.startsWith('/models/list')) {
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
                  keyType: 1,
                },
              ],
            },
          },
          message: 'ok',
        }),
      })
      return
    }

    if (path.startsWith('/group/create')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: groups[0], message: 'ok' }),
      })
      return
    }

    if (path.startsWith('/group/query')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: groups, message: 'ok' }),
      })
      return
    }

    if (path.startsWith('/academic/core-function-list') || path.startsWith('/academic/plugin-list')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { rows: [] }, message: 'ok' }),
      })
      return
    }

    if (path.startsWith('/plugin/pluginList') || path.startsWith('/app/list')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { rows: [] }, message: 'ok' }),
      })
      return
    }

    if (path.startsWith('/config/queryFront')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: {}, message: 'ok' }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [], message: 'ok' }),
    })
  })

  await page.goto(chatBaseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)

  const loginButton = page.getByRole('button', { name: '登录或注册' })
  if (await loginButton.count()) {
    await loginButton.first().click({ force: true })
    await page.locator('#username').fill(loginUser)
    await page.locator('#password').fill(loginPass)
    await page.locator('#agreement-password').check()
    await page.locator('form button[type="submit"]').first().click({ force: true })
    await page.waitForTimeout(1500)
  }

  const input = page.locator('textarea[aria-label="聊天消息输入框"]')
  await expect(input).toBeVisible()
  await input.fill('请回复一个错误 mermaid 代码块')
  await page.getByRole('button', { name: '发送消息' }).click()

  await expect(page.locator('.mermaid-fallback').first()).toBeVisible({ timeout: 30000 })

  const diagnostics = await page.evaluate(() => {
    const leakedArtifacts = document.querySelectorAll(
      'body > div[id^="dmermaid-"], body > iframe[id^="imermaid-"]'
    ).length
    const fallbackCount = document.querySelectorAll('.mermaid-fallback').length
    return { leakedArtifacts, fallbackCount }
  })

  expect(diagnostics.fallbackCount).toBeGreaterThan(0)
  expect(diagnostics.leakedArtifacts).toBe(0)
})
