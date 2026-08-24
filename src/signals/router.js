// Express router exposing the Trust Signals REST API.

const express = require('express');
const store = require('./store');
const { validateSignal } = require('./validate');
const { scoreSignals } = require('./score');
const { listBusinessSummaries, sortBySummaryScoreDesc } = require('./directory');
const { breakdownForBusiness } = require('./breakdown');

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

// Delete a signal by id.
// On success, sets audit headers identifying the removed signal and affected
// business without exposing the signal value in the response body.
router.delete('/signals/:id', (req, res) => {
  const removed = store.removeSignal(Number(req.params.id));
  if (!removed) {
    return res.status(404).json({ error: 'signal not found' });
  }
  res.set('X-Deleted-Signal-Id', String(removed.id));
  res.set('X-Affected-Business-Id', String(removed.businessId));
  res.set('X-Deletion-Timestamp', new Date().toISOString());
  return res.status(204).end();
});

// List a summary (signal count and score) for every known business.
router.get('/businesses', (req, res) => {
  let summaries = sortBySummaryScoreDesc(listBusinessSummaries());
  if (req.query.limit !== undefined) {
    summaries = summaries.slice(0, Number(req.query.limit));
  }
  return res.json({ businesses: summaries });
});

// Per-type signal count breakdown for a business.
router.get('/businesses/:id/breakdown', (req, res) => {
  const businessId = Number(req.params.id);
  return res.json(breakdownForBusiness(businessId));
});

// Compute the trust score for a business from its signals.
router.get('/businesses/:id/score', (req, res) => {
  const businessId = Number(req.params.id);
  const signals = store.getSignalsByBusiness(businessId);
  return res.json({
    businessId,
    score: scoreSignals(signals),
    signalCount: signals.length,
  });
});

module.exports = router;
