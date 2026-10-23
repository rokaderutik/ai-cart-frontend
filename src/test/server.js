import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'

export const HEALTH_URL = 'https://ai-cart-backend.onrender.com/api/v1/health'
export const API_URL = 'https://ai-cart-backend.onrender.com/api/v1'
export const TEST_SESSION = 'SESSION_85168729-6486-4aaa-932e-43af4349aa47'
export const emptyCart = {
  cartId: 'CART_test',
  items: [],
  total: 0,
  currency: 'INR',
}
export const envelope = (data) => ({
  timestamp: new Date().toISOString(),
  data,
  error: null,
})
export const server = setupServer(
  http.get(HEALTH_URL, () => HttpResponse.json(envelope({ status: 'UP' }))),
  http.post(`${API_URL}/sessions`, () =>
    HttpResponse.json(
      envelope({
        sessionId: TEST_SESSION,
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      }),
      { status: 201 },
    ),
  ),
  http.delete(
    `${API_URL}/sessions/current`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.get(`${API_URL}/cart`, () => HttpResponse.json(envelope(emptyCart))),
  http.get(`${API_URL}/chat/messages`, () =>
    HttpResponse.json(envelope({ messages: [], nextBefore: null })),
  ),
)
