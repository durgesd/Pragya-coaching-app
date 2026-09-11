/* =========================================================
   DATABASE
   A small, dependency-free JSON-file store. Good fit for a single
   coaching centre's data (classes, students, homework, push
   subscriptions) — no database server to install or manage.
   Each collection lives in its own file under server/data/ and
   writes go through a queue so concurrent requests never corrupt
   the file.
   ========================================================= */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const writeQueues = {};

function filePath(collection) {
  return path.join(DATA_DIR, collection + '.json');
}

function readCollection(collection) {
  const fp = filePath(collection);
  if (!fs.existsSync(fp)) return [];
  try {
    const raw = fs.readFileSync(fp, 'utf8').trim();
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error(`[db] Could not read ${collection}.json — starting empty.`, e.message);
    return [];
  }
}

function writeCollection(collection, data) {
  // Queue writes per-collection so two near-simultaneous requests
  // can't interleave and corrupt the file.
  const prev = writeQueues[collection] || Promise.resolve();
  const next = prev.then(() => new Promise((resolve, reject) => {
    const fp = filePath(collection);
    const tmp = fp + '.tmp';
    fs.writeFile(tmp, JSON.stringify(data, null, 2), (err) => {
      if (err) { reject(err); return; }
      fs.rename(tmp, fp, (err2) => (err2 ? reject(err2) : resolve()));
    });
  }));
  writeQueues[collection] = next.catch(() => {}); // keep the chain alive even after an error
  return next;
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

module.exports = { readCollection, writeCollection, uid, DATA_DIR };
