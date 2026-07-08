const { listBusinessIds } = require('./directory');

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
