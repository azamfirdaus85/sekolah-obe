const router = require('express').Router();
const db = require('../db');
const { auth, role } = require('../middleware');
const { analyze, KKM } = require('../analysis');

router.use(auth, role('siswa'));

// Laporan capaian pembelajaran milik siswa yang sedang login
router.get('/report', (req, res) => {
  const me = db.prepare(`
    SELECT st.id, st.nis, st.class_id, c.name AS class_name
    FROM students st LEFT JOIN classes c ON c.id = st.class_id
    WHERE st.user_id = ?`).get(req.user.id);
  if (!me) return res.status(404).json({ error: 'Data siswa tidak ditemukan' });
  if (!me.class_id) return res.json({ student: me, kkm: KKM, subjects: [] });

  const teachings = db.prepare('SELECT id FROM teaching WHERE class_id = ? ORDER BY semester DESC, id').all(me.class_id);
  const subjects = teachings.map((t) => {
    const a = analyze(t.id);
    const mine = a.students.find((s) => s.id === me.id);
    const assessments = db.prepare(`
      SELECT a.name, a.weight, a.max_score, o.code AS outcome_code, sc.score
      FROM assessments a
      LEFT JOIN outcomes o ON o.id = a.outcome_id
      LEFT JOIN scores sc ON sc.assessment_id = a.id AND sc.student_id = ?
      WHERE a.teaching_id = ? ORDER BY a.id`).all(me.id, t.id);
    return {
      id: t.id,
      subject: a.teaching.subject_name,
      teacher: a.teaching.teacher_name,
      semester: a.teaching.semester,
      final: mine ? mine.final : null,
      passed: mine ? mine.passed : null,
      outcomes: a.outcomes.map((o) => ({
        code: o.code,
        description: o.description,
        score: mine ? mine.scores[o.id] : null
      })),
      assessments
    };
  });
  res.json({ student: me, kkm: KKM, subjects });
});

module.exports = router;
