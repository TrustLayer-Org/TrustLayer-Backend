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

  describe('GET /api/v2/trust/verify/:businessId', () => {
    it('returns versioned contract mock for business id', async () => {
      const res = await request(app).get('/api/v2/trust/verify/1');
      expect(res.status).toBe(200);
      expect(res.body.businessId).toBe(1);
      expect(res.body.score).toBe(0);
      expect(res.body.provenance).toBe('mock');
      expect(res.body.calculationVersion).toBe('v2.0');
      expect(typeof res.body.freshness).toBe('string');
      expect(res.body.verificationStatus).toBe('mock');
    });
  });

  describe('GET unsupported version', () => {
    it('returns 404 for unknown version of trust/verify', async () => {
      const res = await request(app).get('/api/v3/trust/verify/1');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('unsupported version');
    });

    it('returns 404 for unknown version of signals API', async () => {
      const res = await request(app).get('/api/v3/businesses/1/score');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('unsupported version');
    });
  });
});
