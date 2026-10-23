import { apiClient } from '@/api/client'
import { requireContract, sessionOptions } from '@/api/contracts'
import { validateCart } from '@/features/cart/cart.api'

/** Each page is chronological. The cursor is opaque and is forwarded unchanged.
 * @param {{sessionId: string, limit?: number, before?: string | number, signal?: AbortSignal}} options */
export async function getMessages({ sessionId, limit = 50, before, signal }) {
  const data = await apiClient.get('/chat/messages', {
    ...sessionOptions(sessionId, signal),
    params: { limit, before },
  })
  requireContract(
    Array.isArray(data?.messages) &&
      Object.hasOwn(data, 'nextBefore') &&
      data.messages.every(
        (message) =>
          message?.id != null &&
          ['USER', 'ASSISTANT'].includes(message?.role) &&
          typeof message?.content === 'string',
      ),
  )
  return data
}

/** The caller retains requestId and identical text for a retry. Never retry globally.
 * @param {{sessionId: string, requestId: string, message: string, signal?: AbortSignal}} options */
export async function sendMessage({ sessionId, requestId, message, signal }) {
  requireContract(
    typeof requestId === 'string' &&
      typeof message === 'string' &&
      message.length >= 1 &&
      message.length <= 2000 &&
      message === message.trim(),
  )
  const data = await apiClient.post(
    '/chat',
    { requestId, message },
    {
      ...sessionOptions(sessionId, signal),
      timeout: 120_000,
    },
  )
  requireContract(
    data?.requestId === requestId && typeof data?.reply === 'string',
  )
  validateCart(data?.cart)
  return data
}
