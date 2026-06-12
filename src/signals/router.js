// Express router exposing the Trust Signals REST API.

const express = require('express');
const store = require('./store');
const { validateSignal } = require('./validate');
const { scoreSignals } = require('./score');

const router = express.Router();

// Create a new signal after validating the request body.
router.post('/signals', (req, res) => {
  const { valid, errors } = validateSignal(req.body);
  if (!valid) {
    return res.status(400).json({ errors });
  }
  const record = store.addSignal(req.body);
  return res.status(201).json(record);
});

// List stored signals, optionally filtered by businessId.
router.get('/signals', (req, res) => {
  let signals = store.getAllSignals();
  if (req.query.businessId !== undefined) {
    const businessId = Number(req.query.businessId);
    signals = signals.filter((signal) => signal.businessId === businessId);
  }
  const total = signals.length;
  const offset = Number(req.query.offset) || 0;
  const limit =
    req.query.limit !== undefined ? Number(req.query.limit) : signals.length;
  const page = signals.slice(offset, offset + limit);
  return res.json({ total, count: page.length, signals: page });
});

// Fetch a single signal by id.
router.get('/signals/:id', (req, res) => {
  const signal = store.getSignalById(Number(req.params.id));
  if (!signal) {
    return res.status(404).json({ error: 'signal not found' });
  }
  return res.json(signal);
});

module.exports = router;
