const { validateSignal } = require('./validate');

describe('validateSignal', () => {
  it('accepts a well-formed signal', () => {
    const result = validateSignal({
      businessId: 1,
      signalType: 'payment',
      value: 100,
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });
});

describe('validateSignal businessId', () => {
  it('rejects a non-positive businessId', () => {
    const result = validateSignal({
      businessId: 0,
      signalType: 'payment',
      value: 1,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/businessId/);
  });
});

describe('validateSignal signalType', () => {
  it('rejects an unknown signalType', () => {
    const result = validateSignal({
      businessId: 1,
      signalType: 'bogus',
      value: 1,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/signalType/);
  });
});

describe('validateSignal value', () => {
  it('rejects a non-numeric value', () => {
    const result = validateSignal({
      businessId: 1,
      signalType: 'payment',
      value: 'NaN',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toMatch(/value/);
  });
});
