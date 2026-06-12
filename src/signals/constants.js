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
