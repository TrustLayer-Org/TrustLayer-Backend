const store = require('./store');
const { countsByType, breakdownForBusiness, dominantType } = require('./breakdown');

beforeEach(() => store.clearSignals());

describe('countsByType', () => {
  it('tallies signals across multiple types', () => {
    const signals = [
      { signalType: 'payment' },
      { signalType: 'payment' },
      { signalType: 'review' },
    ];
    expect(countsByType(signals)).toEqual({
      payment: 2,
      review: 1,
      dispute: 0,
      kyc: 0,
    });
  });

  it('reports zero for a type with no signals', () => {
    const signals = [{ signalType: 'kyc' }];
    expect(countsByType(signals).dispute).toBe(0);
  });

  it('returns all-zero counts for empty input', () => {
    expect(countsByType([])).toEqual({
      payment: 0,
      review: 0,
      dispute: 0,
      kyc: 0,
    });
  });
});

describe('breakdownForBusiness', () => {
  it('combines the business id with its per-type counts', () => {
    store.addSignal({ businessId: 1, signalType: 'payment', value: 10 });
    store.addSignal({ businessId: 1, signalType: 'payment', value: 20 });
    store.addSignal({ businessId: 2, signalType: 'review', value: 5 });

    const breakdown = breakdownForBusiness(1);
    expect(breakdown.businessId).toBe(1);
    expect(breakdown.counts.payment).toBe(2);
    expect(breakdown.counts.review).toBe(0);
  });

  it('returns zero counts for a business with no signals', () => {
    const breakdown = breakdownForBusiness(9);
    expect(breakdown).toEqual({
      businessId: 9,
      counts: { payment: 0, review: 0, dispute: 0, kyc: 0 },
      dominantType: null,
    });
  });
});

describe('dominantType', () => {
  it('returns the type with the highest count', () => {
    expect(
      dominantType({ payment: 3, review: 5, dispute: 1, kyc: 0 })
    ).toBe('review');
  });

  it('returns null when every count is zero', () => {
    expect(
      dominantType({ payment: 0, review: 0, dispute: 0, kyc: 0 })
    ).toBeNull();
  });
});
