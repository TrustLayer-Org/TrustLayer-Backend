const { listBusinessIds, summarizeBusiness } = require('./directory');

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
