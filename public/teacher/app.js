const API = '/api';
let TOKEN = localStorage.getItem('teacherToken') || '';
let CLASSES = [];

function authHeaders(extra) {
  return { Authorization: 'Bearer ' + TOKEN, ...(extra || {}) };
}

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

function showTab(name) {
  document.querySelectorAll('#view-app .view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
  document.getElementById('tabview-' + name).classList.add('active');
  const btn = document.getElementById('tab-' + name);
  if (btn) btn.classList.add('active');
  if (name === 'classes') loadClassesAndStudents();
  if (name === 'history') loadHistory();
}

async function teacherLogin() {
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.classList.remove('show');
  try {
    const data = await apiCall('/auth/teacher-login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    TOKEN = data.token;
    localStorage.setItem('teacherToken', TOKEN);
    await afterLogin();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.add('show');
  }
}

function logout() {
  localStorage.removeItem('teacherToken');
  TOKEN = '';
  showView('login');
}

async function afterLogin() {
  showView('app');
  await loadClassesForPickers();
  showTab('send');
}

/* ---------- Classes & Students ---------- */

async function loadClassesForPickers() {
  const data = await apiCall('/classes', { headers: authHeaders() });
  CLASSES = data.classes;
  const opts = CLASSES.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${c.studentCount})</option>`).join('');
  document.getElementById('hwClassSelect').innerHTML = opts || '<option value="">No classes yet</option>';
  document.getElementById('hwStudentClassSelect').innerHTML = opts || '<option value="">No classes yet</option>';
  document.getElementById('studentsClassFilter').innerHTML = opts || '<option value="">No classes yet</option>';
}

async function loadClassesAndStudents() {
  await loadClassesForPickers();
  renderClassesList();
  renderStudentsForClass();
}

function renderClassesList() {
  const el = document.getElementById('classesList');
  if (CLASSES.length === 0) { el.innerHTML = '<p class="hint">No classes yet — add one above.</p>'; return; }
  el.innerHTML = CLASSES.map((c) => `
    <div class="row">
      <div class="row-text"><div class="row-title">${escapeHtml(c.name)}</div><div class="row-sub">${c.studentCount} student(s)</div></div>
      <button class="btn rust small" onclick="deleteClass('${c.id}')">🗑</button>
    </div>`).join('');
}

async function createClass() {
  const name = document.getElementById('newClassName').value.trim();
  if (!name) return;
  try {
    await apiCall('/classes', { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ name }) });
    document.getElementById('newClassName').value = '';
    await loadClassesAndStudents();
  } catch (e) { alert(e.message); }
}

async function deleteClass(id) {
  if (!confirm('Delete this class?')) return;
  try {
    await apiCall('/classes/' + id, { method: 'DELETE', headers: authHeaders() });
    await loadClassesAndStudents();
  } catch (e) { alert(e.message); }
}

async function renderStudentsForClass() {
  const classId = document.getElementById('studentsClassFilter').value;
  const el = document.getElementById('studentsList');
  if (!classId) { el.innerHTML = ''; return; }
  const data = await apiCall('/students?classId=' + classId, { headers: authHeaders() });
  if (data.students.length === 0) { el.innerHTML = '<p class="hint">No students in this class yet.</p>'; return; }
  el.innerHTML = data.students.map((s) => `
    <div class="row">
      <div class="row-text"><div class="row-title">${escapeHtml(s.name)}</div><div class="row-sub">Roll ${escapeHtml(s.rollNumber)}</div></div>
      <button class="btn ghost small" onclick="resetPin('${s.id}','${escapeHtml(s.name)}','${escapeHtml(s.rollNumber)}')">🔑 Reset PIN</button>
      <button class="btn rust small" onclick="deleteStudent('${s.id}')">🗑</button>
    </div>`).join('');
}

async function createStudent() {
  const classId = document.getElementById('studentsClassFilter').value;
  const name = document.getElementById('newStudentName').value.trim();
  const rollNumber = document.getElementById('newStudentRoll').value.trim();
  if (!classId) { alert('Pick a class first.'); return; }
  if (!name || !rollNumber) { alert('Enter name and roll number.'); return; }
  try {
    const data = await apiCall('/students', { method: 'POST', headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ classId, name, rollNumber }) });
    document.getElementById('newStudentName').value = '';
    document.getElementById('newStudentRoll').value = '';
    await renderStudentsForClass();
    await loadClassesForPickers();
    showPinModal(data.student, data.pin);
  } catch (e) { alert(e.message); }
}

async function resetPin(id, name, roll) {
  if (!confirm(`Reset the PIN for ${name}? Their old PIN will stop working.`)) return;
  try {
    const data = await apiCall('/students/' + id + '/reset-pin', { method: 'POST', headers: authHeaders() });
    showPinModal(data.student, data.pin);
  } catch (e) { alert(e.message); }
}

async function deleteStudent(id) {
  if (!confirm('Remove this student? They will lose access to all homework.')) return;
  try {
    await apiCall('/students/' + id, { method: 'DELETE', headers: authHeaders() });
    await renderStudentsForClass();
    await loadClassesForPickers();
  } catch (e) { alert(e.message); }
}

function showPinModal(student, pin) {
  const cls = CLASSES.find((c) => c.id === student.classId);
  document.getElementById('pinRevealContent').innerHTML = `
    <p><b>${escapeHtml(student.name)}</b> — ${cls ? escapeHtml(cls.name) : ''}, Roll ${escapeHtml(student.rollNumber)}</p>
    <p>PIN: <b>${escapeHtml(pin)}</b></p>`;
  document.getElementById('pinModal').classList.add('open');
}
function closePinModal() { document.getElementById('pinModal').classList.remove('open'); }

/* ---------- Send Homework ---------- */

function onTargetTypeChange() {
  const type = document.getElementById('hwTargetType').value;
  document.getElementById('hwClassPicker').style.display = type === 'class' ? 'block' : 'none';
  document.getElementById('hwStudentPicker').style.display = type === 'students' ? 'block' : 'none';
  if (type === 'students') loadStudentCheckboxes();
}

async function loadStudentCheckboxes() {
  const classId = document.getElementById('hwStudentClassSelect').value;
  const el = document.getElementById('hwStudentCheckboxes');
  if (!classId) { el.innerHTML = ''; return; }
  const data = await apiCall('/students?classId=' + classId, { headers: authHeaders() });
  el.innerHTML = data.students.map((s) => `
    <div class="checkbox-row"><input type="checkbox" value="${s.id}" id="stu-${s.id}"><label for="stu-${s.id}" style="margin:0;font-weight:400;">${escapeHtml(s.name)} (Roll ${escapeHtml(s.rollNumber)})</label></div>
  `).join('') || '<p class="hint">No students in this class.</p>';
}

function setContentMode(mode) {
  document.getElementById('contentFileArea').style.display = mode === 'file' ? 'block' : 'none';
  document.getElementById('contentHtmlArea').style.display = mode === 'html' ? 'block' : 'none';
  document.getElementById('contentModeFileBtn').classList.toggle('brass', mode === 'file');
  document.getElementById('contentModeHtmlBtn').classList.toggle('brass', mode === 'html');
}
setContentMode('file');

async function sendHomework() {
  const errEl = document.getElementById('sendHwError');
  const statusEl = document.getElementById('sendHwStatus');
  errEl.classList.remove('show');
  statusEl.textContent = '';

  const title = document.getElementById('hwTitle').value.trim();
  const note = document.getElementById('hwNote').value.trim();
  const targetType = document.getElementById('hwTargetType').value;
  const file = document.getElementById('hwFile').files[0];
  const htmlContent = document.getElementById('hwHtmlContent').value;

  const fd = new FormData();
  fd.append('title', title);
  fd.append('note', note);
  fd.append('targetType', targetType);
  if (targetType === 'class') {
    fd.append('targetClassId', document.getElementById('hwClassSelect').value);
  } else {
    const ids = [...document.querySelectorAll('#hwStudentCheckboxes input:checked')].map((c) => c.value);
    fd.append('targetStudentIds', JSON.stringify(ids));
  }
  if (file) fd.append('file', file);
  if (htmlContent.trim()) fd.append('htmlContent', htmlContent);

  const btn = document.getElementById('sendHwBtn');
  btn.disabled = true;
  btn.textContent = 'Sending…';
  try {
    await apiCall('/homework', { method: 'POST', headers: authHeaders(), body: fd });
    document.getElementById('hwTitle').value = '';
    document.getElementById('hwNote').value = '';
    document.getElementById('hwFile').value = '';
    document.getElementById('hwHtmlContent').value = '';
    statusEl.textContent = '✓ Sent! Students with notifications enabled will be alerted.';
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = '📤 Send';
  }
}

/* ---------- History ---------- */

async function loadHistory() {
  const el = document.getElementById('historyList');
  const data = await apiCall('/homework', { headers: authHeaders() });
  if (data.homework.length === 0) { el.innerHTML = '<p class="hint" style="padding:0 16px;">Nothing sent yet.</p>'; return; }
  el.innerHTML = data.homework.map((hw) => {
    const dateStr = new Date(hw.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
    const target = hw.targetType === 'class' ? (CLASSES.find((c) => c.id === hw.targetClassId) || {}).name || 'a class' : `${hw.targetStudentIds.length} student(s)`;
    return `
      <div class="card">
        <div class="row-title">${escapeHtml(hw.title)}</div>
        <div class="row-sub">${dateStr} · Sent to ${escapeHtml(target)} · ${typeIcon(hw.type)} ${hw.type}</div>
        <div class="row-sub">👁 Seen by ${hw.seenCount}/${hw.recipientCount}</div>
        <div class="btn-row"><button class="btn rust small" onclick="deleteHomework('${hw.id}')">🗑 Delete</button></div>
      </div>`;
  }).join('');
}

function typeIcon(type) {
  return { image: '🖼', video: '🎬', pdf: '📄', html: '📝', file: '📎' }[type] || '📎';
}

async function deleteHomework(id) {
  if (!confirm('Delete this homework for everyone?')) return;
  try {
    await apiCall('/homework/' + id, { method: 'DELETE', headers: authHeaders() });
    loadHistory();
  } catch (e) { alert(e.message); }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- Boot ---------- */

(async function init() {
  if (!TOKEN) { showView('login'); return; }
  try {
    await apiCall('/auth/me', { headers: authHeaders() });
    await afterLogin();
  } catch (e) {
    logout();
  }
})();
