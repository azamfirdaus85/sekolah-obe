const db = require('./db');

const KKM = 75;

async function analyze(teachingId) {
  // Informasi kelas ajar
  const teaching = await db.prepare(`
    SELECT t.id, t.semester, t.class_id, t.subject_id,
           s.name AS subject_name, s.code AS subject_code,
           c.name AS class_name, u.name AS teacher_name
    FROM teaching t
    JOIN subjects s ON s.id = t.subject_id
    JOIN classes c ON c.id = t.class_id
    JOIN users u ON u.id = t.teacher_id
    WHERE t.id = ?
  `).get(teachingId);

  if (!teaching) return null;

  // Daftar siswa
  const students = await db.prepare(`
    SELECT st.id AS student_id, st.nis, u.name
    FROM students st
    JOIN users u ON u.id = st.user_id
    WHERE st.class_id = ?
    ORDER BY u.name
  `).all(teaching.class_id);

  const studentsNorm = (students || []).map(s => ({
    id: s.student_id,
    student_id: s.student_id,
    nis: s.nis,
    name: s.name
  }));

  // Daftar penilaian
  const assessments = await db.prepare(`
    SELECT a.id, a.name, a.weight, a.max_score,
           a.outcome_id, o.code AS outcome_code
    FROM assessments a
    LEFT JOIN outcomes o ON o.id = a.outcome_id
    WHERE a.teaching_id = ?
  `).all(teachingId);

  // Data nilai
  const scores = await db.prepare(`
    SELECT sc.assessment_id, sc.student_id, sc.score
    FROM scores sc
    JOIN assessments a ON a.id = sc.assessment_id
    WHERE a.teaching_id = ?
  `).all(teachingId);

  const scoreMap = new Map();

  for (const s of scores) {
    scoreMap.set(
      `${s.assessment_id}:${s.student_id}`,
      Number(s.score)
    );
  }

  // Perhitungan nilai setiap siswa
  const studentRows = studentsNorm.map(st => {
    let total = 0;
    let weightSum = 0;

    const scoresPerOutcome = {};

    for (const a of assessments) {
      const v = scoreMap.get(`${a.id}:${st.id}`);

      if (v !== undefined && a.max_score > 0) {
        const norm = (v / a.max_score) * 100;
        const weight = Number(a.weight) || 1;

        total += norm * weight;
        weightSum += weight;

        if (a.outcome_id) {
          if (!scoresPerOutcome[a.outcome_id]) {
            scoresPerOutcome[a.outcome_id] = [];
          }

          scoresPerOutcome[a.outcome_id].push(norm);
        }
      }
    }

    const avg = weightSum > 0 ? total / weightSum : null;
    const pass = avg !== null && avg >= KKM;

    const scoresObj = {};

    for (const k in scoresPerOutcome) {
      const arr = scoresPerOutcome[k];

      scoresObj[k] = Math.round(
        (arr.reduce((x, y) => x + y, 0) / arr.length) * 100
      ) / 100;
    }

    return {
      ...st,
      avg,
      pass,
      final: avg,
      passed: pass,
      scores: scoresObj
    };
  });

  // Rata-rata kelas
  const validAvgs = studentRows
    .map(s => s.avg)
    .filter(v => v !== null);

  const classAvg = validAvgs.length
    ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length
    : 0;

  // Analisis capaian pembelajaran
  const outcomes = await db.prepare(`
    SELECT id, code, description
    FROM outcomes
    WHERE subject_id = ?
    ORDER BY code
  `).all(teaching.subject_id);

  const outcomeRows = outcomes.map(o => {
    const rel = assessments.filter(
      a => Number(a.outcome_id) === Number(o.id)
    );

    const vals = [];

    for (const st of studentsNorm) {
      for (const a of rel) {
        const v = scoreMap.get(`${a.id}:${st.id}`);

        if (v !== undefined && a.max_score > 0) {
          vals.push((v / a.max_score) * 100);
        }
      }
    }

    const avg = vals.length
      ? vals.reduce((a, b) => a + b, 0) / vals.length
      : 0;

    const passRate = vals.length
      ? (vals.filter(v => v >= KKM).length / vals.length) * 100
      : 0;

    return {
      id: o.id,
      code: o.code,
      description: o.description,
      avg: Math.round(avg * 100) / 100,
      passRate: Math.round(passRate * 100) / 100
    };
  });

  return {
    teaching,
    students: studentRows,
    assessments,
    classAvg: Math.round(classAvg * 100) / 100,
    outcomes: outcomeRows,
    kkm: KKM,
    passCount: studentRows.filter(s => s.pass).length,
    totalStudents: students.length
  };
}

module.exports = {
  analyze,
  KKM
};