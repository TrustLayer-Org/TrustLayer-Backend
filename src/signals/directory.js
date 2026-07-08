// Business directory derived from stored trust signals.

const store = require('./store');
const { scoreSignals } = require('./score');

// Return the distinct business ids referenced by a collection of signals.
const listBusinessIds = (signals) => {
  const ids = [];
  signals.forEach((signal) => {
    if (!ids.includes(signal.businessId)) {
      ids.push(signal.businessId);
    }
  });
  return ids;
};

module.exports.listBusinessIds = listBusinessIds;

// Summarize a business's signal count and computed trust score.
const summarizeBusiness = (businessId, signals) => {
  const businessSignals = signals.filter(
    (signal) => signal.businessId === businessId
  );
  return {
    businessId,
    signalCount: businessSignals.length,
    score: scoreSignals(businessSignals),
  };
};

module.exports.summarizeBusiness = summarizeBusiness;

// Build a summary for every business with at least one stored signal.
const listBusinessSummaries = () => {
  const signals = store.getAllSignals();
  return listBusinessIds(signals).map((businessId) =>
    summarizeBusiness(businessId, signals)
  );
};

module.exports.listBusinessSummaries = listBusinessSummaries;
