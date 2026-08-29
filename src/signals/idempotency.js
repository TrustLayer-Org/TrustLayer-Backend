// Idempotency helpers for signal ingestion.
//
// A caller-provided idempotency key is bound to the canonical fingerprint of
// the request payload. The binding decision is made by the store in a single
// synchronous critical section together with signal insertion, so a retry
// can never create a second signal.

const crypto = require('crypto');

// Deterministic canonical serialization used for payload fingerprints.
// Object keys are sorted recursively so that JSON key order cannot change
// the fingerprint of an otherwise identical payload. Array order is
// significant and preserved.
const canonicalize = (value) => {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    typeof value === 'number'
  ) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(',')}]`;
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value).sort();
    const pairs = keys.map(
      (key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`
    );
    return `{${pairs.join(',')}}`;
  }
  // undefined, functions, and symbols are not representable request data.
  throw new TypeError('unsupported value in canonical payload');
};

module.exports.canonicalize = canonicalize;

// SHA-256 hex fingerprint of the canonical payload form.
const fingerprintPayload = (payload) =>
  crypto.createHash('sha256').update(canonicalize(payload)).digest('hex');

module.exports.fingerprintPayload = fingerprintPayload;

// Maximum accepted idempotency key length in bytes.
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;

module.exports.MAX_IDEMPOTENCY_KEY_LENGTH = MAX_IDEMPOTENCY_KEY_LENGTH;

// Validate a caller-provided idempotency key; pushes messages into errors.
const validateIdempotencyKey = (key, errors) => {
  if (typeof key !== 'string' || key.length === 0) {
    errors.push('Idempotency-Key must be a non-empty string');
    return;
  }
  if (key.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
    errors.push(
      `Idempotency-Key must be at most ${MAX_IDEMPOTENCY_KEY_LENGTH} characters`
    );
  }
};

module.exports.validateIdempotencyKey = validateIdempotencyKey;

// Default retention window for committed idempotency records: 24 hours.
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

module.exports.DEFAULT_TTL_MS = DEFAULT_TTL_MS;

// Resolve the retention window, allowing an explicit override for tests
// and deployments. Non-positive or non-numeric values fall back to default.
const resolveTtlMs = (ttlMs) => {
  if (Number.isFinite(ttlMs) && ttlMs > 0) {
    return ttlMs;
  }
  const raw = process.env.TRUSTLAYER_IDEMPOTENCY_TTL_MS;
  if (raw !== undefined) {
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return DEFAULT_TTL_MS;
};

module.exports.resolveTtlMs = resolveTtlMs;
