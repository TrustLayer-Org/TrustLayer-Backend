const { scoreSignals, rawAverage } = require('./score');

describe('rawAverage', () => {
  it('returns the unweighted mean of signal values', () => {
    expect(rawAverage([{ value: 100 }, { value: 200 }])).toBe(150);
    expect(rawAverage([])).toBe(0);
  });
});

describe('scoreSignals weighting', () => {
  it('applies per-type weights and rounds the result', () => {
    const signals = [
      { signalType: 'payment', value: 80 },
      { signalType: 'kyc', value: 80 },
    ];
    // (80 * 1 + 80 * 1.2) / 2 = 88
    expect(scoreSignals(signals)).toBe(88);
  });
});

describe('scoreSignals bounds', () => {
  it('clamps to the score bounds and handles empty input', () => {
    expect(scoreSignals([])).toBe(0);
    expect(scoreSignals([{ signalType: 'payment', value: 1000 }])).toBe(100);
    expect(scoreSignals([{ signalType: 'dispute', value: 1000 }])).toBe(0);
  });
});
