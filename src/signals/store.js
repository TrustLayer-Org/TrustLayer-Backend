// In-memory store for trust signals.
// Not persistent; intended for development and tests.

const signals = [];
let nextId = 1;

// Store a signal, assigning it a generated id, and return the stored record.
module.exports.addSignal = (signal) => {
  const record = { id: nextId, ...signal };
  nextId += 1;
  signals.push(record);
  return record;
};

// Return a shallow copy of all stored signals.
module.exports.getAllSignals = () => signals.slice();

// Find a single signal by its id, or undefined when not present.
module.exports.getSignalById = (id) =>
  signals.find((signal) => signal.id === id);

// Return all signals belonging to a given business id.
module.exports.getSignalsByBusiness = (businessId) =>
  signals.filter((signal) => signal.businessId === businessId);

// Remove a signal by id; returns true when something was removed.
module.exports.removeSignal = (id) => {
  const index = signals.findIndex((signal) => signal.id === id);
  if (index === -1) {
    return false;
  }
  signals.splice(index, 1);
  return true;
};

// Reset the store to its initial state. Intended for use in tests.
module.exports.clearSignals = () => {
  signals.length = 0;
  nextId = 1;
};
