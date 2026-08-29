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
    expect(store.removeSignal(created.id)).toBeTruthy();
    expect(store.removeSignal(created.id)).toBeNull();
    expect(store.countSignals()).toBe(0);
  });

  it('returns the deleted record with all fields', () => {
    const created = store.addSignal({
      businessId: 5,
      signalType: 'review',
      value: 42,
    });
    const removed = store.removeSignal(created.id);
    expect(removed).toMatchObject({
      id: created.id,
      businessId: 5,
      signalType: 'review',
      value: 42,
    });
  });

  it('returns null for a non-existent id', () => {
    expect(store.removeSignal(999)).toBeNull();
  });
});

describe('deletion audit log', () => {
  it('appends a tombstone on successful delete', () => {
    const created = store.addSignal({
      businessId: 1,
      signalType: 'payment',
      value: 100,
    });
    store.removeSignal(created.id);
    const log = store.getDeletionLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({
      deletionId: 1,
      signalId: created.id,
      businessId: 1,
      signalType: 'payment',
    });
    expect(typeof log[0].deletedAt).toBe('string');
  });

  it('does not append a tombstone on failed delete', () => {
    store.removeSignal(999);
    expect(store.getDeletionLog()).toHaveLength(0);
  });

  it('omits the signal value from tombstones', () => {
    const created = store.addSignal({
      businessId: 1,
      signalType: 'payment',
      value: 100,
    });
    store.removeSignal(created.id);
    const tombstone = store.getDeletionLog()[0];
    expect(tombstone).not.toHaveProperty('value');
  });

  it('assigns incrementing deletion ids', () => {
    const s1 = store.addSignal({ businessId: 1, signalType: 'payment', value: 10 });
    const s2 = store.addSignal({ businessId: 2, signalType: 'review', value: 20 });
    store.removeSignal(s1.id);
    store.removeSignal(s2.id);
    const log = store.getDeletionLog();
    expect(log[0].deletionId).toBe(1);
    expect(log[1].deletionId).toBe(2);
  });

  it('is cleared by clearSignals', () => {
    const created = store.addSignal({ businessId: 1, signalType: 'payment', value: 10 });
    store.removeSignal(created.id);
    expect(store.getDeletionLog()).toHaveLength(1);
    store.clearSignals();
    expect(store.getDeletionLog()).toHaveLength(0);
  });

  it('clearDeletionLog clears only the deletion log', () => {
    const created = store.addSignal({ businessId: 1, signalType: 'payment', value: 10 });
    store.removeSignal(created.id);
    store.addSignal({ businessId: 2, signalType: 'review', value: 20 });
    expect(store.getDeletionLog()).toHaveLength(1);
    expect(store.countSignals()).toBe(1);
    store.clearDeletionLog();
    expect(store.getDeletionLog()).toHaveLength(0);
    expect(store.countSignals()).toBe(1);
  });
});

