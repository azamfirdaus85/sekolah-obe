const db = require('./db');
const { analyzeMany, KKM } = require('./analysis');

/* =====================================================
   LAPORAN NILAI & CAPAIAN SATU SISWA
   Dipakai bersama oleh halaman siswa (/api/siswa/report)
   dan portal orang tua (/api/ortu/anak/:sid/nilai),
   supaya angka yang dilihat keduanya selalu sama.

   me = { id, nis, class_id, class_name }   (id = students.id)
   ===================================================== */
async function buildStudentReport(me) {
  if (!me.class_id) return { student: me, kkm: KKM, subjects: [] };

  const teachings = await db.prepare(
    'SELECT id FROM teaching WHERE class_id = ? ORDER BY semester DESC, id'
  ).all(me.class_id);
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

  return { student: me, kkm: KKM, subjects };
}

module.exports = { buildStudentReport };