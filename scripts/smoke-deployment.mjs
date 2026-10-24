import process from 'node:process'
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium, expect } from '@playwright/test'

/** Opt-in smoke check; never publishes and never uses an existing browser session. */
const report = {
  frontend: null,
  api: null,
  checks: [],
  cleanup: [],
  passed: false,
}
let browser
let context
let page
const issued = new Set()
const observed = []
const apiOrigins = new Set()

try {
  if (!process.env.FRONTEND_URL)
    throw new Error(
      'Set FRONTEND_URL to the frontend origin to check. Set API_BASE_URL if it differs from the Render default.',
    )
  const frontend = new URL(process.env.FRONTEND_URL)
  const api = new URL(
    process.env.API_BASE_URL || 'https://ai-cart-backend.onrender.com/api/v1',
  )
  if (
    !['http:', 'https:'].includes(frontend.protocol) ||
    frontend.pathname !== '/' ||
    frontend.search ||
    frontend.hash ||
    frontend.username ||
    frontend.password
  )
    throw new Error(
      'FRONTEND_URL must be an HTTP(S) origin without credentials, query, or path.',
    )
  if (
    !['http:', 'https:'].includes(api.protocol) ||
    !['/api/v1', '/api/v1/'].includes(api.pathname) ||
    api.search ||
    api.hash ||
    api.username ||
    api.password
  )
    throw new Error(
      'API_BASE_URL must end in /api/v1 and contain no credentials or query.',
    )
  const base = `${api.origin}/api/v1`
  report.frontend = frontend.origin
  report.api = base
  browser = await chromium.launch({
    channel:
      process.env.PLAYWRIGHT_BROWSER === 'chromium' ? undefined : 'msedge',
    headless: true,
  })
  context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  })
  page = await context.newPage()
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.includes('/api/')) apiOrigins.add(url.origin)
  })
  page.on('response', async (response) => {
    if (!response.url().startsWith(`${base}/`)) return
    const path = new URL(response.url()).pathname
    observed.push({
      path,
      method: response.request().method(),
      status: response.status(),
    })
    if (
      path === '/api/v1/sessions' &&
      response.request().method() === 'POST' &&
      response.ok()
    ) {
      try {
        const token = (await response.json())?.data?.sessionId
        if (typeof token === 'string') issued.add(token)
      } catch {
        /* Malformed responses are reported by the UI check. */
      }
    }
  })
  const response = await page.goto(new URL('/chat', frontend).href)
  if (response?.status() !== 200)
    throw new Error(
      'A direct /chat visit did not return HTTP 200. Check the SPA routing configuration.',
    )
  const input = page.getByRole('textbox', { name: 'Message AI Cart' })
  await Promise.race([
    expect(input).toBeEnabled({ timeout: 190_000 }),
    page
      .getByRole('heading', { name: 'Connection setup needed' })
      .waitFor({ state: 'visible', timeout: 190_000 })
      .then(() => {
        throw new Error(
          'The published frontend reports invalid/missing service configuration. Set VITE_API_BASE_URL to the versioned API base and rebuild.',
        )
      }),
    page
      .getByRole('heading', { name: 'We couldn’t open your conversation' })
      .waitFor({ state: 'visible', timeout: 190_000 })
      .then(() => {
        throw new Error(
          'The frontend health gate passed but session/history/cart startup failed. Inspect the reported UI state and API requests.',
        )
      }),
  ])
  if (
    !observed.some(
      (request) => request.path === '/api/v1/health' && request.status === 200,
    ) ||
    !issued.size
  )
    throw new Error(
      'The frontend did not initialize against the expected API. Verify VITE_API_BASE_URL and rebuild the deployment.',
    )
  const health = await page.evaluate(async (url) => {
    const result = await fetch(`${url}/health`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(60_000),
    })
    return { status: result.status, data: (await result.json())?.data?.status }
  }, base)
  if (health.status !== 200 || health.data !== 'UP')
    throw new Error(
      'The deployed health endpoint did not report UP in the browser.',
    )
  report.checks.push(
    'Direct /chat SPA visit',
    'Browser health and CORS',
    'Anonymous session, history and cart startup',
  )

  if (process.env.SMOKE_CHAT === 'true') {
    async function chat(message) {
      await expect(input).toBeEnabled({ timeout: 20_000 })
      await input.fill(message)
      const pending = page.waitForResponse(
        (reply) =>
          reply.url() === `${base}/chat` && reply.request().method() === 'POST',
        { timeout: 130_000 },
      )
      await input.press('Enter')
      const reply = await pending
      const body = await reply.json()
      if (!reply.ok() || body?.error)
        throw new Error(
          `Live chat failed: ${body?.error?.code || reply.status()}`,
        )
      await expect(input).toBeEnabled({ timeout: 20_000 })
      return body.data
    }
    const answer = await chat('Suggest mild vegetarian mains under 300 rupees.')
    const dish = answer?.recommendations?.find(
      (item) => item?.available === true,
    )
    if (!dish)
      throw new Error(
        'No available recommendation was returned for the optional live-chat smoke question.',
      )
    await page
      .getByRole('button', { name: `Add ${dish.name}`, exact: true })
      .click()
    await expect(
      page
        .getByRole('region', { name: 'Your cart' })
        .getByLabel('Quantity: 1', { exact: true }),
    ).toBeVisible()
    await chat('Add the first dish.')
    const final = await chat('Make that two.')
    if (
      final?.cart?.items?.find(
        (item) => item.itemId === answer.recommendations[0]?.id,
      )?.quantity !== 2
    )
      throw new Error(
        'The optional conversational cart check did not confirm quantity two.',
      )
    report.checks.push(
      'Live recommendations, manual Add and conversational cart updates',
    )
  }

  const before = await page.evaluate(() =>
    sessionStorage.getItem('ai-cart.session-id'),
  )
  await page.reload()
  await expect(input).toBeEnabled({ timeout: 30_000 })
  if (
    (await page.evaluate(() =>
      sessionStorage.getItem('ai-cart.session-id'),
    )) !== before
  )
    throw new Error('Refreshing unexpectedly replaced the active session.')
  report.checks.push('Refresh restores the same session')
  await page.goto(new URL('/__smoke_not_found__', frontend).href)
  await expect(page.getByRole('link', { name: 'Back to home' })).toBeVisible()
  report.checks.push('Unknown-route fallback')
  report.passed = true
} catch (error) {
  report.error = error.message.split('\n')[0]
  report.uiStatus = await page
    ?.getByRole('status')
    .allTextContents()
    .catch(() => [])
  report.apiOrigins = [...apiOrigins]
  process.exitCode = 1
} finally {
  if (context) {
    for (const token of issued) {
      try {
        const response = await context.request.delete(
          `${report.api}/sessions/current`,
          { headers: { 'X-Session-Id': token }, timeout: 15_000 },
        )
        report.cleanup.push({ status: response.status() })
        if (![204, 401].includes(response.status())) {
          report.passed = false
          process.exitCode = 1
        }
      } catch {
        report.cleanup.push({
          error: 'Temporary-session cleanup could not be confirmed.',
        })
        report.passed = false
        process.exitCode = 1
      }
    }
    await context.close()
  }
  await browser?.close()
  report.requests = observed
  await mkdir('test-results', { recursive: true })
  await writeFile(
    'test-results/deployment-smoke.json',
    `${JSON.stringify(report, null, 2)}\n`,
  )
  console.log(JSON.stringify(report, null, 2))
}
