// In-memory store for trust signals and their idempotency bindings.
// Not persistent; intended for development and tests.
// Durability across process restart is tracked separately in issue #1;
// idempotency records live in the same persistence boundary as signals
// so a durable repository must commit both together atomically.

const { resolveTtlMs } = require('./idempotency');

const signals = [];
let nextId = 1;

// Idempotency key -> committed binding:
// { key, fingerprint, businessId, record, createdAt }.
const idempotencyByKey = new Map();

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
  idempotencyByKey.clear();
};

// Return the number of stored signals.
module.exports.countSignals = () => signals.length;

// Clear committed idempotency bindings. Intended for use in tests.
module.exports.clearIdempotency = () => {
  idempotencyByKey.clear();
};

// Return the number of live idempotency bindings.
module.exports.countIdempotencyKeys = () => idempotencyByKey.size;

// Create a signal exactly once per idempotency key.
//
// The lookup, binding comparison, signal insertion, and binding commit all
// run synchronously with no await between them, so within a process they
// are atomic with respect to the event loop: two concurrent identical
// requests cannot both observe the key as absent. A durable backend must
// preserve this guarantee across processes (single transaction or unique
// constraint covering both writes).
//
// Options:
//   key         - caller-provided idempotency key (falsy: legacy path,
//                 no deduplication, always creates)
//   fingerprint - canonical payload fingerprint bound to the key
//   now         - clock override for tests (defaults to Date.now())
//   ttlMs       - retention window override (defaults to
//                 resolveTtlMs(), env-tunable)
//
// Returns { outcome, record } where outcome is one of:
//   'created'  - new signal stored and bound to the key
//   'replayed' - exact retry; original record returned unchanged
//   'conflict' - same key used with a different binding; nothing changed
//
// Retention policy: a binding older than ttlMs is expired on access and
// the key becomes reclaimable by a brand-new request (documented in the
// API docs). Expired keys never replay stale results ambiguously.
module.exports.addSignalIdempotent = (signal, options = {}) => {
  const now = options.now === undefined ? Date.now() : options.now;
  const ttlMs = resolveTtlMs(options.ttlMs);
  const { key, fingerprint } = options;

  if (!key) {
    return { outcome: 'created', record: module.exports.addSignal(signal) };
  }

  const existing = idempotencyByKey.get(key);
  if (existing) {
    if (now - existing.createdAt >= ttlMs) {
      // Documented expiry transition: drop the binding so the key can be
      // reclaimed as an explicitly NEW request.
      idempotencyByKey.delete(key);
    } else if (existing.fingerprint === fingerprint) {
      return { outcome: 'replayed', record: existing.record };
    } else {
      return { outcome: 'conflict', record: undefined };
    }
  }

  const record = module.exports.addSignal(signal);
  // Store an immutable snapshot of the created record so replays always
  // return the exact original response even if the live signal is later
  // mutated or removed.
  idempotencyByKey.set(key, {
    key,
    fingerprint,
    businessId: signal.businessId,
    record: { ...record },
    createdAt: now,
  });
  return { outcome: 'created', record };
};
