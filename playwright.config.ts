import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  reporter: 'list',
  workers: 1,
  timeout: 90_000,
  use: {
    headless: false,
    navigationTimeout: 30_000,
    actionTimeout: 10_000,
  },
})
