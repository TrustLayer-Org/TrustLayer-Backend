// Validation helpers and field validators for trust signals.

const { ALLOWED_SIGNAL_TYPES } = require('./constants');

// True when value is a whole number greater than zero.
const isPositiveInteger = (value) =>
  Number.isInteger(value) && value > 0;

module.exports.isPositiveInteger = isPositiveInteger;
