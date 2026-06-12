// Trust Signals domain constants.

// Signal types accepted by the Trust Signals service.
const ALLOWED_SIGNAL_TYPES = ['payment', 'review', 'dispute', 'kyc'];

module.exports.ALLOWED_SIGNAL_TYPES = ALLOWED_SIGNAL_TYPES;

// Per-type scoring weights applied when aggregating signals.
const SIGNAL_WEIGHTS = {
  payment: 1,
  review: 0.8,
  dispute: -1.5,
  kyc: 1.2,
};

module.exports.SIGNAL_WEIGHTS = SIGNAL_WEIGHTS;

// Inclusive bounds for a computed trust score.
const SCORE_MIN = 0;
const SCORE_MAX = 100;

module.exports.SCORE_MIN = SCORE_MIN;
module.exports.SCORE_MAX = SCORE_MAX;
