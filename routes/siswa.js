const router = require('express').Router();
const db = require('../db');
const { auth, role } = require('../authMiddleware');
const { analyzeMany, KKM } = require('../analysis');
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
    const ids = teachings.map((t) => Number(t.id));

    // Semua dimuat sekaligus: analisis seluruh kelas ajar + seluruh asesmen siswa ini
    const analyses = await analyzeMany(ids);
    const asmRows = ids.length
      ? await db.prepare(`
          SELECT a.teaching_id, a.name, a.weight, a.max_score, o.code AS outcome_code, sc.score
          FROM assessments a
          LEFT JOIN outcomes o ON o.id = a.outcome_id
          LEFT JOIN scores sc ON sc.assessment_id = a.id AND sc.student_id = ?
          WHERE a.teaching_id IN (${ids.map(() => '?').join(',')})
          ORDER BY a.id`).all(me.id, ...ids)
      : [];
    const asmBy = new Map();
    for (const r of asmRows) {
      const k = Number(r.teaching_id);
      if (!asmBy.has(k)) asmBy.set(k, []);
      asmBy.get(k).push({
        name: r.name,
        weight: r.weight,
        max_score: r.max_score,
        outcome_code: r.outcome_code,
        score: r.score
      });
    }

    const subjects = [];
    for (const t of teachings) {
      const a = analyses.get(Number(t.id));
      if (!a) continue; // kelas ajar tidak bisa dianalisis: lewati, jangan menggagalkan seluruh laporan
      const mine = a.students.find((s) => s.id === me.id);
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
        assessments: asmBy.get(Number(t.id)) || []
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