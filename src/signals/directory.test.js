const store = require('./store');
const {
  listBusinessIds,
  summarizeBusiness,
  listBusinessSummaries,
  sortBySummaryScoreDesc,
} = require('./directory');
const path = require('path');
const fs = require('fs');

const testDbPath = path.join(__dirname, 'test-data', 'directory-test.db');

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

describe('listBusinessIds', () => {
  it('returns an empty array for no signals', () => {
    expect(listBusinessIds([])).toEqual([]);
  });

  it('dedupes repeated business ids', () => {
    const signals = [
      { businessId: 1, signalType: 'payment', value: 10 },
      { businessId: 2, signalType: 'payment', value: 20 },
      { businessId: 1, signalType: 'review', value: 5 },
    ];
    expect(listBusinessIds(signals)).toEqual([1, 2]);
  });
});

describe('summarizeBusiness', () => {
  it('reports the signal count and score for a business', () => {
    const signals = [
      { businessId: 1, signalType: 'payment', value: 30 },
      { businessId: 1, signalType: 'payment', value: 40 },
      { businessId: 2, signalType: 'payment', value: 50 },
    ];
    expect(summarizeBusiness(1, signals)).toEqual({
      businessId: 1,
      signalCount: 2,
      score: 35,
    });
  });

  it('defaults to zero count and score when a business has no signals', () => {
    expect(summarizeBusiness(9, [])).toEqual({
      businessId: 9,
      signalCount: 0,
      score: 0,
    });
  });
});

describe('listBusinessSummaries', () => {
  it('aggregates a summary for every business with stored signals', () => {
    store.addSignal({ businessId: 1, signalType: 'payment', value: 30 });
    store.addSignal({ businessId: 1, signalType: 'payment', value: 40 });
    store.addSignal({ businessId: 2, signalType: 'payment', value: 50 });

    expect(listBusinessSummaries()).toEqual([
      { businessId: 1, signalCount: 2, score: 35 },
      { businessId: 2, signalCount: 1, score: 50 },
    ]);
  });
});

describe('sortBySummaryScoreDesc', () => {
  it('orders summaries by score, highest first', () => {
    const summaries = [
      { businessId: 1, signalCount: 1, score: 20 },
      { businessId: 2, signalCount: 1, score: 90 },
      { businessId: 3, signalCount: 1, score: 50 },
    ];
    expect(sortBySummaryScoreDesc(summaries).map((s) => s.businessId)).toEqual(
      [2, 3, 1]
    );
  });
});
