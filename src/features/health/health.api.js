import { apiClient } from '@/api/client'

/**
 * Check backend availability. Any successful HTTP response establishes readiness.
 * The backend's confirmed response is { status: 'UP' }.
 * @param {{ signal?: AbortSignal }} options
 * @returns {Promise<unknown>} The response body; HTTP success controls readiness.
 */
export async function getHealth({ signal } = {}) {
  const response = await apiClient.get('/api/v1/health', {
    signal,
    timeout: 60_000,
  })
  return response?.data
}
