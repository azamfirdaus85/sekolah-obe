const router = require('express').Router();
const db = require('../db');
const { auth, role } = require('../authMiddleware');
const { analyze, KKM } = require('../analysis');
const { buildReport } = require('../rapor');

router.use(auth, role('kepsek', 'admin'));

router.get('/overview', async (req, res) => {
  try {
    const ids = await db.prepare('SELECT id FROM teaching ORDER BY semester DESC, id').all();
    // FIX: ids bisa jadi Promise / bukan array kalau db.js lama, paksa jadi array
    const idList = Array.isArray(ids) ? ids : [];
    const one = async ({ id }) => {
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
    };

    // Dibatasi beberapa sekaligus: ratusan query bersamaan ke Turso bisa membuat timeout
    const items = [];
    const CHUNK = 6;
    for (let k = 0; k < idList.length; k += CHUNK) {
      const part = await Promise.all(idList.slice(k, k + CHUNK).map(one));
      items.push(...part.filter(Boolean));
    }
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

// Daftar siswa + kelas untuk memilih rapor (kepsek & admin)
router.get('/rapor-daftar', async (req, res) => {
  try {
    const students = await db.prepare(`
      SELECT u.id AS user_id, u.name, st.nis, st.class_id, c.name AS class_name
      FROM students st
      JOIN users u ON u.id = st.user_id
      LEFT JOIN classes c ON c.id = st.class_id
      ORDER BY c.name, u.name`).all();
    const classes = await db.prepare('SELECT id, name FROM classes ORDER BY name').all();
    res.json({ students, classes });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal load daftar siswa: ' + e.message });
  }
});

// E-Rapor siswa tertentu (kepsek & admin)
router.get('/rapor/:userId', async (req, res) => {
  try {
    const semester = req.query.semester ? String(req.query.semester).slice(0, 40) : null;
    const d = await buildReport(Number(req.params.userId), semester);
    if (!d) return res.status(404).json({ error: 'Data siswa tidak ditemukan' });
    res.json(d);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Gagal memuat rapor: ' + e.message });
  }
});

module.exports = router;