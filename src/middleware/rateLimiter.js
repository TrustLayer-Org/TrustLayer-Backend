// In-memory fixed-window rate limiter with failure-safe semantics.

class RateLimiter {
  /**
   * @param {Object} opts
   * @param {number} opts.windowMs  – Window duration in milliseconds (default 60 000).
   * @param {number} opts.max       – Max requests per window per key (default 30).
   * @param {function} [opts.keyGenerator] – (req) => string; defaults to req.ip.
   */
  constructor({ windowMs = 60_000, max = 30, keyGenerator } = {}) {
    this.windowMs = windowMs;
    this.max = max;
    this.keyGenerator = keyGenerator || ((req) => req.ip);

    // key → { count, windowStart }
    this._buckets = new Map();

    // Periodic cleanup prevents unbounded memory growth from stale keys.
    this._cleanupTimer = setInterval(() => this._cleanup(), windowMs);

    // Allow the process to exit even if the timer is still running.
    if (this._cleanupTimer.unref) {
      this._cleanupTimer.unref();
    }
  }

  // Return the start timestamp of the current window for a given moment.
  _windowStart(now) {
    return Math.floor(now / this.windowMs) * this.windowMs;
  }

  // Increment the hit counter for a key and return the current count.
  increment(key) {
    const now = Date.now();
    const ws = this._windowStart(now);
    const bucket = this._buckets.get(key);

    if (bucket && bucket.windowStart === ws) {
      bucket.count += 1;
    } else {
      this._buckets.set(key, { count: 1, windowStart: ws });
    }

    return this._buckets.get(key).count;
  }

  // Remove entries from previous windows to bound memory usage.
  _cleanup() {
    const cutoff = Date.now() - this.windowMs * 2;
    for (const [key, bucket] of this._buckets) {
      if (bucket.windowStart < cutoff) {
        this._buckets.delete(key);
      }
    }
  }

  // Reset all buckets – useful in tests.
  reset() {
    this._buckets.clear();
  }

  // Stop the cleanup timer – useful in tests and graceful shutdown.
  destroy() {
    if (this._cleanupTimer) {
      clearInterval(this._cleanupTimer);
      this._cleanupTimer = null;
    }
  }

  /**
   * Express middleware factory.
   *
   * @param {boolean} failClosed – When true, limiter errors cause a 503
   *   (protects mutation routes). When false, errors are ignored and the
   *   request proceeds (safe for read routes).
   */
  middleware(failClosed = false) {
    return (req, res, next) => {
      try {
        const key = this.keyGenerator(req);
        const count = this.increment(key);

        const ws = this._windowStart(Date.now());
        const resetTime = ws + this.windowMs;

        // Always surface current-limit metadata so callers can self-throttle.
        res.setHeader('X-RateLimit-Limit', this.max);
        res.setHeader(
          'X-RateLimit-Remaining',
          String(Math.max(0, this.max - count))
        );
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(resetTime / 1000)));

        if (count > this.max) {
          const retryAfter = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000));
          res.setHeader('Retry-After', String(retryAfter));
          return res.status(429).json({
            error: 'Too many requests',
            retryAfter,
            resetTime: new Date(resetTime).toISOString(),
          });
        }

        next();
      } catch (err) {
        if (failClosed) {
          return res.status(503).json({
            error: 'Rate limiter temporarily unavailable',
          });
        }
        // Fail open – let read traffic through when the limiter is broken.
        next();
      }
    };
  }
}

module.exports = RateLimiter;
module.exports.RateLimiter = RateLimiter;
