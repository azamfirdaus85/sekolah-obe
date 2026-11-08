const router = require('express').Router();
const db = require('../db');
const { auth, role } = require('../authMiddleware');

/* =====================================================
   ABSENSI (TAHAP 2)
   - Guru   : mengabsen siswa per kelas ajar + absen dirinya sendiri
   - Kepsek : absen dirinya sendiri + memantau guru & siswa
   - Admin  : memantau (sama seperti kepsek, tanpa absen sendiri)
   - Siswa  : melihat riwayat absensinya sendiri
   Tabel dipisah: student_attendance, teacher_attendance, principal_attendance
   ===================================================== */

const TZ = 'Asia/Jakarta';
const STATUS_SISWA = ['hadir', 'izin', 'sakit', 'alpa'];
const STATUS_STAF = ['hadir', 'izin', 'sakit', 'dinas'];
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_MONTH = /^\d{4}-\d{2}$/;

const todayStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ }); // YYYY-MM-DD (WIB)
const nowTime = () => new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit' }); // HH:MM
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

function isValidDate(s) {
  if (!RE_DATE.test(s || '')) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

function staffTable(user) {
  return user.role === 'kepsek' ? 'principal_attendance' : 'teacher_attendance';
}

// Jalankan banyak perintah sekaligus (Turso: batch, Lokal: transaksi)
async function runBatch(stmts) {
  if (!stmts.length) return;
  if (db.isTurso) {
    await db.client.batch(stmts, 'write');
  } else {
    const tx = db.transaction(() => {
      for (const s of stmts) db.prepare(s.sql).run(...s.args);
    });
    tx();
  }
}

const fail = (res, e, msg) => {
  console.error(e);
  res.status(500).json({ error: msg });
};

async function ownTeaching(teachingId, userId) {
  return db.prepare(`
    SELECT t.id, t.class_id, t.semester, s.name AS subject_name, c.name AS class_name
    FROM teaching t
    JOIN subjects s ON s.id = t.subject_id
    JOIN classes c ON c.id = t.class_id
    WHERE t.id = ? AND t.teacher_id = ?`).get(Number(teachingId), userId);
}

router.use(auth);

/* ============================ GURU ============================ */

// Daftar kelas ajar milik guru yang login
router.get('/guru/kelas', role('guru'), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT t.id, t.semester, s.name AS subject_name, c.name AS class_name,
             (SELECT COUNT(*) FROM students st WHERE st.class_id = t.class_id) AS students
      FROM teaching t
      JOIN subjects s ON s.id = t.subject_id
      JOIN classes c ON c.id = t.class_id
      WHERE t.teacher_id = ?
      ORDER BY t.semester DESC, c.name, s.name`).all(req.user.id);
    res.json(rows);
  } catch (e) { fail(res, e, 'Gagal memuat kelas ajar'); }
});

// Daftar siswa + status absensi pada tanggal tertentu
router.get('/guru/siswa', role('guru'), async (req, res) => {
  try {
    const date = clip(req.query.date, 10) || todayStr();
    if (!isValidDate(date)) return res.status(400).json({ error: 'Tanggal tidak valid' });
    const t = await ownTeaching(req.query.teaching_id, req.user.id);
    if (!t) return res.status(404).json({ error: 'Kelas ajar tidak ditemukan' });
    const rows = await db.prepare(`
      SELECT st.id AS student_id, st.nis, u.name, a.status, a.note
      FROM students st
      JOIN users u ON u.id = st.user_id
      LEFT JOIN student_attendance a
             ON a.student_id = st.id AND a.teaching_id = ? AND a.date = ?
      WHERE st.class_id = ?
      ORDER BY u.name`).all(t.id, date, t.class_id);
    res.json({ teaching: t, date, rows });
  } catch (e) { fail(res, e, 'Gagal memuat daftar siswa'); }
});

// Simpan absensi siswa (boleh disimpan berulang untuk tanggal yang sama)
router.put('/guru/siswa', role('guru'), async (req, res) => {
  try {
    const date = clip(req.body.date, 10);
    if (!isValidDate(date)) return res.status(400).json({ error: 'Tanggal tidak valid' });
    if (date > todayStr()) return res.status(400).json({ error: 'Tidak bisa mengabsen tanggal yang belum terjadi' });
    const t = await ownTeaching(req.body.teaching_id, req.user.id);
    if (!t) return res.status(404).json({ error: 'Kelas ajar tidak ditemukan' });
    const records = Array.isArray(req.body.records) ? req.body.records : [];
    if (!records.length) return res.status(400).json({ error: 'Tidak ada data absensi' });
    if (records.length > 200) return res.status(400).json({ error: 'Data terlalu banyak' });

    const members = await db.prepare('SELECT id FROM students WHERE class_id = ?').all(t.class_id);
    const allowed = new Set(members.map((m) => Number(m.id)));

    const stmts = [];
    for (const r of records) {
      const sid = Number(r.student_id);
      const status = String(r.status || '');
      if (!allowed.has(sid)) return res.status(400).json({ error: 'Ada siswa yang bukan anggota kelas ini' });
      if (!STATUS_SISWA.includes(status)) return res.status(400).json({ error: 'Status absensi tidak valid' });
      stmts.push({
        sql: `INSERT INTO student_attendance (student_id, teaching_id, date, status, note, recorded_by)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(student_id, teaching_id, date)
              DO UPDATE SET status = excluded.status, note = excluded.note, recorded_by = excluded.recorded_by`,
        args: [sid, t.id, date, status, clip(r.note, 200) || null, req.user.id]
      });
    }
    await runBatch(stmts);
    res.json({ ok: true, saved: stmts.length });
  } catch (e) { fail(res, e, 'Gagal menyimpan absensi'); }
});

// Rekap absensi siswa per bulan untuk satu kelas ajar
router.get('/guru/rekap', role('guru'), async (req, res) => {
  try {
    const month = clip(req.query.month, 7) || todayStr().slice(0, 7);
    if (!RE_MONTH.test(month)) return res.status(400).json({ error: 'Bulan tidak valid' });
    const t = await ownTeaching(req.query.teaching_id, req.user.id);
    if (!t) return res.status(404).json({ error: 'Kelas ajar tidak ditemukan' });
    const rows = await db.prepare(`
      SELECT st.id AS student_id, st.nis, u.name,
             COALESCE(SUM(CASE WHEN a.status = 'hadir' THEN 1 ELSE 0 END), 0) AS hadir,
             COALESCE(SUM(CASE WHEN a.status = 'izin'  THEN 1 ELSE 0 END), 0) AS izin,
             COALESCE(SUM(CASE WHEN a.status = 'sakit' THEN 1 ELSE 0 END), 0) AS sakit,
             COALESCE(SUM(CASE WHEN a.status = 'alpa'  THEN 1 ELSE 0 END), 0) AS alpa,
             COUNT(a.id) AS total
      FROM students st
      JOIN users u ON u.id = st.user_id
      LEFT JOIN student_attendance a
             ON a.student_id = st.id AND a.teaching_id = ? AND a.date BETWEEN ? AND ?
      WHERE st.class_id = ?
      GROUP BY st.id, st.nis, u.name
      ORDER BY u.name`).all(t.id, month + '-01', month + '-31', t.class_id);
    res.json({ teaching: t, month, rows });
  } catch (e) { fail(res, e, 'Gagal memuat rekap'); }
});

/* ============================ SISWA ============================ */

router.get('/siswa/saya', role('siswa'), async (req, res) => {
  try {
    const me = await db.prepare('SELECT id, nis FROM students WHERE user_id = ?').get(req.user.id);
    if (!me) return res.status(404).json({ error: 'Data siswa tidak ditemukan' });
    const counts = await db.prepare(
      'SELECT status, COUNT(*) AS n FROM student_attendance WHERE student_id = ? GROUP BY status'
    ).all(me.id);
    const summary = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
    for (const c of counts) if (c.status in summary) summary[c.status] = Number(c.n);
    const rows = await db.prepare(`
      SELECT a.date, a.status, a.note, s.name AS subject_name
      FROM student_attendance a
      JOIN teaching t ON t.id = a.teaching_id
      JOIN subjects s ON s.id = t.subject_id
      WHERE a.student_id = ?
      ORDER BY a.date DESC, a.id DESC
      LIMIT 200`).all(me.id);
    res.json({ nis: me.nis, summary, rows });
  } catch (e) { fail(res, e, 'Gagal memuat absensi'); }
});

/* ================= GURU & KEPSEK: ABSEN DIRI SENDIRI ================= */

router.get('/staf/saya', role('guru', 'kepsek'), async (req, res) => {
  try {
    const table = staffTable(req.user);
    const date = todayStr();
    const today = await db.prepare(
      `SELECT date, status, check_in, check_out, note FROM ${table} WHERE user_id = ? AND date = ?`
    ).get(req.user.id, date);
    const rows = await db.prepare(
      `SELECT date, status, check_in, check_out, note FROM ${table} WHERE user_id = ? ORDER BY date DESC LIMIT 31`
    ).all(req.user.id);
    res.json({ date, today: today || null, rows });
  } catch (e) { fail(res, e, 'Gagal memuat absensi'); }
});

router.post('/staf/masuk', role('guru', 'kepsek'), async (req, res) => {
  try {
    const table = staffTable(req.user);
    const date = todayStr();
    const ex = await db.prepare(`SELECT id, check_in FROM ${table} WHERE user_id = ? AND date = ?`).get(req.user.id, date);
    if (ex && ex.check_in) return res.status(400).json({ error: 'Anda sudah absen masuk hari ini' });
    if (ex) {
      await db.prepare(`UPDATE ${table} SET status = 'hadir', check_in = ?, note = NULL WHERE id = ?`).run(nowTime(), ex.id);
    } else {
      await db.prepare(`INSERT INTO ${table} (user_id, date, check_in, status) VALUES (?, ?, ?, 'hadir')`).run(req.user.id, date, nowTime());
    }
    res.json({ ok: true, check_in: nowTime() });
  } catch (e) { fail(res, e, 'Gagal absen masuk'); }
});

router.post('/staf/pulang', role('guru', 'kepsek'), async (req, res) => {
  try {
    const table = staffTable(req.user);
    const date = todayStr();
    const ex = await db.prepare(`SELECT id, check_in, check_out FROM ${table} WHERE user_id = ? AND date = ?`).get(req.user.id, date);
    if (!ex || !ex.check_in) return res.status(400).json({ error: 'Anda belum absen masuk hari ini' });
    if (ex.check_out) return res.status(400).json({ error: 'Anda sudah absen pulang hari ini' });
    await db.prepare(`UPDATE ${table} SET check_out = ? WHERE id = ?`).run(nowTime(), ex.id);
    res.json({ ok: true, check_out: nowTime() });
  } catch (e) { fail(res, e, 'Gagal absen pulang'); }
});

// Izin / sakit / dinas (tanpa jam masuk)
router.post('/staf/izin', role('guru', 'kepsek'), async (req, res) => {
  try {
    const status = String(req.body.status || '');
    if (!['izin', 'sakit', 'dinas'].includes(status)) return res.status(400).json({ error: 'Status tidak valid' });
    const table = staffTable(req.user);
    const date = todayStr();
    const note = clip(req.body.note, 200) || null;
    const ex = await db.prepare(`SELECT id, check_in FROM ${table} WHERE user_id = ? AND date = ?`).get(req.user.id, date);
    if (ex && ex.check_in) return res.status(400).json({ error: 'Anda sudah absen masuk hari ini' });
    if (ex) {
      await db.prepare(`UPDATE ${table} SET status = ?, note = ? WHERE id = ?`).run(status, note, ex.id);
    } else {
      await db.prepare(`INSERT INTO ${table} (user_id, date, status, note) VALUES (?, ?, ?, ?)`).run(req.user.id, date, status, note);
    }
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'Gagal menyimpan keterangan'); }
});

/* ================= KEPSEK & ADMIN: PANTAU HARIAN ================= */

router.get('/pantau/hari', role('kepsek', 'admin'), async (req, res) => {
  try {
    const date = clip(req.query.date, 10) || todayStr();
    if (!isValidDate(date)) return res.status(400).json({ error: 'Tanggal tidak valid' });

    const guru = await db.prepare(`
      SELECT u.id, u.name, a.status, a.check_in, a.check_out, a.note
      FROM users u
      LEFT JOIN teacher_attendance a ON a.user_id = u.id AND a.date = ?
      WHERE u.role = 'guru' AND (u.active IS NULL OR u.active = 1)
      ORDER BY u.name`).all(date);

    const kepsek = await db.prepare(`
      SELECT u.id, u.name, a.status, a.check_in, a.check_out, a.note
      FROM users u
      LEFT JOIN principal_attendance a ON a.user_id = u.id AND a.date = ?
      WHERE u.role = 'kepsek' AND (u.active IS NULL OR u.active = 1)
      ORDER BY u.name`).all(date);

    const kelas = await db.prepare(`
      SELECT c.id, c.name,
             COUNT(DISTINCT st.id) AS total,
             COALESCE(SUM(CASE WHEN a.status = 'hadir' THEN 1 ELSE 0 END), 0) AS hadir,
             COALESCE(SUM(CASE WHEN a.status = 'izin'  THEN 1 ELSE 0 END), 0) AS izin,
             COALESCE(SUM(CASE WHEN a.status = 'sakit' THEN 1 ELSE 0 END), 0) AS sakit,
             COALESCE(SUM(CASE WHEN a.status = 'alpa'  THEN 1 ELSE 0 END), 0) AS alpa
      FROM classes c
      LEFT JOIN students st ON st.class_id = c.id
      LEFT JOIN student_attendance a ON a.student_id = st.id AND a.date = ?
      GROUP BY c.id, c.name
      ORDER BY c.name`).all(date);

    const tidak_hadir = await db.prepare(`
      SELECT u.name, c.name AS class_name, s.name AS subject_name, a.status, a.note
      FROM student_attendance a
      JOIN students st ON st.id = a.student_id
      JOIN users u ON u.id = st.user_id
      LEFT JOIN classes c ON c.id = st.class_id
      JOIN teaching t ON t.id = a.teaching_id
      JOIN subjects s ON s.id = t.subject_id
      WHERE a.date = ? AND a.status <> 'hadir'
      ORDER BY c.name, u.name`).all(date);

    res.json({ date, guru, kepsek, kelas, tidak_hadir });
  } catch (e) { fail(res, e, 'Gagal memuat pantauan absensi'); }
});

module.exports = router;