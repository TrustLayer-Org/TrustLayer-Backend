const store = require('./store');
const { checkConsistency, fullReconciliation } = require('./reconcile');

beforeEach(() => store.clearSignals());

describe('checkConsistency', () => {
  it('reports consistent state for a business with signals', () => {
    store.addSignal({ businessId: 1, signalType: 'payment', value: 50 });
    store.addSignal({ businessId: 1, signalType: 'review', value: 30 });

    const report = checkConsistency(1);
    expect(report.consistent).toBe(true);
    expect(report.mismatches).toEqual([]);
    expect(report.signalCount).toBe(2);
    expect(typeof report.score).toBe('number');
  });

  it('reports consistent state for a business with no signals', () => {
    const report = checkConsistency(999);
    expect(report.consistent).toBe(true);
    expect(report.signalCount).toBe(0);
    expect(report.directoryEntry).toBeNull();
  });

  it('reports consistent state after a signal is deleted', () => {
    const s1 = store.addSignal({ businessId: 1, signalType: 'payment', value: 50 });
    store.addSignal({ businessId: 1, signalType: 'review', value: 30 });

    store.removeSignal(s1.id);

    const report = checkConsistency(1);
    expect(report.consistent).toBe(true);
    expect(report.signalCount).toBe(1);
  });

  it('reports consistent state after all signals for a business are deleted', () => {
    const s1 = store.addSignal({ businessId: 1, signalType: 'payment', value: 50 });

    store.removeSignal(s1.id);

    const report = checkConsistency(1);
    expect(report.consistent).toBe(true);
    expect(report.signalCount).toBe(0);
    expect(report.directoryEntry).toBeNull();
  });
});

describe('fullReconciliation', () => {
  it('reports all-consistent for multiple businesses', () => {
    store.addSignal({ businessId: 1, signalType: 'payment', value: 50 });
    store.addSignal({ businessId: 2, signalType: 'review', value: 80 });
    store.addSignal({ businessId: 3, signalType: 'kyc', value: 60 });

    const result = fullReconciliation();
    expect(result.consistent).toBe(true);
    expect(result.businessCount).toBe(3);
    expect(result.reports).toHaveLength(3);
    result.reports.forEach((report) => {
      expect(report.consistent).toBe(true);
    });
  });

  it('includes deleted businesses in reconciliation sweep', () => {
    const s1 = store.addSignal({ businessId: 1, signalType: 'payment', value: 50 });
    store.addSignal({ businessId: 2, signalType: 'review', value: 80 });

    store.removeSignal(s1.id);

    const result = fullReconciliation();
    expect(result.consistent).toBe(true);
    expect(result.deletionCount).toBe(1);
    // Business 1 still checked even though it has no signals.
    expect(result.businessCount).toBe(2);
  });

  it('reports consistent state after sequential deletions', () => {
    const s1 = store.addSignal({ businessId: 1, signalType: 'payment', value: 50 });
    const s2 = store.addSignal({ businessId: 1, signalType: 'review', value: 30 });
    const s3 = store.addSignal({ businessId: 2, signalType: 'kyc', value: 90 });

    store.removeSignal(s1.id);
    store.removeSignal(s3.id);
    store.removeSignal(s2.id);

    const result = fullReconciliation();
    expect(result.consistent).toBe(true);
    expect(result.deletionCount).toBe(3);
  });

  it('returns empty report when store is empty', () => {
    const result = fullReconciliation();
    expect(result.consistent).toBe(true);
    expect(result.businessCount).toBe(0);
    expect(result.reports).toEqual([]);
  });
});
