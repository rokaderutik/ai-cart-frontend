import { describe, expect, it, vi } from 'vitest'
import { createSessionStore, SESSION_STORAGE_KEY } from './session-store'
import { emptyCart, TEST_SESSION } from '@/test/server'

const second = 'SESSION_95168729-6486-4aaa-932e-43af4349aa47'
const expired = {
  status: 401,
  code: 'SESSION_EXPIRED',
  message: 'Session expired',
}
const deferred = () => {
  let resolve
  const promise = new Promise((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function setup(overrides = {}) {
  const dependencies = {
    create: vi.fn().mockResolvedValue({
      sessionId: TEST_SESSION,
      expiresAt: '2099-01-01T00:00:00Z',
    }),
    end: vi.fn().mockResolvedValue(undefined),
    history: vi.fn().mockResolvedValue({ messages: [], nextBefore: null }),
    cart: vi.fn().mockResolvedValue(emptyCart),
    ...overrides,
  }
  return { ...dependencies, store: createSessionStore(dependencies) }
}

describe('anonymous session lifecycle', () => {
  it('shares startup and starts history/cart in parallel after creating one session', async () => {
    const historyPage = deferred()
    const currentCart = deferred()
    const { store, create, history, cart } = setup({
      history: vi.fn(() => historyPage.promise),
      cart: vi.fn(() => currentCart.promise),
    })
    const first = store.ensureSession()
    expect(store.ensureSession()).toBe(first)
    await vi.waitFor(() => expect(cart).toHaveBeenCalledOnce())
    expect(history).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledOnce()
    expect(history.mock.calls[0][0].sessionId).toBe(TEST_SESSION)
    expect(sessionStorage.length).toBe(1)
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(TEST_SESSION)
    expect(store.getSnapshot().status).toBe('loading')
    historyPage.resolve({ messages: [], nextBefore: null })
    currentCart.resolve(emptyCart)
    await expect(first).resolves.toBe(true)
    await store.ensureSession()
    expect(create).toHaveBeenCalledOnce()
  })

  it('restores a stored token, historical metadata, and the live cart separately', async () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, TEST_SESSION)
    const messages = [
      {
        id: 2,
        role: 'ASSISTANT',
        content: 'Welcome',
        metadata: { cart: { total: 900 }, recommendations: [{ id: 1 }] },
      },
    ]
    const { store, create } = setup({
      history: vi.fn().mockResolvedValue({ messages, nextBefore: 1 }),
    })
    await store.ensureSession()
    expect(create).not.toHaveBeenCalled()
    expect(store.getSnapshot()).toMatchObject({
      status: 'ready',
      messages,
      nextBefore: 1,
      cart: emptyCart,
    })
    const refreshed = setup()
    await refreshed.store.ensureSession()
    expect(refreshed.create).not.toHaveBeenCalled()
  })

  it('recovers once when parallel requests both reject an expired token', async () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, 'SESSION_old')
    const { store, create, history, cart } = setup({
      history: vi
        .fn()
        .mockRejectedValueOnce(expired)
        .mockResolvedValue({ messages: [], nextBefore: null }),
      cart: vi.fn().mockRejectedValueOnce(expired).mockResolvedValue(emptyCart),
    })
    await expect(store.ensureSession()).resolves.toBe(true)
    expect(create).toHaveBeenCalledOnce()
    expect(history).toHaveBeenCalledTimes(2)
    expect(cart).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot().notice).toMatch(/expired/)
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(TEST_SESSION)
  })

  it('does not loop when a newly issued session is rejected', async () => {
    const { store, create } = setup({
      history: vi.fn().mockRejectedValue(expired),
    })
    await expect(store.ensureSession()).resolves.toBe(false)
    expect(create).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
    expect(store.getSnapshot()).toMatchObject({
      status: 'failed',
      messages: [],
      cart: null,
    })
  })

  it('clears an expired restored session even if its replacement is rejected', async () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, 'SESSION_old')
    const { store, create } = setup({
      history: vi.fn().mockRejectedValue(expired),
    })
    await expect(store.ensureSession()).resolves.toBe(false)
    expect(create).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBeNull()
  })

  it.each([undefined, expired])(
    'new session handles deletion response %j and clears old data',
    async (deletion) => {
      const { store, create, end, history } = setup()
      await store.ensureSession()
      create.mockResolvedValue({ sessionId: second })
      if (deletion) end.mockRejectedValueOnce(deletion)
      history.mockResolvedValue({ messages: [], nextBefore: null })
      const reset = store.newSession()
      expect(store.newSession()).toBe(reset)
      await expect(reset).resolves.toBe(true)
      expect(end).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ sessionId: TEST_SESSION }),
      )
      expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(second)
      expect(store.getSnapshot()).toMatchObject({
        status: 'ready',
        messages: [],
        cart: emptyCart,
      })
    },
  )

  it('keeps the token when deletion fails and retries deletion before creating', async () => {
    const { store, create, end } = setup()
    await store.ensureSession()
    end.mockRejectedValueOnce(new Error('Unable to end the session'))
    await expect(store.newSession()).resolves.toBe(false)
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(TEST_SESSION)
    expect(create).toHaveBeenCalledOnce()
    await expect(store.retry()).resolves.toBe(true)
    expect(end).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('retains a created token after restore failure and retries without creating again', async () => {
    const { store, create, cart } = setup({
      cart: vi
        .fn()
        .mockRejectedValueOnce(new Error('Try later'))
        .mockResolvedValue(emptyCart),
    })
    await expect(store.ensureSession()).resolves.toBe(false)
    expect(store.getSnapshot().error).toBe('Try later')
    await expect(store.retry()).resolves.toBe(true)
    expect(cart).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenCalledOnce()
  })

  it('cancels before dispatch under Strict Mode setup/cleanup/setup', async () => {
    const { store, create } = setup()
    const first = store.ensureSession()
    store.cancel()
    const secondAttempt = store.ensureSession()
    await expect(first).resolves.toBe(false)
    await expect(secondAttempt).resolves.toBe(true)
    expect(create).toHaveBeenCalledOnce()
  })

  it('ignores late creation responses after cancellation', async () => {
    const old = deferred()
    const { store, create } = setup({
      create: vi
        .fn()
        .mockReturnValueOnce(old.promise)
        .mockResolvedValue({ sessionId: second }),
    })
    const first = store.ensureSession()
    await vi.waitFor(() => expect(create).toHaveBeenCalledOnce())
    const signal = create.mock.calls[0][0].signal
    store.cancel()
    expect(signal.aborted).toBe(true)
    await store.ensureSession()
    old.resolve({ sessionId: TEST_SESSION })
    await first
    await Promise.resolve()
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(second)
    expect(store.getSnapshot().status).toBe('ready')
  })

  it('ignores old history/cart responses after starting a replacement operation', async () => {
    const old = deferred()
    const { store, history } = setup({
      history: vi
        .fn()
        .mockReturnValueOnce(old.promise)
        .mockResolvedValue({ messages: [], nextBefore: null }),
    })
    const first = store.ensureSession()
    await vi.waitFor(() => expect(history).toHaveBeenCalledOnce())
    store.cancel()
    await store.newSession()
    old.resolve({
      messages: [{ id: 1, content: 'Old conversation' }],
      nextBefore: null,
    })
    await first
    await Promise.resolve()
    expect(store.getSnapshot().messages).toEqual([])
    expect(store.getSnapshot().status).toBe('ready')
  })

  it('reports blocked browser storage without creating an unpersistable session', async () => {
    const { store, create } = setup({
      storage: () => {
        throw new Error('Denied')
      },
    })
    await expect(store.ensureSession()).resolves.toBe(false)
    expect(store.getSnapshot().error).toMatch(/session storage/)
    expect(create).not.toHaveBeenCalled()
  })
})
