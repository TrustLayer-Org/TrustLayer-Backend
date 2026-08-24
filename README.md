# TrustLayer Backend

Express API for the TrustLayer platform: health checks and placeholder routes for trust verification and business listing. Ready to be wired to Stellar Horizon and Soroban.

## What’s in this repo

- **Express app** – `src/app.js` with `/health` and `/api/v1/*` placeholders
- **Durable repository** – SQLite-based persistence for trust signals with schema validation and migrations
- **Business directory** – `GET /api/v1/businesses` summarizing signal count and score per business
- **Signal breakdown** – `GET /api/v1/businesses/:id/breakdown` with per-type signal counts
- **Tests** – Jest + supertest in `src/app.test.js` with isolated test databases
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

The server will create a `data/signals.db` SQLite database on first startup. You can customize the database path using the `DB_PATH` environment variable.

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

## Data Persistence

The trust signals service now uses a durable SQLite repository for data persistence:

- **Database**: SQLite with WAL mode for better concurrency
- **Schema**: Explicit schema defined in `src/signals/database/schema.sql`
- **Migrations**: Automatic schema version tracking and migration on startup
- **Startup behavior**: Application fails clearly if schema is unavailable or incompatible
- **Test isolation**: Each test suite uses an isolated database that is cleaned up after tests

### Database Schema

The `signals` table stores trust signals with the following structure:
- `id`: Auto-incrementing primary key
- `business_id`: Integer identifier for the business
- `signal_type`: Enumerated type ('payment', 'review', 'dispute', 'kyc')
- `value`: Numeric signal value
- `created_at`: Timestamp of signal creation

Indexes are maintained on `business_id` and `signal_type` for query performance.

### Design Choices

- **SQLite**: Chosen for simplicity, zero-configuration deployment, and ACID compliance
- **WAL mode**: Enabled for better read/write concurrency
- **Schema validation**: Explicit schema with CHECK constraints ensures data integrity
- **Migration tracking**: Version tracking allows safe schema evolution
- **Graceful degradation**: Clear error messages when database is unavailable or incompatible

### Migration Considerations

- Schema versions are tracked in the `schema_migrations` table
- The application checks schema compatibility on startup
- If the database schema is older than the application expects, migrations run automatically
- If the database schema is newer than the application, startup fails with a clear error message
- This prevents accidental data corruption from version mismatches

### Failure Behavior

- **Database unavailable**: Application fails to start with clear error message
- **Schema incompatible**: Application fails to start with specific error about version mismatch
- **Invalid data**: Database constraints prevent insertion of invalid signal types or missing fields
- **Concurrent access**: WAL mode and busy timeout handle concurrent reads/writes
- **Recovery**: Database journal files allow recovery from crashes

### Security & Correctness

- **Input validation**: Application-level validation + database CHECK constraints prevent invalid data
- **SQL injection protection**: Parameterized queries used throughout
- **Data integrity**: Foreign key constraints and CHECK constraints enforce business rules
- **Adversarial inputs**: Cannot bypass database constraints - malformed data is rejected at both application and database layers

## License

MIT
