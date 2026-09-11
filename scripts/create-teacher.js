const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { hashSecret } = require('../server/auth');
const { uid } = require('../server/db');

const TEACHER_FILE = path.join(__dirname, '..', 'server', 'data', 'teacher.json');

function ask(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

(async () => {
  const dataDir = path.dirname(TEACHER_FILE);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  let username = process.env.TEACHER_USERNAME;
  let password = process.env.TEACHER_PASSWORD;

  if (!username || !password) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    console.log('Set up the teacher login for Pragya Coaching app.\n');
    username = (await ask(rl, 'Username [teacher]: ')).trim() || 'teacher';
    password = (await ask(rl, 'Password (min 6 characters): ')).trim();
    while (password.length < 6) {
      password = (await ask(rl, 'Too short — password (min 6 characters): ')).trim();
    }
    rl.close();
  } else if (password.length < 6) {
    console.error('TEACHER_PASSWORD must be at least 6 characters.');
    process.exit(1);
  }

  const teacher = { id: uid(), username, passwordHash: hashSecret(password) };
  fs.writeFileSync(TEACHER_FILE, JSON.stringify(teacher, null, 2));
  console.log('\n✓ Teacher account saved. You can log in at /teacher/ with that username and password.');
})();
