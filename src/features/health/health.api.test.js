import { describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server, HEALTH_URL, envelope } from '@/test/server'
import { getHealth } from './health.api'
import { apiClient } from '@/api/client'

describe('health API through the shared Axios client', () => {
  it.each([{ status: 'UP' }, { status: 'UP', extra: true }])(
    'unwraps a ready health response: %j',
    async (body) => {
      server.use(
        http.get(HEALTH_URL, ({ request }) => {
          expect(request.headers.get('Accept')).toBe('application/json')
          return HttpResponse.json(envelope(body))
        }),
      )
      expect(await getHealth()).toEqual(body)
    },
  )

  it('rejects an empty successful health response', async () => {
    server.use(
      http.get(HEALTH_URL, () => new HttpResponse(null, { status: 204 })),
    )
    await expect(getHealth()).rejects.toMatchObject({ kind: 'protocol' })
  })

  it.each([null, {}, { status: 'UNKNOWN' }])(
    'rejects an invalid readiness payload: %j',
    async (data) => {
      server.use(http.get(HEALTH_URL, () => HttpResponse.json(envelope(data))))
      await expect(getHealth()).rejects.toMatchObject({ kind: 'protocol' })
    },
  )

  it('keeps a DOWN response unavailable even with HTTP 200', async () => {
    server.use(
      http.get(HEALTH_URL, () =>
        HttpResponse.json(envelope({ status: 'DOWN' })),
      ),
    )
    await expect(getHealth()).rejects.toMatchObject({ status: 503 })
  })

  it('handles database unavailability without an error object', async () => {
    server.use(
      http.get(HEALTH_URL, () =>
        HttpResponse.json(envelope({ status: 'DOWN' }), { status: 503 }),
      ),
    )
    await expect(getHealth()).rejects.toMatchObject({
      kind: 'http',
      status: 503,
    })
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
      apiClient.get('/health', { timeout: 10 }),
    ).rejects.toMatchObject({ kind: 'timeout' })
  })
})
