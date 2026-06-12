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
