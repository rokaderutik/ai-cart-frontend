import { sendMessage } from './chat.api'
import { setCartItemQuantity } from '@/features/cart/cart.api'
import { ApiError } from '@/api/errors'
import {
  hasPendingHistory,
  mergeMessages,
  resolveTurn,
  restoreRecovery,
} from './message-history'

export { hasPendingHistory, mergeMessages } from './message-history'

export const interactionState = {
  activity: null,
  pendingTurn: null,
  pendingCart: null,
  chatError: null,
  cartError: null,
  cartNeedsRefresh: false,
  historyError: null,
  historyNotice: null,
  historyRevision: 0,
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
        controller.abort()
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
    const resumeAllowed = getState().chatError?.resumeAllowed === true
    return perform(
      'chat',
      async (context) => {
        if (retrying) {
          const resolution = await readConversation(context, turn)
          if (!context.active() || ['completed', 'stale'].includes(resolution))
            return
          if (resolution === 'busy' && !resumeAllowed) return
        }
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
        if (error?.code === 'CHAT_RETRY_STALE') {
          detail.resubmitText = turn.message
          detail.message =
            'A newer conversation turn exists. Check your conversation, then choose whether to send this as a new message.'
        }
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
    if (
      !state.pendingTurn ||
      !(state.chatError?.retryable || state.chatError?.resumeAllowed)
    )
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

  async function readConversation(context, turn) {
    const [page, latest] = await Promise.all([
      history({ sessionId: context.sessionId, signal: context.signal }),
      cart({ sessionId: context.sessionId, signal: context.signal }),
    ])
    if (!context.active()) return 'canceled'
    const state = getState()
    const messages = mergeMessages(state.messages, page.messages)
    const resolution = resolveTurn(page.messages, turn)
    const recovered = restoreRecovery(page.messages)
    let pendingTurn = turn
    let chatError
    if (resolution === 'completed') {
      pendingTurn = recovered.pendingTurn
      chatError = recovered.chatError
    } else if (resolution === 'stale') {
      pendingTurn = null
      chatError = {
        message:
          'A newer conversation turn exists. This earlier message will not be retried automatically.',
        retryable: false,
        blocked: false,
        resubmitText: turn.message,
      }
    } else if (turn) {
      chatError = {
        message:
          resolution === 'busy'
            ? 'The service is still processing this request. Check again later, or recover the original request if the earlier attempt was interrupted.'
            : 'No completed reply was found. You can retry the original request.',
        retryable: resolution !== 'busy',
        resumeAllowed: resolution === 'busy',
        blocked: true,
      }
    } else {
      pendingTurn = recovered.pendingTurn
      chatError = recovered.chatError
      if (chatError && hasPendingHistory(page.messages))
        chatError = { ...chatError, resumeAllowed: true }
      if (!chatError && state.chatError?.resubmitText)
        chatError = {
          ...state.chatError,
          message:
            'Your conversation is up to date. Choose whether you want to send the earlier message as a new request.',
        }
    }
    publish({
      messages,
      cart: latest,
      cartNeedsRefresh: false,
      pendingTurn,
      chatError,
      notice: pendingTurn
        ? 'Your latest request needs attention before continuing.'
        : 'Your conversation and cart are up to date.',
    })
    return resolution
  }

  function loadEarlier() {
    const cursor = getState().nextBefore
    if (cursor == null) return Promise.resolve(false)
    return perform(
      'history',
      async (context) => {
        publish({ historyError: null, historyNotice: null })
        const page = await history({
          sessionId: context.sessionId,
          signal: context.signal,
          before: cursor,
          limit: 50,
        })
        if (!context.active()) return
        if (
          page.nextBefore != null &&
          String(page.nextBefore) === String(cursor)
        )
          throw new ApiError(
            'protocol',
            'The service did not advance the history page. Please try again.',
          )
        const state = getState()
        const messages = mergeMessages(state.messages, page.messages, 'older')
        const added = messages.length - state.messages.length
        publish({
          messages,
          nextBefore: page.nextBefore,
          historyRevision: state.historyRevision + 1,
          historyNotice: added
            ? `${added} earlier messages loaded.`
            : 'No additional messages on this page.',
          historyError: null,
        })
      },
      (error) =>
        publish({
          historyError:
            error?.message ||
            'We could not load earlier messages. Please try again.',
        }),
    )
  }

  function checkConversation() {
    return perform(
      'reconcile',
      (context) => readConversation(context, getState().pendingTurn),
      (error) =>
        publish({
          chatError: {
            message: error?.message || 'We could not check the conversation.',
            retryable: Boolean(
              getState().pendingTurn && getState().chatError?.retryable,
            ),
            blocked: Boolean(getState().pendingTurn),
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
    loadEarlier,
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
