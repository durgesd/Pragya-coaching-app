const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { readCollection, writeCollection, uid } = require('../db');
const { requireTeacher, requireStudent, requireAnyAuth } = require('../middleware/auth');
const { sendPushToStudents } = require('../push');
const { MAX_UPLOAD_MB } = require('../config');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => cb(null, uid() + path.extname(file.originalname || ''))
});
const upload = multer({ storage, limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 } });

function detectType(mimeType) {
  if (!mimeType) return 'file';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'text/html') return 'html';
  return 'file';
}

/** Every student this homework is (or, for a class assignment, currently
 *  is) visible to — resolved live so adding a student to a class later
 *  also gives them access to past class-wide homework. */
function resolveRecipientIds(hw) {
  if (hw.targetType === 'class') {
    return readCollection('students').filter((s) => s.classId === hw.targetClassId).map((s) => s.id);
  }
  return hw.targetStudentIds || [];
}

function publicHomeworkForTeacher(hw) {
  const recipients = resolveRecipientIds(hw);
  const seenCount = recipients.filter((id) => hw.seenBy && hw.seenBy[id]).length;
  return {
    id: hw.id, title: hw.title, note: hw.note, type: hw.type,
    originalFilename: hw.originalFilename, targetType: hw.targetType,
    targetClassId: hw.targetClassId, targetStudentIds: hw.targetStudentIds,
    createdAt: hw.createdAt, recipientCount: recipients.length, seenCount
  };
}

function publicHomeworkForStudent(hw, studentId) {
  return {
    id: hw.id, title: hw.title, note: hw.note, type: hw.type,
    originalFilename: hw.originalFilename, createdAt: hw.createdAt,
    seen: !!(hw.seenBy && hw.seenBy[studentId])
  };
}

/* ---------- Teacher: create & manage ---------- */

router.post('/', requireTeacher, upload.single('file'), (req, res) => {
  const { title, note, targetType, targetClassId, htmlContent } = req.body;
  let targetStudentIds = [];
  try { targetStudentIds = req.body.targetStudentIds ? JSON.parse(req.body.targetStudentIds) : []; } catch (e) {}

  if (!title || !title.trim()) return res.status(400).json({ error: 'Title is required.' });
  if (targetType === 'class' && !targetClassId) return res.status(400).json({ error: 'Choose a class.' });
  if (targetType === 'students' && targetStudentIds.length === 0) return res.status(400).json({ error: 'Choose at least one student.' });
  if (!req.file && !(htmlContent && htmlContent.trim())) return res.status(400).json({ error: 'Attach a file or paste HTML content.' });

  const hw = {
    id: uid(),
    title: title.trim(),
    note: (note || '').trim(),
    type: req.file ? detectType(req.file.mimetype) : 'html',
    storedFilename: req.file ? req.file.filename : null,
    originalFilename: req.file ? req.file.originalname : 'note.html',
    mimeType: req.file ? req.file.mimetype : 'text/html',
    htmlContent: !req.file ? htmlContent : null,
    targetType: targetType === 'students' ? 'students' : 'class',
    targetClassId: targetType === 'class' ? targetClassId : null,
    targetStudentIds: targetType === 'students' ? targetStudentIds : [],
    createdAt: new Date().toISOString(),
    seenBy: {}
  };

  const homework = readCollection('homework');
  homework.push(hw);
  writeCollection('homework', homework);

  const recipientIds = resolveRecipientIds(hw);
  sendPushToStudents(recipientIds, {
    title: '📚 New homework: ' + hw.title,
    body: hw.note || 'Tap to open in the app.',
    homeworkId: hw.id
  }).catch(() => {});

  res.json({ homework: publicHomeworkForTeacher(hw) });
});

router.get('/', requireTeacher, (req, res) => {
  const homework = readCollection('homework').sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ homework: homework.map(publicHomeworkForTeacher) });
});

router.delete('/:id', requireTeacher, (req, res) => {
  const homework = readCollection('homework');
  const hw = homework.find((h) => h.id === req.params.id);
  if (!hw) return res.status(404).json({ error: 'Not found.' });
  if (hw.storedFilename) {
    const fp = path.join(UPLOAD_DIR, hw.storedFilename);
    fs.unlink(fp, () => {});
  }
  writeCollection('homework', homework.filter((h) => h.id !== req.params.id));
  res.json({ ok: true });
});

/* ---------- Student: view assigned homework ---------- */

router.get('/mine', requireStudent, (req, res) => {
  const homework = readCollection('homework')
    .filter((hw) => resolveRecipientIds(hw).includes(req.user.studentId))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  res.json({ homework: homework.map((hw) => publicHomeworkForStudent(hw, req.user.studentId)) });
});

router.post('/:id/seen', requireStudent, (req, res) => {
  const homework = readCollection('homework');
  const hw = homework.find((h) => h.id === req.params.id);
  if (!hw || !resolveRecipientIds(hw).includes(req.user.studentId)) return res.status(404).json({ error: 'Not found.' });
  hw.seenBy = hw.seenBy || {};
  if (!hw.seenBy[req.user.studentId]) {
    hw.seenBy[req.user.studentId] = new Date().toISOString();
    writeCollection('homework', homework);
  }
  res.json({ ok: true });
});

/* ---------- Shared: get one homework's metadata (not the file itself —
   see routes/content.js for the protected file-streaming endpoint) ---------- */

router.get('/:id', requireAnyAuth, (req, res) => {
  const hw = readCollection('homework').find((h) => h.id === req.params.id);
  if (!hw) return res.status(404).json({ error: 'Not found.' });

  if (req.user.role === 'teacher') return res.json({ homework: publicHomeworkForTeacher(hw) });

  if (!resolveRecipientIds(hw).includes(req.user.studentId)) return res.status(403).json({ error: 'Not assigned to you.' });
  const result = publicHomeworkForStudent(hw, req.user.studentId);
  if (hw.type === 'html' && hw.htmlContent) result.htmlContent = hw.htmlContent; // small inline text is safe to send directly
  res.json({ homework: result });
});

module.exports = router;
