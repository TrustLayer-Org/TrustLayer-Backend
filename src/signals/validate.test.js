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
