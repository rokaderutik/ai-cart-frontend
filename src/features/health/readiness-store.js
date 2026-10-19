import { getHealth } from '@/features/health/health.api'
import { environment } from '@/config/env'

export const READINESS_FRESH_MS = 30_000
export const WAKE_DEADLINE_MS = 180_000
const RETRY_DELAY_MS = 3_000

function canRetry(error) {
  return (
    ['network', 'timeout'].includes(error?.kind) ||
    [502, 503, 504].includes(error?.status)
  )
}

/** One cancelable lifecycle shared by every readiness consumer. */
export function createReadinessStore({
  checkHealth = getHealth,
  configurationError = environment.error,
} = {}) {
  let snapshot = {
    status: configurationError ? 'configuration' : 'idle',
    readyAt: null,
  }
  let operation = null
  const listeners = new Set()

  function publish(next) {
    snapshot = next
    listeners.forEach((listener) => listener())
  }

  function isFresh() {
    return (
      snapshot.status === 'ready' &&
      Date.now() - snapshot.readyAt < READINESS_FRESH_MS
    )
  }

  function cancel() {
    if (!operation) return
    const previous = operation
    operation = null
    previous.controller.abort()
    previous.finish(false)
  }

  function start() {
    if (operation) return operation.promise
    if (configurationError) return Promise.resolve(false)

    const controller = new AbortController()
    const timers = new Set()
    let resolveResult
    const promise = new Promise((resolve) => {
      resolveResult = resolve
    })
    const current = { controller, promise, finish }
    operation = current
    publish({ status: 'checking', readyAt: null })

    function schedule(callback, delay) {
      const timer = setTimeout(() => {
        timers.delete(timer)
        if (operation === current) callback()
      }, delay)
      timers.add(timer)
    }

    function finish(result, status) {
      timers.forEach(clearTimeout)
      timers.clear()
      if (operation === current) {
        operation = null
        if (status) publish({ status, readyAt: result ? Date.now() : null })
      }
      resolveResult(result)
    }

    async function attempt() {
      try {
        await checkHealth({ signal: controller.signal })
        if (operation === current) finish(true, 'ready')
      } catch (error) {
        if (operation !== current) return
        if (canRetry(error)) schedule(attempt, RETRY_DELAY_MS)
        else
          finish(
            false,
            error?.kind === 'configuration' ? 'configuration' : 'failed',
          )
      }
    }

    schedule(() => publish({ status: 'waking', readyAt: null }), 10_000)
    schedule(() => publish({ status: 'waiting', readyAt: null }), 60_000)
    schedule(() => {
      finish(false, 'failed')
      controller.abort()
    }, WAKE_DEADLINE_MS)
    // Starting in a microtask makes Strict Mode setup/cleanup cancel safely.
    Promise.resolve().then(() => {
      if (operation === current) attempt()
    })
    return promise
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    ensureReady: () => (isFresh() ? Promise.resolve(true) : start()),
    retry: start,
    cancel,
  }
}
