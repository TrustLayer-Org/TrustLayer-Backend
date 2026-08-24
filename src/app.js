const express = require('express');
const cors = require('cors');
const signalsRouter = require('./signals/router');
const store = require('./signals/store');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// Initialize durable repository during startup
// Only initialize when running as main module (not when required by tests)
if (require.main === module) {
  const dbPath = process.env.DB_PATH || path.join(process.cwd(), 'data', 'signals.db');
  try {
    store.initialize(dbPath);
    if (process.env.NODE_ENV !== 'test') {
      console.log(`Repository initialized with database at ${dbPath}`);
    }
  } catch (error) {
    console.error('Failed to initialize repository:', error.message);
    process.exit(1);
  }
}

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

// Trust Signals REST API
app.use('/api/v1', signalsRouter);

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`TrustLayer API listening on port ${PORT}`);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n${signal} received, shutting down gracefully...`);
    server.close(() => {
      store.close();
      console.log('Server closed');
      process.exit(0);
    });
    
    // Force shutdown after 10 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = app;
