import { StrictMode } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { AppRoutes } from './router'
import { ReadinessProvider } from './ReadinessProvider'
import { createReadinessStore } from '@/features/health/readiness-store'
import { server, HEALTH_URL } from '@/test/server'

function renderApp(path = '/', store) {
  return render(
    <StrictMode>
      <MemoryRouter initialEntries={[path]}>
        <ReadinessProvider store={store}>
          <AppRoutes />
        </ReadinessProvider>
      </MemoryRouter>
    </StrictMode>,
  )
}

describe('welcome and chat readiness gate', () => {
  it('enables chat only after success, stays on welcome, and enters on click', async () => {
    const user = userEvent.setup()
    renderApp()
    expect(
      screen.getByRole('button', { name: 'Continue to chat' }),
    ).toBeDisabled()
    const link = await screen.findByRole('link', { name: 'Continue to chat' })
    expect(
      screen.getByRole('heading', { name: /Good food starts/ }),
    ).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('AI Cart is ready')
    await user.click(link)
    expect(
      screen.getByText(/messaging will arrive in a later phase/),
    ).toBeInTheDocument()
  })

  it('guards direct chat visits until the health request succeeds', async () => {
    let resolve
    const checkHealth = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
    const store = createReadinessStore({
      checkHealth,
      configurationError: null,
    })
    renderApp('/chat', store)
    expect(screen.queryByText(/messaging will arrive/)).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Continue to chat' }),
    ).toBeDisabled()
    await act(async () => {
      await Promise.resolve()
      resolve()
    })
    expect(
      screen.getByText(/messaging will arrive in a later phase/),
    ).toBeInTheDocument()
    expect(checkHealth).toHaveBeenCalledTimes(1)
  })

  it('shows cold-start copy accessibly and cleans up on unmount', async () => {
    vi.useFakeTimers()
    let signal
    const store = createReadinessStore({
      configurationError: null,
      checkHealth: ({ signal: value }) => {
        signal = value
        return new Promise(() => {})
      },
    })
    const view = renderApp('/', store)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(screen.getByRole('status')).toHaveTextContent('Render’s free tier')
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50_000)
    })
    expect(screen.getByRole('status')).toHaveTextContent(
      'Thanks for your patience',
    )
    view.unmount()
    expect(signal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('allows manual retry after a non-retryable HTTP failure', async () => {
    server.use(
      http.get(HEALTH_URL, () => new HttpResponse(null, { status: 400 })),
    )
    const user = userEvent.setup()
    renderApp()
    const retry = await screen.findByRole('button', { name: 'Try again' })
    expect(
      screen.queryByRole('link', { name: 'Continue to chat' }),
    ).not.toBeInTheDocument()
    server.use(
      http.get(HEALTH_URL, () => HttpResponse.json({ anything: true })),
    )
    await user.click(retry)
    expect(
      await screen.findByRole('link', { name: 'Continue to chat' }),
    ).toBeInTheDocument()
  })

  it('revalidates stale readiness on chat entry', async () => {
    vi.useFakeTimers()
    let resolve
    const checkHealth = vi
      .fn()
      .mockResolvedValueOnce({})
      .mockImplementation(
        () =>
          new Promise((done) => {
            resolve = done
          }),
      )
    const store = createReadinessStore({
      checkHealth,
      configurationError: null,
    })
    await store.ensureReady()
    await vi.advanceTimersByTimeAsync(30_001)
    renderApp('/chat', store)
    expect(screen.queryByText(/messaging will arrive/)).not.toBeInTheDocument()
    await act(async () => {
      await Promise.resolve()
      resolve()
    })
    expect(screen.getByText(/messaging will arrive/)).toBeInTheDocument()
    expect(checkHealth).toHaveBeenCalledTimes(2)
  })

  it('shows configuration guidance without making a request', () => {
    const checkHealth = vi.fn()
    const store = createReadinessStore({
      checkHealth,
      configurationError: 'Missing URL',
    })
    renderApp('/', store)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Connection setup needed',
    )
    expect(
      screen.getByRole('button', { name: 'Continue to chat' }),
    ).toBeDisabled()
    expect(checkHealth).not.toHaveBeenCalled()
  })

  it('renders unknown routes with a working home link', async () => {
    const user = userEvent.setup()
    renderApp('/missing')
    expect(
      screen.getByRole('heading', { name: /This page isn’t on the menu/ }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: 'Back to home' }))
    expect(
      screen.getByRole('heading', { name: /Good food starts/ }),
    ).toBeInTheDocument()
    await screen.findByRole('link', { name: 'Continue to chat' })
  })
})
