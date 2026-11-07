const router = require('express').Router();
const db = require('../db');
const { auth, role } = require('../authMiddleware');
const { analyze } = require('../analysis');

router.use(auth, role('guru'));

const bad = (res, msg) => res.status(400).json({ error: msg });
const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// Pastikan kelas ajar milik guru yang login
function ownTeaching(req, res, next) {
  const t = db.prepare('SELECT * FROM teaching WHERE id = ? AND teacher_id = ?').get(req.params.id, req.user.id);
  if (!t) return res.status(404).json({ error: 'Kelas ajar tidak ditemukan' });
  req.teaching = t;
  next();
}

// Pastikan asesmen berada di kelas ajar milik guru
function ownAssessment(req, res, next) {
  const a = db.prepare(`
    SELECT a.*, t.class_id FROM assessments a JOIN teaching t ON t.id = a.teaching_id
    WHERE a.id = ? AND t.teacher_id = ?`).get(req.params.aid, req.user.id);
  if (!a) return res.status(404).json({ error: 'Asesmen tidak ditemukan' });
  req.assessment = a;
  next();
}

router.get('/teaching', (req, res) => {
  res.json(db.prepare(`
    SELECT t.id, t.semester, s.name AS subject_name, s.code AS subject_code,
           c.name AS class_name,
           (SELECT COUNT(*) FROM students st WHERE st.class_id = t.class_id) AS students
    FROM teaching t
    JOIN subjects s ON s.id = t.subject_id
    JOIN classes c ON c.id = t.class_id
    WHERE t.teacher_id = ?
    ORDER BY t.semester DESC, c.name, s.name`).all(req.user.id));
});

/* ---------- Capaian Pembelajaran (CP) ---------- */
router.get('/teaching/:id/outcomes', ownTeaching, (req, res) => {
  res.json(db.prepare('SELECT id, code, description FROM outcomes WHERE subject_id = ? ORDER BY code')
    .all(req.teaching.subject_id));
});
router.post('/teaching/:id/outcomes', ownTeaching, (req, res) => {
  const code = str(req.body.code, 20).toUpperCase(), description = str(req.body.description, 300);
  if (!code || !description) return bad(res, 'Kode dan deskripsi CP wajib diisi.');
  try {
    const info = db.prepare('INSERT INTO outcomes(subject_id,code,description) VALUES(?,?,?)')
      .run(req.teaching.subject_id, code, description);
    res.status(201).json({ id: info.lastInsertRowid });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) return bad(res, 'Kode CP sudah ada untuk mapel ini.');
    throw e;
  }
});
router.delete('/teaching/:id/outcomes/:oid', ownTeaching, (req, res) => {
  db.prepare('DELETE FROM outcomes WHERE id = ? AND subject_id = ?').run(req.params.oid, req.teaching.subject_id);
  res.json({ ok: true });
});

/* ---------- Asesmen ---------- */
router.get('/teaching/:id/assessments', ownTeaching, (req, res) => {
  res.json(db.prepare(`
    SELECT a.id, a.name, a.weight, a.max_score, a.outcome_id, o.code AS outcome_code,
           (SELECT COUNT(*) FROM scores sc WHERE sc.assessment_id = a.id) AS filled
    FROM assessments a LEFT JOIN outcomes o ON o.id = a.outcome_id
    WHERE a.teaching_id = ? ORDER BY a.id`).all(req.teaching.id));
});
router.post('/teaching/:id/assessments', ownTeaching, (req, res) => {
  const name = str(req.body.name, 100);
  const weight = Number(req.body.weight) || 1;
  const max = Number(req.body.max_score) || 100;
  let outcome = Number(req.body.outcome_id) || null;
  if (!name) return bad(res, 'Nama asesmen wajib diisi.');
  if (weight <= 0 || max <= 0) return bad(res, 'Bobot dan nilai maksimal harus lebih dari 0.');
  if (outcome) {
    const ok = db.prepare('SELECT id FROM outcomes WHERE id = ? AND subject_id = ?').get(outcome, req.teaching.subject_id);
    if (!ok) return bad(res, 'CP tidak valid untuk mapel ini.');
  }
  const info = db.prepare('INSERT INTO assessments(teaching_id,outcome_id,name,weight,max_score) VALUES(?,?,?,?,?)')
    .run(req.teaching.id, outcome, name, weight, max);
  res.status(201).json({ id: info.lastInsertRowid });
});
router.delete('/assessments/:aid', ownAssessment, (req, res) => {
  db.prepare('DELETE FROM assessments WHERE id = ?').run(req.assessment.id);
  res.json({ ok: true });
});

/* ---------- Input nilai ---------- */
router.get('/assessments/:aid/scores', ownAssessment, (req, res) => {
  const rows = db.prepare(`
    SELECT st.id AS student_id, st.nis, u.name, sc.score
    FROM students st
    JOIN users u ON u.id = st.user_id
    LEFT JOIN scores sc ON sc.student_id = st.id AND sc.assessment_id = ?
    WHERE st.class_id = ? ORDER BY u.name`).all(req.assessment.id, req.assessment.class_id);
  res.json({ assessment: req.assessment, rows });
});
router.put('/assessments/:aid/scores', ownAssessment, (req, res) => {
  const list = Array.isArray(req.body.scores) ? req.body.scores : null;
  if (!list) return bad(res, 'Format data nilai tidak valid.');
  const valid = new Set(
    db.prepare('SELECT id FROM students WHERE class_id = ?').all(req.assessment.class_id).map((r) => r.id)
  );
  const max = req.assessment.max_score;
  const upsert = db.prepare(`
    INSERT INTO scores(assessment_id, student_id, score) VALUES(?,?,?)
    ON CONFLICT(assessment_id, student_id) DO UPDATE SET score = excluded.score`);
  const del = db.prepare('DELETE FROM scores WHERE assessment_id = ? AND student_id = ?');

  for (const s of list) {
    if (!valid.has(Number(s.student_id))) return bad(res, 'Ada siswa yang bukan anggota kelas ini.');
    if (s.score !== null && s.score !== '' && s.score !== undefined) {
      const v = Number(s.score);
      if (!Number.isFinite(v) || v < 0 || v > max) return bad(res, `Nilai harus antara 0 dan ${max}.`);
    }
  }
  db.transaction(() => {
    for (const s of list) {
      if (s.score === null || s.score === '' || s.score === undefined) del.run(req.assessment.id, s.student_id);
      else upsert.run(req.assessment.id, s.student_id, Number(s.score));
    }
  })();
  res.json({ ok: true });
});

/* ---------- Analisis & refleksi ---------- */
router.get('/teaching/:id/analysis', ownTeaching, (req, res) => res.json(analyze(req.teaching.id)));

router.get('/teaching/:id/reflections', ownTeaching, (req, res) => {
  res.json(db.prepare('SELECT id, content, follow_up, created_at FROM reflections WHERE teaching_id = ? ORDER BY id DESC')
    .all(req.teaching.id));
});
router.post('/teaching/:id/reflections', ownTeaching, (req, res) => {
  const content = str(req.body.content, 2000), follow = str(req.body.follow_up, 2000);
  if (!content) return bad(res, 'Isi refleksi wajib diisi.');
  const info = db.prepare('INSERT INTO reflections(teaching_id,content,follow_up) VALUES(?,?,?)')
    .run(req.teaching.id, content, follow || null);
  res.status(201).json({ id: info.lastInsertRowid });
});
router.delete('/teaching/:id/reflections/:rid', ownTeaching, (req, res) => {
  db.prepare('DELETE FROM reflections WHERE id = ? AND teaching_id = ?').run(req.params.rid, req.teaching.id);
  res.json({ ok: true });
});

module.exports = router;
