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
  (response) => response,
  (error) => Promise.reject(normalizeApiError(error)),
)
