import { ApiError } from '@/api/errors'

/** Validate required network invariants instead of hiding malformed payloads. */
export function requireContract(condition) {
  if (!condition) {
    throw new ApiError(
      'protocol',
      'The service returned incomplete data. Please try again.',
    )
  }
}

/** Session headers belong only on explicitly protected endpoint calls. */
export function sessionOptions(sessionId, signal) {
  requireContract(
    typeof sessionId === 'string' && sessionId.startsWith('SESSION_'),
  )
  return { signal, headers: { 'X-Session-Id': sessionId } }
}
