const router = require('express').Router();
const db = require('../db');
const { auth, role } = require('../authMiddleware');
const { analyze, KKM } = require('../analysis');

router.use(auth, role('kepsek', 'admin'));

router.get('/overview', async (req, res) => {
  try {
    const ids = await db.prepare('SELECT id FROM teaching ORDER BY semester DESC, id').all();
    // FIX: ids bisa jadi Promise / bukan array kalau db.js lama, paksa jadi array
    const idList = Array.isArray(ids) ? ids : [];
    const items = (await Promise.all(idList.map(async ({ id }) => {
      try {
        const a = await analyze(id);
        if (!a) return null;
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
      } catch (e) {
        console.error('analyze fail teaching', id, e.message);
        return null;
      }
    }))).filter(Boolean);
    res.json({ kkm: KKM, items });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal load overview: ' + e.message });
  }
});

router.get('/teaching/:id/analysis', async (req, res) => {
  try {
    const a = await analyze(Number(req.params.id));
    if (!a) return res.status(404).json({ error: 'Kelas ajar tidak ditemukan' });
    res.json(a);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal analisis: ' + e.message });
  }
});

router.get('/teaching/:id/reflections', async (req, res) => {
  try {
    const rows = await db.prepare('SELECT id, content, follow_up, created_at FROM reflections WHERE teaching_id = ? ORDER BY id DESC').all(req.params.id);
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal load refleksi: ' + e.message });
  }
});

module.exports = router;