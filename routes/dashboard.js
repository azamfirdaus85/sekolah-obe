const router = require('express').Router();
const db = require('../db');
const { auth, role } = require('../authMiddleware');
const { KKM } = require('../analysis');

/* =====================================================
   DASHBOARD (TAHAP 3)
   - GET    /ringkasan        : jadwal hari ini + terakhir dikunjungi (semua role)
   - POST   /kunjungan        : catat halaman yang dikunjungi (semua role)
   - GET    /jadwal           : daftar semua jadwal (admin)
   - POST   /jadwal           : tambah jadwal (admin)
   - DELETE /jadwal/:id       : hapus jadwal (admin)
   - GET    /grafik           : data grafik sesuai peran (semua role)
   - GET    /search?q=        : pencarian global sesuai peran (semua role)
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
    } else if (req.user.role === 'orang_tua') {
      // Orang tua hanya melihat jadwal kelas anaknya
      const kids = await db.prepare(`
        SELECT DISTINCT s.class_id
        FROM parent_student_links l
        JOIN students s ON s.id = l.student_id
        WHERE l.parent_user_id = ? AND s.class_id IS NOT NULL`).all(req.user.id);
      if (!kids.length) {
        where += ' AND 1 = 0';
      } else {
        where += ` AND t.class_id IN (${kids.map(() => '?').join(',')})`;
        args.push(...kids.map((k) => Number(k.class_id)));
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

/* ---------- Grafik dashboard per peran ---------- */
const round1 = (v) => (v == null || isNaN(Number(v)) ? null : Math.round(Number(v) * 10) / 10);
const AVG_SQL = 'SUM(sc.score * 100.0 / a.max_score * COALESCE(a.weight, 1)) / SUM(COALESCE(a.weight, 1))';

function lastDays(n) {
  const out = [];
  const base = new Date(todayStr() + 'T00:00:00Z');
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(base.getTime() - i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}
const dayLabel = (iso) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('id-ID', { weekday: 'short', timeZone: 'UTC' }) + ' ' + Number(iso.slice(8));

router.get('/grafik', async (req, res) => {
  try {
    const r = req.user.role;

    // Orang tua tidak boleh melihat statistik seluruh sekolah
    if (r === 'orang_tua') {
      return res.json({
        kkm: KKM,
        nilai: { title: 'Nilai', rows: [] },
        kehadiran: { title: 'Kehadiran', type: 'harian', rows: [] }
      });
    }

    // ----- SISWA: nilai per mapel + rekap kehadiran sendiri -----
    if (r === 'siswa') {
      const out = {
        kkm: KKM,
        nilai: { title: 'Nilai per Mata Pelajaran', rows: [] },
        kehadiran: { title: 'Rekap Kehadiran Saya', type: 'ringkas', rows: [] }
      };
      const me = await db.prepare('SELECT id FROM students WHERE user_id = ?').get(req.user.id);
      if (!me) return res.json(out);

      const nv = await db.prepare(`
        SELECT s.name AS label, ${AVG_SQL} AS avg
        FROM scores sc
        JOIN assessments a ON a.id = sc.assessment_id
        JOIN teaching t ON t.id = a.teaching_id
        JOIN subjects s ON s.id = t.subject_id
        WHERE sc.student_id = ? AND a.max_score > 0 AND sc.score IS NOT NULL
        GROUP BY t.id
        ORDER BY s.name`).all(me.id);
      out.nilai.rows = nv.map((x) => ({ label: x.label, value: round1(x.avg) })).filter((x) => x.value != null);

      const att = await db.prepare(
        'SELECT status, COUNT(*) AS n FROM student_attendance WHERE student_id = ? GROUP BY status'
      ).all(me.id);
      const cnt = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };
      att.forEach((x) => { if (x.status in cnt) cnt[x.status] = Number(x.n); });
      const total = cnt.hadir + cnt.izin + cnt.sakit + cnt.alpa;
      out.kehadiran.rows = ['hadir', 'izin', 'sakit', 'alpa'].map((k) => ({
        label: k.charAt(0).toUpperCase() + k.slice(1),
        key: k,
        count: cnt[k],
        pct: total ? Math.round((cnt[k] / total) * 100) : 0
      }));
      return res.json(out);
    }

    // ----- GURU / KEPSEK / ADMIN -----
    const isGuru = r === 'guru';
    const out = {
      kkm: KKM,
      nilai: {
        title: isGuru ? 'Rata-rata Nilai per Kelas Ajar' : 'Rata-rata Nilai per Kelas',
        rows: []
      },
      kehadiran: { title: 'Kehadiran Siswa 7 Hari Terakhir', type: 'harian', rows: [] }
    };

    const nv = isGuru
      ? await db.prepare(`
          SELECT (s.name || ' - ' || c.name) AS label, ${AVG_SQL} AS avg
          FROM scores sc
          JOIN assessments a ON a.id = sc.assessment_id
          JOIN teaching t ON t.id = a.teaching_id
          JOIN subjects s ON s.id = t.subject_id
          JOIN classes c ON c.id = t.class_id
          WHERE t.teacher_id = ? AND a.max_score > 0 AND sc.score IS NOT NULL
          GROUP BY t.id
          ORDER BY s.name, c.name`).all(req.user.id)
      : await db.prepare(`
          SELECT c.name AS label, ${AVG_SQL} AS avg
          FROM scores sc
          JOIN assessments a ON a.id = sc.assessment_id
          JOIN teaching t ON t.id = a.teaching_id
          JOIN classes c ON c.id = t.class_id
          WHERE a.max_score > 0 AND sc.score IS NOT NULL
          GROUP BY c.id
          ORDER BY c.name`).all();
    out.nilai.rows = nv.map((x) => ({ label: x.label, value: round1(x.avg) })).filter((x) => x.value != null);

    const days = lastDays(7);
    const args = [days[0], days[days.length - 1]];
    let where = 'date >= ? AND date <= ?';
    if (isGuru) {
      where += ' AND teaching_id IN (SELECT id FROM teaching WHERE teacher_id = ?)';
      args.push(req.user.id);
    }
    const ra = await db.prepare(
      `SELECT date, status, COUNT(*) AS n FROM student_attendance WHERE ${where} GROUP BY date, status`
    ).all(...args);

    const map = {};
    ra.forEach((x) => {
      const m = (map[x.date] = map[x.date] || { total: 0, hadir: 0 });
      m.total += Number(x.n);
      if (x.status === 'hadir') m.hadir += Number(x.n);
    });
    out.kehadiran.rows = days.map((d) => {
      const m = map[d];
      return {
        label: dayLabel(d),
        total: m ? m.total : 0,
        pct: m && m.total ? Math.round((m.hadir / m.total) * 100) : null
      };
    });

    res.json(out);
  } catch (e) { fail(res, e, 'Gagal memuat grafik'); }
});

/* ---------- Pencarian global ---------- */
const ROLE_LABEL = { admin: 'Admin', guru: 'Guru', siswa: 'Siswa', kepsek: 'Kepala Sekolah', orang_tua: 'Orang Tua/Wali' };

router.get('/search', async (req, res) => {
  try {
    const q = clip(req.query.q, 40);
    if (q.length < 2) return res.json({ groups: [] });

    const like = '%' + q.replace(/[!%_]/g, '!$&') + '%';
    const r = req.user.role;
    const groups = [];
    const add = (title, items) => { if (items.length) groups.push({ title, items }); };
    const L = "LIKE ? ESCAPE '!'";

    if (r === 'admin' || r === 'kepsek') {
      // Pengguna
      const isAdmin = r === 'admin';
      const users = await db.prepare(`
        SELECT u.id, u.name, u.role, st.nis, c.name AS class_name
        FROM users u
        LEFT JOIN students st ON st.user_id = u.id
        LEFT JOIN classes c ON c.id = st.class_id
        WHERE (u.name ${L} OR st.nis ${L}${isAdmin ? ` OR u.username ${L}` : ''})
          ${isAdmin ? '' : "AND u.role IN ('siswa','guru')"}
        ORDER BY u.name LIMIT 6`).all(...(isAdmin ? [like, like, like] : [like, like]));
      add('Pengguna', users.map((u) => ({
        title: u.name,
        meta: [ROLE_LABEL[u.role] || u.role, u.nis, u.class_name].filter(Boolean).join(' • '),
        link: isAdmin ? '#/users' : (u.role === 'siswa' ? '#/rapor' : null)
      })));

      if (isAdmin) {
        const cls = await db.prepare(`SELECT id, name, year FROM classes WHERE name ${L} ORDER BY name LIMIT 5`).all(like);
        add('Kelas', cls.map((c) => ({ title: c.name, meta: c.year || '', link: '#/classes' })));

        const subs = await db.prepare(
          `SELECT id, code, name FROM subjects WHERE name ${L} OR code ${L} ORDER BY name LIMIT 5`
        ).all(like, like);
        add('Mata Pelajaran', subs.map((x) => ({ title: x.name, meta: x.code || '', link: '#/subjects' })));
      }

      const tch = await db.prepare(`
        SELECT t.id, t.semester, s.name AS sn, c.name AS cn, u.name AS tn
        FROM teaching t
        JOIN subjects s ON s.id = t.subject_id
        JOIN classes c ON c.id = t.class_id
        JOIN users u ON u.id = t.teacher_id
        WHERE s.name ${L} OR c.name ${L} OR u.name ${L}
        ORDER BY t.semester DESC, c.name LIMIT 6`).all(like, like, like);
      add('Kelas Ajar', tch.map((t) => ({
        title: `${t.sn} - ${t.cn}`,
        meta: `${t.tn} • ${t.semester || ''}`,
        link: isAdmin ? '#/teaching' : '#/detail/' + t.id
      })));
    } else if (r === 'guru') {
      const stu = await db.prepare(`
        SELECT st.id, st.nis, u.name, c.name AS class_name, MIN(t.id) AS tid
        FROM students st
        JOIN users u ON u.id = st.user_id
        JOIN classes c ON c.id = st.class_id
        JOIN teaching t ON t.class_id = st.class_id AND t.teacher_id = ?
        WHERE (u.name ${L} OR st.nis ${L})
        GROUP BY st.id, st.nis, u.name, c.name
        ORDER BY u.name LIMIT 6`).all(req.user.id, like, like);
      add('Siswa Saya', stu.map((x) => ({
        title: x.name,
        meta: [x.nis, x.class_name].filter(Boolean).join(' • '),
        link: '#/class/' + x.tid
      })));

      const tch = await db.prepare(`
        SELECT t.id, t.semester, s.name AS sn, c.name AS cn
        FROM teaching t
        JOIN subjects s ON s.id = t.subject_id
        JOIN classes c ON c.id = t.class_id
        WHERE t.teacher_id = ? AND (s.name ${L} OR c.name ${L})
        ORDER BY t.semester DESC, c.name LIMIT 6`).all(req.user.id, like, like);
      add('Kelas Ajar Saya', tch.map((t) => ({
        title: `${t.sn} - ${t.cn}`,
        meta: t.semester || '',
        link: '#/class/' + t.id
      })));
    } else if (r === 'siswa') {
      const me = await db.prepare('SELECT class_id FROM students WHERE user_id = ?').get(req.user.id);
      if (me && me.class_id) {
        const tch = await db.prepare(`
          SELECT t.id, t.semester, s.name AS sn, u.name AS tn
          FROM teaching t
          JOIN subjects s ON s.id = t.subject_id
          JOIN users u ON u.id = t.teacher_id
          WHERE t.class_id = ? AND (s.name ${L} OR u.name ${L})
          ORDER BY s.name LIMIT 6`).all(me.class_id, like, like);
        add('Mata Pelajaran Saya', tch.map((t) => ({
          title: t.sn,
          meta: `${t.tn} • ${t.semester || ''}`,
          link: '#/report'
        })));
      }
    }

    // Pengumuman (semua peran)
    const news = await db.prepare(
      `SELECT id, title, created_at FROM announcements WHERE title ${L} OR body ${L} ORDER BY id DESC LIMIT 4`
    ).all(like, like);
    add('Pengumuman', news.map((n) => ({
      title: n.title,
      meta: String(n.created_at || '').slice(0, 10),
      link: r === 'admin' ? '#/news' : '#/dash'
    })));

    res.json({ groups });
  } catch (e) { fail(res, e, 'Gagal mencari'); }
});

module.exports = router;