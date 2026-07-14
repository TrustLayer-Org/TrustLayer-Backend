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
});
