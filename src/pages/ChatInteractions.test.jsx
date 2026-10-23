import { StrictMode } from 'react'
import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { AppRoutes } from '@/app/router'
import { ReadinessProvider } from '@/app/ReadinessProvider'
import { SessionProvider } from '@/app/SessionProvider'
import { server, API_URL, envelope, emptyCart } from '@/test/server'

const dish = {
  id: 1,
  name: 'Paneer Butter Masala',
  description: 'A creamy curry.',
  dietaryTags: ['VEGETARIAN'],
  spiceLevel: 1,
  price: 250,
  currency: 'INR',
  available: true,
}
const source = {
  sourceId: 'menu:paneer',
  title: 'Menu evidence',
  sourceType: 'MENU',
  snippet: 'A mild curry.',
  content: 'Paneer with tomato, butter and cream.',
}
const cartFor = (quantity) => ({
  ...emptyCart,
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
})
const reply = (requestId, extra = {}) => ({
  requestId,
  assistantMessageId: 102,
  reply: 'Fallback answer must not be duplicated.',
  sections: [
    { text: 'Try our mild paneer curry.', sourceIds: ['menu:paneer'] },
  ],
  recommendations: [
    dish,
    { ...dish, id: 2, name: 'Unavailable curry', available: false },
  ],
  sources: [source],
  cart: emptyCart,
  outcome: 'ANSWERED',
  actionResult: null,
  ...extra,
})

function renderPage() {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={['/chat']}>
        <ReadinessProvider>
          <SessionProvider>
            <AppRoutes />
          </SessionProvider>
        </ReadinessProvider>
      </MemoryRouter>
    </StrictMode>,
  )
}

describe('live chat and manual cart UI', () => {
  it('renders sections once, exposes evidence, and adds using the current cart quantity', async () => {
    const writes = []
    server.use(
      http.post(`${API_URL}/chat`, async ({ request }) => {
        const body = await request.json()
        expect(body.message).toBe('A mild main, please.')
        expect(Object.keys(body).sort()).toEqual(['message', 'requestId'])
        return HttpResponse.json(envelope(reply(body.requestId)))
      }),
      http.put(`${API_URL}/cart/items/1`, async ({ request }) => {
        const { quantity } = await request.json()
        writes.push(quantity)
        return HttpResponse.json(envelope(cartFor(quantity)))
      }),
    )
    const user = userEvent.setup()
    renderPage()
    const input = await screen.findByRole('textbox', {
      name: 'Message AI Cart',
    })
    await user.type(input, '  A mild main, please.  ')
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('Try our mild paneer curry.')
    expect(
      screen.queryByText('Fallback answer must not be duplicated.'),
    ).not.toBeInTheDocument()
    expect(
      within(
        screen.getByRole('article', {
          name: 'Recommendation 1: Paneer Butter Masala',
        }),
      ).getByText('Spice 1/5'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Add Unavailable curry' }),
    ).toBeDisabled()
    await user.click(
      screen.getAllByRole('button', { name: 'View source: Menu evidence' })[0],
    )
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Menu evidence')
    expect(screen.getByText(source.content)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Close panel' }))
    const add = screen.getByRole('button', { name: 'Add Paneer Butter Masala' })
    await user.click(add)
    await screen.findByText('1 in cart')
    await user.click(add)
    await screen.findByText('2 in cart')
    expect(writes).toEqual([1, 2])
    expect(screen.getAllByText('₹500.00').length).toBeGreaterThan(0)
  })

  it('shows a pending user message immediately and disables sends and cart edits during chat', async () => {
    let release
    const pending = new Promise((resolve) => {
      release = resolve
    })
    server.use(
      http.get(`${API_URL}/cart`, () =>
        HttpResponse.json(envelope(cartFor(1))),
      ),
      http.post(`${API_URL}/chat`, async ({ request }) => {
        const { requestId } = await request.json()
        await pending
        return HttpResponse.json(
          envelope(
            reply(requestId, {
              sections: [],
              recommendations: [],
              reply: 'Added another one.',
              cart: cartFor(2),
              outcome: 'CART_UPDATED',
              actionResult: { outcome: 'CART_UPDATED', quantity: 2 },
            }),
          ),
        )
      }),
    )
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByRole('textbox'), 'Add one more.{Enter}')
    expect(screen.getByText('Add one more.')).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeDisabled()
    expect(
      screen.getByRole('button', { name: 'Increase Paneer Butter Masala' }),
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'New Session' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'AI Cart is preparing your reply',
    )
    release()
    await screen.findByText('Added another one.')
    await waitFor(() => expect(screen.getByRole('textbox')).toBeEnabled())
    expect(screen.getByText('Cart updated · quantity 2')).toBeInTheDocument()
  })

  it('retains the exact request ID/text on retry and does not duplicate the optimistic message', async () => {
    const calls = []
    server.use(
      http.post(`${API_URL}/chat`, async ({ request }) => {
        const body = await request.json()
        calls.push(body)
        return calls.length === 1
          ? HttpResponse.json(
              {
                data: null,
                error: {
                  code: 'CHAT_MODEL_UNAVAILABLE',
                  message: 'The assistant is temporarily unavailable.',
                },
              },
              { status: 503 },
            )
          : HttpResponse.json(
              envelope(
                reply(body.requestId, {
                  sections: [],
                  recommendations: [],
                  sources: [],
                  reply: 'I can help now.',
                }),
              ),
            )
      }),
    )
    const user = userEvent.setup()
    renderPage()
    await user.type(
      await screen.findByRole('textbox'),
      'Suggest something mild.{Enter}',
    )
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The assistant is temporarily unavailable.',
    )
    expect(screen.getByRole('textbox')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Retry message' }))
    await screen.findByText('I can help now.')
    expect(calls).toHaveLength(2)
    expect(calls[0]).toEqual(calls[1])
    expect(screen.getAllByText('Suggest something mild.')).toHaveLength(1)
  })

  it('allows removal of an unavailable dish while preventing positive quantity changes', async () => {
    const writes = []
    const unavailable = {
      ...cartFor(20),
      items: [{ ...cartFor(20).items[0], available: false }],
    }
    server.use(
      http.get(`${API_URL}/cart`, () =>
        HttpResponse.json(envelope(unavailable)),
      ),
      http.put(`${API_URL}/cart/items/1`, async ({ request }) => {
        writes.push(await request.json())
        return HttpResponse.json(envelope(emptyCart))
      }),
    )
    const user = userEvent.setup()
    renderPage()
    const cart = await screen.findByRole('region', { name: 'Your cart' })
    expect(
      within(cart).getByRole('button', {
        name: 'Increase Paneer Butter Masala',
      }),
    ).toBeDisabled()
    expect(
      within(cart).getByRole('button', {
        name: 'Decrease Paneer Butter Masala',
      }),
    ).toBeDisabled()
    await user.click(
      within(cart).getByRole('button', { name: 'Remove Paneer Butter Masala' }),
    )
    await screen.findByText('Your cart has been updated.')
    expect(writes).toEqual([{ quantity: 0 }])
  })

  it('keeps whitespace unsendable and handles Shift+Enter as a newline', async () => {
    const calls = []
    server.use(
      http.post(`${API_URL}/chat`, async ({ request }) => {
        const body = await request.json()
        calls.push(body)
        return HttpResponse.json(envelope(reply(body.requestId)))
      }),
    )
    const user = userEvent.setup()
    renderPage()
    const input = await screen.findByRole('textbox')
    await user.type(input, '   ')
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
    await user.clear(input)
    await user.type(input, 'A mild main{Shift>}{Enter}{/Shift}under 300')
    expect(calls).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Send message' }))
    await screen.findByText('Try our mild paneer curry.')
    expect(calls[0].message).toBe('A mild main\nunder 300')
  })
})
