import { StrictMode } from 'react'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { AppRoutes } from '@/app/router'
import { ReadinessProvider } from '@/app/ReadinessProvider'
import { SessionProvider } from '@/app/SessionProvider'
import { SESSION_STORAGE_KEY } from '@/features/session/session-store'
import {
  server,
  API_URL,
  TEST_SESSION,
  emptyCart,
  envelope,
} from '@/test/server'

const messages = [
  {
    id: 101,
    role: 'USER',
    content: 'Something mild, please.',
    requestStatus: 'COMPLETED',
    metadata: {},
  },
  {
    id: 102,
    role: 'ASSISTANT',
    content: 'Try this creamy curry.',
    requestStatus: 'COMPLETED',
    metadata: {
      recommendations: [
        {
          id: 1,
          name: 'Paneer Butter Masala',
          description: 'A creamy curry.',
          price: 250,
          available: true,
        },
      ],
      sources: [
        {
          sourceId: 'menu:paneer',
          title: 'Menu evidence',
          content: 'Paneer with tomato, butter and cream.',
        },
      ],
      cart: { ...emptyCart, total: 900 },
    },
  },
]

function renderPage(path = '/chat') {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <ReadinessProvider>
          <SessionProvider>
            <AppRoutes />
          </SessionProvider>
        </ReadinessProvider>
      </MemoryRouter>
    </StrictMode>,
  )
}

describe('stage 2 session experience', () => {
  it('does not create a session on welcome; entering chat creates exactly one under Strict Mode', async () => {
    const create = vi.fn(() =>
      HttpResponse.json(
        envelope({
          sessionId: TEST_SESSION,
          expiresAt: '2099-01-01T00:00:00Z',
        }),
        { status: 201 },
      ),
    )
    server.use(http.post(`${API_URL}/sessions`, create))
    const user = userEvent.setup()
    renderPage('/')
    const enter = await screen.findByRole('link', { name: 'Continue to chat' })
    expect(create).not.toHaveBeenCalled()
    await user.click(enter)
    await screen.findByRole('heading', { name: 'Your cart' })
    expect(create).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(TEST_SESSION)
    expect(
      screen.getByRole('textbox', { name: 'Message AI Cart' }),
    ).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Send message' })).toBeDisabled()
  })

  it('restores messages, cards, sources, and the current rather than historical cart', async () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, TEST_SESSION)
    const create = vi.fn()
    server.use(
      http.post(`${API_URL}/sessions`, create),
      http.get(`${API_URL}/chat/messages`, ({ request }) => {
        expect(request.headers.get('X-Session-Id')).toBe(TEST_SESSION)
        return HttpResponse.json(envelope({ messages, nextBefore: 90 }))
      }),
    )
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Something mild, please.')
    expect(screen.getByText('Paneer Butter Masala')).toBeInTheDocument()
    await user.click(screen.getByText(/Supporting sources/))
    await user.click(
      screen.getByRole('button', { name: 'View source: Menu evidence' }),
    )
    expect(
      screen.getByText('Paneer with tomato, butter and cream.'),
    ).toBeVisible()
    expect(screen.getByText('₹0.00')).toBeInTheDocument()
    expect(screen.queryByText('₹900.00')).not.toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('explains an expired session and restores an empty new conversation', async () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, 'SESSION_expired')
    server.use(
      http.get(`${API_URL}/chat/messages`, ({ request }) =>
        request.headers.get('X-Session-Id') === 'SESSION_expired'
          ? HttpResponse.json(
              {
                data: null,
                error: { code: 'SESSION_EXPIRED', message: 'Session expired' },
              },
              { status: 401 },
            )
          : HttpResponse.json(envelope({ messages: [], nextBefore: null })),
      ),
    )
    renderPage()
    await screen.findByRole('heading', { name: 'Your cart' })
    expect(screen.getByRole('status')).toHaveTextContent(
      /previous session expired/,
    )
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(TEST_SESSION)
  })

  it('confirms destructive reset, permits cancellation, then deletes and replaces the session', async () => {
    sessionStorage.setItem(SESSION_STORAGE_KEY, TEST_SESSION)
    const next = 'SESSION_new'
    const ended = vi.fn(() => new HttpResponse(null, { status: 204 }))
    server.use(
      http.get(`${API_URL}/chat/messages`, ({ request }) =>
        HttpResponse.json(
          envelope({
            messages:
              request.headers.get('X-Session-Id') === TEST_SESSION
                ? messages
                : [],
            nextBefore: null,
          }),
        ),
      ),
      http.delete(`${API_URL}/sessions/current`, ended),
      http.post(`${API_URL}/sessions`, () =>
        HttpResponse.json(
          envelope({ sessionId: next, expiresAt: '2099-01-01T00:00:00Z' }),
          { status: 201 },
        ),
      ),
    )
    const user = userEvent.setup()
    renderPage()
    await screen.findByText('Something mild, please.')
    await user.click(screen.getByRole('button', { name: 'New Session' }))
    expect(screen.getByRole('alertdialog')).toHaveAccessibleName(
      'Start a new conversation?',
    )
    await user.click(screen.getByRole('button', { name: 'Keep conversation' }))
    expect(ended).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'New Session' }))
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', {
        name: 'Start new session',
      }),
    )
    await screen.findByRole('heading', { name: 'Good taste starts here.' })
    expect(
      screen.queryByText('Something mild, please.'),
    ).not.toBeInTheDocument()
    expect(ended).toHaveBeenCalledOnce()
    expect(sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(next)
  })

  it('offers retry on failed restore without creating an extra session', async () => {
    let fail = true
    const create = vi.fn(() =>
      HttpResponse.json(
        envelope({
          sessionId: TEST_SESSION,
          expiresAt: '2099-01-01T00:00:00Z',
        }),
        { status: 201 },
      ),
    )
    server.use(
      http.post(`${API_URL}/sessions`, create),
      http.get(`${API_URL}/cart`, () =>
        fail
          ? HttpResponse.json(
              {
                data: null,
                error: {
                  code: 'INTERNAL_ERROR',
                  message: 'Please try again shortly.',
                },
              },
              { status: 500 },
            )
          : HttpResponse.json(envelope(emptyCart)),
      ),
    )
    const user = userEvent.setup()
    renderPage()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please try again shortly.',
    )
    fail = false
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await screen.findByRole('heading', { name: 'Your cart' })
    expect(create).toHaveBeenCalledOnce()
  })
})
