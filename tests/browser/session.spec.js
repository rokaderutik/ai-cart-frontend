import { expect, test } from '@playwright/test'

const base = 'https://ai-cart-backend.onrender.com/api/v1'
const envelope = (data) => ({
  data,
  error: null,
  timestamp: new Date().toISOString(),
})

for (const width of [320, 768, 1440]) {
  test(`restored session and confirmed reset work at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 })
    let creations = 0
    let deletions = 0
    let current = 'SESSION_old'
    await page.addInitScript(() => {
      if (!sessionStorage.getItem('ai-cart.session-id'))
        sessionStorage.setItem('ai-cart.session-id', 'SESSION_old')
    })
    await page.route(`${base}/health`, (route) =>
      route.fulfill({ json: envelope({ status: 'UP' }) }),
    )
    await page.route(`${base}/sessions`, (route) => {
      creations++
      current = 'SESSION_new'
      return route.fulfill({
        status: 201,
        json: envelope({
          sessionId: current,
          expiresAt: '2099-01-01T00:00:00Z',
        }),
      })
    })
    await page.route(`${base}/sessions/current`, (route) => {
      deletions++
      return route.fulfill({ status: 204 })
    })
    await page.route(`${base}/chat/messages*`, (route) =>
      route.fulfill({
        json: envelope({
          messages:
            current === 'SESSION_old'
              ? [
                  {
                    id: 1,
                    role: 'USER',
                    content: 'Something mildly spicy, please.',
                    requestStatus: 'COMPLETED',
                    metadata: {},
                  },
                  {
                    id: 2,
                    role: 'ASSISTANT',
                    content: 'Try Paneer Butter Masala.',
                    requestStatus: 'COMPLETED',
                    metadata: {
                      recommendations: [
                        {
                          id: 1,
                          name: 'Paneer Butter Masala',
                          description: 'A creamy tomato and butter curry.',
                          price: 250,
                          available: true,
                        },
                      ],
                      sources: [
                        {
                          sourceId: 'menu:paneer',
                          title: 'Menu evidence',
                          content:
                            'Made with paneer, tomatoes, butter and cream.',
                        },
                      ],
                    },
                  },
                ]
              : [],
          nextBefore: null,
        }),
      }),
    )
    await page.route(`${base}/cart`, (route) =>
      route.fulfill({
        json: envelope({
          cartId: 'CART_current',
          items:
            current === 'SESSION_old'
              ? [
                  {
                    itemId: 1,
                    name: 'Paneer Butter Masala',
                    quantity: 2,
                    unitPrice: 250,
                    lineTotal: 500,
                    available: true,
                  },
                ]
              : [],
          total: current === 'SESSION_old' ? 500 : 0,
          currency: 'INR',
        }),
      }),
    )
    await page.goto('/chat')
    await expect(
      page.getByRole('textbox', { name: 'Message AI Cart' }),
    ).toBeEnabled()
    await expect(
      page.getByText('Something mildly spicy, please.'),
    ).toBeVisible()
    await page.getByText('Supporting sources (1)').click()
    await page
      .getByRole('button', { name: 'View source: Menu evidence' })
      .click()
    await expect(
      page.getByText('Made with paneer, tomatoes, butter and cream.'),
    ).toBeVisible()
    await page.getByRole('button', { name: 'Close panel' }).click()
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true)
    await page.screenshot({
      path: `test-results/restored-chat-${width}.png`,
      fullPage: true,
    })
    await page.reload()
    await expect(
      page.getByText('Something mildly spicy, please.'),
    ).toBeVisible()
    expect(creations).toBe(0)
    await page.getByRole('button', { name: 'New Session' }).click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
    await page.screenshot({
      path: `test-results/reset-dialog-${width}.png`,
      fullPage: true,
    })
    await page.getByRole('button', { name: 'Keep conversation' }).click()
    expect(deletions).toBe(0)
    await page.getByRole('button', { name: 'New Session' }).click()
    await page.getByRole('button', { name: 'Start new session' }).click()
    await expect(
      page.getByRole('heading', { name: 'Good taste starts here.' }),
    ).toBeVisible()
    expect(deletions).toBe(1)
    expect(creations).toBe(1)
    expect(
      await page.evaluate(() => sessionStorage.getItem('ai-cart.session-id')),
    ).toBe('SESSION_new')
  })
}
