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

// True when value is a finite number (not NaN or Infinity).
const isFiniteNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value);

module.exports.isFiniteNumber = isFiniteNumber;

// Validate signal.businessId; pushes a message into errors when invalid.
const validateBusinessId = (signal, errors) => {
  if (!isPositiveInteger(signal.businessId)) {
    errors.push('businessId must be a positive integer');
  }
};

module.exports.validateBusinessId = validateBusinessId;
