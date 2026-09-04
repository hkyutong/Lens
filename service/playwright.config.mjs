import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sharedChromiumExecutable =
  '/Users/hkyutong/Library/Application Support/PlaywrightChromium/chromium-1217/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing'

export default {
  testDir: path.join(__dirname, 'playwright'),
  testMatch: '**/*.spec.cjs',
  timeout: 120000,
  expect: {
    timeout: 20000,
  },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  globalSetup: path.join(__dirname, 'playwright.global-setup.mjs'),
  use: {
    browserName: 'chromium',
    launchOptions: {
      executablePath: sharedChromiumExecutable,
    },
    headless: true,
    viewport: { width: 1440, height: 1100 },
    actionTimeout: 20000,
    navigationTimeout: 30000,
  },
}
