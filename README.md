# AI Cart frontend

A restaurant assistant for discovering dishes, inspecting recommendation sources, and building a shared cart through conversation or UI controls.

- Frontend repository: https://github.com/rokaderutik/ai-cart-frontend
- Backend: https://ai-cart-backend.onrender.com
- Hosting target: Vercel. Phase 1 does not publish the application.

## Current phase

Stage 3 enables the complete normal conversation flow on top of the welcome/readiness and session foundation: sequential chat, source-backed recommendations, follow-ups, manual cart controls, and conversational cart changes. The current session and cart are restored on refresh. Desktop shows the cart alongside the conversation; mobile provides a cart drawer. History pagination and broader failure/deployment verification remain Stage 4 work.

React calls Spring Boot, which owns PostgreSQL/pgvector, retrieval, AI-provider calls, sessions, conversation persistence, and authoritative cart totals. Database and AI-provider credentials do not belong in this frontend.

## Local setup

Use a current Node.js LTS version compatible with Vite 8 and npm. Run `npm ci`, copy `.env.example` to `.env.local`, then run `npm run dev`. Open the Local URL printed by Vite.

```env
VITE_API_BASE_URL=https://ai-cart-backend.onrender.com/api/v1
```

Restart Vite after environment changes. The base URL must use HTTP(S), end in `/api/v1`, and contain no query, credentials, or fragment. A trailing slash is normalized. Origin-only values from Phase 1 now need `/api/v1` appended. `VITE_` variables are public client configuration, never secrets.

For a local backend, use `VITE_API_BASE_URL=http://localhost:8080/api/v1 npm run dev` in Bash. In PowerShell, use `$env:VITE_API_BASE_URL = "http://localhost:8080/api/v1"; npm run dev`.

| Command                | Purpose                                       |
| ---------------------- | --------------------------------------------- |
| `npm run dev`          | Development server                            |
| `npm run build`        | Production bundle in `dist`                   |
| `npm run preview`      | Serve the production bundle locally           |
| `npm run lint`         | ESLint and React Hooks checks                 |
| `npm test`             | Deterministic unit and integration tests      |
| `npm run test:watch`   | Watch tests                                   |
| `npm run test:browser` | Browser checks using installed Microsoft Edge |
| `npm run format`       | Format source and configuration               |
| `npm run format:check` | Check formatting                              |

## Structure and conventions

```text
src/
  app/                 Entry, router, readiness/session providers, chat gate
  api/                 Shared Axios client, envelope/contracts, normalized errors
  components/common/   Shared application components
  components/ui/       JavaScript shadcn/ui primitives
  config/              Environment validation
  features/health/     Endpoint, wake-up store, hook, status panel
  features/session/    Session endpoints, tab token, startup/reset lifecycle
  features/chat/       Chat actions, composer, messages, recommendations, sources
  features/cart/       Cart endpoints, quantity controls, responsive cart drawer
  layouts/             Header, main content, footer
  pages/               Welcome, conversation shell, not-found
  lib/                 Shared utilities
  styles/              Global styles and theme tokens
  test/                MSW server and test setup
  main.jsx             Strict Mode bootstrap
```

Use JavaScript/JSX, focused functional components and hooks, explicit props, immutable updates, semantic HTML, and `@/` imports. Keep feature behavior near its feature and network configuration outside components. Use optional chaining for nullable external/network data and optional values, with explicit fallbacks or validation where needed. Preserve checks for required internal invariants rather than silently hiding programming errors. Strict Mode and React Compiler remain enabled. Format with Prettier and check React rules with ESLint.

The light theme uses warm neutrals and burnt-orange accents, Tailwind CSS, Lucide icons, and JavaScript shadcn/ui New York components. The decorative meal SVG is local artwork, not a real recommendation.

## API interface

The shared client uses the `/api/v1` base and unwraps `{ timestamp, data, error }`. Endpoint functions own relative paths, methods, headers, parameters, and required-payload validation. HTTP 204 resolves without parsing a body. Documented API errors preserve their code, message, status, and field errors; transport failures use safe fallback messages.

**`GET /health` must return `data.status === "UP"`** before chat entry. Database unavailability returns 503 with `data.status: "DOWN"` and can have `error: null`. Health confirms backend/database readiness, not model-provider availability. Empty, malformed, or unknown successful health responses cannot establish readiness.

Components use `useHealth`. Endpoint modules own methods, paths, parameters, and response extraction:

```js
import { getHealth } from '@/features/health/health.api'

const controller = new AbortController()
const data = await getHealth({ signal: controller.signal })
// controller.abort() cancels work that is no longer needed.
```

The shared Axios client supplies the versioned API base, JSON acceptance, a 15-second default timeout, and normalized errors. Health overrides the timeout to 60 seconds; chat allows 120 seconds for model latency. Timeouts never prove a backend mutation failed. `ApiError` exposes `kind`, `status`, `code`, `message`, and `errors`. Cancellation is distinct from connection failure. Invalid configuration blocks dispatch and displays setup guidance.

There are no global automatic retries, cookie credentials, or authentication redirects. Protected endpoint functions explicitly attach `X-Session-Id`; health and session creation never receive that header. Chat and cart requests pass through endpoint functions and the shared session state; components do not call Axios directly.

## Anonymous sessions and restoration

- Opening welcome performs health checks only. Entering `/chat` initializes a single shared session operation after readiness.
- `POST /sessions` issues a tab token. Only that token is saved under `ai-cart.session-id` in `sessionStorage`; messages, cart contents, and expiry metadata are not persisted locally. Sessions expire 24 hours after creation, without extending on activity.
- Existing tokens are checked by loading `GET /chat/messages?limit=50` and `GET /cart` in parallel. The shell is ready only when both succeed. The current cart always comes from `/cart`, never historical assistant metadata.
- HTTP 401 clears the old session data/token and creates a fresh session once. A rejected replacement stops with a retry action instead of looping. The notice explains that the previous session ended.
- New Session requires confirmation, deletes `/sessions/current`, clears the old state, and creates a fresh session. A 401 from deletion means the old session is already gone. Other deletion failures preserve the token and require retry before resetting.
- Failed restoration retains a successfully issued token so retry does not create another session. Unmount cancels pending requests; operation identity checks reject stale results. Strict Mode does not duplicate session creation during its initial setup/cleanup cycle.
- Browser storage failure displays actionable guidance. Tokens are never placed in URLs or logs.
- The newest history page restores recommendation/source metadata and pending/failed message labels. An in-progress restored request blocks new instructions until an explicit conversation check confirms it has finished. Loading earlier pages is Stage 4 work.

## Chat, recommendations, and cart controls

- Messages are trimmed and limited to 1–2000 characters. Enter sends; Shift+Enter inserts a newline. Suggested questions start an empty conversation. The pending user message appears immediately, with an indeterminate processing state and longer-wait copy after ten seconds.
- Every new turn gets one UUID. Chat and cart share a single operation lock, including double clicks. Manual cart edits and new sends are disabled while chat is processing; chat also waits for manual cart updates.
- Each message retains its own recommendations, sources, sections, and action results. Recommendations remain in backend order. Structured sections render instead of the fallback reply, with source IDs matched only to that message's evidence. Text is escaped by React; no backend HTML is injected.
- Source controls open a keyboard-accessible panel showing title, snippet, and content. Source identifiers are not treated as URLs. Recommendation cards show server prices, dietary tags, spice levels, availability, and the current cart quantity.
- Add sends current quantity + 1; quantity controls send absolute integers 0–20, and Remove sends zero. Unavailable dishes cannot be added or changed to a positive quantity, but can be removed. Successful chat/PUT responses replace the shared cart using server prices, line totals, and totals.
- HTTP 200 clarification, missing-evidence, out-of-scope, and rejected cart-action replies remain normal conversation messages. Model/retrieval failures display the documented error message. Oversized context suggests a narrower question or New Session.
- A failed or uncertain chat retains its original request ID and exact text for explicit Retry message. New instructions stay blocked while the result is uncertain. Check conversation reads history and the current cart, reconciles optimistic turns, and never posts a chat request. Busy responses require a check rather than an immediate retry loop.
- A successful retry can replay an old cart snapshot, so the frontend fetches the current cart before enabling further changes. If that refresh fails, the UI offers Refresh cart. No automatic mutation retries or normal background polling are added.
- Failed manual updates refresh the cart once to account for availability/missing-item changes. An uncertain write keeps its original absolute quantity for Retry cart update before allowing other changes. Session expiration during chat/cart clears old state and starts a fresh session without replaying the old instruction.
- Checkout remains unsupported. The frontend does not call the development retrieval endpoint or invent a public menu/source-detail endpoint.

## Readiness and routes

- `/` starts a shared health check and stays on welcome after success until **Continue to chat** is selected.
- Chat entry stays disabled until health is UP. Direct `/chat` visits show the welcome gate, then initialize the session automatically when ready.
- At 10 seconds, explain the Render free-tier cold start. At 60 seconds, show a longer-wait message. The indeterminate loader respects reduced motion and announces state changes.
- Retry network errors, timeouts, and HTTP 502/503/504 after three seconds. Requests run sequentially, with a three-minute deadline covering requests and delays.
- Other HTTP failures stop immediately. **Try again** starts a fresh bounded operation. Cancel requests/timers on disposal and ignore stale responses. Strict Mode is supported.
- Readiness stays fresh for 30 seconds for chat entry; recheck on entry after expiry. There is no background polling after success or interruption of an open conversation.
- Unknown routes show a not-found page with a home link. This is a UX gate, not backend authorization.

## Testing

Vitest and React Testing Library cover routing and accessible UI states. MSW intercepts the real Axios endpoint. Store tests use fake clocks for retry spacing, cold-start messages, cancellation, deadlines, and freshness. Normal tests do not call the live backend.

Stage 2 adds contract and session tests for envelope validation, scoped headers, empty 204 responses, parallel restoration, expired-session recovery, Strict Mode startup, reset/retry, blocked storage, cancellation, and stale responses.

Playwright checks responsive layouts (including 320px), keyboard interaction, reduced motion, and guarded navigation using mocked health responses. It uses the installed Edge browser. Browser screenshots and reports are ignored build artifacts.

The mocked browser suite uses a dedicated Vite server on `localhost:5174` with a fixed test API configuration, so it cannot accidentally reuse a developer's differently configured server on port 5173. Stage 3 coverage exercises full recommendation/source/manual-cart/chat-action/refresh flows at 320, 390, 768, and 1440px, plus retry ID preservation and model-unavailable feedback. Unit/integration tests cover concurrency, authoritative totals, business outcomes, session recovery, stale results, and uncertain-request handling.

Browser checks also restore historical messages, recommendation/source metadata, and current cart totals, verify refresh persistence, and exercise reset confirmation at mobile, tablet, and desktop widths. Real browser startup/refresh was separately verified against the locally configured backend at `http://localhost:8080/api/v1`; the temporary session was deleted afterward. Deployed integration remains a separate verification step.

Stage 3 was also verified in a real browser against that local backend: the recommendation request returned four dishes, source details opened, a recommendation Add succeeded, conversational cart requests returned `CART_UPDATED` and `CART_UNCHANGED` with the correct quantity, and refresh restored the conversation/cart. The temporary test session was deleted with HTTP 204. Automated tests use mocks and do not spend model quota.

A real browser request is necessary to verify CORS; a terminal success alone cannot prove browser access. Network errors do not claim a known cause.

## Vercel deployment

Use the Vite preset, `npm ci`, `npm run build`, and output directory `dist`. Set `VITE_API_BASE_URL` for every deployment environment, then rebuild. The Vercel configuration supports SPA routes while preserving static assets. Verify a fresh direct visit to `/chat` after deployment.

The backend must allow the actual frontend origin through CORS, including the local origin printed by Vite. The frontend does not bypass browser CORS enforcement.

## Docker deployment

The Dockerfile uses Node 24 Alpine for both its builder and runtime stages, without Nginx. Node 24 meets the installed React Router requirement of Node 22.22 or newer. It installs dependencies, builds the application, copies the project to the runtime stage, and starts the requested Vite development command on `0.0.0.0:3000`. Development dependencies remain available because this command needs Vite. The command serves application source; it does not serve the generated `dist` bundle.

`.dockerignore` excludes local dependencies, environment files, Git metadata, and test artifacts. Both stages default to the deployed backend URL through `VITE_API_BASE_URL`.

```sh
docker build --build-arg VITE_API_BASE_URL=https://ai-cart-backend.onrender.com/api/v1 -t ai-cart-frontend .
docker run --rm -p 3000:3000 --name ai-cart-frontend ai-cart-frontend
```

Open `http://localhost:3000` and verify a direct visit to `http://localhost:3000/chat`. Allow this origin in backend CORS when testing locally. Because this container starts the development server, an environment variable supplied at container startup can override the backend URL:

```sh
docker run --rm -p 3000:3000 -e VITE_API_BASE_URL=https://ai-cart-backend.onrender.com/api/v1 ai-cart-frontend
```

Configure the container host to send traffic to port 3000. For a custom deployment hostname, explicitly allow that trusted hostname through Vite's `server.allowedHosts` setting rather than disabling host validation. This Docker setup has no `/healthz` endpoint. Backend wake-up remains a browser interaction through `/api/v1/health`.

Docker build/run validation must be performed on a machine with Docker installed; Docker was not available in the development environment when this setup was added. Vercel's normal Vite deployment remains an alternative and does not require Docker.

## Phase 1 completion status

Frontend implementation and local backend connectivity are complete. Before declaring the roadmap's **deployed skeleton** complete:

- Deploy the frontend from the intended main branch and configure `VITE_API_BASE_URL` in that deployment.
- Allow the deployed frontend origin in backend CORS; verify deployed welcome-to-chat entry after a cold start and a direct `/chat` visit.
- Verify the Docker image builds and runs if using container deployment.
- Confirm the backend-owned checklist separately: Neon connectivity, pgvector enabled, successful chat-model and embedding-model calls, and backend main-branch deployment. These are not established by a frontend health response.

## Next phases

The detailed `AI-Cart-Development-Phases.txt` roadmap is local and ignored by Git at the user’s request. This README preserves the shared frontend decisions. Confirm later API paths with the backend rather than assuming the health endpoint’s version prefix applies everywhere.

Stage 3 provides the normal end-to-end UI and foundational explicit recovery controls. Stage 4 adds history pagination, broader interrupted/reloaded-request reconciliation, complete reliability checks, and deployed verification. Authentication, payments, admin screens, multiple restaurants, and WebSockets remain outside the MVP. Add live-demo, backend repository, screenshots, and video links when those artifacts exist.
