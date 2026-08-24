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

## API (current)

- `GET /health` – Health check
- `GET /api/v1/trust/verify/:businessId` – Trust verification placeholder

### Trust Signals API

A small in-memory service for recording trust signals and deriving a per-business
trust score. Signals have a `businessId`, a `signalType`
(`payment`, `review`, `dispute`, `kyc`), and a numeric `value`. Scores are a
weighted average of a business's signals, clamped to `0..100`.

- `POST /api/v1/signals` – Create a signal (validated; `400` on bad input)
- `GET /api/v1/signals` – List signals (`?businessId`, `?limit`, `?offset`)
- `GET /api/v1/signals/:id` – Fetch a signal (`404` when missing)
- `DELETE /api/v1/signals/:id` – Remove a signal (`404` when missing)
- `GET /api/v1/businesses/:id/score` – Computed trust score for a business

#### Idempotent signal creation

Retries after timeouts or lost responses must not create duplicate signals or
inflate trust scores twice. `POST /api/v1/signals` therefore accepts an
optional `Idempotency-Key` HTTP header:

- **First delivery** – the signal is created and the key is committed together
  with it in one atomic store operation, bound to a canonical SHA-256
  fingerprint of the request payload (`201`).
- **Exact retry** (same key + same payload) – returns the ORIGINAL record with
  `200` and an `Idempotency-Replayed: true` header. No second signal, no
  change to counts or scores.
- **Conflicting reuse** (same key + different payload, including a different
  `businessId`) – deterministic `409`; nothing is mutated and the original
  binding stays intact.
- **Invalid requests** (`400` for bad bodies or malformed keys) never reserve
  or burn the key: fix the payload and resend with the same key.
- **No key** – legacy behavior; every valid request creates a new signal.

Retention policy: a committed key can be replayed for **24 hours**
(overridable via `TRUSTLAYER_IDEMPOTENCY_TTL_MS`). After expiry the binding is
dropped on access and the key becomes reclaimable by a brand-new request —
late retries past the window are processed as explicitly NEW signals rather
than ambiguous stale replays.

Note: keys are currently process-local because the underlying store is
in-memory; durable persistence that also survives restarts is tracked in
issue #1.

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

## License

MIT
