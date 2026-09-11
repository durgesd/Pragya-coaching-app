const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { readCollection } = require('../db');
const { requireAnyAuth } = require('../middleware/auth');
const { issueContentTicket, verifyToken } = require('../auth');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');

function resolveRecipientIds(hw) {
  if (hw.targetType === 'class') {
    return readCollection('students').filter((s) => s.classId === hw.targetClassId).map((s) => s.id);
  }
  return hw.targetStudentIds || [];
}

function canAccess(hw, user) {
  if (!user) return false;
  if (user.role === 'teacher') return true;
  return user.role === 'student' && resolveRecipientIds(hw).includes(user.studentId);
}

/** A <video>/<img>/<iframe> tag can't send an Authorization header, so the
 *  app first calls this (authenticated, normal fetch) to get a ticket
 *  good for one file, for 60 seconds — then uses that ticket in the src
 *  URL below. This keeps the actual file path un-guessable and time-limited
 *  instead of being a permanent public link anyone could reshare. */
router.get('/:id/ticket', requireAnyAuth, (req, res) => {
  const hw = readCollection('homework').find((h) => h.id === req.params.id);
  if (!hw || !canAccess(hw, req.user)) return res.status(403).json({ error: 'Not allowed.' });
  if (!hw.storedFilename) return res.status(400).json({ error: 'This homework has no file (inline HTML content instead).' });
  const ticket = issueContentTicket({ purpose: 'content', homeworkId: hw.id });
  res.json({ ticket });
});

router.get('/:id/file', (req, res) => {
  const ticketPayload = verifyToken(req.query.ticket || '');
  if (!ticketPayload || ticketPayload.purpose !== 'content' || ticketPayload.homeworkId !== req.params.id) {
    return res.status(403).send('Link expired or invalid — reopen this homework in the app.');
  }
  const hw = readCollection('homework').find((h) => h.id === req.params.id);
  if (!hw || !hw.storedFilename) return res.status(404).send('Not found.');
  const filePath = path.join(UPLOAD_DIR, hw.storedFilename);
  if (!fs.existsSync(filePath)) return res.status(404).send('File missing on server.');

  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Disposition', 'inline'); // never force a "Save As" download prompt
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const stat = fs.statSync(filePath);
  const range = req.headers.range;
  if (range) {
    // Range support — required for video scrubbing to work.
    const [startStr, endStr] = range.replace(/bytes=/, '').split('-');
    const start = parseInt(startStr, 10);
    const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': hw.mimeType || 'application/octet-stream'
    });
    fs.createReadStream(filePath, { start, end }).pipe(res);
  } else {
    res.setHeader('Content-Length', stat.size);
    res.setHeader('Content-Type', hw.mimeType || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  }
});

module.exports = router;
