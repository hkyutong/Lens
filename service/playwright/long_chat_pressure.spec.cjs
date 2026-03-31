const { test, expect } = require('@playwright/test')

const CHAT_BASE_URL = process.env.CHAT_BASE_URL || 'http://127.0.0.1:9003'
const API_BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:9520/api'
const LOGIN_USER = process.env.E2E_LOGIN_USER || 'super'
const LOGIN_PASS = process.env.E2E_LOGIN_PASS || '123456'
const LONG_CHAT_500_TITLE = process.env.LONG_CHAT_500_TITLE || 'E2E 长会话 500'
const LONG_CHAT_1000_TITLE = process.env.LONG_CHAT_1000_TITLE || 'E2E 长会话 1000'

const mockAssistantStream = () =>
  JSON.stringify({
    content: '长会话压测追问已完成，页面仍保持可交互。',
    finalContent: '长会话压测追问已完成，页面仍保持可交互。',
    reasoningText: '',
    finishReason: 'stop',
  }) + '\n'

const apiRequest = async (path, { method = 'GET', token = '', body } = {}) => {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await response.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch (_error) {}
  return { ok: response.ok, status: response.status, json, text }
}

const loginByApi = async () => {
  const rs = await apiRequest('/auth/login', {
    method: 'POST',
    body: { username: LOGIN_USER, password: LOGIN_PASS },
  })
  const token = rs.json?.data
  if (!rs.ok || !token) {
    throw new Error(`登录失败: status=${rs.status} body=${rs.text.slice(0, 200)}`)
  }
  return String(token)
}

const collectMetrics = async page => {
  return page.evaluate(() => {
    const scroller = document.querySelector('#scrollRef')
    return {
      workspaceEntryCount: document.querySelectorAll('.workspace-entry').length,
      placeholderCount: document.querySelectorAll('.workspace-entry--placeholder').length,
      workspaceRecordCount: document.querySelectorAll('.workspace-record').length,
      totalDomNodes: document.querySelectorAll('*').length,
      scrollHeight: scroller ? scroller.scrollHeight : 0,
      clientHeight: scroller ? scroller.clientHeight : 0,
      scrollTop: scroller ? scroller.scrollTop : 0,
    }
  })
}

const workspaceInputLocator = page =>
  page.locator('textarea[aria-label="研究输入框"], textarea[aria-label="聊天消息输入框"]').first()

const waitForWorkspaceReady = async page => {
  await expect(workspaceInputLocator(page)).toBeVisible({
    timeout: 30000,
  })
  await expect(page.getByText(/Your Projects|你的项目/)).toBeVisible({ timeout: 30000 })
}

const openProject = async (page, title) => {
  const target = page.getByText(title, { exact: true }).first()
  await expect(target).toBeVisible({ timeout: 30000 })
  await target.click()
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible({ timeout: 30000 })
  await page.waitForTimeout(800)
}

const loadOlderByScrollTop = async page => {
  const scroller = page.locator('#scrollRef')
  await scroller.evaluate(node => {
    node.scrollTop = 0
    node.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await page.waitForTimeout(900)
}

const assertInteractive = async page => {
  const input = workspaceInputLocator(page)
  await expect(input).toBeVisible({ timeout: 10000 })
  await input.click()
}

test.describe('长会话 Chrome 压测', () => {
  test('500 条与 1000 条会话在 Chrome 中保持可交互', async ({ page }) => {
    const pageErrors = []
    page.on('pageerror', error => {
      pageErrors.push(String(error?.message || error))
    })

    await page.route('**/api/chatgpt/chat-process', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: mockAssistantStream(),
      })
    })
    await page.route('**/api/academic/chat-process', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'text/plain; charset=utf-8',
        body: mockAssistantStream(),
      })
    })

    const token = await loginByApi()
    await page.goto(`${CHAT_BASE_URL}?token=${encodeURIComponent(token)}`, {
      waitUntil: 'domcontentloaded',
    })
    await waitForWorkspaceReady(page)

    await test.step('打开 500 条长会话并验证首屏窗口化', async () => {
      await openProject(page, LONG_CHAT_500_TITLE)
      const metrics = await collectMetrics(page)
      expect(metrics.workspaceEntryCount).toBeLessThan(180)
      expect(metrics.totalDomNodes).toBeLessThan(2600)
      await assertInteractive(page)
    })

    await test.step('顶部连续加载更早消息 3 页后仍可交互', async () => {
      for (let i = 0; i < 3; i += 1) {
        await loadOlderByScrollTop(page)
      }
      const metrics = await collectMetrics(page)
      expect(metrics.workspaceEntryCount).toBeLessThan(220)
      expect(metrics.totalDomNodes).toBeLessThan(3200)
      await assertInteractive(page)
    })

    await test.step('切到 1000 条会话并验证窗口化仍生效', async () => {
      await openProject(page, LONG_CHAT_1000_TITLE)
      const metrics = await collectMetrics(page)
      expect(metrics.workspaceEntryCount).toBeLessThan(180)
      expect(metrics.totalDomNodes).toBeLessThan(2600)
      await assertInteractive(page)
    })

    await test.step('上拉更多历史并继续追问一轮', async () => {
      for (let i = 0; i < 5; i += 1) {
        await loadOlderByScrollTop(page)
      }

      const input = workspaceInputLocator(page)
      await input.fill('请继续总结这组长会话压测样本的共同结论。')

      const sendButton = page
        .locator('button')
        .filter({ hasText: /提交研究任务|发送消息/ })
        .last()
      await expect(sendButton).toBeVisible()
      await sendButton.click()

      await expect(page.getByText('长会话压测追问已完成，页面仍保持可交互。')).toBeVisible({
        timeout: 30000,
      })

      const metrics = await collectMetrics(page)
      expect(metrics.workspaceEntryCount).toBeLessThan(240)
      expect(metrics.totalDomNodes).toBeLessThan(3600)
      await assertInteractive(page)
    })

    expect(pageErrors).toEqual([])
  })
})
