const store = require('./store');
const { fingerprintPayload } = require('./idempotency');

const PAYLOAD = { businessId: 1, signalType: 'payment', value: 100 };

beforeEach(() => {
  store.clearSignals();
  delete process.env.TRUSTLAYER_IDEMPOTENCY_TTL_MS;
});

describe('signal store', () => {
  it('addSignal stores a record with a generated id', () => {
    const record = store.addSignal({
      businessId: 1,
      signalType: 'payment',
      value: 100,
    });
    expect(record.id).toBe(1);
    expect(store.getAllSignals()).toHaveLength(1);
  });
});

describe('getSignalById', () => {
  it('returns the matching signal or undefined', () => {
    const created = store.addSignal({
      businessId: 1,
      signalType: 'payment',
      value: 100,
    });
    store.addSignal({ businessId: 2, signalType: 'review', value: 5 });
    expect(store.getSignalById(created.id)).toMatchObject({ businessId: 1 });
    expect(store.getSignalById(999)).toBeUndefined();
  });
});

describe('getSignalsByBusiness', () => {
  it('returns only signals for the given business', () => {
    store.addSignal({ businessId: 1, signalType: 'payment', value: 100 });
    store.addSignal({ businessId: 1, signalType: 'review', value: 5 });
    store.addSignal({ businessId: 2, signalType: 'payment', value: 50 });
    expect(store.getSignalsByBusiness(1)).toHaveLength(2);
    expect(store.getSignalsByBusiness(2)).toHaveLength(1);
  });
});

describe('removeSignal and countSignals', () => {
  it('removes records and reports the count', () => {
    const created = store.addSignal({
      businessId: 1,
      signalType: 'payment',
      value: 100,
    });
    expect(store.countSignals()).toBe(1);
    expect(store.removeSignal(created.id)).toBe(true);
    expect(store.removeSignal(created.id)).toBe(false);
    expect(store.countSignals()).toBe(0);
  });
});

describe('addSignalIdempotent', () => {
  it('creates exactly one signal for an exact retry and replays the original record', () => {
    const fingerprint = fingerprintPayload(PAYLOAD);
    const first = store.addSignalIdempotent(PAYLOAD, {
      key: 'k-retry',
      fingerprint,
    });
    const retry = store.addSignalIdempotent(PAYLOAD, {
      key: 'k-retry',
      fingerprint,
    });

    expect(first.outcome).toBe('created');
    expect(retry.outcome).toBe('replayed');
    expect(retry.record).toEqual(first.record);
    expect(retry.record).not.toBe(first.record); // snapshot, not a live alias
    expect(store.countSignals()).toBe(1);
  });

  it('returns conflict for the same key with a different payload and mutates nothing', () => {
    const fingerprint = fingerprintPayload(PAYLOAD);
    const first = store.addSignalIdempotent(PAYLOAD, {
      key: 'k-conflict',
      fingerprint,
    });

    const otherPayload = { businessId: 1, signalType: 'payment', value: 999 };
    const conflicting = store.addSignalIdempotent(otherPayload, {
      key: 'k-conflict',
      fingerprint: fingerprintPayload(otherPayload),
    });

    expect(conflicting.outcome).toBe('conflict');
    expect(conflicting.record).toBeUndefined();
    expect(store.countSignals()).toBe(1);

    // The original binding is untouched: the original request still replays.
    const replay = store.addSignalIdempotent(PAYLOAD, {
      key: 'k-conflict',
      fingerprint,
    });
    expect(replay.outcome).toBe('replayed');
    expect(replay.record).toEqual(first.record);
  });

  it('rejects cross-business reuse of the same key', () => {
    const fingerprint = fingerprintPayload(PAYLOAD);
    store.addSignalIdempotent(PAYLOAD, { key: 'k-biz', fingerprint });

    const otherBusiness = { ...PAYLOAD, businessId: 2 };
    const conflicting = store.addSignalIdempotent(otherBusiness, {
      key: 'k-biz',
      fingerprint: fingerprintPayload(otherBusiness),
    });

    expect(conflicting.outcome).toBe('conflict');
    expect(
      store.getSignalsByBusiness(2)
    ).toHaveLength(0);
  });

  it('lets concurrent identical callers win only once', () => {
    // The decision runs synchronously inside one event-loop turn, so every
    // caller after the first must observe the committed binding.
    const outcomes = Array.from({ length: 8 }, () =>
      store.addSignalIdempotent(PAYLOAD, {
        key: 'k-race',
        fingerprint: fingerprintPayload(PAYLOAD),
      })
    );

    expect(outcomes.filter((r) => r.outcome === 'created')).toHaveLength(1);
    expect(outcomes.filter((r) => r.outcome === 'replayed')).toHaveLength(7);
    expect(new Set(outcomes.map((r) => r.record.id)).size).toBe(1);
    expect(store.countSignals()).toBe(1);
  });

  it('treats requests without a key as legacy creates', () => {
    const first = store.addSignalIdempotent(PAYLOAD, {});
    const second = store.addSignalIdempotent(PAYLOAD, {});
    expect(first.outcome).toBe('created');
    expect(second.outcome).toBe('created');
    expect(second.record.id).toBe(first.record.id + 1);
  });

  it('expires bindings after the retention window and documents reclaim', () => {
    const t0 = 1_000_000;
    const ttlMs = 1000;
    const fingerprint = fingerprintPayload(PAYLOAD);

    const first = store.addSignalIdempotent(PAYLOAD, {
      key: 'k-expire',
      fingerprint,
      now: t0,
      ttlMs,
    });
    expect(first.outcome).toBe('created');

    // Just before expiry the original result still replays.
    const beforeExpiry = store.addSignalIdempotent(PAYLOAD, {
      key: 'k-expire',
      fingerprint,
      now: t0 + ttlMs - 1,
      ttlMs,
    });
    expect(beforeExpiry.outcome).toBe('replayed');

    // At/after expiry the binding is dropped and the key is reclaimable
    // as an explicitly new request (documented retention policy).
    const afterExpiry = store.addSignalIdempotent(PAYLOAD, {
      key: 'k-expire',
      fingerprint,
      now: t0 + ttlMs,
      ttlMs,
    });
    expect(afterExpiry.outcome).toBe('created');
    expect(afterExpiry.record.id).not.toBe(first.record.id);
    expect(store.countSignals()).toBe(2);

    // The reclaimed key now replays the NEW binding, not the stale one.
    const rebound = store.addSignalIdempotent(PAYLOAD, {
      key: 'k-expire',
      fingerprint,
      now: t0 + ttlMs + 1,
      ttlMs,
    });
    expect(rebound.outcome).toBe('replayed');
    expect(rebound.record).toEqual(afterExpiry.record);
  });

  it('clearSignals also drops idempotency bindings', () => {
    store.addSignalIdempotent(PAYLOAD, {
      key: 'k-clear',
      fingerprint: fingerprintPayload(PAYLOAD),
    });
    store.clearSignals();
    expect(store.countIdempotencyKeys()).toBe(0);
  });
});
