const express = require('express');
const router = express.Router();
const { readCollection, writeCollection, uid } = require('../db');
const { requireStudent } = require('../middleware/auth');
const { VAPID_PUBLIC_KEY } = require('../config');
const { isPushConfigured } = require('../push');

router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: VAPID_PUBLIC_KEY, configured: isPushConfigured() });
});

router.post('/subscribe', requireStudent, (req, res) => {
  const subscription = req.body && req.body.subscription;
  if (!subscription || !subscription.endpoint) return res.status(400).json({ error: 'Invalid subscription.' });
  const subs = readCollection('pushSubscriptions').filter((s) => s.subscription.endpoint !== subscription.endpoint);
  subs.push({ id: uid(), studentId: req.user.studentId, subscription, createdAt: new Date().toISOString() });
  writeCollection('pushSubscriptions', subs);
  res.json({ ok: true });
});

router.post('/unsubscribe', requireStudent, (req, res) => {
  const endpoint = req.body && req.body.endpoint;
  const subs = readCollection('pushSubscriptions').filter((s) => s.subscription.endpoint !== endpoint);
  writeCollection('pushSubscriptions', subs);
  res.json({ ok: true });
});

module.exports = router;
