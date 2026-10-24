import { ApiError } from '@/api/errors'
import { createSession, endSession } from './session.api'
import { getMessages } from '@/features/chat/chat.api'
import { getCart } from '@/features/cart/cart.api'
import { mergeMessages, restoreRecovery } from '@/features/chat/message-history'
import {
  createConversationActions,
  interactionState,
} from '@/features/chat/conversation-actions'

export const SESSION_STORAGE_KEY = 'ai-cart.session-id'
const initialState = {
  ...interactionState,
  status: 'idle',
  messages: [],
  nextBefore: null,
  cart: null,
  error: null,
  notice: null,
}

/** Tab-scoped, cancelable lifecycle. Only the issued token is persisted. */
export function createSessionStore({
  storage = () => window.sessionStorage,
  create = createSession,
  end = endSession,
  history = getMessages,
  cart = getCart,
  send,
  updateCart,
} = {}) {
  let snapshot = { ...initialState }
  let operation = null
  let token = null
  let retryIntent = 'restore'
  const listeners = new Set()

  function publish(next) {
    snapshot = { ...snapshot, ...next }
    listeners.forEach((listener) => listener())
  }

  function persist(next) {
    try {
      if (next) storage().setItem(SESSION_STORAGE_KEY, next)
      else storage().removeItem(SESSION_STORAGE_KEY)
      token = next
    } catch {
      throw new ApiError(
        'storage',
        'Allow session storage in this tab so we can keep your conversation across refreshes.',
      )
    }
  }

  function readToken() {
    try {
      const saved = storage().getItem(SESSION_STORAGE_KEY)
      if (saved && !saved.startsWith('SESSION_')) {
        storage().removeItem(SESSION_STORAGE_KEY)
        return null
      }
      return saved || null
    } catch {
      throw new ApiError(
        'storage',
        'Allow session storage in this tab so we can restore your conversation.',
      )
    }
  }

  function cancel() {
    actions.cancel()
    if (!operation) return
    const previous = operation
    operation = null
    previous.controller.abort()
    previous.finish(false)
    publish({ status: 'idle' })
  }

  function start(intent = 'restore') {
    if (operation) return operation.promise
    actions.cancel()
    retryIntent = intent
    const controller = new AbortController()
    let finish
    const promise = new Promise((resolve) => {
      finish = resolve
    })
    const current = { controller, promise, finish }
    operation = current
    const active = () => operation === current && !controller.signal.aborted
    publish({
      status: intent === 'reset' ? 'resetting' : 'loading',
      error: null,
    })

    async function issueSession() {
      const created = await create({ signal: controller.signal })
      if (!active()) return null
      persist(created.sessionId)
      return created.sessionId
    }

    async function restore(sessionId) {
      const results = await Promise.allSettled([
        history({ sessionId, signal: controller.signal }),
        cart({ sessionId, signal: controller.signal }),
      ])
      const unauthorized = results.find(
        (result) =>
          result.status === 'rejected' && result.reason?.status === 401,
      )
      if (unauthorized) throw unauthorized.reason
      const failed = results.find((result) => result.status === 'rejected')
      if (failed) throw failed.reason
      return {
        messages: mergeMessages([], results[0].value.messages),
        nextBefore: results[0].value.nextBefore,
        cart: results[1].value,
      }
    }

    // Strict Mode cleanup can cancel the first mount before the creation POST is sent.
    Promise.resolve().then(async () => {
      if (!active()) return
      try {
        token = readToken()
        if (intent === 'reset') {
          if (token) {
            try {
              await end({ sessionId: token, signal: controller.signal })
            } catch (error) {
              if (error?.status !== 401) throw error
            }
            if (!active()) return
          }
          persist(null)
          publish({
            ...initialState,
            status: 'loading',
            notice: 'Your new conversation is ready for a fresh start.',
          })
          retryIntent = 'restore'
        }

        let sessionId = token
        const restoring = Boolean(sessionId)
        if (!sessionId) sessionId = await issueSession()
        if (!active()) return
        let restored
        try {
          restored = await restore(sessionId)
        } catch (error) {
          if (!active()) return
          if (error?.status !== 401) throw error
          persist(null)
          publish({
            ...initialState,
            status: 'loading',
            notice:
              'Your previous session expired or is no longer available. We started a new conversation.',
          })
          if (!restoring) throw error
          sessionId = await issueSession()
          if (!active()) return
          try {
            restored = await restore(sessionId)
          } catch (nextError) {
            if (active() && nextError?.status === 401) persist(null)
            throw nextError
          }
        }
        if (active())
          publish({
            ...restored,
            ...restoreRecovery(restored.messages),
            status: 'ready',
            error: null,
          })
      } catch (error) {
        if (active())
          publish({
            status: 'failed',
            error:
              error?.message ||
              'We could not open your conversation. Please try again.',
          })
      } finally {
        if (operation === current) {
          operation = null
          finish(snapshot.status === 'ready')
        }
      }
    })
    return promise
  }

  const actions = createConversationActions({
    getState: () => snapshot,
    publish,
    getToken: () => token,
    history,
    cart,
    send,
    updateCart,
    onUnauthorized: () => {
      actions.cancel()
      try {
        persist(null)
      } catch (error) {
        publish({ ...initialState, status: 'failed', error: error.message })
        return Promise.resolve(false)
      }
      publish({
        ...initialState,
        notice:
          'Your session expired or is no longer available. We started a new conversation. Your previous message was not sent again.',
      })
      return start()
    },
  })

  return {
    ...actions,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getSnapshot: () => snapshot,
    ensureSession: () =>
      snapshot.status === 'ready' ? Promise.resolve(true) : start(),
    retry: () => start(retryIntent),
    newSession: () => start('reset'),
    cancel,
  }
}
