const { scoreSignals, rawAverage } = require('./score');

describe('rawAverage', () => {
  it('returns the unweighted mean of signal values', () => {
    expect(rawAverage([{ value: 100 }, { value: 200 }])).toBe(150);
    expect(rawAverage([])).toBe(0);
  });
});
