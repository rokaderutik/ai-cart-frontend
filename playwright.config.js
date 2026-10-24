import { defineConfig } from '@playwright/test'
import { env } from 'node:process'

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    channel: env.PLAYWRIGHT_BROWSER === 'chromium' ? undefined : 'msedge',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    env: { VITE_API_BASE_URL: 'https://ai-cart-backend.onrender.com/api/v1' },
    command: 'npm run dev -- --host localhost --port 5174 --strictPort',
    url: 'http://localhost:5174',
    reuseExistingServer: false,
  },
})
