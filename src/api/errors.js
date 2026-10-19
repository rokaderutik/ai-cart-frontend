import axios from 'axios'

/** A UI-safe error. Backend response bodies are never displayed automatically. */
export class ApiError extends Error {
  constructor(kind, message, status = null, cause) {
    super(message, { cause })
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
  }
}

export function normalizeApiError(error) {
  if (error instanceof ApiError) return error
  if (axios.isCancel(error))
    return new ApiError('canceled', 'The request was canceled.', null, error)
  if (['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)) {
    return new ApiError(
      'timeout',
      'The service did not respond in time.',
      null,
      error,
    )
  }
  if (error?.response) {
    return new ApiError(
      'http',
      'The service could not complete the request.',
      error.response?.status,
      error,
    )
  }
  return new ApiError(
    'network',
    'We could not connect to the service.',
    null,
    error,
  )
}
