const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const CURRENT_SCHEMA_VERSION = 1;

/**
 * Initialize the database with schema validation and migrations.
 * Fails clearly when schema is unavailable or incompatible.
 */
function initializeDatabase(dbPath, options = {}) {
  const { readonly = false, migrate = true } = options;
  
  let db;
  try {
    db = new Database(dbPath, { readonly, fileMustExist: readonly });
  } catch (error) {
    throw new Error(`Failed to open database at ${dbPath}: ${error.message}`);
  }

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');
  
  // Set busy timeout for concurrent access
  db.pragma('busy_timeout = 5000');

  if (readonly) {
    // In readonly mode, just verify schema exists
    verifySchema(db);
    return db;
  }

  if (migrate) {
    runMigrations(db);
  }

  return db;
}

/**
 * Verify that the required schema exists and is compatible.
 */
function verifySchema(db) {
  try {
    // Check if signals table exists
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='signals'
    `).get();
    
    if (!tableExists) {
      throw new Error('Required table "signals" does not exist');
    }

    // Check if schema_migrations table exists
    const migrationsTableExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='schema_migrations'
    `).get();
    
    if (!migrationsTableExists) {
      throw new Error('Required table "schema_migrations" does not exist');
    }

    // Check schema version
    const versionRow = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get();
    const currentVersion = versionRow?.version || 0;
    
    if (currentVersion < CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `Database schema version ${currentVersion} is incompatible with required version ${CURRENT_SCHEMA_VERSION}. Run migrations to upgrade.`
      );
    }

    if (currentVersion > CURRENT_SCHEMA_VERSION) {
      throw new Error(
        `Database schema version ${currentVersion} is newer than application version ${CURRENT_SCHEMA_VERSION}. Upgrade the application.`
      );
    }

    // Verify signals table structure
    const tableInfo = db.prepare('PRAGMA table_info(signals)').all();
    const requiredColumns = ['id', 'business_id', 'signal_type', 'value', 'created_at'];
    
    for (const column of requiredColumns) {
      if (!tableInfo.some(col => col.name === column)) {
        throw new Error(`Required column "${column}" missing from signals table`);
      }
    }

  } catch (error) {
    db.close();
    throw new Error(`Schema verification failed: ${error.message}`);
  }
}

/**
 * Run pending migrations.
 */
function runMigrations(db) {
  try {
    // Create schema_migrations table if it doesn't exist
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Get current version
    const versionRow = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get();
    const currentVersion = versionRow?.version || 0;

    if (currentVersion >= CURRENT_SCHEMA_VERSION) {
      return; // Already up to date
    }

    // Read and apply schema file
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error(`Schema file not found at ${schemaPath}`);
    }

    const schema = fs.readFileSync(schemaPath, 'utf8');
    
    // Execute schema in a transaction
    const transaction = db.transaction(() => {
      db.exec(schema);
    });
    
    transaction();
    
    if (process.env.NODE_ENV !== 'test') {
      console.log(`Database migrated to version ${CURRENT_SCHEMA_VERSION}`);
    }
  } catch (error) {
    db.close();
    throw new Error(`Migration failed: ${error.message}`);
  }
}

/**
 * Close the database connection.
 */
function closeDatabase(db) {
  if (db) {
    db.close();
  }
}

module.exports = {
  initializeDatabase,
  verifySchema,
  runMigrations,
  closeDatabase,
  CURRENT_SCHEMA_VERSION,
};
