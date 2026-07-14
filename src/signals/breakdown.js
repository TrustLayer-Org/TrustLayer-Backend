// Per-type signal breakdown for a business.

// Tally signals by type.
const countsByType = (signals) => {
  const counts = {};
  signals.forEach((signal) => {
    counts[signal.signalType] = (counts[signal.signalType] || 0) + 1;
  });
  return counts;
};

module.exports.countsByType = countsByType;
