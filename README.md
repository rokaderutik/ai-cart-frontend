# AI Cart frontend

A restaurant assistant for discovering dishes, inspecting recommendation sources, and building a shared cart through conversation or UI controls.

- Frontend repository: https://github.com/rokaderutik/ai-cart-frontend
- Backend: https://ai-cart-backend.onrender.com
- Published frontend: https://ai-cart-frontend.vercel.app
- Hosting: Vercel. Local changes require a separate commit/push/deployment.

## Current phase

Stage 4 adds cursor-based history pagination, reading-position preservation, reload recovery from backend request history, reconciliation before retries, offline feedback, a frontend CI workflow, and a reusable deployment smoke check. These build on sequential chat, source-backed recommendations, manual/conversational cart operations, responsive layouts, and the shared readiness/session lifecycle. Stage 4 is deployed on Vercel and its integration with the Render backend was verified on 24 October 2026.

The follow-up bounded chat-recovery fix is implemented locally and requires deployment. Its verification passed 126 unit/integration tests, 24 browser tests, lint, formatting, and the production build. The repeated-model-error checks use controlled API responses; they do not establish deployment of this fix or repair the backend's model-output validation failures.

React calls Spring Boot, which owns PostgreSQL/pgvector, retrieval, AI-provider calls, sessions, conversation persistence, and authoritative cart totals. Database and AI-provider credentials do not belong in this frontend.

## Local setup

Use a current Node.js LTS version compatible with Vite 8 and npm. Run `npm ci`, copy `.env.example` to `.env.local`, then run `npm run dev`. Open the Local URL printed by Vite.

```env
VITE_API_BASE_URL=https://ai-cart-backend.onrender.com/api/v1
```

Restart Vite after environment changes. The base URL must use HTTP(S), end in `/api/v1`, and contain no query, credentials, or fragment. A trailing slash is normalized. Origin-only values from Phase 1 now need `/api/v1` appended. `VITE_` variables are public client configuration, never secrets.

For a local backend, use `VITE_API_BASE_URL=http://localhost:8080/api/v1 npm run dev` in Bash. In PowerShell, use `$env:VITE_API_BASE_URL = "http://localhost:8080/api/v1"; npm run dev`.

| Command                    | Purpose                                       |
| -------------------------- | --------------------------------------------- |
| `npm run dev`              | Development server                            |
| `npm run build`            | Production bundle in `dist`                   |
| `npm run preview`          | Serve the production bundle locally           |
| `npm run lint`             | ESLint and React Hooks checks                 |
| `npm test`                 | Deterministic unit and integration tests      |
| `npm run test:watch`       | Watch tests                                   |
| `npm run test:browser`     | Browser checks using installed Microsoft Edge |
| `npm run smoke:deployment` | Explicit live frontend/API smoke check        |
| `npm run format`           | Format source and configuration               |
| `npm run format:check`     | Check formatting                              |

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
- The newest history page restores recommendation/source metadata and pending/failed message labels. The latest unfinished user request is reconstructed from its backend request ID and exact saved content; older failed requests are not automatically retried.

## Chat, recommendations, and cart controls

- Messages are trimmed and limited to 1–2000 characters. Enter sends; Shift+Enter inserts a newline. Suggested questions start an empty conversation. The pending user message appears immediately, with an indeterminate processing state and longer-wait copy after ten seconds.
- Every new turn gets one UUID. Chat and cart share a single operation lock, including double clicks. Manual cart edits and new sends are disabled while chat is processing; chat also waits for manual cart updates.
- Each message retains its own recommendations, sources, sections, and action results. Recommendations remain in backend order. Structured sections render instead of the fallback reply, with source IDs matched only to that message's evidence. Text is escaped by React; no backend HTML is injected.
- Source controls open a keyboard-accessible panel showing title, snippet, and content. Source identifiers are not treated as URLs. Recommendation cards show server prices, dietary tags, spice levels, availability, and the current cart quantity.
- Add sends current quantity + 1; quantity controls send absolute integers 0–20, and Remove sends zero. Unavailable dishes cannot be added or changed to a positive quantity, but can be removed. Successful chat/PUT responses replace the shared cart using server prices, line totals, and totals.
- HTTP 200 clarification, missing-evidence, out-of-scope, and rejected cart-action replies remain normal conversation messages. Model/retrieval failures display the documented error message. Oversized context suggests a narrower question or New Session.
- A failed or uncertain chat retains its original request ID and exact text for explicit Retry message. Every retry first reads history and the current cart: a completed request is restored without another POST, a newer turn blocks stale replay, and a still-running turn requires an explicit recovery action. Check conversation never posts a chat request. There are no automatic POST retries or status-polling loops.
- Each active message allows the original chat POST plus **one explicit retry**, for two attempts total. History/cart checks and failed retry preflights do not consume or reset that allowance. After the retry fails, the frontend automatically checks history and the current cart. A confirmed `FAILED` request leaves its failed message visible and enables new messages/cart controls; the next user-submitted message gets a new ID. The same old request cannot be retried a third time in that page lifecycle, including through repeated Check conversation clicks.
- A completed result found during this check is restored instead. Missing, still-processing, or unverified results stay guarded without further chat retries; Check conversation or an explicit New Session remain available. The frontend never automatically resubmits the failed instruction under a new ID.
- A successful retry can replay an old cart snapshot, so the frontend fetches the current cart before enabling further changes. If that refresh fails, the UI offers Refresh cart. No automatic mutation retries or normal background polling are added.
- Failed manual updates refresh the cart once to account for availability/missing-item changes. An uncertain write keeps its original absolute quantity for Retry cart update before allowing other changes. Session expiration during chat/cart clears old state and starts a fresh session without replaying the old instruction.
- Checkout remains unsupported. The frontend does not call the development retrieval endpoint or invent a public menu/source-detail endpoint.

## History and interrupted-request recovery

- Load earlier messages sends the current `nextBefore` cursor, prepends the chronological page, deduplicates persisted/optimistic records by message ID or request ID plus role, and preserves the visible reading position. The cursor advances only on success. Failed or non-advancing pages retain their retry action and already loaded content.
- Older pages never replace the current cart with historical metadata. A history status check preserves older loaded pages and their earliest cursor. Session reset/expiry cancels old work and discards old pages.
- A refreshed latest `FAILED` turn offers its original request for one optional retry without locking new questions; an `IN_PROGRESS` turn stays locked until checked. After a check, Recover original request can ask the backend to resume an interrupted/expired attempt with the same ID/text within the one-retry allowance. A still-active backend request can return busy again; the frontend does not loop.
- If a timeout/lost response already completed on the server, reconciliation restores the saved reply/cards and current cart without sending the instruction again. Successful replay responses still trigger a current-cart refresh because replayed cart snapshots can be historical.
- `CHAT_RETRY_STALE` or a newer saved user turn stops old-ID retries. Sending that text as a new request requires an explicit confirmation. Corrected input, oversized context, and session expiration do not automatically replay the old instruction.
- Offline detection preserves an in-memory draft and disables mutation controls. Reconnecting enables controls; it never automatically submits a draft or pending instruction. Canceling client work does not undo a backend cart action.
- Only the session token is persisted locally. Requests that never reached backend history, unsent drafts after a full refresh, and uncertain manual commands after a full refresh cannot be reconstructed from a local journal. The frontend restores the authoritative current cart and never invents or automatically repeats a missing instruction. Recovering such unsaved text would require changing the token-only storage decision or adding a backend request-status contract.
- Attempt counts are in memory. Backend history does not include an attempt count, so a full reload restores the saved request as having its original attempt and permits one optional recovery attempt in the new page lifecycle. Enforcing a lifetime retry limit across browser reloads would require backend attempt metadata or an additional persisted client counter.

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

Stage 4 tests add overlapping/failed history pages, scroll anchoring, reload recovery, completed-request reconciliation with no second POST, explicit stale-message confirmation, offline drafts, session expiry during pagination, and cancellation of replaced-session responses. The GitHub Actions workflow runs lint, formatting, deterministic unit tests, production build, and browser tests on Chromium. Local tests default to Edge; set `PLAYWRIGHT_BROWSER=chromium` after installing Playwright Chromium to use the CI browser locally. Live model calls are excluded from CI.

Bounded chat-recovery regression tests reproduce `CHAT_INVALID_MODEL_OUTPUT` HTTP 503 twice through the running UI at mobile/desktop widths. They verify the unchanged ID/text on retry, no third POST after checking, preserved cart/history, and a new ID for the next message. Store tests also cover unavailable reconciliation, still-processing/missing requests, lost successful responses, failed preflights, reload behavior, and canceled/replaced-session results.

Browser checks also restore historical messages, recommendation/source metadata, and current cart totals, verify refresh persistence, and exercise reset confirmation at mobile, tablet, and desktop widths. Real browser startup/refresh was separately verified against the locally configured backend at `http://localhost:8080/api/v1`; the temporary session was deleted afterward. The deployed Vercel/Render integration has also been verified as described below.

Stage 3 was also verified in a real browser against that local backend: the recommendation request returned four dishes, source details opened, a recommendation Add succeeded, conversational cart requests returned `CART_UPDATED` and `CART_UNCHANGED` with the correct quantity, and refresh restored the conversation/cart. The temporary test session was deleted with HTTP 204. Automated tests use mocks and do not spend model quota.

A real browser request is necessary to verify CORS; a terminal success alone cannot prove browser access. Network errors do not claim a known cause.

## Vercel deployment

Use the Vite preset, `npm ci`, `npm run build`, and output directory `dist`. Set `VITE_API_BASE_URL` for every deployment environment, then rebuild. The Vercel configuration supports SPA routes while preserving static assets. Verify a fresh direct visit to `/chat` after deployment.

The backend must allow the actual frontend origin through CORS, including the local origin printed by Vite. The frontend does not bypass browser CORS enforcement.

Run a live smoke check against an already deployed frontend from Bash:

```bash
FRONTEND_URL=https://ai-cart-frontend.vercel.app npm run smoke:deployment
```

In PowerShell, set `$env:FRONTEND_URL = "https://ai-cart-frontend.vercel.app"` and run `npm run smoke:deployment`. The default API target is the Render URL above; override `API_BASE_URL` to check a matching local or alternate deployment. The frontend must already be configured to call that API. The script verifies a direct `/chat` visit, browser health/CORS, temporary session/history/cart startup, refresh persistence, and not-found routing, then deletes only sessions it created. It writes a token-free report to `test-results/deployment-smoke.json`. It does not publish anything.

Add `SMOKE_CHAT=true` to explicitly include three live model requests, recommendation Add, and conversational cart updates. This uses provider quota and stays outside normal CI. Rerun against the intended revision after future deployments. Docker build/run verification still requires Docker on the host.

Stage 4 verification on 24 October 2026: 117 unit/integration tests and 22 browser tests passed, along with lint, formatting, and the production build. The live local smoke check passed against `http://localhost:5173` and `http://localhost:8080/api/v1`, including HTTP 204 cleanup of its temporary session.

Production verification on 24 October 2026 passed against `https://ai-cart-frontend.vercel.app` and `https://ai-cart-backend.onrender.com/api/v1`. The earlier frontend configuration blocker is resolved. The deployed smoke check verified direct `/chat` routing, browser health/CORS, session/history/cart startup, live recommendations, manual Add, conversational cart updates, refresh restoration, and the unknown-route fallback.

Additional isolated-browser checks verified real source titles/content, Add/increase/decrease/remove controls, reset confirmation/cancellation, old-token revocation, and layouts/cart drawers at 320, 390, 768, and 1440px with no horizontal page overflow or uncaught browser errors. Live history requests used a smaller supported `limit=3` to exercise real backend cursors and reading-position preservation without generating 50 messages; response bodies were not mocked.

Recovery was checked by deliberately dropping a successful real chat response after the backend applied `CART_UPDATED`. Retry restored persisted history and the current cart without a second chat POST or duplicate cart mutation. A browser offline toggle preserved the draft and did not resend on reconnect. These were induced client-side failures, not observed backend outages. An ordinal cart instruction returned normal `CLARIFICATION` on one run; an explicit dish-name instruction completed the mutation/recovery check.

Reports are saved locally at `test-results/deployment-smoke.json` and `test-results/live-stage4-verification.json`, with responsive screenshots alongside them. They contain no session tokens. Every temporary session was deleted with HTTP 204 or confirmed already revoked with HTTP 401 after reset. Only the token was persisted in browser session storage. Render was already awake, so a new real cold start and live model-provider outages were not forced; those failure paths remain covered by deterministic tests. No application code, deployment settings, or deployments were changed during this verification.

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

Frontend implementation, local connectivity, and the deployed skeleton's frontend integration are complete. The deployed welcome-to-chat flow, direct `/chat` entry, and browser CORS have been verified. Separate checks remain where applicable:

- Observe a new Render cold start if an actual cold-start timing check is required; the backend was already awake during production verification.
- Verify the Docker image builds and runs if using container deployment.
- Confirm the backend-owned checklist separately: Neon connectivity, pgvector enabled, successful chat-model and embedding-model calls, and backend main-branch deployment. These are not established by a frontend health response.

## Next phases

The detailed `AI-Cart-Development-Phases.txt` roadmap is local and ignored by Git at the user’s request. This README preserves the shared frontend decisions. Confirm later API paths with the backend rather than assuming the health endpoint’s version prefix applies everywhere.

The frontend integration stages are implemented and deployed, and the live Stage 4 integration checks passed. Continue running CI and the deployment smoke check for future revisions. Docker image validation remains necessary if container hosting is used. Backend RAG evaluation/results and portfolio materials remain separate roadmap work. Authentication, payments, admin screens, multiple restaurants, and WebSockets remain outside the MVP.
