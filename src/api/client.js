import axios from 'axios'
import { environment } from '@/config/env'
import { ApiError, normalizeApiError } from '@/api/errors'

export const apiClient = axios.create({
  baseURL: environment.apiBaseUrl ?? undefined,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
  withCredentials: false,
})

apiClient.interceptors.request.use((config) => {
  if (environment.error) throw new ApiError('configuration', environment.error)
  return config
})

apiClient.interceptors.response.use(
  (response) => {
    if (response.status === 204) return undefined
    const envelope = response?.data
    if (envelope?.error) {
      throw new ApiError(
        'http',
        envelope.error?.message ||
          'The service could not complete the request.',
        response.status,
        undefined,
        envelope.error,
      )
    }
    if (
      !envelope ||
      typeof envelope !== 'object' ||
      !Object.hasOwn(envelope, 'data')
    ) {
      throw new ApiError(
        'protocol',
        'The service returned an unexpected response. Please try again.',
      )
    }
    return envelope.data
  },
  (error) => Promise.reject(normalizeApiError(error)),
)
