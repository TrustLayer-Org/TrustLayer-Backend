const express = require('express');
const cors = require('cors');
const signalsRouter = require('./signals/router');
const { BODY_SIZE_LIMIT_DEFAULT } = require('./signals/constants');

const app = express();

// Trust the first proxy hop so req.ip reflects the real client behind a
// load balancer or reverse proxy.  Set to the number of proxy hops in
// production; the default of 1 is correct for most single-proxy setups.
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: BODY_SIZE_LIMIT_DEFAULT }));

const PORT = process.env.PORT || 3001;

// Health check for load balancers and CI
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'trustlayer-backend' });
});

// TrustLayer API placeholder routes
app.get('/api/:version/trust/verify/:businessId', (req, res, next) => {
  const { version, businessId } = req.params;
  
  if (version === 'v1') {
    return res.json({
      businessId,
      score: 0,
      message: 'Verification API – integrate with Stellar/Soroban',
    });
  } else if (version === 'v2') {
    return res.json({
      businessId: parseInt(businessId, 10) || 0,
      score: 0,
      provenance: 'mock',
      calculationVersion: 'v2.0',
      freshness: new Date().toISOString(),
      verificationStatus: 'mock'
    });
  }
  
  next();
});

// Trust Signals REST API
app.use('/api/v1', signalsRouter);
app.use('/api/v2', signalsRouter);

// Catch unsupported API versions
app.use('/api/:version', (req, res) => {
  res.status(404).json({ error: 'unsupported version' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`TrustLayer API listening on port ${PORT}`);
  });
}

module.exports = app;
