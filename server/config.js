require('dotenv').config();
const crypto = require('crypto');

// If no JWT secret is set, generate one on boot. This still works, but
// means everyone's login session is invalidated if the server restarts —
// for a permanent deployment, set JWT_SECRET in your .env file once.
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
if (!process.env.JWT_SECRET) {
  console.warn('[config] JWT_SECRET not set in .env — using a temporary one for this run only.');
  console.warn('[config] Set JWT_SECRET in .env for logins to survive a server restart.');
}

module.exports = {
  PORT: process.env.PORT || 3000,
  JWT_SECRET,
  VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY || '',
  VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY || '',
  VAPID_CONTACT_EMAIL: process.env.VAPID_CONTACT_EMAIL || 'mailto:admin@example.com',
  MAX_UPLOAD_MB: parseInt(process.env.MAX_UPLOAD_MB || '150', 10)
};
