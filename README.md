# TrustLayer Backend

Express API for the TrustLayer platform: health checks and placeholder routes for trust verification and business listing. Ready to be wired to Stellar Horizon and Soroban.

## What’s in this repo

- **Express app** – `src/app.js` with `/health` and `/api/v1/*` placeholders
- **Business directory** – `GET /api/v1/businesses` summarizing signal count and score per business
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
- `GET /api/v1/businesses` – List businesses placeholder

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

## Contributing

1. Fork the repo and create a branch from `main`.
2. Install with `npm ci` and run `npm test` and `npm run build`.
3. Open a pull request to `main`. CI will run build and tests.

## License

MIT
