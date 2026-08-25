const express = require('express');
const request = require('supertest');
const { RateLimiter } = require('./rateLimiter');

// Helper: create a minimal Express app with the limiter wired to a route.
const makeApp = (limiter, failClosed = false) => {
  const app = express();
  app.use(express.json());
  app.get('/test', limiter.middleware(failClosed), (req, res) => {
    res.json({ ok: true });
  });
  return app;
};

// Fresh limiter before every test to avoid cross-test contamination.
let limiter;
beforeEach(() => {
  limiter = new RateLimiter({ windowMs: 60_000, max: 3 });
});

afterEach(() => {
  limiter.destroy();
});

describe('RateLimiter – basic allow / deny', () => {
  it('allows requests within the limit', async () => {
    const app = makeApp(limiter);
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('blocks the first request over the limit with 429', async () => {
    const app = makeApp(limiter);
    // Exhaust the limit (max = 3).
    await request(app).get('/test');
    await request(app).get('/test');
    await request(app).get('/test');

    const res = await request(app).get('/test');
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Too many requests');
    expect(typeof res.body.retryAfter).toBe('number');
    expect(res.body.retryAfter).toBeGreaterThan(0);
    expect(typeof res.body.resetTime).toBe('string');
  });
});

describe('RateLimiter – response headers', () => {
  it('sets X-RateLimit-Limit, Remaining, and Reset on allowed requests', async () => {
    const app = makeApp(limiter);
    const res = await request(app).get('/test');
    expect(res.headers['x-ratelimit-limit']).toBe('3');
    expect(res.headers['x-ratelimit-remaining']).toBe('2');
    expect(typeof res.headers['x-ratelimit-reset']).toBe('string');
  });

  it('sets Retry-After on 429 responses', async () => {
    const app = makeApp(limiter);
    await request(app).get('/test');
    await request(app).get('/test');
    await request(app).get('/test');

    const res = await request(app).get('/test');
    expect(res.status).toBe(429);
    expect(typeof res.headers['retry-after']).toBe('string');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('decrements Remaining as requests are consumed', async () => {
    const app = makeApp(limiter);
    const r1 = await request(app).get('/test');
    expect(r1.headers['x-ratelimit-remaining']).toBe('2');

    const r2 = await request(app).get('/test');
    expect(r2.headers['x-ratelimit-remaining']).toBe('1');

    const r3 = await request(app).get('/test');
    expect(r3.headers['x-ratelimit-remaining']).toBe('0');
  });
});

describe('RateLimiter – window reset', () => {
  it('resets the counter after the window elapses', async () => {
    // Use a very short window for this test.
    const shortLimiter = new RateLimiter({ windowMs: 200, max: 2 });
    const app = makeApp(shortLimiter);

    await request(app).get('/test');
    const second = await request(app).get('/test');
    expect(second.status).toBe(200);

    // Third should be blocked.
    const blocked = await request(app).get('/test');
    expect(blocked.status).toBe(429);

    // Wait for the window to expire.
    await new Promise((r) => setTimeout(r, 250));

    // Should be allowed again.
    const after = await request(app).get('/test');
    expect(after.status).toBe(200);

    shortLimiter.destroy();
  });
});

describe('RateLimiter – separate keys', () => {
  it('tracks different keys independently', async () => {
    const keyedLimiter = new RateLimiter({
      windowMs: 60_000,
      max: 2,
      keyGenerator: (req) => req.query.key || 'default',
    });

    const app = express();
    app.get('/test', keyedLimiter.middleware(false), (req, res) => {
      res.json({ ok: true });
    });

    // Exhaust key "a".
    await request(app).get('/test?key=a');
    await request(app).get('/test?key=a');
    const blocked = await request(app).get('/test?key=a');
    expect(blocked.status).toBe(429);

    // Key "b" should still have quota.
    const allowed = await request(app).get('/test?key=b');
    expect(allowed.status).toBe(200);

    keyedLimiter.destroy();
  });
});

describe('RateLimiter – failure semantics', () => {
  it('returns 503 when failClosed is true and the limiter throws', async () => {
    const brokenLimiter = new RateLimiter({ windowMs: 60_000, max: 3 });
    // Sabotage the increment method to throw.
    brokenLimiter.increment = () => {
      throw new Error('simulated failure');
    };

    const app = makeApp(brokenLimiter, true);
    const res = await request(app).get('/test');
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/unavailable/i);

    brokenLimiter.destroy();
  });

  it('passes through when failClosed is false and the limiter throws', async () => {
    const brokenLimiter = new RateLimiter({ windowMs: 60_000, max: 3 });
    brokenLimiter.increment = () => {
      throw new Error('simulated failure');
    };

    const app = makeApp(brokenLimiter, false);
    const res = await request(app).get('/test');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });

    brokenLimiter.destroy();
  });
});

describe('RateLimiter – concurrency', () => {
  it('handles concurrent requests without double-counting', async () => {
    const app = makeApp(limiter);
    const count = 10;
    const results = await Promise.all(
      Array.from({ length: count }, () => request(app).get('/test'))
    );

    const okCount = results.filter((r) => r.status === 200).length;
    const blockedCount = results.filter((r) => r.status === 429).length;

    expect(okCount).toBe(3); // max = 3
    expect(blockedCount).toBe(count - 3);
  });
});

describe('RateLimiter – cleanup and reset', () => {
  it('reset() clears all buckets', () => {
    limiter.increment('key-a');
    limiter.increment('key-b');
    limiter.reset();
    // After reset, first request should count as 1.
    expect(limiter.increment('key-a')).toBe(1);
  });

  it('cleanup removes entries from old windows', () => {
    limiter.increment('stale-key');
    // Manually age the entry.
    const bucket = limiter._buckets.get('stale-key');
    bucket.windowStart = Date.now() - limiter.windowMs * 3;
    limiter._cleanup();
    expect(limiter._buckets.has('stale-key')).toBe(false);
  });
});
