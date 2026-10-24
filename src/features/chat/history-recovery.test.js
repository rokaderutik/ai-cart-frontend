import { describe, expect, it, vi } from 'vitest'
import {
  createSessionStore,
  SESSION_STORAGE_KEY,
} from '@/features/session/session-store'
import { emptyCart, TEST_SESSION } from '@/test/server'
import { mergeMessages, restoreRecovery } from './message-history'

const user = (id, requestStatus = 'COMPLETED', requestId = `turn-${id}`) => ({
  id,
  requestId,
  role: 'USER',
  content: `Question ${id}`,
  requestStatus,
  metadata: {},
})
const assistant = (id, requestId) => ({
  id,
  requestId,
  role: 'ASSISTANT',
  content: `Answer ${id}`,
  requestStatus: 'COMPLETED',
  metadata: { recommendations: [], sources: [] },
})
const deferred = () => {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

async function setup(messages = [], nextBefore = null, overrides = {}) {
  sessionStorage.setItem(SESSION_STORAGE_KEY, TEST_SESSION)
  const dependencies = {
    create: vi.fn().mockResolvedValue({ sessionId: 'SESSION_new' }),
    end: vi.fn().mockResolvedValue(undefined),
    history: vi.fn().mockResolvedValue({ messages, nextBefore }),
    cart: vi.fn().mockResolvedValue(emptyCart),
    send: vi.fn(async ({ requestId }) => ({
      requestId,
      assistantMessageId: 999,
      reply: 'Done',
      cart: emptyCart,
    })),
    ...overrides,
  }
  const store = createSessionStore(dependencies)
  await store.ensureSession()
  return { store, ...dependencies }
}

describe('pagination and reload recovery', () => {
  it('prepends overlapping chronological pages once and preserves the current cart', async () => {
    const { store, history, cart } = await setup(
      [user(3), assistant(4, 'turn-3')],
      3,
    )
    history.mockResolvedValueOnce({
      messages: [user(1), assistant(2, 'turn-1'), user(3)],
      nextBefore: null,
    })
    await store.loadEarlier()
    expect(history).toHaveBeenLastCalledWith(
      expect.objectContaining({
        before: 3,
        limit: 50,
        sessionId: TEST_SESSION,
      }),
    )
    expect(store.getSnapshot().messages.map((message) => message.id)).toEqual([
      1, 2, 3, 4,
    ])
    expect(store.getSnapshot()).toMatchObject({
      nextBefore: null,
      historyRevision: 1,
      cart: emptyCart,
    })
    expect(cart).toHaveBeenCalledOnce()
    await expect(store.loadEarlier()).resolves.toBe(false)
  })

  it('retains the cursor and loaded content when a history request fails, then retries that page', async () => {
    const { store, history } = await setup([user(3)], 3)
    history
      .mockRejectedValueOnce(new Error('History temporarily unavailable'))
      .mockResolvedValueOnce({ messages: [user(1)], nextBefore: null })
    await expect(store.loadEarlier()).resolves.toBe(false)
    expect(store.getSnapshot()).toMatchObject({
      nextBefore: 3,
      historyRevision: 0,
      historyError: 'History temporarily unavailable',
    })
    await store.loadEarlier()
    expect(
      history.mock.calls.slice(1).map(([options]) => options.before),
    ).toEqual([3, 3])
    expect(store.getSnapshot().messages.map((message) => message.id)).toEqual([
      1, 3,
    ])
  })

  it('stops a non-advancing cursor instead of repeatedly fetching the same page', async () => {
    const { store, history } = await setup([user(3)], 3)
    history.mockResolvedValueOnce({ messages: [user(2)], nextBefore: 3 })
    await expect(store.loadEarlier()).resolves.toBe(false)
    expect(store.getSnapshot().messages).toHaveLength(1)
    expect(store.getSnapshot().historyError).toMatch(/did not advance/)
    expect(history).toHaveBeenCalledTimes(2)
  })

  it('serializes page loads with mutations and ignores pages from a replaced session', async () => {
    const old = deferred()
    const { store, history, send } = await setup([user(3)], 3)
    history
      .mockReturnValueOnce(old.promise)
      .mockResolvedValue({ messages: [], nextBefore: null })
    const first = store.loadEarlier()
    await expect(store.loadEarlier()).resolves.toBe(false)
    await expect(store.submitMessage('Another question')).resolves.toBe(false)
    expect(send).not.toHaveBeenCalled()
    const signal = history.mock.calls[1][0].signal
    await store.newSession()
    expect(signal.aborted).toBe(true)
    old.resolve({ messages: [user(1)], nextBefore: null })
    await first
    expect(store.getSnapshot().messages).toEqual([])
  })

  it('recovers session expiry while loading older history without carrying old pages across', async () => {
    const { store, history, create } = await setup([user(3)], 3)
    history
      .mockRejectedValueOnce({ status: 401 })
      .mockResolvedValue({ messages: [], nextBefore: null })
    await store.loadEarlier()
    expect(create).toHaveBeenCalledOnce()
    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      messages: [],
      nextBefore: null,
      historyRevision: 0,
    })
  })

  it('reconstructs only the latest failed turn from backend history with its original ID and text', async () => {
    const message = user(7, 'FAILED', 'same-request')
    const { store, history, send } = await setup([message])
    expect(store.getSnapshot().pendingTurn).toMatchObject({
      requestId: 'same-request',
      message: 'Question 7',
      recovered: true,
    })
    expect(sessionStorage.length).toBe(1)
    history.mockResolvedValue({ messages: [message], nextBefore: null })
    await store.retryMessage()
    expect(send).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        requestId: 'same-request',
        message: 'Question 7',
      }),
    )
    expect(
      store.getSnapshot().messages.filter((message) => message.role === 'USER'),
    ).toHaveLength(1)
  })

  it('does not POST again if the uncertain request completed before the retry check', async () => {
    const { store, history, send, cart } = await setup([user(1, 'FAILED')])
    const currentCart = { ...emptyCart, total: 250 }
    history.mockResolvedValueOnce({
      messages: [user(1), assistant(2, 'turn-1')],
      nextBefore: null,
    })
    cart.mockResolvedValueOnce(currentCart)
    await store.retryMessage()
    expect(send).not.toHaveBeenCalled()
    expect(store.getSnapshot()).toMatchObject({
      pendingTurn: null,
      chatError: null,
      cart: currentCart,
    })
    expect(store.getSnapshot().messages[0].requestStatus).toBe('COMPLETED')
  })

  it('keeps a restored in-progress request locked, and allows one explicit recovery after checking', async () => {
    const { store, send } = await setup([user(1, 'IN_PROGRESS')])
    await store.retryMessage()
    expect(send).not.toHaveBeenCalled()
    await store.checkConversation()
    expect(store.getSnapshot().chatError.resumeAllowed).toBe(true)
    await store.retryMessage()
    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0][0].requestId).toBe('turn-1')
  })

  it('never retries when history reconciliation itself fails', async () => {
    const { store, history, send } = await setup([user(1, 'FAILED')])
    history.mockRejectedValueOnce({
      kind: 'network',
      message: 'Connection lost',
    })
    await store.retryMessage()
    expect(send).not.toHaveBeenCalled()
    expect(store.getSnapshot().pendingTurn.requestId).toBe('turn-1')
    expect(store.getSnapshot().chatError.message).toBe('Connection lost')
  })

  it('offers deliberate resubmission rather than reusing a stale turn after a newer user message', async () => {
    const { store, history, send } = await setup([user(1, 'FAILED')])
    history.mockResolvedValue({
      messages: [user(1, 'FAILED'), user(3), assistant(4, 'turn-3')],
      nextBefore: null,
    })
    await store.retryMessage()
    expect(send).not.toHaveBeenCalled()
    expect(store.getSnapshot()).toMatchObject({
      pendingTurn: null,
      chatError: { retryable: false, resubmitText: 'Question 1' },
    })
    await store.checkConversation()
    expect(store.getSnapshot().chatError.resubmitText).toBe('Question 1')
  })

  it('keeps older loaded pages and their cursor while reconciling the latest conversation', async () => {
    const { store, history } = await setup([user(5)], 5)
    history.mockResolvedValueOnce({ messages: [user(3)], nextBefore: 3 })
    await store.loadEarlier()
    history.mockResolvedValueOnce({
      messages: [user(5), assistant(6, 'turn-5')],
      nextBefore: 5,
    })
    await store.checkConversation()
    expect(store.getSnapshot().messages.map((message) => message.id)).toEqual([
      3, 5, 6,
    ])
    expect(store.getSnapshot().nextBefore).toBe(3)
  })

  it('normalizes completed optimistic users without dropping message-owned metadata', () => {
    const old = { ...user('local', 'FAILED', 'same'), optimistic: true }
    const saved = { ...user(1, 'FAILED', 'same') }
    const answer = {
      ...assistant(2, 'same'),
      metadata: {
        recommendations: [{ id: 8 }],
        sources: [{ sourceId: 'guide:policy' }],
      },
    }
    const result = mergeMessages([old], [saved, answer])
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 1, requestStatus: 'COMPLETED' })
    expect(result[1].metadata).toEqual(answer.metadata)
    expect(restoreRecovery(result).pendingTurn).toBeNull()
  })

  it('does not offer a retry for an older failed turn or a malformed request', () => {
    expect(
      restoreRecovery([user(1, 'FAILED'), user(3), assistant(4, 'turn-3')])
        .pendingTurn,
    ).toBeNull()
    expect(
      restoreRecovery([{ ...user(1, 'FAILED'), content: '  changed text  ' }])
        .pendingTurn,
    ).toBeNull()
  })
})
