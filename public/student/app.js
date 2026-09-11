const API = '/api';
let TOKEN = localStorage.getItem('studentToken') || '';
let ME = null;
let currentBlobUrl = null; // revoked whenever the viewer closes

function authHeaders(extra) { return { Authorization: 'Bearer ' + TOKEN, ...(extra || {}) }; }

async function apiCall(path, opts = {}) {
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

function showView(name) {
  document.getElementById('view-login').classList.remove('active');
  document.getElementById('view-app').classList.remove('active');
  document.getElementById('view-' + name).classList.add('active');
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- Login ---------- */

(async function loadClassOptions() {
  try {
    const data = await apiCall('/auth/classes-public');
    document.getElementById('loginClass').innerHTML = data.classes.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('') || '<option value="">No classes yet</option>';
  } catch (e) {}
})();

async function studentLogin() {
  const classId = document.getElementById('loginClass').value;
  const rollNumber = document.getElementById('loginRoll').value.trim();
  const pin = document.getElementById('loginPin').value.trim();
  const errEl = document.getElementById('loginError');
  errEl.classList.remove('show');
  try {
    const data = await apiCall('/auth/student-login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId, rollNumber, pin })
    });
    TOKEN = data.token;
    localStorage.setItem('studentToken', TOKEN);
    await afterLogin();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.add('show');
  }
}

function logout() {
  localStorage.removeItem('studentToken');
  TOKEN = '';
  showView('login');
}

async function afterLogin() {
  ME = await apiCall('/auth/me', { headers: authHeaders() });
  document.getElementById('welcomeLine').textContent = `${ME.name} · ${ME.className} · Roll ${ME.rollNumber}`;
  showView('app');
  await refreshNotifyButton();
  await loadHomework();

  const openId = new URLSearchParams(location.search).get('open');
  if (openId) openHomework(openId);
}

/* ---------- Homework list ---------- */

async function loadHomework() {
  const data = await apiCall('/homework/mine', { headers: authHeaders() });
  const el = document.getElementById('homeworkList');
  if (data.homework.length === 0) { el.innerHTML = '<p class="hint" style="padding:0 4px;">No homework yet — check back soon!</p>'; return; }
  el.innerHTML = data.homework.map((hw) => {
    const dateStr = new Date(hw.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="card" style="cursor:pointer;" onclick="openHomework('${hw.id}')">
        <div class="row" style="border:none;padding:0;">
          <div class="row-text">
            <div class="row-title">${typeIcon(hw.type)} ${escapeHtml(hw.title)}</div>
            <div class="row-sub">${dateStr}${hw.note ? ' · ' + escapeHtml(hw.note) : ''}</div>
          </div>
          <span class="badge ${hw.seen ? 'seen' : 'unseen'}">${hw.seen ? 'Opened' : 'New'}</span>
        </div>
      </div>`;
  }).join('');
}

function typeIcon(type) {
  return { image: '🖼', video: '🎬', pdf: '📄', html: '📝', file: '📎' }[type] || '📎';
}

/* ---------- Content Viewer ---------- */

function watermarkHtml() {
  const text = `${ME.name} · Roll ${ME.rollNumber} · Do not share`;
  const lines = Array.from({ length: 10 }).map(() => escapeHtml(text)).join('<br>');
  return `<div class="watermark"><span>${lines}</span></div>`;
}

async function openHomework(id) {
  const modal = document.getElementById('viewerModal');
  const body = document.getElementById('viewerBody');
  body.innerHTML = '<p class="hint">Loading…</p>';
  modal.classList.add('open');

  try {
    const { homework: hw } = await apiCall('/homework/' + id, { headers: authHeaders() });
    document.getElementById('viewerTitle').textContent = hw.title;
    apiCall('/homework/' + id + '/seen', { method: 'POST', headers: authHeaders() }).then(loadHomework).catch(() => {});

    if (hw.type === 'html') {
      renderHtmlViewer(body, hw);
    } else {
      const { ticket } = await apiCall('/content/' + id + '/ticket', { headers: authHeaders() });
      const fileUrl = `${API}/content/${id}/file?ticket=${encodeURIComponent(ticket)}`;
      if (hw.type === 'image') await renderImageViewer(body, fileUrl);
      else if (hw.type === 'video') renderVideoViewer(body, fileUrl);
      else if (hw.type === 'pdf') await renderPdfViewer(body, fileUrl);
      else renderGenericFileViewer(body, fileUrl, hw.originalFilename);
    }
  } catch (e) {
    body.innerHTML = `<p class="hint">${escapeHtml(e.message)}</p>`;
  }
}

function closeViewer() {
  document.getElementById('viewerModal').classList.remove('open');
  document.getElementById('viewerBody').innerHTML = '';
  if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; }
}

function renderHtmlViewer(body, hw) {
  body.innerHTML = `${hw.note ? `<p class="hint">${escapeHtml(hw.note)}</p>` : ''}<iframe class="iframe-html" sandbox="allow-scripts" srcdoc="${escapeHtml(hw.htmlContent || '')}"></iframe>`;
}

async function renderImageViewer(body, fileUrl) {
  const res = await fetch(fileUrl);
  const blob = await res.blob();
  currentBlobUrl = URL.createObjectURL(blob);
  body.innerHTML = `<div class="viewer-wrap protected"><img src="${currentBlobUrl}" draggable="false">${watermarkHtml()}</div>
    <p class="hint">This is view-only inside the app — saving or sharing the image isn't available here.</p>`;
}

function renderVideoViewer(body, fileUrl) {
  body.innerHTML = `
    <div class="viewer-wrap protected">
      <video src="${fileUrl}" controls controlsList="nodownload noremoteplayback" disablePictureInPicture playsinline></video>
      ${watermarkHtml()}
    </div>
    <p class="hint">Playing directly from the app — the download option is turned off.</p>`;
}

async function renderPdfViewer(body, fileUrl) {
  body.innerHTML = '<p class="hint">Loading PDF…</p>';
  await loadPdfJs();
  const res = await fetch(fileUrl);
  const buf = await res.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let pageNum = 1;

  body.innerHTML = `
    <div class="viewer-wrap protected" style="background:#fff;"><canvas id="pdfCanvas"></canvas>${watermarkHtml()}</div>
    <div class="pdf-nav">
      <button class="btn ghost small" onclick="pdfChangePage(-1)">◀ Prev</button>
      <span id="pdfPageLabel" class="hint" style="margin:0;">Page 1 / ${pdf.numPages}</span>
      <button class="btn ghost small" onclick="pdfChangePage(1)">Next ▶</button>
    </div>
    <p class="hint">Rendered as an image inside the app — there's no print or save-as-PDF option here.</p>`;

  window._pdfDoc = pdf;
  window._pdfPage = 1;
  await renderPdfPage();
}

async function renderPdfPage() {
  const pdf = window._pdfDoc;
  const page = await pdf.getPage(window._pdfPage);
  const canvas = document.getElementById('pdfCanvas');
  const viewport = page.getViewport({ scale: 1.3 });
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  document.getElementById('pdfPageLabel').textContent = `Page ${window._pdfPage} / ${pdf.numPages}`;
}

function pdfChangePage(delta) {
  const pdf = window._pdfDoc;
  const next = window._pdfPage + delta;
  if (next < 1 || next > pdf.numPages) return;
  window._pdfPage = next;
  renderPdfPage();
}

let pdfJsLoading = null;
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve();
  if (pdfJsLoading) return pdfJsLoading;
  pdfJsLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve();
    };
    s.onerror = () => reject(new Error('Could not load PDF viewer — check your internet connection.'));
    document.head.appendChild(s);
  });
  return pdfJsLoading;
}

function renderGenericFileViewer(body, fileUrl, filename) {
  // No safe in-app renderer exists for this file type (e.g. .docx, .pptx,
  // .zip) — being honest about that rather than pretending otherwise.
  body.innerHTML = `
    <p class="hint">This file type (${escapeHtml(filename)}) can't be previewed inside the app, so it will open in a new tab using your device's normal viewer/app for it — the in-app protections on this page don't apply to that step.</p>
    <div class="btn-row"><a class="btn brass" href="${fileUrl}" target="_blank" rel="noopener">Open File</a></div>`;
}

/* ---------- Push notifications ---------- */

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

async function refreshNotifyButton() {
  const card = document.getElementById('notifyCard');
  const btn = document.getElementById('notifyBtn');
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) { card.style.display = 'none'; return; }
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (sub) { card.style.display = 'none'; return; }
  } catch (e) {}
  btn.disabled = false;
}

async function enableNotifications() {
  const btn = document.getElementById('notifyBtn');
  btn.disabled = true;
  btn.textContent = 'Setting up…';
  try {
    const { publicKey, configured } = await apiCall('/push/vapid-public-key');
    if (!configured) throw new Error('Notifications are not set up on the server yet.');
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notifications permission was not granted.');

    const reg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    const subscription = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
    await apiCall('/push/subscribe', {
      method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ subscription })
    });
    document.getElementById('notifyCard').style.display = 'none';
  } catch (e) {
    alert(e.message);
    btn.disabled = false;
    btn.textContent = '🔔 Enable Notifications';
  }
}

/* ---------- Boot ---------- */

(async function init() {
  if (!TOKEN) { showView('login'); return; }
  try {
    await afterLogin();
  } catch (e) {
    logout();
  }
})();
