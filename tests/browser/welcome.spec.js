import { expect, test } from '@playwright/test'

const healthUrl = 'https://ai-cart-backend.onrender.com/api/v1/health'
const base = 'https://ai-cart-backend.onrender.com/api/v1'
const envelope = (data) => ({
  data,
  error: null,
  timestamp: new Date().toISOString(),
})

test.beforeEach(async ({ page }) => {
  await page.route(`${base}/sessions`, (route) =>
    route.fulfill({
      json: envelope({
        sessionId: 'SESSION_browser',
        expiresAt: '2099-01-01T00:00:00Z',
      }),
      status: 201,
    }),
  )
  await page.route(`${base}/cart`, (route) =>
    route.fulfill({
      json: envelope({
        cartId: 'CART_browser',
        items: [],
        total: 0,
        currency: 'INR',
      }),
    }),
  )
  await page.route(`${base}/chat/messages*`, (route) =>
    route.fulfill({ json: envelope({ messages: [], nextBefore: null }) }),
  )
})

for (const width of [320, 390, 768, 1440]) {
  test(`welcome fits ${width}px and permits keyboard chat entry`, async ({
    page,
  }) => {
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width, height: 1000 })
    await page.route(healthUrl, (route) =>
      route.fulfill({ status: 200, json: envelope({ status: 'UP' }) }),
    )
    await page.goto('/')
    await expect(page.getByRole('status')).toContainText('AI Cart is ready')
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `test-results/welcome-${width}.png`,
      fullPage: true,
    })
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('link', { name: 'Skip to content' }),
    ).toBeFocused()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await expect(
      page.getByRole('link', { name: 'Continue to chat' }),
    ).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL('/chat')
    await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible()
    await expect(
      page.getByRole('textbox', { name: 'Message AI Cart' }),
    ).toBeDisabled()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `test-results/chat-${width}.png`,
      fullPage: true,
    })
    expect(errors).toEqual([])
  })
}

test('direct chat visits initialize a session only after readiness', async ({
  page,
}) => {
  let release
  const pending = new Promise((resolve) => {
    release = resolve
  })
  const apiRequests = []
  page.on('request', (request) => {
    if (request.url().startsWith('https://ai-cart-backend.onrender.com/'))
      apiRequests.push(request.url())
  })
  await page.route(healthUrl, async (route) => {
    await pending
    await route.fulfill({ status: 200, json: envelope({ status: 'UP' }) })
  })
  await page.goto('/chat')
  await expect(
    page.getByRole('button', { name: 'Continue to chat' }),
  ).toBeDisabled()
  await expect(page.getByRole('heading', { name: 'Your cart' })).toHaveCount(0)
  expect(apiRequests).toEqual([healthUrl])
  release()
  await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible()
  expect(apiRequests).toContain(`${base}/sessions`)
  expect(apiRequests).toContain(`${base}/cart`)
  expect(apiRequests).toContain(`${base}/chat/messages?limit=50`)
  await page.screenshot({
    path: 'test-results/chat-desktop.png',
    fullPage: true,
  })
})

test('cold-start copy, failure deadline, reduced motion and retry', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.clock.install()
  await page.route(healthUrl, (route) => route.abort('failed'))
  await page.goto('/')
  await page.clock.runFor(10_001)
  await expect(page.getByRole('status')).toContainText('Render’s free tier')
  expect(
    await page
      .locator('.wake-orbit')
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe('none')
  await page.screenshot({
    path: 'test-results/welcome-waking.png',
    fullPage: true,
  })
  await page.clock.runFor(50_000)
  await expect(page.getByRole('status')).toContainText(
    'Thanks for your patience',
  )
  await page.clock.runFor(120_000)
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await page.unroute(healthUrl)
  await page.route(healthUrl, (route) =>
    route.fulfill({ status: 200, json: envelope({ status: 'UP' }) }),
  )
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(
    page.getByRole('link', { name: 'Continue to chat' }),
  ).toBeVisible()
})

test('unknown route returns home', async ({ page }) => {
  await page.route(healthUrl, (route) =>
    route.fulfill({ status: 200, json: envelope({ status: 'UP' }) }),
  )
  await page.goto('/missing')
  await expect(
    page.getByRole('heading', { name: /This page isn’t on the menu/ }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Back to home' }).click()
  await expect(page).toHaveURL('/')
})
