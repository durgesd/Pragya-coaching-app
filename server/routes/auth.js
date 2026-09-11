const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { readCollection } = require('../db');
const { verifySecret, issueToken } = require('../auth');
const { attachUser } = require('../middleware/auth');

const TEACHER_FILE = path.join(__dirname, '..', 'data', 'teacher.json');

// Basic brute-force slow-down: track failed attempts per IP+identifier
// in memory (fine for a single small server; resets on restart).
const failedAttempts = new Map();
function tooManyAttempts(key) {
  const rec = failedAttempts.get(key);
  if (!rec) return false;
  return rec.count >= 6 && (Date.now() - rec.lastAt) < 10 * 60 * 1000; // 10 min lockout after 6 fails
}
function recordFailure(key) {
  const rec = failedAttempts.get(key) || { count: 0, lastAt: 0 };
  rec.count += 1;
  rec.lastAt = Date.now();
  failedAttempts.set(key, rec);
}
function clearFailures(key) {
  failedAttempts.delete(key);
}

router.post('/teacher-login', (req, res) => {
  const { username, password } = req.body || {};
  const key = 'teacher:' + (username || '') + ':' + req.ip;
  if (tooManyAttempts(key)) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again in a few minutes.' });
  }
  if (!fs.existsSync(TEACHER_FILE)) {
    return res.status(500).json({ error: 'No teacher account set up yet. Run "npm run setup:teacher" on the server first.' });
  }
  const teacher = JSON.parse(fs.readFileSync(TEACHER_FILE, 'utf8'));
  if (!username || !password || username !== teacher.username || !verifySecret(password, teacher.passwordHash)) {
    recordFailure(key);
    return res.status(401).json({ error: 'Incorrect username or password.' });
  }
  clearFailures(key);
  const token = issueToken({ role: 'teacher', teacherId: teacher.id });
  res.json({ token, name: teacher.username });
});

// Public — lets the student login screen show a class dropdown.
router.get('/classes-public', (req, res) => {
  const classes = readCollection('classes').map((c) => ({ id: c.id, name: c.name }));
  res.json({ classes });
});

router.post('/student-login', (req, res) => {
  const { classId, rollNumber, pin } = req.body || {};
  const key = 'student:' + (classId || '') + ':' + (rollNumber || '') + ':' + req.ip;
  if (tooManyAttempts(key)) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again in a few minutes.' });
  }
  const students = readCollection('students');
  const student = students.find((s) => s.classId === classId && String(s.rollNumber).toLowerCase() === String(rollNumber || '').toLowerCase());
  if (!student || !pin || !verifySecret(pin, student.pinHash)) {
    recordFailure(key);
    return res.status(401).json({ error: 'Incorrect roll number or PIN.' });
  }
  clearFailures(key);
  const token = issueToken({ role: 'student', studentId: student.id, classId: student.classId });
  res.json({ token, name: student.name, rollNumber: student.rollNumber });
});

router.get('/me', attachUser, (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not logged in.' });
  if (req.user.role === 'student') {
    const student = readCollection('students').find((s) => s.id === req.user.studentId);
    if (!student) return res.status(401).json({ error: 'Account no longer exists.' });
    const cls = readCollection('classes').find((c) => c.id === student.classId);
    return res.json({ role: 'student', id: student.id, name: student.name, rollNumber: student.rollNumber, className: cls ? cls.name : '' });
  }
  res.json({ role: 'teacher', id: req.user.teacherId });
});

module.exports = router;
