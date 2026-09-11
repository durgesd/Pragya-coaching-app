const webpush = require('web-push');
const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_CONTACT_EMAIL } = require('./config');
const { readCollection, writeCollection } = require('./db');

let configured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_CONTACT_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  configured = true;
} else {
  console.warn('[push] VAPID keys not set — push notifications are disabled until you run "npm run setup:vapid" and add them to .env.');
}

/** Sends a real push notification to every device the given students have
 *  enabled notifications on. Subscriptions the browser has since revoked
 *  (410/404 response) are cleaned up automatically. */
async function sendPushToStudents(studentIds, payload) {
  if (!configured) return { sent: 0, configured: false };
  const subs = readCollection('pushSubscriptions');
  const stillValid = [];
  let sent = 0;
  for (const sub of subs) {
    if (!studentIds.includes(sub.studentId)) { stillValid.push(sub); continue; }
    try {
      await webpush.sendNotification(sub.subscription, JSON.stringify(payload));
      stillValid.push(sub);
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        // subscription expired or the student uninstalled/cleared it — drop it
      } else {
        stillValid.push(sub); // transient failure — keep it, try again next time
      }
    }
  }
  writeCollection('pushSubscriptions', stillValid);
  return { sent, configured: true };
}

module.exports = { sendPushToStudents, isPushConfigured: () => configured };
