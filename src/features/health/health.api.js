import { apiClient } from '@/api/client'
import { ApiError } from '@/api/errors'

/**
 * Check backend and database readiness using the versioned response envelope.
 * @param {{ signal?: AbortSignal }} options
 * @returns {Promise<{status: 'UP'}>}
 */
export async function getHealth({ signal } = {}) {
  const data = await apiClient.get('/health', {
    signal,
    timeout: 60_000,
  })
  if (data?.status !== 'UP') {
    throw new ApiError(
      data?.status === 'DOWN' ? 'http' : 'protocol',
      'The service is not ready yet.',
      data?.status === 'DOWN' ? 503 : null,
    )
  }
  return data
}
