const {
  canonicalize,
  fingerprintPayload,
  validateIdempotencyKey,
  resolveTtlMs,
  DEFAULT_TTL_MS,
  MAX_IDEMPOTENCY_KEY_LENGTH,
} = require('./idempotency');

describe('canonicalize', () => {
  it('is independent of JSON object key order', () => {
    const a = canonicalize({ businessId: 1, signalType: 'payment', value: 100 });
    const b = canonicalize({ value: 100, signalType: 'payment', businessId: 1 });
    expect(a).toBe(b);
  });

  it('sorts keys recursively in nested objects', () => {
    const a = canonicalize({ outer: { y: 2, x: 1 } });
    const b = canonicalize({ outer: { x: 1, y: 2 } });
    expect(a).toBe(b);
    expect(a).toContain('"x":1');
  });

  it('preserves array order', () => {
    expect(canonicalize([1, 2, 3])).not.toBe(canonicalize([3, 2, 1]));
  });

  it('distinguishes payloads that only differ by an extra field', () => {
    const base = { businessId: 1, signalType: 'payment', value: 100 };
    const withExtra = { ...base, note: 'relay dup' };
    expect(canonicalize(base)).not.toBe(canonicalize(withExtra));
  });

  it('rejects values that cannot appear in request data', () => {
    expect(() => canonicalize(undefined)).toThrow(TypeError);
  });
});

describe('fingerprintPayload', () => {
  it('produces a stable sha-256 hex fingerprint for identical payloads', () => {
    const payload = { businessId: 7, signalType: 'review', value: 3.5 };
    const first = fingerprintPayload(payload);
    const second = fingerprintPayload({ value: 3.5, signalType: 'review', businessId: 7 });
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the business identity changes', () => {
    const a = fingerprintPayload({ businessId: 1, signalType: 'payment', value: 100 });
    const b = fingerprintPayload({ businessId: 2, signalType: 'payment', value: 100 });
    expect(a).not.toBe(b);
  });
});

describe('validateIdempotencyKey', () => {
  it('accepts a normal key without errors', () => {
    const errors = [];
    validateIdempotencyKey('retry-abc-123', errors);
    expect(errors).toEqual([]);
  });

  it('rejects empty and non-string keys', () => {
    const emptyErrors = [];
    validateIdempotencyKey('', emptyErrors);
    expect(emptyErrors).toHaveLength(1);

    const wrongTypeErrors = [];
    validateIdempotencyKey(42, wrongTypeErrors);
    expect(wrongTypeErrors).toHaveLength(1);
  });

  it('rejects oversized keys', () => {
    const errors = [];
    validateIdempotencyKey('k'.repeat(MAX_IDEMPOTENCY_KEY_LENGTH + 1), errors);
    expect(errors).toHaveLength(1);
  });
});

describe('resolveTtlMs', () => {
  afterEach(() => {
    delete process.env.TRUSTLAYER_IDEMPOTENCY_TTL_MS;
  });

  it('prefers an explicit override', () => {
    process.env.TRUSTLAYER_IDEMPOTENCY_TTL_MS = '999';
    expect(resolveTtlMs(5)).toBe(5);
  });

  it('falls back to the environment variable', () => {
    process.env.TRUSTLAYER_IDEMPOTENCY_TTL_MS = '1234';
    expect(resolveTtlMs()).toBe(1234);
  });

  it('ignores invalid environment values and uses the default', () => {
    process.env.TRUSTLAYER_IDEMPOTENCY_TTL_MS = '-5';
    expect(resolveTtlMs()).toBe(DEFAULT_TTL_MS);
  });
});
