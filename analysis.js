const db = require('./db');

const KKM = Number(process.env.KKM) || 70;

/**
 * Analisis capaian pembelajaran (CP) satu kelas ajar.
 * - Nilai CP siswa  = rata-rata berbobot dari asesmen yang dikaitkan ke CP itu (dinormalkan ke 0-100)
 * - Nilai akhir     = rata-rata berbobot seluruh asesmen
 * - Tuntas          = nilai >= KKM
 */
function analyze(teachingId) {
  const teaching = db.prepare(`
    SELECT t.id, t.semester, t.subject_id, t.class_id, t.teacher_id,
           s.name AS subject_name, s.code AS subject_code,
           c.name AS class_name, u.name AS teacher_name
    FROM teaching t
    JOIN subjects s ON s.id = t.subject_id
    JOIN classes  c ON c.id = t.class_id
    JOIN users    u ON u.id = t.teacher_id
    WHERE t.id = ?`).get(teachingId);
  if (!teaching) return null;

  const outcomes = db
    .prepare('SELECT id, code, description FROM outcomes WHERE subject_id = ? ORDER BY code')
    .all(teaching.subject_id);

  const students = db.prepare(`
    SELECT st.id, st.nis, u.name
    FROM students st JOIN users u ON u.id = st.user_id
    WHERE st.class_id = ? ORDER BY u.name`).all(teaching.class_id);

  const rows = db.prepare(`
    SELECT a.outcome_id, a.weight, a.max_score, sc.student_id, sc.score
    FROM assessments a JOIN scores sc ON sc.assessment_id = a.id
    WHERE a.teaching_id = ?`).all(teachingId);

  const perOutcome = {}; // "studentId|outcomeId" -> {sum, w}
  const perStudent = {}; // studentId -> {sum, w}
  for (const r of rows) {
    const pct = (r.score / r.max_score) * 100;
    const total = (perStudent[r.student_id] ||= { sum: 0, w: 0 });
    total.sum += pct * r.weight;
    total.w += r.weight;
    if (r.outcome_id) {
      const k = r.student_id + '|' + r.outcome_id;
      const o = (perOutcome[k] ||= { sum: 0, w: 0 });
      o.sum += pct * r.weight;
      o.w += r.weight;
    }
  }

  const round = (n) => (n == null ? null : Math.round(n * 10) / 10);

  const studentRows = students.map((s) => {
    const scores = {};
    for (const o of outcomes) {
      const v = perOutcome[s.id + '|' + o.id];
      scores[o.id] = v ? round(v.sum / v.w) : null;
    }
    const t = perStudent[s.id];
    const final = t ? round(t.sum / t.w) : null;
    return { id: s.id, nis: s.nis, name: s.name, scores, final, passed: final != null ? final >= KKM : null };
  });

  const outcomeStats = outcomes.map((o) => {
    const vals = studentRows.map((s) => s.scores[o.id]).filter((v) => v != null);
    const passed = vals.filter((v) => v >= KKM).length;
    return {
      ...o,
      count: vals.length,
      avg: vals.length ? round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
      passRate: vals.length ? round((passed / vals.length) * 100) : null
    };
  });

  const finals = studentRows.map((s) => s.final).filter((v) => v != null);
  return {
    teaching,
    kkm: KKM,
    outcomes: outcomeStats,
    students: studentRows,
    classAvg: finals.length ? round(finals.reduce((a, b) => a + b, 0) / finals.length) : null
  };
}

module.exports = { analyze, KKM };
