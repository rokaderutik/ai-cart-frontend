import { expect, test } from '@playwright/test'

const base = 'https://ai-cart-backend.onrender.com/api/v1'
const token = 'SESSION_recovery'
const requestId = '1990c8a4-cd80-46ca-a5a7-cabf64da8242'
const envelope = (data) => ({
  data,
  error: null,
  timestamp: new Date().toISOString(),
})
const makeCart = (quantity = 0) => ({
  cartId: 'CART_recovery',
  items: quantity
    ? [
        {
          itemId: 1,
          name: 'Paneer',
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
const user = (id, status = 'COMPLETED', rid = `turn-${id}`) => ({
  id,
  role: 'USER',
  requestId: rid,
  content: `Question ${id}`,
  requestStatus: status,
  metadata: {},
})
const answer = (id, rid, content = 'Your dish was added.') => ({
  id,
  role: 'ASSISTANT',
  requestId: rid,
  content,
  requestStatus: 'COMPLETED',
  metadata: { sections: [], recommendations: [], sources: [] },
})

async function setup(page, handlers) {
  await page.route(`${base}/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/api/v1', '')
    const respond = (data, status = 200) =>
      route.fulfill({ status, json: envelope(data) })
    if (path === '/health') return respond({ status: 'UP' })
    if (path === '/sessions')
      return respond(
        { sessionId: token, expiresAt: '2099-01-01T00:00:00Z' },
        201,
      )
    expect(request.headers()['x-session-id']).toBe(token)
    return handlers({ route, request, url, path, respond })
  })
}

for (const width of [320, 1440]) {
  test(`older pages retain reading position and deduplicate overlap at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    const cursors = []
    let fail = true
    await setup(page, ({ path, url, route, respond }) => {
      if (path === '/cart') return respond(makeCart(2))
      if (path === '/chat/messages') {
        const cursor = url.searchParams.get('before')
        if (!cursor)
          return respond({
            messages: Array.from({ length: 10 }, (_, index) =>
              user(index + 51),
            ),
            nextBefore: 51,
          })
        cursors.push(cursor)
        if (fail) {
          fail = false
          return route.fulfill({
            status: 500,
            json: {
              data: null,
              error: {
                message: 'History is temporarily unavailable.',
                code: 'INTERNAL_ERROR',
              },
            },
          })
        }
        return respond({
          messages: Array.from({ length: 11 }, (_, index) => user(index + 41)),
          nextBefore: null,
        })
      }
    })
    await page.goto('/chat')
    const region = page.getByRole('region', { name: 'Messages', exact: true })
    const load = page.getByRole('button', { name: 'Load earlier messages' })
    await expect(load).toBeVisible()
    await load.click()
    await expect(page.getByRole('alert')).toContainText(
      'History is temporarily unavailable.',
    )
    await load.scrollIntoViewIfNeeded()
    const anchor = page.locator('[data-message-id="51"]')
    const before = await anchor.boundingBox()
    await load.click()
    await expect(region.locator('article')).toHaveCount(20)
    const after = await anchor.boundingBox()
    expect(Math.abs(before.y - after.y)).toBeLessThan(3)
    await expect(page.getByText('10 earlier messages loaded.')).toBeVisible()
    await expect(load).toHaveCount(0)
    expect(cursors).toEqual(['51', '51'])
    await expect(page.locator('[data-message-id="51"]')).toHaveCount(1)
    await expect(page.getByRole('textbox')).toBeEnabled()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `test-results/stage4-pagination-${width}.png`,
      fullPage: true,
    })
  })
}

test('a refreshed failed request retries the stored backend ID and text, and refreshes the replayed cart', async ({
  page,
}) => {
  const original = {
    ...user(1, 'FAILED', requestId),
    content: 'Add the first dish.',
  }
  let completed = false
  const posts = []
  await setup(page, ({ path, request, respond }) => {
    if (path === '/cart') return respond(makeCart(completed ? 2 : 0))
    if (path === '/chat/messages')
      return respond({
        messages: completed
          ? [{ ...original, requestStatus: 'COMPLETED' }, answer(2, requestId)]
          : [original],
        nextBefore: null,
      })
    if (path === '/chat') {
      posts.push(request.postDataJSON())
      completed = true
      return respond({
        requestId,
        assistantMessageId: 2,
        reply: 'Your dish was added.',
        cart: makeCart(1),
        recommendations: [],
        sources: [],
      })
    }
  })
  await page.goto('/chat')
  await expect(page.getByRole('textbox')).toBeDisabled()
  await page.getByRole('button', { name: 'Retry message' }).click()
  await expect(page.getByRole('textbox')).toBeEnabled()
  await expect(
    page
      .getByRole('region', { name: 'Your cart' })
      .getByLabel('Quantity: 2', { exact: true }),
  ).toBeVisible()
  expect(posts).toEqual([{ requestId, message: 'Add the first dish.' }])
  await expect(
    page.getByText('Add the first dish.', { exact: true }),
  ).toHaveCount(1)
  await page.reload()
  await expect(page.getByRole('textbox')).toBeEnabled()
  expect(await page.evaluate(() => Object.keys(sessionStorage))).toEqual([
    'ai-cart.session-id',
  ])
  expect(posts).toHaveLength(1)
})

test('a lost chat response is reconciled without another POST or duplicate cart mutation', async ({
  page,
}) => {
  let completed = false
  let posts = 0
  let rid
  await setup(page, ({ path, route, request, respond }) => {
    if (path === '/cart') return respond(makeCart(completed ? 1 : 0))
    if (path === '/chat/messages')
      return respond({
        messages: completed
          ? [
              { ...user(1, 'COMPLETED', rid), content: 'Add one.' },
              answer(2, rid),
            ]
          : [],
        nextBefore: null,
      })
    if (path === '/chat') {
      posts++
      rid = request.postDataJSON().requestId
      completed = true
      return route.abort('failed')
    }
  })
  await page.goto('/chat')
  const input = page.getByRole('textbox')
  await expect(input).toBeEnabled()
  await input.fill('Add one.')
  await input.press('Enter')
  await page.getByRole('button', { name: 'Retry message' }).click()
  await expect(input).toBeEnabled()
  await expect(page.getByText('Your dish was added.')).toBeVisible()
  await expect(page.getByText('Add one.', { exact: true })).toHaveCount(1)
  expect(posts).toBe(1)
})

test('an interrupted in-progress turn requires a check before recovering the original request', async ({
  page,
}) => {
  let completed = false
  const posts = []
  await setup(page, ({ path, request, respond }) => {
    if (path === '/cart') return respond(makeCart(completed ? 1 : 0))
    if (path === '/chat/messages')
      return respond({
        messages: completed
          ? [user(1, 'COMPLETED', requestId), answer(2, requestId)]
          : [user(1, 'IN_PROGRESS', requestId)],
        nextBefore: null,
      })
    if (path === '/chat') {
      posts.push(request.postDataJSON())
      completed = true
      return respond({
        requestId,
        assistantMessageId: 2,
        reply: 'Your dish was added.',
        cart: makeCart(1),
        recommendations: [],
        sources: [],
      })
    }
  })
  await page.goto('/chat')
  await expect(page.getByRole('textbox')).toBeDisabled()
  await expect(
    page.getByRole('button', { name: 'Recover original request' }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Check conversation' }).click()
  await page.getByRole('button', { name: 'Recover original request' }).click()
  await expect(page.getByRole('textbox')).toBeEnabled()
  expect(posts).toEqual([{ requestId, message: 'Question 1' }])
})

test('stale retries require explicit confirmation before sending a new request ID', async ({
  page,
}) => {
  const posts = []
  let stale = false
  let done = false
  const original = user(1, 'FAILED', requestId)
  await setup(page, ({ path, route, request, respond }) => {
    if (path === '/cart') return respond(makeCart(done ? 1 : 0))
    if (path === '/chat/messages')
      return respond({
        messages: stale ? [original, user(3), answer(4, 'turn-3')] : [original],
        nextBefore: null,
      })
    if (path === '/chat') {
      const body = request.postDataJSON()
      posts.push(body)
      if (!stale) {
        stale = true
        return route.fulfill({
          status: 409,
          json: {
            data: null,
            error: {
              code: 'CHAT_RETRY_STALE',
              message: 'A newer turn exists.',
            },
          },
        })
      }
      done = true
      return respond({
        requestId: body.requestId,
        assistantMessageId: 6,
        reply: 'New request completed.',
        cart: makeCart(1),
      })
    }
  })
  await page.goto('/chat')
  await page.getByRole('button', { name: 'Retry message' }).click()
  await page.getByRole('button', { name: 'Check conversation' }).click()
  await page.getByRole('button', { name: 'Send as new message' }).click()
  await expect(page.getByRole('alertdialog')).toHaveAccessibleName(
    'Send this as a new message?',
  )
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  expect(posts).toHaveLength(1)
  await page.getByRole('button', { name: 'Send as new message' }).click()
  await page
    .getByRole('button', { name: 'Send new message', exact: true })
    .click()
  await expect(page.getByText('New request completed.')).toBeVisible()
  expect(posts).toHaveLength(2)
  expect(posts[1].requestId).not.toBe(posts[0].requestId)
  expect(posts[1].message).toBe(posts[0].message)
})

test('offline state preserves a draft and never automatically sends it on reconnect', async ({
  page,
  context,
}) => {
  let posts = 0
  await setup(page, ({ path, respond }) => {
    if (path === '/cart') return respond(makeCart())
    if (path === '/chat/messages')
      return respond({ messages: [], nextBefore: null })
    if (path === '/chat') posts++
  })
  await page.goto('/chat')
  const input = page.getByRole('textbox')
  await expect(input).toBeEnabled()
  await input.fill('Keep this draft')
  await context.setOffline(true)
  await expect(page.getByRole('alert')).toContainText('You’re offline.')
  await expect(input).toBeDisabled()
  await context.setOffline(false)
  await expect(input).toBeEnabled()
  await expect(input).toHaveValue('Keep this draft')
  expect(posts).toBe(0)
})
