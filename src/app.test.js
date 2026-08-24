const request = require('supertest');
const store = require('./signals/store');
const path = require('path');
const fs = require('fs');

const testDbPath = path.join(__dirname, 'signals', 'test-data', 'app-test.db');

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
  // Initialize store with test database
  store.initialize(testDbPath);
  store.clearSignals();
});

afterEach(() => {
  store.close();
  // Clean up test database
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }
});

describe('TrustLayer Backend', () => {
  describe('GET /health', () => {
    it('returns 200 and status ok', async () => {
      const res = await request(require('./app')).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', service: 'trustlayer-backend' });
    });
  });

  describe('GET /api/v1/trust/verify/:businessId', () => {
    it('returns verification placeholder for business id', async () => {
      const res = await request(require('./app')).get('/api/v1/trust/verify/1');
      expect(res.status).toBe(200);
      expect(res.body.businessId).toBe('1');
      expect(typeof res.body.score).toBe('number');
    });
  });
});
