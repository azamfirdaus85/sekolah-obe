// Materi & Tugas online (LMS ringan) - tahap 1
// Guru : bagikan materi (tautan) dan tugas per kelas ajar, lihat siapa yang sudah mengumpulkan.
// Siswa: lihat materi dan tugas kelasnya, kumpulkan jawaban (teks dan/atau tautan), boleh kirim ulang.
// Tabel dibuat otomatis saat pertama dipakai. File tidak diunggah ke server: materi dan jawaban
// berupa tautan (Google Drive, YouTube, dan sejenisnya).
const router = require('express').Router();
const db = require('../db');
const { auth } = require('../authMiddleware');

router.use(auth);

const bad = (res, msg) => res.status(400).json({ error: msg });
const str = (v, max = 120) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

const todayJkt = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
const dayJkt = (s) => {
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  return isNaN(d) ? '' : d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
};

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

let ready = null;
function ensure() {
  if (!ready) {
    ready = (async () => {
      await db.ready;
      await db.prepare(`CREATE TABLE IF NOT EXISTS lms_materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teaching_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        link TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS lms_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        teaching_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        instructions TEXT,
        link TEXT,
        due_date TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS lms_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        student_id INTEGER NOT NULL,
        answer TEXT,
        link TEXT,
        submitted_at TEXT DEFAULT (datetime('now')),
        UNIQUE(task_id, student_id)
      )`).run();

      // Penilaian tugas: kolom tambahan. Kalau kolom sudah ada, error diabaikan.
      const alters = [
        'ALTER TABLE lms_tasks ADD COLUMN max_score INTEGER DEFAULT 100',
        'ALTER TABLE lms_tasks ADD COLUMN assessment_id INTEGER',
        'ALTER TABLE lms_submissions ADD COLUMN score REAL',
        'ALTER TABLE lms_submissions ADD COLUMN feedback TEXT',
        'ALTER TABLE lms_submissions ADD COLUMN graded_at TEXT'
      ];
      for (const sql of alters) {
        try {
          await db.prepare(sql).run();
        } catch (e) {
          if (!/duplicate column/i.test(String((e && e.message) || e))) {
            console.error('Migrasi LMS:', e.message);
          }
        }
      }
    })().catch((e) => {
      ready = null;
      throw e;
    });
  }
  return ready;
}

router.use(async (req, res, next) => {
  if (!['guru', 'siswa'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Fitur ini hanya untuk guru dan siswa.' });
  }
  try {
    await ensure();
    next();
  } catch (e) {
    console.error('Siapkan LMS gagal:', e);
    res.status(500).json({ error: 'Gagal menyiapkan data materi dan tugas.' });
  }
});

const isGuru = (req) => req.user.role === 'guru';
const fail = (res, e) => {
  console.error(e);
  return res.status(500).json({ error: 'Terjadi kesalahan: ' + String((e && e.message) || e) });
};

const TEACHING_SQL = `
  SELECT t.id, t.class_id, t.semester, t.teacher_id,
         s.name AS subject_name, c.name AS class_name, u.name AS teacher_name
  FROM teaching t
  JOIN subjects s ON s.id = t.subject_id
  JOIN classes c ON c.id = t.class_id
  JOIN users u ON u.id = t.teacher_id
`;

async function studentOf(req) {
  return db.prepare('SELECT id, class_id FROM students WHERE user_id = ?').get(req.user.id);
}

// Kelas ajar yang boleh diakses pengguna ini (guru: miliknya, siswa: kelasnya)
async function accessTeaching(req, teachingId) {
  if (isGuru(req)) {
    const t = await db.prepare(TEACHING_SQL + ' WHERE t.id = ? AND t.teacher_id = ?').get(teachingId, req.user.id);
    return t ? { t, student: null } : null;
  }
  const st = await studentOf(req);
  if (!st || !st.class_id) return null;
  const t = await db.prepare(TEACHING_SQL + ' WHERE t.id = ? AND t.class_id = ?').get(teachingId, st.class_id);
  return t ? { t, student: st } : null;
}

router.get('/teachings', async (req, res) => {
  try {
    if (isGuru(req)) {
      const rows = await db.prepare(`
        SELECT t.id, t.semester, s.name AS subject_name, c.name AS class_name,
          (SELECT COUNT(*) FROM lms_materials m WHERE m.teaching_id = t.id) AS materials,
          (SELECT COUNT(*) FROM lms_tasks k WHERE k.teaching_id = t.id) AS tasks
        FROM teaching t
        JOIN subjects s ON s.id = t.subject_id
        JOIN classes c ON c.id = t.class_id
        WHERE t.teacher_id = ?
        ORDER BY t.semester DESC, c.name, s.name
      `).all(req.user.id);
      return res.json({ rows });
    }

    const st = await studentOf(req);
    if (!st || !st.class_id) return res.json({ rows: [] });

    const rows = await db.prepare(`
      SELECT t.id, t.semester, s.name AS subject_name, u.name AS teacher_name,
        (SELECT COUNT(*) FROM lms_materials m WHERE m.teaching_id = t.id) AS materials,
        (SELECT COUNT(*) FROM lms_tasks k WHERE k.teaching_id = t.id) AS tasks,
        (SELECT COUNT(*) FROM lms_tasks k WHERE k.teaching_id = t.id
           AND NOT EXISTS (SELECT 1 FROM lms_submissions x WHERE x.task_id = k.id AND x.student_id = ?)) AS pending
      FROM teaching t
      JOIN subjects s ON s.id = t.subject_id
      JOIN users u ON u.id = t.teacher_id
      WHERE t.class_id = ?
      ORDER BY t.semester DESC, s.name
    `).all(st.id, st.class_id);
    res.json({ rows });
  } catch (e) {
    return fail(res, e);
  }
});

router.get('/teaching/:id', async (req, res) => {
  try {
    const acc = await accessTeaching(req, Number(req.params.id));
    if (!acc) return res.status(404).json({ error: 'Kelas ajar tidak ditemukan.' });
    const { t, student } = acc;

    const materials = await db.prepare(
      'SELECT id, title, description, link, created_at FROM lms_materials WHERE teaching_id = ? ORDER BY id DESC'
    ).all(t.id);

    let tasks;
    if (student) {
      tasks = await db.prepare(`
        SELECT k.id, k.title, k.instructions, k.link, k.due_date, k.created_at, k.max_score,
               x.answer AS my_answer, x.link AS my_link, x.submitted_at AS my_at,
               x.score AS my_score, x.feedback AS my_feedback, x.graded_at AS my_graded_at
        FROM lms_tasks k
        LEFT JOIN lms_submissions x ON x.task_id = k.id AND x.student_id = ?
        WHERE k.teaching_id = ?
        ORDER BY k.id DESC
      `).all(student.id, t.id);
      tasks.forEach((k) => {
        k.my_late = !!(k.my_at && k.due_date && dayJkt(k.my_at) > k.due_date);
      });
    } else {
      tasks = await db.prepare(`
        SELECT k.id, k.title, k.instructions, k.link, k.due_date, k.created_at,
          k.max_score, k.assessment_id,
          (SELECT COUNT(*) FROM lms_submissions x WHERE x.task_id = k.id) AS submitted,
          (SELECT COUNT(*) FROM lms_submissions x WHERE x.task_id = k.id AND x.graded_at IS NOT NULL) AS graded
        FROM lms_tasks k
        WHERE k.teaching_id = ?
        ORDER BY k.id DESC
      `).all(t.id);
      const tot = await db.prepare('SELECT COUNT(*) n FROM students WHERE class_id = ?').get(t.class_id);
      tasks.forEach((k) => { k.total = Number(tot.n) || 0; });
    }

    res.json({
      teaching: {
        id: t.id, subject_name: t.subject_name, class_name: t.class_name,
        teacher_name: t.teacher_name, semester: t.semester
      },
      materials,
      tasks,
      today: todayJkt()
    });
  } catch (e) {
    return fail(res, e);
  }
});

// ---------- Guru: materi ----------
router.post('/teaching/:id/materials', async (req, res) => {
  if (!isGuru(req)) return res.status(403).json({ error: 'Hanya guru yang bisa membagikan materi.' });
  try {
    const acc = await accessTeaching(req, Number(req.params.id));
    if (!acc) return res.status(404).json({ error: 'Kelas ajar tidak ditemukan.' });

    const title = str(req.body.title, 150);
    if (!title) return bad(res, 'Judul materi wajib diisi.');
    const link = cleanLink(req.body.link);
    if (!link.ok) return bad(res, 'Tautan harus diawali http:// atau https://');
    const description = str(req.body.description, 2000);
    if (!description && !link.value) return bad(res, 'Isi keterangan atau tautan materi.');

    const info = await insertReturnId(
      'INSERT INTO lms_materials(teaching_id, title, description, link) VALUES(?,?,?,?)',
      [acc.t.id, title, description || null, link.value]
    );
    res.status(201).json({ id: info.id });
  } catch (e) {
    return fail(res, e);
  }
});

router.delete('/materials/:id', async (req, res) => {
  if (!isGuru(req)) return res.status(403).json({ error: 'Tidak diizinkan.' });
  try {
    const m = await db.prepare(
      `SELECT m.id FROM lms_materials m JOIN teaching t ON t.id = m.teaching_id
       WHERE m.id = ? AND t.teacher_id = ?`
    ).get(Number(req.params.id), req.user.id);
    if (!m) return res.status(404).json({ error: 'Materi tidak ditemukan.' });

    await db.prepare('DELETE FROM lms_materials WHERE id = ?').run(m.id);
    res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});

// ---------- Guru: tugas ----------
router.post('/teaching/:id/tasks', async (req, res) => {
  if (!isGuru(req)) return res.status(403).json({ error: 'Hanya guru yang bisa membuat tugas.' });
  try {
    const acc = await accessTeaching(req, Number(req.params.id));
    if (!acc) return res.status(404).json({ error: 'Kelas ajar tidak ditemukan.' });

    const title = str(req.body.title, 150);
    if (!title) return bad(res, 'Judul tugas wajib diisi.');
    const instructions = str(req.body.instructions, 3000);
    if (!instructions) return bad(res, 'Petunjuk tugas wajib diisi.');
    const link = cleanLink(req.body.link);
    if (!link.ok) return bad(res, 'Tautan harus diawali http:// atau https://');

    const due = str(req.body.due_date, 10);
    if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return bad(res, 'Format tenggat tidak valid.');

    const rawMax = req.body.max_score;
    const maxScore = rawMax === undefined || rawMax === null || rawMax === '' ? 100 : Number(rawMax);
    if (!Number.isFinite(maxScore) || maxScore <= 0 || maxScore > 1000) {
      return bad(res, 'Nilai maksimal harus antara 1 dan 1000.');
    }

    // Opsional: hubungkan ke asesmen OBE agar nilai tugas ikut ke nilai akhir
    const assessmentId = Number(req.body.assessment_id) || null;
    if (assessmentId) {
      const a = await db.prepare('SELECT id FROM assessments WHERE id = ? AND teaching_id = ?')
        .get(assessmentId, acc.t.id);
      if (!a) return bad(res, 'Asesmen tidak valid untuk kelas ajar ini.');
      const used = await db.prepare('SELECT id FROM lms_tasks WHERE assessment_id = ?').get(assessmentId);
      if (used) return bad(res, 'Asesmen itu sudah dipakai tugas lain. Pilih asesmen yang berbeda.');
    }

    const info = await insertReturnId(
      'INSERT INTO lms_tasks(teaching_id, title, instructions, link, due_date, max_score, assessment_id) VALUES(?,?,?,?,?,?,?)',
      [acc.t.id, title, instructions, link.value, due || null, maxScore, assessmentId]
    );
    res.status(201).json({ id: info.id });
  } catch (e) {
    return fail(res, e);
  }
});

async function guruTask(req) {
  return db.prepare(
    `SELECT k.id, k.title, k.due_date, k.max_score, k.assessment_id, t.class_id, t.id AS teaching_id
     FROM lms_tasks k JOIN teaching t ON t.id = k.teaching_id
     WHERE k.id = ? AND t.teacher_id = ?`
  ).get(Number(req.params.id), req.user.id);
}

router.delete('/tasks/:id', async (req, res) => {
  if (!isGuru(req)) return res.status(403).json({ error: 'Tidak diizinkan.' });
  try {
    const k = await guruTask(req);
    if (!k) return res.status(404).json({ error: 'Tugas tidak ditemukan.' });

    await db.prepare('DELETE FROM lms_submissions WHERE task_id = ?').run(k.id);
    await db.prepare('DELETE FROM lms_tasks WHERE id = ?').run(k.id);
    res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});

router.get('/tasks/:id/submissions', async (req, res) => {
  if (!isGuru(req)) return res.status(403).json({ error: 'Tidak diizinkan.' });
  try {
    const k = await guruTask(req);
    if (!k) return res.status(404).json({ error: 'Tugas tidak ditemukan.' });

    const rows = await db.prepare(`
      SELECT st.id AS student_id, st.nis, u.name, x.answer, x.link, x.submitted_at,
             x.score, x.feedback, x.graded_at
      FROM students st
      JOIN users u ON u.id = st.user_id
      LEFT JOIN lms_submissions x ON x.task_id = ? AND x.student_id = st.id
      WHERE st.class_id = ?
      ORDER BY u.name
    `).all(k.id, k.class_id);

    rows.forEach((r) => {
      r.late = !!(r.submitted_at && k.due_date && dayJkt(r.submitted_at) > k.due_date);
    });

    const cls = await db.prepare(
      `SELECT s.name AS subject_name, c.name AS class_name
       FROM teaching t JOIN subjects s ON s.id = t.subject_id JOIN classes c ON c.id = t.class_id
       WHERE t.id = ?`
    ).get(k.teaching_id);

    let assessment = null;
    if (k.assessment_id) {
      assessment = await db.prepare(
        `SELECT a.name, a.max_score, a.weight, o.code AS outcome_code
         FROM assessments a LEFT JOIN outcomes o ON o.id = a.outcome_id WHERE a.id = ?`
      ).get(k.assessment_id) || null;
    }

    res.json({
      task: {
        id: k.id, title: k.title, due_date: k.due_date, teaching_id: k.teaching_id,
        max_score: Number(k.max_score) || 100
      },
      assessment,
      teaching: cls,
      rows
    });
  } catch (e) {
    return fail(res, e);
  }
});

// ---------- Guru: beri nilai dan komentar ----------
// Body: { grades: [{ student_id, score, feedback }] }
// score kosong = nilai dihapus. Hanya siswa yang sudah mengumpulkan yang bisa dinilai.
// Bila tugas terhubung ke asesmen OBE, nilai disalin ke tabel scores (diskalakan ke nilai maksimal asesmen).
router.put('/tasks/:id/grades', async (req, res) => {
  if (!isGuru(req)) return res.status(403).json({ error: 'Tidak diizinkan.' });
  try {
    const k = await guruTask(req);
    if (!k) return res.status(404).json({ error: 'Tugas tidak ditemukan.' });

    const list = Array.isArray(req.body.grades) ? req.body.grades : null;
    if (!list) return bad(res, 'Format data nilai tidak valid.');
    if (list.length > 500) return bad(res, 'Terlalu banyak data dalam satu kali simpan.');

    const max = Number(k.max_score) || 100;
    const empty = (v) => v === null || v === '' || v === undefined;

    const subs = await db.prepare(
      `SELECT x.student_id, x.graded_at, x.feedback FROM lms_submissions x
       JOIN students st ON st.id = x.student_id
       WHERE x.task_id = ? AND st.class_id = ?`
    ).all(k.id, k.class_id);
    const submitted = new Set(subs.map((r) => Number(r.student_id)));
    // siswa yang sebelumnya sudah punya penilaian (nilai atau komentar)
    const hadGrade = new Set(
      subs.filter((r) => r.graded_at || r.feedback).map((r) => Number(r.student_id))
    );

    let asmMax = null;
    if (k.assessment_id) {
      const a = await db.prepare('SELECT max_score FROM assessments WHERE id = ?').get(k.assessment_id);
      asmMax = a ? Number(a.max_score) || 100 : null;
    }

    const items = [];
    let changed = 0;

    for (const g of list) {
      const sid = Number(g.student_id);
      const feedback = str(g.feedback, 1000);
      const hasScore = !empty(g.score);

      if (!hasScore && !feedback) {
        // tidak ada nilai dan tidak ada komentar: hapus penilaian bila sebelumnya ada
        if (submitted.has(sid) && hadGrade.has(sid)) {
          items.push([
            'UPDATE lms_submissions SET score = NULL, feedback = NULL, graded_at = NULL WHERE task_id = ? AND student_id = ?',
            [k.id, sid]
          ]);
          if (asmMax) {
            items.push(['DELETE FROM scores WHERE assessment_id = ? AND student_id = ?', [k.assessment_id, sid]]);
          }
          changed++;
        }
        continue;
      }

      if (!submitted.has(sid)) {
        return bad(res, 'Ada siswa yang belum mengumpulkan atau bukan anggota kelas ini, jadi belum bisa dinilai.');
      }

      let score = null;
      if (hasScore) {
        score = Number(g.score);
        if (!Number.isFinite(score) || score < 0 || score > max) {
          return bad(res, `Nilai harus antara 0 dan ${max}.`);
        }
        score = Math.round(score * 100) / 100;
      }

      // komentar saja tanpa nilai: tersimpan, tetapi belum dianggap "dinilai"
      items.push([
        `UPDATE lms_submissions
         SET score = ?, feedback = ?, graded_at = ${hasScore ? "datetime('now')" : 'NULL'}
         WHERE task_id = ? AND student_id = ?`,
        [score, feedback || null, k.id, sid]
      ]);

      if (asmMax) {
        items.push(['DELETE FROM scores WHERE assessment_id = ? AND student_id = ?', [k.assessment_id, sid]]);
        if (hasScore) {
          const scaled = Math.round((score / max) * asmMax * 100) / 100; // 2 desimal, jangan dibulatkan ke bilangan bulat
          items.push([
            'INSERT INTO scores(assessment_id, student_id, score) VALUES(?,?,?)',
            [k.assessment_id, sid, scaled]
          ]);
        }
      }
      changed++;
    }

    if (items.length) await db.batch(items);
    res.json({ ok: true, changed });
  } catch (e) {
    return fail(res, e);
  }
});

// ---------- Siswa: kumpulkan jawaban ----------
router.post('/tasks/:id/submit', async (req, res) => {
  if (isGuru(req)) return res.status(403).json({ error: 'Hanya siswa yang bisa mengumpulkan tugas.' });
  try {
    const st = await studentOf(req);
    if (!st || !st.class_id) return bad(res, 'Anda belum terdaftar di kelas.');

    const k = await db.prepare(
      `SELECT k.id FROM lms_tasks k JOIN teaching t ON t.id = k.teaching_id
       WHERE k.id = ? AND t.class_id = ?`
    ).get(Number(req.params.id), st.class_id);
    if (!k) return res.status(404).json({ error: 'Tugas tidak ditemukan.' });

    // Tugas yang sudah dinilai dikunci supaya nilai tidak berubah diam-diam
    const done = await db.prepare(
      'SELECT graded_at FROM lms_submissions WHERE task_id = ? AND student_id = ?'
    ).get(k.id, st.id);
    if (done && done.graded_at) {
      return bad(res, 'Tugas ini sudah dinilai guru dan tidak bisa dikirim ulang.');
    }

    const answer = str(req.body.answer, 3000);
    const link = cleanLink(req.body.link);
    if (!link.ok) return bad(res, 'Tautan harus diawali http:// atau https://');
    if (!answer && !link.value) return bad(res, 'Isi jawaban atau tautan terlebih dahulu.');

    await db.prepare(
      `INSERT INTO lms_submissions(task_id, student_id, answer, link, submitted_at)
       VALUES(?, ?, ?, ?, datetime('now'))
       ON CONFLICT(task_id, student_id)
       DO UPDATE SET answer = excluded.answer, link = excluded.link, submitted_at = excluded.submitted_at`
    ).run(k.id, st.id, answer || null, link.value);

    res.json({ ok: true });
  } catch (e) {
    return fail(res, e);
  }
});

module.exports = router;