import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  grep: /@offline/,
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
