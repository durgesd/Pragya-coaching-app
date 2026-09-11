const express = require('express');
const path = require('path');
const { PORT } = require('./config');
const { attachUser } = require('./middleware/auth');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(attachUser);

// Security headers — kept minimal/dependency-free rather than pulling in helmet.
app.use((req, res, next) => {
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  next();
});

app.use('/api/auth', require('./routes/auth'));
app.use('/api/classes', require('./routes/classes'));
app.use('/api/students', require('./routes/students'));
app.use('/api/homework', require('./routes/homework'));
app.use('/api/content', require('./routes/content'));
app.use('/api/push', require('./routes/push'));

// Static frontends. Uploaded files are NOT served statically — they only
// ever go out through the protected /api/content endpoint above.
app.use('/teacher', express.static(path.join(__dirname, '..', 'public', 'teacher')));
app.use('/student', express.static(path.join(__dirname, '..', 'public', 'student')));
app.use('/shared', express.static(path.join(__dirname, '..', 'public', 'shared')));

app.get('/', (req, res) => res.redirect('/student/'));

app.listen(PORT, () => {
  console.log(`\nPragya Coaching app running:`);
  console.log(`  Teacher panel: http://localhost:${PORT}/teacher/`);
  console.log(`  Student panel: http://localhost:${PORT}/student/\n`);
});
