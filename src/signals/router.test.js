const request = require('supertest');
const express = require('express');
const store = require('./store');
const router = require('./router');
const { writeLimiter } = require('./router');

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', router);
  return app;
};

// Body size limit app (uses the same default as production: 100kb).
const makeAppWithLimit = (limit = '100b') => {
  const app = express();
  app.use(express.json({ limit }));
  app.use('/api/v1', router);
  return app;
};

beforeEach(() => {
  store.clearSignals();
  writeLimiter.reset();
});

describe('POST /signals', () => {
  it('creates a signal and returns 201', async () => {
    const res = await request(makeApp())
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 100 });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
  });
});

describe('POST /signals validation', () => {
  it('rejects an invalid body with 400 and errors', async () => {
    const res = await request(makeApp())
      .post('/api/v1/signals')
      .send({ businessId: -1, signalType: 'bogus' });
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
  });
});

describe('POST /signals idempotency', () => {
  it('creates on first request and replays the original record on exact retry', async () => {
    const app = makeApp();
    const first = await postSignal(app, PAYLOAD, 'relay-key-1');
    expect(first.status).toBe(201);
    expect(first.headers['idempotency-replayed']).toBeUndefined();

    const retry = await postSignal(app, PAYLOAD, 'relay-key-1');
    expect(retry.status).toBe(200);
    expect(retry.headers['idempotency-replayed']).toBe('true');
    expect(retry.body).toEqual(first.body);
    expect(store.countSignals()).toBe(1);
  });

  it('keeps count and score unchanged across retries', async () => {
    const app = makeApp();
    await postSignal(app, PAYLOAD, 'relay-key-2');
    await postSignal(app, PAYLOAD, 'relay-key-2');
    await postSignal(app, PAYLOAD, 'relay-key-2');

    const score = await request(app).get('/api/v1/businesses/1/score');
    expect(score.body.signalCount).toBe(1);
    expect(score.body.score).toBe(100);

    const list = await request(app).get('/api/v1/signals');
    expect(list.body.total).toBe(1);
  });

  it('rejects the same key with a different payload (409) and mutates nothing', async () => {
    const app = makeApp();
    const first = await postSignal(app, PAYLOAD, 'relay-key-3');

    const conflict = await postSignal(
      app,
      { businessId: 1, signalType: 'payment', value: 999 },
      'relay-key-3'
    );
    expect(conflict.status).toBe(409);
    expect(conflict.body.error).toBe('idempotency key conflict');
    expect(store.countSignals()).toBe(1);

    // Conflict must not change owner/binding/original response.
    const replay = await postSignal(app, PAYLOAD, 'relay-key-3');
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(first.body);
  });

  it('rejects cross-business reuse of the same key', async () => {
    const app = makeApp();
    await postSignal(app, PAYLOAD, 'relay-key-4');

    const conflict = await postSignal(
      app,
      { ...PAYLOAD, businessId: 2 },
      'relay-key-4'
    );
    expect(conflict.status).toBe(409);
    expect(store.getSignalsByBusiness(2)).toHaveLength(0);
  });

  it('does not burn the key when the first attempt is invalid', async () => {
    const app = makeApp();
    const invalid = await postSignal(
      app,
      { businessId: -5, signalType: 'payment', value: 100 },
      'relay-key-5'
    );
    expect(invalid.status).toBe(400);

    const corrected = await postSignal(app, PAYLOAD, 'relay-key-5');
    expect(corrected.status).toBe(201);
    expect(store.countSignals()).toBe(1);
  });

  it('rejects malformed keys with 400 before touching storage', async () => {
    const app = makeApp();
    const emptyKey = await request(app)
      .post('/api/v1/signals')
      .set('Idempotency-Key', '')
      .send(PAYLOAD);
    expect(emptyKey.status).toBe(400);

    const longKey = await request(app)
      .post('/api/v1/signals')
      .set('Idempotency-Key', 'k'.repeat(256))
      .send(PAYLOAD);
    expect(longKey.status).toBe(400);
    expect(store.countSignals()).toBe(0);
  });

  it('lets concurrent identical requests produce one winner and replays for the rest', async () => {
    const app = makeApp();
    const results = await Promise.all(
      Array.from({ length: 8 }, () => postSignal(app, PAYLOAD, 'relay-race'))
    );

    const created = results.filter((res) => res.status === 201);
    const replayed = results.filter((res) => res.status === 200);
    expect(created).toHaveLength(1);
    expect(replayed).toHaveLength(7);
    expect(new Set(results.map((res) => res.body.id)).size).toBe(1);
    expect(store.countSignals()).toBe(1);
  });

  it('keeps legacy duplicate behavior for requests without a key', async () => {
    const app = makeApp();
    const first = await postSignal(app, PAYLOAD);
    const second = await postSignal(app, PAYLOAD);
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id + 1);
    expect(store.countSignals()).toBe(2);
  });

  it('replays a deterministic snapshot even after the original signal was deleted', async () => {
    const app = makeApp();
    const first = await postSignal(app, PAYLOAD, 'relay-key-6');
    await request(app).delete(`/api/v1/signals/${first.body.id}`);

    const retry = await postSignal(app, PAYLOAD, 'relay-key-6');
    expect(retry.status).toBe(200);
    expect(retry.body).toEqual(first.body);
  });

  it('treats an expired key as an explicitly new request per the retention policy', async () => {
    process.env.TRUSTLAYER_IDEMPOTENCY_TTL_MS = '50';
    jest.useFakeTimers({ now: 1_000_000 });
    try {
      const app = makeApp();
      const first = await postSignal(app, PAYLOAD, 'relay-expired');
      expect(first.status).toBe(201);

      jest.setSystemTime(1_000_000 + 51);
      const lateRetry = await postSignal(app, PAYLOAD, 'relay-expired');
      // Documented policy: past TTL the binding is dropped and the key is
      // reclaimable; the late retry becomes a NEW signal instead of an
      // ambiguous stale replay.
      expect(lateRetry.status).toBe(201);
      expect(lateRetry.body.id).not.toBe(first.body.id);
      expect(store.countSignals()).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('GET /signals', () => {
  it('lists and paginates signals', async () => {
    const app = makeApp();
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await request(app)
        .post('/api/v1/signals')
        .send({ businessId: 1, signalType: 'payment', value: i });
    }
    const res = await request(app).get('/api/v1/signals?limit=2&offset=1');
    expect(res.body.total).toBe(3);
    expect(res.body.count).toBe(2);
  });
});

describe('GET and DELETE /signals/:id', () => {
  it('handles missing records with 404', async () => {
    const app = makeApp();
    const created = await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 100 });
    const { id } = created.body;
    expect((await request(app).get(`/api/v1/signals/${id}`)).status).toBe(200);
    expect((await request(app).get('/api/v1/signals/999')).status).toBe(404);
    expect((await request(app).delete(`/api/v1/signals/${id}`)).status).toBe(204);
    expect((await request(app).delete(`/api/v1/signals/${id}`)).status).toBe(404);
  });
});

describe('GET /businesses', () => {
  it('returns a summary for every business with stored signals', async () => {
    const app = makeApp();
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 30 });
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 2, signalType: 'payment', value: 50 });
    const res = await request(app).get('/api/v1/businesses');
    expect(res.body.businesses).toEqual([
      { businessId: 2, signalCount: 1, score: 50 },
      { businessId: 1, signalCount: 1, score: 30 },
    ]);
  });

  it('sorts businesses by score descending regardless of insertion order', async () => {
    const app = makeApp();
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 20 });
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 2, signalType: 'payment', value: 90 });
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 3, signalType: 'payment', value: 50 });
    const res = await request(app).get('/api/v1/businesses');
    expect(res.body.businesses.map((b) => b.businessId)).toEqual([2, 3, 1]);
  });

  it('limits the number of businesses returned', async () => {
    const app = makeApp();
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 20 });
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 2, signalType: 'payment', value: 90 });
    const res = await request(app).get('/api/v1/businesses?limit=1');
    expect(res.body.businesses).toHaveLength(1);
    expect(res.body.businesses[0].businessId).toBe(2);
  });

  it('returns an empty array when no signals are stored', async () => {
    const res = await request(makeApp()).get('/api/v1/businesses');
    expect(res.status).toBe(200);
    expect(res.body.businesses).toEqual([]);
  });
});

describe('GET /businesses/:id/score', () => {
  it('returns a computed trust score for a business (v1)', async () => {
    const app = makeApp();
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 7, signalType: 'payment', value: 90 });
    const res = await request(app).get('/api/v1/businesses/7/score');
    expect(res.body.businessId).toBe(7);
    expect(res.body.score).toBe(90);
    expect(res.body.signalCount).toBe(1);
    expect(res.body.provenance).toBeUndefined();
  });

  it('returns a computed trust score with provenance for a business (v2)', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/v2', router);

    await request(app)
      .post('/api/v2/signals')
      .send({ businessId: 7, signalType: 'payment', value: 90 });
    const res = await request(app).get('/api/v2/businesses/7/score');
    expect(res.body.businessId).toBe(7);
    expect(res.body.score).toBe(90);
    expect(res.body.signalCount).toBe(1);
    expect(res.body.provenance).toBe('backend-computed');
    expect(res.body.calculationVersion).toBe('v2.0');
    expect(typeof res.body.freshness).toBe('string');
    expect(res.body.verificationStatus).toBe('computed');
  });
});

describe('GET /businesses/:id/breakdown', () => {
  it('returns per-type counts and the dominant type for a business', async () => {
    const app = makeApp();
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 3, signalType: 'payment', value: 10 });
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 3, signalType: 'payment', value: 20 });
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 3, signalType: 'review', value: 5 });
    const res = await request(app).get('/api/v1/businesses/3/breakdown');
    expect(res.body.businessId).toBe(3);
    expect(res.body.counts.payment).toBe(2);
    expect(res.body.counts.review).toBe(1);
    expect(res.body.dominantType).toBe('payment');
  });

  it('returns zero counts for a business with no signals', async () => {
    const res = await request(makeApp()).get('/api/v1/businesses/999/breakdown');
    expect(res.status).toBe(200);
    expect(res.body.counts).toEqual({
      payment: 0,
      review: 0,
      dispute: 0,
      kyc: 0,
    });
    expect(res.body.dominantType).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Body size limit integration tests
// ---------------------------------------------------------------------------

describe('Body size limit', () => {
  it('rejects an oversized JSON body before business logic', async () => {
    // Set a tiny limit: 100 bytes.
    const app = makeAppWithLimit('100b');
    // 200 bytes of JSON payload.
    const bigPayload = { businessId: 1, signalType: 'payment', value: 42, padding: 'x'.repeat(200) };
    const res = await request(app)
      .post('/api/v1/signals')
      .send(bigPayload);
    expect(res.status).toBe(413);
  });

  it('accepts a body within the size limit', async () => {
    const app = makeAppWithLimit('1kb');
    const res = await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 100 });
    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Rate limiter integration tests
// ---------------------------------------------------------------------------

describe('Write rate limiting', () => {
  it('allows normal verified traffic through', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 100 });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(1);
  });

  it('sets rate limit headers on successful POST', async () => {
    const app = makeApp();
    const res = await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 100 });
    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('returns 429 with retry metadata after exceeding the limit', async () => {
    const app = makeApp();
    // Exhaust the limit (default max = 30; send 31 requests).
    for (let i = 0; i < 30; i++) {
      // eslint-disable-next-line no-await-in-loop
      await request(app)
        .post('/api/v1/signals')
        .send({ businessId: 1, signalType: 'payment', value: i });
    }

    const res = await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 999 });
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Too many requests');
    expect(typeof res.body.retryAfter).toBe('number');
    expect(res.body.retryAfter).toBeGreaterThan(0);
    expect(typeof res.body.resetTime).toBe('string');
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('DELETE is also rate limited', async () => {
    const app = makeApp();
    // Create a signal first.
    const created = await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 100 });
    const id = created.body.id;

    // Exhaust the DELETE limiter.
    for (let i = 0; i < 30; i++) {
      // eslint-disable-next-line no-await-in-loop
      await request(app).delete(`/api/v1/signals/${id}`);
    }

    const res = await request(app).delete(`/api/v1/signals/${id}`);
    expect(res.status).toBe(429);
  });

  it('GET routes are not affected by the write rate limiter', async () => {
    const app = makeApp();
    // Exhaust the write limiter.
    for (let i = 0; i < 31; i++) {
      // eslint-disable-next-line no-await-in-loop
      await request(app)
        .post('/api/v1/signals')
        .send({ businessId: 1, signalType: 'payment', value: i });
    }

    // GET should still work.
    const res = await request(app).get('/api/v1/signals');
    expect(res.status).toBe(200);
    expect(res.body.signals).toBeDefined();
  });

  it('handles concurrent POST requests correctly', async () => {
    const app = makeApp();
    const count = 10;
    const results = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        request(app)
          .post('/api/v1/signals')
          .send({ businessId: 1, signalType: 'payment', value: i })
      )
    );

    // All 10 should succeed since max is 30.
    const okCount = results.filter((r) => r.status === 201).length;
    expect(okCount).toBe(count);

    // Rate limit headers should be present on each response.
    for (const res of results) {
      expect(res.headers['x-ratelimit-limit']).toBeDefined();
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    }
  });

  it('blocks concurrent burst that exceeds the limit', async () => {
    const app = makeApp();
    const count = 35; // max is 30, so 5 should be blocked.
    const results = await Promise.all(
      Array.from({ length: count }, (_, i) =>
        request(app)
          .post('/api/v1/signals')
          .send({ businessId: 1, signalType: 'payment', value: i })
      )
    );

    const okCount = results.filter((r) => r.status === 201).length;
    const blockedCount = results.filter((r) => r.status === 429).length;

    expect(okCount).toBe(30);
    expect(blockedCount).toBe(5);
  });

  it('keys rate limits by X-Forwarded-For when trust proxy is set', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use(express.json());
    app.use('/api/v1', router);

    writeLimiter.reset();

    // Exhaust limit for forwarded IP "10.0.0.1".
    for (let i = 0; i < 30; i++) {
      // eslint-disable-next-line no-await-in-loop
      await request(app)
        .post('/api/v1/signals')
        .set('X-Forwarded-For', '10.0.0.1')
        .send({ businessId: 1, signalType: 'payment', value: i });
    }

    // IP "10.0.0.1" should now be blocked.
    const blocked = await request(app)
      .post('/api/v1/signals')
      .set('X-Forwarded-For', '10.0.0.1')
      .send({ businessId: 1, signalType: 'payment', value: 999 });
    expect(blocked.status).toBe(429);

    // IP "10.0.0.2" should still have quota.
    const allowed = await request(app)
      .post('/api/v1/signals')
      .set('X-Forwarded-For', '10.0.0.2')
      .send({ businessId: 2, signalType: 'payment', value: 100 });
    expect(allowed.status).toBe(201);
  });
});
