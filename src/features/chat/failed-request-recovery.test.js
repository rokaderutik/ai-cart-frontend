import { describe, expect, it, vi } from 'vitest'
import { createSessionStore } from '@/features/session/session-store'
import { emptyCart, TEST_SESSION } from '@/test/server'
import { conversationLocked } from './conversation-actions'

const failedOutput = {
  status: 503,
  code: 'CHAT_INVALID_MODEL_OUTPUT',
  message:
    'The model could not produce a verified response; retry this request',
}
const currentCart = {
  ...emptyCart,
  items: [
    {
      itemId: 1,
      name: 'Paneer',
      quantity: 2,
      unitPrice: 250,
      lineTotal: 500,
      available: true,
    },
  ],
  total: 500,
}
const reply = (requestId) => ({
  requestId,
  assistantMessageId: 2,
  reply: 'Here are some other options.',
  cart: currentCart,
})
const saved = (requestId, requestStatus = 'FAILED') => ({
  id: 1,
  requestId,
  role: 'USER',
  content: 'Is pulao available?',
  requestStatus,
  metadata: {},
})
const deferred = () => {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function setup() {
  let original
  let status = 'FAILED'
  const history = vi.fn(async () => ({
    messages: original ? [saved(original, status)] : [],
    nextBefore: null,
  }))
  const send = vi.fn(async ({ requestId }) => {
    original = requestId
    throw failedOutput
  })
  const cart = vi.fn().mockResolvedValue(currentCart)
  const updateCart = vi.fn().mockResolvedValue(currentCart)
  const store = createSessionStore({
    create: vi.fn().mockResolvedValue({ sessionId: TEST_SESSION }),
    end: vi.fn().mockResolvedValue(undefined),
    history,
    send,
    cart,
    updateCart,
  })
  await store.ensureSession()
  return {
    store,
    send,
    history,
    cart,
    updateCart,
    setStatus: (next) => {
      status = next
    },
  }
}

describe('one retry before continuing after a confirmed chat failure', () => {
  it('allows exactly two POST attempts, preserves the failed turn/cart, and gives the next message a fresh ID', async () => {
    const { store, send, updateCart } = await setup()
    await store.submitMessage('Is pulao available?')
    expect(conversationLocked(store.getSnapshot())).toBe(true)
    expect(store.getSnapshot().pendingTurn.attempts).toBe(1)
    await store.checkConversation()
    await store.checkConversation()
    expect(send).toHaveBeenCalledOnce()
    expect(conversationLocked(store.getSnapshot())).toBe(true)
    await store.retryMessage()
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0][0].requestId).toBe(
      send.mock.calls[1][0].requestId,
    )
    expect(send.mock.calls[0][0].message).toBe(send.mock.calls[1][0].message)
    expect(store.getSnapshot()).toMatchObject({
      cart: currentCart,
      pendingTurn: { attempts: 2 },
      chatError: { blocked: false, retryable: false, exhausted: true },
    })
    expect(store.getSnapshot().messages).toHaveLength(1)
    expect(store.getSnapshot().messages[0].requestStatus).toBe('FAILED')
    expect(conversationLocked(store.getSnapshot())).toBe(false)
    await store.checkConversation()
    await store.retryMessage()
    expect(send).toHaveBeenCalledTimes(2)
    expect(conversationLocked(store.getSnapshot())).toBe(false)
    await store.updateQuantity(1, 2)
    expect(updateCart).toHaveBeenCalledOnce()
    send.mockImplementationOnce(async ({ requestId }) => reply(requestId))
    await store.submitMessage('Which rice dishes do you have?')
    expect(send).toHaveBeenCalledTimes(3)
    expect(send.mock.calls[2][0].requestId).not.toBe(
      send.mock.calls[0][0].requestId,
    )
    expect(store.getSnapshot().messages[0].requestStatus).toBe('FAILED')
    expect(store.getSnapshot().chatError).toBeNull()
  })

  it.each(['IN_PROGRESS', 'missing'])(
    'does not unlock or permit a third POST when history is %s after the retry',
    async (status) => {
      const { store, send, history, setStatus } = await setup()
      await store.submitMessage('Is pulao available?')
      // The preflight confirms the first failure, then the second response is uncertain.
      send.mockImplementationOnce(async () => {
        if (status === 'missing')
          history.mockResolvedValue({ messages: [], nextBefore: null })
        else setStatus(status)
        throw { kind: 'timeout' }
      })
      await store.retryMessage()
      expect(conversationLocked(store.getSnapshot())).toBe(true)
      expect(store.getSnapshot().chatError).toMatchObject({
        retryable: false,
        resumeAllowed: false,
        exhausted: true,
      })
      await store.checkConversation()
      await store.retryMessage()
      await store.submitMessage('Another instruction')
      expect(send).toHaveBeenCalledTimes(2)
      history.mockResolvedValue({
        messages: [saved(send.mock.calls[0][0].requestId)],
        nextBefore: null,
      })
      await store.checkConversation()
      expect(conversationLocked(store.getSnapshot())).toBe(false)
      expect(store.getSnapshot().chatError.retryable).toBe(false)
    },
  )

  it.each(['history', 'cart'])(
    'keeps the lock if %s reconciliation fails, then recovers without another POST',
    async (resource) => {
      const { store, send, history, cart } = await setup()
      await store.submitMessage('Is pulao available?')
      send.mockImplementationOnce(async () => {
        const dependency = resource === 'history' ? history : cart
        dependency.mockRejectedValueOnce({ kind: 'network' })
        throw failedOutput
      })
      await store.retryMessage()
      expect(conversationLocked(store.getSnapshot())).toBe(true)
      expect(store.getSnapshot().chatError.exhausted).toBe(true)
      await store.retryMessage()
      expect(send).toHaveBeenCalledTimes(2)
      await store.checkConversation()
      expect(conversationLocked(store.getSnapshot())).toBe(false)
      expect(store.getSnapshot().cart).toEqual(currentCart)
    },
  )

  it('restores a completed second attempt after a lost response without another POST', async () => {
    const { store, send, history } = await setup()
    await store.submitMessage('Is pulao available?')
    send.mockImplementationOnce(async ({ requestId }) => {
      history.mockResolvedValue({
        messages: [
          saved(requestId, 'COMPLETED'),
          {
            id: 2,
            requestId,
            role: 'ASSISTANT',
            content: 'Your dish was added.',
            requestStatus: 'COMPLETED',
            metadata: {},
          },
        ],
        nextBefore: null,
      })
      throw { kind: 'network' }
    })
    await store.retryMessage()
    expect(store.getSnapshot().messages).toHaveLength(2)
    expect(store.getSnapshot()).toMatchObject({
      pendingTurn: null,
      chatError: null,
      cart: currentCart,
    })
    expect(conversationLocked(store.getSnapshot())).toBe(false)
    await store.retryMessage()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('does not spend the retry allowance on a failed preflight', async () => {
    const { store, send, history } = await setup()
    await store.submitMessage('Is pulao available?')
    history.mockRejectedValueOnce({ kind: 'network' })
    await store.retryMessage()
    expect(send).toHaveBeenCalledOnce()
    expect(store.getSnapshot().pendingTurn.attempts).toBe(1)
    await store.retryMessage()
    expect(send).toHaveBeenCalledTimes(2)
    expect(conversationLocked(store.getSnapshot())).toBe(false)
  })

  it('holds the operation lock until post-failure reconciliation finishes and discards replaced-session results', async () => {
    const { store, send, history } = await setup()
    await store.submitMessage('Is pulao available?')
    const pending = deferred()
    send.mockImplementationOnce(async () => {
      history.mockReturnValueOnce(pending.promise)
      throw failedOutput
    })
    const retry = store.retryMessage()
    await vi.waitFor(() => expect(history).toHaveBeenCalledTimes(3))
    await store.retryMessage()
    await store.submitMessage('Another message')
    expect(send).toHaveBeenCalledTimes(2)
    const signal = history.mock.calls[2][0].signal
    history.mockResolvedValue({ messages: [], nextBefore: null })
    await store.newSession()
    expect(signal.aborted).toBe(true)
    pending.resolve({
      messages: [saved(send.mock.calls[0][0].requestId)],
      nextBefore: null,
    })
    await retry
    expect(store.getSnapshot()).toMatchObject({
      messages: [],
      pendingTurn: null,
      chatError: null,
    })
  })

  it('restores FAILED history without locking new questions and keeps optional retry bounded', async () => {
    const { store, send } = await setup()
    await store.submitMessage('Is pulao available?')
    // A full reload has no persisted attempt counter; it restores only backend state.
    const restored = createSessionStore({
      history: vi.fn().mockResolvedValue({
        messages: [saved('saved-request')],
        nextBefore: null,
      }),
      cart: vi.fn().mockResolvedValue(currentCart),
      send,
    })
    await restored.ensureSession()
    expect(conversationLocked(restored.getSnapshot())).toBe(false)
    await restored.checkConversation()
    expect(conversationLocked(restored.getSnapshot())).toBe(false)
    await restored.retryMessage()
    expect(send).toHaveBeenCalledTimes(2)
    expect(restored.getSnapshot().chatError.retryable).toBe(false)
    expect(conversationLocked(restored.getSnapshot())).toBe(false)
    await restored.retryMessage()
    expect(send).toHaveBeenCalledTimes(2)
  })
})
