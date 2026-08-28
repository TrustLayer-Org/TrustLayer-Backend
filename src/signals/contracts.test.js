describe('Contract Fixtures', () => {
  const fixtures = {
    mock: {
      businessId: 1,
      score: 0,
      provenance: 'mock',
      calculationVersion: 'v2.0',
      freshness: '2023-10-10T00:00:00.000Z',
      verificationStatus: 'mock'
    },
    computed: {
      businessId: 1,
      score: 85,
      signalCount: 10,
      provenance: 'backend-computed',
      calculationVersion: 'v2.0',
      freshness: '2023-10-10T00:00:00.000Z',
      verificationStatus: 'computed'
    },
    stale: {
      businessId: 1,
      score: 50,
      provenance: 'cache',
      calculationVersion: 'v1.5',
      freshness: '2021-10-10T00:00:00.000Z',
      verificationStatus: 'stale'
    },
    unavailable: {
      businessId: 1,
      score: null,
      provenance: 'none',
      calculationVersion: 'unknown',
      freshness: null,
      verificationStatus: 'unavailable'
    },
    'on-chain-verified': {
      businessId: 1,
      score: 99,
      provenance: 'stellar-soroban',
      calculationVersion: 'v3.0-contract',
      freshness: '2023-10-10T00:00:00.000Z',
      verificationStatus: 'verified'
    }
  };

  it('validates all fixture states conform to the expected schema', () => {
    Object.entries(fixtures).forEach(([state, data]) => {
      expect(data).toHaveProperty('businessId');
      expect(data).toHaveProperty('score');
      expect(data).toHaveProperty('provenance');
      expect(data).toHaveProperty('calculationVersion');
      expect(data).toHaveProperty('freshness');
      expect(data).toHaveProperty('verificationStatus');
    });
  });
});
