const express = require('express');
const router = express.Router();
const { readCollection, writeCollection, uid } = require('../db');
const { requireTeacher } = require('../middleware/auth');
const { hashSecret } = require('../auth');

router.use(requireTeacher);

function randomPin() {
  return String(Math.floor(1000 + Math.random() * 9000)); // 4-digit PIN
}

function publicStudent(s) {
  const { pinHash, ...rest } = s;
  return rest;
}

router.get('/', (req, res) => {
  let students = readCollection('students');
  if (req.query.classId) students = students.filter((s) => s.classId === req.query.classId);
  res.json({ students: students.map(publicStudent) });
});

router.post('/', (req, res) => {
  const { classId, name, rollNumber } = req.body || {};
  if (!classId || !name || !rollNumber) {
    return res.status(400).json({ error: 'Class, name and roll number are all required.' });
  }
  const classes = readCollection('classes');
  if (!classes.some((c) => c.id === classId)) return res.status(400).json({ error: 'That class does not exist.' });

  const students = readCollection('students');
  if (students.some((s) => s.classId === classId && String(s.rollNumber).toLowerCase() === String(rollNumber).toLowerCase())) {
    return res.status(409).json({ error: 'A student with this roll number already exists in this class.' });
  }

  const pin = randomPin();
  const student = {
    id: uid(),
    classId,
    name: name.trim(),
    rollNumber: String(rollNumber).trim(),
    pinHash: hashSecret(pin),
    createdAt: new Date().toISOString()
  };
  students.push(student);
  writeCollection('students', students);

  // The plain PIN is only ever returned here, once, right after creation —
  // it is never stored or shown again. Share it with the student directly
  // (e.g. on WhatsApp); if it's lost, use "Reset PIN" to issue a new one.
  res.json({ student: publicStudent(student), pin });
});

router.post('/:id/reset-pin', (req, res) => {
  const students = readCollection('students');
  const student = students.find((s) => s.id === req.params.id);
  if (!student) return res.status(404).json({ error: 'Student not found.' });
  const pin = randomPin();
  student.pinHash = hashSecret(pin);
  writeCollection('students', students);
  res.json({ student: publicStudent(student), pin });
});

router.delete('/:id', (req, res) => {
  const students = readCollection('students').filter((s) => s.id !== req.params.id);
  writeCollection('students', students);
  const subs = readCollection('pushSubscriptions').filter((p) => p.studentId !== req.params.id);
  writeCollection('pushSubscriptions', subs);
  res.json({ ok: true });
});

module.exports = router;
