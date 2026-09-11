import process from 'node:process'
import { defineConfig, devices } from '@playwright/test'

const PORT = 2036
const baseURL = `http://127.0.0.1:${PORT}`

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'line',
  /*
   * CI runs the whole city through swiftshader on a shared runner and is roughly three times
   * slower than a local machine — a suite that takes 2 minutes here takes 8 there. Playwright's
   * 30 s default left the council flow finishing its entry sequence with nothing to spare.
   */
  timeout: process.env.CI ? 90_000 : 30_000,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium-webgl',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--enable-webgl', '--use-angle=swiftshader'],
        },
      },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // Nuxt's cold start in CI regularly exceeds Playwright's 60 s default.
    timeout: 180_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
