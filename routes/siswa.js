const router = require('express').Router();
const db = require('../db');
const { auth, role } = require('../authMiddleware');
const { analyze, KKM } = require('../analysis');
const { buildReport } = require('../rapor');

router.use(auth, role('siswa'));

// Laporan capaian pembelajaran milik siswa yang sedang login
router.get('/report', async (req, res) => {
  try {
    const me = await db.prepare(`
      SELECT st.id, st.nis, st.class_id, c.name AS class_name
      FROM students st LEFT JOIN classes c ON c.id = st.class_id
      WHERE st.user_id = ?`).get(req.user.id);
    if (!me) return res.status(404).json({ error: 'Data siswa tidak ditemukan' });
    if (!me.class_id) return res.json({ student: me, kkm: KKM, subjects: [] });

    const teachings = await db.prepare('SELECT id FROM teaching WHERE class_id = ? ORDER BY semester DESC, id').all(me.class_id);
    const subjects = [];
    for (const t of teachings) {
      const a = await analyze(t.id);
      const mine = a.students.find((s) => s.id === me.id);
      const assessments = await db.prepare(`
        SELECT a.name, a.weight, a.max_score, o.code AS outcome_code, sc.score
        FROM assessments a
        LEFT JOIN outcomes o ON o.id = a.outcome_id
        LEFT JOIN scores sc ON sc.assessment_id = a.id AND sc.student_id = ?
        WHERE a.teaching_id = ? ORDER BY a.id`).all(me.id, t.id);
      subjects.push({
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
      });
    }
    res.json({ student: me, kkm: KKM, subjects });
  } catch(e){
    console.error(e);
    res.status(500).json({ error: 'Gagal load laporan: ' + e.message });
  }
});

// E-Rapor milik siswa yang sedang login
router.get('/rapor', async (req, res) => {
  try {
    const semester = req.query.semester ? String(req.query.semester).slice(0, 40) : null;
    const d = await buildReport(req.user.id, semester);

    if (!d) {
      return res.status(404).json({ error: 'Data siswa tidak ditemukan' });
    }

    res.json(d);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal memuat rapor: ' + e.message });
  }
});

module.exports = router;