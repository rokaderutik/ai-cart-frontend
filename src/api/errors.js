import axios from 'axios'

/** Normalized transport, contract, or documented application error. */
export class ApiError extends Error {
  constructor(kind, message, status = null, cause, details = {}) {
    super(message, { cause })
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.code = details?.code ?? null
    this.errors = Array.isArray(details?.errors) ? details.errors : []
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
    const details = error.response?.data?.error
    return new ApiError(
      'http',
      typeof details?.message === 'string' && details.message.trim()
        ? details.message
        : 'The service could not complete the request.',
      error.response?.status,
      error,
      details,
    )
  }
  return new ApiError(
    'network',
    'We could not connect to the service.',
    null,
    error,
  )
}
