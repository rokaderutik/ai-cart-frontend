import { expect, test } from '@playwright/test'

const base = 'https://ai-cart-backend.onrender.com/api/v1'
const session = 'SESSION_browser-chat'
const dish = {
  id: 1,
  name: 'Paneer Butter Masala',
  description: 'Paneer in a mild tomato and butter gravy.',
  category: 'MAIN',
  ingredients: ['paneer', 'tomato', 'cream'],
  dietaryTags: ['VEGETARIAN'],
  spiceLevel: 1,
  price: 250,
  currency: 'INR',
  available: true,
}
const source = {
  sourceId: 'menu:paneer',
  sourceType: 'MENU',
  title: 'Menu evidence',
  snippet: 'A mild vegetarian main.',
  content:
    'Made with paneer, tomatoes, butter and cream. Spice level 1 out of 5.',
}
const envelope = (data) => ({
  data,
  error: null,
  timestamp: new Date().toISOString(),
})
const makeCart = (quantity) => ({
  cartId: 'CART_browser',
  items: quantity
    ? [
        {
          itemId: 1,
          name: dish.name,
          quantity,
          unitPrice: 250,
          lineTotal: quantity * 250,
          available: true,
        },
      ]
    : [],
  total: quantity * 250,
  currency: 'INR',
})

for (const width of [320, 390, 768, 1440]) {
  test(`recommendation, evidence, cart, follow-up, and refresh flow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    let quantity = 0
    const messages = []
    const requests = []
    await page.route(`${base}/**`, async (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname.replace('/api/v1', '')
      const respond = (data, status = 200) =>
        route.fulfill({ status, json: envelope(data) })
      if (path === '/health') return respond({ status: 'UP' })
      if (path === '/sessions')
        return respond(
          { sessionId: session, expiresAt: '2099-01-01T00:00:00Z' },
          201,
        )
      expect(request.headers()['x-session-id']).toBe(session)
      if (path === '/cart') return respond(makeCart(quantity))
      if (path === '/chat/messages')
        return respond({ messages, nextBefore: null })
      if (path === '/cart/items/1') {
        quantity = request.postDataJSON().quantity
        return respond(makeCart(quantity))
      }
      if (path === '/chat') {
        const body = request.postDataJSON()
        requests.push(body)
        const first = requests.length === 1
        const cartAction =
          body.message === 'Add the first dish.' ||
          body.message === 'Make that two.'
        if (body.message === 'Add the first dish.') quantity++
        if (body.message === 'Make that two.') quantity = 2
        const reply = first
          ? 'Our mild paneer curry is a good match.'
          : cartAction
            ? `Your cart now has ${quantity} paneer dishes.`
            : 'The paneer curry is the milder option.'
        const userId = messages.length + 1
        const data = {
          requestId: body.requestId,
          assistantMessageId: userId + 1,
          outcome: cartAction ? 'CART_UPDATED' : 'ANSWERED',
          reply,
          sections: first ? [{ text: reply, sourceIds: ['menu:paneer'] }] : [],
          recommendations: first
            ? [
                dish,
                { ...dish, id: 2, name: 'Unavailable curry', available: false },
              ]
            : [],
          sources: first ? [source] : [],
          actionResult: cartAction
            ? { outcome: 'CART_UPDATED', quantity }
            : null,
          cart: makeCart(quantity),
        }
        messages.push(
          {
            id: userId,
            role: 'USER',
            requestId: body.requestId,
            content: body.message,
            requestStatus: 'COMPLETED',
            metadata: {},
          },
          {
            id: userId + 1,
            role: 'ASSISTANT',
            requestId: body.requestId,
            content: reply,
            requestStatus: 'COMPLETED',
            metadata: data,
          },
        )
        return respond(data)
      }
      throw new Error(`Unexpected API path: ${path}`)
    })
    await page.goto('/chat')
    const input = page.getByRole('textbox', { name: 'Message AI Cart' })
    await expect(input).toBeEnabled()
    await input.fill('Suggest mild vegetarian mains under 300 rupees.')
    await input.press('Enter')
    await expect(
      page.getByText('Our mild paneer curry is a good match.'),
    ).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Add Unavailable curry' }),
    ).toBeDisabled()
    await page
      .getByRole('button', { name: 'View source: Menu evidence' })
      .click()
    await expect(page.getByRole('dialog')).toHaveAccessibleName('Menu evidence')
    await expect(page.getByText(source.content)).toBeVisible()
    await page.getByRole('button', { name: 'Close panel' }).click()
    await page.getByRole('button', { name: `Add ${dish.name}` }).click()
    await expect(page.getByText('1 in cart')).toBeVisible()
    if (width < 1024)
      await page.getByRole('button', { name: 'View cart' }).click()
    const cart = page.getByRole('region', { name: 'Your cart' })
    await cart.getByRole('button', { name: `Increase ${dish.name}` }).click()
    await expect(cart.getByLabel('Quantity: 2', { exact: true })).toBeVisible()
    await cart.getByRole('button', { name: `Decrease ${dish.name}` }).click()
    await expect(cart.getByLabel('Quantity: 1', { exact: true })).toBeVisible()
    await cart.getByRole('button', { name: `Remove ${dish.name}` }).click()
    await expect(
      cart.getByText('A little room for something good.'),
    ).toBeVisible()
    if (width < 1024)
      await page.getByRole('button', { name: 'Close panel' }).click()
    for (const message of [
      'Which of those is less spicy?',
      'Add the first dish.',
      'Make that two.',
    ]) {
      await expect(input).toBeEnabled()
      await input.fill(message)
      await input.press('Enter')
      await expect(input).toBeEnabled()
    }
    expect(quantity).toBe(2)
    expect(new Set(requests.map((request) => request.requestId)).size).toBe(4)
    await expect(
      page.getByRole('article', { name: `Recommendation 1: ${dish.name}` }),
    ).toBeVisible()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `test-results/stage3-chat-${width}.png`,
      fullPage: true,
    })
    if (width < 1024) {
      await page.getByRole('button', { name: 'View cart' }).click()
      await expect(
        page
          .getByRole('region', { name: 'Your cart' })
          .getByLabel('Quantity: 2', { exact: true }),
      ).toBeVisible()
      await page.screenshot({
        path: `test-results/stage3-cart-${width}.png`,
        fullPage: true,
      })
    }
    await page.reload()
    await expect(input).toBeEnabled()
    await expect(
      page.getByRole('article', { name: `Recommendation 1: ${dish.name}` }),
    ).toBeVisible()
    await expect(
      page.getByText('Make that two.', { exact: true }),
    ).toBeVisible()
    expect(quantity).toBe(2)
    expect(errors).toEqual([])
  })
}

test('an unavailable model offers an explicit retry with the same request ID', async ({
  page,
}) => {
  const attempts = []
  await page.route(`${base}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    const respond = (data, status = 200) =>
      route.fulfill({ status, json: envelope(data) })
    if (path === '/health') return respond({ status: 'UP' })
    if (path === '/sessions')
      return respond(
        { sessionId: session, expiresAt: '2099-01-01T00:00:00Z' },
        201,
      )
    if (path === '/cart') return respond(makeCart(0))
    if (path === '/chat/messages')
      return respond({ messages: [], nextBefore: null })
    if (path === '/chat') {
      const body = route.request().postDataJSON()
      attempts.push(body)
      if (attempts.length === 1)
        return route.fulfill({
          status: 503,
          json: {
            data: null,
            error: {
              code: 'CHAT_MODEL_UNAVAILABLE',
              message: 'The assistant is temporarily unavailable.',
            },
          },
        })
      return respond({
        requestId: body.requestId,
        assistantMessageId: 2,
        reply: 'Welcome back. How can I help?',
        recommendations: [],
        sources: [],
        cart: makeCart(0),
        outcome: 'GREETING',
      })
    }
  })
  await page.goto('/chat')
  const input = page.getByRole('textbox', { name: 'Message AI Cart' })
  await expect(input).toBeEnabled()
  await input.fill('Hello')
  await input.press('Enter')
  await expect(page.getByRole('alert')).toContainText(
    'The assistant is temporarily unavailable.',
  )
  await expect(input).toBeDisabled()
  await page.getByRole('button', { name: 'Retry message' }).click()
  await expect(page.getByText('Welcome back. How can I help?')).toBeVisible()
  await expect(input).toBeEnabled()
  expect(attempts).toHaveLength(2)
  expect(attempts[0]).toEqual(attempts[1])
  await expect(page.getByText('Hello', { exact: true })).toHaveCount(1)
})
