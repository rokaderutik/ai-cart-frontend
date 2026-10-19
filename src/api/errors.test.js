import { describe, expect, it } from 'vitest'
import { normalizeApiError } from './errors'

describe('defensive handling of external errors', () => {
  it.each([undefined, null, 'unexpected failure'])(
    'normalizes %s without throwing',
    (error) => {
      expect(normalizeApiError(error)).toMatchObject({
        kind: 'network',
        status: null,
        message: 'We could not connect to the service.',
      })
    },
  )
})
