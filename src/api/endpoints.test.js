import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import {
  server,
  API_URL,
  TEST_SESSION,
  envelope,
  emptyCart,
} from '@/test/server'
import { createSession, endSession } from '@/features/session/session.api'
import { getCart, setCartItemQuantity } from '@/features/cart/cart.api'
import { getMessages, sendMessage } from '@/features/chat/chat.api'

describe('versioned API contracts', () => {
  it('creates without a token/body, and handles an empty deletion response', async () => {
    server.use(
      http.post(`${API_URL}/sessions`, async ({ request }) => {
        expect(request.headers.get('X-Session-Id')).toBeNull()
        expect(await request.text()).toBe('')
        return HttpResponse.json(
          envelope({
            sessionId: TEST_SESSION,
            expiresAt: '2099-01-01T00:00:00Z',
          }),
          { status: 201 },
        )
      }),
      http.delete(`${API_URL}/sessions/current`, ({ request }) => {
        expect(request.headers.get('X-Session-Id')).toBe(TEST_SESSION)
        return new HttpResponse(null, { status: 204 })
      }),
    )
    const session = await createSession()
    expect(session.sessionId).toBe(TEST_SESSION)
    await expect(
      endSession({ sessionId: TEST_SESSION }),
    ).resolves.toBeUndefined()
  })

  it('forwards the history cursor and limit as query parameters with a scoped token', async () => {
    server.use(
      http.get(`${API_URL}/chat/messages`, ({ request }) => {
        const url = new URL(request.url)
        expect(url.searchParams.get('before')).toBe('42')
        expect(url.searchParams.get('limit')).toBe('25')
        expect(request.headers.get('X-Session-Id')).toBe(TEST_SESSION)
        return HttpResponse.json(envelope({ messages: [], nextBefore: null }))
      }),
    )
    await expect(
      getMessages({ sessionId: TEST_SESSION, limit: 25, before: 42 }),
    ).resolves.toEqual({ messages: [], nextBefore: null })
  })

  it('keeps documented error codes, messages, and validation fields', async () => {
    server.use(
      http.get(`${API_URL}/cart`, () =>
        HttpResponse.json(
          {
            data: null,
            error: {
              status: 400,
              code: 'VALIDATION_ERROR',
              message: 'Please correct the quantity.',
              errors: [{ field: 'quantity', message: 'Maximum 20' }],
            },
          },
          { status: 400 },
        ),
      ),
    )
    await expect(getCart({ sessionId: TEST_SESSION })).rejects.toMatchObject({
      kind: 'http',
      status: 400,
      code: 'VALIDATION_ERROR',
      message: 'Please correct the quantity.',
      errors: [{ field: 'quantity', message: 'Maximum 20' }],
    })
  })

  it.each([{}, null, { cartId: 'x', items: [], total: '0', currency: 'INR' }])(
    'rejects incomplete cart data: %j',
    async (cart) => {
      server.use(
        http.get(`${API_URL}/cart`, () => HttpResponse.json(envelope(cart))),
      )
      await expect(getCart({ sessionId: TEST_SESSION })).rejects.toMatchObject({
        kind: 'protocol',
      })
    },
  )

  it('rejects a missing envelope and an application error with HTTP 200', async () => {
    server.use(http.get(`${API_URL}/cart`, () => HttpResponse.json(emptyCart)))
    await expect(getCart({ sessionId: TEST_SESSION })).rejects.toMatchObject({
      kind: 'protocol',
    })
    server.use(
      http.get(`${API_URL}/cart`, () =>
        HttpResponse.json({
          data: null,
          error: { code: 'INVALID_SESSION', message: 'Invalid session' },
        }),
      ),
    )
    await expect(getCart({ sessionId: TEST_SESSION })).rejects.toMatchObject({
      code: 'INVALID_SESSION',
      message: 'Invalid session',
    })
  })

  it('sets absolute quantities with JSON and returns the server cart', async () => {
    server.use(
      http.put(`${API_URL}/cart/items/1`, async ({ request }) => {
        expect(request.headers.get('Content-Type')).toContain(
          'application/json',
        )
        expect(request.headers.get('X-Session-Id')).toBe(TEST_SESSION)
        expect(await request.json()).toEqual({ quantity: 0 })
        return HttpResponse.json(envelope(emptyCart))
      }),
    )
    await expect(
      setCartItemQuantity({ sessionId: TEST_SESSION, itemId: 1, quantity: 0 }),
    ).resolves.toEqual(emptyCart)
  })

  it('sends only the caller-owned chat ID and exact text', async () => {
    const requestId = crypto.randomUUID()
    server.use(
      http.post(`${API_URL}/chat`, async ({ request }) => {
        expect(await request.json()).toEqual({
          requestId,
          message: 'Suggest a dish',
        })
        expect(request.headers.get('X-Session-Id')).toBe(TEST_SESSION)
        return HttpResponse.json(
          envelope({ requestId, reply: 'Hello', cart: emptyCart }),
        )
      }),
    )
    await expect(
      sendMessage({
        sessionId: TEST_SESSION,
        requestId,
        message: 'Suggest a dish',
      }),
    ).resolves.toMatchObject({ requestId, reply: 'Hello' })
  })
})
