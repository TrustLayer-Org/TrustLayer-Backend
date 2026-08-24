// Store for trust signals using durable repository.
// Maintains backward compatibility while using persistent storage.

const repository = require('./repository');
const path = require('path');

// Initialize repository with default path if not already initialized
let initialized = false;
let initDbPath = null;

function ensureInitialized() {
  if (!initialized) {
    const defaultPath = path.join(process.cwd(), 'data', 'signals.db');
    repository.initialize(defaultPath);
    initialized = true;
    initDbPath = defaultPath;
  }
}

// Store a signal, assigning it a generated id, and return the stored record.
module.exports.addSignal = (signal) => {
  ensureInitialized();
  return repository.addSignal(signal);
};

// Return a shallow copy of all stored signals.
module.exports.getAllSignals = () => {
  ensureInitialized();
  return repository.getAllSignals();
};

// Find a single signal by its id, or undefined when not present.
module.exports.getSignalById = (id) => {
  ensureInitialized();
  return repository.getSignalById(id);
};

// Return all signals belonging to a given business id.
module.exports.getSignalsByBusiness = (businessId) => {
  ensureInitialized();
  return repository.getSignalsByBusiness(businessId);
};

// Remove a signal by id; returns true when something was removed.
module.exports.removeSignal = (id) => {
  ensureInitialized();
  return repository.removeSignal(id);
};

// Reset the store to its initial state. Intended for use in tests.
module.exports.clearSignals = () => {
  ensureInitialized();
  return repository.clearSignals();
};

// Return the number of stored signals.
module.exports.countSignals = () => {
  ensureInitialized();
  return repository.countSignals();
};

// Expose repository functions for advanced usage
// Override initialize to track state
module.exports.initialize = (dbPath) => {
  if (initialized && initDbPath === dbPath) {
    return; // Already initialized with same path
  }
  if (initialized) {
    repository.close();
  }
  repository.initialize(dbPath);
  initialized = true;
  initDbPath = dbPath;
};

module.exports.close = () => {
  if (initialized) {
    repository.close();
    initialized = false;
    initDbPath = null;
  }
};
