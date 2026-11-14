const db = require('./db');

const KKM = 75;
const round2 = (n) => Math.round(n * 100) / 100;
const marks = (n) => new Array(n).fill('?').join(',');

/* =====================================================
   ANALISIS CAPAIAN PEMBELAJARAN
   analyze(id)            : satu kelas ajar (null bila tidak ada)
   analyzeMany(ids, opts) : banyak kelas ajar sekaligus -> Map(id -> hasil analisis)

   analyzeMany memuat data dengan 5 query SAJA berapa pun jumlah kelas ajarnya.
   (Versi lama menjalankan 5 query untuk SETIAP kelas ajar; dengan database di cloud
   itu terasa lambat sekali di halaman Monitoring, E-Rapor, dan laporan siswa.)

   opts.lenient = true : kelas ajar yang mapel/kelas/gurunya sudah terhapus tetap
                         ikut dianalisis (nama diberi tanda), supaya terlihat di Monitoring
                         dan bisa dibereskan. Bawaannya false (dilewati).
   ===================================================== */

async function analyzeChunk(ids, lenient, out) {
  const J = lenient ? 'LEFT JOIN' : 'JOIN';

  const teachings = await db.prepare(`
    SELECT t.id, t.semester, t.class_id, t.subject_id,
           ${lenient ? "COALESCE(s.name, '(mapel dihapus)')" : 's.name'} AS subject_name,
           s.code AS subject_code,
           ${lenient ? "COALESCE(c.name, '(kelas dihapus)')" : 'c.name'} AS class_name,
           ${lenient ? "COALESCE(u.name, '(guru dihapus)')" : 'u.name'} AS teacher_name
    FROM teaching t
    ${J} subjects s ON s.id = t.subject_id
    ${J} classes c ON c.id = t.class_id
    ${J} users u ON u.id = t.teacher_id
    WHERE t.id IN (${marks(ids.length)})
  `).all(...ids);

  if (!teachings.length) return;

  const classIds = [...new Set(teachings.map((t) => t.class_id).filter((v) => v != null).map(Number))];
  const subjectIds = [...new Set(teachings.map((t) => t.subject_id).filter((v) => v != null).map(Number))];

  const [students, assessments, scores, outcomes] = await Promise.all([
    classIds.length
      ? db.prepare(`
          SELECT st.id AS student_id, st.nis, st.class_id, u.name
          FROM students st
          JOIN users u ON u.id = st.user_id
          WHERE st.class_id IN (${marks(classIds.length)})
          ORDER BY u.name
        `).all(...classIds)
      : [],
    db.prepare(`
      SELECT a.id, a.teaching_id, a.name, a.weight, a.max_score,
             a.outcome_id, o.code AS outcome_code
      FROM assessments a
      LEFT JOIN outcomes o ON o.id = a.outcome_id
      WHERE a.teaching_id IN (${marks(ids.length)})
    `).all(...ids),
    db.prepare(`
      SELECT sc.assessment_id, sc.student_id, sc.score
      FROM scores sc
      JOIN assessments a ON a.id = sc.assessment_id
      WHERE a.teaching_id IN (${marks(ids.length)})
    `).all(...ids),
    subjectIds.length
      ? db.prepare(`
          SELECT id, subject_id, code, description
          FROM outcomes
          WHERE subject_id IN (${marks(subjectIds.length)})
          ORDER BY code
        `).all(...subjectIds)
      : []
  ]);

  // Kelompokkan hasil query per kelas / kelas ajar / mapel
  const studentsByClass = new Map();
  for (const s of students) {
    const k = Number(s.class_id);
    if (!studentsByClass.has(k)) studentsByClass.set(k, []);
    studentsByClass.get(k).push({
      id: s.student_id,
      student_id: s.student_id,
      nis: s.nis,
      name: s.name
    });
  }

  const assessmentsByTeaching = new Map();
  for (const a of assessments) {
    const k = Number(a.teaching_id);
    if (!assessmentsByTeaching.has(k)) assessmentsByTeaching.set(k, []);
    assessmentsByTeaching.get(k).push({
      id: a.id,
      name: a.name,
      weight: a.weight,
      max_score: a.max_score,
      outcome_id: a.outcome_id,
      outcome_code: a.outcome_code
    });
  }

  // ID asesmen unik di seluruh database, jadi satu peta nilai cukup untuk semua kelas ajar
  const scoreMap = new Map();
  for (const s of scores) {
    if (s.score == null) continue; // nilai kosong BUKAN nol
    scoreMap.set(`${s.assessment_id}:${s.student_id}`, Number(s.score));
  }

  const outcomesBySubject = new Map();
  for (const o of outcomes) {
    const k = Number(o.subject_id);
    if (!outcomesBySubject.has(k)) outcomesBySubject.set(k, []);
    outcomesBySubject.get(k).push(o);
  }

  for (const t of teachings) {
    const studentsNorm = studentsByClass.get(Number(t.class_id)) || [];
    const asm = assessmentsByTeaching.get(Number(t.id)) || [];

    // Perhitungan nilai setiap siswa
    const studentRows = studentsNorm.map((st) => {
      let total = 0;
      let weightSum = 0;
      const scoresPerOutcome = {};

      for (const a of asm) {
        const v = scoreMap.get(`${a.id}:${st.id}`);
        if (v !== undefined && a.max_score > 0) {
          const norm = (v / a.max_score) * 100;
          const weight = Number(a.weight) || 1;

          total += norm * weight;
          weightSum += weight;

          if (a.outcome_id) {
            if (!scoresPerOutcome[a.outcome_id]) scoresPerOutcome[a.outcome_id] = [];
            scoresPerOutcome[a.outcome_id].push(norm);
          }
        }
      }

      const avg = weightSum > 0 ? total / weightSum : null;
      const pass = avg !== null && avg >= KKM;

      const scoresObj = {};
      for (const k in scoresPerOutcome) {
        const arr = scoresPerOutcome[k];
        scoresObj[k] = round2(arr.reduce((x, y) => x + y, 0) / arr.length);
      }

      return {
        ...st,
        avg: avg === null ? null : round2(avg),
        pass,
        final: avg === null ? null : round2(avg),
        // null = belum ada nilai (tampilan menulis "Belum ada nilai", bukan "Belum tuntas")
        passed: avg === null ? null : pass,
        scores: scoresObj
      };
    });

    // Rata-rata kelas (null bila belum ada satu pun nilai)
    const validAvgs = studentRows.map((s) => s.avg).filter((v) => v !== null);
    const classAvg = validAvgs.length
      ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length
      : null;

    // Analisis capaian pembelajaran
    const outcomeRows = (outcomesBySubject.get(Number(t.subject_id)) || []).map((o) => {
      const rel = asm.filter((a) => Number(a.outcome_id) === Number(o.id));
      const vals = [];

      for (const st of studentsNorm) {
        for (const a of rel) {
          const v = scoreMap.get(`${a.id}:${st.id}`);
          if (v !== undefined && a.max_score > 0) {
            vals.push((v / a.max_score) * 100);
          }
        }
      }

      // null = belum ada data (berbeda dari nilai 0)
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      const passRate = vals.length ? (vals.filter((v) => v >= KKM).length / vals.length) * 100 : null;

      return {
        id: o.id,
        code: o.code,
        description: o.description,
        avg: avg === null ? null : round2(avg),
        passRate: passRate === null ? null : round2(passRate)
      };
    });

    out.set(Number(t.id), {
      teaching: {
        id: t.id,
        semester: t.semester,
        class_id: t.class_id,
        subject_id: t.subject_id,
        subject_name: t.subject_name,
        subject_code: t.subject_code,
        class_name: t.class_name,
        teacher_name: t.teacher_name
      },
      students: studentRows,
      assessments: asm,
      classAvg: classAvg === null ? null : round2(classAvg),
      outcomes: outcomeRows,
      kkm: KKM,
      passCount: studentRows.filter((s) => s.pass).length,
      totalStudents: studentRows.length
    });
  }
}

async function analyzeMany(teachingIds, opts = {}) {
  const ids = [...new Set((teachingIds || []).map(Number).filter((n) => Number.isInteger(n) && n > 0))];
  const out = new Map();

  // Dipecah per 300 supaya jumlah parameter query tetap aman
  for (let i = 0; i < ids.length; i += 300) {
    await analyzeChunk(ids.slice(i, i + 300), !!opts.lenient, out);
  }

  return out;
}

async function analyze(teachingId, opts = {}) {
  const map = await analyzeMany([teachingId], opts);
  return map.get(Number(teachingId)) || null;
}

module.exports = { analyze, analyzeMany, KKM };