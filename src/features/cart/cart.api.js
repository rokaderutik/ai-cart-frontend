import { apiClient } from '@/api/client'
import { requireContract, sessionOptions } from '@/api/contracts'

/** Validate the authoritative cart returned by the server. */
export function validateCart(data) {
  requireContract(
    typeof data?.cartId === 'string' &&
      Array.isArray(data?.items) &&
      Number.isFinite(data?.total) &&
      data.total >= 0 &&
      data?.currency === 'INR' &&
      data.items.every(
        (item) =>
          Number.isInteger(item?.itemId) &&
          typeof item?.name === 'string' &&
          Number.isInteger(item?.quantity) &&
          item.quantity >= 1 &&
          item.quantity <= 20 &&
          Number.isFinite(item?.unitPrice) &&
          Number.isFinite(item?.lineTotal) &&
          typeof item?.available === 'boolean',
      ),
  )
  return data
}

/** @param {{sessionId: string, signal?: AbortSignal}} options */
export async function getCart({ sessionId, signal }) {
  return validateCart(
    await apiClient.get('/cart', sessionOptions(sessionId, signal)),
  )
}

/** Set an absolute quantity; zero removes the item. No automatic retries.
 * @param {{sessionId: string, itemId: number, quantity: number, signal?: AbortSignal}} options */
export async function setCartItemQuantity({
  sessionId,
  itemId,
  quantity,
  signal,
}) {
  requireContract(
    Number.isInteger(itemId) &&
      itemId > 0 &&
      Number.isInteger(quantity) &&
      quantity >= 0 &&
      quantity <= 20,
  )
  return validateCart(
    await apiClient.put(
      `/cart/items/${itemId}`,
      { quantity },
      sessionOptions(sessionId, signal),
    ),
  )
}
