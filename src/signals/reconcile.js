// Reconciliation utility for verifying derived-state consistency.
// Independently computes score, breakdown, and directory for a business
// and compares them, returning a structured consistency report.

const store = require('./store');
const { scoreSignals } = require('./score');
const { breakdownForBusiness } = require('./breakdown');
const { listBusinessSummaries, sortBySummaryScoreDesc } = require('./directory');

// Check that score, breakdown, directory, and raw store agree for a business.
const checkConsistency = (businessId) => {
  const signals = store.getSignalsByBusiness(businessId);
  const expectedCount = signals.length;
  const expectedScore = scoreSignals(signals);
  const breakdown = breakdownForBusiness(businessId);
  const directory = sortBySummaryScoreDesc(listBusinessSummaries());
  const directoryEntry = directory.find(
    (entry) => entry.businessId === businessId
  );

  const mismatches = [];

  // Breakdown total count must match raw signal count.
  const breakdownTotal = Object.values(breakdown.counts).reduce(
    (sum, c) => sum + c,
    0
  );
  if (breakdownTotal !== expectedCount) {
    mismatches.push({
      field: 'breakdown.totalCount',
      expected: expectedCount,
      actual: breakdownTotal,
    });
  }

  // Directory entry consistency.
  if (expectedCount > 0) {
    if (!directoryEntry) {
      mismatches.push({
        field: 'directory.presence',
        expected: 'present',
        actual: 'absent',
      });
    } else {
      if (directoryEntry.signalCount !== expectedCount) {
        mismatches.push({
          field: 'directory.signalCount',
          expected: expectedCount,
          actual: directoryEntry.signalCount,
        });
      }
      if (directoryEntry.score !== expectedScore) {
        mismatches.push({
          field: 'directory.score',
          expected: expectedScore,
          actual: directoryEntry.score,
        });
      }
    }
  } else if (directoryEntry) {
    // Business with no signals should not appear in directory.
    mismatches.push({
      field: 'directory.presence',
      expected: 'absent',
      actual: 'present',
    });
  }

  return {
    businessId,
    consistent: mismatches.length === 0,
    signalCount: expectedCount,
    score: expectedScore,
    breakdown,
    directoryEntry: directoryEntry || null,
    mismatches,
  };
};

module.exports.checkConsistency = checkConsistency;

// Run a consistency check for every business with stored signals,
// plus any businesses referenced in the deletion log.
const fullReconciliation = () => {
  const allSignals = store.getAllSignals();
  const deletionLog = store.getDeletionLog();

  // Gather all business ids from live signals and deletion log.
  const businessIdSet = new Set();
  allSignals.forEach((signal) => businessIdSet.add(signal.businessId));
  deletionLog.forEach((entry) => businessIdSet.add(entry.businessId));

  const reports = [];
  businessIdSet.forEach((businessId) => {
    reports.push(checkConsistency(businessId));
  });

  const allConsistent = reports.every((report) => report.consistent);

  return {
    consistent: allConsistent,
    businessCount: reports.length,
    reports,
    deletionCount: deletionLog.length,
  };
};

module.exports.fullReconciliation = fullReconciliation;
