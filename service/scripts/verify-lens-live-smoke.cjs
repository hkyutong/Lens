const { createResearchChallenge, containsResearchAnswer, inspectResearchProtocol } = require('./live_research_challenge.cjs');
const { localTestCredentials } = require('./local_test_credentials.cjs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { randomUUID } = require('node:crypto');
const { chromium, expect } = require('@playwright/test');


async function loginTestAccount(page) {
  const credentials = localTestCredentials();
  await page.locator('.workspace-account-button').click();
  const login = page.locator('dialog.academic-login');
  await expect(login).toBeVisible();
  await login.locator('#username').fill(credentials.username);
  await login.locator('input[type=password]').first().fill(credentials.password);
  await login.locator('.lens-checkbox').check({ force: true });
  const submit = login.locator('button[type=submit]');
  if (await submit.count()) await submit.click();
  else await login.getByRole('button', { name: /^(登录|登錄|Log in|Login)$/ }).click();
  await expect(login).toBeHidden();
}

// Only synthetic questions and a fresh, owned record are used. Never inspect
// browser storage, credentials, response bodies, or existing research content.
async function run() {
  const challenge = createResearchChallenge();
  let researchResponse = null;
  const result = {
    login: false,
    recordCreated: false,
    recordRenamed: false,
    researchCompleted: false,
    refreshRestored: false,
    ownedRecordRemoved: false,
  };
  let browser;
  let page;
  let deadlineTimer;
  let stage = 'initialization';
  let cleanupStage = 'open_records';
  let cleanupEligible = false;
  const cleanupOnly = process.env.LENS_SMOKE_CLEANUP_ONLY === '1';
  let marker = `Lens 本地合成验收 ${randomUUID()}`;
  const baseUrl = process.env.CHAT_BASE_URL || 'http://127.0.0.1:9003/';
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  if (!localHosts.has(new URL(baseUrl).hostname)) {
    return { ...result, errorClass: 'nonlocal_target_rejected' };
  }
  try {
    const { default: config } = await import(pathToFileURL(path.join(__dirname, '../playwright.config.mjs')).href);
    const launchOptions = config.use?.launchOptions || config.projects?.[0]?.use?.launchOptions;
    if (!launchOptions?.executablePath) throw new Error('runtime_unavailable');
    browser = await chromium.launch({ ...launchOptions, headless: true });
    deadlineTimer = setTimeout(() => browser.close().catch(() => {}), 180000);
    deadlineTimer.unref();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN' });
    page = await context.newPage();
    page.setDefaultTimeout(12000);
    await page.route('**/*', route => {
      try {
        return localHosts.has(new URL(route.request().url()).hostname) ? route.continue() : route.abort();
      } catch {
        return route.abort();
      }
    });
    stage = 'login';
    await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await loginTestAccount(page);
    result.login = true;
    if (cleanupOnly) {
      result.cleanupOnly = true;
      await page.locator('.workspace-projects-button').click();
      const owned = page.locator('.project-list__item').filter({ hasText: /Lens 本地合成验收 [0-9a-f-]{36}/ });
      stage = 'cleanup_discovery';
      const candidates = await owned.count();
      result.ownedCandidateCount = candidates;
      if (candidates === 0) { result.ownedRecordRemoved = true; return result; }
      await expect(owned).toHaveCount(1);
      const label = await owned.locator('.project-list__title').innerText();
      const match = label.match(/Lens 本地合成验收 [0-9a-f-]{36}/);
      if (!match) throw new Error('owned_record_unverified');
      marker = match[0];
      cleanupEligible = true;
      return result;
    }

    stage = 'new_record';
    await page.locator('.workspace-projects-button').click();
    const priorRecordCount = await page.locator('.project-list__item').count();
    await page.locator('.research-projects__new').click();
    await expect(page.locator('#research-start-title')).toBeVisible();


    stage = 'rename_record';
    await page.locator('.workspace-projects-button').click();
    await expect.poll(() => page.locator('.project-list__item').count()).toBe(priorRecordCount + 1);
    result.recordCreated = true;
    const active = page.locator('.project-list__item.active').first();
    await active.locator('.project-list__more').click();
    await page.locator('.menu-item:visible').filter({ hasText: /重命名|重新命名|Rename/ }).click();
    const nameInput = active.locator('input');
    await nameInput.fill(marker);
    await nameInput.press('Enter');
    await expect(page.locator('.project-list__item').filter({ hasText: marker })).toHaveCount(1);
    result.recordRenamed = true;
    cleanupEligible = true;
    await page.locator('.research-projects__header button').last().click();

    stage = 'research';
      page.on('response', response => {
        const pathname = new URL(response.url()).pathname;
        if (response.request().method() !== 'POST') return;
        if (pathname.includes('/academic/') && /process/i.test(pathname)) {
          researchResponse = response;
          result.requestRoute = 'academic';
        } else if (/\/chatgpt\//.test(pathname) && /process/i.test(pathname)) {
          researchResponse = response;
          result.requestRoute = 'legacy_chat';
        }
      });
    await page.locator('#workspace-composer').fill(challenge.prompt);
    await page.locator('.research-send-button:visible').click();
    await expect.poll(async () => page.locator('.workspace-record--assistant').last().evaluate((element, expectedAnswer) => (element.textContent || '').includes(expectedAnswer) &&
      !/额度不足|暂时不可用|服务不可用|insufficient|unavailable/i.test(element.textContent || ''), challenge.answer
    ).catch(() => false), { timeout: 90000 }).toBeTruthy();
    if (!containsResearchAnswer(await page.locator('.workspace-record--assistant').first().innerText(), challenge.answer)) { throw new Error('research_answer_mismatch'); }
      result.researchCompleted = true;

    stage = 'refresh';
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect.poll(async () => page.locator('.workspace-record--assistant').last().evaluate((element, expectedAnswer) => (element.textContent || '').includes(expectedAnswer), challenge.answer
    ).catch(() => false)).toBeTruthy();
    if (!containsResearchAnswer(await page.locator('.workspace-record--assistant').first().innerText(), challenge.answer)) { throw new Error('research_answer_mismatch'); }
      result.refreshRestored = true;
  } catch {
    result.errorClass = `${stage}_failed`;
    if (result.recordCreated && result.recordRenamed && !result.researchCompleted && page) {
      try {
        const response = page.locator('.workspace-record--assistant').first();
        const text = await response.count() ? await response.innerText() : '';
        result.replyPresent = Boolean(text.trim());
        result.promptEchoed = text.includes(challenge.prompt);
        result.expectedAnswerPresent = containsResearchAnswer(text, challenge.answer);
        result.groupedAnswerPresent = containsResearchAnswer(text.replace(/(\d),(?=\d{3}(?:\D|$))/g, '$1'), challenge.answer);
        if (researchResponse) {
          const body = await Promise.race([researchResponse.text().catch(() => null), new Promise(resolve => setTimeout(() => resolve(null), 2000))]);
          if (body !== null) {
            const type = await researchResponse.headerValue('content-type');
            Object.assign(result, inspectResearchProtocol(body, challenge, Boolean(type?.includes('text/plain'))));
          } else { result.apiInspectionIncomplete = true; }
        }

      } catch (_) { result.replyInspectionFailed = true; }
    }
  } finally {
    if (page && cleanupEligible) {
      try {
        if (!(await page.locator('.research-projects').isVisible())) await page.locator('.workspace-projects-button').click();
        cleanupStage = 'select_owned';
        const owned = page.locator('.project-list__item').filter({ hasText: marker });
        await expect(owned).toHaveCount(1);
        cleanupStage = 'open_menu';
        await owned.locator('.project-list__more').click();
        cleanupStage = 'select_delete';
        await page.locator('.menu-item:visible').filter({ hasText: /删除|刪除|Delete/ }).click();
        cleanupStage = 'confirmation';
        const positiveName = /^(?:删除|刪除|确定|確認|确认)(?:删除|刪除)?(?:研究)?(?:记录)?$|^Delete(?: record)?$|^Confirm(?: deletion)?$/i;
        const confirm = page.getByRole('dialog').filter({ has: page.getByRole('button', { name: positiveName }) }).last();
        await expect.poll(async () => (await owned.count()) === 0 || (await confirm.isVisible())).toBeTruthy();
        if ((await owned.count()) !== 0) {
          cleanupStage = 'confirm_delete';
          const positive = confirm.getByRole('button', { name: positiveName });
          await expect(positive).toHaveCount(1);
          await positive.click();
        }
        cleanupStage = 'wait_removed';
        await expect(owned).toHaveCount(0);
        result.ownedRecordRemoved = true;
      } catch {
        result.cleanupErrorClass = `owned_record_${cleanupStage}_failed`;
      }
    }
    if (deadlineTimer) clearTimeout(deadlineTimer);
    if (browser) await browser.close();
  }
  return result;
}

if (require.main === module) {
  run().then(result => {
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = result.ownedRecordRemoved && (result.cleanupOnly || (result.researchCompleted && result.refreshRestored)) ? 0 : 1;
  }).catch(() => {
    process.stdout.write(JSON.stringify({ errorClass: 'smoke_runner_failed' }) + '\n');
    process.exitCode = 1;
  });
}

module.exports = { run, loginTestAccount, localTestCredentials };
