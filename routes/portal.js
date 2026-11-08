const router = require('express').Router();
const db = require('../db');
const { auth, role } = require('../authMiddleware');

/* =====================================================
   PORTAL (TAHAP 4): Layanan Pengaduan, Administrasi, Akademik, Akun
   Semua endpoint di bawah /api/portal
   ===================================================== */

const TZ = 'Asia/Jakarta';
const DAY_NAMES = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const CATEGORIES = ['Akademik', 'Sarana & Prasarana', 'Layanan Administrasi', 'Keamanan & Kenyamanan', 'Lainnya'];
const COMPLAINT_STATUS = ['baru', 'diproses', 'selesai', 'ditolak'];
const DOC_TYPES = ['Surat Masuk', 'Surat Keluar', 'SK / Keputusan', 'Arsip', 'Lainnya'];
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RE_PHONE = /^[0-9+\-\s()]{6,20}$/;

const todayStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const fail = (res, e, msg) => { console.error(e); res.status(500).json({ error: msg }); };
const bad = (res, msg) => res.status(400).json({ error: msg });

function isValidDate(s) {
  if (!RE_DATE.test(s || '')) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

router.use(auth);

/* ======================= LAYANAN PENGADUAN ======================= */

// Pengaduan milik sendiri (siswa & guru)
router.get('/pengaduan/saya', role('siswa', 'guru'), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT id, category, subject, body, status, response, responded_at, created_at
      FROM complaints WHERE user_id = ? ORDER BY id DESC LIMIT 100`).all(req.user.id);
    res.json({ categories: CATEGORIES, rows });
  } catch (e) { fail(res, e, 'Gagal memuat pengaduan'); }
});

router.post('/pengaduan', role('siswa', 'guru'), async (req, res) => {
  try {
    const category = clip(req.body.category, 40);
    const subject = clip(req.body.subject, 120);
    const body = clip(req.body.body, 2000);
    if (!CATEGORIES.includes(category)) return bad(res, 'Pilih kategori pengaduan');
    if (subject.length < 3) return bad(res, 'Judul pengaduan minimal 3 karakter');
    if (body.length < 10) return bad(res, 'Isi pengaduan minimal 10 karakter');
    const open = await db.prepare("SELECT COUNT(*) AS n FROM complaints WHERE user_id = ? AND status = 'baru'").get(req.user.id);
    if (Number(open.n) >= 10) return bad(res, 'Terlalu banyak pengaduan yang belum ditanggapi');
    const r = await db.prepare('INSERT INTO complaints (user_id, category, subject, body) VALUES (?, ?, ?, ?)')
      .run(req.user.id, category, subject, body);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e) { fail(res, e, 'Gagal mengirim pengaduan'); }
});

// Pelapor boleh menarik pengaduan selama belum ditanggapi
router.delete('/pengaduan/:id', role('siswa', 'guru'), async (req, res) => {
  try {
    const r = await db.prepare("DELETE FROM complaints WHERE id = ? AND user_id = ? AND status = 'baru'")
      .run(Number(req.params.id), req.user.id);
    if (!r.changes) return bad(res, 'Pengaduan tidak bisa dihapus (sudah ditanggapi atau bukan milik Anda)');
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'Gagal menghapus pengaduan'); }
});

// Admin & kepala sekolah: lihat semua pengaduan
router.get('/pengaduan', role('admin', 'kepsek'), async (req, res) => {
  try {
    const status = clip(req.query.status, 10);
    const filter = COMPLAINT_STATUS.includes(status) ? ' WHERE c.status = ?' : '';
    const rows = await db.prepare(`
      SELECT c.id, c.category, c.subject, c.body, c.status, c.response, c.responded_at, c.created_at,
             u.name AS user_name, u.role AS user_role
      FROM complaints c
      JOIN users u ON u.id = c.user_id${filter}
      ORDER BY c.id DESC LIMIT 300`).all(...(filter ? [status] : []));
    const cnt = await db.prepare('SELECT status, COUNT(*) AS n FROM complaints GROUP BY status').all();
    const counts = { baru: 0, diproses: 0, selesai: 0, ditolak: 0 };
    for (const c of cnt) if (c.status in counts) counts[c.status] = Number(c.n);
    res.json({ counts, rows });
  } catch (e) { fail(res, e, 'Gagal memuat pengaduan'); }
});

router.put('/pengaduan/:id', role('admin', 'kepsek'), async (req, res) => {
  try {
    const status = clip(req.body.status, 10);
    const response = clip(req.body.response, 1000);
    if (!COMPLAINT_STATUS.includes(status)) return bad(res, 'Status tidak valid');
    if ((status === 'selesai' || status === 'ditolak') && response.length < 3) return bad(res, 'Isi tanggapan terlebih dahulu');
    const r = await db.prepare(
      'UPDATE complaints SET status = ?, response = ?, responded_by = ?, responded_at = CURRENT_TIMESTAMP WHERE id = ?'
    ).run(status, response || null, req.user.id, Number(req.params.id));
    if (!r.changes) return res.status(404).json({ error: 'Pengaduan tidak ditemukan' });
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'Gagal menyimpan tanggapan'); }
});

/* ============================ ADMINISTRASI ============================ */

router.get('/administrasi', role('admin', 'kepsek'), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT d.id, d.type, d.title, d.description, d.doc_date, d.created_at, u.name AS created_by_name
      FROM admin_documents d
      LEFT JOIN users u ON u.id = d.created_by
      ORDER BY d.doc_date DESC, d.id DESC LIMIT 300`).all();
    res.json({ types: DOC_TYPES, rows });
  } catch (e) { fail(res, e, 'Gagal memuat dokumen'); }
});

router.post('/administrasi', role('admin'), async (req, res) => {
  try {
    const type = clip(req.body.type, 30);
    const title = clip(req.body.title, 150);
    const description = clip(req.body.description, 500) || null;
    const docDate = clip(req.body.doc_date, 10) || todayStr();
    if (!DOC_TYPES.includes(type)) return bad(res, 'Pilih jenis dokumen');
    if (title.length < 3) return bad(res, 'Judul dokumen minimal 3 karakter');
    if (!isValidDate(docDate)) return bad(res, 'Tanggal tidak valid');
    const r = await db.prepare('INSERT INTO admin_documents (type, title, description, doc_date, created_by) VALUES (?, ?, ?, ?, ?)')
      .run(type, title, description, docDate, req.user.id);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e) { fail(res, e, 'Gagal menyimpan dokumen'); }
});

router.delete('/administrasi/:id', role('admin'), async (req, res) => {
  try {
    await db.prepare('DELETE FROM admin_documents WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'Gagal menghapus dokumen'); }
});

/* ============================== AKADEMIK ============================== */

// Kalender akademik (semua role boleh melihat)
router.get('/akademik/kalender', async (req, res) => {
  try {
    const rows = await db.prepare(
      'SELECT id, title, start_date, end_date, description FROM academic_calendar ORDER BY start_date, id LIMIT 300'
    ).all();
    res.json({ today: todayStr(), rows });
  } catch (e) { fail(res, e, 'Gagal memuat kalender'); }
});

router.post('/akademik/kalender', role('admin'), async (req, res) => {
  try {
    const title = clip(req.body.title, 150);
    const start = clip(req.body.start_date, 10);
    const end = clip(req.body.end_date, 10) || null;
    const description = clip(req.body.description, 500) || null;
    if (title.length < 3) return bad(res, 'Judul kegiatan minimal 3 karakter');
    if (!isValidDate(start)) return bad(res, 'Tanggal mulai tidak valid');
    if (end && (!isValidDate(end) || end < start)) return bad(res, 'Tanggal selesai harus sama atau setelah tanggal mulai');
    const r = await db.prepare('INSERT INTO academic_calendar (title, start_date, end_date, description) VALUES (?, ?, ?, ?)')
      .run(title, start, end, description);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e) { fail(res, e, 'Gagal menyimpan kegiatan'); }
});

router.delete('/akademik/kalender/:id', role('admin'), async (req, res) => {
  try {
    await db.prepare('DELETE FROM academic_calendar WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'Gagal menghapus kegiatan'); }
});

// Jadwal mingguan: guru = jadwal mengajarnya, siswa = jadwal kelasnya, admin/kepsek = semua
router.get('/akademik/jadwal', async (req, res) => {
  try {
    let where = '1 = 1';
    const args = [];
    if (req.user.role === 'guru') {
      where = 't.teacher_id = ?';
      args.push(req.user.id);
    } else if (req.user.role === 'siswa') {
      const me = await db.prepare('SELECT class_id FROM students WHERE user_id = ?').get(req.user.id);
      if (!me || !me.class_id) return res.json({ rows: [] });
      where = 't.class_id = ?';
      args.push(me.class_id);
    }
    const rows = await db.prepare(`
      SELECT sch.id, sch.day_of_week, sch.start_time, sch.end_time, sch.room,
             s.name AS subject_name, c.name AS class_name, u.name AS teacher_name
      FROM schedules sch
      JOIN teaching t ON t.id = sch.teaching_id
      JOIN subjects s ON s.id = t.subject_id
      JOIN classes c ON c.id = t.class_id
      JOIN users u ON u.id = t.teacher_id
      WHERE ${where}
      ORDER BY sch.day_of_week, sch.start_time, c.name`).all(...args);
    res.json({ rows: rows.map((r) => ({ ...r, day_name: DAY_NAMES[Number(r.day_of_week)] || '-' })) });
  } catch (e) { fail(res, e, 'Gagal memuat jadwal'); }
});

/* ================================ AKUN ================================ */

router.get('/akun', async (req, res) => {
  try {
    const u = await db.prepare('SELECT id, username, name, role, email, phone FROM users WHERE id = ?').get(req.user.id);
    let siswa = null;
    if (req.user.role === 'siswa') {
      siswa = (await db.prepare(`
        SELECT st.nis, c.name AS class_name, c.year
        FROM students st LEFT JOIN classes c ON c.id = st.class_id
        WHERE st.user_id = ?`).get(req.user.id)) || null;
    }
    res.json({ user: u, siswa });
  } catch (e) { fail(res, e, 'Gagal memuat akun'); }
});

router.put('/akun', async (req, res) => {
  try {
    const email = clip(req.body.email, 120);
    const phone = clip(req.body.phone, 20);
    if (email && !RE_EMAIL.test(email)) return bad(res, 'Format email tidak valid');
    if (phone && !RE_PHONE.test(phone)) return bad(res, 'Format nomor telepon tidak valid');
    await db.prepare('UPDATE users SET email = ?, phone = ? WHERE id = ?').run(email || null, phone || null, req.user.id);
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'Gagal menyimpan akun'); }
});

module.exports = router;