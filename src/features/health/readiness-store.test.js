import { describe, expect, it, vi } from 'vitest'
import { createReadinessStore, WAKE_DEADLINE_MS } from './readiness-store'

const transient = { kind: 'network', status: null }
const makeStore = (checkHealth) =>
  createReadinessStore({ checkHealth, configurationError: null })

describe('backend wake-up lifecycle', () => {
  it('fails safely when an external request rejects without error details', async () => {
    const store = makeStore(() => Promise.reject(undefined))
    await expect(store.ensureReady()).resolves.toBe(false)
    expect(store.getSnapshot().status).toBe('failed')
  })

  it('shares one operation and accepts any successful body', async () => {
    const check = vi.fn().mockResolvedValue(undefined)
    const store = makeStore(check)
    const first = store.ensureReady()
    expect(store.ensureReady()).toBe(first)
    await expect(first).resolves.toBe(true)
    expect(check).toHaveBeenCalledTimes(1)
    expect(store.getSnapshot().status).toBe('ready')
    await store.ensureReady()
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('waits three seconds before retrying and stops checking after success', async () => {
    vi.useFakeTimers()
    const check = vi
      .fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValue('healthy')
    const store = makeStore(check)
    const result = store.ensureReady()
    await vi.advanceTimersByTimeAsync(2_999)
    expect(check).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    await expect(result).resolves.toBe(true)
    await vi.advanceTimersByTimeAsync(180_000)
    expect(check).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([502, 503, 504])('retries HTTP %s', async (status) => {
    vi.useFakeTimers()
    const check = vi
      .fn()
      .mockRejectedValueOnce({ kind: 'http', status })
      .mockResolvedValue({})
    const store = makeStore(check)
    const result = store.ensureReady()
    await vi.advanceTimersByTimeAsync(3_000)
    await expect(result).resolves.toBe(true)
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('retries request timeouts', async () => {
    vi.useFakeTimers()
    const check = vi
      .fn()
      .mockRejectedValueOnce({ kind: 'timeout' })
      .mockResolvedValue(null)
    const store = makeStore(check)
    const result = store.ensureReady()
    await vi.advanceTimersByTimeAsync(3_000)
    await expect(result).resolves.toBe(true)
  })

  it('shows cold-start and waiting states, then aborts at the overall deadline', async () => {
    vi.useFakeTimers()
    let signal
    const store = makeStore(({ signal: requestSignal }) => {
      signal = requestSignal
      return new Promise(() => {})
    })
    const result = store.ensureReady()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(store.getSnapshot().status).toBe('waking')
    await vi.advanceTimersByTimeAsync(50_000)
    expect(store.getSnapshot().status).toBe('waiting')
    await vi.advanceTimersByTimeAsync(120_000)
    await expect(result).resolves.toBe(false)
    expect(signal.aborted).toBe(true)
    expect(store.getSnapshot().status).toBe('failed')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('includes retry delays in the deadline and permits a fresh manual retry', async () => {
    vi.useFakeTimers()
    const check = vi.fn().mockRejectedValue(transient)
    const store = makeStore(check)
    const result = store.ensureReady()
    await vi.advanceTimersByTimeAsync(WAKE_DEADLINE_MS)
    await expect(result).resolves.toBe(false)
    const calls = check.mock.calls.length
    await vi.advanceTimersByTimeAsync(10_000)
    expect(check).toHaveBeenCalledTimes(calls)
    check.mockResolvedValue(undefined)
    await expect(store.retry()).resolves.toBe(true)
    expect(store.getSnapshot().status).toBe('ready')
  })

  it.each([400, 401, 404, 429, 500])(
    'fails immediately on HTTP %s',
    async (status) => {
      vi.useFakeTimers()
      const check = vi.fn().mockRejectedValue({ kind: 'http', status })
      const store = makeStore(check)
      await expect(store.ensureReady()).resolves.toBe(false)
      await vi.advanceTimersByTimeAsync(30_000)
      expect(check).toHaveBeenCalledTimes(1)
      expect(store.getSnapshot().status).toBe('failed')
    },
  )

  it('cancels pending work and ignores late responses from an old operation', async () => {
    let resolveOld
    let signal
    const check = vi
      .fn()
      .mockImplementationOnce(({ signal: oldSignal }) => {
        signal = oldSignal
        return new Promise((resolve) => {
          resolveOld = resolve
        })
      })
      .mockRejectedValue({ kind: 'http', status: 400 })
    const store = makeStore(check)
    const old = store.ensureReady()
    await Promise.resolve()
    store.cancel()
    expect(signal.aborted).toBe(true)
    await expect(old).resolves.toBe(false)
    await store.retry()
    resolveOld({})
    await Promise.resolve()
    expect(store.getSnapshot().status).toBe('failed')
  })

  it('cancels a scheduled retry on disposal', async () => {
    vi.useFakeTimers()
    const check = vi.fn().mockRejectedValue(transient)
    const store = makeStore(check)
    const result = store.ensureReady()
    await vi.advanceTimersByTimeAsync(1)
    store.cancel()
    await expect(result).resolves.toBe(false)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(check).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rechecks after readiness expires', async () => {
    vi.useFakeTimers()
    const check = vi.fn().mockResolvedValue({})
    const store = makeStore(check)
    await store.ensureReady()
    await vi.advanceTimersByTimeAsync(30_000)
    await store.ensureReady()
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('does not make requests for invalid configuration', async () => {
    const check = vi.fn()
    const store = createReadinessStore({
      checkHealth: check,
      configurationError: 'Missing URL',
    })
    await expect(store.ensureReady()).resolves.toBe(false)
    await expect(store.retry()).resolves.toBe(false)
    expect(check).not.toHaveBeenCalled()
    expect(store.getSnapshot().status).toBe('configuration')
  })
})
