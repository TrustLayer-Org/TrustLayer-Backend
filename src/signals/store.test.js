const store = require('./store');

beforeEach(() => store.clearSignals());

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
