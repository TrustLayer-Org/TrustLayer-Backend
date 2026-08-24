const request = require('supertest');
const express = require('express');
const store = require('./store');
const router = require('./router');

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', router);
  return app;
};

beforeEach(() => store.clearSignals());

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
  it('returns a computed trust score for a business', async () => {
    const app = makeApp();
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 7, signalType: 'payment', value: 90 });
    const res = await request(app).get('/api/v1/businesses/7/score');
    expect(res.body.businessId).toBe(7);
    expect(res.body.score).toBe(90);
    expect(res.body.signalCount).toBe(1);
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

describe('deletion derived-state consistency', () => {
  it('score reflects deletion of one signal', async () => {
    const app = makeApp();
    const r1 = await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 80 });
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 40 });

    // Before delete: score = (80 + 40) / 2 = 60
    let score = await request(app).get('/api/v1/businesses/1/score');
    expect(score.body.score).toBe(60);
    expect(score.body.signalCount).toBe(2);

    await request(app).delete(`/api/v1/signals/${r1.body.id}`);

    // After delete: score = 40 / 1 = 40
    score = await request(app).get('/api/v1/businesses/1/score');
    expect(score.body.score).toBe(40);
    expect(score.body.signalCount).toBe(1);
  });

  it('directory removes business when all its signals are deleted', async () => {
    const app = makeApp();
    const r1 = await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 50 });
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 2, signalType: 'payment', value: 80 });

    let dir = await request(app).get('/api/v1/businesses');
    expect(dir.body.businesses).toHaveLength(2);

    await request(app).delete(`/api/v1/signals/${r1.body.id}`);

    dir = await request(app).get('/api/v1/businesses');
    expect(dir.body.businesses).toHaveLength(1);
    expect(dir.body.businesses[0].businessId).toBe(2);
  });

  it('breakdown reflects deletion of a typed signal', async () => {
    const app = makeApp();
    const r1 = await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 3, signalType: 'payment', value: 10 });
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 3, signalType: 'review', value: 5 });

    let bd = await request(app).get('/api/v1/businesses/3/breakdown');
    expect(bd.body.counts.payment).toBe(1);
    expect(bd.body.counts.review).toBe(1);

    await request(app).delete(`/api/v1/signals/${r1.body.id}`);

    bd = await request(app).get('/api/v1/businesses/3/breakdown');
    expect(bd.body.counts.payment).toBe(0);
    expect(bd.body.counts.review).toBe(1);
    expect(bd.body.dominantType).toBe('review');
  });

  it('all endpoints agree on signal count after delete', async () => {
    const app = makeApp();
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 30 });
    const r2 = await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'review', value: 50 });
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'kyc', value: 70 });

    await request(app).delete(`/api/v1/signals/${r2.body.id}`);

    const score = await request(app).get('/api/v1/businesses/1/score');
    const dir = await request(app).get('/api/v1/businesses');
    const bd = await request(app).get('/api/v1/businesses/1/breakdown');
    const signals = await request(app).get('/api/v1/signals?businessId=1');

    // All four views must agree on the count: 2 remaining signals.
    expect(score.body.signalCount).toBe(2);
    expect(dir.body.businesses[0].signalCount).toBe(2);
    const breakdownTotal = Object.values(bd.body.counts).reduce(
      (sum, c) => sum + c,
      0
    );
    expect(breakdownTotal).toBe(2);
    expect(signals.body.total).toBe(2);
  });

  it('failed delete (404) leaves all derived views unchanged', async () => {
    const app = makeApp();
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 50 });

    // Snapshot before.
    const scoreBefore = await request(app).get('/api/v1/businesses/1/score');
    const dirBefore = await request(app).get('/api/v1/businesses');
    const bdBefore = await request(app).get('/api/v1/businesses/1/breakdown');

    // Delete a non-existent signal.
    const del = await request(app).delete('/api/v1/signals/999');
    expect(del.status).toBe(404);

    // Snapshot after: must be identical.
    const scoreAfter = await request(app).get('/api/v1/businesses/1/score');
    const dirAfter = await request(app).get('/api/v1/businesses');
    const bdAfter = await request(app).get('/api/v1/businesses/1/breakdown');

    expect(scoreAfter.body).toEqual(scoreBefore.body);
    expect(dirAfter.body).toEqual(dirBefore.body);
    expect(bdAfter.body).toEqual(bdBefore.body);
  });

  it('repeated delete returns 404 on second attempt with no state change', async () => {
    const app = makeApp();
    const r1 = await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 50 });
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'review', value: 30 });

    const del1 = await request(app).delete(`/api/v1/signals/${r1.body.id}`);
    expect(del1.status).toBe(204);

    // Snapshot after first delete.
    const scoreAfterFirst = await request(app).get('/api/v1/businesses/1/score');

    const del2 = await request(app).delete(`/api/v1/signals/${r1.body.id}`);
    expect(del2.status).toBe(404);

    // Snapshot after second (failed) delete: unchanged.
    const scoreAfterSecond = await request(app).get('/api/v1/businesses/1/score');
    expect(scoreAfterSecond.body).toEqual(scoreAfterFirst.body);
  });

  it('last signal delete: score 0, breakdown all zeros, absent from directory', async () => {
    const app = makeApp();
    const r1 = await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 50 });

    await request(app).delete(`/api/v1/signals/${r1.body.id}`);

    const score = await request(app).get('/api/v1/businesses/1/score');
    expect(score.body.score).toBe(0);
    expect(score.body.signalCount).toBe(0);

    const bd = await request(app).get('/api/v1/businesses/1/breakdown');
    expect(bd.body.counts).toEqual({ payment: 0, review: 0, dispute: 0, kyc: 0 });
    expect(bd.body.dominantType).toBeNull();

    const dir = await request(app).get('/api/v1/businesses');
    expect(dir.body.businesses).toEqual([]);
  });
});

describe('DELETE audit headers', () => {
  it('sets audit headers on successful delete', async () => {
    const app = makeApp();
    const r1 = await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 7, signalType: 'kyc', value: 90 });

    const del = await request(app).delete(`/api/v1/signals/${r1.body.id}`);
    expect(del.status).toBe(204);
    expect(del.headers['x-deleted-signal-id']).toBe(String(r1.body.id));
    expect(del.headers['x-affected-business-id']).toBe('7');
    expect(del.headers['x-deletion-timestamp']).toBeDefined();
  });

  it('does not set audit headers on failed delete', async () => {
    const del = await request(makeApp()).delete('/api/v1/signals/999');
    expect(del.status).toBe(404);
    expect(del.headers['x-deleted-signal-id']).toBeUndefined();
    expect(del.headers['x-affected-business-id']).toBeUndefined();
    expect(del.headers['x-deletion-timestamp']).toBeUndefined();
  });
});
