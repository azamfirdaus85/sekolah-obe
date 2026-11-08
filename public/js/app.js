(() => {
  'use strict';
  const app = document.getElementById('app');
  let me = null;
  const esc = (v) =>
    String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = (n) => (n == null ? '-' : Number(n).toFixed(1));
  const fdate = (s) =>
    new Date(String(s).replace(' ', 'T') + 'Z').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  const roleLabel = (r) => ({ admin: 'Admin', guru: 'Guru', siswa: 'Siswa', kepsek: 'Kepala Sekolah' }[r] || r);

  async function api(path, method = 'GET', body) {
    const opt = { method, headers: {}, credentials: 'same-origin' };
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    const res = await fetch('/api' + path, opt);
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (res.status === 401 && path !== '/login' && path !== '/me') {
      me = null;
      renderLogin('Sesi berakhir, silakan masuk lagi.');
      throw new Error('Sesi berakhir');
    }
    if (!res.ok) throw new Error((data && data.error) || 'Terjadi kesalahan');
    return data;
  }

  function toast(msg, ok = true) {
    const el = document.createElement('div');
    el.className = 'toast' + (ok ? '' : ' bad');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }

  function openModal(html) {
    closeModal();
    const bg = document.createElement('div');
    bg.className = 'modal-bg';
    bg.id = 'modalBg';
    bg.innerHTML = `<div class="modal">${html}</div>`;
    document.body.appendChild(bg);
  }
  function closeModal() {
    const m = document.getElementById('modalBg');
    if (m) m.remove();
  }

  const levelClass = (v, kkm = 70) => (v == null ? '' : v >= kkm ? '' : 'low');
  const bar = (v, kkm = 70) =>
    v == null
      ? '<span class="muted">-</span>'
      : `<div class="cell-bar"><span>${fmt(v)}</span><div class="bar ${levelClass(v, kkm)}"><i style="width:${Math.max(0, Math.min(100, v))}%"></i></div></div>`;
  const pill = (passed) =>
    passed == null ? '<span class="pill na">Belum ada nilai</span>' : passed ? '<span class="pill ok">Tuntas</span>' : '<span class="pill low">Belum tuntas</span>';
  const opts = (list, valKey, labelFn, placeholder) =>
    (placeholder ? `<option value="">${esc(placeholder)}</option>` : '') +
    list.map((x) => `<option value="${esc(x[valKey])}">${esc(labelFn(x))}</option>`).join('');
  const delBtn = (url) => `<button class="btn sm danger" data-action="del" data-url="${esc(url)}">Hapus</button>`;

  const MENUS = {
    admin: [
      ['dash', '🏠 Dashboard'],
      ['users', '👥 Pengguna'],
      ['classes', '🏫 Kelas'],
      ['subjects', '📚 Mata Pelajaran'],
      ['teaching', '👩‍🏫 Kelas Ajar'],
      ['jadwal', '🕘 Jadwal Pelajaran'],
      ['news', '📢 Pengumuman'],
      ['absen', '🗓️ Absensi'],
      ['monitor', '📊 Monitoring'],
      ['akademik', '🎓 Akademik'],
      ['administrasi', '🗂️ Administrasi'],
      ['pengaduan', '📬 Layanan Pengaduan'],
      ['akun', '👤 Akun']
    ],
    guru: [
      ['dash', '🏠 Dashboard'],
      ['mycls', '📚 Kelas Ajar Saya'],
      ['absen', '🗓️ Absensi'],
      ['akademik', '🎓 Akademik'],
      ['pengaduan', '📬 Layanan Pengaduan'],
      ['akun', '👤 Akun']
    ],
    siswa: [
      ['dash', '🏠 Dashboard'],
      ['report', '📈 Nilai & Capaian'],
      ['absen', '🗓️ Absensi Saya'],
      ['akademik', '🎓 Akademik'],
      ['pengaduan', '📬 Layanan Pengaduan'],
      ['akun', '👤 Akun']
    ],
    kepsek: [
      ['dash', '🏠 Dashboard'],
      ['monitor', '📊 Monitoring Capaian'],
      ['absen', '🗓️ Absensi'],
      ['akademik', '🎓 Akademik'],
      ['administrasi', '🗂️ Administrasi'],
      ['pengaduan', '📬 Layanan Pengaduan'],
      ['akun', '👤 Akun']
    ]
  };

  function renderLogin(msg = '') {
    document.title = 'Masuk - SIAKAD OBE Sekolah';
    app.innerHTML = `
      <div class="login-wrap">
        <section class="login-hero">
          <div class="brand"><span class="brand-mark">S</span><span>SIAKAD OBE Sekolah</span></div>
          <h1>Sistem Informasi Akademik<br>Berbasis Capaian Pembelajaran</h1>
          <p>Pantau kurikulum, penilaian, dan refleksi pembelajaran dalam satu tempat.</p>
          <ul>
            <li>Monitoring Capaian Pembelajaran (CP)</li>
            <li>Analisis Penilaian &amp; Ketuntasan Siswa</li>
            <li>Refleksi Pembelajaran per Kelas Ajar</li>
            <li>Manajemen Guru, Siswa, dan Kelas</li>
          </ul>
        </section>
        <section class="login-panel">
          <div class="login-box">
            <h2>Masuk ke Sistem</h2>
            <p class="muted small" style="margin-bottom:1rem">Siswa memakai NIS sebagai username.</p>
            <form class="form" data-form="login">
              <div class="field"><label>Username</label><input name="username" required></div>
              <div class="field"><label>Password</label><input name="password" type="password" required></div>
              <p class="form-msg">${esc(msg)}</p>
              <button class="btn full" type="submit">Masuk</button>
            </form>
          </div>
        </section>
      </div>`;
  }

  function renderForceChange() {
    document.title = 'Buat Password Baru';
    app.innerHTML = `
      <div class="login-wrap"><section class="login-hero"><div class="brand"><span class="brand-mark">S</span><span>SIAKAD OBE Sekolah</span></div>
      <h1>Buat password baru</h1><p>Demi keamanan, Anda wajib mengganti password awal sebelum melanjutkan.</p></section>
      <section class="login-panel"><div class="login-box"><h2>Ganti Password</h2>
      <form class="form" data-form="changePw" style="margin-top:1rem">
        <div class="field"><label>Password lama</label><input name="old_password" type="password" required></div>
        <div class="field"><label>Password baru (min. 8 karakter)</label><input name="new_password" type="password" minlength="8" required></div>
        <p class="form-msg"></p>
        <button class="btn full" type="submit">Simpan</button>
      </form></div></section></div>`;
  }

  function layout(content, active) {
    const menu = MENUS[me.role].map(([k, l]) => `<a href="#/${k}" class="${active === k ? 'on' : ''}">${l}</a>`).join('');
    return `
      <div class="shell">
        <aside class="side" id="side">
          <div class="brand">
            <span class="brand-mark">S</span>
            <div><span>SIAKAD OBE</span><small style="display:block;font-weight:400;color:#94a3b8;font-size:.75rem">Sekolah • OBE System</small></div>
          </div>
          <nav>${menu}</nav>
          <div style="margin-top:auto;background:rgba(255,255,255,.06);border-radius:14px;padding:1rem">
            <p style="font-size:.8rem;color:#fff;font-weight:700">Butuh Bantuan?</p>
            <p style="font-size:.75rem;color:#94a3b8">Hubungi Admin Sekolah untuk reset password.</p>
          </div>
        </aside>
        <div class="main">
          <header class="top">
            <button class="burger" data-action="toggleSide">☰</button>
            <span class="who">${esc(me.name)}<em>${roleLabel(me.role)}</em></span>
            <button class="btn sm ghost" data-action="pw">🔑 Ganti Password</button>
            <button class="btn sm" data-action="logout">Keluar →</button>
          </header>
          <main class="content">${content}</main>
        </div>
      </div>`;
  }

  function analysisHtml(a) {
    const head = `<h2>${esc(a.teaching.subject_name)} - ${esc(a.teaching.class_name)}</h2>
      <p class="muted small">Guru: ${esc(a.teaching.teacher_name)} &bull; ${esc(a.teaching.semester)} &bull; KKM ${a.kkm} &bull; Rata-rata kelas: <b>${fmt(a.classAvg)}</b></p>`;
    const cp = a.outcomes.length
      ? `<table><thead><tr><th>CP</th><th>Deskripsi</th><th>Rata-rata</th><th>Ketuntasan</th></tr></thead><tbody>${a.outcomes
          .map((o) => `<tr><td><b>${esc(o.code)}</b></td><td>${esc(o.description)}</td><td>${bar(o.avg, a.kkm)}</td>
            <td>${o.passRate == null ? '-' : `${fmt(o.passRate)}% siswa tuntas`}</td></tr>`)
          .join('')}</tbody></table>`
      : '<p class="muted">Belum ada CP untuk mata pelajaran ini.</p>';
    const stu = `<table><thead><tr><th>NIS</th><th>Nama</th>${a.outcomes.map((o) => `<th class="num">${esc(o.code)}</th>`).join('')}<th class="num">Akhir</th><th>Status</th></tr></thead><tbody>${a.students
      .map((s) => `<tr><td>${esc(s.nis)}</td><td>${esc(s.name)}</td>${a.outcomes
        .map((o) => { const v = s.scores[o.id]; return `<td class="num ${v != null && v < a.kkm ? 'low-score' : ''}">${fmt(v)}</td>`; })
        .join('')}<td class="num ${s.final != null && s.final < a.kkm ? 'low-score' : ''}"><b>${fmt(s.final)}</b></td><td>${pill(s.passed)}</td></tr>`)
      .join('')}</tbody></table>`;
    return `<div class="card">${head}</div>
      <div class="card"><h2>Capaian per CP</h2>${cp}</div>
      <div class="card"><h2>Capaian per Siswa</h2>${a.students.length ? stu : '<p class="muted">Belum ada siswa di kelas ini.</p>'}</div>`;
  }

  function reflectionsHtml(list, canDelete, tid) {
    return list.length
      ? list.map((r) => `<div class="news"><time>${fdate(r.created_at)}</time><p>${esc(r.content)}</p>
          ${r.follow_up ? `<p class="muted small"><b>Tindak lanjut:</b> ${esc(r.follow_up)}</p>` : ''}
          ${canDelete ? delBtn(`/guru/teaching/${tid}/reflections/${r.id}`) : ''}</div>`).join('')
      : '<p class="muted">Belum ada refleksi.</p>';
  }

  async function dash() {
    const [news, ring] = await Promise.all([api('/announcements'), api('/dashboard/ringkasan').catch(() => null)]);
    let stats = '';
    if (me.role === 'admin') {
      const s = await api('/admin/stats');
      const c = (icon, l, v, color) => `
        <div class="card stat" style="border-left:4px solid ${color}">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div><b style="font-size:2.4rem">${v}</b><span class="muted" style="text-transform:uppercase;letter-spacing:.08em;font-size:.7rem;font-weight:700">${l}</span></div>
            <span style="font-size:2rem;background:${color}1a;width:52px;height:52px;display:grid;place-items:center;border-radius:14px">${icon}</span>
          </div>
        </div>`;
      stats = `<div class="cards">
        ${c('👥','Siswa', s.siswa, '#6366f1')}
        ${c('👩‍🏫','Guru', s.guru, '#10b981')}
        ${c('🏫','Kelas', s.kelas, '#f59e0b')}
        ${c('📚','Mata Pelajaran', s.mapel, '#8b5cf6')}
        ${c('🎓','Kelas Ajar', s.kelasAjar, '#ef4444')}
      </div>`;
    }
    const list = news.length
      ? news.map((n) => `<div class="news"><h3>${esc(n.title)}</h3><time>${fdate(n.created_at)}</time><p>${esc(n.body)}</p></div>`).join('')
      : '<p class="muted">Belum ada pengumuman.</p>';
    const home = homeHtml(ring);
    return `
      <div style="background:linear-gradient(135deg,#0b1220 0%,#6366f1 100%);color:#fff;padding:2rem;border-radius:20px;display:flex;justify-content:space-between;align-items:center">
        <div><h1 style="color:#fff;font-size:1.8rem">Halo, ${esc(me.name)} 👋</h1><p style="color:#cbd5e1">Selamat datang di SIAKAD OBE Sekolah.</p></div>
        <span style="font-size:3.5rem;opacity:.9">🎓</span>
      </div>
      ${stats}
      ${home}
      <div class="card"><h2>📢 Pengumuman</h2>${list}</div>`;
  }

  async function usersView() {
    const [users, classes] = await Promise.all([api('/admin/users'), api('/admin/classes')]);
    const rows = users.map((u) => `<tr>
      <td>${esc(u.username)}</td><td>${esc(u.name)}</td><td>${roleLabel(u.role)}</td>
      <td>${esc(u.nis || '')}</td><td>${esc(u.class_name || '')}</td>
      <td>${u.active ? '<span class="pill ok">Aktif</span>' : '<span class="pill low">Nonaktif</span>'}</td>
      <td><div class="actions">
        <button class="btn sm ghost" data-action="resetPw" data-id="${u.id}">Reset PW</button>
        <button class="btn sm ghost" data-action="toggleActive" data-id="${u.id}" data-active="${u.active ? 0 : 1}">${u.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
        ${delBtn('/admin/users/' + u.id)}</div></td></tr>`).join('');
    return `<h1>Pengguna</h1>
      <div style="margin-bottom:15px">
        <a class="btn" href="/api/admin/users/export">📥 Export Excel</a>
      </div>
      <div class="card"><h2>Tambah Pengguna</h2>
        <form class="form inline" data-form="post" data-url="/admin/users">
          <div class="field"><label>Username</label><input name="username" required></div>
          <div class="field"><label>Nama lengkap</label><input name="name" required></div>
          <div class="field"><label>Peran</label><select name="role"><option value="siswa">Siswa</option><option value="guru">Guru</option><option value="kepsek">Kepala Sekolah</option><option value="admin">Admin</option></select></div>
          <div class="field"><label>Password awal</label><input name="password" type="password" minlength="8" required></div>
          <div class="field"><label>NIS (siswa)</label><input name="nis"></div>
          <div class="field"><label>Kelas (siswa)</label><select name="class_id">${opts(classes, 'id', (c) => c.name, '-')}</select></div>
          <button class="btn" type="submit">Tambah</button>
        </form></div>
      <div class="card"><table><thead><tr><th>Username</th><th>Nama</th><th>Peran</th><th>NIS</th><th>Kelas</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  async function classesView() {
    const list = await api('/admin/classes');
    return `<h1>Kelas</h1>
      <div class="card"><form class="form inline" data-form="post" data-url="/admin/classes">
        <div class="field"><label>Nama kelas</label><input name="name" placeholder="X RPL 1" required></div>
        <div class="field"><label>Tahun ajaran</label><input name="year" placeholder="2026/2027"></div>
        <button class="btn" type="submit">Tambah</button></form></div>
      <div class="card"><table><thead><tr><th>Kelas</th><th>Tahun</th><th class="num">Siswa</th><th></th></tr></thead><tbody>${list
        .map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.year || '')}</td><td class="num">${c.students}</td><td><div class="actions">${delBtn('/admin/classes/' + c.id)}</div></td></tr>`).join('')}</tbody></table></div>`;
  }

  async function subjectsView() {
    const list = await api('/admin/subjects');
    return `<h1>Mata Pelajaran</h1>
      <div class="card"><form class="form inline" data-form="post" data-url="/admin/subjects">
        <div class="field"><label>Kode</label><input name="code" placeholder="MTK" required></div>
        <div class="field"><label>Nama mata pelajaran</label><input name="name" required></div>
        <button class="btn" type="submit">Tambah</button></form></div>
      <div class="card"><table><thead><tr><th>Kode</th><th>Nama</th><th></th></tr></thead><tbody>${list
        .map((s) => `<tr><td>${esc(s.code)}</td><td>${esc(s.name)}</td><td><div class="actions">${delBtn('/admin/subjects/' + s.id)}</div></td></tr>`).join('')}</tbody></table></div>`;
  }

  async function teachingAdminView() {
    const [list, subjects, classes, users] = await Promise.all([api('/admin/teaching'), api('/admin/subjects'), api('/admin/classes'), api('/admin/users?role=guru')]);
    return `<h1>Kelas Ajar</h1><p class="muted">Hubungkan mata pelajaran, kelas, dan guru pengampu pada satu semester.</p>
      <div class="card"><form class="form inline" data-form="post" data-url="/admin/teaching">
        <div class="field"><label>Mata pelajaran</label><select name="subject_id" required>${opts(subjects, 'id', (s) => s.name, 'Pilih')}</select></div>
        <div class="field"><label>Kelas</label><select name="class_id" required>${opts(classes, 'id', (c) => c.name, 'Pilih')}</select></div>
        <div class="field"><label>Guru</label><select name="teacher_id" required>${opts(users, 'id', (u) => u.name, 'Pilih')}</select></div>
        <div class="field"><label>Semester</label><input name="semester" placeholder="Ganjil 2026/2027" required></div>
        <button class="btn" type="submit">Tambah</button></form></div>
      <div class="card"><table><thead><tr><th>Mapel</th><th>Kelas</th><th>Guru</th><th>Semester</th><th></th></tr></thead><tbody>${list
        .map((t) => `<tr><td>${esc(t.subject_name)}</td><td>${esc(t.class_name)}</td><td>${esc(t.teacher_name)}</td><td>${esc(t.semester)}</td><td><div class="actions">${delBtn('/admin/teaching/' + t.id)}</div></td></tr>`).join('')}</tbody></table></div>`;
  }

  async function newsView() {
    const list = await api('/announcements');
    return `<h1>Pengumuman</h1>
      <div class="card"><form class="form" data-form="post" data-url="/admin/announcements">
        <div class="field"><label>Judul</label><input name="title" required></div>
        <div class="field"><label>Isi</label><textarea name="body" required></textarea></div>
        <div><button class="btn" type="submit">Terbitkan</button></div></form></div>
      <div class="card">${list.map((n) => `<div class="news"><h3>${esc(n.title)}</h3><time>${fdate(n.created_at)}</time><p>${esc(n.body)}</p>${delBtn('/admin/announcements/' + n.id)}</div>`).join('') || '<p class="muted">Belum ada pengumuman.</p>'}</div>`;
  }

  async function myClasses() {
    const list = await api('/guru/teaching');
    const cards = list.length
      ? list.map((t) => `<a class="card" href="#/class/${t.id}/cp"><h3>${esc(t.subject_name)}</h3><p class="muted">${esc(t.class_name)} &bull; ${t.students} siswa</p><p class="muted small">${esc(t.semester)}</p></a>`).join('')
      : '<p class="muted">Belum ada kelas ajar. Hubungi admin.</p>';
    return `<h1>Kelas Ajar Saya</h1><div class="grid2">${cards}</div>`;
  }

  async function classDetail(id, tab = 'cp', extra) {
    const list = await api('/guru/teaching');
    const t = list.find((x) => String(x.id) === String(id));
    if (!t) throw new Error('Kelas ajar tidak ditemukan');
    const tabs = [['cp', 'CP'], ['asesmen', 'Penilaian'], ['input', 'Input Nilai'], ['analisis', 'Analisis'], ['refleksi', 'Refleksi']];
    const nav = tabs.map(([k, l]) => `<a href="#/class/${id}/${k}" class="${tab === k ? 'on' : ''}">${l}</a>`).join('');
    const body = await (TABS[tab] || TABS.cp)(t, extra);
    return `<div><h1>${esc(t.subject_name)} - ${esc(t.class_name)}</h1><p class="muted">${esc(t.semester)}</p></div><div class="tabs">${nav}</div>${body}`;
  }

  const TABS = {
    async cp(t) {
      const list = await api(`/guru/teaching/${t.id}/outcomes`);
      return `<div class="card"><h2>Tambah CP</h2><form class="form inline" data-form="post" data-url="/guru/teaching/${t.id}/outcomes">
        <div class="field"><label>Kode</label><input name="code" placeholder="CP1" required></div>
        <div class="field" style="grid-column:span 2"><label>Deskripsi</label><input name="description" required></div>
        <button class="btn" type="submit">Tambah</button></form></div>
        <div class="card"><table><thead><tr><th>Kode</th><th>Deskripsi</th><th></th></tr></thead><tbody>${list.map((o) => `<tr><td><b>${esc(o.code)}</b></td><td>${esc(o.description)}</td><td><div class="actions">${delBtn(`/guru/teaching/${t.id}/outcomes/${o.id}`)}</div></td></tr>`).join('') || '<tr><td colspan="3" class="muted">Belum ada CP.</td></tr>'}</tbody></table></div>`;
    },
    async asesmen(t) {
      const [list, cps] = await Promise.all([api(`/guru/teaching/${t.id}/assessments`), api(`/guru/teaching/${t.id}/outcomes`)]);
      return `<div class="card"><h2>Tambah Asesmen</h2><form class="form inline" data-form="post" data-url="/guru/teaching/${t.id}/assessments">
        <div class="field"><label>Nama</label><input name="name" required></div>
        <div class="field"><label>CP</label><select name="outcome_id">${opts(cps, 'id', (c) => c.code + ' - ' + c.description, 'Tanpa CP')}</select></div>
        <div class="field"><label>Bobot</label><input name="weight" type="number" step="0.1" value="1"></div>
        <div class="field"><label>Maks.</label><input name="max_score" type="number" value="100"></div>
        <button class="btn" type="submit">Tambah</button></form></div>
        <div class="card"><table><thead><tr><th>Asesmen</th><th>CP</th><th class="num">Bobot</th><th class="num">Maks.</th><th class="num">Terisi</th><th></th></tr></thead><tbody>${list.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.outcome_code || '-')}</td><td class="num">${a.weight}</td><td class="num">${a.max_score}</td><td class="num">${a.filled}</td><td><div class="actions"><a class="btn sm ghost" href="#/class/${t.id}/input/${a.id}">Isi nilai</a>${delBtn('/guru/assessments/' + a.id)}</div></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Belum ada asesmen.</td></tr>'}</tbody></table></div>`;
    },
    async input(t, aid) {
      const list = await api(`/guru/teaching/${t.id}/assessments`);
      const select = `<div class="card"><div class="field"><label>Pilih asesmen</label><select data-change="pickAssess" data-tid="${t.id}">${opts(list, 'id', (a) => a.name, '-- Pilih --').replace(`value="${esc(aid)}"`, `value="${esc(aid)}" selected`)}</select></div></div>`;
      if (!aid) return select + '<p class="muted">Pilih asesmen untuk mengisi nilai.</p>';
      const data = await api(`/guru/assessments/${aid}/scores`);
      const rows = data.rows.map((r) => `<tr><td>${esc(r.nis)}</td><td>${esc(r.name)}</td><td class="num"><input class="score" type="number" min="0" max="${data.assessment.max_score}" data-sid="${r.student_id}" value="${r.score ?? ''}"></td></tr>`).join('');
      return select + `<div class="card"><h2>${esc(data.assessment.name)}</h2><form data-form="saveScores" data-aid="${aid}"><table><thead><tr><th>NIS</th><th>Nama</th><th class="num">Nilai</th></tr></thead><tbody>${rows}</tbody></table><button class="btn" type="submit">Simpan Nilai</button></form></div>`;
    },
    async analisis(t) { return analysisHtml(await api(`/guru/teaching/${t.id}/analysis`)); },
    async refleksi(t) {
      const list = await api(`/guru/teaching/${t.id}/reflections`);
      return `<div class="card"><h2>Tulis Refleksi</h2><form class="form" data-form="post" data-url="/guru/teaching/${t.id}/reflections">
        <div class="field"><label>Refleksi</label><textarea name="content" required></textarea></div>
        <div class="field"><label>Tindak lanjut</label><textarea name="follow_up"></textarea></div><div><button class="btn" type="submit">Simpan</button></div></form></div>
        <div class="card"><h2>Riwayat Refleksi</h2>${reflectionsHtml(list, true, t.id)}</div>`;
    }
  };

  async function reportView() {
    const r = await api('/siswa/report');
    const head = `<h1>Nilai & Capaian</h1><p class="muted">${esc(me.name)} &bull; NIS ${esc(r.student.nis)} &bull; Kelas ${esc(r.student.class_name || '-')} &bull; KKM ${r.kkm}</p>`;
    if (!r.subjects.length) return head + '<div class="card"><p class="muted">Belum ada mata pelajaran.</p></div>';
    return head + r.subjects.map((s) => `<div class="card"><h2>${esc(s.subject)} - ${esc(s.teacher)}</h2><p>Nilai akhir: <b>${fmt(s.final)}</b> ${pill(s.passed)}</p>
      <table><thead><tr><th>CP</th><th>Deskripsi</th><th>Capaian</th></tr></thead><tbody>${s.outcomes.map((o) => `<tr><td><b>${esc(o.code)}</b></td><td>${esc(o.description)}</td><td>${bar(o.score, r.kkm)}</td></tr>`).join('')}</tbody></table></div>`).join('');
  }

  async function monitorView() {
    const d = await api('/monitor/overview');
    const rows = d.items.map((i) => `<tr><td><b>${esc(i.subject)}</b></td><td>${esc(i.class_name)}</td><td>${esc(i.teacher)}</td><td class="num">${i.students}</td><td>${bar(i.classAvg, d.kkm)}</td>
      <td>${i.outcomes.map((o) => `<span class="pill ${o.passRate >= 75 ? 'ok' : 'low'}">${esc(o.code)}: ${Math.round(o.passRate || 0)}%</span>`).join(' ')}</td><td><a class="btn sm ghost" href="#/detail/${i.id}">Detail</a></td></tr>`).join('');
    return `<h1>Monitoring Capaian</h1><div class="card"><table><thead><tr><th>Mapel</th><th>Kelas</th><th>Guru</th><th class="num">Siswa</th><th>Rata-rata</th><th>Ketuntasan</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  async function detailView(id) {
    const [a, refl] = await Promise.all([api(`/monitor/teaching/${id}/analysis`), api(`/monitor/teaching/${id}/reflections`)]);
    return `<p><a href="#/monitor" class="btn sm ghost">&larr; Kembali</a></p>${analysisHtml(a)}<div class="card"><h2>Refleksi</h2>${reflectionsHtml(refl, false, id)}</div>`;
  }

  /* ===================== PORTAL (TAHAP 4) ===================== */
  const fdate2 = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : '-');
  const rangeTxt = (a, b) => (!b || b === a ? fdate2(a) : `${fdate2(a)} - ${fdate2(b)}`);
  const CS_LABEL = { baru: 'Baru', diproses: 'Diproses', selesai: 'Selesai', ditolak: 'Ditolak' };
  const CS_CLASS = { baru: 'info', diproses: 'warn', selesai: 'ok', ditolak: 'low' };
  const csPill = (s) => `<span class="pill ${CS_CLASS[s] || 'na'}">${esc(CS_LABEL[s] || s)}</span>`;
  let complaintsCache = [];

  // ---------- AKADEMIK ----------
  async function akademikView(sub = 'kalender') {
    const head = '<h1>Akademik</h1>';
    const tabs = absenTabsFor('akademik', [['kalender', '📅 Kalender Akademik'], ['jadwal', '🕘 Jadwal Pelajaran']], sub);
    if (sub === 'jadwal') {
      const d = await api('/portal/akademik/jadwal');
      if (!d.rows.length) return head + tabs + '<div class="card"><p class="muted">Belum ada jadwal pelajaran.</p></div>' + (me.role === 'admin' ? '<p><a class="btn sm ghost" href="#/jadwal">Kelola Jadwal</a></p>' : '');
      const byDay = {};
      d.rows.forEach((r) => { (byDay[r.day_of_week] = byDay[r.day_of_week] || []).push(r); });
      const cards = Object.keys(byDay).sort((a, b) => a - b).map((k) => {
        const items = byDay[k].map((j) => {
          const who = me.role === 'guru' ? esc(j.class_name) : me.role === 'siswa' ? esc(j.teacher_name) : `${esc(j.class_name)} &bull; ${esc(j.teacher_name)}`;
          return `<div class="sched-item"><div class="sched-time">${esc(j.start_time)}<small>${esc(j.end_time)}</small></div><div class="sched-body"><b>${esc(j.subject_name)}</b><span class="muted small">${who}${j.room ? ' &bull; ' + esc(j.room) : ''}</span></div></div>`;
        }).join('');
        return `<div class="card"><h2>${esc(byDay[k][0].day_name)}</h2>${items}</div>`;
      }).join('');
      return head + tabs + `<div class="grid2">${cards}</div>`;
    }
    const d = await api('/portal/akademik/kalender');
    const t = d.today;
    const daysTo = (a) => Math.round((new Date(a + 'T00:00:00') - new Date(t + 'T00:00:00')) / 86400000);
    const item = (e) => {
      const end = e.end_date || e.start_date;
      let tag = '';
      if (e.start_date <= t && end >= t) tag = '<span class="pill ok">Berlangsung</span>';
      else if (e.start_date > t) tag = `<span class="pill info">${daysTo(e.start_date)} hari lagi</span>`;
      return `<div class="news"><div style="display:flex;justify-content:space-between;gap:.6rem;align-items:start"><h3>${esc(e.title)}</h3>${tag}</div>
        <time>${rangeTxt(e.start_date, e.end_date)}</time>${e.description ? `<p>${esc(e.description)}</p>` : ''}
        ${me.role === 'admin' ? delBtn('/portal/akademik/kalender/' + e.id) : ''}</div>`;
    };
    const upcoming = d.rows.filter((e) => (e.end_date || e.start_date) >= t);
    const past = d.rows.filter((e) => (e.end_date || e.start_date) < t).reverse();
    const form = me.role === 'admin'
      ? `<div class="card"><h2>Tambah Kegiatan</h2><form class="form inline" data-form="post" data-url="/portal/akademik/kalender">
          <div class="field"><label>Kegiatan</label><input name="title" required maxlength="150"></div>
          <div class="field"><label>Mulai</label><input name="start_date" type="date" required></div>
          <div class="field"><label>Selesai (opsional)</label><input name="end_date" type="date"></div>
          <div class="field"><label>Keterangan</label><input name="description" maxlength="500"></div>
          <button class="btn" type="submit">Tambah</button></form></div>`
      : '';
    return head + tabs + form
      + `<div class="card"><h2>Sedang Berlangsung & Akan Datang</h2>${upcoming.map(item).join('') || '<p class="muted">Belum ada kegiatan akademik.</p>'}</div>`
      + (past.length ? `<div class="card"><h2>Sudah Lewat</h2>${past.map(item).join('')}</div>` : '');
  }
  const absenTabsFor = (base, items, active) =>
    `<div class="tabs">${items.map(([k, l]) => `<a href="#/${base}/${k}" class="${active === k ? 'on' : ''}">${l}</a>`).join('')}</div>`;

  // ---------- ADMINISTRASI ----------
  async function administrasiView() {
    const d = await api('/portal/administrasi');
        const form = me.role === 'admin'
      ? `<div class="card"><h2>Tambah Dokumen</h2><form class="form inline" data-form="post" data-url="/portal/administrasi">
          <div class="field"><label>Jenis</label><select name="type">${d.types.map((t) => `<option>${esc(t)}</option>`).join('')}</select></div>
          <div class="field"><label>Judul / Nomor surat</label><input name="title" required maxlength="150"></div>
          <div class="field"><label>Tanggal</label><input name="doc_date" type="date" value="${todayJkt()}"></div>
          <div class="field"><label>Keterangan</label><input name="description" maxlength="500"></div>
          <button class="btn" type="submit">Simpan</button></form></div>`
      : '';
    const rows = d.rows.length
      ? d.rows.map((r) => `<tr><td>${fdate2(r.doc_date)}</td><td><span class="pill na">${esc(r.type)}</span></td><td><b>${esc(r.title)}</b>${r.description ? `<br><span class="muted small">${esc(r.description)}</span>` : ''}</td><td>${esc(r.created_by_name || '-')}</td>${me.role === 'admin' ? `<td><div class="actions">${delBtn('/portal/administrasi/' + r.id)}</div></td>` : ''}</tr>`).join('')
      : `<tr><td colspan="5" class="muted">Belum ada dokumen.</td></tr>`;
    return `<h1>Administrasi</h1><p class="muted">Arsip surat dan dokumen sekolah.</p>${form}
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Dokumen</th><th>Dicatat oleh</th>${me.role === 'admin' ? '<th></th>' : ''}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  // ---------- LAYANAN PENGADUAN ----------
  async function pengaduanView(sub = 'semua') {
    if (me.role === 'siswa' || me.role === 'guru') {
      const d = await api('/portal/pengaduan/saya');
      const list = d.rows.length
        ? d.rows.map((c) => `<div class="news"><div style="display:flex;justify-content:space-between;gap:.6rem;align-items:start"><h3>${esc(c.subject)}</h3>${csPill(c.status)}</div>
            <time>${fdate(c.created_at)} &bull; ${esc(c.category)}</time><p>${esc(c.body)}</p>
            ${c.response ? `<p class="muted small" style="margin-top:.5rem"><b>Tanggapan:</b> ${esc(c.response)}</p>` : ''}
            ${c.status === 'baru' ? delBtn('/portal/pengaduan/' + c.id) : ''}</div>`).join('')
        : '<p class="muted">Anda belum pernah mengirim pengaduan.</p>';
      return `<h1>Layanan Pengaduan</h1><p class="muted">Sampaikan keluhan atau masukan Anda kepada pihak sekolah.</p>
        <div class="card"><h2>Kirim Pengaduan</h2><form class="form" data-form="post" data-url="/portal/pengaduan">
          <div class="field"><label>Kategori</label><select name="category">${d.categories.map((c) => `<option>${esc(c)}</option>`).join('')}</select></div>
          <div class="field"><label>Judul</label><input name="subject" required minlength="3" maxlength="120"></div>
          <div class="field"><label>Isi pengaduan</label><textarea name="body" required minlength="10" maxlength="2000"></textarea></div>
          <div><button class="btn" type="submit">Kirim</button></div></form></div>
        <div class="card"><h2>Pengaduan Saya</h2>${list}</div>`;
    }
    const status = ['baru', 'diproses', 'selesai', 'ditolak'].includes(sub) ? sub : 'semua';
    const d = await api('/portal/pengaduan' + (status === 'semua' ? '' : '?status=' + status));
    complaintsCache = d.rows;
    const total = d.counts.baru + d.counts.diproses + d.counts.selesai + d.counts.ditolak;
    const tabs = absenTabsFor('pengaduan', [['semua', `Semua (${total})`], ['baru', `Baru (${d.counts.baru})`], ['diproses', `Diproses (${d.counts.diproses})`], ['selesai', `Selesai (${d.counts.selesai})`], ['ditolak', `Ditolak (${d.counts.ditolak})`]], status);
    const rows = d.rows.length
      ? d.rows.map((c) => `<tr><td>${fdate(c.created_at)}</td><td>${esc(c.user_name)}<br><span class="muted small">${esc(roleLabel(c.user_role))}</span></td><td>${esc(c.category)}</td><td><b>${esc(c.subject)}</b></td><td>${csPill(c.status)}</td><td><button class="btn sm ghost" data-action="openRespond" data-id="${c.id}">${c.status === 'baru' ? 'Tanggapi' : 'Lihat'}</button></td></tr>`).join('')
      : '<tr><td colspan="6" class="muted">Tidak ada pengaduan.</td></tr>';
    return `<h1>Layanan Pengaduan</h1>${tabs}<div class="card"><div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Pelapor</th><th>Kategori</th><th>Judul</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  // ---------- AKUN ----------
  async function akunView() {
    const d = await api('/portal/akun');
    const u = d.user;
    const row = (l, v) => `<tr><td class="muted" style="width:150px">${l}</td><td><b>${esc(v || '-')}</b></td></tr>`;
    return `<h1>Akun</h1>
      <div class="grid2">
        <div class="card"><h2>Profil</h2><table><tbody>
          ${row('Nama', u.name)}${row('Username', u.username)}${row('Peran', roleLabel(u.role))}
          ${d.siswa ? row('NIS', d.siswa.nis) + row('Kelas', d.siswa.class_name) : ''}
        </tbody></table></div>
        <div class="card"><h2>Kontak</h2><form class="form" data-form="saveAkun">
          <div class="field"><label>Email</label><input name="email" type="email" maxlength="120" value="${esc(u.email || '')}"></div>
          <div class="field"><label>No. Telepon</label><input name="phone" maxlength="20" value="${esc(u.phone || '')}"></div>
          <div><button class="btn" type="submit">Simpan</button></div></form></div>
      </div>
      <div class="card"><h2>Keamanan</h2><p class="muted small" style="margin-bottom:.8rem">Ganti password secara berkala. Minimal 8 karakter.</p><button class="btn ghost" data-action="pw">🔑 Ganti Password</button></div>`;
  }

  /* ===================== DASHBOARD (TAHAP 3) ===================== */
  const QUICK_EXTRA = {
    admin: [],
    guru: [['#/absen/siswa', '📝 Absen Siswa'], ['#/absen/saya', '🙋 Absen Masuk']],
    siswa: [],
    kepsek: [['#/absen/saya', '🙋 Absen Masuk']]
  };
  const VISIT_LABEL = { class: '📚 Kelas Ajar', detail: '📊 Detail Monitoring' };
  const splitIcon = (label) => { const i = label.indexOf(' '); return i < 0 ? ['•', label] : [label.slice(0, i), label.slice(i + 1)]; };
  const ago = (s) => {
    const t = new Date(String(s).replace(' ', 'T') + 'Z').getTime();
    if (isNaN(t)) return '';
    const m = Math.max(0, Math.round((Date.now() - t) / 60000));
    if (m < 1) return 'baru saja';
    if (m < 60) return m + ' menit lalu';
    const h = Math.round(m / 60);
    if (h < 24) return h + ' jam lalu';
    return Math.round(h / 24) + ' hari lalu';
  };
  const nowJkt = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit' });

  function homeHtml(ring) {
    const tiles = [...QUICK_EXTRA[me.role], ...MENUS[me.role].filter(([k]) => k !== 'dash').map(([k, l]) => ['#/' + k, l])]
      .map(([href, label]) => { const [ic, tx] = splitIcon(label); return `<a class="quick-item" href="${href}"><span class="quick-ic">${ic}</span><span>${esc(tx)}</span></a>`; })
      .join('');
    const quick = `<div class="card"><h2>⚡ Akses Cepat</h2><div class="quick">${tiles}</div></div>`;
    if (!ring) {
      return quick + '<div class="card"><p class="muted">Jadwal dan riwayat kunjungan belum bisa dimuat.</p></div>';
    }
    const now = nowJkt();
    const jadwal = ring.jadwal.length
      ? ring.jadwal.map((j) => {
          const live = now >= j.start_time && now < j.end_time;
          const who = me.role === 'guru' ? esc(j.class_name) : me.role === 'siswa' ? esc(j.teacher_name) : `${esc(j.class_name)} &bull; ${esc(j.teacher_name)}`;
          return `<div class="sched-item ${live ? 'live' : ''}"><div class="sched-time">${esc(j.start_time)}<small>${esc(j.end_time)}</small></div>
            <div class="sched-body"><b>${esc(j.subject_name)}</b><span class="muted small">${who}${j.room ? ' &bull; ' + esc(j.room) : ''}</span></div>
            ${live ? '<span class="pill ok">Berlangsung</span>' : ''}</div>`;
        }).join('')
      : '<p class="muted">Tidak ada jadwal pelajaran hari ini.</p>';
    const terakhir = ring.terakhir.length
      ? ring.terakhir.map((v) => `<a class="recent-item" href="${esc(v.page)}"><span>${esc(v.label)}</span><small class="muted">${ago(v.visited_at)}</small></a>`).join('')
      : '<p class="muted">Belum ada halaman yang dikunjungi.</p>';
    return quick + `<div class="grid2">
      <div class="card"><h2>🕘 Jadwal Hari Ini</h2><p class="muted small" style="margin-top:-.5rem;margin-bottom:.8rem">${fday(ring.date)}</p>${jadwal}</div>
      <div class="card"><h2>🕑 Terakhir Dikunjungi</h2>${terakhir}</div></div>`;
  }

  function logVisit(view, hash) {
    const found = MENUS[me.role].find(([k]) => k === view);
    const label = found ? found[1] : VISIT_LABEL[view];
    if (!label) return;
    api('/dashboard/kunjungan', 'POST', { page: hash, label }).catch(() => {});
  }

  const DAYS = [[1, 'Senin'], [2, 'Selasa'], [3, 'Rabu'], [4, 'Kamis'], [5, 'Jumat'], [6, 'Sabtu'], [7, 'Minggu']];
  async function jadwalAdminView() {
    const [list, teaching] = await Promise.all([api('/dashboard/jadwal'), api('/admin/teaching')]);
    const rows = list.length
      ? list.map((j) => `<tr><td>${esc(j.day_name)}</td><td>${esc(j.start_time)} - ${esc(j.end_time)}</td><td>${esc(j.subject_name)}</td><td>${esc(j.class_name)}</td><td>${esc(j.teacher_name)}</td><td>${esc(j.room || '-')}</td><td><div class="actions">${delBtn('/dashboard/jadwal/' + j.id)}</div></td></tr>`).join('')
      : '<tr><td colspan="7" class="muted">Belum ada jadwal.</td></tr>';
    return `<h1>Jadwal Pelajaran</h1><p class="muted">Jadwal ini tampil di dashboard guru dan siswa sesuai hari.</p>
      <div class="card"><h2>Tambah Jadwal</h2><form class="form inline" data-form="post" data-url="/dashboard/jadwal">
        <div class="field"><label>Kelas ajar</label><select name="teaching_id" required>${opts(teaching, 'id', (t) => `${t.subject_name} - ${t.class_name} (${t.teacher_name})`, 'Pilih')}</select></div>
        <div class="field"><label>Hari</label><select name="day_of_week">${DAYS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select></div>
        <div class="field"><label>Mulai</label><input name="start_time" type="time" required></div>
        <div class="field"><label>Selesai</label><input name="end_time" type="time" required></div>
        <div class="field"><label>Ruang</label><input name="room" maxlength="40" placeholder="Lab 1"></div>
        <button class="btn" type="submit">Tambah</button></form></div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Hari</th><th>Jam</th><th>Mapel</th><th>Kelas</th><th>Guru</th><th>Ruang</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  /* ===================== ABSENSI (TAHAP 2) ===================== */
  const todayJkt = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
  const fday = (d) =>
    d ? new Date(d + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '-';
  const STATUS_LABEL = { hadir: 'Hadir', izin: 'Izin', sakit: 'Sakit', alpa: 'Alpa', dinas: 'Dinas' };
  const STATUS_CLASS = { hadir: 'ok', alpa: 'low', izin: 'warn', sakit: 'warn', dinas: 'info' };
  const STATUS_SISWA = ['hadir', 'izin', 'sakit', 'alpa'];
  const statusPill = (s) =>
    s ? `<span class="pill ${STATUS_CLASS[s] || 'na'}">${esc(STATUS_LABEL[s] || s)}</span>` : '<span class="pill na">Belum absen</span>';
  const absenTabs = (items, active) =>
    `<div class="tabs">${items.map(([k, l]) => `<a href="#/absen/${k}" class="${active === k ? 'on' : ''}">${l}</a>`).join('')}</div>`;
  const statCard = (label, value) => `<div class="card stat"><b>${value}</b><span class="muted small">${label}</span></div>`;

  async function staffPanel() {
    const d = await api('/absensi/staf/saya');
    const t = d.today;
    const info = t
      ? `<p>Status hari ini: ${statusPill(t.status)} &bull; Masuk: <b>${esc(t.check_in || '-')}</b> &bull; Pulang: <b>${esc(t.check_out || '-')}</b>${t.note ? ` &bull; <span class="muted">${esc(t.note)}</span>` : ''}</p>`
      : '<p class="muted">Anda belum absen hari ini.</p>';
    const canIn = !t || !t.check_in;
    const canOut = !!(t && t.check_in && !t.check_out);
    const hist = d.rows.length
      ? d.rows.map((r) => `<tr><td>${fday(r.date)}</td><td>${statusPill(r.status)}</td><td>${esc(r.check_in || '-')}</td><td>${esc(r.check_out || '-')}</td><td>${esc(r.note || '')}</td></tr>`).join('')
      : '<tr><td colspan="5" class="muted">Belum ada riwayat.</td></tr>';
    return `<div class="card"><h2>Absensi Saya - ${fday(d.date)}</h2>${info}
        <div class="actions" style="margin-top:.8rem">
          <button class="btn" data-action="staffIn" ${canIn ? '' : 'disabled'}>Absen Masuk</button>
          <button class="btn ghost" data-action="staffOut" ${canOut ? '' : 'disabled'}>Absen Pulang</button>
        </div></div>
      <div class="card"><h2>Izin / Sakit / Dinas</h2>
        <form class="form inline" data-form="staffLeave">
          <div class="field"><label>Keterangan</label><select name="status"><option value="izin">Izin</option><option value="sakit">Sakit</option><option value="dinas">Dinas luar</option></select></div>
          <div class="field"><label>Catatan (opsional)</label><input name="note" maxlength="200"></div>
          <button class="btn" type="submit" ${canIn ? '' : 'disabled'}>Simpan</button>
        </form></div>
      <div class="card"><h2>Riwayat 31 Hari Terakhir</h2><div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Status</th><th>Masuk</th><th>Pulang</th><th>Catatan</th></tr></thead><tbody>${hist}</tbody></table></div></div>`;
  }

  async function absenGuru(sub = 'siswa', p1, p2) {
    const head = '<h1>Absensi</h1>';
    const tabs = absenTabs([['siswa', '📝 Absen Siswa'], ['rekap', '📊 Rekap Kelas'], ['saya', '🙋 Absensi Saya']], sub);
    if (sub === 'saya') return head + tabs + (await staffPanel());

    const kelas = await api('/absensi/guru/kelas');
    if (!kelas.length) return head + tabs + '<div class="card"><p class="muted">Belum ada kelas ajar. Hubungi admin.</p></div>';

    const isRekap = sub === 'rekap';
    const tid = p1 && kelas.some((k) => String(k.id) === String(p1)) ? p1 : kelas[0].id;
    const period = p2 || (isRekap ? todayJkt().slice(0, 7) : todayJkt());
    const picker = `<div class="card"><form class="form inline" data-form="absenPick" data-sub="${isRekap ? 'rekap' : 'siswa'}">
        <div class="field"><label>Kelas ajar</label><select name="teaching_id">${kelas
          .map((k) => `<option value="${k.id}" ${String(k.id) === String(tid) ? 'selected' : ''}>${esc(k.subject_name)} - ${esc(k.class_name)}</option>`)
          .join('')}</select></div>
        <div class="field"><label>${isRekap ? 'Bulan' : 'Tanggal'}</label><input name="period" type="${isRekap ? 'month' : 'date'}" value="${esc(period)}" ${isRekap ? '' : `max="${todayJkt()}"`} required></div>
        <button class="btn" type="submit">Tampilkan</button></form></div>`;

    if (isRekap) {
      const d = await api(`/absensi/guru/rekap?teaching_id=${tid}&month=${period}`);
      const rows = d.rows.length
        ? d.rows.map((r) => {
            const pct = r.total ? Math.round((r.hadir / r.total) * 100) : null;
            return `<tr><td>${esc(r.nis)}</td><td>${esc(r.name)}</td><td class="num">${r.hadir}</td><td class="num">${r.izin}</td><td class="num">${r.sakit}</td><td class="num ${r.alpa ? 'low-score' : ''}">${r.alpa}</td><td class="num">${pct == null ? '-' : pct + '%'}</td></tr>`;
          }).join('')
        : '<tr><td colspan="7" class="muted">Belum ada siswa di kelas ini.</td></tr>';
      return head + tabs + picker + `<div class="card"><h2>Rekap ${esc(d.teaching.subject_name)} - ${esc(d.teaching.class_name)} (${esc(d.month)})</h2>
        <div class="table-wrap"><table><thead><tr><th>NIS</th><th>Nama</th><th class="num">Hadir</th><th class="num">Izin</th><th class="num">Sakit</th><th class="num">Alpa</th><th class="num">% Hadir</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }

    const d = await api(`/absensi/guru/siswa?teaching_id=${tid}&date=${period}`);
    const rows = d.rows
      .map((r) => `<tr data-sid="${r.student_id}"><td>${esc(r.nis)}</td><td>${esc(r.name)}</td>
        <td><select class="abs-status">${STATUS_SISWA.map((s) => `<option value="${s}" ${(r.status || 'hadir') === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}</select></td>
        <td><input class="abs-note" maxlength="200" placeholder="Keterangan" value="${esc(r.note || '')}"></td></tr>`)
      .join('');
    const belum = d.rows.length && d.rows.every((r) => !r.status);
    return head + tabs + picker + `<div class="card"><h2>${esc(d.teaching.subject_name)} - ${esc(d.teaching.class_name)}</h2>
      <p class="muted small">${fday(d.date)}${belum ? ' &bull; Belum pernah diabsen, semua diisi Hadir secara default. Ubah yang tidak hadir lalu simpan.' : ''}</p>
      ${d.rows.length ? `<form data-form="saveAbsen" data-tid="${d.teaching.id}" data-date="${esc(d.date)}">
        <div class="table-wrap"><table><thead><tr><th>NIS</th><th>Nama</th><th>Status</th><th>Keterangan</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="actions" style="margin-top:1rem"><button class="btn ghost" type="button" data-action="allHadir">Semua Hadir</button><button class="btn" type="submit">Simpan Absensi</button></div></form>`
        : '<p class="muted">Belum ada siswa di kelas ini.</p>'}</div>`;
  }

  // ---------- SISWA ----------
  async function absenSiswa() {
    const d = await api('/absensi/siswa/saya');
    const s = d.summary;
    const total = s.hadir + s.izin + s.sakit + s.alpa;
    const pct = total ? Math.round((s.hadir / total) * 100) : null;
    const rows = d.rows.length
      ? d.rows.map((r) => `<tr><td>${fday(r.date)}</td><td>${esc(r.subject_name)}</td><td>${statusPill(r.status)}</td><td>${esc(r.note || '')}</td></tr>`).join('')
      : '<tr><td colspan="4" class="muted">Belum ada data absensi.</td></tr>';
    return `<h1>Absensi Saya</h1><p class="muted">NIS ${esc(d.nis)}</p>
      <div class="cards">${statCard('Hadir', s.hadir)}${statCard('Izin', s.izin)}${statCard('Sakit', s.sakit)}${statCard('Alpa', s.alpa)}${statCard('% Kehadiran', pct == null ? '-' : pct + '%')}</div>
      <div class="card"><h2>Riwayat Absensi</h2><div class="table-wrap"><table><thead><tr><th>Tanggal</th><th>Mata Pelajaran</th><th>Status</th><th>Keterangan</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  async function absenPantau(sub = 'hari', p1) {
    const head = '<h1>Absensi</h1>';
    const tabs = me.role === 'kepsek' ? absenTabs([['hari', '📅 Pantau Harian'], ['saya', '🙋 Absensi Saya']], sub) : '';
    if (sub === 'saya' && me.role === 'kepsek') return head + tabs + (await staffPanel());

    const date = p1 || todayJkt();
    const d = await api(`/absensi/pantau/hari?date=${date}`);
    const guruHadir = d.guru.filter((g) => g.status === 'hadir').length;
    const sum = d.kelas.reduce((a, k) => ({ total: a.total + k.total, hadir: a.hadir + k.hadir, izin: a.izin + k.izin, sakit: a.sakit + k.sakit, alpa: a.alpa + k.alpa }), { total: 0, hadir: 0, izin: 0, sakit: 0, alpa: 0 });
    const staffRows = (list, empty) =>
      list.length
        ? list.map((g) => `<tr><td>${esc(g.name)}</td><td>${statusPill(g.status)}</td><td>${esc(g.check_in || '-')}</td><td>${esc(g.check_out || '-')}</td><td>${esc(g.note || '')}</td></tr>`).join('')
        : `<tr><td colspan="5" class="muted">${empty}</td></tr>`;
    const staffTable = (title, list, empty) =>
      `<div class="card"><h2>${title}</h2><div class="table-wrap"><table><thead><tr><th>Nama</th><th>Status</th><th>Masuk</th><th>Pulang</th><th>Catatan</th></tr></thead><tbody>${staffRows(list, empty)}</tbody></table></div></div>`;
    const kelasRows = d.kelas.length
      ? d.kelas.map((k) => `<tr><td><b>${esc(k.name)}</b></td><td class="num">${k.total}</td><td class="num">${k.hadir}</td><td class="num">${k.izin}</td><td class="num">${k.sakit}</td><td class="num ${k.alpa ? 'low-score' : ''}">${k.alpa}</td></tr>`).join('')
      : '<tr><td colspan="6" class="muted">Belum ada kelas.</td></tr>';
    const absentRows = d.tidak_hadir.length
      ? d.tidak_hadir.map((r) => `<tr><td>${esc(r.name)}</td><td>${esc(r.class_name || '-')}</td><td>${esc(r.subject_name)}</td><td>${statusPill(r.status)}</td><td>${esc(r.note || '')}</td></tr>`).join('')
      : '<tr><td colspan="5" class="muted">Tidak ada siswa yang tidak hadir pada tanggal ini.</td></tr>';
    return head + tabs + `<div class="card"><form class="form inline" data-form="absenPantauPick">
        <div class="field"><label>Tanggal</label><input name="date" type="date" value="${esc(d.date)}" required></div>
        <button class="btn" type="submit">Tampilkan</button></form></div>
      <p class="muted">${fday(d.date)}</p>
      <div class="cards">${statCard('Guru hadir', guruHadir + ' / ' + d.guru.length)}${statCard('Siswa hadir (catatan)', sum.hadir)}${statCard('Izin + Sakit', sum.izin + sum.sakit)}${statCard('Alpa', sum.alpa)}</div>
      ${staffTable('Absensi Guru', d.guru, 'Belum ada guru.')}
      ${staffTable('Absensi Kepala Sekolah', d.kepsek, 'Belum ada akun kepala sekolah.')}
      <div class="card"><h2>Ringkasan Siswa per Kelas</h2><p class="muted small">Angka berupa jumlah catatan absensi (satu siswa bisa tercatat per mata pelajaran).</p>
        <div class="table-wrap"><table><thead><tr><th>Kelas</th><th class="num">Siswa</th><th class="num">Hadir</th><th class="num">Izin</th><th class="num">Sakit</th><th class="num">Alpa</th></tr></thead><tbody>${kelasRows}</tbody></table></div></div>
      <div class="card"><h2>Siswa Tidak Hadir</h2><div class="table-wrap"><table><thead><tr><th>Nama</th><th>Kelas</th><th>Mapel</th><th>Status</th><th>Keterangan</th></tr></thead><tbody>${absentRows}</tbody></table></div></div>`;
  }

  const VIEWS = {
    admin: { dash, users: usersView, classes: classesView, subjects: subjectsView, teaching: teachingAdminView, news: newsView, jadwal: jadwalAdminView, absen: absenPantau, akademik: akademikView, administrasi: administrasiView, pengaduan: pengaduanView, akun: akunView, monitor: monitorView, detail: detailView },
    guru: { dash, mycls: myClasses, class: classDetail, absen: absenGuru, akademik: akademikView, pengaduan: pengaduanView, akun: akunView },
    siswa: { dash, report: reportView, absen: absenSiswa, akademik: akademikView, pengaduan: pengaduanView, akun: akunView },
    kepsek: { dash, monitor: monitorView, detail: detailView, absen: absenPantau, akademik: akademikView, administrasi: administrasiView, pengaduan: pengaduanView, akun: akunView }
  };

  async function route() {
    closeModal();
    if (!me) return renderLogin();
    if (me.must_change) return renderForceChange();
    const [, view = 'dash', id, tab, extra] = location.hash.split('/');
    const fn = VIEWS[me.role][view];
    if (!fn) { location.hash = '#/dash'; return; }
    const active = view === 'class' ? 'mycls' : view === 'detail' ? 'monitor' : view;
    try {
      const html = await fn(id, tab, extra);
      app.innerHTML = layout(html, active);
      logVisit(view, location.hash);
    } catch (e) {
      if (!me) return;
      app.innerHTML = layout(`<div class="card"><p class="err">${esc(e.message)}</p></div>`, active);
    }
  }

  const FORMS = {
    async login(data, f) {
      const msg = f.querySelector('.form-msg'); msg.textContent = '';
      try { const r = await api('/login', 'POST', data); me = r.user; location.hash = '#/dash'; route(); }
      catch (e) { msg.textContent = e.message; }
    },
    async changePw(data, f) {
      const msg = f.querySelector('.form-msg'); msg.textContent = '';
      try { await api('/change-password', 'POST', data); me.must_change = false; closeModal(); toast('Password berhasil diganti'); route(); }
      catch (e) { msg.textContent = e.message; }
    },
    absenPick(data, f) { location.hash = `#/absen/${f.dataset.sub}/${data.teaching_id}/${data.period}`; },
    absenPantauPick(data) { location.hash = `#/absen/hari/${data.date}`; },
    async saveAbsen(data, f) {
      const records = [...f.querySelectorAll('tr[data-sid]')].map((tr) => ({
        student_id: Number(tr.dataset.sid),
        status: tr.querySelector('.abs-status').value,
        note: tr.querySelector('.abs-note').value.trim()
      }));
      await api('/absensi/guru/siswa', 'PUT', { teaching_id: Number(f.dataset.tid), date: f.dataset.date, records });
      toast('Absensi tersimpan');
    },
    async staffLeave(data) { await api('/absensi/staf/izin', 'POST', data); toast('Keterangan tersimpan'); route(); },
    async saveAkun(data) { await api('/portal/akun', 'PUT', data); toast('Kontak tersimpan'); route(); },
    async respondPengaduan(data, f) {
      await api('/portal/pengaduan/' + f.dataset.id, 'PUT', data);
      closeModal(); toast('Tanggapan tersimpan'); route();
    },
    async post(data, f) { await api(f.dataset.url, 'POST', data); toast('Data tersimpan'); route(); },
    async saveScores(data, f) {
      const scores = [...f.querySelectorAll('input.score')].map((i) => ({ student_id: Number(i.dataset.sid), score: i.value === '' ? null : Number(i.value) }));
      await api(`/guru/assessments/${f.dataset.aid}/scores`, 'PUT', { scores });
      toast('Nilai tersimpan');
    }
  };

  const ACTIONS = {
    async logout() { await api('/logout', 'POST', {}); me = null; location.hash = ''; renderLogin(); },
    toggleSide() { document.getElementById('side').classList.toggle('open'); },
    closeModal,
    openRespond(el) {
      const c = complaintsCache.find((x) => String(x.id) === String(el.dataset.id));
      if (!c) return;
      openModal(`<h2>${esc(c.subject)}</h2>
        <p class="muted small">${esc(c.user_name)} (${esc(roleLabel(c.user_role))}) &bull; ${fdate(c.created_at)} &bull; ${esc(c.category)}</p>
        <p style="margin:.8rem 0;max-width:520px;white-space:pre-wrap">${esc(c.body)}</p>
        <form class="form" data-form="respondPengaduan" data-id="${c.id}">
          <div class="field"><label>Status</label><select name="status">${['baru', 'diproses', 'selesai', 'ditolak'].map((s) => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${CS_LABEL[s]}</option>`).join('')}</select></div>
          <div class="field"><label>Tanggapan</label><textarea name="response" maxlength="1000">${esc(c.response || '')}</textarea></div>
          <div class="actions"><button type="button" class="btn ghost" data-action="closeModal">Tutup</button><button class="btn" type="submit">Simpan</button></div></form>`);
    },
    allHadir() { document.querySelectorAll('.abs-status').forEach((s) => { s.value = 'hadir'; }); },
    async staffIn() { await api('/absensi/staf/masuk', 'POST', {}); toast('Absen masuk tercatat'); route(); },
    async staffOut() { await api('/absensi/staf/pulang', 'POST', {}); toast('Absen pulang tercatat'); route(); },
    pw() {
      openModal(`<h2>Ganti Password</h2><form class="form" data-form="changePw">
        <div class="field"><label>Password lama</label><input name="old_password" type="password" required></div>
        <div class="field"><label>Password baru (min. 8 karakter)</label><input name="new_password" type="password" minlength="8" required></div>
        <p class="form-msg"></p><div class="actions"><button type="button" class="btn ghost" data-action="closeModal">Batal</button><button class="btn" type="submit">Simpan</button></div></form>`);
    },
    async del(el) { if (!confirm('Hapus data ini?')) return; await api(el.dataset.url, 'DELETE'); toast('Data dihapus'); route(); },
    async resetPw(el) {
      const pw = prompt('Password baru (min. 8 karakter):'); if (!pw) return;
      await api('/admin/users/' + el.dataset.id, 'PUT', { password: pw }); toast('Password direset');
    },
    async toggleActive(el) { await api('/admin/users/' + el.dataset.id, 'PUT', { active: el.dataset.active === '1' }); route(); }
  };

  const CHANGES = { pickAssess(el) { location.hash = `#/class/${el.dataset.tid}/input/${el.value}`; } };

  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault();
    try { await FORMS[f.dataset.form](Object.fromEntries(new FormData(f)), f); } catch (err) { toast(err.message, false); }
  });
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]'); if (!el) return;
    try { await ACTIONS[el.dataset.action](el, e); } catch (err) { toast(err.message, false); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]'); if (el) CHANGES[el.dataset.change](el);
  });
  window.addEventListener('hashchange', route);
  (async function init() {
    try { const r = await api('/me'); me = r.user; route(); }
    catch (e) { if (!me) renderLogin(); }
  })();
})();