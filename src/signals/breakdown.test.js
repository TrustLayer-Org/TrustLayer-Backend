const { countsByType } = require('./breakdown');

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
