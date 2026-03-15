const request = require('supertest');
const app = require('./app');

describe('TrustLayer Backend', () => {
  describe('GET /health', () => {
    it('returns 200 and status ok', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok', service: 'trustlayer-backend' });
    });
  });

  describe('GET /api/v1/trust/verify/:businessId', () => {
    it('returns verification placeholder for business id', async () => {
      const res = await request(app).get('/api/v1/trust/verify/1');
      expect(res.status).toBe(200);
      expect(res.body.businessId).toBe('1');
      expect(typeof res.body.score).toBe('number');
    });
  });
});
