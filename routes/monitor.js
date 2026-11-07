const router = require('express').Router();
const db = require('../db');
const { auth, role } = require('../authMiddleware');
const { analyze, KKM } = require('../analysis');

// Untuk Kepala Sekolah / struktural dan admin: memantau capaian seluruh kelas ajar
router.use(auth, role('kepsek', 'admin'));

router.get('/overview', (req, res) => {
  const ids = db.prepare('SELECT id FROM teaching ORDER BY semester DESC, id').all();
  const items = ids.map(({ id }) => {
    const a = analyze(id);
    return {
      id,
      subject: a.teaching.subject_name,
      class_name: a.teaching.class_name,
      teacher: a.teaching.teacher_name,
      semester: a.teaching.semester,
      students: a.students.length,
      classAvg: a.classAvg,
      outcomes: a.outcomes.map((o) => ({ code: o.code, avg: o.avg, passRate: o.passRate }))
    };
  });
  res.json({ kkm: KKM, items });
});

router.get('/teaching/:id/analysis', (req, res) => {
  const a = analyze(Number(req.params.id));
  if (!a) return res.status(404).json({ error: 'Kelas ajar tidak ditemukan' });
  res.json(a);
});

router.get('/teaching/:id/reflections', (req, res) => {
  res.json(db.prepare('SELECT id, content, follow_up, created_at FROM reflections WHERE teaching_id = ? ORDER BY id DESC')
    .all(req.params.id));
});

module.exports = router;
