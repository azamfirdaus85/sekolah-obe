const router = require('express').Router();
const db = require('../db');
const { auth, role } = require('../authMiddleware');
const { analyze, KKM } = require('../analysis');
const { buildReport } = require('../rapor');

router.use(auth, role('guru'));

const bad = (res, msg) => res.status(400).json({ error: msg });
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Bungkus handler async supaya error tidak membuat server menggantung
const wrap = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch((e) => {
    console.error(e);
    res.status(500).json({ error: 'Terjadi kesalahan pada server.' });
  });

// Pastikan kelas ajar milik guru yang login
const ownTeaching = wrap(async (req, res, next) => {
  const t = await db.prepare('SELECT * FROM teaching WHERE id = ? AND teacher_id = ?')
    .get(req.params.id, req.user.id);
  if (!t) return res.status(404).json({ error: 'Kelas ajar tidak ditemukan' });
  req.teaching = t;
  next();
});

// Pastikan asesmen berada di kelas ajar milik guru
const ownAssessment = wrap(async (req, res, next) => {
  const a = await db.prepare(`
    SELECT a.*, t.class_id FROM assessments a JOIN teaching t ON t.id = a.teaching_id
    WHERE a.id = ? AND t.teacher_id = ?`).get(req.params.aid, req.user.id);
  if (!a) return res.status(404).json({ error: 'Asesmen tidak ditemukan' });
  req.assessment = a;
  next();
});

router.get('/teaching', wrap(async (req, res) => {
  res.json(await db.prepare(`
    SELECT t.id, t.semester, s.name AS subject_name, s.code AS subject_code,
           c.name AS class_name,
           (SELECT COUNT(*) FROM students st WHERE st.class_id = t.class_id) AS students
    FROM teaching t
    JOIN subjects s ON s.id = t.subject_id
    JOIN classes c ON c.id = t.class_id
    WHERE t.teacher_id = ?
    ORDER BY t.semester DESC, c.name, s.name`).all(req.user.id));
}));

/* ---------- Capaian Pembelajaran (CP) ---------- */
router.get('/teaching/:id/outcomes', ownTeaching, wrap(async (req, res) => {
  res.json(await db.prepare('SELECT id, code, description FROM outcomes WHERE subject_id = ? ORDER BY code')
    .all(req.teaching.subject_id));
}));

router.post('/teaching/:id/outcomes', ownTeaching, wrap(async (req, res) => {
  const code = str(req.body.code, 20).toUpperCase(), description = str(req.body.description, 300);
  if (!code || !description) return bad(res, 'Kode dan deskripsi CP wajib diisi.');
  const dup = await db.prepare('SELECT id FROM outcomes WHERE subject_id = ? AND code = ?')
    .get(req.teaching.subject_id, code);
  if (dup) return bad(res, 'Kode CP sudah ada untuk mapel ini.');
  const info = await db.prepare('INSERT INTO outcomes(subject_id,code,description) VALUES(?,?,?)')
    .run(req.teaching.subject_id, code, description);
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.delete('/teaching/:id/outcomes/:oid', ownTeaching, wrap(async (req, res) => {
  await db.prepare('DELETE FROM outcomes WHERE id = ? AND subject_id = ?')
    .run(req.params.oid, req.teaching.subject_id);
  res.json({ ok: true });
}));

/* ---------- Asesmen ---------- */
router.get('/teaching/:id/assessments', ownTeaching, wrap(async (req, res) => {
  res.json(await db.prepare(`
    SELECT a.id, a.name, a.weight, a.max_score, a.outcome_id, o.code AS outcome_code,
           (SELECT COUNT(*) FROM scores sc WHERE sc.assessment_id = a.id) AS filled
    FROM assessments a LEFT JOIN outcomes o ON o.id = a.outcome_id
    WHERE a.teaching_id = ? ORDER BY a.id`).all(req.teaching.id));
}));

router.post('/teaching/:id/assessments', ownTeaching, wrap(async (req, res) => {
  const name = str(req.body.name, 100);
  const weight = Number(req.body.weight) || 1;
  const max = Number(req.body.max_score) || 100;
  const outcome = Number(req.body.outcome_id) || null;
  if (!name) return bad(res, 'Nama asesmen wajib diisi.');
  if (weight <= 0 || max <= 0) return bad(res, 'Bobot dan nilai maksimal harus lebih dari 0.');
  if (outcome) {
    const ok = await db.prepare('SELECT id FROM outcomes WHERE id = ? AND subject_id = ?')
      .get(outcome, req.teaching.subject_id);
    if (!ok) return bad(res, 'CP tidak valid untuk mapel ini.');
  }
  const info = await db.prepare('INSERT INTO assessments(teaching_id,outcome_id,name,weight,max_score) VALUES(?,?,?,?,?)')
    .run(req.teaching.id, outcome, name, weight, max);
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.delete('/assessments/:aid', ownAssessment, wrap(async (req, res) => {
  await db.prepare('DELETE FROM assessments WHERE id = ?').run(req.assessment.id);
  res.json({ ok: true });
}));

/* ---------- Input nilai ---------- */
router.get('/assessments/:aid/scores', ownAssessment, wrap(async (req, res) => {
  const rows = await db.prepare(`
    SELECT st.id AS student_id, st.nis, u.name, sc.score
    FROM students st
    JOIN users u ON u.id = st.user_id
    LEFT JOIN scores sc ON sc.student_id = st.id AND sc.assessment_id = ?
    WHERE st.class_id = ? ORDER BY u.name`).all(req.assessment.id, req.assessment.class_id);
  res.json({ assessment: req.assessment, rows });
}));

router.put('/assessments/:aid/scores', ownAssessment, wrap(async (req, res) => {
  const list = Array.isArray(req.body.scores) ? req.body.scores : null;
  if (!list) return bad(res, 'Format data nilai tidak valid.');

  const members = await db.prepare('SELECT id FROM students WHERE class_id = ?').all(req.assessment.class_id);
  const valid = new Set(members.map((r) => Number(r.id)));
  const max = Number(req.assessment.max_score);
  const empty = (v) => v === null || v === '' || v === undefined;

  for (const s of list) {
    if (!valid.has(Number(s.student_id))) return bad(res, 'Ada siswa yang bukan anggota kelas ini.');
    if (!empty(s.score)) {
      const v = Number(s.score);
      if (!Number.isFinite(v) || v < 0 || v > max) return bad(res, `Nilai harus antara 0 dan ${max}.`);
    }
  }

  // Hapus lalu isi ulang dalam satu batch atomik
  const items = [];
  for (const s of list) {
    const sid = Number(s.student_id);
    items.push(['DELETE FROM scores WHERE assessment_id = ? AND student_id = ?', [req.assessment.id, sid]]);
    if (!empty(s.score)) {
      items.push(['INSERT INTO scores(assessment_id, student_id, score) VALUES(?,?,?)',
        [req.assessment.id, sid, Number(s.score)]]);
    }
  }
  if (items.length) await db.batch(items);
  res.json({ ok: true });
}));

/* ---------- Analisis & refleksi ---------- */
router.get('/teaching/:id/analysis', ownTeaching, wrap(async (req, res) => {
  res.json(await analyze(req.teaching.id));
}));

router.get('/teaching/:id/reflections', ownTeaching, wrap(async (req, res) => {
  res.json(await db.prepare('SELECT id, content, follow_up, created_at FROM reflections WHERE teaching_id = ? ORDER BY id DESC')
    .all(req.teaching.id));
}));

router.post('/teaching/:id/reflections', ownTeaching, wrap(async (req, res) => {
  const content = str(req.body.content, 2000), follow = str(req.body.follow_up, 2000);
  if (!content) return bad(res, 'Isi refleksi wajib diisi.');
  const info = await db.prepare('INSERT INTO reflections(teaching_id,content,follow_up) VALUES(?,?,?)')
    .run(req.teaching.id, content, follow || null);
  res.status(201).json({ id: info.lastInsertRowid });
}));

router.delete('/teaching/:id/reflections/:rid', ownTeaching, wrap(async (req, res) => {
  await db.prepare('DELETE FROM reflections WHERE id = ? AND teaching_id = ?').run(req.params.rid, req.teaching.id);
  res.json({ ok: true });
}));

/* ---------- Wali kelas ---------- */
const ALPA_PERHATIAN = 3; // alpa sebanyak ini atau lebih = perlu perhatian

router.get('/homeroom', wrap(async (req, res) => {
  const periods = await db.prepare(
    'SELECT name, semester, is_active FROM academic_years ORDER BY name DESC, semester DESC'
  ).all();
  const semesters = periods.map((p) => `${p.semester} ${p.name}`);

  let semester = str(req.query.semester, 40);
  if (!semester) {
    const aktif = periods.find((p) => Number(p.is_active) === 1);
    semester = aktif ? `${aktif.semester} ${aktif.name}` : '';
  }
  const sem = semester || null;

  const classes = await db.prepare(
    'SELECT id, name FROM classes WHERE homeroom_teacher_id = ? ORDER BY name'
  ).all(req.user.id);

  const result = [];
  for (const c of classes) {
    const students = await db.prepare(`
      SELECT st.id AS student_id, st.user_id, st.nis, u.name
      FROM students st JOIN users u ON u.id = st.user_id
      WHERE st.class_id = ? ORDER BY u.name`).all(c.id);

    // nilai akhir per siswa per mapel = rata-rata berbobot asesmen yang sudah terisi
    const finals = await db.prepare(`
      SELECT st.id AS student_id, sub.name AS subject_name,
             SUM(sc.score * 100.0 / a.max_score * a.weight) / SUM(a.weight) AS final
      FROM students st
      JOIN teaching t ON t.class_id = st.class_id
      JOIN subjects sub ON sub.id = t.subject_id
      JOIN assessments a ON a.teaching_id = t.id
      JOIN scores sc ON sc.assessment_id = a.id AND sc.student_id = st.id
      WHERE st.class_id = ? AND (? IS NULL OR t.semester = ?)
      GROUP BY st.id, t.id`).all(c.id, sem, sem);

    // rekap kehadiran per siswa per status, ikut semester yang dipilih
    const att = await db.prepare(`
      SELECT sa.student_id, sa.status, COUNT(*) AS n
      FROM student_attendance sa
      JOIN students st ON st.id = sa.student_id
      JOIN teaching t ON t.id = sa.teaching_id
      WHERE st.class_id = ? AND (? IS NULL OR t.semester = ?)
      GROUP BY sa.student_id, sa.status`).all(c.id, sem, sem);

    const finalsBy = new Map();
    for (const f of finals) {
      const k = Number(f.student_id);
      if (!finalsBy.has(k)) finalsBy.set(k, []);
      finalsBy.get(k).push({ subject: f.subject_name, final: Number(f.final) });
    }
    const attBy = new Map();
    for (const a of att) {
      const k = Number(a.student_id);
      if (!attBy.has(k)) attBy.set(k, {});
      attBy.get(k)[a.status] = Number(a.n);
    }

    const rows = students.map((s) => {
      const sid = Number(s.student_id);
      const list = finalsBy.get(sid) || [];
      const avg = list.length ? list.reduce((x, y) => x + y.final, 0) / list.length : null;
      const attendance = attBy.get(sid) || {};
      const total = Object.values(attendance).reduce((x, y) => x + y, 0);
      const below = list.filter((f) => f.final < KKM).map((f) => f.subject);
      return {
        student_id: sid,
        user_id: Number(s.user_id),
        nis: s.nis,
        name: s.name,
        average: avg === null ? null : Math.round(avg * 10) / 10,
        below_kkm: below,
        attendance,
        attendance_pct: total ? Math.round(((attendance.hadir || 0) / total) * 100) : null,
        needs_attention: below.length > 0 || (attendance.alpa || 0) >= ALPA_PERHATIAN
      };
    });

    result.push({
      id: Number(c.id),
      name: c.name,
      kkm: KKM,
      total: rows.length,
      under_kkm: rows.filter((r) => r.below_kkm.length).length,
      attention: rows.filter((r) => r.needs_attention).length,
      students: rows
    });
  }

  // classes kosong = guru ini bukan wali kelas
  res.json({ semester: semester || null, semesters, alpa_limit: ALPA_PERHATIAN, classes: result });
}));

// E-Rapor siswa perwalian (hanya untuk siswa di kelas yang diwalikan guru ini)
router.get('/homeroom/rapor/:userId', wrap(async (req, res) => {
  const own = await db.prepare(`
    SELECT st.id FROM students st
    JOIN classes c ON c.id = st.class_id
    WHERE st.user_id = ? AND c.homeroom_teacher_id = ?`).get(req.params.userId, req.user.id);

  if (!own) return res.status(404).json({ error: 'Siswa bukan anggota kelas perwalian Anda' });

  const semester = req.query.semester ? String(req.query.semester).slice(0, 40) : null;
  const d = await buildReport(Number(req.params.userId), semester);

  if (!d) return res.status(404).json({ error: 'Data siswa tidak ditemukan' });
  res.json(d);
}));

module.exports = router;