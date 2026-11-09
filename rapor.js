const db = require('./db');
const { analyze, KKM } = require('./analysis');

/* =====================================================
   E-RAPOR
   buildReport(userId, semester)
   - userId   : id pengguna (users.id) milik siswa
   - semester : teks semester, contoh "Ganjil 2026/2027"
                (kosong = periode aktif, atau semester terbaru)
   ===================================================== */

const predikat = (v) => (v == null ? '-' : v >= 90 ? 'A' : v >= 80 ? 'B' : v >= KKM ? 'C' : 'D');

async function buildReport(userId, semester) {
  const me = await db.prepare(`
    SELECT st.id, st.nis, st.class_id, u.name, c.name AS class_name,
           hu.name AS homeroom_name
    FROM students st
    JOIN users u ON u.id = st.user_id
    LEFT JOIN classes c ON c.id = st.class_id
    LEFT JOIN users hu ON hu.id = c.homeroom_teacher_id
    WHERE st.user_id = ?`).get(userId);

  if (!me) return null;

  const att = { hadir: 0, izin: 0, sakit: 0, alpa: 0 };

  const result = {
    student: { name: me.name, nis: me.nis, class_name: me.class_name || '-' },
    kkm: KKM,
    homeroom: me.homeroom_name || null,
    semesters: [],
    semester: null,
    subjects: [],
    attendance: att,
    printed_at: new Date().toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  };

  if (!me.class_id) return result;

  const teachings = await db.prepare(
    'SELECT id, semester FROM teaching WHERE class_id = ? ORDER BY semester DESC, id'
  ).all(me.class_id);

  const semesters = [...new Set(teachings.map((t) => t.semester).filter(Boolean))];
  result.semesters = semesters;

  // Pilih semester: yang diminta -> periode aktif -> yang paling baru
  let chosen = semester && semesters.includes(semester) ? semester : null;

  if (!chosen) {
    let label = null;

    try {
      const p = await db.prepare(
        'SELECT name, semester FROM academic_years WHERE is_active = 1'
      ).get();
      if (p) label = `${p.semester} ${p.name}`;
    } catch (e) {
      label = null;
    }

    chosen = label && semesters.includes(label) ? label : semesters[0] || null;
  }

  result.semester = chosen;
  if (!chosen) return result;

  const list = teachings.filter((t) => t.semester === chosen);

  for (const t of list) {
    const a = await analyze(t.id);
    if (!a) continue;

    const mine = a.students.find((s) => s.id === me.id);

    const outcomes = a.outcomes.map((o) => ({
      code: o.code,
      description: o.description,
      score: mine && mine.scores[o.id] != null ? mine.scores[o.id] : null
    }));

    const ok = outcomes.filter((o) => o.score != null && o.score >= KKM).map((o) => o.code);
    const low = outcomes.filter((o) => o.score != null && o.score < KKM).map((o) => o.code);

    const parts = [];
    if (ok.length) parts.push('Sudah menguasai ' + ok.join(', '));
    if (low.length) parts.push('Perlu ditingkatkan pada ' + low.join(', '));

    const final = mine ? mine.final : null;

    result.subjects.push({
      subject: a.teaching.subject_name,
      teacher: a.teaching.teacher_name,
      final,
      passed: mine ? mine.passed : null,
      predikat: predikat(final),
      outcomes,
      description: parts.length ? parts.join('. ') + '.' : 'Belum ada nilai.'
    });
  }

  // Rekap kehadiran pada semester yang dipilih
  const ids = list.map((t) => t.id);

  if (ids.length) {
    const marks = ids.map(() => '?').join(',');
    const rows = await db.prepare(`
      SELECT status, COUNT(*) AS n
      FROM student_attendance
      WHERE student_id = ? AND teaching_id IN (${marks})
      GROUP BY status`).all(me.id, ...ids);

    for (const r of rows) {
      if (Object.prototype.hasOwnProperty.call(att, r.status)) {
        att[r.status] = Number(r.n);
      }
    }
  }

  return result;
}

module.exports = { buildReport };