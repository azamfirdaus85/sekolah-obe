const router = require('express').Router();
const db = require('../db');
const { auth, role } = require('../authMiddleware');

/* =====================================================
   DASHBOARD (TAHAP 3)
   - GET    /ringkasan        : jadwal hari ini + terakhir dikunjungi (semua role)
   - POST   /kunjungan        : catat halaman yang dikunjungi (semua role)
   - GET    /jadwal           : daftar semua jadwal (admin)
   - POST   /jadwal           : tambah jadwal (admin)
   - DELETE /jadwal/:id       : hapus jadwal (admin)
   ===================================================== */

const TZ = 'Asia/Jakarta';
const DAY_NAMES = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
const RE_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const RE_PAGE = /^#\/[A-Za-z0-9_\-\/]{0,100}$/;
const MAX_VISITS = 20;

const todayStr = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
function todayDow() { // 1 = Senin ... 7 = Minggu
  const d = new Date(todayStr() + 'T00:00:00Z').getUTCDay();
  return d === 0 ? 7 : d;
}
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
const fail = (res, e, msg) => { console.error(e); res.status(500).json({ error: msg }); };

router.use(auth);

/* ---------- Ringkasan dashboard ---------- */
router.get('/ringkasan', async (req, res) => {
  try {
    const dow = todayDow();
    let where = 'sch.day_of_week = ?';
    const args = [dow];

    if (req.user.role === 'guru') {
      where += ' AND t.teacher_id = ?';
      args.push(req.user.id);
    } else if (req.user.role === 'siswa') {
      const me = await db.prepare('SELECT class_id FROM students WHERE user_id = ?').get(req.user.id);
      if (!me || !me.class_id) {
        where += ' AND 1 = 0';
      } else {
        where += ' AND t.class_id = ?';
        args.push(me.class_id);
      }
    }

    const jadwal = await db.prepare(`
      SELECT sch.id, sch.start_time, sch.end_time, sch.room,
             s.name AS subject_name, c.name AS class_name, u.name AS teacher_name
      FROM schedules sch
      JOIN teaching t ON t.id = sch.teaching_id
      JOIN subjects s ON s.id = t.subject_id
      JOIN classes c ON c.id = t.class_id
      JOIN users u ON u.id = t.teacher_id
      WHERE ${where}
      ORDER BY sch.start_time, c.name`).all(...args);

    const terakhir = await db.prepare(`
      SELECT page, label, visited_at
      FROM visit_log
      WHERE user_id = ?
      ORDER BY visited_at DESC, id DESC
      LIMIT 5`).all(req.user.id);

    res.json({ date: todayStr(), day_name: DAY_NAMES[dow], jadwal, terakhir });
  } catch (e) { fail(res, e, 'Gagal memuat dashboard'); }
});

/* ---------- Catat kunjungan ---------- */
router.post('/kunjungan', async (req, res) => {
  try {
    const page = clip(req.body.page, 120);
    const label = clip(req.body.label, 60);
    if (!RE_PAGE.test(page) || !label) return res.status(400).json({ error: 'Data kunjungan tidak valid' });

    const upd = await db.prepare(
      'UPDATE visit_log SET visited_at = CURRENT_TIMESTAMP, label = ? WHERE user_id = ? AND page = ?'
    ).run(label, req.user.id, page);
    if (!upd.changes) {
      await db.prepare('INSERT INTO visit_log (user_id, page, label) VALUES (?, ?, ?)').run(req.user.id, page, label);
      // simpan paling banyak MAX_VISITS halaman terakhir per pengguna
      await db.prepare(`
        DELETE FROM visit_log
        WHERE user_id = ? AND id NOT IN (
          SELECT id FROM visit_log WHERE user_id = ? ORDER BY visited_at DESC, id DESC LIMIT ${MAX_VISITS}
        )`).run(req.user.id, req.user.id);
    }
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'Gagal mencatat kunjungan'); }
});

/* ---------- Kelola jadwal (admin) ---------- */
router.get('/jadwal', role('admin'), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT sch.id, sch.teaching_id, sch.day_of_week, sch.start_time, sch.end_time, sch.room,
             s.name AS subject_name, c.name AS class_name, u.name AS teacher_name
      FROM schedules sch
      JOIN teaching t ON t.id = sch.teaching_id
      JOIN subjects s ON s.id = t.subject_id
      JOIN classes c ON c.id = t.class_id
      JOIN users u ON u.id = t.teacher_id
      ORDER BY sch.day_of_week, sch.start_time, c.name`).all();
    res.json(rows.map((r) => ({ ...r, day_name: DAY_NAMES[Number(r.day_of_week)] || '-' })));
  } catch (e) { fail(res, e, 'Gagal memuat jadwal'); }
});

router.post('/jadwal', role('admin'), async (req, res) => {
  try {
    const teachingId = Number(req.body.teaching_id);
    const day = Number(req.body.day_of_week);
    const start = clip(req.body.start_time, 5);
    const end = clip(req.body.end_time, 5);
    const room = clip(req.body.room, 40) || null;
    if (!Number.isInteger(teachingId) || teachingId <= 0) return res.status(400).json({ error: 'Pilih kelas ajar' });
    if (!Number.isInteger(day) || day < 1 || day > 7) return res.status(400).json({ error: 'Hari tidak valid' });
    if (!RE_TIME.test(start) || !RE_TIME.test(end)) return res.status(400).json({ error: 'Format jam harus HH:MM' });
    if (start >= end) return res.status(400).json({ error: 'Jam selesai harus setelah jam mulai' });
    const t = await db.prepare('SELECT id FROM teaching WHERE id = ?').get(teachingId);
    if (!t) return res.status(404).json({ error: 'Kelas ajar tidak ditemukan' });
    const r = await db.prepare(
      'INSERT INTO schedules (teaching_id, day_of_week, start_time, end_time, room) VALUES (?, ?, ?, ?, ?)'
    ).run(teachingId, day, start, end, room);
    res.status(201).json({ id: r.lastInsertRowid });
  } catch (e) { fail(res, e, 'Gagal menambah jadwal'); }
});

router.delete('/jadwal/:id', role('admin'), async (req, res) => {
  try {
    await db.prepare('DELETE FROM schedules WHERE id = ?').run(Number(req.params.id));
    res.json({ ok: true });
  } catch (e) { fail(res, e, 'Gagal menghapus jadwal'); }
});

module.exports = router;