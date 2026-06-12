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

// List all stored signals.
router.get('/signals', (req, res) => {
  const signals = store.getAllSignals();
  return res.json({ total: signals.length, count: signals.length, signals });
});

module.exports = router;
