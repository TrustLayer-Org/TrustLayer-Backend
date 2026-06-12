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
