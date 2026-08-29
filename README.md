# TrustLayer Backend

Express API for the TrustLayer platform: health checks and placeholder routes for trust verification and business listing. Ready to be wired to Stellar Horizon and Soroban.

## What’s in this repo

- **Express app** – `src/app.js` with `/health` and `/api/v1/*` placeholders
- **Business directory** – `GET /api/v1/businesses` summarizing signal count and score per business
- **Signal breakdown** – `GET /api/v1/businesses/:id/breakdown` with per-type signal counts
- **Tests** – Jest + supertest in `src/app.test.js`
- **CI** – Install, build, and test on push/PR to `main`

## Prerequisites

- Node.js 20+ and npm

## Setup

```bash
# Clone (or you're already in the repo)
git clone <your-remote>/trustlayer-backend
cd trustlayer-backend

# Install dependencies
npm ci

# Run tests
npm test

# Build (validates app loads)
npm run build

# Start server (default port 3001)
npm start
```

## Scripts

| Script   | Description                    |
|----------|--------------------------------|
| `start`  | Run the server                 |
| `test`   | Run Jest tests                 |
| `build`  | Verify app module loads        |

## Abuse Protection

### Body Size Limits

All incoming JSON request bodies are capped at **100 KB** by default. Requests
with a larger payload are rejected with `413 Payload Too Large` before any
business logic runs.

Configure via the `BODY_SIZE_LIMIT` environment variable:

```bash
BODY_SIZE_LIMIT=50kb npm start   # stricter
BODY_SIZE_LIMIT=1mb npm start    # more permissive
```

Accepts any value understood by the [`bytes`](https://www.npmjs.com/package/bytes)
library (used internally by Express).

### Rate Limiting

Write routes (`POST /api/v1/signals`, `DELETE /api/v1/signals/:id`) are rate
limited per client IP. Read routes (`GET ...`) are **not** rate limited.

| Environment Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_WINDOW_MS` | `60000` | Window duration in milliseconds |
| `RATE_LIMIT_MAX` | `30` | Max requests per window per IP |

#### 429 Response

When the limit is exceeded the response includes safe retry metadata:

```json
{
  "error": "Too many requests",
  "retryAfter": 42,
  "resetTime": "2026-08-25T12:34:00.000Z"
}
```

Headers on **every** response (allowed or blocked):

| Header | Description |
|---|---|
| `X-RateLimit-Limit` | Max requests allowed in the window |
| `X-RateLimit-Remaining` | Requests remaining in the current window |
| `X-RateLimit-Reset` | Unix timestamp (seconds) when the window resets |
| `Retry-After` | Seconds until the window resets (only on 429) |

#### Failure Behavior

The rate limiter is fail-safe for mutation routes. If the limiter itself throws
an error, the request is rejected with `503 Service Unavailable` rather than
silently passing through. This prevents adversaries from disabling protection
by crashing the limiter.

#### Trust Proxy

The app sets `trust proxy = 1` so `req.ip` reflects the real client IP when
behind a load balancer or reverse proxy. Adjust `trust proxy` in `src/app.js`
if your deployment uses a different number of proxy hops.

#### Actor Identity

Rate limits are keyed by `req.ip`, which is the authenticated client identity
when behind a trusted proxy. This is not a spoofable header — Express derives
the IP from the `X-Forwarded-For` chain only when `trust proxy` is enabled.

## API (current)

- `GET /health` – Health check

### API Versioning

The trust verification and score endpoints support versioned contracts to prevent ambiguous responses. The `v2` endpoints include source provenance, calculation version, data freshness, and verification status.

- `/api/v1/*` – The legacy unversioned endpoints (returns basic score and message).
- `/api/v2/*` – Versioned contracts with provenance data.
- Unknown versions (e.g., `/api/v3/*`) return a `404 Not Found` with an `unsupported version` error.

### Trust Signals API

A small in-memory service for recording trust signals and deriving a per-business
trust score. Signals have a `businessId`, a `signalType`
(`payment`, `review`, `dispute`, `kyc`), and a numeric `value`. Scores are a
weighted average of a business's signals, clamped to `0..100`.

- `POST /api/v1/signals` – Create a signal (validated; `400` on bad input)
- `GET /api/v1/signals` – List signals (`?businessId`, `?limit`, `?offset`)
- `GET /api/v1/signals/:id` – Fetch a signal (`404` when missing)
- `DELETE /api/v1/signals/:id` – Remove a signal (`404` when missing)

**Score Endpoints:**
- `GET /api/v1/businesses/:id/score` – Computed trust score for a business (legacy format)
- `GET /api/v2/businesses/:id/score` – Computed trust score with provenance contract
- `GET /api/v1/trust/verify/:businessId` – Trust verification placeholder
- `GET /api/v2/trust/verify/:businessId` – Explicit mock verification with provenance

### Business Directory API

Derives a directory of businesses directly from stored signals, with no separate
business registration step:

- `GET /api/v1/businesses` – List every business with stored signals as
  `{ businessId, signalCount, score }`, sorted by score descending
  (`?limit` caps the number returned)

### Signal Type Breakdown API

Shows how a business's signals are distributed across types, without exposing
the raw signal records:

- `GET /api/v1/businesses/:id/breakdown` – Per-type signal counts
  (`payment`, `review`, `dispute`, `kyc`) plus the `dominantType`, the type
  with the highest count (`null` when the business has no signals)

## Contributing

1. Fork the repo and create a branch from `main`.
2. Install with `npm ci` and run `npm test` and `npm run build`.
3. Open a pull request to `main`. CI will run build and tests.

## Rollback

Rate limiting and body size limits are purely additive middleware — no schema
changes, no data migration, no new runtime dependencies. To revert:

1. Remove `src/middleware/rateLimiter.js` and `src/middleware/rateLimiter.test.js`.
2. Revert `src/signals/router.js` to remove the `writeLimiter` import and
   middleware from `POST /signals` and `DELETE /signals/:id`.
3. Revert `src/app.js` to use `express.json()` without a `limit` option and
   remove `app.set('trust proxy', 1)`.
4. Optionally revert `src/signals/constants.js` to remove the rate-limit
   constants.

No environment variable changes are required — the app works with or without
the `BODY_SIZE_LIMIT`, `RATE_LIMIT_WINDOW_MS`, and `RATE_LIMIT_MAX` variables.

## License

MIT
