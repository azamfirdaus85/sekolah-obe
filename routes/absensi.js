const router = require('express').Router();
const db = require('../db');
const { auth, role } = require('../authMiddleware');

const TZ = 'Asia/Jakarta';
const STATUS_SISWA = ['hadir', 'izin', 'sakit', 'alpa'];
const STATUS_STAF = ['hadir', 'izin', 'sakit', 'dinas'];
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
const RE_MONTH = /^\d{4}-\d{2}$/;
const RE_TIME = /^\d{2}:\d{2}$/;

const todayStr = () =>
  new Date().toLocaleDateString('sv-SE', { timeZone: TZ });

const nowTime = () =>
  new Date().toLocaleTimeString('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit'
  });

const nowDateTime = () => `${todayStr()} ${nowTime()}`;

const clip = (v, n) =>
  String(v == null ? '' : v).trim().slice(0, n);

function isValidDate(s) {
  if (!RE_DATE.test(s || '')) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d.getTime()) &&
    d.toISOString().slice(0, 10) === s;
}

function staffTable(user) {
  return user.role === 'kepsek'
    ? 'principal_attendance'
    : 'teacher_attendance';
}

function getJakartaDateTimeAfter(minutes) {
  const date = new Date(Date.now() + minutes * 60000);

  return date.toLocaleString('sv-SE', {
    timeZone: TZ,
    hour12: false
  }).slice(0, 16);
}

async function runBatch(stmts) {
  if (!stmts.length) return;

  if (db.isTurso) {
    await db.client.batch(stmts, 'write');
  } else {
    const tx = db.transaction(() => {
      for (const s of stmts) {
        db.prepare(s.sql).run(...s.args);
      }
    });

    tx();
  }
}

const fail = (res, e, msg) => {
  console.error(e);
  res.status(500).json({ error: msg });
};

/* Absensi mandiri dicatat PER SESI di tabel ini, supaya guru boleh membuka sesi
   lebih dari sekali dalam sehari dan siswa bisa absen di tiap sesi.
   student_attendance tetap satu baris per siswa per mapel per hari (dipakai rekap). */
let checkinsReady = null;
function ensureCheckins() {
  if (!checkinsReady) {
    checkinsReady = (async () => {
      const had = await db.prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'attendance_session_checkins'"
      ).get();

      await db.prepare(`
        CREATE TABLE IF NOT EXISTS attendance_session_checkins (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          session_id INTEGER NOT NULL,
          student_id INTEGER NOT NULL,
          created_at TEXT,
          UNIQUE(session_id, student_id)
        )
      `).run();

      // Sesi boleh dikaitkan dengan jam pelajaran (mis. 07:00-08:30)
      for (const col of ['slot_start', 'slot_end']) {
        try {
          await db.prepare(`ALTER TABLE attendance_sessions ADD COLUMN ${col} TEXT`).run();
        } catch (e) {
          if (!/duplicate column|already exists/i.test(String(e.message || e))) throw e;
        }
      }

      // Sekali saja saat tabel baru dibuat: siswa yang sudah hadir pada hari yang hanya
      // punya satu sesi dianggap sudah absen di sesi itu.
      if (!had) {
        await db.prepare(`
          INSERT OR IGNORE INTO attendance_session_checkins (session_id, student_id, created_at)
          SELECT s.id, a.student_id, s.date || ' 00:00'
          FROM attendance_sessions s
          JOIN student_attendance a
            ON a.teaching_id = s.teaching_id AND a.date = s.date
          WHERE a.status = 'hadir'
            AND (
              SELECT COUNT(*) FROM attendance_sessions s2
              WHERE s2.teaching_id = s.teaching_id AND s2.date = s.date
            ) = 1
        `).run();
      }
    })().catch((e) => {
      checkinsReady = null;
      throw e;
    });
  }
  return checkinsReady;
}

async function ownTeaching(teachingId, userId) {
  return db.prepare(`
    SELECT
      t.id,
      t.class_id,
      t.semester,
      s.name AS subject_name,
      c.name AS class_name
    FROM teaching t
    JOIN subjects s ON s.id = t.subject_id
    JOIN classes c ON c.id = t.class_id
    WHERE t.id = ? AND t.teacher_id = ?
  `).get(Number(teachingId), userId);
}

router.use(auth);

/* =====================================================
   GURU
   ===================================================== */

// Daftar kelas ajar
router.get('/guru/kelas', role('guru'), async (req, res) => {
  try {
    const rows = await db.prepare(`
      SELECT
        t.id,
        t.semester,
        s.name AS subject_name,
        c.name AS class_name,
        (
          SELECT COUNT(*)
          FROM students st
          WHERE st.class_id = t.class_id
        ) AS students
      FROM teaching t
      JOIN subjects s ON s.id = t.subject_id
      JOIN classes c ON c.id = t.class_id
      WHERE t.teacher_id = ?
      ORDER BY t.semester DESC, c.name, s.name
    `).all(req.user.id);

    res.json(rows);
  } catch (e) {
    fail(res, e, 'Gagal memuat kelas ajar');
  }
});

/* =====================================================
   GURU: BUKA SESI ABSENSI
   POST /guru/sesi/buka

   Body:
   {
     "teaching_id": 1,
     "durasi_menit": 60
   }
   ===================================================== */

router.post('/guru/sesi/buka', role('guru'), async (req, res) => {
  try {
    const teachingId = Number(req.body.teaching_id);
    const duration = Number(req.body.durasi_menit || 60);

    if (!teachingId) {
      return res.status(400).json({
        error: 'Kelas ajar harus dipilih'
      });
    }

    if (!Number.isInteger(duration) || duration < 1 || duration > 240) {
      return res.status(400).json({
        error: 'Durasi harus antara 1 sampai 240 menit'
      });
    }

    const teaching = await ownTeaching(
      teachingId,
      req.user.id
    );

    if (!teaching) {
      return res.status(404).json({
        error: 'Kelas ajar tidak ditemukan'
      });
    }

    await ensureCheckins();

    // Jam pelajaran (opsional). Tiap jam punya sesi sendiri, jadi guru bisa
    // membuka sesi jam ke-1 dan jam ke-3 secara terpisah di hari yang sama.
    const slotStart = clip(req.body.jam_mulai, 5);
    const slotEnd = clip(req.body.jam_selesai, 5);

    if ((slotStart && !RE_TIME.test(slotStart)) || (slotEnd && !RE_TIME.test(slotEnd))) {
      return res.status(400).json({
        error: 'Format jam tidak valid (HH:MM)'
      });
    }

    const date = todayStr();
    const closesAt = getJakartaDateTimeAfter(duration);

    // Periksa sesi yang masih aktif untuk jam yang sama
    const active = await db.prepare(`
      SELECT id
      FROM attendance_sessions
      WHERE teaching_id = ?
        AND date = ?
        AND COALESCE(slot_start, '') = ?
        AND status = 'open'
        AND closes_at > ?
    `).get(teaching.id, date, slotStart, nowDateTime());

    if (active) {
      return res.status(400).json({
        error: slotStart
          ? `Sesi absensi jam ${slotStart} untuk kelas ini masih terbuka`
          : 'Sesi absensi untuk kelas ini masih terbuka',
        session_id: active.id
      });
    }

    // Tutup sesi lama (jam yang sama) yang sudah kedaluwarsa
    await db.prepare(`
      UPDATE attendance_sessions
      SET status = 'closed'
      WHERE teaching_id = ?
        AND date = ?
        AND COALESCE(slot_start, '') = ?
        AND status = 'open'
    `).run(teaching.id, date, slotStart);

    const result = await db.prepare(`
      INSERT INTO attendance_sessions
      (teaching_id, date, opened_by, closes_at, status, slot_start, slot_end)
      VALUES (?, ?, ?, ?, 'open', ?, ?)
    `).run(
      teaching.id,
      date,
      req.user.id,
      closesAt,
      slotStart || null,
      slotEnd || null
    );

    res.json({
      ok: true,
      message: 'Sesi absensi berhasil dibuka',
      session_id: Number(result.lastInsertRowid),
      teaching,
      date,
      closes_at: closesAt,
      jam_mulai: slotStart || null,
      jam_selesai: slotEnd || null
    });

  } catch (e) {
    fail(res, e, 'Gagal membuka sesi absensi');
  }
});

/* =====================================================
   GURU: MELIHAT SESI ABSENSI
   GET /guru/sesi?teaching_id=1
   ===================================================== */

router.get('/guru/sesi', role('guru'), async (req, res) => {
  try {
    const teaching = await ownTeaching(
      req.query.teaching_id,
      req.user.id
    );

    if (!teaching) {
      return res.status(404).json({
        error: 'Kelas ajar tidak ditemukan'
      });
    }

    await ensureCheckins();

    const rows = await db.prepare(`
      SELECT
        id,
        teaching_id,
        date,
        opened_at,
        closes_at,
        status,
        slot_start,
        slot_end
      FROM attendance_sessions
      WHERE teaching_id = ?
      ORDER BY id DESC
      LIMIT 30
    `).all(teaching.id);

    const now = nowDateTime();
    const active = rows.filter(
      (r) => r.status === 'open' && r.date === todayStr() && r.closes_at > now
    );
    const session = active[0] || null;

    res.json({ teaching, session, active, rows });

  } catch (e) {
    fail(res, e, 'Gagal memuat sesi absensi');
  }
});

/* =====================================================
   GURU: TUTUP SESI ABSENSI
   POST /guru/sesi/tutup

   Body:
   {
     "session_id": 1
   }
   ===================================================== */

router.post('/guru/sesi/tutup', role('guru'), async (req, res) => {
  try {
    const sessionId = Number(req.body.session_id);

    if (!sessionId) {
      return res.status(400).json({
        error: 'ID sesi tidak valid'
      });
    }

    const session = await db.prepare(`
      SELECT a.id, a.teaching_id
      FROM attendance_sessions a
      JOIN teaching t ON t.id = a.teaching_id
      WHERE a.id = ?
        AND t.teacher_id = ?
    `).get(sessionId, req.user.id);

    if (!session) {
      return res.status(404).json({
        error: 'Sesi tidak ditemukan'
      });
    }

    await db.prepare(`
      UPDATE attendance_sessions
      SET status = 'closed'
      WHERE id = ?
    `).run(sessionId);

    res.json({
      ok: true,
      message: 'Sesi absensi berhasil ditutup'
    });

  } catch (e) {
    fail(res, e, 'Gagal menutup sesi absensi');
  }
});

/* =====================================================
   GURU: DAFTAR SISWA
   ===================================================== */

router.get('/guru/siswa', role('guru'), async (req, res) => {
  try {
    const date = clip(req.query.date, 10) || todayStr();

    if (!isValidDate(date)) {
      return res.status(400).json({
        error: 'Tanggal tidak valid'
      });
    }

    const t = await ownTeaching(
      req.query.teaching_id,
      req.user.id
    );

    if (!t) {
      return res.status(404).json({
        error: 'Kelas ajar tidak ditemukan'
      });
    }

    const rows = await db.prepare(`
      SELECT
        st.id AS student_id,
        st.nis,
        u.name,
        a.status,
        a.note
      FROM students st
      JOIN users u ON u.id = st.user_id
      LEFT JOIN student_attendance a
        ON a.student_id = st.id
        AND a.teaching_id = ?
        AND a.date = ?
      WHERE st.class_id = ?
      ORDER BY u.name
    `).all(t.id, date, t.class_id);

    res.json({
      teaching: t,
      date,
      rows
    });

  } catch (e) {
    fail(res, e, 'Gagal memuat daftar siswa');
  }
});

/* =====================================================
   GURU: SIMPAN ABSENSI MANUAL
   ===================================================== */

router.put('/guru/siswa', role('guru'), async (req, res) => {
  try {
    const date = clip(req.body.date, 10);

    if (!isValidDate(date)) {
      return res.status(400).json({
        error: 'Tanggal tidak valid'
      });
    }

    if (date > todayStr()) {
      return res.status(400).json({
        error: 'Tidak bisa mengabsen tanggal yang belum terjadi'
      });
    }

    const t = await ownTeaching(
      req.body.teaching_id,
      req.user.id
    );

    if (!t) {
      return res.status(404).json({
        error: 'Kelas ajar tidak ditemukan'
      });
    }

    const records = Array.isArray(req.body.records)
      ? req.body.records
      : [];

    if (!records.length) {
      return res.status(400).json({
        error: 'Tidak ada data absensi'
      });
    }

    if (records.length > 200) {
      return res.status(400).json({
        error: 'Data terlalu banyak'
      });
    }

    const members = await db.prepare(
      'SELECT id FROM students WHERE class_id = ?'
    ).all(t.class_id);

    const allowed = new Set(
      members.map(m => Number(m.id))
    );

    const stmts = [];

    for (const r of records) {
      const sid = Number(r.student_id);
      const status = String(r.status || '');

      if (!allowed.has(sid)) {
        return res.status(400).json({
          error: 'Ada siswa yang bukan anggota kelas ini'
        });
      }

      if (!STATUS_SISWA.includes(status)) {
        return res.status(400).json({
          error: 'Status absensi tidak valid'
        });
      }

      stmts.push({
        sql: `
          INSERT INTO student_attendance
          (student_id, teaching_id, date, status, note, recorded_by)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(student_id, teaching_id, date)
          DO UPDATE SET
            status = excluded.status,
            note = excluded.note,
            recorded_by = excluded.recorded_by
        `,
        args: [
          sid,
          t.id,
          date,
          status,
          clip(r.note, 200) || null,
          req.user.id
        ]
      });
    }

    await runBatch(stmts);

    res.json({
      ok: true,
      saved: stmts.length
    });

  } catch (e) {
    fail(res, e, 'Gagal menyimpan absensi');
  }
});

/* =====================================================
   GURU: REKAP BULANAN
   ===================================================== */

router.get('/guru/rekap', role('guru'), async (req, res) => {
  try {
    const month = clip(req.query.month, 7) ||
      todayStr().slice(0, 7);

    if (!RE_MONTH.test(month)) {
      return res.status(400).json({
        error: 'Bulan tidak valid'
      });
    }

    const t = await ownTeaching(
      req.query.teaching_id,
      req.user.id
    );

    if (!t) {
      return res.status(404).json({
        error: 'Kelas ajar tidak ditemukan'
      });
    }

    const rows = await db.prepare(`
      SELECT
        st.id AS student_id,
        st.nis,
        u.name,
        COALESCE(SUM(CASE WHEN a.status = 'hadir' THEN 1 ELSE 0 END), 0) AS hadir,
        COALESCE(SUM(CASE WHEN a.status = 'izin' THEN 1 ELSE 0 END), 0) AS izin,
        COALESCE(SUM(CASE WHEN a.status = 'sakit' THEN 1 ELSE 0 END), 0) AS sakit,
        COALESCE(SUM(CASE WHEN a.status = 'alpa' THEN 1 ELSE 0 END), 0) AS alpa,
        COUNT(a.id) AS total
      FROM students st
      JOIN users u ON u.id = st.user_id
      LEFT JOIN student_attendance a
        ON a.student_id = st.id
        AND a.teaching_id = ?
        AND a.date BETWEEN ? AND ?
      WHERE st.class_id = ?
      GROUP BY st.id, st.nis, u.name
      ORDER BY u.name
    `).all(
      t.id,
      month + '-01',
      month + '-31',
      t.class_id
    );

    res.json({ teaching: t, month, rows });

  } catch (e) {
    fail(res, e, 'Gagal memuat rekap');
  }
});

/* =====================================================
   SISWA: MELIHAT SESI ABSENSI YANG AKTIF
   GET /siswa/sesi-aktif
   ===================================================== */

router.get('/siswa/sesi-aktif', role('siswa'), async (req, res) => {
  try {
    const me = await db.prepare(`
      SELECT id, nis, class_id
      FROM students
      WHERE user_id = ?
    `).get(req.user.id);

    if (!me) {
      return res.status(404).json({
        error: 'Data siswa tidak ditemukan'
      });
    }

    await ensureCheckins();

    const rows = await db.prepare(`
      SELECT
        a.id,
        a.id AS session_id,
        a.date,
        a.opened_at,
        a.closes_at,
        a.slot_start,
        a.slot_end,
        t.id AS teaching_id,
        s.name AS subject_name,
        c.name AS class_name,
        u.name AS teacher_name,
        CASE WHEN ck.id IS NULL THEN 0 ELSE 1 END AS sudah_absen,
        ck.created_at AS absen_at
      FROM attendance_sessions a
      JOIN teaching t ON t.id = a.teaching_id
      JOIN subjects s ON s.id = t.subject_id
      JOIN classes c ON c.id = t.class_id
      LEFT JOIN users u ON u.id = t.teacher_id
      LEFT JOIN attendance_session_checkins ck
        ON ck.session_id = a.id
        AND ck.student_id = ?
      WHERE t.class_id = ?
        AND a.date = ?
        AND a.status = 'open'
        AND a.closes_at > ?
      ORDER BY a.id DESC
    `).all(
      me.id,
      me.class_id,
      todayStr(),
      nowDateTime()
    );

    res.json({
      nis: me.nis,
      rows
    });

  } catch (e) {
    fail(res, e, 'Gagal memuat sesi absensi');
  }
});

/* =====================================================
   SISWA: ABSEN SEKARANG
   POST /siswa/absen

   Body:
   {
     "session_id": 1
   }
   ===================================================== */

router.post('/siswa/absen', role('siswa'), async (req, res) => {
  try {
    const sessionId = Number(req.body.session_id);

    if (!sessionId) {
      return res.status(400).json({
        error: 'Sesi absensi tidak valid'
      });
    }

    const me = await db.prepare(`
      SELECT id, class_id
      FROM students
      WHERE user_id = ?
    `).get(req.user.id);

    if (!me) {
      return res.status(404).json({
        error: 'Data siswa tidak ditemukan'
      });
    }

    const session = await db.prepare(`
      SELECT
        a.id,
        a.teaching_id,
        a.date,
        a.status,
        a.closes_at,
        a.opened_by,
        t.class_id
      FROM attendance_sessions a
      JOIN teaching t ON t.id = a.teaching_id
      WHERE a.id = ?
        AND t.class_id = ?
    `).get(sessionId, me.class_id);

    if (!session) {
      return res.status(404).json({
        error: 'Sesi absensi tidak ditemukan untuk kelas Anda'
      });
    }

    if (session.date !== todayStr()) {
      return res.status(400).json({
        error: 'Sesi absensi bukan untuk hari ini'
      });
    }

    if (session.status !== 'open') {
      return res.status(400).json({
        error: 'Sesi absensi sudah ditutup'
      });
    }

    if (!session.closes_at || session.closes_at <= nowDateTime()) {
      await db.prepare(`
        UPDATE attendance_sessions
        SET status = 'closed'
        WHERE id = ?
      `).run(session.id);

      return res.status(400).json({
        error: 'Waktu absensi sudah habis'
      });
    }

    await ensureCheckins();

    // Sudah absen di SESI ini? (sesi lain di hari yang sama tidak menghalangi)
    const done = await db.prepare(`
      SELECT id
      FROM attendance_session_checkins
      WHERE session_id = ?
        AND student_id = ?
    `).get(session.id, me.id);

    if (done) {
      return res.status(400).json({
        error: 'Anda sudah absen di sesi ini'
      });
    }

    const existing = await db.prepare(`
      SELECT id, status
      FROM student_attendance
      WHERE student_id = ?
        AND teaching_id = ?
        AND date = ?
    `).get(
      me.id,
      session.teaching_id,
      session.date
    );

    const stmts = [{
      sql: `
        INSERT INTO attendance_session_checkins
        (session_id, student_id, created_at)
        VALUES (?, ?, ?)
      `,
      args: [session.id, me.id, nowDateTime()]
    }];

    if (!existing) {
      stmts.push({
        sql: `
          INSERT INTO student_attendance
          (student_id, teaching_id, date, status, note, recorded_by)
          VALUES (?, ?, ?, 'hadir', NULL, ?)
        `,
        args: [me.id, session.teaching_id, session.date, session.opened_by || null]
      });
    } else if (existing.status === 'alpa') {
      // Tadinya tercatat alpa, tapi siswa nyatanya hadir di sesi berikutnya
      stmts.push({
        sql: `UPDATE student_attendance SET status = 'hadir' WHERE id = ?`,
        args: [existing.id]
      });
    }

    await runBatch(stmts);

    res.json({
      ok: true,
      message: 'Absensi berhasil dicatat',
      status: 'hadir'
    });

  } catch (e) {
    if (String(e.message || '').includes('UNIQUE')) {
      return res.status(400).json({
        error: 'Anda sudah melakukan absensi'
      });
    }

    fail(res, e, 'Gagal melakukan absensi');
  }
});

/* =====================================================
   SISWA: RIWAYAT ABSENSI
   ===================================================== */

router.get('/siswa/saya', role('siswa'), async (req, res) => {
  try {
    const me = await db.prepare(`
      SELECT id, nis
      FROM students
      WHERE user_id = ?
    `).get(req.user.id);

    if (!me) {
      return res.status(404).json({
        error: 'Data siswa tidak ditemukan'
      });
    }

    const counts = await db.prepare(`
      SELECT status, COUNT(*) AS n
      FROM student_attendance
      WHERE student_id = ?
      GROUP BY status
    `).all(me.id);

    const summary = {
      hadir: 0,
      izin: 0,
      sakit: 0,
      alpa: 0
    };

    for (const c of counts) {
      if (c.status in summary) {
        summary[c.status] = Number(c.n);
      }
    }

    const rows = await db.prepare(`
      SELECT
        a.date,
        a.status,
        a.note,
        s.name AS subject_name
      FROM student_attendance a
      JOIN teaching t ON t.id = a.teaching_id
      JOIN subjects s ON s.id = t.subject_id
      WHERE a.student_id = ?
      ORDER BY a.date DESC, a.id DESC
      LIMIT 200
    `).all(me.id);

    res.json({
      nis: me.nis,
      summary,
      rows
    });

  } catch (e) {
    fail(res, e, 'Gagal memuat absensi');
  }
});

/* =====================================================
   GURU & KEPSEK: ABSEN DIRI SENDIRI
   ===================================================== */

router.get('/staf/saya', role('guru', 'kepsek'), async (req, res) => {
  try {
    const table = staffTable(req.user);
    const date = todayStr();

    const today = await db.prepare(`
      SELECT date, status, check_in, check_out, note
      FROM ${table}
      WHERE user_id = ? AND date = ?
    `).get(req.user.id, date);

    const rows = await db.prepare(`
      SELECT date, status, check_in, check_out, note
      FROM ${table}
      WHERE user_id = ?
      ORDER BY date DESC
      LIMIT 31
    `).all(req.user.id);

    res.json({
      date,
      today: today || null,
      rows
    });

  } catch (e) {
    fail(res, e, 'Gagal memuat absensi');
  }
});

router.post('/staf/masuk', role('guru', 'kepsek'), async (req, res) => {
  try {
    const table = staffTable(req.user);
    const date = todayStr();

    const ex = await db.prepare(`
      SELECT id, check_in
      FROM ${table}
      WHERE user_id = ? AND date = ?
    `).get(req.user.id, date);

    if (ex && ex.check_in) {
      return res.status(400).json({
        error: 'Anda sudah absen masuk hari ini'
      });
    }

    if (ex) {
      await db.prepare(`
        UPDATE ${table}
        SET status = 'hadir', check_in = ?, note = NULL
        WHERE id = ?
      `).run(nowTime(), ex.id);
    } else {
      await db.prepare(`
        INSERT INTO ${table}
        (user_id, date, check_in, status)
        VALUES (?, ?, ?, 'hadir')
      `).run(req.user.id, date, nowTime());
    }

    res.json({
      ok: true,
      check_in: nowTime()
    });

  } catch (e) {
    fail(res, e, 'Gagal absen masuk');
  }
});

router.post('/staf/pulang', role('guru', 'kepsek'), async (req, res) => {
  try {
    const table = staffTable(req.user);
    const date = todayStr();

    const ex = await db.prepare(`
      SELECT id, check_in, check_out
      FROM ${table}
      WHERE user_id = ? AND date = ?
    `).get(req.user.id, date);

    if (!ex || !ex.check_in) {
      return res.status(400).json({
        error: 'Anda belum absen masuk hari ini'
      });
    }

    if (ex.check_out) {
      return res.status(400).json({
        error: 'Anda sudah absen pulang hari ini'
      });
    }

    await db.prepare(`
      UPDATE ${table}
      SET check_out = ?
      WHERE id = ?
    `).run(nowTime(), ex.id);

    res.json({
      ok: true,
      check_out: nowTime()
    });

  } catch (e) {
    fail(res, e, 'Gagal absen pulang');
  }
});

router.post('/staf/izin', role('guru', 'kepsek'), async (req, res) => {
  try {
    const status = String(req.body.status || '');

    if (!['izin', 'sakit', 'dinas'].includes(status)) {
      return res.status(400).json({
        error: 'Status tidak valid'
      });
    }

    const table = staffTable(req.user);
    const date = todayStr();
    const note = clip(req.body.note, 200) || null;

    const ex = await db.prepare(`
      SELECT id, check_in
      FROM ${table}
      WHERE user_id = ? AND date = ?
    `).get(req.user.id, date);

    if (ex && ex.check_in) {
      return res.status(400).json({
        error: 'Anda sudah absen masuk hari ini'
      });
    }

    if (ex) {
      await db.prepare(`
        UPDATE ${table}
        SET status = ?, note = ?
        WHERE id = ?
      `).run(status, note, ex.id);
    } else {
      await db.prepare(`
        INSERT INTO ${table}
        (user_id, date, status, note)
        VALUES (?, ?, ?, ?)
      `).run(req.user.id, date, status, note);
    }

    res.json({ ok: true });

  } catch (e) {
    fail(res, e, 'Gagal menyimpan keterangan');
  }
});

/* =====================================================
   KEPSEK & ADMIN: PANTAU HARIAN
   ===================================================== */

router.get('/pantau/hari', role('kepsek', 'admin'), async (req, res) => {
  try {
    const date = clip(req.query.date, 10) || todayStr();

    if (!isValidDate(date)) {
      return res.status(400).json({
        error: 'Tanggal tidak valid'
      });
    }

    const guru = await db.prepare(`
      SELECT
        u.id,
        u.name,
        a.status,
        a.check_in,
        a.check_out,
        a.note
      FROM users u
      LEFT JOIN teacher_attendance a
        ON a.user_id = u.id AND a.date = ?
      WHERE u.role = 'guru'
        AND (u.active IS NULL OR u.active = 1)
      ORDER BY u.name
    `).all(date);

    const kepsek = await db.prepare(`
      SELECT
        u.id,
        u.name,
        a.status,
        a.check_in,
        a.check_out,
        a.note
      FROM users u
      LEFT JOIN principal_attendance a
        ON a.user_id = u.id AND a.date = ?
      WHERE u.role = 'kepsek'
        AND (u.active IS NULL OR u.active = 1)
      ORDER BY u.name
    `).all(date);

    const kelas = await db.prepare(`
      SELECT
        c.id,
        c.name,
        COUNT(DISTINCT st.id) AS total,
        COALESCE(SUM(CASE WHEN a.status = 'hadir' THEN 1 ELSE 0 END), 0) AS hadir,
        COALESCE(SUM(CASE WHEN a.status = 'izin' THEN 1 ELSE 0 END), 0) AS izin,
        COALESCE(SUM(CASE WHEN a.status = 'sakit' THEN 1 ELSE 0 END), 0) AS sakit,
        COALESCE(SUM(CASE WHEN a.status = 'alpa' THEN 1 ELSE 0 END), 0) AS alpa
      FROM classes c
      LEFT JOIN students st ON st.class_id = c.id
      LEFT JOIN student_attendance a
        ON a.student_id = st.id AND a.date = ?
      GROUP BY c.id, c.name
      ORDER BY c.name
    `).all(date);

    const tidak_hadir = await db.prepare(`
      SELECT
        u.name,
        c.name AS class_name,
        s.name AS subject_name,
        a.status,
        a.note
      FROM student_attendance a
      JOIN students st ON st.id = a.student_id
      JOIN users u ON u.id = st.user_id
      LEFT JOIN classes c ON c.id = st.class_id
      JOIN teaching t ON t.id = a.teaching_id
      JOIN subjects s ON s.id = t.subject_id
      WHERE a.date = ? AND a.status <> 'hadir'
      ORDER BY c.name, u.name
    `).all(date);

    res.json({
      date,
      guru,
      kepsek,
      kelas,
      tidak_hadir
    });

  } catch (e) {
    fail(res, e, 'Gagal memuat pantauan absensi');
  }
});

module.exports = router;