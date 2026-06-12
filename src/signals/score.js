// Trust score computation from a collection of signals.

const { SIGNAL_WEIGHTS, SCORE_MIN, SCORE_MAX } = require('./constants');

// Unweighted mean of signal values; 0 for an empty collection.
const rawAverage = (signals) => {
  if (signals.length === 0) {
    return 0;
  }
  const total = signals.reduce((sum, signal) => sum + signal.value, 0);
  return total / signals.length;
};

module.exports.rawAverage = rawAverage;
