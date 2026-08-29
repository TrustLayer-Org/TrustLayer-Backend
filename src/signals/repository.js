const { initializeDatabase, closeDatabase } = require('./database/init');
const path = require('path');

let db = null;
let dbPath = null;

/**
 * Initialize the repository with a specific database path.
 * This should be called during application startup.
 */
function initialize(dbPathOverride) {
  if (db) {
    throw new Error('Repository already initialized');
  }

  dbPath = dbPathOverride || path.join(process.cwd(), 'data', 'signals.db');
  
  try {
    db = initializeDatabase(dbPath, { migrate: true });
    if (process.env.NODE_ENV !== 'test') {
      console.log(`Repository initialized with database at ${dbPath}`);
    }
  } catch (error) {
    throw new Error(`Repository initialization failed: ${error.message}`);
  }
}

/**
 * Close the repository connection.
 * This should be called during application shutdown.
 */
function close() {
  if (db) {
    closeDatabase(db);
    db = null;
    if (process.env.NODE_ENV !== 'test') {
      console.log('Repository connection closed');
    }
  }
}

/**
 * Get the current database instance (for testing).
 */
function getDatabase() {
  if (!db) {
    throw new Error('Repository not initialized. Call initialize() first.');
  }
  return db;
}

/**
 * Store a signal, assigning it a generated id, and return the stored record.
 */
function addSignal(signal) {
  const database = getDatabase();
  
  try {
    const stmt = database.prepare(`
      INSERT INTO signals (business_id, signal_type, value)
      VALUES (@businessId, @signalType, @value)
    `);
    
    const result = stmt.run({
      businessId: signal.businessId,
      signalType: signal.signalType,
      value: signal.value
    });
    
    const record = database.prepare('SELECT * FROM signals WHERE id = ?').get(result.lastInsertRowid);
    return {
      id: record.id,
      businessId: record.business_id,
      signalType: record.signal_type,
      value: record.value,
      createdAt: record.created_at
    };
  } catch (error) {
    throw new Error(`Failed to add signal: ${error.message}`);
  }
}

/**
 * Return a shallow copy of all stored signals.
 */
function getAllSignals() {
  const database = getDatabase();
  
  try {
    const rows = database.prepare('SELECT * FROM signals ORDER BY id').all();
    return rows.map(row => ({
      id: row.id,
      businessId: row.business_id,
      signalType: row.signal_type,
      value: row.value,
      createdAt: row.created_at
    }));
  } catch (error) {
    throw new Error(`Failed to get all signals: ${error.message}`);
  }
}

/**
 * Find a single signal by its id, or undefined when not present.
 */
function getSignalById(id) {
  const database = getDatabase();
  
  try {
    const row = database.prepare('SELECT * FROM signals WHERE id = ?').get(id);
    if (!row) return undefined;
    
    return {
      id: row.id,
      businessId: row.business_id,
      signalType: row.signal_type,
      value: row.value,
      createdAt: row.created_at
    };
  } catch (error) {
    throw new Error(`Failed to get signal by id: ${error.message}`);
  }
}

/**
 * Return all signals belonging to a given business id.
 */
function getSignalsByBusiness(businessId) {
  const database = getDatabase();
  
  try {
    const rows = database.prepare(
      'SELECT * FROM signals WHERE business_id = ? ORDER BY id'
    ).all(businessId);
    
    return rows.map(row => ({
      id: row.id,
      businessId: row.business_id,
      signalType: row.signal_type,
      value: row.value,
      createdAt: row.created_at
    }));
  } catch (error) {
    throw new Error(`Failed to get signals by business: ${error.message}`);
  }
}

/**
 * Remove a signal by id; returns true when something was removed.
 */
function removeSignal(id) {
  const database = getDatabase();
  
  try {
    const stmt = database.prepare('DELETE FROM signals WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  } catch (error) {
    throw new Error(`Failed to remove signal: ${error.message}`);
  }
}

/**
 * Reset the store to its initial state. Intended for use in tests.
 * WARNING: This deletes all data from the database.
 */
function clearSignals() {
  const database = getDatabase();
  
  try {
    database.prepare('DELETE FROM signals').run();
    // Reset autoincrement
    database.prepare("DELETE FROM sqlite_sequence WHERE name='signals'").run();
  } catch (error) {
    throw new Error(`Failed to clear signals: ${error.message}`);
  }
}

/**
 * Return the number of stored signals.
 */
function countSignals() {
  const database = getDatabase();
  
  try {
    const result = database.prepare('SELECT COUNT(*) as count FROM signals').get();
    return result.count;
  } catch (error) {
    throw new Error(`Failed to count signals: ${error.message}`);
  }
}

module.exports = {
  initialize,
  close,
  getDatabase,
  addSignal,
  getAllSignals,
  getSignalById,
  getSignalsByBusiness,
  removeSignal,
  clearSignals,
  countSignals
};
