// In-memory store for trust signals and their idempotency bindings.
// Not persistent; intended for development and tests.
// Durability across process restart is tracked separately in issue #1;
// idempotency records live in the same persistence boundary as signals
// so a durable repository must commit both together atomically.

const { resolveTtlMs } = require('./idempotency');

const signals = [];
let nextId = 1;

// Append-only audit log for deleted signals.
// Each entry is a tombstone: { deletionId, signalId, businessId, signalType, deletedAt }.
// Deliberately omits `value` to avoid leaking sensitive score data.
const deletionLog = [];
let nextDeletionId = 1;

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

// Remove a signal by id; returns the removed record or null when not found.
// Appends a tombstone to the deletion log on success for audit/reconciliation.
module.exports.removeSignal = (id) => {
  const index = signals.findIndex((signal) => signal.id === id);
  if (index === -1) {
    return null;
  }
  const [removed] = signals.splice(index, 1);
  const tombstone = {
    deletionId: nextDeletionId,
    signalId: removed.id,
    businessId: removed.businessId,
    signalType: removed.signalType,
    deletedAt: new Date().toISOString(),
  };
  nextDeletionId += 1;
  deletionLog.push(tombstone);
  return removed;
};

// Reset the store to its initial state. Intended for use in tests.
module.exports.clearSignals = () => {
  signals.length = 0;
  nextId = 1;
  deletionLog.length = 0;
  nextDeletionId = 1;
};

// Return the number of stored signals.
module.exports.countSignals = () => signals.length;

// Return a shallow copy of the deletion audit log.
module.exports.getDeletionLog = () => deletionLog.slice();

// Clear only the deletion log. Intended for use in tests.
module.exports.clearDeletionLog = () => {
  deletionLog.length = 0;
  nextDeletionId = 1;
};
