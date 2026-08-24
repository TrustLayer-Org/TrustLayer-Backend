// End-to-end consistency tests: after every mutation, all derived endpoints
// (signals list, score, breakdown, directory) must agree.

const request = require('supertest');
const express = require('express');
const store = require('./store');
const router = require('./router');
const { fullReconciliation } = require('./reconcile');

const makeApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/v1', router);
  return app;
};

beforeEach(() => store.clearSignals());

// Helper: assert cross-endpoint agreement for a business.
const assertConsistency = async (app, businessId, expectedCount) => {
  const score = await request(app).get(`/api/v1/businesses/${businessId}/score`);
  const bd = await request(app).get(`/api/v1/businesses/${businessId}/breakdown`);
  const signals = await request(app).get(
    `/api/v1/signals?businessId=${businessId}`
  );

  expect(score.body.signalCount).toBe(expectedCount);
  expect(signals.body.total).toBe(expectedCount);

  const breakdownTotal = Object.values(bd.body.counts).reduce(
    (sum, c) => sum + c,
    0
  );
  expect(breakdownTotal).toBe(expectedCount);

  if (expectedCount > 0) {
    const dir = await request(app).get('/api/v1/businesses');
    const entry = dir.body.businesses.find(
      (b) => b.businessId === businessId
    );
    expect(entry).toBeDefined();
    expect(entry.signalCount).toBe(expectedCount);
    expect(entry.score).toBe(score.body.score);
  }
};

describe('cross-endpoint consistency after deletions', () => {
  it('maintains consistency through a sequence of deletions', async () => {
    const app = makeApp();
    const ids = [];

    // Create 4 signals for business 1 with mixed types.
    for (const [type, value] of [
      ['payment', 50],
      ['review', 30],
      ['kyc', 70],
      ['dispute', 10],
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post('/api/v1/signals')
        .send({ businessId: 1, signalType: type, value });
      ids.push(res.body.id);
    }

    await assertConsistency(app, 1, 4);

    // Delete signals one by one and check consistency each time.
    for (let i = 0; i < ids.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await request(app).delete(`/api/v1/signals/${ids[i]}`);
      // eslint-disable-next-line no-await-in-loop
      await assertConsistency(app, 1, ids.length - i - 1);
    }
  });

  it('consistency holds across multiple businesses', async () => {
    const app = makeApp();
    const business1Ids = [];
    const business2Ids = [];

    // Business 1: 3 signals.
    for (let i = 0; i < 3; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post('/api/v1/signals')
        .send({ businessId: 1, signalType: 'payment', value: 20 + i * 10 });
      business1Ids.push(res.body.id);
    }

    // Business 2: 2 signals.
    for (let i = 0; i < 2; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post('/api/v1/signals')
        .send({ businessId: 2, signalType: 'review', value: 60 + i * 10 });
      business2Ids.push(res.body.id);
    }

    await assertConsistency(app, 1, 3);
    await assertConsistency(app, 2, 2);

    // Delete one from each business.
    await request(app).delete(`/api/v1/signals/${business1Ids[0]}`);
    await request(app).delete(`/api/v1/signals/${business2Ids[0]}`);

    await assertConsistency(app, 1, 2);
    await assertConsistency(app, 2, 1);

    // Directory should still contain both businesses.
    const dir = await request(app).get('/api/v1/businesses');
    expect(dir.body.businesses).toHaveLength(2);
  });

  it('concurrent-style rapid sequential deletes maintain consistency', async () => {
    const app = makeApp();
    const ids = [];

    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post('/api/v1/signals')
        .send({ businessId: 1, signalType: 'payment', value: 10 * (i + 1) });
      ids.push(res.body.id);
    }

    // Fire all deletes as fast as possible (sequential but rapid).
    await Promise.all(
      ids.map((id) => request(app).delete(`/api/v1/signals/${id}`))
    );

    await assertConsistency(app, 1, 0);

    const dir = await request(app).get('/api/v1/businesses');
    expect(dir.body.businesses).toEqual([]);
  });

  it('restart recovery: clear and rebuild yields consistent state', async () => {
    const app = makeApp();

    // Create initial state.
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 50 });
    const r2 = await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'review', value: 30 });

    // Delete one signal.
    await request(app).delete(`/api/v1/signals/${r2.body.id}`);

    // Simulate restart: clear everything and rebuild.
    store.clearSignals();

    // After clear, everything should be empty and consistent.
    await assertConsistency(app, 1, 0);

    const dir = await request(app).get('/api/v1/businesses');
    expect(dir.body.businesses).toEqual([]);

    // Rebuild: add signals fresh.
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'kyc', value: 80 });

    await assertConsistency(app, 1, 1);
  });
});

describe('reconciliation utility integration', () => {
  it('fullReconciliation passes after mixed create/delete operations', async () => {
    const app = makeApp();

    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 50 });
    await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 2, signalType: 'review', value: 80 });
    const r3 = await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'kyc', value: 60 });

    await request(app).delete(`/api/v1/signals/${r3.body.id}`);

    const result = fullReconciliation();
    expect(result.consistent).toBe(true);
    expect(result.businessCount).toBe(2);
    expect(result.deletionCount).toBe(1);
  });

  it('fullReconciliation passes after all signals deleted', async () => {
    const app = makeApp();

    const r1 = await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 1, signalType: 'payment', value: 50 });
    const r2 = await request(app)
      .post('/api/v1/signals')
      .send({ businessId: 2, signalType: 'review', value: 30 });

    await request(app).delete(`/api/v1/signals/${r1.body.id}`);
    await request(app).delete(`/api/v1/signals/${r2.body.id}`);

    const result = fullReconciliation();
    expect(result.consistent).toBe(true);
    expect(result.deletionCount).toBe(2);
  });
});
