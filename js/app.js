// ============================================
// Silverhawk Submission - Main Application
// ============================================

let supabaseClient = null;

try {
  if (typeof CONFIG === 'undefined' || !CONFIG.SUPABASE_URL || CONFIG.SUPABASE_URL.includes('YOUR_PROJECT')) {
    console.error('Config belum diisi. Buka file js/config.js dan ganti SUPABASE_URL + SUPABASE_ANON_KEY');
  } else {
    supabaseClient = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
  }
} catch (err) {
  console.error('Gagal inisialisasi Supabase:', err);
}

// Alias agar kode lama tetap jalan
const supabase = supabaseClient;

// State
let currentUser = null;
let currentRole = null;
let selectedTaskId = null;
let selectedStudentId = null;
let pastedImageBase64 = null;
let classesCache = [];
let studentsCache = [];

// ========== UTILS ==========
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3200);
}

function show(el) {
  document.getElementById(el).classList.remove('hidden');
}

function hide(el) {
  document.getElementById(el).classList.add('hidden');
}

function compressImage(fileOrBlob, maxWidth = CONFIG.IMAGE_MAX_WIDTH, quality = CONFIG.IMAGE_QUALITY) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(fileOrBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        h = Math.round((h * maxWidth) / w);
        w = maxWidth;
      }
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', quality));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

// ========== AUTH ==========
async function checkSession() {
  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    currentUser = session.user;
    const { data } = await supabase.from('profiles').select('*').eq('id', currentUser.id).single();
    currentRole = data?.role || 'teacher';
    showDashboard();
  } else {
    showStudent();
  }
}

async function doLogin() {
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) return toast('Isi email & password');

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return toast(error.message);

  toast('Berhasil masuk');
  await checkSession();
}

async function doLogout() {
  await supabase.auth.signOut();
  currentUser = null;
  currentRole = null;
  showStudent();
  toast('Logout berhasil');
}

function showLogin() {
  hide('studentView');
  hide('dashboardView');
  show('loginView');
}

function showStudent() {
  hide('loginView');
  hide('dashboardView');
  show('studentView');
  document.getElementById('authArea').innerHTML =
    `<button class="btn btn-outline btn-sm" onclick="showLogin()">Login Guru</button>`;
  loadClasses();
}

function showDashboard() {
  hide('studentView');
  hide('loginView');
  show('dashboardView');
  document.getElementById('authArea').innerHTML = `
    <span style="margin-right:1rem;color:var(--muted);font-size:.9rem">
      ${currentRole === 'admin' ? 'Admin' : 'Guru'}
    </span>
    <button class="btn btn-outline btn-sm" onclick="doLogout()">Logout</button>
  `;
  document.querySelectorAll('.admin-only').forEach((el) => {
    el.classList.toggle('hidden', currentRole !== 'admin');
  });
  loadDashboard();
}

// Tabs
document.querySelectorAll('.nav-tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.add('hidden'));
    document.getElementById('tab-' + tab.dataset.tab).classList.remove('hidden');

    if (tab.dataset.tab === 'submissions') loadSubmissions();
    if (tab.dataset.tab === 'teachers') loadTeachers();
    if (tab.dataset.tab === 'overview') loadOverview();
    if (tab.dataset.tab === 'classes') loadClassStudentList();
    if (tab.dataset.tab === 'tasks') loadTaskManageList();
  });
});

// ========== STUDENT ==========
async function loadClasses() {
  const { data } = await supabase.from('classes').select('*').order('name');
  classesCache = data || [];
  const sel = document.getElementById('studentClass');
  sel.innerHTML =
    '<option value="">-- pilih kelas --</option>' +
    classesCache.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
}

async function loadStudents() {
  const classId = document.getElementById('studentClass').value;
  const nameSel = document.getElementById('studentName');

  if (!classId) {
    nameSel.innerHTML = '<option value="">-- pilih kelas dulu --</option>';
    nameSel.disabled = true;
    hide('taskListArea');
    hide('submitArea');
    return;
  }

  const { data } = await supabase
    .from('students')
    .select('*')
    .eq('class_id', classId)
    .order('name');

  studentsCache = data || [];
  nameSel.innerHTML =
    '<option value="">-- pilih nama --</option>' +
    studentsCache.map((s) => `<option value="${s.id}">${s.name}</option>`).join('');
  nameSel.disabled = false;
  hide('taskListArea');
  hide('submitArea');
}

async function loadStudentTasks() {
  selectedStudentId = document.getElementById('studentName').value;
  if (!selectedStudentId) {
    hide('taskListArea');
    return;
  }

  const classId = document.getElementById('studentClass').value;
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('class_id', classId)
    .order('created_at', { ascending: false });

  const { data: subs } = await supabase
    .from('submissions')
    .select('task_id')
    .eq('student_id', selectedStudentId);

  const submitted = new Set((subs || []).map((s) => s.task_id));
  const list = document.getElementById('taskList');

  if (!tasks?.length) {
    list.innerHTML = '<div class="empty">Belum ada tugas untuk kelas ini</div>';
  } else {
    list.innerHTML = tasks
      .map((t) => {
        const done = submitted.has(t.id);
        const safeTitle = t.title.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `
          <div class="card task-item">
            <div>
              <div style="font-weight:600">${t.title}</div>
              ${t.description ? `<div style="font-size:.85rem;color:var(--muted)">${t.description}</div>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:.75rem">
              <span class="badge ${done ? 'badge-success' : 'badge-warning'}">
                ${done ? '✓ Sudah' : 'Belum'}
              </span>
              ${!done ? `<button class="btn btn-sm" onclick="startSubmit('${t.id}','${safeTitle}')">Kumpulkan</button>` : ''}
            </div>
          </div>`;
      })
      .join('');
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
  document.getElementById('pasteZone').focus();
}

function cancelSubmit() {
  hide('submitArea');
  selectedTaskId = null;
  pastedImageBase64 = null;
}

// Paste handler
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

async function submitTask() {
  if (!pastedImageBase64 || !selectedTaskId || !selectedStudentId) return;

  document.getElementById('btnSubmit').disabled = true;

  const { error } = await supabase.from('submissions').upsert(
    {
      student_id: selectedStudentId,
      task_id: selectedTaskId,
      image_data: pastedImageBase64
    },
    { onConflict: 'student_id,task_id' }
  );

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
  const { data } = await supabase.from('classes').select('*').order('name');
  classesCache = data || [];

  ['addStudentClass', 'newTaskClass', 'filterClass'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML =
        '<option value="">-- pilih --</option>' +
        classesCache.map((c) => `<option value="${c.id}">${c.name}</option>`).join('');
    }
  });
}

async function loadOverview() {
  const [{ data: classes }, { data: students }, { data: tasks }, { data: subs }] = await Promise.all([
    supabase.from('classes').select('id'),
    supabase.from('students').select('id'),
    supabase.from('tasks').select('id'),
    supabase.from('submissions').select('id')
  ]);

  document.getElementById('statsCards').innerHTML = `
    <div class="stat-card"><div class="num">${classes?.length || 0}</div><div>Kelas</div></div>
    <div class="stat-card"><div class="num">${students?.length || 0}</div><div>Siswa</div></div>
    <div class="stat-card"><div class="num">${tasks?.length || 0}</div><div>Tugas</div></div>
    <div class="stat-card"><div class="num">${subs?.length || 0}</div><div>Pengumpulan</div></div>
  `;

  const { data: allTasks } = await supabase.from('tasks').select('id,title,class_id');
  const { data: allStudents } = await supabase.from('students').select('id,name,class_id');
  const { data: allSubs } = await supabase.from('submissions').select('student_id,task_id');

  const submittedSet = new Set((allSubs || []).map((s) => s.student_id + '_' + s.task_id));
  let missingHtml = '';

  (allTasks || []).forEach((task) => {
    const classStudents = (allStudents || []).filter((s) => s.class_id === task.class_id);
    const belum = classStudents.filter((s) => !submittedSet.has(s.id + '_' + task.id));
    if (belum.length) {
      missingHtml += `
        <div style="margin-bottom:1rem">
          <strong>${task.title}</strong>
          <div style="color:var(--muted);font-size:.9rem;margin-top:.3rem">
            ${belum.map((s) => s.name).join(', ')}
          </div>
        </div>`;
    }
  });

  document.getElementById('missingList').innerHTML =
    missingHtml || '<div class="empty">Semua siswa sudah mengumpulkan 🎉</div>';
}

async function addClass() {
  const name = document.getElementById('newClassName').value.trim();
  if (!name) return toast('Isi nama kelas');

  const { error } = await supabase.from('classes').insert({
    name,
    created_by: currentUser.id
  });

  if (error) return toast(error.message);
  toast('Kelas ditambahkan');
  document.getElementById('newClassName').value = '';
  loadClassesForTeacher();
  loadClassStudentList();
}

async function addStudent() {
  const classId = document.getElementById('addStudentClass').value;
  const name = document.getElementById('newStudentName').value.trim();
  if (!classId || !name) return toast('Lengkapi data');

  const { error } = await supabase.from('students').insert({ class_id: classId, name });
  if (error) return toast(error.message);

  toast('Siswa ditambahkan');
  document.getElementById('newStudentName').value = '';
  loadClassStudentList();
}

async function loadClassStudentList() {
  const { data: classes } = await supabase
    .from('classes')
    .select('*, students(*)')
    .order('name');

  let html = '';
  (classes || []).forEach((c) => {
    html += `
      <div style="margin-bottom:1.25rem">
        <strong>${c.name}</strong>
        <div style="margin-top:.4rem;font-size:.9rem;color:var(--muted)">
          ${(c.students || []).map((s) => s.name).join(' • ') || 'Belum ada siswa'}
        </div>
      </div>`;
  });

  document.getElementById('classStudentList').innerHTML =
    html || '<div class="empty">Belum ada kelas</div>';
}

async function addTask() {
  const classId = document.getElementById('newTaskClass').value;
  const title = document.getElementById('newTaskTitle').value.trim();
  const desc = document.getElementById('newTaskDesc').value.trim();
  if (!classId || !title) return toast('Lengkapi data');

  const { error } = await supabase.from('tasks').insert({
    class_id: classId,
    title,
    description: desc || null,
    created_by: currentUser.id
  });

  if (error) return toast(error.message);
  toast('Tugas dibuat');
  document.getElementById('newTaskTitle').value = '';
  document.getElementById('newTaskDesc').value = '';
  loadTaskManageList();
}

async function loadTaskManageList() {
  const { data } = await supabase
    .from('tasks')
    .select('*, classes(name)')
    .order('created_at', { ascending: false });

  document.getElementById('taskManageList').innerHTML =
    (data || [])
      .map(
        (t) => `
      <div class="list-row">
        <div>
          <strong>${t.title}</strong>
          <span style="color:var(--muted);font-size:.85rem"> • ${t.classes?.name || ''}</span>
        </div>
        <button class="btn btn-danger btn-sm" onclick="deleteTask('${t.id}')">Hapus</button>
      </div>`
      )
      .join('') || '<div class="empty">Belum ada tugas</div>';
}

async function deleteTask(id) {
  if (!confirm('Hapus tugas ini beserta semua pengumpulannya?')) return;
  await supabase.from('tasks').delete().eq('id', id);
  toast('Tugas dihapus');
  loadTaskManageList();
}

async function loadSubmissions() {
  const classId = document.getElementById('filterClass').value;
  const taskId = document.getElementById('filterTask').value;

  if (classId) {
    const { data: tasks } = await supabase.from('tasks').select('id,title').eq('class_id', classId);
    document.getElementById('filterTask').innerHTML =
      '<option value="">Semua tugas</option>' +
      (tasks || []).map((t) => `<option value="${t.id}">${t.title}</option>`).join('');
  }

  let query = supabase
    .from('submissions')
    .select('*, students(name, class_id), tasks(title)')
    .order('submitted_at', { ascending: false });

  if (taskId) {
    query = query.eq('task_id', taskId);
  } else if (classId) {
    const { data: tasks } = await supabase.from('tasks').select('id').eq('class_id', classId);
    const ids = (tasks || []).map((t) => t.id);
    if (ids.length) {
      query = query.in('task_id', ids);
    } else {
      document.getElementById('submissionTable').innerHTML = '<div class="empty">Tidak ada data</div>';
      return;
    }
  }

  const { data } = await query;

  if (!data?.length) {
    document.getElementById('submissionTable').innerHTML =
      '<div class="empty">Belum ada pengumpulan</div>';
    return;
  }

  document.getElementById('submissionTable').innerHTML = `
    <div style="overflow-x:auto">
      <table>
        <thead>
          <tr>
            <th>Siswa</th>
            <th>Tugas</th>
            <th>Screenshot</th>
            <th>Nilai</th>
            <th>Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${data
            .map(
              (s) => `
            <tr>
              <td>${s.students?.name || '-'}</td>
              <td>${s.tasks?.title || '-'}</td>
              <td>
                <img class="thumb" src="${s.image_data}" 
                     onclick="showPopup(this.src)" alt="screenshot" />
              </td>
              <td>
                ${s.grade != null ? s.grade : '<span class="badge badge-muted">Belum</span>'}
              </td>
              <td style="white-space:nowrap">
                <button class="btn btn-sm btn-outline" 
                        onclick="gradeSubmission('${s.id}', ${s.grade ?? 'null'})">
                  Nilai
                </button>
                ${
                  currentRole === 'admin'
                    ? `<button class="btn btn-sm btn-danger" onclick="deleteSubmission('${s.id}')">Hapus</button>`
                    : ''
                }
              </td>
            </tr>`
            )
            .join('')}
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

  const { error } = await supabase
    .from('submissions')
    .update({
      grade: parseFloat(grade) || null,
      notes,
      graded_by: currentUser.id
    })
    .eq('id', id);

  if (error) return toast(error.message);
  toast('Nilai disimpan');
  loadSubmissions();
}

async function deleteSubmission(id) {
  if (!confirm('Hapus screenshot ini?')) return;
  await supabase.from('submissions').delete().eq('id', id);
  toast('Dihapus');
  loadSubmissions();
}

// ========== ADMIN: TEACHERS ==========
async function addTeacher() {
  const email = document.getElementById('newTeacherEmail').value.trim();
  const pass = document.getElementById('newTeacherPass').value;
  const username = document.getElementById('newTeacherUser').value.trim();
  const full_name = document.getElementById('newTeacherName').value.trim();

  if (!email || !pass || !username) return toast('Lengkapi data');

  const { error } = await supabase.auth.signUp({
    email,
    password: pass,
    options: {
      data: { username, full_name, role: 'teacher' }
    }
  });

  if (error) return toast(error.message);
  toast('Akun guru dibuat. Minta mereka cek email jika confirmation aktif.');
  loadTeachers();
}

async function loadTeachers() {
  const { data } = await supabase.from('profiles').select('*').order('created_at');

  document.getElementById('teacherList').innerHTML =
    (data || [])
      .map(
        (t) => `
      <div class="list-row">
        <div>
          <strong>${t.full_name || t.username}</strong>
          <span class="badge ${t.role === 'admin' ? 'badge-success' : 'badge-muted'}" style="margin-left:.5rem">
            ${t.role}
          </span>
          <div style="font-size:.85rem;color:var(--muted)">${t.username}</div>
        </div>
        ${
          t.role !== 'admin'
            ? `<div>
                <button class="btn btn-sm btn-outline" onclick="resetPasswordHint()">Reset Pass</button>
                <button class="btn btn-sm btn-danger" onclick="deleteTeacher('${t.id}')">Hapus</button>
              </div>`
            : ''
        }
      </div>`
      )
      .join('') || '<div class="empty">Belum ada guru</div>';
}

async function deleteTeacher(id) {
  if (!confirm('Hapus akun guru ini?')) return;
  await supabase.from('profiles').delete().eq('id', id);
  toast('Profil guru dihapus (hapus juga di Auth Dashboard jika perlu)');
  loadTeachers();
}

function resetPasswordHint() {
  toast('Gunakan fitur "Forgot password" di halaman login Supabase, atau ubah manual di Authentication → Users.');
}

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
});
