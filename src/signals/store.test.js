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
