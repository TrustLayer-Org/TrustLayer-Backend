// Per-type signal breakdown for a business.

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
