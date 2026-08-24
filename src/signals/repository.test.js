const fs = require('fs');
const path = require('path');
const repository = require('./repository');
const { initializeDatabase, closeDatabase, CURRENT_SCHEMA_VERSION } = require('./database/init');

describe('Repository - Restart and Persistence', () => {
  const testDbPath = path.join(__dirname, 'test-data', 'restart-test.db');
  
  beforeEach(() => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    // Ensure test data directory exists
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    repository.close();
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('persists signals across repository restarts', () => {
    // First session: add signals
    repository.initialize(testDbPath);
    const signal1 = repository.addSignal({
      businessId: 1,
      signalType: 'payment',
      value: 100
    });
    const signal2 = repository.addSignal({
      businessId: 2,
      signalType: 'review',
      value: 5
    });
    
    expect(signal1.id).toBe(1);
    expect(signal2.id).toBe(2);
    expect(repository.countSignals()).toBe(2);
    
    // Close connection
    repository.close();
    
    // Second session: verify persistence
    repository.initialize(testDbPath);
    expect(repository.countSignals()).toBe(2);
    
    const retrieved1 = repository.getSignalById(1);
    const retrieved2 = repository.getSignalById(2);
    
    expect(retrieved1).toMatchObject({
      businessId: 1,
      signalType: 'payment',
      value: 100
    });
    expect(retrieved2).toMatchObject({
      businessId: 2,
      signalType: 'review',
      value: 5
    });
  });

  it('generates sequential IDs across restarts', () => {
    // First session: add 3 signals
    repository.initialize(testDbPath);
    repository.addSignal({ businessId: 1, signalType: 'payment', value: 100 });
    repository.addSignal({ businessId: 1, signalType: 'review', value: 5 });
    repository.addSignal({ businessId: 2, signalType: 'payment', value: 50 });
    repository.close();
    
    // Second session: add more signals
    repository.initialize(testDbPath);
    const signal4 = repository.addSignal({ businessId: 3, signalType: 'kyc', value: 10 });
    const signal5 = repository.addSignal({ businessId: 3, signalType: 'dispute', value: -5 });
    
    expect(signal4.id).toBe(4);
    expect(signal5.id).toBe(5);
    expect(repository.countSignals()).toBe(5);
  });

  it('persists deletions across restarts', () => {
    // First session: add and delete
    repository.initialize(testDbPath);
    const signal1 = repository.addSignal({ businessId: 1, signalType: 'payment', value: 100 });
    const signal2 = repository.addSignal({ businessId: 2, signalType: 'review', value: 5 });
    
    repository.removeSignal(signal1.id);
    expect(repository.countSignals()).toBe(1);
    repository.close();
    
    // Second session: verify deletion persisted
    repository.initialize(testDbPath);
    expect(repository.countSignals()).toBe(1);
    expect(repository.getSignalById(signal1.id)).toBeUndefined();
    expect(repository.getSignalById(signal2.id)).toBeDefined();
  });
});

describe('Repository - Concurrent Writes', () => {
  const testDbPath = path.join(__dirname, 'test-data', 'concurrent-test.db');
  
  beforeEach(() => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    // Ensure test data directory exists
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    repository.initialize(testDbPath);
  });

  afterEach(() => {
    repository.close();
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('handles multiple concurrent insertions', async () => {
    const promises = [];
    const signalCount = 100;
    
    for (let i = 0; i < signalCount; i++) {
      promises.push(
        new Promise((resolve) => {
          setImmediate(() => {
            const signal = repository.addSignal({
              businessId: i % 10,
              signalType: 'payment',
              value: i
            });
            resolve(signal);
          });
        })
      );
    }
    
    const results = await Promise.all(promises);
    expect(results).toHaveLength(signalCount);
    expect(repository.countSignals()).toBe(signalCount);
    
    // Verify all IDs are unique
    const ids = results.map(r => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(signalCount);
  });

  it('handles concurrent reads and writes', async () => {
    // Add initial data
    for (let i = 0; i < 10; i++) {
      repository.addSignal({ businessId: 1, signalType: 'payment', value: i });
    }
    
    const promises = [];
    
    // Concurrent writes
    for (let i = 10; i < 20; i++) {
      promises.push(
        new Promise((resolve) => {
          setImmediate(() => {
            repository.addSignal({ businessId: 2, signalType: 'review', value: i });
            resolve();
          });
        })
      );
    }
    
    // Concurrent reads
    for (let i = 0; i < 10; i++) {
      promises.push(
        new Promise((resolve) => {
          setImmediate(() => {
            const signals = repository.getSignalsByBusiness(1);
            expect(signals.length).toBeGreaterThan(0);
            resolve();
          });
        })
      );
    }
    
    await Promise.all(promises);
    expect(repository.countSignals()).toBe(20);
  });

  it('handles concurrent deletions', async () => {
    // Add signals
    const signalIds = [];
    for (let i = 0; i < 20; i++) {
      const signal = repository.addSignal({
        businessId: 1,
        signalType: 'payment',
        value: i
      });
      signalIds.push(signal.id);
    }
    
    // Delete half of them concurrently
    const promises = signalIds.slice(0, 10).map(id => 
      new Promise((resolve) => {
        setImmediate(() => {
          repository.removeSignal(id);
          resolve();
        });
      })
    );
    
    await Promise.all(promises);
    expect(repository.countSignals()).toBe(10);
  });
});

describe('Database Initialization - Schema Validation', () => {
  const testDbPath = path.join(__dirname, 'test-data', 'schema-test.db');
  
  beforeEach(() => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    // Ensure test data directory exists
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('initializes database with correct schema', () => {
    const db = initializeDatabase(testDbPath, { migrate: true });
    
    // Check that signals table exists
    const tableExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='signals'
    `).get();
    expect(tableExists).toBeDefined();
    
    // Check that schema_migrations table exists
    const migrationsTableExists = db.prepare(`
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='schema_migrations'
    `).get();
    expect(migrationsTableExists).toBeDefined();
    
    // Check schema version
    const versionRow = db.prepare('SELECT MAX(version) as version FROM schema_migrations').get();
    expect(versionRow.version).toBe(CURRENT_SCHEMA_VERSION);
    
    closeDatabase(db);
  });

  it('fails when database file does not exist in readonly mode', () => {
    expect(() => {
      initializeDatabase(testDbPath, { readonly: true });
    }).toThrow(/Failed to open database/);
  });

  it('verifies schema correctly for valid database', () => {
    const db = initializeDatabase(testDbPath, { migrate: true });
    closeDatabase(db);
    
    // Reopen in readonly mode and verify
    const readonlyDb = initializeDatabase(testDbPath, { readonly: true });
    expect(readonlyDb).toBeDefined();
    closeDatabase(readonlyDb);
  });

  it('fails when signals table is missing', () => {
    // Create database without proper schema
    const db = initializeDatabase(testDbPath, { migrate: true });
    db.prepare('DROP TABLE signals').run();
    closeDatabase(db);
    
    // Try to open and verify
    expect(() => {
      initializeDatabase(testDbPath, { readonly: true });
    }).toThrow(/Required table "signals" does not exist/);
  });

  it('fails when schema version is incompatible', () => {
    const db = initializeDatabase(testDbPath, { migrate: true });
    // Set a higher version
    db.prepare('UPDATE schema_migrations SET version = 999').run();
    closeDatabase(db);
    
    expect(() => {
      initializeDatabase(testDbPath, { readonly: true });
    }).toThrow(/Database schema version 999 is newer than application version/);
  });
});

describe('Repository - Error Recovery', () => {
  const testDbPath = path.join(__dirname, 'test-data', 'recovery-test.db');
  
  beforeEach(() => {
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    // Ensure test data directory exists
    const testDir = path.dirname(testDbPath);
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
    repository.initialize(testDbPath);
  });

  afterEach(() => {
    repository.close();
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  it('handles invalid signal type gracefully', () => {
    expect(() => {
      repository.addSignal({
        businessId: 1,
        signalType: 'invalid_type',
        value: 100
      });
    }).toThrow(/CHECK constraint failed/);
  });

  it('handles missing required fields', () => {
    expect(() => {
      repository.addSignal({
        businessId: 1,
        // missing signalType
        value: 100
      });
    }).toThrow();
  });

  it('returns undefined for non-existent signal', () => {
    const result = repository.getSignalById(99999);
    expect(result).toBeUndefined();
  });

  it('returns false when removing non-existent signal', () => {
    const result = repository.removeSignal(99999);
    expect(result).toBe(false);
  });

  it('handles businessId query with no results', () => {
    const results = repository.getSignalsByBusiness(99999);
    expect(results).toEqual([]);
  });

  it('clears all signals when clearSignals is called', () => {
    // Add multiple signals
    for (let i = 0; i < 10; i++) {
      repository.addSignal({
        businessId: i,
        signalType: 'payment',
        value: i * 10
      });
    }
    
    expect(repository.countSignals()).toBe(10);
    
    repository.clearSignals();
    
    expect(repository.countSignals()).toBe(0);
    expect(repository.getAllSignals()).toEqual([]);
  });

  it('maintains data integrity after clear and restart', () => {
    // Add signals
    repository.addSignal({ businessId: 1, signalType: 'payment', value: 100 });
    repository.addSignal({ businessId: 2, signalType: 'review', value: 5 });
    
    repository.clearSignals();
    repository.close();
    
    // Restart
    repository.initialize(testDbPath);
    
    // Add new signals
    const signal1 = repository.addSignal({ businessId: 3, signalType: 'kyc', value: 10 });
    const signal2 = repository.addSignal({ businessId: 4, signalType: 'dispute', value: -5 });
    
    expect(signal1.id).toBe(1); // IDs should restart from 1 after clear
    expect(signal2.id).toBe(2);
    expect(repository.countSignals()).toBe(2);
  });
});
