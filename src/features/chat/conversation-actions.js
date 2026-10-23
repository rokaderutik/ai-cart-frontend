import { sendMessage } from './chat.api'
import { setCartItemQuantity } from '@/features/cart/cart.api'

export const interactionState = {
  activity: null,
  pendingTurn: null,
  pendingCart: null,
  chatError: null,
  cartError: null,
  cartNeedsRefresh: false,
}

export function hasPendingHistory(messages) {
  return messages.some(
    (message) =>
      message?.role === 'USER' && message?.requestStatus === 'IN_PROGRESS',
  )
}

export function conversationLocked(state) {
  return (
    state.status !== 'ready' ||
    Boolean(
      state.activity ||
      state.pendingTurn ||
      state.pendingCart ||
      state.cartNeedsRefresh ||
      hasPendingHistory(state.messages),
    )
  )
}

/** Reconcile optimistic turns by role + request ID, retaining older loaded messages. */
export function mergeMessages(existing, incoming) {
  const matches = (message) =>
    incoming.some(
      (next) =>
        next.id === message.id ||
        (message?.requestId &&
          next?.requestId === message.requestId &&
          next.role === message.role),
    )
  return [
    ...existing.filter((message) => !message?.optimistic && !matches(message)),
    ...incoming,
    ...existing.filter((message) => message?.optimistic && !matches(message)),
  ]
}

function describeChatError(error) {
  const code = error?.code
  if (code === 'CHAT_CONTEXT_TOO_LARGE')
    return {
      message: `${error.message} Try a narrower question or start a new session.`,
      retryable: false,
      blocked: false,
    }
  if (['CHAT_BUSY', 'CHAT_REQUEST_IN_PROGRESS'].includes(code))
    return {
      message: `${error.message} Check the conversation before continuing.`,
      retryable: false,
      blocked: true,
    }
  const retryable =
    ['network', 'timeout', 'protocol', 'canceled'].includes(error?.kind) ||
    [500, 502, 503, 504].includes(error?.status) ||
    code === 'CHAT_ATTEMPT_EXPIRED'
  return {
    message:
      error?.message || 'We could not complete your message. Please try again.',
    retryable,
    blocked: retryable,
  }
}

/** Shared single-flight chat/cart actions. No React, global retries, or persisted chat text. */
export function createConversationActions({
  getState,
  publish,
  getToken,
  onUnauthorized,
  history,
  cart,
  send = sendMessage,
  updateCart = setCartItemQuantity,
}) {
  let operation = null

  function perform(activity, task, onError) {
    if (operation || getState().status !== 'ready')
      return Promise.resolve(false)
    const sessionId = getToken()
    const controller = new AbortController()
    const current = { controller, activity }
    operation = current
    const active = () =>
      operation === current &&
      getToken() === sessionId &&
      !controller.signal.aborted
    const context = { sessionId, signal: controller.signal, active }
    publish({ activity })
    return (async () => {
      try {
        await task(context)
        return active()
      } catch (error) {
        if (!active()) return false
        if (error?.status === 401) await onUnauthorized()
        else await onError(error, context)
        return false
      } finally {
        if (operation === current) {
          operation = null
          publish({ activity: null })
        }
      }
    })()
  }

  const markTurn = (requestId, status) =>
    getState().messages.map((message) =>
      message.role === 'USER' && message.requestId === requestId
        ? { ...message, requestStatus: status }
        : message,
    )

  function dispatchTurn(turn, retrying = false) {
    return perform(
      'chat',
      async (context) => {
        publish({
          chatError: null,
          messages: markTurn(turn.requestId, 'IN_PROGRESS'),
        })
        const response = await send({
          sessionId: context.sessionId,
          signal: context.signal,
          requestId: turn.requestId,
          message: turn.message,
        })
        if (!context.active()) return
        const { reply, ...metadata } = response
        const assistant = {
          id: response.assistantMessageId,
          requestId: turn.requestId,
          role: 'ASSISTANT',
          content: reply,
          createdAt: new Date().toISOString(),
          requestStatus: 'COMPLETED',
          metadata,
        }
        publish({
          messages: [
            ...markTurn(turn.requestId, 'COMPLETED').filter(
              (message) => message.id !== assistant.id,
            ),
            assistant,
          ],
          pendingTurn: null,
          cart: response.cart,
          notice: null,
        })
        if (retrying) {
          // A replay may carry an old snapshot. Re-fetch the authoritative current cart.
          publish({ cartNeedsRefresh: true })
          try {
            const latest = await cart({
              sessionId: context.sessionId,
              signal: context.signal,
            })
            if (context.active())
              publish({
                cart: latest,
                cartNeedsRefresh: false,
                cartError: null,
              })
          } catch (error) {
            if (error?.status === 401) throw error
            if (context.active())
              publish({
                cartError:
                  'Your reply was restored, but the latest cart could not be confirmed. Refresh your cart before continuing.',
              })
          }
        }
      },
      (error) => {
        const detail = describeChatError(error)
        publish({
          messages: markTurn(turn.requestId, 'FAILED'),
          pendingTurn: detail.blocked ? turn : null,
          chatError: detail,
        })
      },
    )
  }

  function submitMessage(text) {
    if (conversationLocked(getState())) return Promise.resolve(false)
    const message = typeof text === 'string' ? text.trim() : ''
    if (!message || message.length > 2000) return Promise.resolve(false)
    const turn = { requestId: crypto.randomUUID(), message }
    const optimistic = {
      id: `local-${turn.requestId}`,
      requestId: turn.requestId,
      role: 'USER',
      content: message,
      createdAt: new Date().toISOString(),
      requestStatus: 'IN_PROGRESS',
      metadata: {},
      optimistic: true,
    }
    publish({
      pendingTurn: turn,
      messages: [...getState().messages, optimistic],
    })
    return dispatchTurn(turn)
  }

  function retryMessage() {
    const state = getState()
    if (!state.pendingTurn || !state.chatError?.retryable)
      return Promise.resolve(false)
    return dispatchTurn(state.pendingTurn, true)
  }

  function updateQuantity(itemId, quantity, retrying = false) {
    const state = getState()
    if (
      (!retrying && conversationLocked(state)) ||
      !Number.isInteger(itemId) ||
      itemId < 1 ||
      !Number.isInteger(quantity) ||
      quantity < 0 ||
      quantity > 20
    )
      return Promise.resolve(false)
    return perform(
      'cart',
      async (context) => {
        publish({ pendingCart: { itemId, quantity }, cartError: null })
        const updated = await updateCart({
          sessionId: context.sessionId,
          itemId,
          quantity,
          signal: context.signal,
        })
        if (context.active())
          publish({
            cart: updated,
            pendingCart: null,
            cartError: null,
            cartNeedsRefresh: false,
            notice: 'Your cart has been updated.',
          })
      },
      async (error, context) => {
        const uncertain =
          ['network', 'timeout', 'protocol', 'canceled'].includes(
            error?.kind,
          ) || [500, 502, 503, 504].includes(error?.status)
        publish({
          pendingCart: uncertain ? { itemId, quantity } : null,
          cartError: error?.message || 'We could not update your cart.',
          cartNeedsRefresh: true,
        })
        try {
          const latest = await cart({
            sessionId: context.sessionId,
            signal: context.signal,
          })
          if (context.active())
            publish({ cart: latest, cartNeedsRefresh: false })
        } catch (refreshError) {
          if (refreshError?.status === 401 && context.active())
            await onUnauthorized()
        }
      },
    )
  }

  function retryCart() {
    const command = getState().pendingCart
    return command
      ? updateQuantity(command.itemId, command.quantity, true)
      : Promise.resolve(false)
  }

  function refreshCart() {
    return perform(
      'refresh',
      async (context) => {
        const latest = await cart({
          sessionId: context.sessionId,
          signal: context.signal,
        })
        if (context.active())
          publish({ cart: latest, cartNeedsRefresh: false, cartError: null })
      },
      (error) =>
        publish({
          cartNeedsRefresh: true,
          cartError: error?.message || 'We could not refresh your cart.',
        }),
    )
  }

  function checkConversation() {
    return perform(
      'reconcile',
      async (context) => {
        const [page, latest] = await Promise.all([
          history({ sessionId: context.sessionId, signal: context.signal }),
          cart({ sessionId: context.sessionId, signal: context.signal }),
        ])
        if (!context.active()) return
        const state = getState()
        const turn = state.pendingTurn
        const completed =
          turn &&
          page.messages.some(
            (message) =>
              message.role === 'ASSISTANT' &&
              message.requestId === turn.requestId &&
              message.requestStatus === 'COMPLETED',
          )
        const busy = hasPendingHistory(page.messages)
        const error = completed
          ? null
          : turn
            ? {
                message: busy
                  ? 'The service is still processing a message. Check again in a moment.'
                  : 'No completed reply was found. You can retry your original message safely.',
                retryable: !busy,
                blocked: true,
              }
            : null
        publish({
          messages: mergeMessages(state.messages, page.messages),
          cart: latest,
          cartNeedsRefresh: false,
          chatError: error,
          pendingTurn: completed ? null : turn,
          notice: busy
            ? 'A previous message is still processing. Check again before continuing.'
            : 'Your conversation and cart are up to date.',
        })
      },
      (error) =>
        publish({
          chatError: {
            message: error?.message || 'We could not check the conversation.',
            retryable: Boolean(
              getState().pendingTurn && getState().chatError?.retryable,
            ),
            blocked: true,
          },
        }),
    )
  }

  return {
    submitMessage,
    retryMessage,
    updateQuantity,
    retryCart,
    refreshCart,
    checkConversation,
    cancel() {
      if (!operation) return
      const previous = operation
      operation = null
      previous.controller.abort()
      const state = getState()
      publish({
        activity: null,
        ...(state.pendingTurn
          ? {
              messages: markTurn(state.pendingTurn.requestId, 'FAILED'),
              chatError: {
                message:
                  'The request was interrupted. Check the conversation or retry the same message.',
                retryable: true,
                blocked: true,
              },
            }
          : {}),
      })
    },
  }
}
