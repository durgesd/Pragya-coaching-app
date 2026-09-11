const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./config');

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = '30d'; // students/teacher stay logged in for a month

function hashSecret(plain) {
  return bcrypt.hashSync(plain, SALT_ROUNDS);
}

function verifySecret(plain, hash) {
  return bcrypt.compareSync(plain, hash);
}

function issueToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return null;
  }
}

/** A short-lived "ticket" used to authorize a single media request
 *  (e.g. a <video>/<img> tag can't send an Authorization header, so the
 *  app fetches one of these first, then puts it in the URL as a query
 *  param). Kept deliberately short-lived (60s) and single-purpose. */
function issueContentTicket(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '60s' });
}

module.exports = { hashSecret, verifySecret, issueToken, verifyToken, issueContentTicket };
