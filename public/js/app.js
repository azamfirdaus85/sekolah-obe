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
      ['reset', '🔐 Permintaan Reset Password'],
      ['classes', '🏫 Kelas'],
      ['naik', '⬆️ Kenaikan Kelas'],
      ['periode', '📆 Tahun Ajaran'],
      ['subjects', '📚 Mata Pelajaran'],
      ['teaching', '👩‍🏫 Kelas Ajar'],
      ['jadwal', '🕘 Jadwal Pelajaran'],
      ['news', '📢 Pengumuman'],
      ['absen', '🗓️ Absensi'],
      ['monitor', '📊 Monitoring'],
      ['rapor', '🧾 E-Rapor'],
      ['export', '📥 Export Data'],
      ['log', '📜 Log Aktivitas'],
      ['backup', '💾 Backup Data'],
      ['akademik', '🎓 Akademik'],
      ['administrasi', '🗂️ Administrasi'],
      ['pengaduan', '📬 Layanan Pengaduan'],
      ['ekskul', '🏅 Ekstrakurikuler'],
      ['bk', '🧑‍⚕️ Bimbingan Konseling'],
      ['keuangan', '💰 Keuangan / SPP'],
      ['akun', '👤 Akun']
    ],
    guru: [
      ['dash', '🏠 Dashboard'],
      ['mycls', '📚 Kelas Ajar Saya'],
      ['wali', '🏫 Wali Kelas'],
      ['lms', '🗂️ Materi & Tugas'],
      ['absen', '🗓️ Absensi'],
      ['akademik', '🎓 Akademik'],
      ['pengaduan', '📬 Layanan Pengaduan'],
      ['akun', '👤 Akun']
    ],
    siswa: [
      ['dash', '🏠 Dashboard'],
      ['report', '📈 Nilai & Capaian'],
      ['lms', '🗂️ Materi & Tugas'],
      ['absen', '🗓️ Absensi Saya'],
      ['akademik', '🎓 Akademik'],
      ['pengaduan', '📬 Layanan Pengaduan'],
      ['ekskul', '🏅 Ekstrakurikuler'],
      ['keuangan', '💰 Tagihan SPP'],
      ['akun', '👤 Akun']
    ],
    kepsek: [
      ['dash', '🏠 Dashboard'],
      ['monitor', '📊 Monitoring Capaian'],
      ['rapor', '🧾 E-Rapor'],
      ['absen', '🗓️ Absensi'],
      ['akademik', '🎓 Akademik'],
      ['administrasi', '🗂️ Administrasi'],
      ['pengaduan', '📬 Layanan Pengaduan'],
      ['bk', '🧑‍⚕️ Bimbingan Konseling'],
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
              <button type="button" class="btn ghost full" data-action="forgotPw" style="margin-top:10px">
                Lupa Password?
              </button>
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
            <div id="gsWrap" style="position:relative;flex:1 1 220px;max-width:360px;min-width:0">
              <input id="gsInput" type="search" placeholder="🔍 Cari siswa, kelas, mapel, pengumuman..." autocomplete="off" maxlength="40" aria-label="Pencarian global" style="width:100%;padding:.5rem .8rem;border-radius:10px;border:1px solid rgba(100,116,139,.4);background:rgba(100,116,139,.1);color:inherit;font:inherit;font-size:.85rem">
              <div id="gsBox" style="display:none;position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:60;background:#fff;color:#0f172a;border:1px solid #e2e8f0;border-radius:12px;box-shadow:0 12px 32px rgba(15,23,42,.2);max-height:70vh;overflow:auto;min-width:min(340px,86vw)"></div>
            </div>
            <span class="who">${esc(me.name)}<em>${roleLabel(me.role)}</em></span>
            <button class="btn sm ghost" data-action="bell" title="Notifikasi" style="position:relative">🔔<span id="bellCount" style="display:none;position:absolute;top:-6px;right:-6px;min-width:18px;height:18px;padding:0 4px;border-radius:99px;background:#ef4444;color:#fff;font-size:.68rem;font-weight:700;line-height:18px;text-align:center"></span></button>
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
    const [news, ring, grafik] = await Promise.all([api('/announcements'), api('/dashboard/ringkasan').catch(() => null), api('/dashboard/grafik').catch(() => null)]);
    let stats = '';
    if (me.role === 'admin') {
      const [s, per] = await Promise.all([api('/admin/stats'), api('/admin/periods/active').catch(() => null)]);
      const c = (icon, l, v, color) => `
        <div class="card stat" style="border-left:4px solid ${color}">
          <div style="display:flex;justify-content:space-between;align-items:start">
            <div><b style="font-size:2.4rem">${v}</b><span class="muted" style="text-transform:uppercase;letter-spacing:.08em;font-size:.7rem;font-weight:700">${l}</span></div>
            <span style="font-size:2rem;background:${color}1a;width:52px;height:52px;display:grid;place-items:center;border-radius:14px">${icon}</span>
          </div>
        </div>`;
      stats = `<p class="muted" style="margin:1rem 0 0">📆 Periode aktif: <b>${per ? esc(per.semester) + ' ' + esc(per.name) : 'belum diatur'}</b> ${per ? '' : '<a href="#/periode">Atur sekarang</a>'}</p><div class="cards">
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
    const home = homeHtml(ring) + chartsHtml(grafik);
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
        <a class="btn ghost" href="/api/admin/users/template">📄 Unduh Template Impor</a>
      </div>
      <div class="card"><h2>Impor dari Excel</h2>
        <p class="muted small" style="margin-bottom:.8rem">Unduh template, isi data siswa atau guru, lalu unggah di sini. Maksimal 100 baris per file.</p>
        <form class="form inline" data-form="importUsers">
          <div class="field"><label>File Excel (.xlsx)</label><input type="file" name="file" accept=".xlsx,.xls" required></div>
          <button class="btn" type="submit">Impor</button>
        </form></div>
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
    const [list, gurus] = await Promise.all([api('/admin/classes'), api('/admin/users?role=guru')]);
    const waliOpts = (c) => '<option value="">- Belum ada -</option>' + gurus
      .filter((g) => g.active || String(g.id) === String(c.homeroom_teacher_id))
      .map((g) => `<option value="${esc(g.id)}" ${String(g.id) === String(c.homeroom_teacher_id) ? 'selected' : ''}>${esc(g.name)}</option>`).join('');
    return `<h1>Kelas</h1>
      <div class="card"><form class="form inline" data-form="post" data-url="/admin/classes">
        <div class="field"><label>Nama kelas</label><input name="name" placeholder="X RPL 1" required></div>
        <div class="field"><label>Tahun ajaran</label><input name="year" placeholder="2026/2027"></div>
        <button class="btn" type="submit">Tambah</button></form></div>
      <div class="card"><table><thead><tr><th>Kelas</th><th>Tahun</th><th>Wali Kelas</th><th class="num">Siswa</th><th></th></tr></thead><tbody>${list
        .map((c) => `<tr><td>${esc(c.name)}</td><td>${esc(c.year || '')}</td><td><select data-change="setHomeroom" data-id="${c.id}">${waliOpts(c)}</select></td><td class="num">${c.students}</td><td><div class="actions">${delBtn('/admin/classes/' + c.id)}</div></td></tr>`).join('')}</tbody></table></div>`;
  }

  // ---------- KENAIKAN KELAS & KELULUSAN (admin) ----------
  async function naikView(fromId) {
    const classes = await api('/admin/classes');
    const from = classes.find((c) => String(c.id) === String(fromId));
    const [students, alumni] = await Promise.all([
      from ? api('/admin/classes/' + from.id + '/students') : Promise.resolve([]),
      api('/admin/alumni')
    ]);

    const fromOpts = '<option value="">-- Pilih kelas asal --</option>' + classes
      .map((c) => `<option value="${esc(c.id)}" ${from && from.id === c.id ? 'selected' : ''}>${esc(c.name)} (${c.students} siswa)</option>`).join('');

    let proses = '';
    if (from) {
      const toOpts = '<option value="">-- Pilih tujuan --</option>' + classes
        .filter((c) => c.id !== from.id)
        .map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')
        + '<option value="LULUS">🎓 Lulus (keluar dari sekolah)</option>';
      const rows = students.length
        ? students.map((s) => `<tr><td><input type="checkbox" class="pick-siswa" value="${s.id}" checked></td><td>${esc(s.nis || '')}</td><td>${esc(s.name)}</td></tr>`).join('')
        : '<tr><td colspan="3" class="muted">Tidak ada siswa di kelas ini.</td></tr>';
      proses = `<div class="card"><h2>Siswa kelas ${esc(from.name)}</h2>
        <form class="form" data-form="promote" data-from="${from.id}">
          <div class="field"><label>Pindahkan ke</label><select name="target" required>${toOpts}</select></div>
          <div class="field"><label><input type="checkbox" name="deactivate"> Nonaktifkan akun siswa yang lulus</label></div>
          <div class="table-wrap"><table><thead><tr><th style="width:36px"><input type="checkbox" data-action="toggleAllSiswa" checked></th><th>NIS</th><th>Nama</th></tr></thead><tbody>${rows}</tbody></table></div>
          <div><button class="btn" type="submit">Proses</button></div>
        </form></div>`;
    }

    const alumniRows = alumni.length
      ? alumni.map((a) => `<tr><td>${esc(a.nis || '')}</td><td>${esc(a.name)}</td><td>${esc(a.graduated_from || '-')}</td><td>${esc(a.graduated_at || '-')}</td>
          <td><select data-change="restoreAlumni" data-id="${a.id}"><option value="">Kembalikan ke kelas...</option>${classes.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></td></tr>`).join('')
      : '<tr><td colspan="5" class="muted">Belum ada alumni.</td></tr>';

    return `<h1>Kenaikan Kelas & Kelulusan</h1>
      <p class="muted">Pindahkan siswa satu kelas ke kelas baru sekaligus, atau luluskan. Cetak E-Rapor semester ini lebih dulu sebelum memproses, karena setelah siswa pindah, rapor semester lamanya bisa tidak terbaca lagi.</p>
      <div class="card"><div class="field"><label>Kelas asal</label><select data-change="pickNaikKelas">${fromOpts}</select></div></div>
      ${proses}
      <div class="card"><h2>Alumni</h2><div class="table-wrap"><table><thead><tr><th>NIS</th><th>Nama</th><th>Kelas terakhir</th><th>Tanggal lulus</th><th></th></tr></thead><tbody>${alumniRows}</tbody></table></div></div>`;
  }

   // ---------- WALI KELAS (guru) ----------
  async function waliView(semParam) {
    const sem = semParam ? decodeURIComponent(semParam) : '';
    const d = await api('/guru/homeroom' + (sem ? '?semester=' + encodeURIComponent(sem) : ''));

    if (!d.classes.length) {
      return '<h1>Wali Kelas</h1><div class="card"><p class="muted">Anda belum ditetapkan sebagai wali kelas. Hubungi admin.</p></div>';
    }

    const picker = d.semesters.length
      ? `<div class="card"><div class="field"><label>Semester</label><select data-change="pickWaliSemester">${d.semesters
          .map((x) => `<option value="${esc(x)}" ${x === d.semester ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></div>
          <p class="muted small">Nilai dan absensi dihitung dari semester yang dipilih. Siswa ditandai "Perlu perhatian" bila ada nilai di bawah KKM atau alpa ${d.alpa_limit} kali atau lebih.</p></div>`
      : '';

    return '<h1>Wali Kelas</h1>' + picker + d.classes.map((c) => {
      const rows = c.students.length
        ? c.students.map((s) => {
            const a = s.attendance || {};
            return `<tr><td>${esc(s.nis || '')}</td>
              <td>${esc(s.name)}${s.needs_attention ? ' <span class="pill warn">Perlu perhatian</span>' : ''}</td>
              <td class="num">${fmt(s.average)}</td>
              <td>${s.below_kkm.length ? `<span class="pill low">${esc(s.below_kkm.join(', '))}</span>` : (s.average == null ? '<span class="pill na">Belum ada nilai</span>' : '<span class="pill ok">Aman</span>')}</td>
              <td class="num">${a.hadir || 0}</td><td class="num">${a.izin || 0}</td><td class="num">${a.sakit || 0}</td>
              <td class="num ${a.alpa ? 'low-score' : ''}">${a.alpa || 0}</td>
              <td class="num">${s.attendance_pct == null ? '-' : s.attendance_pct + '%'}</td>
              <td><button class="btn sm ghost" data-action="bukaRapor" data-url="/guru/homeroom/rapor/${s.user_id}">🖨️ Rapor</button></td></tr>`;
          }).join('')
        : '<tr><td colspan="10" class="muted">Belum ada siswa di kelas ini.</td></tr>';
      return `<div class="card"><h2>${esc(c.name)}</h2>
        <p class="muted">${c.total} siswa &bull; ${c.under_kkm} siswa punya nilai di bawah KKM ${c.kkm} &bull; ${c.attention} siswa perlu perhatian</p>
        <div class="table-wrap"><table><thead><tr><th>NIS</th><th>Nama</th><th class="num">Rata-rata</th><th>Di bawah KKM</th><th class="num">Hadir</th><th class="num">Izin</th><th class="num">Sakit</th><th class="num">Alpa</th><th class="num">% Hadir</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }).join('');
  }

  async function periodeView() {
    const list = await api('/admin/periods');
    const rows = list.length
      ? list.map((p) => `<tr>
          <td><b>${esc(p.semester)} ${esc(p.name)}</b></td>
          <td>${p.is_active ? '<span class="pill ok">Aktif</span>' : '<span class="pill na">Nonaktif</span>'}</td>
          <td class="num">${p.used}</td>
          <td><div class="actions">${p.is_active ? '' : `<button class="btn sm ghost" data-action="activatePeriod" data-id="${p.id}">Jadikan Aktif</button>${delBtn('/admin/periods/' + p.id)}`}</div></td></tr>`).join('')
      : '<tr><td colspan="4" class="muted">Belum ada periode.</td></tr>';
    return `<h1>Tahun Ajaran</h1><p class="muted">Periode yang aktif otomatis dipakai saat membuat Kelas Ajar baru.</p>
      <div class="card"><h2>Tambah Periode</h2><form class="form inline" data-form="post" data-url="/admin/periods">
        <div class="field"><label>Tahun ajaran</label><input name="name" placeholder="2026/2027" required></div>
        <div class="field"><label>Semester</label><select name="semester"><option>Ganjil</option><option>Genap</option></select></div>
        <button class="btn" type="submit">Tambah</button></form></div>
      <div class="card"><table><thead><tr><th>Periode</th><th>Status</th><th class="num">Kelas Ajar</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
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
        <div class="field"><label>Semester (kosong = periode aktif)</label><input name="semester" placeholder="Otomatis"></div>
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
    const head = `<h1>Nilai & Capaian</h1><p><button class="btn" data-action="bukaRapor" data-url="/siswa/rapor">🖨️ Cetak E-Rapor</button></p><p class="muted">${esc(me.name)} &bull; NIS ${esc(r.student.nis)} &bull; Kelas ${esc(r.student.class_name || '-')} &bull; KKM ${r.kkm}</p>`;
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

    const row = (l, v) =>
      `<tr><td class="muted" style="width:150px">${l}</td><td><b>${esc(v || '-')}</b></td></tr>`;

    const foto = u.avatar_data
      ? `<img src="${esc(u.avatar_data)}" alt="Foto Profil"
           style="width:130px;height:130px;object-fit:cover;border-radius:50%;border:4px solid #e2e8f0">`
      : `<div style="width:130px;height:130px;border-radius:50%;background:#6366f1;color:white;display:grid;place-items:center;font-size:2.5rem;font-weight:bold">
           ${esc((u.name || 'U').charAt(0).toUpperCase())}
         </div>`;

    return `<h1>Akun</h1>
      <div class="card">
        <h2>📸 Foto Profil</h2>
        <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
          ${foto}
          <div>
            <form class="form" data-form="saveFotoProfil">
              <div class="field">
                <label>Pilih Foto Profil</label>
                <input type="file" name="foto" accept="image/jpeg,image/png,image/webp" required>
              </div>
              <button class="btn" type="submit">Unggah Foto</button>
            </form>
            ${u.avatar_data
              ? `<button class="btn danger" data-action="hapusFotoProfil" style="margin-top:10px">Hapus Foto</button>`
              : ''}
            <p class="muted small">Format JPG, PNG, WEBP. Maksimal 1 MB.</p>
          </div>
        </div>
      </div>

      <div class="grid2">
        <div class="card">
          <h2>Profil</h2>
          <table><tbody>
            ${row('Nama', u.name)}
            ${row('Username', u.username)}
            ${row('Peran', roleLabel(u.role))}
            ${d.siswa ? row('NIS', d.siswa.nis) + row('Kelas', d.siswa.class_name) : ''}
          </tbody></table>
        </div>

        <div class="card">
          <h2>Kontak</h2>
          <form class="form" data-form="saveAkun">
            <div class="field">
              <label>Email</label>
              <input name="email" type="email" maxlength="120" value="${esc(u.email || '')}">
            </div>
            <div class="field">
              <label>No. Telepon</label>
              <input name="phone" maxlength="20" value="${esc(u.phone || '')}">
            </div>
            <div><button class="btn" type="submit">Simpan</button></div>
          </form>
        </div>
      </div>

      <div class="card">
        <h2>Keamanan</h2>
        <p class="muted small" style="margin-bottom:.8rem">
          Ganti password secara berkala. Minimal 8 karakter.
        </p>
        <button class="btn ghost" data-action="pw">🔑 Ganti Password</button>
      </div>`;
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

  /* ===================== GRAFIK DASHBOARD ===================== */
  function hbar(label, pct, text, color) {
    const w = Math.max(0, Math.min(100, pct || 0));
    return `<div style="display:grid;grid-template-columns:minmax(80px,34%) 1fr 56px;gap:.6rem;align-items:center;margin:.5rem 0;font-size:.82rem">
      <span title="${esc(label)}" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(label)}</span>
      <div style="background:rgba(100,116,139,.2);border-radius:99px;height:10px;overflow:hidden"><i style="display:block;height:100%;width:${w}%;background:${color};border-radius:99px"></i></div>
      <b style="text-align:right">${esc(text)}</b></div>`;
  }

  function chartsHtml(g) {
    if (!g) return '';
    const nilai = g.nilai.rows.length
      ? g.nilai.rows.map((r) => hbar(r.label, r.value, fmt(r.value), r.value >= g.kkm ? '#10b981' : '#ef4444')).join('') +
        `<p class="muted small" style="margin-top:.6rem">Hijau = di atas KKM (${g.kkm}), merah = di bawah KKM.</p>`
      : '<p class="muted">Belum ada data nilai.</p>';

    let hadir;
    if (g.kehadiran.type === 'ringkas') {
      const colors = { hadir: '#10b981', izin: '#f59e0b', sakit: '#6366f1', alpa: '#ef4444' };
      const total = g.kehadiran.rows.reduce((a, r) => a + r.count, 0);
      hadir = total
        ? g.kehadiran.rows.map((r) => hbar(r.label, r.pct, r.count + ' (' + r.pct + '%)', colors[r.key] || '#6366f1')).join('')
        : '<p class="muted">Belum ada data absensi.</p>';
    } else {
      const any = g.kehadiran.rows.some((r) => r.pct != null);
      hadir = any
        ? `<div style="display:flex;align-items:flex-end;gap:.5rem;height:150px;margin-top:.6rem">${g.kehadiran.rows.map((r) => `
            <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;font-size:.7rem;min-width:0">
              <span>${r.pct == null ? '-' : r.pct + '%'}</span>
              <i style="display:block;width:100%;max-width:36px;height:${r.pct == null ? 2 : Math.max(2, r.pct)}px;background:#6366f1;border-radius:6px 6px 0 0"></i>
              <small class="muted" style="white-space:nowrap">${esc(r.label)}</small></div>`).join('')}</div>
          <p class="muted small" style="margin-top:.6rem">Persentase siswa berstatus hadir per hari.</p>`
        : '<p class="muted">Belum ada data absensi 7 hari terakhir.</p>';
    }

    return `<div class="grid2">
      <div class="card"><h2>📊 ${esc(g.nilai.title)}</h2>${nilai}</div>
      <div class="card"><h2>📅 ${esc(g.kehadiran.title)}</h2>${hadir}</div></div>`;
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

    const [d, sesiData] = await Promise.all([
      api(`/absensi/guru/siswa?teaching_id=${tid}&date=${period}`),
      api(`/absensi/guru/sesi?teaching_id=${tid}`).catch(() => ({ session: null }))
    ]);
    const sesi = sesiData.session || sesiData.activeSession || null;
    const sesiHtml = `<div class="card"><h2>🟢 Sesi Absensi Mandiri</h2>
      ${sesi && sesi.status === 'open' ? `<p>Sesi sedang <b>dibuka</b>. Ditutup pada: <b>${esc(sesi.closes_at || '-')}</b></p>
        <div class="actions"><button class="btn danger" data-action="tutupSesi" data-id="${esc(sesi.id)}">Tutup Sesi</button></div>`
        : '<p class="muted">Belum ada sesi absensi mandiri yang aktif untuk kelas ini.</p>'}
      <form class="form inline" data-form="bukaSesi" data-tid="${esc(tid)}">
        <div class="field"><label>Durasi sesi (menit)</label><input name="durasi_menit" type="number" min="1" max="1440" value="30" required></div>
        <button class="btn" type="submit" ${sesi && sesi.status === 'open' ? 'disabled' : ''}>Buka Sesi Absensi</button>
      </form><p class="muted small">Siswa di kelas ini dapat melakukan absensi mandiri selama sesi masih aktif.</p></div>`;
    const rows = d.rows
      .map((r) => `<tr data-sid="${r.student_id}"><td>${esc(r.nis)}</td><td>${esc(r.name)}</td>
        <td><select class="abs-status">${STATUS_SISWA.map((s) => `<option value="${s}" ${(r.status || 'hadir') === s ? 'selected' : ''}>${STATUS_LABEL[s]}</option>`).join('')}</select></td>
        <td><input class="abs-note" maxlength="200" placeholder="Keterangan" value="${esc(r.note || '')}"></td></tr>`)
      .join('');
    const belum = d.rows.length && d.rows.every((r) => !r.status);
    return head + tabs + picker + sesiHtml + `<div class="card"><h2>${esc(d.teaching.subject_name)} - ${esc(d.teaching.class_name)}</h2>
      <p class="muted small">${fday(d.date)}${belum ? ' &bull; Belum pernah diabsen, semua diisi Hadir secara default. Ubah yang tidak hadir lalu simpan.' : ''}</p>
      ${d.rows.length ? `<form data-form="saveAbsen" data-tid="${d.teaching.id}" data-date="${esc(d.date)}">
        <div class="table-wrap"><table><thead><tr><th>NIS</th><th>Nama</th><th>Status</th><th>Keterangan</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="actions" style="margin-top:1rem"><button class="btn ghost" type="button" data-action="allHadir">Semua Hadir</button><button class="btn" type="submit">Simpan Absensi</button></div></form>`
        : '<p class="muted">Belum ada siswa di kelas ini.</p>'}</div>`;
  }

  // ---------- SISWA ----------
  async function absenSiswa() {
    const [d, sesiData] = await Promise.all([
      api('/absensi/siswa/saya'),
      api('/absensi/siswa/sesi-aktif').catch(() => ({ sessions: [] }))
    ]);
    const sesiAktif = Array.isArray(sesiData) ? sesiData : (sesiData.sessions || sesiData.rows || []);
    const sesiHtml = `<div class="card"><h2>📍 Sesi Absensi Aktif</h2>
      ${sesiAktif.length ? sesiAktif.map((x) => `<div class="news"><h3>${esc(x.subject_name || x.teaching_name || 'Mata Pelajaran')} - ${esc(x.class_name || 'Kelas')}</h3>
        <p class="muted small">Guru: ${esc(x.teacher_name || '-')} &bull; Batas waktu: <b>${esc(x.closes_at || '-')}</b></p>
        <button class="btn" data-action="absenMandiri" data-id="${esc(x.id || x.session_id)}">Absen Sekarang</button></div>`).join('')
        : '<p class="muted">Belum ada sesi absensi yang dibuka untuk kelas Anda.</p>'}
      <button class="btn sm ghost" data-action="refreshAbsen">Perbarui</button></div>`;
    const s = d.summary;
    const total = s.hadir + s.izin + s.sakit + s.alpa;
    const pct = total ? Math.round((s.hadir / total) * 100) : null;
    const rows = d.rows.length
      ? d.rows.map((r) => `<tr><td>${fday(r.date)}</td><td>${esc(r.subject_name)}</td><td>${statusPill(r.status)}</td><td>${esc(r.note || '')}</td></tr>`).join('')
      : '<tr><td colspan="4" class="muted">Belum ada data absensi.</td></tr>';
    return `<h1>Absensi Saya</h1><p class="muted">NIS ${esc(d.nis)}</p>
      <div class="cards">${statCard('Hadir', s.hadir)}${statCard('Izin', s.izin)}${statCard('Sakit', s.sakit)}${statCard('Alpa', s.alpa)}${statCard('% Kehadiran', pct == null ? '-' : pct + '%')}</div>
      ${sesiHtml}
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

  /* ===================== E-RAPOR ===================== */
  async function raporAdminView(cid) {
    const d = await api('/monitor/rapor-daftar');
    const kelas = d.classes.find((c) => String(c.id) === String(cid));
    const list = kelas ? d.students.filter((u) => String(u.class_id) === String(kelas.id)) : d.students;
    const rows = list.length
      ? list.map((u) => `<tr><td>${esc(u.nis || '')}</td><td>${esc(u.name)}</td><td>${esc(u.class_name || '-')}</td>
          <td><div class="actions"><button class="btn sm" data-action="bukaRapor" data-url="/monitor/rapor/${u.user_id}">🖨️ Cetak Rapor</button></div></td></tr>`).join('')
      : '<tr><td colspan="4" class="muted">Tidak ada siswa.</td></tr>';
    return `<h1>E-Rapor</h1><p class="muted">Pilih siswa untuk melihat rapor. Klik "Cetak / Simpan PDF", lalu pilih "Simpan sebagai PDF" pada jendela cetak.</p>
      <div class="card"><div class="field"><label>Filter kelas</label><select data-change="pickRaporKelas"><option value="">Semua kelas</option>${d.classes.map((c) => `<option value="${c.id}" ${kelas && kelas.id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></div></div>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>NIS</th><th>Nama</th><th>Kelas</th><th></th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
  }

  /* ===================== EXPORT NILAI & ABSENSI ===================== */
  async function exportView() {
    const [classes, periods] = await Promise.all([api('/admin/classes'), api('/admin/periods')]);
    const classOpts = '<option value="">Semua kelas</option>' + classes
      .map((c) => `<option value="${esc(c.id)}">${esc(c.name)} (${c.students} siswa)</option>`).join('');
    const semOpts = '<option value="">Semester bawaan (sama seperti E-Rapor)</option>' + periods
      .map((p) => { const v = `${p.semester} ${p.name}`; return `<option value="${esc(v)}">${esc(v)}${p.is_active ? ' (aktif)' : ''}</option>`; }).join('');
    return `<h1>Export Data</h1>
      <p class="muted">Unduh nilai dan absensi siswa dalam format Excel untuk laporan ke dinas atau arsip. Angkanya sama dengan yang tercetak di E-Rapor.</p>
      <div class="card"><h2>Pilih Data</h2>
        <div class="form inline">
          <div class="field"><label>Kelas</label><select id="expKelas">${classOpts}</select></div>
          <div class="field"><label>Semester</label><select id="expSemester">${semOpts}</select></div>
        </div>
        <div class="actions" style="margin-top:1rem">
          <button class="btn" data-action="exportXlsx" data-type="nilai">📥 Export Nilai</button>
          <button class="btn" data-action="exportXlsx" data-type="absensi">📥 Export Absensi</button>
        </div>
        <p class="muted small" style="margin-top:.8rem">Untuk sekolah besar, pilih satu kelas per unduhan agar prosesnya cepat. Siswa yang sudah lulus tidak ikut diekspor.</p>
      </div>`;
  }

  /* ===================== MATERI & TUGAS (LMS) ===================== */
  const lmsLink = (u) => (u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">🔗 Buka tautan</a>` : '');
  const lmsText = (t) => (t ? `<p style="white-space:pre-wrap;margin:.4rem 0">${esc(t)}</p>` : '');

  async function lmsView(id, tab, extra) {
    const guru = me.role === 'guru';
    console.log('ROLE LOGIN:', me.role);
console.log('STATUS GURU:', guru);

    if (!id) {
      const d = await api('/lms/teachings');
      const cards = d.rows.length
        ? d.rows.map((t) => `<a class="card" href="#/lms/${t.id}"><h3>${esc(t.subject_name)}</h3>
            <p class="muted">${guru ? esc(t.class_name) : esc(t.teacher_name)}</p>
            <p class="muted small">${t.materials} materi &bull; ${t.tasks} tugas${!guru && t.pending ? ` &bull; <b>${t.pending} belum dikumpulkan</b>` : ''}</p>
            <p class="muted small">${esc(t.semester)}</p></a>`).join('')
        : `<p class="muted">${guru ? 'Belum ada kelas ajar. Hubungi admin.' : 'Belum ada mata pelajaran untuk kelas Anda.'}</p>`;
      return `<h1>Materi & Tugas</h1><div class="grid2">${cards}</div>`;
    }

    // Guru: daftar pengumpulan satu tugas
    if (guru && tab === 'tugas' && extra) {
      const d = await api(`/lms/tasks/${extra}/submissions`);
      const done = d.rows.filter((r) => r.submitted_at).length;
     
const rows = d.rows.length
  ? d.rows.map((r) => `<tr>
      <td>${esc(r.nis || '')}</td>
      <td>${esc(r.name)}</td>
      <td>${r.submitted_at ? (r.late ? '<span class="pill warn">Terlambat</span>' : '<span class="pill ok">Terkumpul</span>') : '<span class="pill na">Belum</span>'}</td>
      <td class="small">${r.submitted_at ? esc(fdateTime(r.submitted_at)) : '-'}</td>
      <td>${lmsText(r.answer)}${lmsLink(r.link)}</td>
      <td>
        ${r.submitted_at ? `
          <form class="form" data-form="gradeLms" data-task="${extra}" style="min-width:170px">
            <input type="hidden" name="student_id" value="${r.student_id}">
            <div class="field">
              <label>Nilai (0–100)</label>
              <input type="number" name="score" min="0" max="100" step="1" required value="${r.score ?? ''}">
            </div>
            <div class="field">
              <label>Komentar guru</label>
              <textarea name="feedback" maxlength="1000">${esc(r.feedback || '')}</textarea>
            </div>
            <button class="btn sm" type="submit">Simpan Penilaian</button>
          </form>
          ${r.score != null ? `<p class="small muted">Nilai tersimpan: ${r.score}/100</p>` : '<p class="small muted">Belum dinilai</p>'}
        ` : '<span class="muted small">Belum bisa dinilai</span>'}
      </td>
    </tr>`).join('')
  : '<tr><td colspan="6" class="muted">Belum ada siswa di kelas ini.</td></tr>';

      return `<p><a href="#/lms/${id}" class="btn sm ghost">&larr; Kembali</a></p>
        <h1>${esc(d.task.title)}</h1>
        <p class="muted">${esc(d.teaching.subject_name)} - ${esc(d.teaching.class_name)}${d.task.due_date ? ' &bull; Tenggat ' + fdate2(d.task.due_date) : ''} &bull; ${done} dari ${d.rows.length} siswa sudah mengumpulkan</p>
        <div class="card"><div class="table-wrap"><table><thead><tr><th>NIS</th><th>Nama</th><th>Status</th><th>Waktu</th><th>Jawaban</th><th>Penilaian</th></tr></thead><tbody>${rows}</tbody></table></div></div>`;
    }

    const d = await api('/lms/teaching/' + id);
    const t = d.teaching;
    const head = `<p><a href="#/lms" class="btn sm ghost">&larr; Kembali</a></p>
      <h1>${esc(t.subject_name)} - ${esc(t.class_name)}</h1><p class="muted">${esc(t.teacher_name)} &bull; ${esc(t.semester)}</p>`;

    const materials = d.materials.length
      ? d.materials.map((m) => `<div class="news"><h3>${esc(m.title)}</h3><time>${fdate(m.created_at)}</time>${lmsText(m.description)}${lmsLink(m.link)}
          ${guru ? delBtn('/lms/materials/' + m.id) : ''}</div>`).join('')
      : '<p class="muted">Belum ada materi.</p>';

    if (guru) {
      const tasks = d.tasks.length
        ? d.tasks.map((k) => `<div class="news"><h3>${esc(k.title)}</h3>
            <time>${fdate(k.created_at)}${k.due_date ? ' &bull; Tenggat ' + fdate2(k.due_date) : ''}</time>${lmsText(k.instructions)}${lmsLink(k.link)}
            <div class="actions" style="margin-top:.5rem"><a class="btn sm ghost" href="#/lms/${id}/tugas/${k.id}">Lihat pengumpulan (${k.submitted}/${k.total})</a>${delBtn('/lms/tasks/' + k.id)}</div></div>`).join('')
        : '<p class="muted">Belum ada tugas.</p>';
      return head + `
        <div class="grid2">
          <div class="card"><h2>Bagikan Materi</h2><form class="form" data-form="post" data-url="/lms/teaching/${id}/materials">
            <div class="field"><label>Judul</label><input name="title" required maxlength="150"></div>
            <div class="field"><label>Keterangan</label><textarea name="description" maxlength="2000"></textarea></div>
            <div class="field"><label>Tautan (Drive, YouTube, dll.)</label><input name="link" type="url" maxlength="500" placeholder="https://"></div>
            <div><button class="btn" type="submit">Bagikan</button></div></form></div>
          <div class="card"><h2>Buat Tugas</h2><form class="form" data-form="post" data-url="/lms/teaching/${id}/tasks">
            <div class="field"><label>Judul</label><input name="title" required maxlength="150"></div>
            <div class="field"><label>Petunjuk</label><textarea name="instructions" required maxlength="3000"></textarea></div>
            <div class="field"><label>Tenggat (opsional)</label><input name="due_date" type="date"></div>
            <div class="field"><label>Tautan lampiran (opsional)</label><input name="link" type="url" maxlength="500" placeholder="https://"></div>
            <div><button class="btn" type="submit">Buat Tugas</button></div></form></div>
        </div>
        <div class="card"><h2>📚 Materi</h2>${materials}</div>
        <div class="card"><h2>📝 Tugas</h2>${tasks}</div>`;
    }

    const tasks = d.tasks.length
      ? d.tasks.map((k) => {
          const lewat = !k.my_at && k.due_date && k.due_date < d.today;
          const status = k.my_at
            ? `<span class="pill ok">Terkumpul</span>${k.my_late ? ' <span class="pill warn">Terlambat</span>' : ''}`
            : lewat ? '<span class="pill low">Lewat tenggat</span>' : '<span class="pill na">Belum dikumpulkan</span>';
          return `<div class="news"><div style="display:flex;justify-content:space-between;gap:.6rem;align-items:start"><h3>${esc(k.title)}</h3><span>${status}</span></div>
            <time>${k.due_date ? 'Tenggat ' + fdate2(k.due_date) : 'Tanpa tenggat'}</time>${lmsText(k.instructions)}${lmsLink(k.link)}
            ${k.my_at ? `<p class="muted small">Terakhir dikirim: ${esc(fdateTime(k.my_at))}</p>` : ''}
            
${k.my_at ? `
  <div class="card" style="margin:.6rem 0">
    <b>📊 Hasil Penilaian</b>
    ${k.my_score != null
      ? `<h2>Nilai: ${k.my_score}/100</h2>`
      : '<p class="muted">Belum dinilai oleh guru.</p>'}
    ${k.my_feedback
      ? `<p><b>Komentar guru:</b><br>${esc(k.my_feedback)}</p>`
      : ''}
  </div>
` : ''}

            <form class="form" data-form="post" data-url="/lms/tasks/${k.id}/submit" style="margin-top:.6rem">
              <div class="field"><label>Jawaban</label><textarea name="answer" maxlength="3000">${esc(k.my_answer || '')}</textarea></div>
              <div class="field"><label>Tautan jawaban (opsional)</label><input name="link" type="url" maxlength="500" placeholder="https://" value="${esc(k.my_link || '')}"></div>
              <div><button class="btn" type="submit">${k.my_at ? 'Kirim Ulang' : 'Kumpulkan'}</button></div></form></div>`;
        }).join('')
      : '<p class="muted">Belum ada tugas.</p>';
    return head + `<div class="card"><h2>📚 Materi</h2>${materials}</div><div class="card"><h2>📝 Tugas</h2>${tasks}</div>`;
  }

  /* ===================== PENCARIAN GLOBAL (FITUR 9) ===================== */
  let gsTimer = null;
  let gsSeq = 0;
  const gsNote = (t) => `<p style="padding:.8rem;margin:0;color:#64748b;font-size:.85rem">${t}</p>`;
  const gsEl = () => document.getElementById('gsBox');
  function gsHide() { const b = gsEl(); if (b) { b.style.display = 'none'; b.innerHTML = ''; } }
  function gsShow(html) { const b = gsEl(); if (!b) return; b.innerHTML = html; b.style.display = 'block'; }

  function gsRender(groups, q) {
    if (!groups.length) return gsNote(`Tidak ada hasil untuk "${esc(q)}".`);
    return groups.map((g) => `<div style="padding:.35rem .8rem;font-size:.7rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#64748b;background:#f1f5f9">${esc(g.title)}</div>`
      + g.items.map((it) => {
        const inner = `<b style="display:block;font-size:.85rem">${esc(it.title)}</b>${it.meta ? `<span style="font-size:.75rem;color:#64748b">${esc(it.meta)}</span>` : ''}`;
        const box = 'display:block;padding:.5rem .8rem;color:#0f172a;border-bottom:1px solid #e2e8f0;text-decoration:none';
        return it.link && String(it.link).startsWith('#/')
          ? `<a href="${esc(it.link)}" data-action="gsClose" style="${box}">${inner}</a>`
          : `<div style="${box}">${inner}</div>`;
      }).join('')).join('');
  }

  document.addEventListener('input', (e) => {
    if (!e.target || e.target.id !== 'gsInput') return;
    const q = e.target.value.trim();
    clearTimeout(gsTimer);
    if (q.length < 2) { gsSeq++; gsHide(); return; }
    gsTimer = setTimeout(async () => {
      const my = ++gsSeq;
      gsShow(gsNote('Mencari...'));
      try {
        const d = await api('/dashboard/search?q=' + encodeURIComponent(q));
        if (my !== gsSeq) return;
        gsShow(gsRender(d.groups || [], q));
      } catch (err) {
        if (my === gsSeq && me) gsShow(gsNote(esc(err.message)));
      }
    }, 300);
  });
  document.addEventListener('focusin', (e) => {
    if (e.target && e.target.id === 'gsInput' && e.target.value.trim().length >= 2 && gsEl() && gsEl().innerHTML) gsEl().style.display = 'block';
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('#gsWrap')) gsHide(); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { gsHide(); const i = document.getElementById('gsInput'); if (i) i.blur(); }
  });

  /* ===================== NOTIFIKASI (LONCENG) ===================== */
  let notifCache = { items: [], unread: 0 };

  function paintBell() {
    const b = document.getElementById('bellCount');
    if (!b) return;
    const n = notifCache.unread || 0;
    b.textContent = n > 99 ? '99+' : String(n);
    b.style.display = n > 0 ? 'block' : 'none';
  }

  async function refreshBell() {
    if (!me || me.must_change) return;
    try {
      notifCache = await api('/notif');
      paintBell();
    } catch (e) {}
  }

  async function openBell() {
    await refreshBell();
    const list = notifCache.items.length
      ? notifCache.items.map((n) => `<a href="${esc(n.link)}" data-action="closeModal" style="display:block;padding:.6rem .5rem;border-bottom:1px solid rgba(100,116,139,.25);text-decoration:none;color:inherit;${n.unread ? 'background:rgba(99,102,241,.08);' : ''}">
          <div style="display:flex;gap:.6rem;align-items:flex-start"><span style="font-size:1.2rem">${n.icon}</span>
          <div style="min-width:0"><b>${esc(n.title)}</b>${n.unread ? ' <span class="pill info">Baru</span>' : ''}<br>
          <span class="small">${esc(n.text)}</span><br><span class="muted small">${esc(ago(n.at))}</span></div></div></a>`).join('')
      : '<p class="muted">Belum ada notifikasi.</p>';
    openModal(`<h2>🔔 Notifikasi</h2><div style="max-height:60vh;overflow:auto;min-width:min(420px,80vw);margin:.6rem 0">${list}</div>
      <div class="actions"><button class="btn ghost" data-action="closeModal">Tutup</button></div>`);
    if (notifCache.unread > 0) {
      api('/notif/read', 'POST', {}).then(() => { notifCache.unread = 0; paintBell(); }).catch(() => {});
    }
  }

  setInterval(refreshBell, 60000);

  /* ===================== LOG AKTIVITAS & BACKUP ===================== */
  const fdateTime = (s) => {
    const d = new Date(String(s).replace(' ', 'T') + 'Z');
    return isNaN(d) ? '-' : d.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  async function logView(p) {
    const page = Math.max(1, Number(p) || 1);
    const d = await api('/admin/logs?page=' + page);
    const pages = Math.max(1, Math.ceil(d.total / d.per));
    const rows = d.rows.length
      ? d.rows.map((r) => `<tr><td style="white-space:nowrap">${esc(fdateTime(r.created_at))}</td><td>${esc(r.user_name || '-')}</td><td><b>${esc(r.action)}</b></td><td class="muted small">${esc(r.detail || '')}</td></tr>`).join('')
      : '<tr><td colspan="4" class="muted">Belum ada aktivitas tercatat. Log mulai terisi setelah fitur ini dipasang.</td></tr>';
    const nav = `<div class="actions" style="margin-top:1rem;align-items:center">
        ${page > 1 ? `<a class="btn sm ghost" href="#/log/${page - 1}">&larr; Lebih baru</a>` : ''}
        <span class="muted small">Halaman ${page} dari ${pages} &bull; ${d.total} catatan</span>
        ${page < pages ? `<a class="btn sm ghost" href="#/log/${page + 1}">Lebih lama &rarr;</a>` : ''}
      </div>`;
    return `<h1>Log Aktivitas</h1>
      <p class="muted">Catatan perubahan data yang dilakukan admin (tambah, ubah, hapus, impor, kenaikan kelas, export, backup). Password tidak pernah dicatat. Catatan lebih dari 180 hari dihapus otomatis.</p>
      <div class="card"><div class="table-wrap"><table><thead><tr><th>Waktu (WIB)</th><th>Admin</th><th>Aktivitas</th><th>Keterangan</th></tr></thead><tbody>${rows}</tbody></table></div>${nav}</div>`;
  }

  async function backupView() {
    return `<h1>Backup Data</h1>
      <p class="muted">Unduh cadangan seluruh data sekolah dalam satu file. Lakukan secara berkala, misalnya sebelum kenaikan kelas dan di akhir semester.</p>
      <div class="card"><h2>Unduh Backup</h2>
        <p class="muted small" style="margin-bottom:.8rem">Isi file: semua tabel (pengguna, kelas, nilai, absensi, pengumuman, dan lainnya) dalam format JSON.</p>
        <button class="btn" data-action="backupDb">💾 Unduh Backup Sekarang</button>
        <p class="muted small" style="margin-top:.8rem">⚠️ File ini berisi data lengkap termasuk password yang sudah di-hash. Simpan di tempat aman dan jangan dibagikan.</p>
      </div>`;
  }

  async function downloadXlsx(path, btn, fallbackName = 'export.xlsx') {
    const old = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Menyiapkan...';
    try {
      const res = await fetch('/api' + path, { credentials: 'same-origin' });
      if (res.status === 401) { me = null; renderLogin('Sesi berakhir, silakan masuk lagi.'); return; }
      if (!res.ok) {
        let msg = 'Gagal mengunduh file.';
        try { msg = (await res.json()).error || msg; } catch (e) {}
        throw new Error(msg);
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') || '';
      const m = /filename="([^"]+)"/.exec(cd);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = m ? m[1] : fallbackName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('File berhasil diunduh');
    } finally {
      btn.disabled = false;
      btn.textContent = old;
    }
  }

  function closeRapor() {
    const o = document.getElementById('raporView');
    if (o) o.remove();
  }

  async function showRapor(url, semester) {
    const d = await api(url + (semester ? '?semester=' + encodeURIComponent(semester) : ''));
    let o = document.getElementById('raporView');
    if (!o) {
      o = document.createElement('div');
      o.id = 'raporView';
      document.body.appendChild(o);
    }
    o.dataset.url = url;

    const semOpts = d.semesters.map((x) => `<option value="${esc(x)}" ${x === d.semester ? 'selected' : ''}>${esc(x)}</option>`).join('');
    const rows = d.subjects.length
      ? d.subjects.map((s, i) => `<tr><td class="c">${i + 1}</td><td><b>${esc(s.subject)}</b><br><small>${esc(s.teacher)}</small></td>
          <td class="c">${fmt(s.final)}</td><td class="c"><b>${esc(s.predikat)}</b></td>
          <td class="c">${s.passed == null ? '-' : s.passed ? 'Tuntas' : 'Belum tuntas'}</td><td>${esc(s.description)}</td></tr>`).join('')
      : '<tr><td colspan="6" class="c">Belum ada data nilai pada semester ini.</td></tr>';
    const a = d.attendance;
    const total = a.hadir + a.izin + a.sakit + a.alpa;
    const pct = total ? Math.round((a.hadir / total) * 100) + '%' : '-';

    o.innerHTML = `<style>
        #raporView{position:fixed;inset:0;z-index:9999;background:#e5e7eb;overflow:auto;padding:1rem}
        #raporView .rapor-bar{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center;max-width:210mm;margin:0 auto 1rem}
        #raporView .rapor-paper{background:#fff;color:#111;max-width:210mm;margin:0 auto;padding:16mm;box-shadow:0 4px 24px rgba(0,0,0,.18);font-size:12px;line-height:1.45}
        #raporView h2{text-align:center;font-size:16px;margin:0}
        #raporView .rapor-sub{text-align:center;margin:2px 0 14px;color:#444}
        #raporView h3{font-size:13px;margin:16px 0 6px}
        #raporView table{width:100%;border-collapse:collapse}
        #raporView .rapor-tbl th,#raporView .rapor-tbl td{border:1px solid #333;padding:5px 7px;vertical-align:top;text-align:left}
        #raporView .rapor-tbl th{background:#f1f5f9;text-align:center}
        #raporView .rapor-tbl td.c{text-align:center}
        #raporView .rapor-id td{padding:2px 6px;border:0}
        #raporView .rapor-note{color:#555;font-size:11px;margin-top:6px}
        #raporView .rapor-sign{display:flex;justify-content:space-between;gap:12px;margin-top:34px;text-align:center}
        #raporView .rapor-sign div{flex:1}
        #raporView .rapor-sign span{display:block;height:64px}
        @page{size:A4;margin:12mm}
        @media print{
          body>*:not(#raporView){display:none!important}
          #raporView{position:static!important;overflow:visible!important;background:#fff!important;padding:0!important}
          #raporView .rapor-bar{display:none!important}
          #raporView .rapor-paper{box-shadow:none!important;max-width:none!important;padding:0!important}
        }
      </style>
      <div class="rapor-bar">
        <select data-change="raporSemester">${semOpts || '<option>-</option>'}</select>
        <button class="btn" data-action="cetakRapor">🖨️ Cetak / Simpan PDF</button>
        <button class="btn ghost" data-action="tutupRapor">Tutup</button>
      </div>
      <div class="rapor-paper">
        <h2>LAPORAN HASIL BELAJAR (E-RAPOR)</h2>
        <p class="rapor-sub">SIAKAD OBE Sekolah</p>
        <table class="rapor-id"><tbody>
          <tr><td style="width:90px">Nama</td><td>: <b>${esc(d.student.name)}</b></td><td style="width:90px">Kelas</td><td>: ${esc(d.student.class_name)}</td></tr>
          <tr><td>NIS</td><td>: ${esc(d.student.nis || '-')}</td><td>Semester</td><td>: ${esc(d.semester || '-')}</td></tr>
        </tbody></table>
        <h3>A. Capaian Akademik</h3>
        <table class="rapor-tbl"><thead><tr><th style="width:28px">No</th><th>Mata Pelajaran</th><th style="width:52px">Nilai</th><th style="width:52px">Predikat</th><th style="width:76px">Status</th><th>Deskripsi Capaian</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="rapor-note">Predikat: A = 90-100, B = 80-89, C = ${d.kkm}-79 (KKM ${d.kkm}), D = di bawah ${d.kkm}.</p>
        <h3>B. Kehadiran</h3>
        <table class="rapor-tbl"><thead><tr><th>Hadir</th><th>Izin</th><th>Sakit</th><th>Alpa</th><th>% Kehadiran</th></tr></thead>
          <tbody><tr><td class="c">${a.hadir}</td><td class="c">${a.izin}</td><td class="c">${a.sakit}</td><td class="c">${a.alpa}</td><td class="c">${pct}</td></tr></tbody></table>
        <p class="rapor-note">Dicetak pada ${esc(d.printed_at)}</p>
        <div class="rapor-sign">
          <div>Orang Tua / Wali<span></span>( ........................ )</div>
          <div>Wali Kelas<span></span>( ${d.homeroom ? esc(d.homeroom) : '........................'} )</div>
          <div>Kepala Sekolah<span></span>( ........................ )</div>
        </div>
      </div>`;
    o.scrollTop = 0;
  }

  async function resetView() {
    const r = await api('/password-reset/admin/requests');
    const list = r.data || [];

    const rows = list.length
      ? list.map((u) => `
        <tr>
          <td>${esc(u.username)}</td>
          <td>${esc(u.name)}</td>
          <td>${esc(roleLabel(u.role))}</td>
          <td>${esc(u.email || '-')}</td>
          <td>${fdate(u.created_at)}</td>
          <td>
            <div class="actions">
              <button class="btn sm" data-action="approveReset" data-id="${u.id}">Setujui</button>
              <button class="btn sm danger" data-action="rejectReset" data-id="${u.id}">Tolak</button>
            </div>
          </td>
        </tr>
      `).join('')
      : '<tr><td colspan="6" class="muted">Belum ada permintaan reset password.</td></tr>';

    return `
      <h1>Permintaan Reset Password</h1>

      <p class="muted">
        Periksa permintaan siswa atau guru yang lupa password.
      </p>

      <div class="card">
        <div class="actions" style="margin-bottom:15px">
          <button class="btn" data-action="refreshReset">↻ Muat Ulang</button>
        </div>

        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr>
                <th>Username</th>
                <th>Nama</th>
                <th>Peran</th>
                <th>Email</th>
                <th>Tanggal</th>
                <th>Aksi</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ===============================
  // FITUR 11: EKSTRAKURIKULER
  // ===============================

  async function ekskulView() {
    const raw = await api('/portal/ekskul');
const data = Array.isArray(raw) ? raw : (raw.rows || raw.data || raw.items || []);
    const isAdmin = me.role === 'admin';

    let html = `
      <div class="page-head">
        <div>
          <h1>Ekstrakurikuler</h1>
          <p class="muted">Informasi dan kegiatan ekstrakurikuler sekolah.</p>
        </div>
      </div>
    `;

    if (isAdmin) {
      html += `
        <div class="card">
          <h3>Tambah Ekstrakurikuler</h3>
          <form class="form" data-form="saveEkskul">
            <div class="field">
              <label>Nama Ekstrakurikuler</label>
              <input name="name" placeholder="Contoh: Pramuka" required>
            </div>
            <div class="field">
              <label>Deskripsi</label>
              <textarea name="description" rows="3"></textarea>
            </div>
            <div class="field">
              <label>Jadwal</label>
              <input name="schedule" placeholder="Contoh: Jumat, 14.00 WIB">
            </div>
            <div class="field">
              <label>Kuota Anggota</label>
              <input name="quota" type="number" min="0" value="0">
            </div>
            <button class="btn" type="submit">+ Simpan Ekstrakurikuler</button>
            <p class="form-msg"></p>
          </form>
        </div>
      `;
    }

    html += `
      <div class="grid">
        ${data.length ? data.map(x => `
          <div class="card">
            <h3>${esc(x.name)}</h3>
            <p>${esc(x.description || 'Tidak ada deskripsi.')}</p>
            <p class="muted small">📅 ${esc(x.schedule || 'Jadwal belum ditentukan')}</p>
            <p class="muted small">Kuota: ${Number(x.quota || 0) || 'Tidak dibatasi'}</p>
            ${
              me.role === 'siswa'
                ? `<button class="btn sm" data-action="joinEkskul" data-id="${Number(x.id)}">Daftar</button>`
                : ''
            }
          </div>
        `).join('') : '<div class="card"><p>Belum ada ekstrakurikuler.</p></div>'}
      </div>
    `;

    return html;
  }

  // ===============================
  // FITUR 11: BIMBINGAN KONSELING
  // ===============================

  async function bkView() {
    const raw = await api('/portal/bk');
const data = Array.isArray(raw) ? raw : (raw.rows || raw.data || raw.items || []);

    const rows = data.map(x => `
      <tr>
        <td>${esc(x.student_name || x.student_id)}</td>
        <td>${esc(x.category)}</td>
        <td>${esc(x.notes)}</td>
        <td>${esc(x.follow_up || '-')}</td>
        <td>${esc(x.session_date)}</td>
      </tr>
    `).join('');

    return `
      <div class="page-head">
        <div>
          <h1>Bimbingan Konseling</h1>
          <p class="muted">Pencatatan layanan bimbingan dan konseling siswa.</p>
        </div>
      </div>

      <div class="card">
        <h3>Tambah Catatan Konseling</h3>
        <form class="form" data-form="saveBK">
          <div class="field">
            <label>ID Siswa</label>
            <input name="student_id" type="number" min="1" required>
          </div>

          <div class="field">
            <label>Kategori</label>
            <select name="category" required>
              <option value="">Pilih kategori</option>
              <option value="Akademik">Akademik</option>
              <option value="Pribadi">Pribadi</option>
              <option value="Sosial">Sosial</option>
              <option value="Karier">Karier</option>
            </select>
          </div>

          <div class="field">
            <label>Catatan Konseling</label>
            <textarea name="notes" rows="4" required></textarea>
          </div>

          <div class="field">
            <label>Tindak Lanjut</label>
            <textarea name="follow_up" rows="3"></textarea>
          </div>

          <div class="field">
            <label>Tanggal Konseling</label>
            <input name="session_date" type="date" required>
          </div>

          <button class="btn" type="submit">Simpan Catatan</button>
          <p class="form-msg"></p>
        </form>
      </div>

      <div class="card">
        <h3>Riwayat Konseling</h3>
        <div style="overflow-x:auto">
          <table>
            <thead>
              <tr>
                <th>Nama / ID Siswa</th>
                <th>Kategori</th>
                <th>Catatan</th>
                <th>Tindak Lanjut</th>
                <th>Tanggal</th>
              </tr>
            </thead>
            <tbody>
              ${rows || '<tr><td colspan="5">Belum ada catatan konseling.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ================= KEUANGAN / SPP =================

async function keuanganView() {
  try {
    const [data, siswaData, riwayat, buktiData] = await Promise.all([
      api('/portal/keuangan'),
      api('/portal/keuangan/siswa'),
      api('/portal/keuangan/riwayat'),
      api('/portal/keuangan/bukti')
    ]);

    const buktiRows = Array.isArray(buktiData)
      ? buktiData
      : (buktiData?.rows || []);

    const siswa = Array.isArray(siswaData)
      ? siswaData
      : (siswaData.rows || siswaData.siswa || siswaData.students || []);

      const rupiah = n =>
        'Rp ' + Number(n || 0).toLocaleString('id-ID');

      const tanggal = value => {
        if (!value) return '-';
        const d = new Date(value + 'T00:00:00');
        return isNaN(d.getTime())
          ? value
          : d.toLocaleDateString('id-ID');
      };

      return `
        <div class="card">
          <h3>📊 Laporan Keuangan SPP</h3>
          <p>Filter dan cetak laporan pembayaran siswa.</p>

          <form id="filterLaporanSPP">
            <div class="form-group">
              <label>Dari Tanggal</label>
              <input type="date" id="laporanMulai">
            </div>

            <div class="form-group">
              <label>Sampai Tanggal</label>
              <input type="date" id="laporanSampai">
            </div>

            <div class="form-group">
              <label>Pilih Siswa</label>
              <select id="laporanSiswa">
                <option value="">Semua Siswa</option>
                ${siswa.map(s => `
                  <option value="${Number(s.id)}">
                    ${esc(s.student_name)} - ${esc(s.nis || '')}
                  </option>
                `).join('')}
              </select>
            </div>

            <button type="button" data-action="tampilkanLaporanSPP">
              Tampilkan Laporan
            </button>
          </form>

          <div id="hasilLaporanSPP">
            <p>Silakan pilih filter untuk menampilkan laporan.</p>
          </div>
        </div>

        <div class="page-head">
          <h2>💰 Keuangan / SPP</h2>
          <p>Kelola tagihan dan pembayaran SPP siswa.</p>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <h3>Total Tagihan</h3>
            <h2>${rupiah(data.total?.total_nominal)}</h2>
          </div>

          <div class="stat-card">
            <h3>Total Pembayaran</h3>
            <h2>${rupiah(riwayat.total?.total_pembayaran)}</h2>
          </div>

          <div class="stat-card">
            <h3>Transaksi</h3>
            <h2>${riwayat.total?.total_transaksi || 0}</h2>
          </div>
        </div>

        <div class="card">
          <h3>Buat Tagihan SPP</h3>

          <form data-form="saveTagihanSPP">
            <div class="form-msg"></div>

            <div class="form-group">
              <label>Pilih Siswa</label>
              <select name="student_id" required>
                <option value="">-- Pilih Siswa --</option>
                ${siswa.map(s => `
                  <option value="${Number(s.id)}">
                    ${esc(s.student_name)} - ${esc(s.nis || '')}
                    (${esc(s.class_name || '-')})
                  </option>
                `).join('')}
              </select>
            </div>

            <div class="form-group">
              <label>Nama Tagihan</label>
              <input name="title" required>
            </div>

            <div class="form-group">
              <label>Periode</label>
              <input name="period" placeholder="Contoh: November 2026" required>
            </div>

            <div class="form-group">
              <label>Nominal</label>
              <input name="amount" type="number" min="1" required>
            </div>

            <div class="form-group">
              <label>Jatuh Tempo</label>
              <input name="due_date" type="date">
            </div>

            <button type="submit">Simpan Tagihan</button>
          </form>
        </div>

        <div class="card">
          <h3>Daftar Tagihan Siswa</h3>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Siswa</th>
                  <th>Tagihan</th>
                  <th>Nominal</th>
                  <th>Dibayar</th>
                  <th>Sisa</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>

              <tbody>
                ${(data.rows || []).map(p => {
                  const sisa = Number(p.amount || 0) - Number(p.amount_paid || 0);

                  return `
                    <tr>
                      <td>${esc(p.student_name || '-')}</td>
                      <td>${esc(p.title)} - ${esc(p.period)}</td>
                      <td>${rupiah(p.amount)}</td>
                      <td>${rupiah(p.amount_paid)}</td>
                      <td>${rupiah(sisa)}</td>
                      <td>${esc(p.status || '-')}</td>
                      <td>
                        ${sisa > 0 ? `
                          <button type="button" data-action="bayarSPP" data-id="${Number(p.id)}">
                            Catat Bayar
                          </button>
                        ` : 'Selesai'}
                         <button type="button" data-action="cetakInvoiceSPP" data-id="${Number(p.id)}">
    🖨️ Cetak Invoice
  </button>
                      </td>
                    </tr>
                  `;
                }).join('') || `
                  <tr>
                    <td colspan="7">Belum ada tagihan.</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>

<div class="card">
  <h3>📥 Verifikasi Bukti Pembayaran SPP</h3>
  <p>Periksa bukti pembayaran yang dikirim siswa.</p>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Siswa</th>
          <th>Tagihan</th>
          <th>Nominal</th>
          <th>Bukti</th>
          <th>Catatan</th>
          <th>Status</th>
          <th>Aksi</th>
        </tr>
      </thead>

      <tbody>
        ${buktiRows.map(b => `
          <tr>
            <td>${esc(b.student_name || '-')}</td>
            <td>${esc(b.title || '-')} - ${esc(b.period || '-')}</td>
            <td>${rupiah(b.amount)}</td>
            <td>
              ${b.proof_data ? `
                <img
                  src="${esc(b.proof_data)}"
                  alt="Bukti Pembayaran"
       onclick="const w=window.open('about:blank','_blank');if(w){w.document.write('<img src='+JSON.stringify(this.src)+' style=max-width:100%;height:auto>');w.document.close()}"
                  style="width:100px;height:100px;object-fit:contain;border:1px solid #ddd;border-radius:8px;cursor:pointer"
                >
              ` : 'Foto tidak tersedia'}
            </td>
            <td>${esc(b.note || '-')}</td>
            <td>${esc(b.status || '-')}</td>
            <td>
              ${b.status === 'menunggu' ? `
                <button type="button"
                  data-action="verifikasiBuktiSPP"
                  data-id="${Number(b.id)}"
                  data-status="diterima">
                  ✅ Terima
                </button>

                <button type="button"
                  data-action="verifikasiBuktiSPP"
                  data-id="${Number(b.id)}"
                  data-status="ditolak">
                  ❌ Tolak
                </button>
              ` : '-'}
            </td>
          </tr>
        `).join('') || `
          <tr>
            <td colspan="7">Belum ada bukti pembayaran.</td>
          </tr>
        `}
      </tbody>
    </table>
  </div>
</div>

<div class="card">
  <h3>📜 Riwayat Pembayaran SPP</h3>

  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>No</th>
          <th>Siswa</th>
          <th>Kelas</th>
          <th>Tagihan</th>
          <th>Nominal</th>
          <th>Tanggal</th>
          <th>Metode</th>
          <th>Catatan</th>
          <th>Aksi</th>
        </tr>
      </thead>

      <tbody>
        ${(riwayat.rows || []).map((p, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${esc(p.student_name || '-')}</td>
            <td>${esc(p.class_name || '-')}</td>
            <td>${esc(p.title || '-')} - ${esc(p.period || '-')}</td>
            <td>${rupiah(p.amount)}</td>
            <td>${tanggal(p.payment_date)}</td>
            <td>${esc(p.method || 'Tunai')}</td>
            <td>${esc(p.note || '-')}</td>
            <td>
              <button type="button"
                data-action="cetakBuktiSPP"
                data-id="${Number(p.id)}">
                🖨️ Cetak
              </button>
            </td>
          </tr>
        `).join('') || `
          <tr>
            <td colspan="9">Belum ada riwayat pembayaran.</td>
          </tr>
        `}
      </tbody>
    </table>
  </div>
</div>

      `;
    } catch (e) {
      return `
        <div class="card">
          Gagal memuat keuangan: ${esc(e.message)}
        </div>
      `;
    }
  }

  // ================= KEUANGAN SISWA =================

  async function keuanganSiswaView() {
    try {
      const data = await api('/portal/keuangan/saya');

      const rupiah = n =>
        'Rp ' + Number(n || 0).toLocaleString('id-ID');

      return `
        <div class="page-head">
          <h2>💰 Tagihan SPP Saya</h2>
          <p>Lihat tagihan dan riwayat pembayaran SPP kamu.</p>
        </div>

        <div class="card">
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Tagihan</th>
                  <th>Periode</th>
                  <th>Nominal</th>
                  <th>Dibayar</th>
                  <th>Sisa</th>
                  <th>Jatuh Tempo</th>
                  <th>Status</th>
                  <th>Aksi</th>
                </tr>
              </thead>

              <tbody>
                ${(data.rows || []).map(i => {
                  const total = Number(i.amount || 0);
                  const paid = Number(i.amount_paid || 0);
                  const remaining = Math.max(0, total - paid);

                  return `
                    <tr>
                      <td>${esc(i.title || '-')}</td>
                      <td>${esc(i.period || '-')}</td>
                      <td>${rupiah(total)}</td>
                      <td>${rupiah(paid)}</td>
                      <td>${rupiah(remaining)}</td>
                      <td>${esc(i.due_date || '-')}</td>
                      <td>${remaining <= 0 ? 'Lunas' : 'Belum Lunas'}</td>
                    <td>
  <button type="button" data-action="cetakInvoiceSPP" data-id="${Number(i.id)}">
    🖨️ Cetak Invoice
  </button>
  ${remaining > 0 ? `
    <div style="margin-top:10px;min-width:180px">
      <input
        type="number"
        data-proof-amount="${Number(i.id)}"
        min="1"
        max="${remaining}"
        placeholder="Nominal transfer"
        style="width:100%;margin-bottom:6px"
      >

      <input
        type="file"
        data-proof-file="${Number(i.id)}"
        accept="image/jpeg,image/png,image/webp"
        style="width:100%;margin-bottom:6px"
      >

      <input
        type="text"
        data-proof-note="${Number(i.id)}"
        maxlength="500"
        placeholder="Catatan (opsional)"
        style="width:100%;margin-bottom:6px"
      >

      <button
        type="button"
        data-action="uploadBuktiSPP"
        data-id="${Number(i.id)}"
      >
        📤 Kirim Bukti
      </button>
    </div>
  ` : ''}
</td>
                      </tr>
                  `;
                }).join('') || `
                  <tr>
                   <td colspan="8">Belum ada tagihan SPP.</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>
        </div>
      `;
    } catch (e) {
      return `
        <div class="card">
          Gagal memuat tagihan: ${esc(e.message)}
        </div>
      `;
    }
  }

  // ================= DAFTAR TAMPILAN =================

  const VIEWS = {
    admin: {
      dash, users: usersView, classes: classesView,
      naik: naikView, periode: periodeView,
      rapor: raporAdminView, export: exportView,
      log: logView, backup: backupView,
      subjects: subjectsView, teaching: teachingAdminView,
      news: newsView, jadwal: jadwalAdminView,
      absen: absenPantau, akademik: akademikView,
      administrasi: administrasiView, pengaduan: pengaduanView,
      akun: akunView, monitor: monitorView,
      reset: resetView, detail: detailView,
      ekskul: ekskulView, bk: bkView,
      keuangan: keuanganView
    },

    guru: {
      dash, mycls: myClasses, wali: waliView,
      lms: lmsView, class: classDetail,
      absen: absenGuru, akademik: akademikView,
      pengaduan: pengaduanView, akun: akunView
    },

    siswa: {
      dash, report: reportView, lms: lmsView,
      absen: absenSiswa, akademik: akademikView,
      pengaduan: pengaduanView, akun: akunView,
      ekskul: ekskulView,
      keuangan: keuanganSiswaView
    },

    kepsek: {
      dash, rapor: raporAdminView,
      monitor: monitorView, detail: detailView,
      absen: absenPantau, akademik: akademikView,
      administrasi: administrasiView,
      pengaduan: pengaduanView, bk: bkView,
      akun: akunView
    }
  };

  // ================= ROUTING =================

  async function route() {
    closeModal();

    if (!me) return renderLogin();
    if (me.must_change) return renderForceChange();

    const [, view = 'dash', id, tab, extra] =
      location.hash.split('/');

    const fn = VIEWS[me.role]?.[view];

    if (!fn) {
      location.hash = '#/dash';
      return;
    }

    const active =
      view === 'class' ? 'mycls' :
      view === 'detail' ? 'monitor' :
      view;

    try {
      const html = await fn(id, tab, extra);

      app.innerHTML = layout(html, active);

      logVisit(view, location.hash);
      paintBell();
      refreshBell();

    } catch (e) {
      if (!me) return;

      app.innerHTML = layout(
        `<div class="card"><p class="err">${esc(e.message)}</p></div>`,
        active
      );
    }
  }

  // ================= FORM HANDLERS =================

  const FORMS = {
    async login(data, f) {
      const msg = f.querySelector('.form-msg');
      if (msg) msg.textContent = '';

      try {
        const r = await api('/login', 'POST', data);
        me = r.user;
        location.hash = '#/dash';
        route();
      } catch (e) {
        if (msg) msg.textContent = e.message;
        else toast(e.message, false);
      }
    },

    async forgotPw(data, f) {
      const msg = f.querySelector('.form-msg');
      if (msg) msg.textContent = '';

      try {
        await api('/password-reset/request', 'POST', {
          username: data.username,
          email: data.email
        });

        if (msg) {
          msg.textContent =
            'Permintaan reset berhasil dikirim. Hubungi admin sekolah.';
        }

        f.reset();
      } catch (e) {
        if (msg) msg.textContent = e.message;
        else toast(e.message, false);
      }
    },

async gradeLms(data, f) {
  await api(`/lms/tasks/${f.dataset.task}/grade`, 'POST', {
    student_id: Number(data.student_id),
    score: Number(data.score),
    feedback: data.feedback
  });

  toast('Penilaian berhasil disimpan');
  route();
},

    async changePw(data, f) {
      const msg = f.querySelector('.form-msg');
      if (msg) msg.textContent = '';

      try {
        await api('/change-password', 'POST', data);
        me.must_change = false;
        closeModal();
        toast('Password berhasil diganti');
        route();
      } catch (e) {
        if (msg) msg.textContent = e.message;
        else toast(e.message, false);
      }
    },

    absenPick(data, f) {
      location.hash =
        `#/absen/${f.dataset.sub}/${data.teaching_id}/${data.period}`;
    },

    async bukaSesi(data, f) {
      await api('/absensi/guru/sesi/buka', 'POST', {
        teaching_id: Number(f.dataset.tid),
        durasi_menit: Number(data.durasi_menit)
      });

      toast('Sesi absensi berhasil dibuka');
      route();
    },

    absenPantauPick(data) {
      location.hash = `#/absen/hari/${data.date}`;
    },

    async saveAbsen(data, f) {
      const records = [...f.querySelectorAll('tr[data-sid]')].map(tr => ({
        student_id: Number(tr.dataset.sid),
        status: tr.querySelector('.abs-status').value,
        note: tr.querySelector('.abs-note').value.trim()
      }));

      await api('/absensi/guru/siswa', 'PUT', {
        teaching_id: Number(f.dataset.tid),
        date: f.dataset.date,
        records
      });

      toast('Absensi tersimpan');
    },

    async saveEkskul(data, f) {
      const msg = f.querySelector('.form-msg');
      if (msg) msg.textContent = '';

      try {
        await api('/portal/ekskul', 'POST', {
          name: data.name,
          description: data.description,
          schedule: data.schedule,
          quota: Number(data.quota || 0)
        });

        toast('Ekstrakurikuler berhasil ditambahkan');
        route();
      } catch (e) {
        if (msg) msg.textContent = e.message;
        else toast(e.message, false);
      }
    },

    // ================= KEUANGAN / SPP =================

    async saveTagihanSPP(data, f) {
      const msg = f.querySelector('.form-msg');
      if (msg) msg.textContent = '';

      try {
        if (!data.student_id) {
          throw new Error('Silakan pilih siswa terlebih dahulu.');
        }

        if (
          !data.title ||
          !data.period ||
          !Number.isSafeInteger(Number(data.amount)) ||
          Number(data.amount) <= 0
        ) {
          throw new Error('Lengkapi nama tagihan, periode, dan nominal dengan benar.');
        }

        await api('/portal/keuangan/tagihan', 'POST', {
          student_id: Number(data.student_id),
          title: data.title.trim(),
          period: data.period.trim(),
          amount: Number(data.amount),
          due_date: data.due_date || ''
        });

        toast('Tagihan SPP berhasil dibuat!');
        route();

      } catch (e) {
        console.error('Gagal menyimpan tagihan:', e);

        if (msg) msg.textContent = e.message;
        else toast(e.message, false);
      }
    },

    async saveBK(data, f) {
      const msg = f.querySelector('.form-msg');
      if (msg) msg.textContent = '';

      try {
        await api('/portal/bk', 'POST', {
          student_id: Number(data.student_id),
          category: data.category,
          notes: data.notes,
          follow_up: data.follow_up,
          session_date: data.session_date
        });

        toast('Catatan konseling berhasil disimpan');
        route();
      } catch (e) {
        if (msg) msg.textContent = e.message;
        else toast(e.message, false);
      }
    },

    async staffLeave(data) {
      await api('/absensi/staf/izin', 'POST', data);
      toast('Keterangan tersimpan');
      route();
    },

    async saveAkun(data) {
      await api('/portal/akun', 'PUT', data);
      toast('Kontak tersimpan');
      route();
    },

    async saveFotoProfil(data, f) {
      const file = f.querySelector('input[name="foto"]').files[0];

      if (!file) {
        throw new Error('Pilih foto terlebih dahulu.');
      }

      const allowed = ['image/jpeg', 'image/png', 'image/webp'];

      if (!allowed.includes(file.type)) {
        throw new Error('Format foto harus JPG, PNG, atau WEBP.');
      }

      if (file.size > 5 * 1024 * 1024) {
        throw new Error('Ukuran foto maksimal 5 MB.');
      }

      const image = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Gagal membaca foto.'));
        reader.readAsDataURL(file);
      });

      await api('/portal/akun/foto', 'PUT', { image });

      toast('Foto profil berhasil diperbarui');
      route();
    },

    async respondPengaduan(data, f) {
      await api('/portal/pengaduan/' + f.dataset.id, 'PUT', data);
      closeModal();
      toast('Tanggapan tersimpan');
      route();
    },

    async importUsers(data, f) {
      const file = f.querySelector('input[type=file]').files[0];

      if (!file) {
        throw new Error('Pilih file Excel dulu.');
      }

      if (file.size > 400 * 1024) {
        throw new Error('File terlalu besar (maksimal 400 KB).');
      }

      const b64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result).split(',')[1] || '');
        r.onerror = () => reject(new Error('Gagal membaca file.'));
        r.readAsDataURL(file);
      });

      const r = await api('/admin/users/import', 'POST', {
        file: b64
      });

      const list = r.errors.length
        ? `<div style="max-height:260px;overflow:auto;margin:.8rem 0">
            <table>
              <thead>
                <tr>
                  <th>Baris</th>
                  <th>Username</th>
                  <th>Keterangan</th>
                </tr>
              </thead>
              <tbody>
                ${r.errors.map(x => `
                  <tr>
                    <td>${x.row}</td>
                    <td>${esc(x.username || '-')}</td>
                    <td>${esc(x.message)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`
        : '';

      openModal(`
        <h2>Hasil Impor</h2>
        <p>
          Berhasil: <b>${r.created}</b> |
          Dilewati: <b>${r.skipped}</b> |
          Gagal: <b>${r.failed}</b>
        </p>
        ${list}
        <div class="actions">
          <button class="btn" data-action="closeImport">Selesai</button>
        </div>
      `);
    },

    async promote(data, f) {
      const ids = [
        ...f.querySelectorAll('input.pick-siswa:checked')
      ].map(i => Number(i.value));

      if (!ids.length) {
        throw new Error('Pilih minimal satu siswa.');
      }

      if (!data.target) {
        throw new Error('Pilih kelas tujuan.');
      }

      const lulus = data.target === 'LULUS';

      if (!confirm(
        `Yakin ${lulus ? 'meluluskan' : 'memindahkan'} ${ids.length} siswa? Pastikan E-Rapor semester ini sudah dicetak.`
      )) return;

      await api('/admin/promotion', 'POST', {
        from_class_id: Number(f.dataset.from),
        to_class_id: lulus ? null : Number(data.target),
        graduate: lulus,
        student_ids: ids,
        deactivate: data.deactivate === 'on'
      });

      toast(
        lulus
          ? 'Siswa berhasil diluluskan'
          : 'Siswa berhasil dipindahkan'
      );

      const same = location.hash === '#/naik';
      location.hash = '#/naik';

      if (same) route();
    },

    async post(data, f) {
      await api(f.dataset.url, 'POST', data);
      toast('Data tersimpan');
      route();
    },

    async saveScores(data, f) {
      const scores = [
        ...f.querySelectorAll('input.score')
      ].map(i => ({
        student_id: Number(i.dataset.sid),
        score: i.value === '' ? null : Number(i.value)
      }));

      await api(
        `/guru/assessments/${f.dataset.aid}/scores`,
        'PUT',
        { scores }
      );

      toast('Nilai tersimpan');
    }
  };

  // ================= ACTION HANDLERS =================
  // Catatan: endpoint bertanda "TEBAKAN" disusun dari pola penamaan di file ini.
  // Kalau ada yang error 404, cocokkan dengan route di server.

  const ACTIONS = {

    // ---------- Tampilan umum ----------

    toggleSide() {
      const side = document.getElementById('side');
      if (side) side.classList.toggle('open');
    },

    bell() {
      return openBell();
    },

    closeModal() {
      closeModal();
    },

    closeImport() {
      closeModal();
      route();
    },

    gsClose() {
      gsHide();
      const i = document.getElementById('gsInput');
      if (i) i.value = '';
    },

    async logout() {
      if (!confirm('Yakin ingin keluar dari akun?')) return;

      try {
        await api('/logout', 'POST', {});

        me = null;
        location.hash = '';
        renderLogin();

      } catch (e) {
        toast('Gagal logout: ' + e.message, false);
      }
    },

    pw() {
      openModal(`
        <h2>🔑 Ganti Password</h2>
        <form class="form" data-form="changePw" style="margin-top:1rem">
          <div class="field"><label>Password lama</label><input name="old_password" type="password" required></div>
          <div class="field"><label>Password baru (min. 8 karakter)</label><input name="new_password" type="password" minlength="8" required></div>
          <p class="form-msg"></p>
          <div class="actions">
            <button class="btn" type="submit">Simpan</button>
            <button class="btn ghost" type="button" data-action="closeModal">Batal</button>
          </div>
        </form>
      `);
    },

    forgotPw() {
      openModal(`
        <h2>Lupa Password</h2>
        <p class="muted small">Kirim permintaan reset ke admin sekolah.</p>
        <form class="form" data-form="forgotPw" style="margin-top:1rem">
          <div class="field"><label>Username</label><input name="username" required></div>
          <div class="field"><label>Email (opsional)</label><input name="email" type="email"></div>
          <p class="form-msg"></p>
          <div class="actions">
            <button class="btn" type="submit">Kirim Permintaan</button>
            <button class="btn ghost" type="button" data-action="closeModal">Batal</button>
          </div>
        </form>
      `);
    },

    // ---------- Verifikasi Bukti Pembayaran SPP ----------

async verifikasiBuktiSPP(el) {
  const id = Number(el.dataset.id);
  const status = el.dataset.status;

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error('ID bukti pembayaran tidak valid.');
  }

  if (!['diterima', 'ditolak'].includes(status)) {
    throw new Error('Status verifikasi tidak valid.');
  }

  const pesan = status === 'diterima'
    ? 'Yakin ingin menerima bukti pembayaran ini? Pembayaran akan dicatat ke riwayat SPP.'
    : 'Yakin ingin menolak bukti pembayaran ini?';

  if (!confirm(pesan)) return;

  await api(`/portal/keuangan/bukti/${id}/verifikasi`, 'PUT', {
    status,
    method: 'Transfer'
  });

  toast(
    status === 'diterima'
      ? 'Bukti pembayaran diterima dan pembayaran dicatat.'
      : 'Bukti pembayaran ditolak.'
  );

  route();
},
    // ---------- Hapus generik ----------

    async del(el) {
      if (!confirm('Yakin ingin menghapus data ini?')) return;

      await api(el.dataset.url, 'DELETE');
      toast('Data dihapus');
      route();
    },

    // ---------- Pengguna ----------

        async resetPw(el) {
      const pw = prompt('Masukkan password baru (minimal 8 karakter):');
      if (pw === null) return;

      if (pw.length < 8) {
        throw new Error('Password minimal 8 karakter.');
      }

      await api(`/admin/users/${el.dataset.id}`, 'PUT', { password: pw });
      toast('Password berhasil direset');
    },

    async toggleActive(el) {
      await api(`/admin/users/${el.dataset.id}`, 'PUT', {
        active: Number(el.dataset.active)
      });
      toast('Status pengguna diperbarui');
      route();
    },

    async activatePeriod(el) {
      // TEBAKAN: PUT /admin/periods/:id/activate
      await api(`/admin/periods/${el.dataset.id}/activate`, 'PUT', {});
      toast('Periode diaktifkan');
      route();
    },

    toggleAllSiswa(el) {
      document.querySelectorAll('input.pick-siswa').forEach((c) => {
        c.checked = el.checked;
      });
    },

    // ---------- E-Rapor, export, backup ----------

    async bukaRapor(el) {
      await showRapor(el.dataset.url);
    },

    cetakRapor() {
      window.print();
    },

    tutupRapor() {
      closeRapor();
    },

    async exportXlsx(el) {
      const kelas = document.getElementById('expKelas')?.value || '';
      const semester = document.getElementById('expSemester')?.value || '';

      const params = new URLSearchParams();
      if (kelas) params.set('class_id', kelas);
      if (semester) params.set('semester', semester);

      const qs = params.toString();
      const type = el.dataset.type === 'absensi' ? 'absensi' : 'nilai';

      // TEBAKAN: GET /admin/export/nilai | /admin/export/absensi
      await downloadXlsx(
        `/admin/export/${type}${qs ? '?' + qs : ''}`,
        el,
        `export-${type}.xlsx`
      );
    },

    async backupDb(el) {
      // TEBAKAN: GET /admin/backup
      await downloadXlsx('/admin/backup', el, 'backup-siakad.json');
    },

    // ---------- Absensi ----------

    async staffIn() {
      // TEBAKAN: POST /absensi/staf/masuk
      await api('/absensi/staf/masuk', 'POST', {});
      toast('Absen masuk tercatat');
      route();
    },

    async staffOut() {
      // TEBAKAN: POST /absensi/staf/pulang
      await api('/absensi/staf/pulang', 'POST', {});
      toast('Absen pulang tercatat');
      route();
    },

    allHadir() {
      document.querySelectorAll('select.abs-status').forEach((s) => {
        s.value = 'hadir';
      });
    },

    async tutupSesi(el) {
      // TEBAKAN: POST /absensi/guru/sesi/tutup
      await api('/absensi/guru/sesi/tutup', 'POST', {
        session_id: Number(el.dataset.id)
      });
      toast('Sesi absensi ditutup');
      route();
    },

    async absenMandiri(el) {
      // TEBAKAN: POST /absensi/siswa/mandiri
      await api('/absensi/siswa/mandiri', 'POST', {
        session_id: Number(el.dataset.id)
      });
      toast('Absensi berhasil dicatat');
      route();
    },

    refreshAbsen() {
      route();
    },

    // ---------- Pengaduan ----------

    openRespond(el) {
      const c = complaintsCache.find((x) => String(x.id) === String(el.dataset.id));
      if (!c) throw new Error('Data pengaduan tidak ditemukan.');

      openModal(`
        <h2>${esc(c.subject)}</h2>
        <p class="muted small">${esc(c.user_name)} &bull; ${esc(roleLabel(c.user_role))} &bull; ${esc(c.category)} &bull; ${fdate(c.created_at)}</p>
        <p style="white-space:pre-wrap;margin:.8rem 0">${esc(c.body)}</p>
        <form class="form" data-form="respondPengaduan" data-id="${c.id}">
          <div class="field"><label>Status</label>
            <select name="status">
              ${['baru', 'diproses', 'selesai', 'ditolak'].map((s) => `<option value="${s}" ${c.status === s ? 'selected' : ''}>${esc(CS_LABEL[s])}</option>`).join('')}
            </select>
          </div>
          <div class="field"><label>Tanggapan</label>
            <textarea name="response" maxlength="2000">${esc(c.response || '')}</textarea>
          </div>
          <div class="actions">
            <button class="btn" type="submit">Simpan Tanggapan</button>
            <button class="btn ghost" type="button" data-action="closeModal">Tutup</button>
          </div>
        </form>
      `);
    },

    // ---------- Reset password (admin) ----------

    async approveReset(el) {
      if (!confirm('Setujui permintaan reset password ini?')) return;

      // TEBAKAN: POST /password-reset/admin/approve/:id
      const r = await api(`/password-reset/admin/approve/${el.dataset.id}`, 'POST', {});
      const temp = r && (r.temp_password || r.password);

      if (temp) {
        alert('Password sementara: ' + temp + '\n\nSampaikan ke pengguna yang bersangkutan.');
      } else {
        toast('Permintaan disetujui');
      }

      route();
    },

    async rejectReset(el) {
      if (!confirm('Tolak permintaan reset password ini?')) return;

      // TEBAKAN: POST /password-reset/admin/reject/:id
      await api(`/password-reset/admin/reject/${el.dataset.id}`, 'POST', {});
      toast('Permintaan ditolak');
      route();
    },

    refreshReset() {
      route();
    },

    // ---------- Foto profil ----------

    async hapusFotoProfil() {
      if (!confirm('Hapus foto profil?')) return;

      // TEBAKAN: DELETE /portal/akun/foto
      await api('/portal/akun/foto', 'DELETE');
      toast('Foto profil dihapus');
      route();
    },

    // ---------- Ekstrakurikuler ----------

    async joinEkskul(el) {
      // TEBAKAN: POST /portal/ekskul/:id/join
      await api(`/portal/ekskul/${el.dataset.id}/join`, 'POST', {});
      toast('Pendaftaran ekstrakurikuler berhasil');
      route();
    },

    // ---------- Keuangan / SPP ----------

    async bayarSPP(el) {
      const id = Number(el.dataset.id);
      const amount = prompt('Masukkan nominal pembayaran:');

      if (amount === null) return;

      const nominal = Number(amount);

      if (!Number.isSafeInteger(nominal) || nominal <= 0) {
        alert('Nominal pembayaran tidak valid!');
        return;
      }

      if (!confirm(
        'Catat pembayaran sebesar Rp ' +
        nominal.toLocaleString('id-ID') + '?'
      )) return;

      try {
        await api(`/portal/keuangan/${id}/bayar`, 'POST', {
          amount: nominal
        });

        alert('Pembayaran berhasil dicatat!');
        route();
      } catch (e) {
        alert(e.message);
      }
    },

    async cetakBuktiSPP(el) {
      const id = Number(el.dataset.id);
      const win = window.open('', '_blank');

      if (!win) {
        alert('Izinkan pop-up pada browser terlebih dahulu.');
        return;
      }

      try {
        const data = await api('/portal/keuangan/riwayat');

        const p = (data.rows || []).find(
          item => Number(item.id) === id
        );

        if (!p) {
          win.close();
          alert('Data pembayaran tidak ditemukan.');
          return;
        }

        const rupiah = n =>
          'Rp ' + Number(n || 0).toLocaleString('id-ID');

        const tanggal = value => {
          if (!value) return '-';

          const d = new Date(value + 'T00:00:00');

          return isNaN(d.getTime())
            ? value
            : d.toLocaleDateString('id-ID', {
                day: '2-digit',
                month: 'long',
                year: 'numeric'
              });
        };

        win.document.write(`
          <!DOCTYPE html>
          <html lang="id">
          <head>
            <meta charset="UTF-8">
            <title>Bukti Pembayaran SPP</title>
            <style>
              body {
                font-family: Arial, sans-serif;
                padding: 30px;
                color: #222;
              }
              .receipt {
                max-width: 650px;
                margin: auto;
                border: 1px solid #ddd;
                padding: 30px;
              }
              h2 { text-align: center; }
              .row {
                display: flex;
                justify-content: space-between;
                gap: 15px;
                padding: 12px 0;
                border-bottom: 1px solid #eee;
              }
              .total {
                font-size: 20px;
                font-weight: bold;
                color: #087443;
              }
              .footer {
                text-align: center;
                margin-top: 30px;
              }
              button {
                display: block;
                margin: 25px auto;
                padding: 12px 25px;
                background: #1677d2;
                color: white;
                border: none;
                cursor: pointer;
              }
              @media print {
                button { display: none; }
              }
            </style>
          </head>
          <body>
            <div class="receipt">
              <h2>BUKTI PEMBAYARAN SPP</h2>
              <p style="text-align:center">SIAKAD OBE</p>

              <div class="row">
                <span>No. Transaksi</span>
                <b>SPP-${Number(p.id)}</b>
              </div>
              <div class="row">
                <span>Nama Siswa</span>
                <b>${esc(p.student_name || '-')}</b>
              </div>
              <div class="row">
                <span>NIS</span>
                <b>${esc(p.nis || '-')}</b>
              </div>
              <div class="row">
                <span>Kelas</span>
                <b>${esc(p.class_name || '-')}</b>
              </div>
              <div class="row">
                <span>Tagihan</span>
                <b>${esc(p.title || '-')}</b>
              </div>
              <div class="row">
                <span>Periode</span>
                <b>${esc(p.period || '-')}</b>
              </div>
              <div class="row">
                <span>Tanggal Pembayaran</span>
                <b>${esc(tanggal(p.payment_date))}</b>
              </div>
              <div class="row">
                <span>Metode</span>
                <b>${esc(p.method || 'Tunai')}</b>
              </div>
              <div class="row total">
                <span>Total Dibayar</span>
                <b>${rupiah(p.amount)}</b>
              </div>
              <div class="row">
                <span>Petugas</span>
                <b>${esc(p.recorded_by_name || '-')}</b>
              </div>
              <div class="row">
                <span>Catatan</span>
                <b>${esc(p.note || '-')}</b>
              </div>
              <div class="footer">
                <p>Terima kasih telah melakukan pembayaran.</p>
                <b>SIAKAD OBE</b>
              </div>
            </div>
            <button onclick="window.print()">Cetak / Simpan PDF</button>
          </body>
          </html>
        `);

        win.document.close();
        win.focus();

      } catch (e) {
        win.close();
        alert(e.message || 'Gagal mencetak bukti pembayaran.');
      }
    },
    // ---------- Upload Bukti Pembayaran SPP ----------

async uploadBuktiSPP(el) {
  const id = Number(el.dataset.id);

  const amountInput = document.querySelector(
    `[data-proof-amount="${id}"]`
  );

  const fileInput = document.querySelector(
    `[data-proof-file="${id}"]`
  );

  const noteInput = document.querySelector(
    `[data-proof-note="${id}"]`
  );

  const amount = Number(amountInput?.value);
  const file = fileInput?.files?.[0];
  const note = noteInput?.value?.trim() || '';

  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error('Masukkan nominal pembayaran yang benar.');
  }

  if (!file) {
    throw new Error('Pilih foto bukti pembayaran terlebih dahulu.');
  }

  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Format bukti harus JPG, PNG, atau WEBP.');
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error('Ukuran bukti maksimal 5 MB.');
  }

  const proof = await new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(
      new Error('Gagal membaca foto bukti pembayaran.')
    );

    reader.readAsDataURL(file);
  });

  if (!confirm('Yakin ingin mengirim bukti pembayaran ini?')) {
    return;
  }

  await api(`/portal/keuangan/saya/${id}/bukti`, 'POST', {
    amount,
    proof,
    note
  });

  toast('Bukti pembayaran berhasil dikirim dan menunggu verifikasi.');
  route();
},
// ================= CETAK INVOICE SPP =================

async cetakInvoiceSPP(el) {
  const id = Number(el.dataset.id);

  if (!id) {
    throw new Error('ID tagihan tidak valid.');
  }

  const win = window.open('', '_blank');

  if (!win) {
    alert('Izinkan pop-up pada browser terlebih dahulu.');
    return;
  }

  try {
    const endpoint = me?.role === 'siswa'
      ? '/portal/keuangan/saya'
      : '/portal/keuangan';

    const data = await api(endpoint);

    const p = (data.rows || []).find(
      item => Number(item.id) === id
    );

    if (!p) {
      win.close();
      alert('Data tagihan tidak ditemukan.');
      return;
    }

    const rupiah = n =>
      'Rp ' + Number(n || 0).toLocaleString('id-ID');

    const tanggal = value => {
      if (!value) return '-';

      const d = new Date(value + 'T00:00:00');

      return isNaN(d.getTime())
        ? value
        : d.toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
          });
    };

    const total = Number(p.amount || 0);
    const dibayar = Number(p.amount_paid || 0);
    const sisa = Math.max(0, total - dibayar);

    win.document.write(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <title>Invoice SPP</title>

        <style>
          body {
            font-family: Arial, sans-serif;
            padding: 30px;
            color: #222;
          }

          .invoice {
            max-width: 700px;
            margin: auto;
            border: 1px solid #ddd;
            padding: 30px;
          }

          h2 {
            text-align: center;
            margin-bottom: 5px;
          }

          .subtitle {
            text-align: center;
            color: #666;
            margin-bottom: 30px;
          }

          .row {
            display: flex;
            justify-content: space-between;
            gap: 15px;
            padding: 13px 0;
            border-bottom: 1px solid #eee;
          }

          .total {
            font-size: 19px;
            font-weight: bold;
          }

          .remaining {
            color: #b45309;
            font-weight: bold;
          }

          .status {
            margin-top: 20px;
            padding: 12px;
            background: #f3f4f6;
            text-align: center;
            font-weight: bold;
          }

          .footer {
            text-align: center;
            margin-top: 35px;
          }

          button {
            display: block;
            margin: 25px auto;
            padding: 12px 25px;
            cursor: pointer;
          }

          @media print {
            button {
              display: none;
            }
          }
        </style>
      </head>

      <body>
        <div class="invoice">

          <h2>INVOICE TAGIHAN SPP</h2>
          <p class="subtitle">SIAKAD OBE SEKOLAH</p>

          <div class="row">
            <span>Nomor Invoice</span>
            <b>INV-SPP-${Number(p.id)}</b>
          </div>

          <div class="row">
            <span>Nama Siswa</span>
            <b>${esc(p.student_name || me?.name || '-')}</b>
          </div>

          <div class="row">
            <span>NIS</span>
            <b>${esc(p.nis || '-')}</b>
          </div>

          <div class="row">
            <span>Kelas</span>
            <b>${esc(p.class_name || '-')}</b>
          </div>

          <div class="row">
            <span>Nama Tagihan</span>
            <b>${esc(p.title || '-')}</b>
          </div>

          <div class="row">
            <span>Periode</span>
            <b>${esc(p.period || '-')}</b>
          </div>

          <div class="row">
            <span>Jatuh Tempo</span>
            <b>${esc(tanggal(p.due_date))}</b>
          </div>

          <div class="row total">
            <span>Total Tagihan</span>
            <b>${rupiah(total)}</b>
          </div>

          <div class="row">
            <span>Sudah Dibayar</span>
            <b>${rupiah(dibayar)}</b>
          </div>

          <div class="row remaining">
            <span>Sisa Pembayaran</span>
            <b>${rupiah(sisa)}</b>
          </div>

          <div class="status">
            STATUS: ${sisa <= 0 ? 'LUNAS' : 'BELUM LUNAS'}
          </div>

          <div class="footer">
            <p>Mohon melakukan pembayaran sebelum tanggal jatuh tempo.</p>
            <b>SIAKAD OBE</b>
          </div>

        </div>

        <button onclick="window.print()">
          🖨️ Cetak / Simpan PDF
        </button>
      </body>
      </html>
    `);

    win.document.close();
    win.focus();

  } catch (e) {
    win.close();
    alert(e.message || 'Gagal mencetak invoice.');
  }
},
    // ================= TAMPILKAN LAPORAN SPP =================

    async tampilkanLaporanSPP() {
      const mulai =
        document.getElementById('laporanMulai')?.value || '';

      const sampai =
        document.getElementById('laporanSampai')?.value || '';

      const siswaId =
        document.getElementById('laporanSiswa')?.value || '';

      const hasil =
        document.getElementById('hasilLaporanSPP');

      if (!hasil) {
        toast('Area laporan tidak ditemukan.', false);
        return;
      }

      if (mulai && sampai && mulai > sampai) {
        alert('Tanggal awal tidak boleh melebihi tanggal akhir.');
        return;
      }

      hasil.innerHTML = '<p>Memuat laporan...</p>';

      try {
        const params = new URLSearchParams();

        if (mulai) params.set('mulai', mulai);
        if (sampai) params.set('sampai', sampai);
        if (siswaId) params.set('siswa_id', siswaId);

        const data = await api(
          '/portal/keuangan/laporan?' + params.toString()
        );

        window.dataLaporanSPP = data;

        const total = data.total || {};

        const rupiah = n =>
          'Rp ' + Number(n || 0).toLocaleString('id-ID');

        hasil.innerHTML = `
          <h3>Total Transaksi: ${Number(total.total_transaksi || 0)}</h3>
          <h2>Total Pemasukan: ${rupiah(total.total_pembayaran)}</h2>

          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Siswa</th>
                  <th>Tagihan</th>
                  <th>Tanggal</th>
                  <th>Metode</th>
                  <th>Nominal</th>
                </tr>
              </thead>
              <tbody>
                ${(data.rows || []).map((p, i) => `
                  <tr>
                    <td>${i + 1}</td>
                    <td>${esc(p.student_name || '-')}</td>
                    <td>${esc(p.title || '-')} - ${esc(p.period || '-')}</td>
                    <td>${esc(p.payment_date || '-')}</td>
                    <td>${esc(p.method || 'Tunai')}</td>
                    <td>${rupiah(p.amount)}</td>
                  </tr>
                `).join('') || `
                  <tr>
                    <td colspan="6">Tidak ada transaksi.</td>
                  </tr>
                `}
              </tbody>
            </table>
          </div>

          <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:20px">
            <button type="button" onclick="window.print()">
              🖨️ Cetak Laporan
            </button>
            <button type="button" data-action="exportLaporanSPP">
              📥 Export Excel
            </button>
          </div>
        `;

      } catch (e) {
        hasil.innerHTML =
          'Gagal memuat laporan: ' + esc(e.message);
      }
    },

    // ================= EXPORT LAPORAN SPP =================

    async exportLaporanSPP() {
      const data = window.dataLaporanSPP;

      if (!data || !data.rows) {
        alert('Tampilkan laporan terlebih dahulu!');
        return;
      }

      const rows = [
        ['LAPORAN KEUANGAN SPP'],
        ['Total Transaksi', data.total?.total_transaksi || 0],
        ['Total Pemasukan', data.total?.total_pembayaran || 0],
        [],
        ['No', 'Nama Siswa', 'Tagihan', 'Periode', 'Tanggal', 'Metode', 'Nominal']
      ];

      data.rows.forEach((p, i) => {
        rows.push([
          i + 1,
          p.student_name || '-',
          p.title || '-',
          p.period || '-',
          p.payment_date || '-',
          p.method || 'Tunai',
          Number(p.amount || 0)
        ]);
      });

      const csv = '\uFEFF' + rows.map(row =>
        row.map(value =>
          '"' + String(value ?? '').replace(/"/g, '""') + '"'
        ).join(';')
      ).join('\r\n');

      const blob = new Blob([csv], {
        type: 'text/csv;charset=utf-8;'
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');

      a.href = url;
      a.download = 'Laporan_Keuangan_SPP.csv';

      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);

      toast('Laporan berhasil diekspor!');
    }
  };

  // ================= CHANGE HANDLERS =================

  const CHANGES = {
    raporSemester(el) {
      const o = document.getElementById('raporView');
      if (o) {
        showRapor(o.dataset.url, el.value)
          .catch(e => toast(e.message, false));
      }
    },

    pickRaporKelas(el) {
      location.hash = '#/rapor/' + el.value;
    },

    pickAssess(el) {
      location.hash = `#/class/${el.dataset.tid}/input/${el.value}`;
    },

    setHomeroom(el) {
      api('/admin/classes/' + el.dataset.id + '/homeroom', 'PUT', {
        teacher_id: el.value ? Number(el.value) : null
      })
        .then(() => toast('Wali kelas tersimpan'))
        .catch(e => {
          toast(e.message, false);
          route();
        });
    },

    pickNaikKelas(el) {
      location.hash = '#/naik/' + el.value;
    },
    pickWaliSemester(el) {
      location.hash = '#/wali/' + encodeURIComponent(el.value);
    },
    restoreAlumni(el) {
      if (!el.value) return;

      api('/admin/students/' + el.dataset.id + '/restore', 'PUT', {
        class_id: Number(el.value)
      })
        .then(() => {
          toast('Alumni dikembalikan ke kelas');
          route();
        })
        .catch(e => {
          toast(e.message, false);
          route();
        });
    }
  };

  // ================= EVENT LISTENERS =================

  document.addEventListener('submit', async (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;

    e.preventDefault();

    try {
      const handler = FORMS[f.dataset.form];

      if (!handler) {
        throw new Error('Handler form tidak ditemukan: ' + f.dataset.form);
      }

      await handler(Object.fromEntries(new FormData(f)), f);

    } catch (err) {
      toast(err.message, false);
    }
  });

  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;

    try {
      const handler = ACTIONS[el.dataset.action];

      if (!handler) {
        throw new Error('Handler aksi tidak ditemukan: ' + el.dataset.action);
      }

      await handler(el, e);

    } catch (err) {
      toast(err.message, false);
    }
  });

  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (el) {
      CHANGES[el.dataset.change](el);
    }
  });

  // Tutup sidebar (tampilan mobile) setelah menu diklik
  document.addEventListener('click', (e) => {
    if (e.target.closest('#side nav a')) {
      const side = document.getElementById('side');
      if (side) side.classList.remove('open');
    }
  });

  // ================= INISIALISASI =================

  window.addEventListener('hashchange', route);

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