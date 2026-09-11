const express = require('express');
const router = express.Router();
const { readCollection, writeCollection, uid } = require('../db');
const { requireTeacher } = require('../middleware/auth');

router.use(requireTeacher);

router.get('/', (req, res) => {
  const classes = readCollection('classes');
  const students = readCollection('students');
  const withCounts = classes.map((c) => ({
    ...c,
    studentCount: students.filter((s) => s.classId === c.id).length
  }));
  res.json({ classes: withCounts });
});

router.post('/', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Class name is required.' });
  const classes = readCollection('classes');
  if (classes.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
    return res.status(409).json({ error: 'A class with this name already exists.' });
  }
  const newClass = { id: uid(), name, createdAt: new Date().toISOString() };
  classes.push(newClass);
  writeCollection('classes', classes);
  res.json({ class: newClass });
});

router.delete('/:id', (req, res) => {
  const students = readCollection('students');
  if (students.some((s) => s.classId === req.params.id)) {
    return res.status(400).json({ error: 'Remove or move all students out of this class first.' });
  }
  const classes = readCollection('classes').filter((c) => c.id !== req.params.id);
  writeCollection('classes', classes);
  res.json({ ok: true });
});

module.exports = router;
