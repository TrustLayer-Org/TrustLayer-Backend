// Validation helpers and field validators for trust signals.

const { ALLOWED_SIGNAL_TYPES } = require('./constants');

// True when value is a whole number greater than zero.
const isPositiveInteger = (value) =>
  Number.isInteger(value) && value > 0;

module.exports.isPositiveInteger = isPositiveInteger;

// True when value is a string with at least one non-whitespace character.
const isNonEmptyString = (value) =>
  typeof value === 'string' && value.trim().length > 0;

module.exports.isNonEmptyString = isNonEmptyString;
