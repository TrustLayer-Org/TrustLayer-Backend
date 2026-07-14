// Per-type signal breakdown for a business.

const store = require('./store');
const { ALLOWED_SIGNAL_TYPES } = require('./constants');

// Tally signals by type.
const countsByType = (signals) => {
  const counts = {};
  ALLOWED_SIGNAL_TYPES.forEach((type) => {
    counts[type] = 0;
  });
  signals.forEach((signal) => {
    if (counts[signal.signalType] !== undefined) {
      counts[signal.signalType] += 1;
    }
  });
  return counts;
};

module.exports.countsByType = countsByType;

// Combine a business id with its per-type signal counts.
const breakdownForBusiness = (businessId) => {
  const signals = store.getSignalsByBusiness(businessId);
  return {
    businessId,
    counts: countsByType(signals),
  };
};

module.exports.breakdownForBusiness = breakdownForBusiness;

// The signal type with the highest count; null when every count is zero.
const dominantType = (counts) => {
  let best = null;
  ALLOWED_SIGNAL_TYPES.forEach((type) => {
    if (counts[type] > 0 && (best === null || counts[type] > counts[best])) {
      best = type;
    }
  });
  return best;
};

module.exports.dominantType = dominantType;
