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

// Sum of each signal value scaled by its type weight (default 1).
const weightedTotal = (signals) =>
  signals.reduce((sum, signal) => {
    const weight = SIGNAL_WEIGHTS[signal.signalType] ?? 1;
    return sum + signal.value * weight;
  }, 0);

module.exports.weightedTotal = weightedTotal;

// Constrain a value to the inclusive score bounds.
const clamp = (value) => Math.min(SCORE_MAX, Math.max(SCORE_MIN, value));

module.exports.clamp = clamp;

// Average weighted value across signals; SCORE_MIN for an empty collection.
const computeScore = (signals) => {
  if (signals.length === 0) {
    return SCORE_MIN;
  }
  return weightedTotal(signals) / signals.length;
};

module.exports.computeScore = computeScore;
