// ============================================
// Silverhawk Submission - Main Application (v2)
// Ownership + Sharing + Reject + Public + Student Password
// ============================================

let sb = null;

try {
  if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('YOUR_PROJECT')) {
    console.error('Config belum diisi. Buka file js/config.js');
  } else {
    sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
} catch (err) {
  console.error('Gagal inisialisasi Supabase:', err);
}

// State
let currentUser = null;
let currentRole = null;
let selectedTaskId = null;
let selectedStudentId = null;
let pastedImageBase64 = null;
let classesCache = [];
let studentsCache = [];
let studentAuthenticated = false; // setelah password benar

// ========== UTILS ==========
function toast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}
function show(el) { const e = document.getElementById(el); if (e) e.classList.remove('hidden'); }
function hide(el) { const e = document.getElementById(el); if (e) e.classList.add('hidden'); }

async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'silverhawk-salt-v1');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function compressImage(fileOrBlob, maxWidth = (CONFIG && CONFIG.IMAGE_MAX_WIDTH) || 900, quality = (CONFIG && CONFIG.IMAGE_QUALITY) || 0.72) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(fileOrBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width, h = img.height;
      if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

// ========== AUTH ==========
async function checkSession() {
  if (!sb) return showStudent();
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    const { data } = await sb.from('profiles').select('*').eq('id', currentUser.id).single();
    currentRole = data?.role || 'teacher';
    showDashboard();
  } else {
    showStudent();
  }
}

async function doLogin() {
  if (!sb) return toast('Config Supabase belum diisi');
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) return toast('Isi email & password');
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) return toast(error.message);
  toast('Berhasil masuk');
  await checkSession();
}

async function doLogout() {
  if (!sb) return;
  await sb.auth.signOut();
  currentUser = null;
  currentRole = null;
  showStudent();
  toast('Logout berhasil');
}

function showLogin() {
  hide('studentView'); hide('dashboardView'); show('loginView');
}

function showStudent() {
  hide('loginView'); hide('dashboardView'); show('studentView');
  studentAuthenticated = false;
  document.getElementById('authArea').innerHTML =
    `<button class="btn btn-outline btn-sm" onclick="showLogin()">Login Guru</button>`;
  loadClasses();
}

function showDashboard() {
  hide('studentView'); hide('loginView'); show('dashboardView');
  document.getElementById('authArea').innerHTML = `
    <span style="margin-right:1rem;color:var(--muted);font-size:.9rem">
      ${currentRole === 'admin' ? 'Admin' : 'Guru'}
    </span>
    <button class="btn btn-outline btn-sm" onclick="doLogout()">Logout</button>`;
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', currentRole !== 'admin');
  });
  loadDashboard();
}

// Tabs
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      const target = document.getElementById('tab-' + tab.dataset.tab);
      if (target) target.classList.remove('hidden');
      if (tab.dataset.tab === 'submissions') loadSubmissions();
      if (tab.dataset.tab === 'teachers') loadTeachers();
      if (tab.dataset.tab === 'overview') loadOverview();
      if (tab.dataset.tab === 'classes') loadClassStudentList();
      if (tab.dataset.tab === 'tasks') loadTaskManageList();
      if (tab.dataset.tab === 'access') loadAccessPanel();
    });
  });
});

// ========== STUDENT FLOW ==========
async function loadClasses() {
  if (!sb) return;
  const { data } = await sb.from('classes').select('*').order('name');
  classesCache = data || [];
  const sel = document.getElementById('studentClass');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- pilih kelas --</option>' +
    classesCache.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

async function loadStudents() {
  if (!sb) return;
  const classId = document.getElementById('studentClass').value;
  const nameSel = document.getElementById('studentName');
  if (!classId) {
    nameSel.innerHTML = '<option value="">-- pilih kelas dulu --</option>';
    nameSel.disabled = true;
    hide('taskListArea'); hide('submitArea'); hide('studentPasswordArea');
    return;
  }
  const { data } = await sb.from('students').select('*').eq('class_id', classId).order('name');
  studentsCache = data || [];
  nameSel.innerHTML = '<option value="">-- pilih nama --</option>' +
    studentsCache.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  nameSel.disabled = false;
  hide('taskListArea'); hide('submitArea'); hide('studentPasswordArea');
  studentAuthenticated = false;
}

async function onStudentNameChange() {
  selectedStudentId = document.getElementById('studentName').value;
  if (!selectedStudentId) {
    hide('taskListArea'); hide('studentPasswordArea');
    return;
  }
  const student = studentsCache.find(s => s.id === selectedStudentId);
  if (!student) return;

  // Cek apakah sudah punya password
  if (student.password_hash) {
    // Minta password
    show('studentPasswordArea');
    hide('taskListArea');
    document.getElementById('studentPassInput').value = '';
    document.getElementById('studentPassInput').focus();
    studentAuthenticated = false;
  } else {
    // Belum punya password → tawarkan pasang
    show('studentPasswordArea');
    hide('taskListArea');
    document.getElementById('studentPasswordArea').innerHTML = `
      <div class="card">
        <h3 style="margin-bottom:0.75rem">Keamanan Akun</h3>
        <p style="color:var(--muted);font-size:0.9rem;margin-bottom:1rem">
          Nama ini belum dipasang password. Disarankan memasang password agar teman tidak bisa iseng.
        </p>
        <div class="form-group">
          <label>Password baru (min 4 karakter)</label>
          <input type="password" id="newStudentPass" placeholder="Buat password" />
        </div>
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap">
          <button class="btn btn-sm" onclick="setStudentPassword()">Pasang Password</button>
          <button class="btn btn-outline btn-sm" onclick="skipStudentPassword()">Lewati (tanpa password)</button>
        </div>
      </div>`;
  }
}

async function setStudentPassword() {
  const pass = document.getElementById('newStudentPass')?.value || '';
  if (pass.length < 4) return toast('Password minimal 4 karakter');
  const hash = await hashPassword(pass);
  const { error } = await sb.from('students').update({ password_hash: hash }).eq('id', selectedStudentId);
  if (error) return toast(error.message);
  toast('Password berhasil dipasang');
  studentAuthenticated = true;
  // update cache
  const s = studentsCache.find(x => x.id === selectedStudentId);
  if (s) s.password_hash = hash;
  hide('studentPasswordArea');
  loadStudentTasks();
}

function skipStudentPassword() {
  studentAuthenticated = true;
  hide('studentPasswordArea');
  loadStudentTasks();
}

async function verifyStudentPassword() {
  const pass = document.getElementById('studentPassInput')?.value || '';
  if (!pass) return toast('Masukkan password');
  const hash = await hashPassword(pass);
  const student = studentsCache.find(s => s.id === selectedStudentId);
  if (!student || student.password_hash !== hash) {
    return toast('Password salah');
  }
  studentAuthenticated = true;
  toast('Password benar');
  hide('studentPasswordArea');
  loadStudentTasks();
}

async function loadStudentTasks() {
  if (!sb || !selectedStudentId || !studentAuthenticated) return;
  const classId = document.getElementById('studentClass').value;
  const { data: tasks } = await sb.from('tasks').select('*').eq('class_id', classId).order('created_at', { ascending: false });
  const { data: subs } = await sb.from('submissions').select('task_id, status, grade, reject_reason').eq('student_id', selectedStudentId);
  const subMap = {};
  (subs || []).forEach(s => { subMap[s.task_id] = s; });

  const list = document.getElementById('taskList');
  if (!tasks?.length) {
    list.innerHTML = '<div class="empty">Belum ada tugas untuk kelas ini</div>';
  } else {
    list.innerHTML = tasks.map(t => {
      const sub = subMap[t.id];
      let badge = '<span class="badge badge-warning">Belum</span>';
      let action = `<button class="btn btn-sm" onclick="startSubmit('${t.id}','${t.title.replace(/'/g, "\\'")}')">Kumpulkan</button>`;
      if (sub) {
        if (sub.status === 'rejected') {
          badge = `<span class="badge badge-danger">Ditolak</span>`;
          action = `<button class="btn btn-sm" onclick="startSubmit('${t.id}','${t.title.replace(/'/g, "\\'")}')">Kirim Ulang</button>`;
          if (sub.reject_reason) action += `<div style="font-size:0.8rem;color:var(--danger);margin-top:0.3rem">${sub.reject_reason}</div>`;
        } else if (sub.status === 'graded' || sub.grade != null) {
          badge = `<span class="badge badge-success">Nilai: ${sub.grade ?? '-'}</span>`;
          action = '';
        } else {
          badge = `<span class="badge badge-success">✓ Sudah</span>`;
          action = '';
        }
      }
      return `
        <div class="card task-item">
          <div>
            <div style="font-weight:600">${t.title}</div>
            ${t.description ? `<div style="font-size:.85rem;color:var(--muted)">${t.description}</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:0.4rem">
            ${badge}
            ${action}
          </div>
        </div>`;
    }).join('');
  }
  show('taskListArea');
  hide('submitArea');
}

function startSubmit(taskId, title) {
  selectedTaskId = taskId;
  document.getElementById('currentTaskTitle').textContent = title;
  pastedImageBase64 = null;
  document.getElementById('preview').classList.add('hidden');
  document.getElementById('btnSubmit').disabled = true;
  show('submitArea');
  document.getElementById('pasteZone')?.focus();
}

function cancelSubmit() {
  hide('submitArea');
  selectedTaskId = null;
  pastedImageBase64 = null;
}

// Paste
document.addEventListener('DOMContentLoaded', () => {
  const pasteZone = document.getElementById('pasteZone');
  if (pasteZone) {
    pasteZone.addEventListener('paste', async (e) => {
      e.preventDefault();
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          pastedImageBase64 = await compressImage(blob);
          const preview = document.getElementById('preview');
          preview.src = pastedImageBase64;
          preview.classList.remove('hidden');
          document.getElementById('btnSubmit').disabled = false;
          toast('Screenshot siap dikirim');
          break;
        }
      }
    });
    pasteZone.addEventListener('click', () => pasteZone.focus());
  }
});

async function submitTask() {
  if (!sb || !pastedImageBase64 || !selectedTaskId || !selectedStudentId) return;
  document.getElementById('btnSubmit').disabled = true;
  const { error } = await sb.from('submissions').upsert({
    student_id: selectedStudentId,
    task_id: selectedTaskId,
    image_data: pastedImageBase64,
    status: 'submitted',
    reject_reason: null,
    grade: null
  }, { onConflict: 'student_id,task_id' });
  if (error) {
    toast(error.message);
    document.getElementById('btnSubmit').disabled = false;
    return;
  }
  toast('Tugas berhasil dikumpulkan!');
  cancelSubmit();
  loadStudentTasks();
}

// ========== DASHBOARD ==========
async function loadDashboard() {
  await loadClassesForTeacher();
  loadOverview();
}

async function loadClassesForTeacher() {
  if (!sb) return;
  // Ambil kelas yang dimiliki + yang di-share
  let query = sb.from('classes').select('*').order('name');
  const { data } = await query;
  // Filter di client untuk keamanan ekstra
  if (currentRole !== 'admin') {
    const { data: access } = await sb.from('class_access').select('class_id').eq('teacher_id', currentUser.id);
    const accessIds = new Set((access || []).map(a => a.class_id));
    classesCache = (data || []).filter(c => c.created_by === currentUser.id || accessIds.has(c.id));
  } else {
    classesCache = data || [];
  }

  ['addStudentClass', 'newTaskClass', 'filterClass', 'shareClassSelect'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = '<option value="">-- pilih --</option>' +
        classesCache.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    }
  });
}

async function loadOverview() {
  if (!sb) return;
  const classIds = classesCache.map(c => c.id);
  if (!classIds.length && currentRole !== 'admin') {
    document.getElementById('statsCards').innerHTML = `
      <div class="stat-card"><div class="num">0</div><div>Kelas</div></div>
      <div class="stat-card"><div class="num">0</div><div>Siswa</div></div>
      <div class="stat-card"><div class="num">0</div><div>Tugas</div></div>
      <div class="stat-card"><div class="num">0</div><div>Pengumpulan</div></div>`;
    document.getElementById('missingList').innerHTML = '<div class="empty">Belum ada kelas. Buat kelas terlebih dahulu.</div>';
    return;
  }

  let studentQ = sb.from('students').select('id');
  let taskQ = sb.from('tasks').select('id');
  let subQ = sb.from('submissions').select('id');
  if (currentRole !== 'admin' && classIds.length) {
    studentQ = studentQ.in('class_id', classIds);
    taskQ = taskQ.in('class_id', classIds);
  }

  const [{ data: students }, { data: tasks }, { data: subs }] = await Promise.all([
    studentQ, taskQ, subQ
  ]);

  document.getElementById('statsCards').innerHTML = `
    <div class="stat-card"><div class="num">${classesCache.length}</div><div>Kelas</div></div>
    <div class="stat-card"><div class="num">${students?.length || 0}</div><div>Siswa</div></div>
    <div class="stat-card"><div class="num">${tasks?.length || 0}</div><div>Tugas</div></div>
    <div class="stat-card"><div class="num">${subs?.length || 0}</div><div>Pengumpulan</div></div>`;

  // Missing
  const { data: allTasks } = await sb.from('tasks').select('id,title,class_id').in('class_id', classIds.length ? classIds : ['00000000-0000-0000-0000-000000000000']);
  const { data: allStudents } = await sb.from('students').select('id,name,class_id').in('class_id', classIds.length ? classIds : ['00000000-0000-0000-0000-000000000000']);
  const { data: allSubs } = await sb.from('submissions').select('student_id,task_id,status');
  const submittedSet = new Set((allSubs || []).filter(s => s.status !== 'rejected').map(s => s.student_id + '_' + s.task_id));

  let missingHtml = '';
  (allTasks || []).forEach(task => {
    const classStudents = (allStudents || []).filter(s => s.class_id === task.class_id);
    const belum = classStudents.filter(s => !submittedSet.has(s.id + '_' + task.id));
    if (belum.length) {
      missingHtml += `<div style="margin-bottom:1rem"><strong>${task.title}</strong>
        <div style="color:var(--muted);font-size:.9rem;margin-top:.3rem">${belum.map(s => s.name).join(', ')}</div></div>`;
    }
  });
  document.getElementById('missingList').innerHTML = missingHtml || '<div class="empty">Semua siswa sudah mengumpulkan 🎉</div>';
}

async function addClass() {
  if (!sb) return;
  const name = document.getElementById('newClassName').value.trim();
  if (!name) return toast('Isi nama kelas');
  const { error } = await sb.from('classes').insert({ name, created_by: currentUser.id });
  if (error) return toast(error.message);
  toast('Kelas ditambahkan');
  document.getElementById('newClassName').value = '';
  loadClassesForTeacher();
  loadClassStudentList();
}

async function addStudent() {
  if (!sb) return;
  const classId = document.getElementById('addStudentClass').value;
  const name = document.getElementById('newStudentName').value.trim();
  if (!classId || !name) return toast('Lengkapi data');
  const { error } = await sb.from('students').insert({ class_id: classId, name });
  if (error) return toast(error.message);
  toast('Siswa ditambahkan');
  document.getElementById('newStudentName').value = '';
  loadClassStudentList();
}

async function loadClassStudentList() {
  if (!sb) return;
  const classIds = classesCache.map(c => c.id);
  if (!classIds.length) {
    document.getElementById('classStudentList').innerHTML = '<div class="empty">Belum ada kelas</div>';
    return;
  }
  const { data: classes } = await sb.from('classes').select('*, students(*)').in('id', classIds).order('name');
  let html = '';
  (classes || []).forEach(c => {
    const isOwner = c.created_by === currentUser.id || currentRole === 'admin';
    html += `<div style="margin-bottom:1.5rem;padding-bottom:1rem;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">
        <strong>${c.name}</strong>
        <div style="display:flex;gap:0.4rem">
          ${isOwner ? `<button class="btn btn-sm btn-outline" onclick="openShareModal('${c.id}','${c.name.replace(/'/g,"\\'")}')">Bagikan Akses</button>` : ''}
          ${isOwner ? `<button class="btn btn-sm btn-danger" onclick="deleteClass('${c.id}')">Hapus Kelas</button>` : ''}
        </div>
      </div>
      <div style="margin-top:0.5rem;font-size:0.9rem">
        ${(c.students || []).map(s => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:0.3rem 0">
            <span>${s.name} ${s.password_hash ? '🔒' : ''}</span>
            <div>
              ${s.password_hash ? `<button class="btn btn-sm btn-outline" onclick="resetStudentPassword('${s.id}','${s.name.replace(/'/g,"\\'")}')">Reset Pass</button>` : ''}
              <button class="btn btn-sm btn-danger" onclick="deleteStudent('${s.id}')">Hapus</button>
            </div>
          </div>`).join('') || '<span style="color:var(--muted)">Belum ada siswa</span>'}
      </div>
    </div>`;
  });
  document.getElementById('classStudentList').innerHTML = html || '<div class="empty">Belum ada kelas</div>';
}

async function deleteClass(id) {
  if (!confirm('Hapus kelas ini beserta semua siswa & tugasnya?')) return;
  await sb.from('classes').delete().eq('id', id);
  toast('Kelas dihapus');
  loadClassesForTeacher();
  loadClassStudentList();
}

async function deleteStudent(id) {
  if (!confirm('Hapus siswa ini?')) return;
  await sb.from('students').delete().eq('id', id);
  toast('Siswa dihapus');
  loadClassStudentList();
}

async function resetStudentPassword(id, name) {
  if (!confirm(`Reset password untuk ${name}?`)) return;
  const { error } = await sb.from('students').update({ password_hash: null }).eq('id', id);
  if (error) return toast(error.message);
  toast('Password berhasil di-reset');
  loadClassStudentList();
}

// Share Access
function openShareModal(classId, className) {
  const modal = document.getElementById('shareModal');
  if (!modal) return;
  document.getElementById('shareClassId').value = classId;
  document.getElementById('shareClassName').textContent = className;
  loadTeachersForShare();
  loadCurrentAccess(classId);
  modal.classList.add('show');
}

function closeShareModal() {
  document.getElementById('shareModal')?.classList.remove('show');
}

async function loadTeachersForShare() {
  const { data } = await sb.from('profiles').select('id, username, full_name, role').neq('id', currentUser.id);
  const sel = document.getElementById('shareTeacherSelect');
  if (!sel) return;
  sel.innerHTML = '<option value="">-- pilih guru --</option>' +
    (data || []).filter(t => t.role !== 'admin' || currentRole === 'admin')
      .map(t => `<option value="${t.id}">${t.full_name || t.username}</option>`).join('');
}

async function loadCurrentAccess(classId) {
  const { data } = await sb.from('class_access').select('*, profiles(full_name, username)').eq('class_id', classId);
  const list = document.getElementById('currentAccessList');
  if (!list) return;
  list.innerHTML = (data || []).map(a => `
    <div class="list-row">
      <div>${a.profiles?.full_name || a.profiles?.username || 'Guru'}
        <div style="font-size:0.8rem;color:var(--muted)">
          Edit: ${a.can_edit ? 'Ya' : 'Tidak'} · Nilai: ${a.can_grade ? 'Ya' : 'Tidak'} · Hapus: ${a.can_delete ? 'Ya' : 'Tidak'}
        </div>
      </div>
      <button class="btn btn-sm btn-danger" onclick="revokeAccess('${a.id}')">Cabut</button>
    </div>`).join('') || '<div class="empty" style="padding:1rem">Belum ada guru yang diberi akses</div>';
}

async function grantAccess() {
  const classId = document.getElementById('shareClassId').value;
  const teacherId = document.getElementById('shareTeacherSelect').value;
  const canEdit = document.getElementById('shareCanEdit').checked;
  const canGrade = document.getElementById('shareCanGrade').checked;
  const canDelete = document.getElementById('shareCanDelete').checked;
  if (!teacherId) return toast('Pilih guru');
  const { error } = await sb.from('class_access').upsert({
    class_id: classId,
    teacher_id: teacherId,
    can_edit: canEdit,
    can_grade: canGrade,
    can_delete: canDelete,
    granted_by: currentUser.id
  }, { onConflict: 'class_id,teacher_id' });
  if (error) return toast(error.message);
  toast('Akses diberikan');
  loadCurrentAccess(classId);
}

async function revokeAccess(id) {
  if (!confirm('Cabut akses ini?')) return;
  await sb.from('class_access').delete().eq('id', id);
  toast('Akses dicabut');
  const classId = document.getElementById('shareClassId').value;
  loadCurrentAccess(classId);
}

// Tasks
async function addTask() {
  if (!sb) return;
  const classId = document.getElementById('newTaskClass').value;
  const title = document.getElementById('newTaskTitle').value.trim();
  const desc = document.getElementById('newTaskDesc').value.trim();
  if (!classId || !title) return toast('Lengkapi data');
  const { error } = await sb.from('tasks').insert({
    class_id: classId, title, description: desc || null, created_by: currentUser.id, is_public: false
  });
  if (error) return toast(error.message);
  toast('Tugas dibuat');
  document.getElementById('newTaskTitle').value = '';
  document.getElementById('newTaskDesc').value = '';
  loadTaskManageList();
}

async function loadTaskManageList() {
  if (!sb) return;
  const classIds = classesCache.map(c => c.id);
  if (!classIds.length) {
    document.getElementById('taskManageList').innerHTML = '<div class="empty">Belum ada kelas</div>';
    return;
  }
  const { data } = await sb.from('tasks').select('*, classes(name)').in('class_id', classIds).order('created_at', { ascending: false });
  document.getElementById('taskManageList').innerHTML = (data || []).map(t => `
    <div class="list-row">
      <div>
        <strong>${t.title}</strong>
        <span style="color:var(--muted);font-size:.85rem"> • ${t.classes?.name || ''}</span>
        ${t.is_public ? '<span class="badge badge-success" style="margin-left:0.5rem">Publik</span>' : ''}
      </div>
      <div style="display:flex;gap:0.4rem">
        <button class="btn btn-sm btn-outline" onclick="toggleTaskPublic('${t.id}', ${!t.is_public})">
          ${t.is_public ? 'Nonaktifkan Publik' : 'Jadikan Publik'}
        </button>
        <button class="btn btn-sm btn-danger" onclick="deleteTask('${t.id}')">Hapus</button>
      </div>
    </div>`).join('') || '<div class="empty">Belum ada tugas</div>';
}

async function toggleTaskPublic(id, makePublic) {
  const { error } = await sb.from('tasks').update({ is_public: makePublic }).eq('id', id);
  if (error) return toast(error.message);
  toast(makePublic ? 'Tugas sekarang publik' : 'Tugas tidak lagi publik');
  loadTaskManageList();
}

async function deleteTask(id) {
  if (!confirm('Hapus tugas ini beserta semua pengumpulannya?')) return;
  await sb.from('tasks').delete().eq('id', id);
  toast('Tugas dihapus');
  loadTaskManageList();
}

// Submissions
async function loadSubmissions() {
  if (!sb) return;
  const classId = document.getElementById('filterClass').value;
  const taskId = document.getElementById('filterTask').value;

  if (classId) {
    const { data: tasks } = await sb.from('tasks').select('id,title').eq('class_id', classId);
    document.getElementById('filterTask').innerHTML = '<option value="">Semua tugas</option>' +
      (tasks || []).map(t => `<option value="${t.id}">${t.title}</option>`).join('');
  }

  let query = sb.from('submissions')
    .select('*, students(name, class_id), tasks(title, is_public, class_id)')
    .order('submitted_at', { ascending: false });

  if (taskId) query = query.eq('task_id', taskId);
  else if (classId) {
    const { data: tasks } = await sb.from('tasks').select('id').eq('class_id', classId);
    const ids = (tasks || []).map(t => t.id);
    if (ids.length) query = query.in('task_id', ids);
    else {
      document.getElementById('submissionTable').innerHTML = '<div class="empty">Tidak ada data</div>';
      return;
    }
  }

  const { data } = await query;
  if (!data?.length) {
    document.getElementById('submissionTable').innerHTML = '<div class="empty">Belum ada pengumpulan</div>';
    return;
  }

  document.getElementById('submissionTable').innerHTML = `
    <div style="overflow-x:auto">
      <table>
        <thead><tr>
          <th>Siswa</th><th>Tugas</th><th>Screenshot</th><th>Status / Nilai</th><th>Aksi</th>
        </tr></thead>
        <tbody>
          ${data.map(s => {
            let statusHtml = '';
            if (s.status === 'rejected') statusHtml = `<span class="badge badge-danger">Ditolak</span><div style="font-size:0.8rem;color:var(--danger)">${s.reject_reason || ''}</div>`;
            else if (s.grade != null) statusHtml = `<span class="badge badge-success">${s.grade}</span>`;
            else statusHtml = `<span class="badge badge-muted">Belum dinilai</span>`;
            return `
            <tr>
              <td>${s.students?.name || '-'}</td>
              <td>${s.tasks?.title || '-'}</td>
              <td><img class="thumb" src="${s.image_data}" onclick="showPopup(this.src)" alt="ss" /></td>
              <td>${statusHtml}</td>
              <td style="white-space:nowrap">
                <button class="btn btn-sm btn-outline" onclick="gradeSubmission('${s.id}', ${s.grade ?? 'null'})">Nilai</button>
                <button class="btn btn-sm btn-outline" style="border-color:var(--warning);color:var(--warning)" onclick="rejectSubmission('${s.id}')">Tolak</button>
                ${currentRole === 'admin' ? `<button class="btn btn-sm btn-danger" onclick="deleteSubmission('${s.id}')">Hapus</button>` : ''}
              </td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>`;
}

function showPopup(src) {
  document.getElementById('popupImg').src = src;
  document.getElementById('imgPopup').classList.add('show');
}
function closePopup() {
  document.getElementById('imgPopup').classList.remove('show');
}

async function gradeSubmission(id, current) {
  const grade = prompt('Masukkan nilai (0-100):', current ?? '');
  if (grade === null) return;
  const notes = prompt('Catatan (opsional):') || null;
  const { error } = await sb.from('submissions').update({
    grade: parseFloat(grade) || null,
    notes,
    status: 'graded',
    reject_reason: null,
    graded_by: currentUser.id
  }).eq('id', id);
  if (error) return toast(error.message);
  toast('Nilai disimpan');
  loadSubmissions();
}

async function rejectSubmission(id) {
  const reason = prompt('Alasan penolakan:');
  if (reason === null) return;
  const { error } = await sb.from('submissions').update({
    status: 'rejected',
    reject_reason: reason || 'Ditolak',
    grade: null,
    graded_by: currentUser.id
  }).eq('id', id);
  if (error) return toast(error.message);
  toast('Tugas ditolak');
  loadSubmissions();
}

async function deleteSubmission(id) {
  if (!confirm('Hapus screenshot ini?')) return;
  await sb.from('submissions').delete().eq('id', id);
  toast('Dihapus');
  loadSubmissions();
}

// Teachers (Admin)
async function addTeacher() {
  if (!sb) return;
  const email = document.getElementById('newTeacherEmail').value.trim();
  const pass = document.getElementById('newTeacherPass').value;
  const username = document.getElementById('newTeacherUser').value.trim();
  const full_name = document.getElementById('newTeacherName').value.trim();
  if (!email || !pass || !username) return toast('Lengkapi data');
  const { error } = await sb.auth.signUp({
    email, password: pass,
    options: { data: { username, full_name, role: 'teacher' } }
  });
  if (error) return toast(error.message);
  toast('Akun guru dibuat');
  loadTeachers();
}

async function loadTeachers() {
  if (!sb) return;
  const { data } = await sb.from('profiles').select('*').order('created_at');
  document.getElementById('teacherList').innerHTML = (data || []).map(t => `
    <div class="list-row">
      <div>
        <strong>${t.full_name || t.username}</strong>
        <span class="badge ${t.role === 'admin' ? 'badge-success' : 'badge-muted'}" style="margin-left:.5rem">${t.role}</span>
        <div style="font-size:.85rem;color:var(--muted)">${t.username}</div>
      </div>
      ${t.role !== 'admin' ? `
        <div>
          <button class="btn btn-sm btn-danger" onclick="deleteTeacher('${t.id}')">Hapus</button>
        </div>` : ''}
    </div>`).join('') || '<div class="empty">Belum ada guru</div>';
}

async function deleteTeacher(id) {
  if (!confirm('Hapus akun guru ini?')) return;
  await sb.from('profiles').delete().eq('id', id);
  toast('Profil dihapus');
  loadTeachers();
}

// Init
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
});
