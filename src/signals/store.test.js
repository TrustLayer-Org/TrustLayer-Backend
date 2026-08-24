const store = require('./store');
const path = require('path');
const fs = require('fs');

const testDbPath = path.join(__dirname, 'test-data', 'store-test.db');

beforeEach(() => {
  // Clean up any existing test database
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
  // Ensure test data directory exists
  const testDir = path.dirname(testDbPath);
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir, { recursive: true });
  }
  // Initialize store with test database
  store.initialize(testDbPath);
  store.clearSignals();
});

afterEach(() => {
  store.close();
  // Clean up test database
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
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
    expect(store.removeSignal(created.id)).toBe(true);
    expect(store.removeSignal(created.id)).toBe(false);
    expect(store.countSignals()).toBe(0);
  });
});
