import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server, HEALTH_URL } from '@/test/server'
import { getHealth } from './health.api'
import { apiClient } from '@/api/client'

describe('health API through the shared Axios client', () => {
  it.each([{ state: 'ready' }, ['arbitrary'], 'healthy', null])(
    'returns an undocumented body unchanged: %j',
    async (body) => {
      server.use(
        http.get(HEALTH_URL, ({ request }) => {
          expect(request.headers.get('Accept')).toBe('application/json')
          return HttpResponse.json(body)
        }),
      )
      expect(await getHealth()).toEqual(body)
    },
  )

  it('accepts an empty successful response', async () => {
    server.use(
      http.get(HEALTH_URL, () => new HttpResponse(null, { status: 204 })),
    )
    await expect(getHealth()).resolves.toBeDefined()
  })

  it('normalizes HTTP errors without exposing backend details', async () => {
    server.use(
      http.get(HEALTH_URL, () =>
        HttpResponse.json({ secret: 'internal failure' }, { status: 503 }),
      ),
    )
    await expect(getHealth()).rejects.toMatchObject({
      kind: 'http',
      status: 503,
      message: 'The service could not complete the request.',
    })
  })

  it('normalizes network failures', async () => {
    server.use(http.get(HEALTH_URL, () => HttpResponse.error()))
    await expect(getHealth()).rejects.toMatchObject({
      kind: 'network',
      status: null,
    })
  })

  it('supports cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(
      getHealth({ signal: controller.signal }),
    ).rejects.toMatchObject({ kind: 'canceled' })
  })

  it('normalizes actual Axios timeouts', async () => {
    server.use(
      http.get(HEALTH_URL, async () => {
        await new Promise((resolve) => setTimeout(resolve, 70))
        return HttpResponse.json({})
      }),
    )
    await expect(
      apiClient.get('/api/v1/health', { timeout: 10 }),
    ).rejects.toMatchObject({ kind: 'timeout' })
  })
})
