# AI Cart frontend

A restaurant assistant for discovering dishes, inspecting recommendation sources, and building a shared cart through conversation or UI controls.

- Frontend repository: https://github.com/rokaderutik/ai-cart-frontend
- Backend: https://ai-cart-backend.onrender.com
- Hosting target: Vercel. Phase 1 does not publish the application.

## Current phase

Phase 1 delivers a responsive welcome page, backend wake-up gate, and guarded chat placeholder. **Messaging, sessions, recommendations, and cart operations arrive in later phases.** The capability overview is marked as coming soon.

React calls Spring Boot, which owns PostgreSQL/pgvector, retrieval, AI-provider calls, sessions, conversation persistence, and authoritative cart totals. Database and AI-provider credentials do not belong in this frontend.

## Local setup

Use a current Node.js LTS version compatible with Vite 8 and npm. Run `npm ci`, copy `.env.example` to `.env.local`, then run `npm run dev`. Open the Local URL printed by Vite.

```env
VITE_API_BASE_URL=https://ai-cart-backend.onrender.com
```

Restart Vite after environment changes. The base URL must be an HTTP(S) origin without a path, query, credentials, or fragment. `VITE_` variables are public client configuration, never secrets.

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
  app/                 Entry, router, readiness provider, chat gate
  api/                 Shared Axios client and safe application errors
  components/common/   Shared application components
  components/ui/       JavaScript shadcn/ui primitives
  config/              Environment validation
  features/health/     Endpoint, wake-up store, hook, status panel
  layouts/             Header, main content, footer
  pages/               Welcome, chat placeholder, not-found
  lib/                 Shared utilities
  styles/              Global styles and theme tokens
  test/                MSW server and test setup
  main.jsx             Strict Mode bootstrap
```

Use JavaScript/JSX, focused functional components and hooks, explicit props, immutable updates, semantic HTML, and `@/` imports. Keep feature behavior near its feature and network configuration outside components. Use optional chaining for nullable external/network data and optional values, with explicit fallbacks or validation where needed. Preserve checks for required internal invariants rather than silently hiding programming errors. Strict Mode and React Compiler remain enabled. Format with Prettier and check React rules with ESLint.

The light theme uses warm neutrals and burnt-orange accents, Tailwind CSS, Lucide icons, and JavaScript shadcn/ui New York components. The decorative meal SVG is local artwork, not a real recommendation.

## API interface

The Phase 1 endpoint is **`GET /api/v1/health`** with the confirmed response **`{"status":"UP"}`**. Any successful HTTP response establishes connectivity; readiness does not depend on parsing that body. This does not independently verify database or model-provider health.

Components use `useHealth`. Endpoint modules own methods, paths, parameters, and response extraction:

```js
import { getHealth } from '@/features/health/health.api'

const controller = new AbortController()
const body = await getHealth({ signal: controller.signal })
// controller.abort() cancels work that is no longer needed.
```

The shared Axios client supplies the environment origin, JSON acceptance, a 15-second default timeout, and normalized errors. Health overrides the timeout to 60 seconds. `ApiError` exposes `kind`, `status`, and a safe `message`. Raw backend errors are never displayed automatically. Cancellation is distinct from connection failure. Invalid configuration blocks dispatch and displays setup guidance.

There are no global automatic retries, cookie credentials, authentication redirects, or session headers. Add feature-specific behavior when its functionality is implemented.

## Readiness and routes

- `/` starts a shared health check and stays on welcome after success until **Continue to chat** is selected.
- Chat entry stays disabled until health succeeds. Direct `/chat` visits show the welcome gate, then reveal the placeholder automatically when ready.
- At 10 seconds, explain the Render free-tier cold start. At 60 seconds, show a longer-wait message. The indeterminate loader respects reduced motion and announces state changes.
- Retry network errors, timeouts, and HTTP 502/503/504 after three seconds. Requests run sequentially, with a three-minute deadline covering requests and delays.
- Other HTTP failures stop immediately. **Try again** starts a fresh bounded operation. Cancel requests/timers on disposal and ignore stale responses. Strict Mode is supported.
- Readiness stays fresh for 30 seconds for chat entry; recheck on entry after expiry. There is no background polling after success or interruption of an open placeholder.
- Unknown routes show a not-found page with a home link. This is a UX gate, not backend authorization.

## Testing

Vitest and React Testing Library cover routing and accessible UI states. MSW intercepts the real Axios endpoint. Store tests use fake clocks for retry spacing, cold-start messages, cancellation, deadlines, and freshness. Normal tests do not call the live backend.

Playwright checks responsive layouts (including 320px), keyboard interaction, reduced motion, and guarded navigation using mocked health responses. It uses the installed Edge browser. Browser screenshots and reports are ignored build artifacts.

A real browser request is necessary to verify CORS; a terminal success alone cannot prove browser access. Network errors do not claim a known cause.

## Vercel deployment

Use the Vite preset, `npm ci`, `npm run build`, and output directory `dist`. Set `VITE_API_BASE_URL` for every deployment environment, then rebuild. The Vercel configuration supports SPA routes while preserving static assets. Verify a fresh direct visit to `/chat` after deployment.

The backend must allow the actual frontend origin through CORS, including the local origin printed by Vite. The frontend does not bypass browser CORS enforcement.

## Docker deployment

The Dockerfile uses Node 24 Alpine for both its builder and runtime stages, without Nginx. Node 24 meets the installed React Router requirement of Node 22.22 or newer. It installs dependencies, builds the application, copies the project to the runtime stage, and starts the requested Vite development command on `0.0.0.0:3000`. Development dependencies remain available because this command needs Vite. The command serves application source; it does not serve the generated `dist` bundle.

`.dockerignore` excludes local dependencies, environment files, Git metadata, and test artifacts. Both stages default to the deployed backend URL through `VITE_API_BASE_URL`.

```sh
docker build --build-arg VITE_API_BASE_URL=https://ai-cart-backend.onrender.com -t ai-cart-frontend .
docker run --rm -p 3000:3000 --name ai-cart-frontend ai-cart-frontend
```

Open `http://localhost:3000` and verify a direct visit to `http://localhost:3000/chat`. Allow this origin in backend CORS when testing locally. Because this container starts the development server, an environment variable supplied at container startup can override the backend URL:

```sh
docker run --rm -p 3000:3000 -e VITE_API_BASE_URL=https://ai-cart-backend.onrender.com ai-cart-frontend
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

Later work adds anonymous sessions, restored chat, source-grounded recommendations, and cart operations. Authentication, payments, admin screens, multiple restaurants, and WebSockets remain outside the MVP. Add live-demo, backend repository, screenshots, and video links when those artifacts exist.
