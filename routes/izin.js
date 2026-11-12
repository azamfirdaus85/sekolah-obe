// Perizinan siswa.
// Siswa : ajukan izin/sakit untuk satu rentang tanggal (alasan + tautan surat opsional), batalkan selama masih menunggu.
// Wali kelas (guru) dan admin: setujui atau tolak. Saat disetujui, absensi siswa otomatis terisi
// Izin/Sakit pada hari yang ada jadwalnya. Saat persetujuan dibatalkan, catatan otomatis itu dihapus.
// Tabel dibuat otomatis saat pertama dipakai, jadi db.js tidak perlu diubah.
const router = require('express').Router();
const db = require('../db');
const { auth } = require('../authMiddleware');

router.use(auth);

const TZ = 'Asia/Jakarta';
const TYPES = ['izin', 'sakit'];
const MAX_DAYS = 14; // panjang maksimal satu pengajuan
const MAX_PAST = 7; // boleh mengajukan mundur sampai sekian hari
const MAX_AHEAD = 30; // boleh mengajukan sampai sekian hari ke depan

const bad = (res, msg) => res.status(400).json({ error: msg });
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const todayJkt = () => new Date().toLocaleDateString('sv-SE', { timeZone: TZ });
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDate(s) {
  if (!RE_DATE.test(s || '')) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
const addDays = (s, n) => {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dowOf = (s) => {
  const g = new Date(s + 'T00:00:00Z').getUTCDay();
  return g === 0 ? 7 : g; // 1 = Senin ... 7 = Minggu, sama seperti tabel jadwal
};
const daysBetween = (a, b) =>
  Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);

// Hanya http/https supaya tidak bisa menyisipkan javascript: dan sejenisnya
function cleanLink(v) {
  const s = str(v, 500);
  if (!s) return { ok: true, value: null };
  return /^https?:\/\/[^\s]+$/i.test(s) ? { ok: true, value: s } : { ok: false };
}

async function insertReturnId(sql, args = []) {
  if (db.isTurso) {
    const r = await db.client.execute({ sql: sql + ' RETURNING id', args });
    const row = r.rows[0];
    return { id: row ? Number(row.id) : 0 };
  }
  const info = await db.prepare(sql).run(...args);
  return { id: Number(info.lastInsertRowid ?? info.lastInsertRowId ?? 0) };
}

const fail = (res, e) => {
  console.error(e);
  return res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
};

let ready = null;
function ensure() {
  if (!ready) {
    ready = (async () => {
      await db.ready;
      await db.prepare(`CREATE TABLE IF NOT EXISTS leave_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id INTEGER NOT NULL,
        type TEXT NOT NULL DEFAULT 'izin',
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        reason TEXT NOT NULL,
        link TEXT,
        status TEXT NOT NULL DEFAULT 'menunggu',
        review_note TEXT,
        reviewed_by INTEGER,
        reviewed_at TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`).run();
      await db.prepare(
        'CREATE INDEX IF NOT EXISTS idx_leave_student ON leave_requests (student_id, status)'
      ).run();
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

router.use(async (req, res, next) => {
  if (!['siswa', 'guru', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Fitur ini hanya untuk siswa, wali kelas, dan admin.' });
  }
  try {
    await ensure();
    next();
  } catch (e) {
    console.error('Siapkan perizinan gagal:', e);
    res.status(500).json({ error: 'Gagal menyiapkan data perizinan.' });
  }
});

async function studentOf(req) {
  return db.prepare('SELECT id, class_id FROM students WHERE user_id = ?').get(req.user.id);
}

// Admin: semua kelas. Guru: hanya kelas yang ia walikan.
async function reviewerScope(req) {
  if (req.user.role === 'admin') return { all: true, classIds: [] };
  if (req.user.role === 'guru') {
    const rows = await db.prepare('SELECT id FROM classes WHERE homeroom_teacher_id = ?').all(req.user.id);
    return { all: false, classIds: rows.map((r) => Number(r.id)) };
  }
  return null;
}

/* =====================================================
   SISWA
   ===================================================== */

router.get('/saya', async (req, res) => {
  if (req.user.role !== 'siswa') return res.status(403).json({ error: 'Hanya untuk siswa.' });
  try {
    const st = await studentOf(req);
    if (!st) return res.status(404).json({ error: 'Data siswa tidak ditemukan.' });

    const rows = await db.prepare(`
      SELECT id, type, start_date, end_date, reason, link, status, review_note, reviewed_at, created_at
      FROM leave_requests WHERE student_id = ? ORDER BY id DESC LIMIT 100
    `).all(st.id);

    res.json({ today: todayJkt(), rows });
  } catch (e) {
    return fail(res, e);
  }
});

router.post('/', async (req, res) => {
  if (req.user.role !== 'siswa') return res.status(403).json({ error: 'Hanya siswa yang bisa mengajukan izin.' });
  try {
    const st = await studentOf(req);
    if (!st || !st.class_id) return bad(res, 'Anda belum terdaftar di kelas.');

    const type = str(req.body.type, 10);
    if (!TYPES.includes(type)) return bad(res, 'Jenis harus izin atau sakit.');

    const start = str(req.body.start_date, 10);
    const end = str(req.body.end_date, 10) || start;
    if (!isValidDate(start) || !isValidDate(end)) return bad(res, 'Tanggal tidak valid.');
    if (end < start) return bad(res, 'Tanggal selesai tidak boleh sebelum tanggal mulai.');
    if (daysBetween(start, end) + 1 > MAX_DAYS) return bad(res, `Satu pengajuan maksimal ${MAX_DAYS} hari.`);

    const today = todayJkt();
    if (start < addDays(today, -MAX_PAST)) return bad(res, `Pengajuan hanya bisa untuk ${MAX_PAST} hari ke belakang.`);
    if (start > addDays(today, MAX_AHEAD)) return bad(res, `Pengajuan hanya bisa untuk ${MAX_AHEAD} hari ke depan.`);

    const reason = str(req.body.reason, 500);
    if (reason.length < 5) return bad(res, 'Alasan minimal 5 karakter.');
    const link = cleanLink(req.body.link);
    if (!link.ok) return bad(res, 'Tautan harus diawali http:// atau https://');

    const overlap = await db.prepare(`
      SELECT id FROM leave_requests
      WHERE student_id = ? AND status IN ('menunggu','disetujui')
        AND start_date <= ? AND end_date >= ?
    `).get(st.id, end, start);
    if (overlap) return bad(res, 'Sudah ada pengajuan izin pada rentang tanggal tersebut.');

    const info = await insertReturnId(
      'INSERT INTO leave_requests(student_id, type, start_date, end_date, reason, link) VALUES(?,?,?,?,?,?)',
      [st.id, type, start, end, reason, link.value]
    );
    res.status(201).json({ id: info.id });
  } catch (e) {
    return fail(res, e);
  }
});

// Siswa membatalkan pengajuan yang masih menunggu
router.delete('/:id', async (req, res) => {
  if (req.user.role !== 'siswa') return res.status(403).json({ error: 'Tidak diizinkan.' });
  try {
    const st = await studentOf(req);
    if (!st) return res.status(404).json({ error: 'Data siswa tidak ditemukan.' });

    const r = await db.prepare(
      'SELECT id, status FROM leave_requests WHERE id = ? AND student_id = ?'
    ).get(Number(req.params.id), st.id);
    if (!r) return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
    if (r.status !== 'menunggu') return bad(res, 'Pengajuan yang sudah diproses tidak bisa dibatalkan.');

    await db.prepare('DELETE FROM leave_requests WHERE id = ?').run(r.id);
    res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});

/* =====================================================
   WALI KELAS & ADMIN
   ===================================================== */

router.get('/masuk', async (req, res) => {
  try {
    const scope = await reviewerScope(req);
    if (!scope) return res.status(403).json({ error: 'Tidak diizinkan.' });

    const counts = { menunggu: 0, disetujui: 0, ditolak: 0 };

    // guru yang bukan wali kelas: tidak ada data
    if (!scope.all && !scope.classIds.length) {
      return res.json({ wali: false, counts, rows: [] });
    }

    let where = '';
    const args = [];
    if (!scope.all) {
      where = ` AND st.class_id IN (${scope.classIds.map(() => '?').join(',')})`;
      args.push(...scope.classIds);
    }

    const base = `
      FROM leave_requests lr
      JOIN students st ON st.id = lr.student_id
      JOIN users u ON u.id = st.user_id
      LEFT JOIN classes c ON c.id = st.class_id
      WHERE 1 = 1${where}`;

    const cnt = await db.prepare(`SELECT lr.status AS status, COUNT(*) AS n ${base} GROUP BY lr.status`).all(...args);
    for (const c of cnt) {
      if (c.status in counts) counts[c.status] = Number(c.n);
    }

    const status = str(req.query.status, 12);
    const filter = ['menunggu', 'disetujui', 'ditolak'].includes(status) ? ' AND lr.status = ?' : '';
    const rowArgs = filter ? [...args, status] : args;

    const rows = await db.prepare(`
      SELECT lr.id, lr.type, lr.start_date, lr.end_date, lr.reason, lr.link, lr.status,
             lr.review_note, lr.reviewed_at, lr.created_at,
             st.nis, u.name, c.name AS class_name
      ${base}${filter}
      ORDER BY CASE lr.status WHEN 'menunggu' THEN 0 ELSE 1 END, lr.id DESC
      LIMIT 200
    `).all(...rowArgs);

    res.json({ wali: true, counts, rows });
  } catch (e) {
    return fail(res, e);
  }
});

// Pasangan [teaching_id, tanggal] yang perlu dicatat untuk satu pengajuan.
// Hanya hari yang punya jadwal. Kalau kelas belum punya jadwal sama sekali,
// dipakai semua kelas ajar pada hari Senin sampai Jumat.
async function leaveTargets(classId, start, end) {
  let teachings = await db.prepare('SELECT id, semester FROM teaching WHERE class_id = ?').all(classId);

  const per = await db.prepare('SELECT name, semester FROM academic_years WHERE is_active = 1 LIMIT 1').get();
  if (per) {
    const sem = `${per.semester} ${per.name}`;
    const inSem = teachings.filter((t) => t.semester === sem);
    if (inSem.length) teachings = inSem;
  }

  const ids = teachings.map((t) => Number(t.id));
  if (!ids.length) return [];

  const sch = await db.prepare(
    `SELECT teaching_id, day_of_week FROM schedules WHERE teaching_id IN (${ids.map(() => '?').join(',')})`
  ).all(...ids);

  const byDay = new Map();
  for (const s of sch) {
    const k = Number(s.day_of_week);
    if (!byDay.has(k)) byDay.set(k, new Set());
    byDay.get(k).add(Number(s.teaching_id));
  }

  const pairs = [];
  for (let d = start, guard = 0; d <= end && guard < 400; d = addDays(d, 1), guard++) {
    const dow = dowOf(d);
    const list = sch.length ? [...(byDay.get(dow) || [])] : dow <= 5 ? ids : [];
    for (const tid of list) pairs.push([tid, d]);
  }
  return pairs;
}

router.put('/:id/review', async (req, res) => {
  try {
    const scope = await reviewerScope(req);
    if (!scope) return res.status(403).json({ error: 'Tidak diizinkan.' });

    const status = str(req.body.status, 12);
    if (!['disetujui', 'ditolak'].includes(status)) return bad(res, 'Status harus disetujui atau ditolak.');
    const note = str(req.body.note, 300);

    const r = await db.prepare(`
      SELECT lr.id, lr.student_id, lr.type, lr.start_date, lr.end_date, lr.status, st.class_id
      FROM leave_requests lr JOIN students st ON st.id = lr.student_id
      WHERE lr.id = ?
    `).get(Number(req.params.id));

    if (!r || (!scope.all && !scope.classIds.includes(Number(r.class_id)))) {
      return res.status(404).json({ error: 'Pengajuan tidak ditemukan.' });
    }
    if (r.status === status) return res.json({ ok: true, attendance: 0 });

    const marker = `Perizinan #${r.id}`;
    const items = [[
      `UPDATE leave_requests
       SET status = ?, review_note = ?, reviewed_by = ?, reviewed_at = datetime('now')
       WHERE id = ?`,
      [status, note || null, req.user.id, r.id]
    ]];

    let made = 0;
    if (status === 'disetujui') {
      const pairs = r.class_id ? await leaveTargets(Number(r.class_id), r.start_date, r.end_date) : [];
      for (const [tid, date] of pairs) {
        // jangan menimpa siswa yang sudah absen hadir sendiri pada hari itu
        items.push([
          `INSERT INTO student_attendance (student_id, teaching_id, date, status, note, recorded_by)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(student_id, teaching_id, date) DO UPDATE SET
             status = excluded.status, note = excluded.note, recorded_by = excluded.recorded_by
           WHERE student_attendance.status <> 'hadir'`,
          [r.student_id, tid, date, r.type, marker, req.user.id]
        ]);
      }
      made = pairs.length;
    } else if (r.status === 'disetujui') {
      // persetujuan dibatalkan: hapus catatan absensi otomatisnya
      items.push([
        'DELETE FROM student_attendance WHERE student_id = ? AND note = ?',
        [r.student_id, marker]
      ]);
    }

    await db.batch(items);
    res.json({ ok: true, attendance: made });
  } catch (e) {
    return fail(res, e);
  }
});

module.exports = router;