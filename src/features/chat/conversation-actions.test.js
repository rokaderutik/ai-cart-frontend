import { describe, expect, it, vi } from 'vitest'
import { createSessionStore } from '@/features/session/session-store'
import { emptyCart, TEST_SESSION } from '@/test/server'

const item = {
  itemId: 1,
  name: 'Paneer',
  quantity: 2,
  unitPrice: 250,
  lineTotal: 500,
  available: true,
}
const filledCart = { ...emptyCart, items: [item], total: 500 }
const recommendation = { id: 1, name: 'Paneer', available: true, price: 250 }
const response = (requestId, extra = {}) => ({
  requestId,
  assistantMessageId: 102,
  reply: 'Try Paneer.',
  outcome: 'ANSWERED',
  recommendations: [recommendation],
  sources: [],
  sections: [],
  actionResult: null,
  cart: filledCart,
  ...extra,
})
const deferred = () => {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function setup(overrides = {}) {
  const dependencies = {
    create: vi.fn().mockResolvedValue({ sessionId: TEST_SESSION }),
    end: vi.fn().mockResolvedValue(undefined),
    history: vi.fn().mockResolvedValue({ messages: [], nextBefore: null }),
    cart: vi.fn().mockResolvedValue(emptyCart),
    send: vi.fn(async ({ requestId }) => response(requestId)),
    updateCart: vi.fn().mockResolvedValue(filledCart),
    ...overrides,
  }
  const store = createSessionStore(dependencies)
  await store.ensureSession()
  return { store, ...dependencies }
}

describe('sequential conversation and cart actions', () => {
  it('trims new messages, generates one ID, retains ordered message metadata, and uses server cart totals', async () => {
    const { store, send } = await setup()
    await expect(store.submitMessage('  A mild main, please.  ')).resolves.toBe(
      true,
    )
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        sessionId: TEST_SESSION,
        requestId: expect.any(String),
        message: 'A mild main, please.',
      }),
    )
    const state = store.getSnapshot()
    expect(state.messages).toHaveLength(2)
    expect(state.messages[0]).toMatchObject({
      content: 'A mild main, please.',
      requestStatus: 'COMPLETED',
      role: 'USER',
    })
    expect(state.messages[1]).toMatchObject({
      content: 'Try Paneer.',
      metadata: { recommendations: [recommendation] },
    })
    expect(state.cart).toEqual(filledCart)
    expect(state.pendingTurn).toBeNull()
  })

  it('rejects empty or oversized messages without a request or optimistic message', async () => {
    const { store, send } = await setup()
    await expect(store.submitMessage('   ')).resolves.toBe(false)
    await expect(store.submitMessage('x'.repeat(2001))).resolves.toBe(false)
    expect(send).not.toHaveBeenCalled()
    expect(store.getSnapshot().messages).toEqual([])
  })

  it('blocks overlapping sends and manual edits synchronously', async () => {
    const pending = deferred()
    const { store, send, updateCart } = await setup({
      send: vi.fn(() => pending.promise),
    })
    const first = store.submitMessage('Add the first dish.')
    expect(store.getSnapshot().activity).toBe('chat')
    expect(store.getSnapshot().messages[0].requestStatus).toBe('IN_PROGRESS')
    await expect(store.submitMessage('Make that two.')).resolves.toBe(false)
    await expect(store.updateQuantity(1, 2)).resolves.toBe(false)
    expect(send).toHaveBeenCalledOnce()
    expect(updateCart).not.toHaveBeenCalled()
    pending.resolve(response(send.mock.calls[0][0].requestId))
    await first
  })

  it('keeps older recommendation cards when later replies contain empty lists and uses new IDs per turn', async () => {
    const { store, send } = await setup()
    await store.submitMessage('Recommend a dish')
    send.mockImplementationOnce(async ({ requestId }) =>
      response(requestId, {
        assistantMessageId: 104,
        recommendations: [],
        reply: 'Done.',
        outcome: 'CART_UPDATED',
        actionResult: { quantity: 2, outcome: 'CART_UPDATED' },
      }),
    )
    await store.submitMessage('Make that two.')
    const state = store.getSnapshot()
    expect(state.messages).toHaveLength(4)
    expect(state.messages[1].metadata.recommendations).toEqual([recommendation])
    expect(state.messages[3].metadata.recommendations).toEqual([])
    expect(send.mock.calls[0][0].requestId).not.toBe(
      send.mock.calls[1][0].requestId,
    )
  })

  it.each([
    'CLARIFICATION',
    'NO_EVIDENCE',
    'CART_ACTION_REJECTED',
    'OUT_OF_SCOPE',
  ])(
    'renders the business outcome %s as a successful reply',
    async (outcome) => {
      const { store } = await setup({
        send: vi.fn(async ({ requestId }) => response(requestId, { outcome })),
      })
      await expect(store.submitMessage('A question')).resolves.toBe(true)
      expect(store.getSnapshot().chatError).toBeNull()
      expect(store.getSnapshot().messages[1].metadata.outcome).toBe(outcome)
    },
  )

  it.each([
    { kind: 'network' },
    { kind: 'timeout' },
    { status: 503, code: 'CHAT_MODEL_UNAVAILABLE' },
  ])(
    'retries %j with identical text and ID and refreshes a replayed cart',
    async (error) => {
      const { store, send, cart } = await setup({
        send: vi
          .fn()
          .mockRejectedValueOnce(error)
          .mockImplementation(async ({ requestId }) => response(requestId)),
      })
      await expect(store.submitMessage('Add the first dish.')).resolves.toBe(
        false,
      )
      expect(store.getSnapshot().chatError.retryable).toBe(true)
      await expect(store.submitMessage('Another instruction')).resolves.toBe(
        false,
      )
      await store.retryMessage()
      expect(send).toHaveBeenCalledTimes(2)
      expect(send.mock.calls[0][0].requestId).toBe(
        send.mock.calls[1][0].requestId,
      )
      expect(send.mock.calls[0][0].message).toBe(send.mock.calls[1][0].message)
      expect(store.getSnapshot().messages).toHaveLength(2)
      expect(cart).toHaveBeenCalledTimes(3)
      expect(store.getSnapshot().cart).toEqual(emptyCart)
    },
  )

  it('blocks new changes if the current cart cannot be refreshed after a successful replay', async () => {
    const { store, cart } = await setup({
      send: vi
        .fn()
        .mockRejectedValueOnce({ kind: 'timeout' })
        .mockImplementation(async ({ requestId }) => response(requestId)),
    })
    await store.submitMessage('Add the first dish.')
    cart
      .mockResolvedValueOnce(emptyCart)
      .mockRejectedValueOnce({ kind: 'network' })
    await store.retryMessage()
    expect(store.getSnapshot().cartNeedsRefresh).toBe(true)
    await expect(store.submitMessage('Another instruction')).resolves.toBe(
      false,
    )
    await store.refreshCart()
    expect(store.getSnapshot().cartNeedsRefresh).toBe(false)
  })

  it.each([
    { status: 400, code: 'VALIDATION_ERROR' },
    { status: 409, code: 'CHAT_RETRY_STALE' },
    { status: 503, code: 'CHAT_CONTEXT_TOO_LARGE' },
  ])('does not retry %j and allows a corrected question', async (error) => {
    const { store, send } = await setup({
      send: vi
        .fn()
        .mockRejectedValue({ ...error, message: 'Please rephrase.' }),
    })
    await store.submitMessage('Question')
    await store.retryMessage()
    expect(send).toHaveBeenCalledOnce()
    expect(store.getSnapshot().pendingTurn).toBeNull()
    expect(store.getSnapshot().chatError.retryable).toBe(false)
  })

  it('reconciles a busy request through history without posting it again or duplicating messages', async () => {
    const { store, send, history } = await setup({
      send: vi.fn().mockRejectedValue({
        status: 409,
        code: 'CHAT_REQUEST_IN_PROGRESS',
        message: 'Still processing.',
      }),
    })
    await store.submitMessage('Add the first dish.')
    const requestId = send.mock.calls[0][0].requestId
    await store.retryMessage()
    expect(send).toHaveBeenCalledOnce()
    history.mockResolvedValueOnce({
      messages: [
        {
          id: 101,
          requestId,
          role: 'USER',
          content: 'Add the first dish.',
          requestStatus: 'COMPLETED',
        },
        {
          id: 102,
          requestId,
          role: 'ASSISTANT',
          content: 'Added.',
          requestStatus: 'COMPLETED',
          metadata: {},
        },
      ],
      nextBefore: null,
    })
    await store.checkConversation()
    expect(store.getSnapshot().messages).toHaveLength(2)
    expect(store.getSnapshot().pendingTurn).toBeNull()
    expect(store.getSnapshot().chatError).toBeNull()
  })

  it('requires a check before explicitly recovering an in-progress request', async () => {
    const { store, send, history } = await setup({
      send: vi.fn().mockRejectedValue({ kind: 'timeout' }),
    })
    await store.submitMessage('Add one.')
    const requestId = send.mock.calls[0][0].requestId
    history.mockResolvedValueOnce({
      messages: [
        {
          id: 1,
          role: 'USER',
          content: 'Add one.',
          requestId,
          requestStatus: 'IN_PROGRESS',
        },
      ],
      nextBefore: null,
    })
    await store.checkConversation()
    expect(store.getSnapshot().chatError.retryable).toBe(false)
    await store.retryMessage()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0][0].requestId).toBe(
      send.mock.calls[1][0].requestId,
    )
  })

  it('refreshes cart after unavailable-item errors without changing it optimistically', async () => {
    const { store, updateCart, cart } = await setup({
      updateCart: vi.fn().mockRejectedValue({
        status: 409,
        code: 'ITEM_UNAVAILABLE',
        message: 'Dish unavailable',
      }),
    })
    await expect(store.updateQuantity(1, 1)).resolves.toBe(false)
    expect(updateCart).toHaveBeenCalledOnce()
    expect(cart).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot()).toMatchObject({
      cart: emptyCart,
      cartError: 'Dish unavailable',
      pendingCart: null,
      cartNeedsRefresh: false,
    })
  })

  it('retries an uncertain cart write using the same absolute quantity', async () => {
    const { store, updateCart } = await setup({
      updateCart: vi
        .fn()
        .mockRejectedValueOnce({ kind: 'timeout' })
        .mockResolvedValue(filledCart),
    })
    await store.updateQuantity(1, 2)
    await expect(store.submitMessage('Another instruction')).resolves.toBe(
      false,
    )
    await expect(store.updateQuantity(1, 3)).resolves.toBe(false)
    await store.retryCart()
    expect(updateCart.mock.calls.map(([value]) => value.quantity)).toEqual([
      2, 2,
    ])
    expect(store.getSnapshot()).toMatchObject({
      cart: filledCart,
      pendingCart: null,
      activity: null,
    })
  })

  it('blocks chat while a cart write is active and accepts only integer quantities 0–20', async () => {
    const pending = deferred()
    const { store, updateCart, send } = await setup({
      updateCart: vi.fn(() => pending.promise),
    })
    for (const quantity of [-1, 21, 1.5])
      await expect(store.updateQuantity(1, quantity)).resolves.toBe(false)
    const first = store.updateQuantity(1, 2)
    await expect(store.submitMessage('Hello')).resolves.toBe(false)
    expect(send).not.toHaveBeenCalled()
    expect(updateCart).toHaveBeenCalledOnce()
    pending.resolve(filledCart)
    await first
  })

  it('recovers an expired session during chat without replaying the old message', async () => {
    const { store, send, create } = await setup({
      send: vi.fn().mockRejectedValue({ status: 401, code: 'SESSION_EXPIRED' }),
    })
    create.mockResolvedValue({ sessionId: 'SESSION_new' })
    await store.submitMessage('Add the first dish.')
    expect(create).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenCalledOnce()
    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      messages: [],
      pendingTurn: null,
    })
    expect(store.getSnapshot().notice).toMatch(/not sent again/)
  })

  it('ignores a late chat response after session replacement and aborts its signal', async () => {
    const pending = deferred()
    const { store, send } = await setup({ send: vi.fn(() => pending.promise) })
    const first = store.submitMessage('Old question')
    await store.newSession()
    expect(send.mock.calls[0][0].signal.aborted).toBe(true)
    pending.resolve(response(send.mock.calls[0][0].requestId))
    await first
    expect(store.getSnapshot().messages).toEqual([])
    expect(store.getSnapshot().cart).toEqual(emptyCart)
  })
})
