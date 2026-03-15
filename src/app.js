const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Health check for load balancers and CI
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'trustlayer-backend' });
});

// TrustLayer API placeholder routes
app.get('/api/v1/trust/verify/:businessId', (req, res) => {
  const { businessId } = req.params;
  res.json({
    businessId,
    score: 0,
    message: 'Verification API – integrate with Stellar/Soroban',
  });
});

app.get('/api/v1/businesses', (req, res) => {
  res.json({ businesses: [] });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`TrustLayer API listening on port ${PORT}`);
  });
}

module.exports = app;
