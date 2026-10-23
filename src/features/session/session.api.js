import { apiClient } from '@/api/client'
import { requireContract, sessionOptions } from '@/api/contracts'

/** @param {{signal?: AbortSignal}} options
 * @returns {Promise<{sessionId: string, expiresAt: string}>} */
export async function createSession({ signal } = {}) {
  const data = await apiClient.post('/sessions', undefined, { signal })
  requireContract(
    typeof data?.sessionId === 'string' &&
      data.sessionId.startsWith('SESSION_') &&
      typeof data?.expiresAt === 'string' &&
      Number.isFinite(Date.parse(data.expiresAt)),
  )
  return data
}

/** @param {{sessionId: string, signal?: AbortSignal}} options */
export function endSession({ sessionId, signal }) {
  return apiClient.delete(
    '/sessions/current',
    sessionOptions(sessionId, signal),
  )
}
