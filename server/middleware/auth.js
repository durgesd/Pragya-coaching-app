const { verifyToken } = require('../auth');

function attachUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token || null);
  req.user = token ? verifyToken(token) : null;
  next();
}

function requireTeacher(req, res, next) {
  if (!req.user || req.user.role !== 'teacher') {
    return res.status(401).json({ error: 'Teacher login required.' });
  }
  next();
}

function requireStudent(req, res, next) {
  if (!req.user || req.user.role !== 'student') {
    return res.status(401).json({ error: 'Student login required.' });
  }
  next();
}

function requireAnyAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Login required.' });
  next();
}

module.exports = { attachUser, requireTeacher, requireStudent, requireAnyAuth };
