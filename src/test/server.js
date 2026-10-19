import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export const HEALTH_URL = 'https://ai-cart-backend.onrender.com/api/v1/health'
export const server = setupServer(
  http.get(HEALTH_URL, () => HttpResponse.json({ status: 'UP' })),
)
