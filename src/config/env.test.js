import { describe, expect, it, vi } from 'vitest'
import { readEnvironment } from './env'

describe('environment configuration', () => {
  it.each([
    '',
    undefined,
    'invalid',
    'ftp://example.com',
    'https://example.com/api',
    'https://user:pass@example.com',
    'https://example.com?token=x',
  ])('rejects %s', (value) => {
    expect(readEnvironment({ VITE_API_BASE_URL: value })).toMatchObject({
      apiBaseUrl: null,
      error: expect.any(String),
    })
  })

  it('normalizes a backend origin', () => {
    expect(
      readEnvironment({
        VITE_API_BASE_URL: ' https://ai-cart-backend.onrender.com/ ',
      }),
    ).toEqual({
      apiBaseUrl: 'https://ai-cart-backend.onrender.com',
      error: null,
    })
  })

  it('blocks the HTTP client before any request when configuration is missing', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_API_BASE_URL', '')
    try {
      const { apiClient } = await import('@/api/client')
      const adapter = vi.fn()
      await expect(
        apiClient.get('/api/v1/health', { adapter }),
      ).rejects.toMatchObject({ kind: 'configuration' })
      expect(adapter).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})
