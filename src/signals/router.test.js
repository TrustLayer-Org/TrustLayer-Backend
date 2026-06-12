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
