(() => {
  'use strict';

  const app = document.getElementById('app');
  let me = null;

  /* ================= Helpers ================= */
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
    try { data = await res.json(); } catch (e) { /* kosong */ }
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

  /* ================= Menu ================= */
  const MENUS = {
    admin: [['dash', 'Dashboard'], ['users', 'Pengguna'], ['classes', 'Kelas'], ['subjects', 'Mata Pelajaran'], ['teaching', 'Kelas Ajar'], ['news', 'Pengumuman'], ['monitor', 'Monitoring']],
    guru: [['dash', 'Dashboard'], ['mycls', 'Kelas Ajar Saya']],
    siswa: [['dash', 'Dashboard'], ['report', 'Nilai & Capaian']],
    kepsek: [['dash', 'Dashboard'], ['monitor', 'Monitoring Capaian']]
  };

  /* ================= Login ================= */
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
              <div class="field"><label for="u">Username</label><input id="u" name="username" autocomplete="username" required></div>
              <div class="field"><label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" required></div>
              <p class="form-msg" role="alert">${esc(msg)}</p>
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
        <p class="form-msg" role="alert"></p>
        <button class="btn full" type="submit">Simpan</button>
      </form></div></section></div>`;
  }

  /* ================= Layout ================= */
  function layout(content, active) {
    const menu = MENUS[me.role]
      .map(([k, l]) => `<a href="#/${k}" class="${active === k ? 'on' : ''}">${l}</a>`)
      .join('');
    return `
      <div class="shell">
        <aside class="side" id="side">
          <div class="brand"><span class="brand-mark">S</span><span>SIAKAD OBE</span></div>
          <nav>${menu}</nav>
        </aside>
        <div class="main">
          <header class="top">
            <button class="burger" data-action="toggleSide" aria-label="Menu">&#9776;</button>
            <span class="who">${esc(me.name)}<em>${roleLabel(me.role)}</em></span>
            <button class="btn sm ghost" data-action="pw">Ganti Password</button>
            <button class="btn sm" data-action="logout">Keluar</button>
          </header>
          <main class="content">${content}</main>
        </div>
      </div>`;
  }

  /* ================= Analisis (dipakai guru & kepsek) ================= */
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

  /* ================= Views ================= */
  async function dash() {
    const news = await api('/announcements');
    let stats = '';
    if (me.role === 'admin') {
      const s = await api('/admin/stats');
      const c = (l, v) => `<div class="card stat"><b>${v}</b><span class="muted">${l}</span></div>`;
      stats = `<div class="cards">${c('Siswa', s.siswa)}${c('Guru', s.guru)}${c('Kelas', s.kelas)}${c('Mata Pelajaran', s.mapel)}${c('Kelas Ajar', s.kelasAjar)}</div>`;
    }
    const list = news.length
      ? news.map((n) => `<div class="news"><h3>${esc(n.title)}</h3><time>${fdate(n.created_at)}</time><p>${esc(n.body)}</p></div>`).join('')
      : '<p class="muted">Belum ada pengumuman.</p>';
    return `<div><h1>Halo, ${esc(me.name)}</h1><p class="muted">Selamat datang di SIAKAD OBE Sekolah.</p></div>${stats}
      <div class="card"><h2>Pengumuman</h2>${list}</div>`;
  }

  /* ---- Admin ---- */
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
    const [list, subjects, classes, users] = await Promise.all([
      api('/admin/teaching'), api('/admin/subjects'), api('/admin/classes'), api('/admin/users?role=guru')
    ]);
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

  /* ---- Guru ---- */
  async function myClasses() {
    const list = await api('/guru/teaching');
    const cards = list.length
      ? list.map((t) => `<a class="card" href="#/class/${t.id}/cp"><h3>${esc(t.subject_name)}</h3>
          <p class="muted">${esc(t.class_name)} &bull; ${t.students} siswa</p><p class="muted small">${esc(t.semester)}</p></a>`).join('')
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
    return `<div><h1>${esc(t.subject_name)} - ${esc(t.class_name)}</h1><p class="muted">${esc(t.semester)}</p></div>
      <div class="tabs">${nav}</div>${body}`;
  }

  const TABS = {
    async cp(t) {
      const list = await api(`/guru/teaching/${t.id}/outcomes`);
      return `<div class="card"><h2>Tambah Capaian Pembelajaran</h2>
        <form class="form inline" data-form="post" data-url="/guru/teaching/${t.id}/outcomes">
          <div class="field"><label>Kode</label><input name="code" placeholder="CP1" required></div>
          <div class="field" style="grid-column:span 2"><label>Deskripsi</label><input name="description" required></div>
          <button class="btn" type="submit">Tambah</button></form></div>
        <div class="card"><table><thead><tr><th>Kode</th><th>Deskripsi</th><th></th></tr></thead><tbody>${list
          .map((o) => `<tr><td><b>${esc(o.code)}</b></td><td>${esc(o.description)}</td><td><div class="actions">${delBtn(`/guru/teaching/${t.id}/outcomes/${o.id}`)}</div></td></tr>`).join('') || '<tr><td colspan="3" class="muted">Belum ada CP.</td></tr>'}</tbody></table></div>`;
    },
    async asesmen(t) {
      const [list, cps] = await Promise.all([api(`/guru/teaching/${t.id}/assessments`), api(`/guru/teaching/${t.id}/outcomes`)]);
      return `<div class="card"><h2>Tambah Asesmen</h2>
        <form class="form inline" data-form="post" data-url="/guru/teaching/${t.id}/assessments">
          <div class="field"><label>Nama</label><input name="name" placeholder="Ulangan Harian 1" required></div>
          <div class="field"><label>CP yang diukur</label><select name="outcome_id">${opts(cps, 'id', (c) => c.code + ' - ' + c.description, 'Tanpa CP')}</select></div>
          <div class="field"><label>Bobot</label><input name="weight" type="number" step="0.1" min="0.1" value="1"></div>
          <div class="field"><label>Nilai maks.</label><input name="max_score" type="number" min="1" value="100"></div>
          <button class="btn" type="submit">Tambah</button></form></div>
        <div class="card"><table><thead><tr><th>Asesmen</th><th>CP</th><th class="num">Bobot</th><th class="num">Maks.</th><th class="num">Terisi</th><th></th></tr></thead><tbody>${list
          .map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.outcome_code || '-')}</td><td class="num">${a.weight}</td><td class="num">${a.max_score}</td><td class="num">${a.filled}</td>
            <td><div class="actions"><a class="btn sm ghost" href="#/class/${t.id}/input/${a.id}">Isi nilai</a>${delBtn('/guru/assessments/' + a.id)}</div></td></tr>`).join('') || '<tr><td colspan="6" class="muted">Belum ada asesmen.</td></tr>'}</tbody></table></div>`;
    },
    async input(t, aid) {
      const list = await api(`/guru/teaching/${t.id}/assessments`);
      const select = `<div class="card"><div class="field"><label>Pilih asesmen</label>
        <select data-change="pickAssess" data-tid="${t.id}">${opts(list, 'id', (a) => a.name, '-- Pilih --').replace(`value="${esc(aid)}"`, `value="${esc(aid)}" selected`)}</select></div></div>`;
      if (!aid) return select + '<p class="muted">Pilih asesmen untuk mengisi nilai.</p>';
      const data = await api(`/guru/assessments/${aid}/scores`);
      const rows = data.rows.map((r) => `<tr><td>${esc(r.nis)}</td><td>${esc(r.name)}</td>
        <td class="num"><input class="score" type="number" step="0.1" min="0" max="${data.assessment.max_score}" data-sid="${r.student_id}" value="${r.score ?? ''}"></td></tr>`).join('');
      return select + `<div class="card"><h2>${esc(data.assessment.name)} <span class="muted small">(maks. ${data.assessment.max_score})</span></h2>
        <form data-form="saveScores" data-aid="${aid}"><table><thead><tr><th>NIS</th><th>Nama</th><th class="num">Nilai</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="form-msg" role="alert"></p><button class="btn" type="submit">Simpan Nilai</button></form></div>`;
    },
    async analisis(t) {
      return analysisHtml(await api(`/guru/teaching/${t.id}/analysis`));
    },
    async refleksi(t) {
      const list = await api(`/guru/teaching/${t.id}/reflections`);
      return `<div class="card"><h2>Tulis Refleksi Pembelajaran</h2>
        <form class="form" data-form="post" data-url="/guru/teaching/${t.id}/reflections">
          <div class="field"><label>Refleksi (apa yang berjalan baik / kurang?)</label><textarea name="content" required></textarea></div>
          <div class="field"><label>Rencana tindak lanjut</label><textarea name="follow_up"></textarea></div>
          <div><button class="btn" type="submit">Simpan</button></div></form></div>
        <div class="card"><h2>Riwayat Refleksi</h2>${reflectionsHtml(list, true, t.id)}</div>`;
    }
  };

  /* ---- Siswa ---- */
  async function reportView() {
    const r = await api('/siswa/report');
    const head = `<h1>Nilai &amp; Capaian</h1><p class="muted">${esc(me.name)} &bull; NIS ${esc(r.student.nis)} &bull; Kelas ${esc(r.student.class_name || '-')} &bull; KKM ${r.kkm}</p>`;
    if (!r.subjects.length) return head + '<div class="card"><p class="muted">Belum ada mata pelajaran untuk kelas Anda.</p></div>';
    return head + r.subjects.map((s) => `<div class="card">
      <h2>${esc(s.subject)} <span class="muted small">- ${esc(s.teacher)} &bull; ${esc(s.semester)}</span></h2>
      <p style="margin-bottom:.8rem">Nilai akhir: <b>${fmt(s.final)}</b> ${pill(s.passed)}</p>
      <table><thead><tr><th>CP</th><th>Deskripsi</th><th>Capaian</th></tr></thead><tbody>${s.outcomes
        .map((o) => `<tr><td><b>${esc(o.code)}</b></td><td>${esc(o.description)}</td><td>${bar(o.score, r.kkm)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Belum ada CP.</td></tr>'}</tbody></table>
      <details style="margin-top:.8rem"><summary class="muted small" style="cursor:pointer">Rincian nilai asesmen</summary>
      <table><thead><tr><th>Asesmen</th><th>CP</th><th class="num">Bobot</th><th class="num">Nilai</th></tr></thead><tbody>${s.assessments
        .map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.outcome_code || '-')}</td><td class="num">${a.weight}</td><td class="num">${a.score == null ? '-' : a.score + ' / ' + a.max_score}</td></tr>`).join('')}</tbody></table></details></div>`).join('');
  }

  /* ---- Monitoring (kepsek & admin) ---- */
  async function monitorView() {
    const d = await api('/monitor/overview');
    const rows = d.items.map((i) => `<tr>
      <td><b>${esc(i.subject)}</b></td><td>${esc(i.class_name)}</td><td>${esc(i.teacher)}</td><td class="num">${i.students}</td>
      <td>${bar(i.classAvg, d.kkm)}</td>
      <td>${i.outcomes.map((o) => `<span class="pill ${o.passRate == null ? 'na' : o.passRate >= 75 ? 'ok' : 'low'}" title="Rata-rata ${fmt(o.avg)}">${esc(o.code)}: ${o.passRate == null ? '-' : Math.round(o.passRate) + '%'}</span>`).join(' ')}</td>
      <td><a class="btn sm ghost" href="#/detail/${i.id}">Detail</a></td></tr>`).join('');
    return `<h1>Monitoring Capaian Pembelajaran</h1>
      <p class="muted">Seluruh kelas ajar. KKM ${d.kkm}. Label CP menunjukkan persentase siswa yang tuntas (hijau bila &ge; 75%).</p>
      <div class="card"><table><thead><tr><th>Mapel</th><th>Kelas</th><th>Guru</th><th class="num">Siswa</th><th>Rata-rata</th><th>Ketuntasan CP</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="muted">Belum ada kelas ajar.</td></tr>'}</tbody></table></div>`;
  }

  async function detailView(id) {
    const [a, refl] = await Promise.all([api(`/monitor/teaching/${id}/analysis`), api(`/monitor/teaching/${id}/reflections`)]);
    return `<p><a href="#/monitor" class="btn sm ghost">&larr; Kembali</a></p>${analysisHtml(a)}
      <div class="card"><h2>Refleksi Pembelajaran</h2>${reflectionsHtml(refl, false, id)}</div>`;
  }

  const VIEWS = {
    admin: { dash, users: usersView, classes: classesView, subjects: subjectsView, teaching: teachingAdminView, news: newsView, monitor: monitorView, detail: detailView },
    guru: { dash, mycls: myClasses, class: classDetail },
    siswa: { dash, report: reportView },
    kepsek: { dash, monitor: monitorView, detail: detailView }
  };

  /* ================= Router ================= */
  async function route() {
    closeModal();
    if (!me) return renderLogin();
    if (me.must_change) return renderForceChange();
    const [, view = 'dash', id, tab, extra] = location.hash.split('/');
    const fn = VIEWS[me.role][view];
    if (!fn) { location.hash = '#/dash'; return; }
    const active = view === 'class' ? 'mycls' : view === 'detail' ? 'monitor' : view;
    document.title = 'SIAKAD OBE Sekolah';
    try {
      const html = await fn(id, tab, extra);
      app.innerHTML = layout(html, active);
    } catch (e) {
      if (!me) return;
      app.innerHTML = layout(`<div class="card"><p class="err">${esc(e.message)}</p></div>`, active);
    }
  }

  /* ================= Form handlers ================= */
  const FORMS = {
    async login(data, f) {
      const msg = f.querySelector('.form-msg');
      msg.textContent = '';
      try {
        const r = await api('/login', 'POST', data);
        me = r.user;
        location.hash = '#/dash';
        route();
      } catch (e) { msg.textContent = e.message; }
    },
    async changePw(data, f) {
      const msg = f.querySelector('.form-msg');
      msg.textContent = '';
      try {
        await api('/change-password', 'POST', data);
        me.must_change = false;
        closeModal();
        toast('Password berhasil diganti');
        route();
      } catch (e) { msg.textContent = e.message; }
    },
    async post(data, f) {
      await api(f.dataset.url, 'POST', data);
      toast('Data tersimpan');
      route();
    },
    async saveScores(data, f) {
      const scores = [...f.querySelectorAll('input.score')].map((i) => ({ student_id: Number(i.dataset.sid), score: i.value === '' ? null : Number(i.value) }));
      await api(`/guru/assessments/${f.dataset.aid}/scores`, 'PUT', { scores });
      toast('Nilai tersimpan');
    }
  };

  const ACTIONS = {
    async logout() {
      await api('/logout', 'POST', {});
      me = null;
      location.hash = '';
      renderLogin();
    },
    toggleSide() { document.getElementById('side').classList.toggle('open'); },
    closeModal,
    pw() {
      openModal(`<h2>Ganti Password</h2>
        <form class="form" data-form="changePw">
          <div class="field"><label>Password lama</label><input name="old_password" type="password" required></div>
          <div class="field"><label>Password baru (min. 8 karakter)</label><input name="new_password" type="password" minlength="8" required></div>
          <p class="form-msg" role="alert"></p>
          <div class="actions"><button type="button" class="btn ghost" data-action="closeModal">Batal</button><button class="btn" type="submit">Simpan</button></div>
        </form>`);
    },
    async del(el) {
      if (!confirm('Hapus data ini? Tindakan tidak dapat dibatalkan.')) return;
      await api(el.dataset.url, 'DELETE');
      toast('Data dihapus');
      route();
    },
    async resetPw(el) {
      const pw = prompt('Password baru untuk pengguna ini (min. 8 karakter). Pengguna wajib menggantinya saat login:');
      if (!pw) return;
      await api('/admin/users/' + el.dataset.id, 'PUT', { password: pw });
      toast('Password direset');
    },
    async toggleActive(el) {
      await api('/admin/users/' + el.dataset.id, 'PUT', { active: el.dataset.active === '1' });
      route();
    }
  };

  const CHANGES = {
    pickAssess(el) { location.hash = `#/class/${el.dataset.tid}/input/${el.value}`; }
  };

  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    e.preventDefault();
    try { await FORMS[f.dataset.form](Object.fromEntries(new FormData(f)), f); }
    catch (err) { toast(err.message, false); }
  });
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    try { await ACTIONS[el.dataset.action](el, e); }
    catch (err) { toast(err.message, false); }
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (el) CHANGES[el.dataset.change](el);
  });
  window.addEventListener('hashchange', route);

  /* ================= Init ================= */
  (async function init() {
    try {
      const r = await api('/me');
      me = r.user;
      route();
    } catch (e) {
      if (!me) renderLogin();
    }
  })();
})();
